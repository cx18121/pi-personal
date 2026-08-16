import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  INDEX_MAX_BYTES,
  assertMemoryMutationPermission,
  assertPapercutPermission,
  assertScratchpadPermission,
  atomicWriteFile,
  buildStartupContext,
  checklistFilePath,
  ensurePrivateDir,
  extractUnfinishedWork,
  forgetMemory,
  mutateChecklist,
  parseChecklist,
  readText,
  replaceNowSection,
  resolveAgentRole,
  resolveLocations,
  resolveMemoryDir,
  resolveProjectIdentity,
  resolveScope,
  restoreMemory,
  safeTopicSlug,
  scratchpadNowSection,
  searchMemory,
  withFileLock,
  writeMemory,
  type MemoryLocations,
} from "../src/core.ts";
import registerMemory from "../src/index.ts";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-memory-local-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function git(...args: string[]) {
  Bun.spawnSync(["git", ...args], { cwd: tempDir, stdout: "ignore", stderr: "ignore" });
}

function locationsWithProject(): MemoryLocations {
  const baseDir = path.join(tempDir, "memory");
  return {
    baseDir,
    globalDir: path.join(baseDir, "global"),
    project: { commonRoot: tempDir, name: "repo", hash: "1234567890", id: "repo-1234567890" },
    projectDir: path.join(baseDir, "projects", "repo-1234567890"),
  };
}

describe("project identity and scope", () => {
  test("shares identity across Git worktrees", () => {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    fs.writeFileSync(path.join(tempDir, "file"), "x");
    git("add", "file");
    git("commit", "-qm", "initial");
    const worktree = path.join(tempDir, "linked");
    git("worktree", "add", "-q", "-b", "linked-test", worktree);

    const main = resolveProjectIdentity(tempDir);
    const linked = resolveProjectIdentity(worktree);
    expect(main).not.toBeNull();
    expect(linked).toEqual(main);
  });

  test("falls back to global outside Git and rejects project scope", () => {
    const locations = resolveLocations(tempDir, { PI_MEMORY_DIR: path.join(tempDir, "memory") });
    expect(locations.project).toBeNull();
    expect(resolveScope(locations).scope).toBe("global");
    expect(() => resolveScope(locations, "project")).toThrow("outside a Git repository");
  });
});

describe("roles and permissions", () => {
  test("detects root and subagent roles with explicit overrides", () => {
    expect(resolveAgentRole({ PI_SESSION_ID: "a" })).toBe("root");
    expect(resolveAgentRole({ PI_SESSION_ID: "a", PI_SUBAGENT_PARENT_SESSION: "a" })).toBe("root");
    expect(resolveAgentRole({ PI_SUBAGENT_PARENT_SESSION: "a" }, "a")).toBe("root");
    expect(resolveAgentRole({ PI_SUBAGENT_CHILD: "1", PI_SESSION_ID: "same", PI_SUBAGENT_PARENT_SESSION: "same" })).toBe("subagent");
    expect(resolveAgentRole({ PI_SESSION_ID: "child", PI_SUBAGENT_PARENT_SESSION: "parent" })).toBe("subagent");
    expect(resolveAgentRole({ PI_MEMORY_SUBAGENT_MODE: "root", PI_SUBAGENT_CHILD: "1" })).toBe("root");
    expect(resolveAgentRole({ PI_MEMORY_SUBAGENT_MODE: "subagent" })).toBe("subagent");
    expect(() => resolveMemoryDir({})).toThrow("no home directory");
  });

  test("keeps subagents read-only except papercut append", () => {
    expect(() => assertMemoryMutationPermission("subagent")).toThrow("cannot mutate");
    expect(() => assertScratchpadPermission("subagent", "add")).toThrow("cannot mutate");
    expect(() => assertScratchpadPermission("subagent", "list")).not.toThrow();
    expect(() => assertPapercutPermission("subagent", "add")).not.toThrow();
    expect(() => assertPapercutPermission("subagent", "list")).not.toThrow();
    expect(() => assertPapercutPermission("subagent", "resolve")).toThrow("cannot edit or resolve");
  });
});

