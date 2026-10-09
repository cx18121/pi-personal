import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { estimateTokens, SessionManager, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { responseBudget } from "../src/admission.ts";
import { resolveLocations } from "../src/core.ts";
import { saveRecord } from "../src/ledger.ts";
import { SOURCE_ENTRY } from "../src/learning.ts";
import { memoryOperations } from "../src/operations.ts";
import { MemorySession } from "../src/runtime.ts";

let root: string, cwd: string, agentDir: string;
const oldAgentDir = process.env.PI_CODING_AGENT_DIR, oldMemoryDir = process.env.PI_MEMORY_DIR;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-admission-"));
  cwd = path.join(root, "repo"); agentDir = path.join(root, "agent");
  fs.mkdirSync(cwd); fs.mkdirSync(agentDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.PI_MEMORY_DIR = path.join(root, "memory");
});
afterEach(() => {
  if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
  if (oldMemoryDir === undefined) delete process.env.PI_MEMORY_DIR; else process.env.PI_MEMORY_DIR = oldMemoryDir;
  fs.rmSync(root, { recursive: true, force: true });
});
function settings(global: unknown, project?: unknown) {
  fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify(global));
  if (project !== undefined) {
    fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".pi", "settings.json"), JSON.stringify(project));
  }
}
function context(tokens: number | null = 228_062, trusted = true): ExtensionContext {
  return { cwd, sessionManager: SessionManager.inMemory(cwd), isProjectTrusted: () => trusted,
    getContextUsage: () => ({ contextWindow: 272_000, tokens, percent: null }),
    model: { provider: "openai-codex", id: "gpt-6.1-sol", contextWindow: 272_000, maxTokens: 128_000 } } as ExtensionContext;
}
const compaction = { reserveTokens: 128_000, modelOverrides: { "openai-codex/gpt-6.1-sol": { reserveTokens: 27_200 } } };

test("long Codex sessions reserve configured output space, not maximum output capacity", () => {
  settings({ compaction });
  const ctx = context();
  expect(responseBudget(ctx)).toBe(16_738);
  ctx.model!.id = "different-model";
  expect(responseBudget(ctx)).toBe(0);
});

test("reserve resolution follows merged model settings and project trust without changing files", () => {
  settings({ compaction }, { compaction: { reserveTokens: 40_000, modelOverrides: { "openai-codex/gpt-6.1-sol": { keepRecentTokens: 1000 } } } });
  const globalFile = path.join(agentDir, "settings.json"), projectFile = path.join(cwd, ".pi", "settings.json");
  const before = [fs.readFileSync(globalFile), fs.readFileSync(projectFile)];
  expect(responseBudget(context())).toBe(16_738);
  settings({ compaction }, { compaction: { modelOverrides: { "openai-codex/gpt-6.1-sol": { reserveTokens: 10_000 } } } });
  expect(responseBudget(context())).toBe(33_938);
  expect(responseBudget(context(228_062, false))).toBe(16_738);
  settings({ compaction }, { compaction: { reserveTokens: 40_000, modelOverrides: { "openai-codex/gpt-6.1-sol": { keepRecentTokens: 1000 } } } });
  responseBudget(context());
  expect([fs.readFileSync(globalFile), fs.readFileSync(projectFile)]).toEqual(before);
});

test("default, ordinary, small-model and exhausted reserves remain bounded", () => {
  expect(responseBudget(context())).toBe(27_554);
  settings({ compaction: { reserveTokens: 20_000 } });
  expect(responseBudget(context())).toBe(23_938);
  const small = context(1000); small.model!.maxTokens = 2000;
  expect(responseBudget(small)).toBe(269_000);
  settings({ compaction });
  expect(responseBudget(context(260_000))).toBe(0);
});

test("unknown token usage estimates the current projection and unknown windows remain unbounded", () => {
  settings({ compaction });
  const ctx = context(null);
  const message = { role: "user" as const, content: "Preserve the qualification.", timestamp: 0 };
  (ctx.sessionManager as SessionManager).appendMessage(message);
  expect(responseBudget(ctx)).toBe(244_800 - estimateTokens(message));
  ctx.getContextUsage = () => undefined;
  ctx.model = undefined;
  expect(responseBudget(ctx)).toBe(Infinity);
});

test("the two reported memory reads succeed at the recorded context size and still reject true exhaustion", async () => {
  settings({ compaction });
  Bun.spawnSync(["git", "init", "-q"], { cwd });
  const ctx = context(), session = new MemorySession();
  (ctx.sessionManager as SessionManager).appendCustomEntry(SOURCE_ENTRY, { type: "input", origin: "interactive", text: "yeah agreed.", originProject: "fixture" });
  const saved = saveRecord(resolveLocations(cwd).projectDir!, { topic: "Messi operating policy", route: "CI automation", kind: "decision", always: false,
    content: "Investigate CI failures only when mentioned.", evidence: { actor: "user", reference: "fixture", quote: "yeah agreed.", observedAt: new Date().toISOString() } });
  const tools = memoryOperations(session), evidence = tools.find(tool => tool.name === "memory_evidence")!, read = tools.find(tool => tool.name === "memory_read")!;
  const found = await evidence.execute("evidence", { query: "yeah agreed." }, undefined, ctx);
  const record = await read.execute("read", { scope: "project", id: saved.record.id }, undefined, ctx);
  expect(found.isError).not.toBe(true); expect(found.details.complete).toBe(true); expect(found.details.items).toHaveLength(1);
  expect(record.isError).not.toBe(true); expect(record.details.complete).toBe(true); expect(record.details.record).toEqual(saved.record);
  ctx.getContextUsage = () => ({ contextWindow: 272_000, tokens: 260_000, percent: null });
  for (const [tool, params] of [[evidence, { query: "yeah agreed." }], [read, { scope: "project", id: saved.record.id }]] as const) {
    const exhausted = await tool.execute("exhausted", params, undefined, ctx);
    expect(exhausted.isError).toBe(true); expect(JSON.stringify(exhausted)).toContain("no content was truncated");
  }
});
