import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildRepoContextPrompt,
  collectRepoContextFiles,
  resolveMergedExtensionPaths,
  resolveSpawnCwd,
  type AgentCompletionEvent,
} from "../vendor/pi-codex-subagents/core.ts";
import { formatWaveBatchPayload, WaveCoordinator } from "../vendor/pi-codex-subagents/index.ts";

const tempDirs: string[] = [];
const makeTemp = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("vendored pi-codex-subagents core helpers", () => {
  test("resolveSpawnCwd resolves valid directories and rejects missing or file paths", () => {
    const root = makeTemp("subagent-cwd-");
    const nested = join(root, "nested");
    const file = join(root, "file.txt");
    mkdirSync(nested, { recursive: true });
    writeFileSync(file, "hi");

    expect(resolveSpawnCwd(root)).toBe(root);
    expect(resolveSpawnCwd(root, "nested")).toBe(nested);
    expect(resolveSpawnCwd(root, `@${nested}`)).toBe(nested);
    expect(() => resolveSpawnCwd(root, "does-not-exist")).toThrow("does not exist");
    expect(() => resolveSpawnCwd(root, file)).toThrow("not a directory");
  });

  test("collectRepoContextFiles walks repo root down to target cwd and excludes global agentDir and above-repo files", () => {
    const outer = makeTemp("subagent-ctx-");
    writeFileSync(join(outer, "AGENTS.md"), "OUTER_SHOULD_NOT_LOAD");
    const agentDir = join(outer, "agent-dir");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "AGENTS.md"), "GLOBAL_SHOULD_NOT_LOAD");

    const repo = join(outer, "repo");
    const web = join(repo, "web");
    const inertia = join(web, "resources/js/inertia");
    mkdirSync(join(repo, ".git"), { recursive: true });
    mkdirSync(inertia, { recursive: true });
    writeFileSync(join(repo, "AGENTS.md"), "ROOT_RULES");
    writeFileSync(join(repo, "CLAUDE.md"), "ROOT_CLAUDE_IGNORED_WHEN_AGENTS_EXISTS");
    writeFileSync(join(web, "AGENTS.md"), "WEB_RULES");
    writeFileSync(join(inertia, "CLAUDE.md"), "INERTIA_CLAUDE_RULES");

    const files = collectRepoContextFiles(inertia, agentDir);
    expect(files).toEqual([
      join(repo, "AGENTS.md"),
      join(web, "AGENTS.md"),
      join(inertia, "CLAUDE.md"),
    ]);
    const prompt = buildRepoContextPrompt(inertia, agentDir);
    expect(prompt).toContain("ROOT_RULES");
    expect(prompt).toContain("WEB_RULES");
    expect(prompt).toContain("INERTIA_CLAUDE_RULES");
    expect(prompt).not.toContain("OUTER_SHOULD_NOT_LOAD");
    expect(prompt).not.toContain("GLOBAL_SHOULD_NOT_LOAD");
    expect(prompt).not.toContain("ROOT_CLAUDE_IGNORED");
  });

  test("resolveMergedExtensionPaths merges defaults, template extensions, and existing optional defaults without dropping defaults", () => {
    const root = makeTemp("subagent-ext-");
    const defExt = join(root, "default.ts");
    const tplExt = join(root, "template.ts");
    const optPresent = join(root, "optional-present.ts");
    const optMissing = join(root, "optional-missing.ts");
    writeFileSync(defExt, "");
    writeFileSync(tplExt, "");
    writeFileSync(optPresent, "");

    const merged = resolveMergedExtensionPaths({
      defaults: [defExt],
      optionalDefaults: [optPresent, optMissing, defExt],
      template: [tplExt, defExt],
    }, root);
    expect(merged.extensionPaths).toEqual([defExt, tplExt, optPresent]);
    expect(() => resolveMergedExtensionPaths({ template: [join(root, "missing.ts")] }, root)).toThrow("Extension path not found");
  });
});

describe("WaveCoordinator", () => {
  const completion = (agentName: string, status: "completed" | "failed", extra: Partial<AgentCompletionEvent> = {}): AgentCompletionEvent => ({
    id: `ev-${agentName}`,
    parentSessionId: "p1",
    agentName,
    provider: "openai-codex",
    model: "openai-codex:gpt-6.2-sol",
    status,
    finalResponse: status === "completed" ? `done ${agentName}` : undefined,
    error: status === "failed" ? "boom" : undefined,
    createdAt: Date.now(),
    ...extra,
  });

  test("buffers fast completions until turn seals and delivers one combined batch once all members settle", () => {
    const waves = new WaveCoordinator();
    waves.register("p1", "audit", "/a");
    // Fast child finishes before sibling /b is even registered
    expect(waves.onCompletion(completion("/a", "completed", { wave: "audit" }))).toEqual({});
    waves.register("p1", "audit", "/b");
    expect(waves.sealParent("p1")).toEqual([]);
    const final = waves.onCompletion(completion("/b", "completed", { wave: "audit" }));
    expect(final.immediate).toBeUndefined();
    expect(final.batch?.wave).toBe("audit");
    expect(final.batch?.results.map((r) => r.agent_name)).toEqual(["/a", "/b"]);
  });

  test("delivers failures immediately while keeping siblings running, and flushes remaining completed members", () => {
    const waves = new WaveCoordinator();
    waves.register("p1", "rev", "/a");
    waves.register("p1", "rev", "/b");
    waves.sealParent("p1");

    const fail = waves.onCompletion(completion("/a", "failed", { wave: "rev" }));
    expect(fail.immediate?.agentName).toBe("/a");
    expect(fail.immediate?.status).toBe("failed");
    expect(fail.batch).toBeUndefined();

    const ok = waves.onCompletion(completion("/b", "completed", { wave: "rev" }));
    expect(ok.immediate).toBeUndefined();
    expect(ok.batch?.results.map((r) => r.agent_name)).toEqual(["/b"]);
  });

  test("detaching an interrupted member flushes already-completed wave members when sealed", () => {
    const waves = new WaveCoordinator();
    waves.register("p1", "w", "/a");
    waves.register("p1", "w", "/b");
    waves.sealParent("p1");
    expect(waves.onCompletion(completion("/a", "completed", { wave: "w" }))).toEqual({});
    const flushed = waves.detach("p1", "/b");
    expect(flushed?.results.map((r) => r.agent_name)).toEqual(["/a"]);
  });

  test("formatWaveBatchPayload spills oversized individual replies to disk without truncating later wave members", () => {
    const big = "line of evidence\n".repeat(1200);
    const formatted = formatWaveBatchPayload({
      parentSessionId: "p1",
      wave: "big",
      results: [
        { agent_name: "/first", status: "completed", final_response: big },
        { agent_name: "/second", status: "completed", final_response: "SECOND_VERDICT_INTACT" },
      ],
    }, 6000);
    expect(formatted.text).toContain("SECOND_VERDICT_INTACT");
    expect(formatted.results[0]!.full_output_path).toBeTruthy();
    expect(readFileSync(formatted.results[0]!.full_output_path!, "utf8")).toBe(big);
  });
});