describe("safe writes and locking", () => {
  test("rejects normalized duplicates and oversized indexes", () => {
    const dir = path.join(tempDir, "scope");
    writeMemory({ dir, content: "Use  pnpm for installs", sessionId: "one" });
    expect(() => writeMemory({ dir, content: " use PNPM\nfor installs ", sessionId: "two" })).toThrow("duplicate");
    expect(() => writeMemory({ dir, content: "x".repeat(INDEX_MAX_BYTES), sessionId: "three" })).toThrow("25KB");
  });

  test("rejects reserved metadata but accepts ordinary Markdown comments", () => {
    const dir = path.join(tempDir, "scope");
    expect(() =>
      writeMemory({
        dir,
        content: "<!-- pi-memory 2026-08-15T12:34:56.789Z [session] -->",
      }),
    ).toThrow("reserved pi-memory metadata");

    writeMemory({
      dir,
      content: "Before\n<!-- pi-memory note -->\n<!-- pi-memory-unstamped -->\nAfter",
    });
    const forgotten = forgetMemory({ dir, match: "After" });
    expect(forgotten.removed).toBe(1);
    expect(readText(path.join(dir, "MEMORY.md"))).not.toContain("Before");

    writeMemory({ dir, content: "metadata must not select this entry", sessionId: "sessionx" });
    expect(() => forgetMemory({ dir, match: "sessionx" })).toThrow("No matching memory entries");
  });

  test("uses private directory and file modes", () => {
    const dir = path.join(tempDir, "scope");
    const filePath = writeMemory({ dir, content: "private" });
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
  });

  test("does not reap an aged lock while its recorded PID is alive", () => {
    const filePath = path.join(tempDir, "MEMORY.md");
    const lockDir = `${filePath}.lock`;
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({ pid: process.pid, token: "live-owner" }),
    );
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lockDir, old, old);
    expect(() => withFileLock(filePath, () => undefined, { waitMs: 40, retryMs: 5 })).toThrow("Timed out");
    expect(fs.existsSync(lockDir)).toBe(true);
  });

  test("replaces an ownerless lock without waiting for stale timeout", () => {
    const filePath = path.join(tempDir, "MEMORY.md");
    const lockDir = `${filePath}.lock`;
    fs.mkdirSync(lockDir, { recursive: true });

    expect(withFileLock(filePath, () => "acquired", { waitMs: 100, retryMs: 5 })).toBe("acquired");
    expect(fs.existsSync(lockDir)).toBe(false);
  });

  test("waits for a live gate participant that has not chosen its order", () => {
    const filePath = path.join(tempDir, "MEMORY.md");
    const queueDir = `${filePath}.lock.queue`;
    const delayedTicket = path.join(queueDir, `${process.pid}-delayed`);
    fs.mkdirSync(delayedTicket, { recursive: true });

    expect(() => withFileLock(filePath, () => "acquired", { waitMs: 40, retryMs: 5 })).toThrow("lock gate");
    fs.rmSync(delayedTicket, { recursive: true });
    expect(withFileLock(filePath, () => "acquired")).toBe("acquired");
  });

  test("reaps a dead lock-gate ticket", () => {
    const filePath = path.join(tempDir, "MEMORY.md");
    const queueDir = `${filePath}.lock.queue`;
    const ticket = "1073741824-dead";
    fs.mkdirSync(path.join(queueDir, ticket), { recursive: true });

    expect(withFileLock(filePath, () => "acquired")).toBe("acquired");
    expect(fs.existsSync(path.join(queueDir, ticket))).toBe(false);
  });

  test("reaps a dead owner but releases only its own token", () => {
    const filePath = path.join(tempDir, "MEMORY.md");
    const lockDir = `${filePath}.lock`;
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({ pid: 1_073_741_824, token: "dead-owner" }),
    );
    expect(withFileLock(filePath, () => "acquired")).toBe("acquired");
    expect(fs.existsSync(lockDir)).toBe(false);

    withFileLock(filePath, () => {
      fs.writeFileSync(
        path.join(lockDir, "owner.json"),
        JSON.stringify({ pid: process.pid, token: "replacement-owner" }),
      );
    });
    expect(fs.existsSync(lockDir)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8")).token).toBe("replacement-owner");
  });

  test("preserves concurrent appends while reclaiming one stale lock", async () => {
    const dir = path.join(tempDir, "scope");
    const filePath = path.join(dir, "MEMORY.md");
    const lockDir = `${filePath}.lock`;
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(
      path.join(lockDir, "owner.json"),
      JSON.stringify({ pid: 1_073_741_824, token: "dead-owner" }),
    );
    const coreUrl = new URL("../src/core.ts", import.meta.url).href;
    const runWriter = (writer: string) => {
      const script = `import { writeMemory } from ${JSON.stringify(coreUrl)}; for (let i=0;i<12;i++) writeMemory({dir:${JSON.stringify(dir)},content:${JSON.stringify(writer)}+'-'+i});`;
      return Bun.spawn([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" });
    };
    const writers = [runWriter("left"), runWriter("right")];
    const exits = await Promise.all(writers.map((child) => child.exited));
    if (exits.some((exit) => exit !== 0)) {
      const errors = await Promise.all(writers.map((child) => new Response(child.stderr).text()));
      throw new Error(errors.filter(Boolean).join("\n"));
    }
    const content = readText(filePath);
    for (const writer of ["left", "right"]) {
      for (let index = 0; index < 12; index++) expect(content).toContain(`${writer}-${index}`);
    }
  });
});

