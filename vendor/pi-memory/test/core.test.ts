import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { withFileLock, resolveLocations, resolveProjectIdentity, legacyProjectId, resolveScope, resolveAgentRole, assertMemoryMutationPermission, assertScratchpadPermission, mutateChecklist, parseChecklist, scratchpadFilePath, readText, atomicWriteFile } from "../src/core.ts";
let tempDir: string;
beforeEach(() => { tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-core-")); });
afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));
function locationsWithProject() {
  const baseDir = path.join(tempDir, "memory");
  return { baseDir, globalDir: path.join(baseDir, "global"), project: { commonRoot: tempDir, name: "repo", hash: "1234567890", id: "repo-1234567890" }, projectDir: path.join(baseDir, "projects", "repo-1234567890") };
}
describe("lock ownership", () => {
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

});
describe("scratchpads", () => {
  test("defaults to project scope and preserves handwritten lines", () => {
    const locations = locationsWithProject();
    expect(resolveScope(locations).scope).toBe("project");
    const filePath = scratchpadFilePath(locations.projectDir!);
    atomicWriteFile(filePath, "# Scratchpad\n\nHandwritten context\n- [ ] First task\n  - detail\n");
    mutateChecklist({ filePath, action: "done", text: "First" });
    mutateChecklist({ filePath, action: "add", text: "Second task" });
    const content = readText(filePath);
    expect(content).toContain("Handwritten context");
    expect(content).toContain("  - detail");
    expect(content).toContain("- [x] First task");
    expect(parseChecklist(content).filter((item) => !item.done).map((item) => item.text)).toEqual(["Second task"]);
  });

  test("rejects ambiguous matches and prefers exact item text", () => {
    const filePath = path.join(tempDir, "SCRATCHPAD.md");
    const original = "- [ ] After Charlie finishes PAN-306 cleanup\n- [ ] After Charlie finishes PAN-307 cleanup\n";
    atomicWriteFile(filePath, original);

    expect(() => mutateChecklist({ filePath, action: "done", text: "After Charlie finishes" })).toThrow(
      "Multiple matching open items found",
    );
    expect(readText(filePath)).toBe(original);

    mutateChecklist({ filePath, action: "done", text: "After Charlie finishes PAN-307 cleanup" });
    expect(readText(filePath)).toContain("- [ ] After Charlie finishes PAN-306 cleanup");
    expect(readText(filePath)).toContain("- [x] After Charlie finishes PAN-307 cleanup");
  });

  test("supports scratchpad undo, clear and list without touching archives", () => {
    const filePath = scratchpadFilePath(tempDir);
    const archive = path.join(tempDir, "PAPERCUTS.md");
    const archived = "- [ ] historical incident\n";
    atomicWriteFile(archive, archived);
    mutateChecklist({ filePath, action: "add", text: "task" });
    mutateChecklist({ filePath, action: "done", text: "task" });
    mutateChecklist({ filePath, action: "undo", text: "task" });
    expect(mutateChecklist({ filePath, action: "list" })).toContain("- [ ] task");
    mutateChecklist({ filePath, action: "done", text: "task" });
    mutateChecklist({ filePath, action: "clear_done" });
    expect(parseChecklist(readText(filePath))).toEqual([]);
    expect(readText(archive)).toBe(archived);
  });

});


test("identity resolution is read-only and honors configured IDs", () => {
  Bun.spawnSync(["git", "init", "-q"], { cwd: tempDir });
  const config = path.join(tempDir, ".git", "config");
  const original = fs.readFileSync(config, "utf8");
  expect(resolveProjectIdentity(tempDir)!.id).toBe(legacyProjectId(tempDir));
  const memoryDir = path.join(tempDir, "memory");
  resolveLocations(tempDir, { PI_MEMORY_DIR: memoryDir });
  expect(fs.readFileSync(config, "utf8")).toBe(original);
  expect(fs.existsSync(memoryDir)).toBe(false);
  Bun.spawnSync(["git", "config", "pi.memory-id", "stable-1234567890"], { cwd: tempDir });
  const legacyDir = path.join(memoryDir, "projects", legacyProjectId(tempDir));
  atomicWriteFile(path.join(legacyDir, "MEMORY.md"), "legacy");
  expect(resolveLocations(tempDir, { PI_MEMORY_DIR: memoryDir }).projectDir).toBe(legacyDir);
  expect(fs.existsSync(legacyDir)).toBe(true);
  expect(resolveProjectIdentity(tempDir)!.id).toBe("stable-1234567890");
  Bun.spawnSync(["git", "config", "pi.memory-id", "../../escape"], { cwd: tempDir });
  expect(() => resolveProjectIdentity(tempDir)).toThrow("valid project ID");
});
test("outside Git defaults global and subagents cannot mutate", () => {
  const locations = resolveLocations(tempDir, { PI_MEMORY_DIR: path.join(tempDir, "memory") });
  expect(resolveScope(locations).scope).toBe("global");
  expect(() => resolveScope(locations, "project")).toThrow("outside a Git repository");
  expect(resolveAgentRole({ PI_SUBAGENT_CHILD: "1" })).toBe("subagent");
  expect(() => assertMemoryMutationPermission("subagent")).toThrow("cannot mutate");
  expect(() => assertScratchpadPermission("subagent", "add")).toThrow("cannot mutate");
  expect(() => assertScratchpadPermission("subagent", "list")).not.toThrow();
});