describe("topic names, search, and scope", () => {
  test("accepts safe topic slugs and rejects traversal", () => {
    expect(safeTopicSlug("build-tools")).toBe("build-tools");
    for (const unsafe of ["../secret", "Build-Tools", "two--hyphens", "a/b", ""]) {
      expect(() => safeTopicSlug(unsafe)).toThrow();
    }
  });

  test("reports malformed topic storage instead of hiding it", () => {
    const locations = locationsWithProject();
    ensurePrivateDir(locations.projectDir!);
    fs.writeFileSync(path.join(locations.projectDir!, "topics"), "not a directory");
    expect(() => searchMemory(locations, "anything")).toThrow();
  });

  test("ranks exact phrases and searches only global plus active project", () => {
    const locations = locationsWithProject();
    writeMemory({ dir: locations.globalDir, content: "The deploy pipeline is blue green." });
    writeMemory({ dir: locations.projectDir!, content: "Deploy notes mention pipeline separately." });
    const otherProject = path.join(locations.baseDir, "projects", "other-0000000000");
    writeMemory({ dir: otherProject, content: "deploy pipeline secret other project" });

    const results = searchMemory(locations, "deploy pipeline", 10);
    expect(results[0].excerpt).toContain("deploy pipeline");
    expect(results[0].score).toBeGreaterThan(0);
    expect(results.some((result) => result.path.includes("other-0000000000"))).toBe(false);
    expect(results.some((result) => result.path.startsWith(locations.globalDir))).toBe(true);
    expect(results.some((result) => result.path.startsWith(locations.projectDir!))).toBe(true);
  });

  test("supports code-aware terms, prefixes, and typo fallback", () => {
    const locations = locationsWithProject();
    writeMemory({
      dir: locations.projectDir!,
      content: "PI_MEMORY_SUBAGENT_MODE controls authentication behavior.",
    });
    writeMemory({
      dir: locations.projectDir!,
      content: "getHTTPResponse retries according to retryCount before returning an HTTP2Client response.",
    });

    expect(searchMemory(locations, "subagent mode")[0].excerpt).toContain("PI_MEMORY_SUBAGENT_MODE");
    expect(searchMemory(locations, "authentica")[0].excerpt).toContain("authentication");
    expect(searchMemory(locations, "authentcation")[0].excerpt).toContain("authentication");
    for (const query of ["getHTTPResponse", "get http response", "retry count", "HTTP2 client"]) {
      expect(searchMemory(locations, query)[0].excerpt).toContain("getHTTPResponse");
    }
  });

  test("passes representative precision-first retrieval cases", () => {
    const locations = locationsWithProject();
    writeMemory({
      dir: locations.globalDir,
      content: "API key storage uses macOS Keychain. Never save secrets in plaintext configuration files.",
    });
    writeMemory({
      dir: locations.globalDir,
      content: "Legacy API services read temporary credentials and key values from process environment variables.",
    });
    writeMemory({
      dir: locations.globalDir,
      content: "Correction: do not create daily memory logs because they duplicate session history.",
    });
    writeMemory({
      dir: locations.projectDir!,
      content: "Prefer clean, simple, elegant implementations over speculative abstractions.",
    });
    writeMemory({
      dir: locations.projectDir!,
      target: "topic",
      topic: "carrier-integrations",
      content: "Mockless tests use the real PostNord sandbox for shipping labels.",
    });

    const cases = [
      { query: "API key storage", expected: "macOS Keychain" },
      { query: "plaintext secrets", expected: "macOS Keychain" },
      { query: "daily logs correction", expected: "do not create daily" },
      { query: "simple elegant implementation", expected: "clean, simple, elegant" },
      { query: "carrier integrations", expected: "PostNord sandbox" },
      { query: "postnord sand", expected: "PostNord sandbox" },
      { query: "postnrd sandbox", expected: "PostNord sandbox" },
    ];
    for (const { query, expected } of cases) {
      const result = searchMemory(locations, query)[0];
      expect(result, query).toBeDefined();
      expect(result!.excerpt, query).toContain(expected);
    }
    expect(searchMemory(locations, "zzzznothere")).toEqual([]);
    atomicWriteFile(checklistFilePath(locations.projectDir!, "papercuts"), "- [ ] papercutonlytoken retrieval failure\n");
    expect(searchMemory(locations, "papercutonlytoken")).toEqual([]);
  });

  test("uses boundary-safe phrases and clean match-focused excerpts", () => {
    const locations = locationsWithProject();
    writeMemory({ dir: locations.projectDir!, content: "The catalog contains concatenated identifiers." });
    writeMemory({ dir: locations.projectDir!, content: "A cat requires exact token boundaries." });
    writeMemory({ dir: locations.projectDir!, content: "foo-bar-baz is the broad setting." });
    const broadIdentifier = searchMemory(locations, "foo-bar")[0];
    expect(broadIdentifier.excerpt).toContain("broad setting");
    expect(broadIdentifier.exactPhrase).toBe(false);
    writeMemory({ dir: locations.projectDir!, content: "foo-bar is the exact setting." });
    const phraseResults = searchMemory(locations, "cat", 10);
    expect(phraseResults[0].excerpt).toContain("A cat");
    expect(phraseResults[0].exactPhrase).toBe(true);
    expect(phraseResults.find((result) => result.excerpt.includes("catalog"))?.exactPhrase).toBe(false);
    expect(searchMemory(locations, "foo-bar")[0].excerpt).toContain("exact setting");
    writeMemory({ dir: locations.projectDir!, content: "The terminal identifier is ExactBoundaryToken." });
    expect(searchMemory(locations, "ExactBoundaryToken")[0].exactPhrase).toBe(true);

    writeMemory({
      dir: locations.projectDir!,
      target: "topic",
      topic: "fenced-code",
      content: "```ts\n````not-a-close\n# PI_MEMORY_MODE\n\nconst retryCount = 3;\n```",
    });
    const codeResult = searchMemory(locations, "PI_MEMORY_MODE")[0];
    expect(codeResult.excerpt).toContain("# PI_MEMORY_MODE");
    expect(codeResult.excerpt).toContain("retryCount");

    writeMemory({
      dir: locations.projectDir!,
      target: "topic",
      topic: "long-fenced-code",
      content: `~~~ts\n${"filler ".repeat(70)}\nconst longFenceNeedle = true;\n~~~`,
    });
    const longFence = searchMemory(locations, "longFenceNeedle")[0].excerpt;
    expect(longFence.startsWith("~~~ts\n")).toBe(true);
    expect(longFence.endsWith("\n~~~")).toBe(true);
    expect(longFence).toContain("longFenceNeedle");
    expect(longFence.length).toBeLessThanOrEqual(400);

    const firstLine = "Unrelated opening context ".repeat(12).trim();
    writeMemory({
      dir: locations.projectDir!,
      target: "topic",
      topic: "query-excerpts",
      content: `${firstLine}\nThe distinctive retrieval needle is on this line.\nUseful neighboring context.`,
    });
    const result = searchMemory(locations, "distinctive retrieval needle")[0];
    expect(result.excerpt).toContain("distinctive retrieval needle");
    expect(result.excerpt).not.toContain("pi-memory");
    expect(result.excerpt.length).toBeLessThanOrEqual(401);
    expect(searchMemory(locations, "unknown")).toEqual([]);
  });
});

describe("scratchpads and papercuts", () => {
  test("defaults to project scope and preserves handwritten lines", () => {
    const locations = locationsWithProject();
    expect(resolveScope(locations).scope).toBe("project");
    const filePath = checklistFilePath(locations.projectDir!, "scratchpad");
    atomicWriteFile(filePath, "# Scratchpad\n\nHandwritten context\n- [ ] First task\n  - detail\n");
    mutateChecklist({ filePath, action: "done", text: "First" });
    mutateChecklist({ filePath, action: "add", text: "Second task" });
    const content = readText(filePath);
    expect(content).toContain("Handwritten context");
    expect(content).toContain("  - detail");
    expect(content).toContain("- [x] First task");
    expect(parseChecklist(content).filter((item) => !item.done).map((item) => item.text)).toEqual(["Second task"]);
  });

  test("supports root papercut edit and resolve", () => {
    const filePath = path.join(tempDir, "PAPERCUTS.md");
    mutateChecklist({ filePath, action: "add", text: "slow startup" });
    mutateChecklist({ filePath, action: "edit", text: "startup", replacement: "slow project startup" });
    mutateChecklist({ filePath, action: "resolve", text: "project startup" });
    expect(readText(filePath)).toContain("- [x] slow project startup");
  });
});

describe("forget and restore", () => {
  test("forgets one unstamped paragraph without deleting its neighbors", () => {
    const dir = path.join(tempDir, "scope");
    const filePath = path.join(dir, "MEMORY.md");
    atomicWriteFile(filePath, "First manual paragraph.\n\nRemove only this manual paragraph.\n\nThird manual paragraph.\n");
    forgetMemory({ dir, match: "remove only" });
    const content = readText(filePath);
    expect(content).toContain("First manual paragraph.");
    expect(content).not.toContain("Remove only this manual paragraph.");
    expect(content).toContain("Third manual paragraph.");
  });

  test("creates recovery before deletion and restores idempotently", () => {
    const dir = path.join(tempDir, "scope");
    writeMemory({ dir, content: "keep this" });
    writeMemory({ dir, content: "remove obsolete fact" });
    const forgotten = forgetMemory({ dir, match: "obsolete" });
    expect(readText(path.join(dir, "MEMORY.md"))).not.toContain("obsolete");
    expect(fs.existsSync(path.join(dir, "recovery", `${forgotten.recoveryId}.json`))).toBe(true);
    expect(restoreMemory(dir, forgotten.recoveryId).restored).toBe(1);
    expect(readText(path.join(dir, "MEMORY.md"))).toContain("obsolete");
    expect(restoreMemory(dir, forgotten.recoveryId).alreadyRestored).toBe(true);
  });

  test("does not restore a body that was re-added with new metadata", () => {
    const dir = path.join(tempDir, "scope");
    writeMemory({ dir, content: "same durable fact", sessionId: "first" });
    const forgotten = forgetMemory({ dir, match: "same durable fact" });
    writeMemory({ dir, content: "same durable fact", sessionId: "second" });

    expect(restoreMemory(dir, forgotten.recoveryId).restored).toBe(0);
    expect(readText(path.join(dir, "MEMORY.md")).match(/same durable fact/g)).toHaveLength(1);
  });

  test("restores deleted alpha when the current memory contains alphabet", () => {
    const dir = path.join(tempDir, "scope");
    const filePath = path.join(dir, "MEMORY.md");
    atomicWriteFile(filePath, "alpha\n");
    const forgotten = forgetMemory({ dir, match: "alpha" });
    writeMemory({ dir, content: "alphabet" });

    expect(restoreMemory(dir, forgotten.recoveryId).restored).toBe(1);
    const lines = readText(filePath).split("\n");
    expect(lines).toContain("alphabet");
    expect(lines).toContain("alpha");
  });

  test("keeps a stamped entry when a restored unstamped paragraph is forgotten again", () => {
    const dir = path.join(tempDir, "scope");
    const filePath = path.join(dir, "MEMORY.md");
    atomicWriteFile(filePath, "restore this manual paragraph\n");
    const forgotten = forgetMemory({ dir, match: "manual paragraph" });
    writeMemory({ dir, content: "keep this stamped entry", sessionId: "stamped" });
    restoreMemory(dir, forgotten.recoveryId);

    forgetMemory({ dir, match: "manual paragraph" });
    const content = readText(filePath);
    expect(content).toContain("keep this stamped entry");
    expect(content).not.toContain("restore this manual paragraph");
  });

  test("rejects an oversized index restore without marking recovery restored", () => {
    const dir = path.join(tempDir, "scope");
    writeMemory({ dir, content: "temporarily removed" });
    const forgotten = forgetMemory({ dir, match: "temporarily" });
    atomicWriteFile(path.join(dir, "MEMORY.md"), "x".repeat(INDEX_MAX_BYTES));

    expect(() => restoreMemory(dir, forgotten.recoveryId)).toThrow("exceed 25KB");
    const recordPath = path.join(dir, "recovery", `${forgotten.recoveryId}.json`);
    expect(JSON.parse(readText(recordPath)).restoredAt).toBeUndefined();
    expect(readText(path.join(dir, "MEMORY.md"))).toBe("x".repeat(INDEX_MAX_BYTES));
  });
});

describe("startup context and compaction handoff", () => {
  test("rebuilds startup context when one session changes projects", async () => {
    const memoryDir = path.join(tempDir, "memory");
    const repos = [path.join(tempDir, "repo-a"), path.join(tempDir, "repo-b")];
    for (const repo of repos) {
      fs.mkdirSync(repo);
      Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
    }
    const [firstLocations, secondLocations] = repos.map((repo) =>
      resolveLocations(repo, { ...process.env, PI_MEMORY_DIR: memoryDir }),
    );
    writeMemory({ dir: firstLocations.projectDir!, content: "first project only" });
    writeMemory({ dir: secondLocations.projectDir!, content: "second project only" });

    const oldMemoryDir = process.env.PI_MEMORY_DIR;
    process.env.PI_MEMORY_DIR = memoryDir;
    try {
      const hooks = new Map<string, (event: any, ctx: any) => unknown>();
      registerMemory({
        on(event: string, handler: (event: any, ctx: any) => unknown) {
          hooks.set(event, handler);
        },
        registerTool() {},
      } as any);
      const beforeAgentStart = hooks.get("before_agent_start")!;
      const context = (cwd: string) => ({ cwd, sessionManager: { getSessionId: () => "same-session" } });
      const first = await beforeAgentStart({ systemPrompt: "base" }, context(repos[0])) as { systemPrompt: string };
      const second = await beforeAgentStart({ systemPrompt: "base" }, context(repos[1])) as { systemPrompt: string };

      expect(first.systemPrompt).toContain("first project only");
      expect(second.systemPrompt).toContain("second project only");
      expect(second.systemPrompt).not.toContain("first project only");
    } finally {
      if (oldMemoryDir === undefined) delete process.env.PI_MEMORY_DIR;
      else process.env.PI_MEMORY_DIR = oldMemoryDir;
    }
  });

  test("wires the real session_compact event and compactionEntry.summary shape", async () => {
    git("init", "-q");
    const memoryDir = path.join(tempDir, "memory");
    const oldMemoryDir = process.env.PI_MEMORY_DIR;
    const oldMode = process.env.PI_MEMORY_SUBAGENT_MODE;
    process.env.PI_MEMORY_DIR = memoryDir;
    process.env.PI_MEMORY_SUBAGENT_MODE = "root";
    try {
      const hooks = new Map<string, (event: any, ctx: any) => unknown>();
      registerMemory({
        on(event: string, handler: (event: any, ctx: any) => unknown) {
          hooks.set(event, handler);
        },
        registerTool() {},
      } as any);
      expect(hooks.has("session_compact")).toBe(true);
      expect(hooks.has("session_before_compact")).toBe(false);

      const locations = resolveLocations(tempDir, { PI_MEMORY_DIR: memoryDir });
      const scratchpadPath = path.join(locations.projectDir!, "SCRATCHPAD.md");
      atomicWriteFile(scratchpadPath, "# Scratchpad\n\n## Now\n\nold work\n\n## Later\n\nkeep\n");
      await hooks.get("session_compact")!(
        {
          type: "session_compact",
          compactionEntry: {
            summary: "## In Progress\n- finish hook test\n\n## Notes\ndo not copy",
          },
        },
        { cwd: tempDir, sessionManager: { getSessionId: () => "session" } },
      );
      const content = readText(scratchpadPath);
      expect(content).toContain("## Now\n\n- finish hook test");
      expect(content).not.toContain("do not copy");
      expect(content).toContain("## Later\n\nkeep");
    } finally {
      if (oldMemoryDir === undefined) delete process.env.PI_MEMORY_DIR;
      else process.env.PI_MEMORY_DIR = oldMemoryDir;
      if (oldMode === undefined) delete process.env.PI_MEMORY_SUBAGENT_MODE;
      else process.env.PI_MEMORY_SUBAGENT_MODE = oldMode;
    }
  });

  test("loads only indexes and open active-project scratchpad items", () => {
    const locations = locationsWithProject();
    writeMemory({ dir: locations.globalDir, content: "global index fact" });
    writeMemory({ dir: locations.globalDir, target: "topic", topic: "hidden", content: "hidden topic fact" });
    writeMemory({ dir: locations.projectDir!, content: "project index fact" });
    const projectScratch = checklistFilePath(locations.projectDir!, "scratchpad");
    atomicWriteFile(
      projectScratch,
      "# Scratchpad\n\n## Now\n\n- continue compaction handoff\n- [ ] now checklist item\n\n## Later\n\n- [ ] open project task\n- [x] completed project task\n",
    );
    atomicWriteFile(checklistFilePath(locations.globalDir, "scratchpad"), "- [ ] global task\n");
    atomicWriteFile(checklistFilePath(locations.projectDir!, "papercuts"), "- [ ] hidden papercut\n");

    const context = buildStartupContext({ locations, role: "root", autoCapture: true });
    expect(context).toContain("global index fact");
    expect(context).toContain("project index fact");
    expect(context).toContain("continue compaction handoff");
    expect(context).toContain("now checklist item");
    expect(context.match(/now checklist item/g)).toHaveLength(1);
    expect(context).toContain("open project task");
    expect(context).not.toContain("completed project task");
    expect(context).not.toContain("global task");
    expect(context).not.toContain("hidden topic fact");
    expect(context).not.toContain("hidden papercut");
    expect(context).toContain("visible memory_write tool calls");
    expect(context).toContain("visible papercut add call");

    const captureDisabled = buildStartupContext({ locations, role: "root", autoCapture: false });
    expect(captureDisabled).toContain("latest user correction override memory");
    expect(captureDisabled).not.toContain("visible memory_write tool calls");
  });

  test("omits, rather than truncates, an oversized index", () => {
    const locations = locationsWithProject();
    atomicWriteFile(path.join(locations.globalDir, "MEMORY.md"), "x".repeat(INDEX_MAX_BYTES + 1));
    const context = buildStartupContext({ locations, role: "subagent" });
    expect(context).toContain("Omitted:");
    expect(context).toContain("above the 25KB index limit");
    expect(context).not.toContain("x".repeat(100));
  });

  test("extracts unfinished sections and replaces only Now", () => {
    const summary = "## Done\n- shipped\n\n## In Progress\n- wire tests\n\n## Next Steps\n1. validate\n\n## Notes\nfull history";
    expect(extractUnfinishedWork(summary)).toBe("- wire tests\n\n1. validate");
    expect(scratchpadNowSection("# Scratchpad\n\n## Now\n\nresume this\n\n## Later\n\nnot this\n")).toBe("resume this");
    expect(scratchpadNowSection("## Now\n\nNone.\n")).toBe("");
    const existing = "# Scratchpad\n\n## Now\n\nold item\n\n## Later\n\nkeep this\n";
    const replaced = replaceNowSection(existing, extractUnfinishedWork(summary));
    expect(replaced).toContain("## Now\n\n- wire tests\n\n1. validate");
    expect(replaced).toContain("## Later\n\nkeep this");
    expect(replaced).not.toContain("old item");
    expect(replaced).not.toContain("full history");
  });
});
