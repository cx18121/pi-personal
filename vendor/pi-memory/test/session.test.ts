import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, Type, type Provider } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerMemory from "../src/index.ts";
import registerPersonalMemory from "../../../extensions/memory.ts";
import registerModelPolicy from "../../../extensions/model-policy.ts";
import registerCx from "../../../modules/cxstack/extensions/cx.ts";
import { CX_MARKER } from "../../../modules/cxstack/lib/cx.ts";
import { archiveRecord, ledgerPath, readLedger, saveRecord, recordHash } from "../src/ledger.ts";
import { SessionEvidence, SOURCE_ENTRY, conversationalEntry } from "../src/learning.ts";
import { MemorySession } from "../src/runtime.ts";
import { memoryOperations } from "../src/operations.ts";
import { structuralUnits } from "../src/structural.ts";
import { tokenEstimate } from "../src/admission.ts";
import { resolveLocations } from "../src/core.ts";
const roots = new Set<string>();
const oldMemoryDir = process.env.PI_MEMORY_DIR, oldCapture = process.env.PI_MEMORY_AUTO_CAPTURE;
afterEach(() => {
  if (oldMemoryDir === undefined) delete process.env.PI_MEMORY_DIR; else process.env.PI_MEMORY_DIR = oldMemoryDir;
  if (oldCapture === undefined) delete process.env.PI_MEMORY_AUTO_CAPTURE; else process.env.PI_MEMORY_AUTO_CAPTURE = oldCapture;
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); roots.clear();
});
const input = (content: string, always = false) => ({ topic: "writing", route: "When writing a status report", kind: "preference" as const,
  content, always, evidence: { actor: "user" as const, reference: "user:fixture", quote: content, observedAt: new Date().toISOString() } });

async function harness(extra: (pi: ExtensionAPI) => void = () => {}, existingRoot?: string, registration = registerMemory) {
  const root = existingRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), "memory-session-")); roots.add(root);
  const cwd = path.join(root, "repo"), agentDir = path.join(root, "agent");
  fs.mkdirSync(cwd, { recursive: true }); fs.mkdirSync(agentDir, { recursive: true });
  process.env.PI_MEMORY_DIR = path.join(root, "memory");
  Bun.spawnSync(["git", "init", "-q"], { cwd });
  const faux = createFauxCore({ provider: "memory-test", models: [{ id: "driver" }] });
  const runtime = await ModelRuntime.create({ authPath: path.join(agentDir, "auth.json"), modelsPath: path.join(agentDir, "models.json"), modelsStorePath: path.join(agentDir, "catalog.db"), allowModelNetwork: false });
  const provider: Provider = { id: "memory-test", name: "Memory faux test", auth: { apiKey: { name: "Test key", resolve: async ({ credential }) => credential?.key ? { auth: { apiKey: credential.key } } : undefined } },
    getModels: () => faux.models, stream: (model, context, options) => faux.stream(model as never, context, options), streamSimple: (model, context, options) => faux.streamSimple(model as never, context, options) };
  runtime.registerNativeProvider(provider); await runtime.setRuntimeApiKey("memory-test", "test-not-a-secret");
  const loader = new DefaultResourceLoader({ cwd, agentDir, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [{ name: "memory", factory: registration }, { name: "extra", factory: extra }] });
  await loader.reload();
  const model = runtime.getModel("memory-test", "driver")!;
  const manager = SessionManager.create(cwd, path.join(root, "sessions"));
  const created = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model, scopedModels: [{ model }], noTools: "builtin", resourceLoader: loader, sessionManager: manager });
  return { ...created, faux, cwd, manager, locations: resolveLocations(cwd), root };
}
const sourceId = (context: unknown) => JSON.stringify(context).match(/Current observed submission reference: ([^ .]+:[a-zA-Z0-9-]+)/)![1];
const call = (name: string, args: Record<string, unknown>) => fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });

// Provider calls here are deliberately scripted plumbing tests, not recognition evidence.
test("actual Pi payloads contain complete topics, not bodies/scratchpads; fresh recall replaces rather than accumulates", async () => {
  const h = await harness();
  const global = saveRecord(h.locations.globalDir, input("Standing default v1", true));
  const detail = saveRecord(h.locations.projectDir!, input("hidden-detail-token " + "detail ".repeat(2000)));
  fs.writeFileSync(path.join(h.locations.projectDir!, "SCRATCHPAD.md"), "- [ ] scratch-only-token");
  saveRecord(path.join(h.locations.baseDir, "projects", "other-1234567890"), input("other-project-only-token", true));
  const snapshots: string[] = [];
  h.faux.setResponses([
    context => { snapshots.push(JSON.stringify(context.messages)); saveRecord(h.locations.globalDir, { ...input("Standing default v2", true), id: global.record.id, expectedHash: global.hash }); return call("memory_read", { scope: "project", id: detail.record.id }); },
    context => { snapshots.push(JSON.stringify(context.messages)); return fauxAssistantMessage("Used the complete detail."); },
    context => { snapshots.push(JSON.stringify(context.messages)); return fauxAssistantMessage("No stale recall."); },
  ]);
  try {
    await h.session.prompt("Write the status report.");
    expect(snapshots[0]).toContain("Standing default v1"); expect(snapshots[0]).toContain('writing');
    expect(snapshots[0]).not.toContain("hidden-detail-token"); expect(snapshots[0]).not.toContain("scratch-only-token"); expect(snapshots[0]).not.toContain("other-project-only-token");
    expect(snapshots[1]).toContain("Standing default v2"); expect(snapshots[1]).not.toContain("Standing default v1"); expect(snapshots[1]).toContain(detail.record.content);
    expect(h.faux.state.callCount).toBe(2); expect(JSON.stringify(h.manager.getBranch())).not.toContain("# Local memory");
    const latest = readLedger(h.locations.globalDir).records[0]; archiveRecord(h.locations.globalDir, latest.id, recordHash(latest));
    await h.session.prompt("Continue."); expect(snapshots[2]).not.toContain("Standing default v2");
    expect(h.session.messages.filter(message => message.role === "user")).toHaveLength(2);
  } finally { h.session.dispose(); }
});

test("request inventory explicitly distinguishes empty scopes from unavailable coverage", async () => {
  const h = await harness();
  let snapshot = "";
  h.faux.setResponses([context => { snapshot = JSON.stringify(context.messages); return fauxAssistantMessage("No stored context is available."); }]);
  try {
    await h.session.prompt("Explain a closure.");
    expect(snapshot).toContain("## global memory\\nNo current records. This scope has nothing to recall.");
    expect(snapshot).toContain("## project memory\\nNo current records. This scope has nothing to recall.");
    expect(snapshot).not.toContain("Coverage is incomplete");
    expect(snapshot).not.toContain("memory unavailable");
    expect(h.faux.state.callCount).toBe(1);
    expect(JSON.stringify(h.manager.getBranch())).not.toContain("This scope has nothing to recall.");
  } finally { h.session.dispose(); }
});

test("packaged prompt contributors preserve memory across continuation and the CX marker turn", async () => {
  const h = await harness(pi => {
    registerModelPolicy(pi, () => ({ disabledProviders: [] }));
    registerCx(pi);
  });
  const marker = "COMBINED_LOADOUT_STANDING_PREFERENCE";
  saveRecord(h.locations.globalDir, input(marker, true));
  const snapshots: string[] = [];
  h.faux.setResponses([
    context => { snapshots.push(JSON.stringify(context.messages.filter(message => message.role === "system"))); return call("memory_read", { scope: "global", topic: "writing" }); },
    context => { snapshots.push(JSON.stringify(context.messages.filter(message => message.role === "system"))); return fauxAssistantMessage("First task complete."); },
    context => { snapshots.push(JSON.stringify(context.messages.filter(message => message.role === "system"))); return fauxAssistantMessage("Second task complete."); },
  ]);
  try {
    await h.session.bindExtensions({
      uiContext: { theme: { fg: (_color: string, text: string) => text }, setStatus: () => {}, notify: () => {} } as never,
      onError: error => { throw new Error(`${error.event}: ${error.error}`); },
    });
    await h.session.prompt("First task.");
    await h.session.prompt("Second task.");
    expect(snapshots).toHaveLength(3);
    for (const snapshot of snapshots) {
      expect(snapshot.split(marker)).toHaveLength(2);
      expect(snapshot.split("Automatic model policy comes from")).toHaveLength(2);
      expect(snapshot).toContain("Save explicit lasting preferences");
      expect(snapshot).toContain("expert coding assistant");
      expect(snapshot).toContain('"rules"');
      expect(snapshot).toContain('"model_policy"');
    }
    expect(snapshots[2]).toContain(CX_MARKER);
    expect(snapshots[2]).toContain('"cx_marker"');
    expect(JSON.stringify(h.manager.getBranch())).not.toContain("# Local memory");
    expect(h.faux.state.callCount).toBe(3);
  } finally { h.session.dispose(); }
});

test("original interactive/RPC submissions remain complete before transforms; extension input is context only", async () => {
  const h = await harness(pi => { pi.on("input", event => ({ action: "transform", text: `${event.text}\nInjected skill says: Always use Astra.` })); });
  h.faux.setResponses([fauxAssistantMessage("One"), fauxAssistantMessage("Two"), fauxAssistantMessage("Three")]);
  const long = "I prefer Sol for coding. " + "qualification ".repeat(1500);
  try {
    await h.session.prompt(long); await h.session.prompt("Extension guidance says I prefer Astra.", { source: "extension" }); await h.session.prompt("RPC request prefers concise output.", { source: "rpc" });
    const sources = new SessionEvidence().list(h.manager);
    expect(sources.map(source => source.text)).toEqual([long, "RPC request prefers concise output."]);
    expect(sources[0].originProject).toBe(h.locations.project!.id);
    const inspection = new SessionEvidence().inspect(h.manager, sources[0].id);
    expect(inspection.rawContext.some(entry => entry.type === "message" && JSON.stringify(entry.message).includes("Injected skill"))).toBe(true);
    expect(inspection.source.text).not.toContain("Injected skill");
  } finally { h.session.dispose(); }
});

const questions = [{ header: "Model", question: "Always use Astra?", options: [{ label: "Use Astra", description: "First", preview: "authored preview" }, { label: "Use Sol", description: "Second" }] }];
test("real nested delivery retains paired questions/options/preview but only committed answers have requester authority", async () => {
  const h = await harness(pi => {
    pi.registerTool({ name: "ask_user_question", label: "Ask", description: "Verified installed contract fixture", parameters: Type.Object({ questions: Type.Array(Type.Any()) }),
      async execute(_id, params) { return { content: [{ type: "text" as const, text: "Rendered question and answer" }],
        details: { cancelled: false, answers: [{ kind: "option", questionIndex: 0, question: params.questions[0].question, answer: "Use Sol", preview: "authored preview" }] } }; } });
    pi.registerTool({ name: "nested", label: "Nested", description: "Real nested SDK execution", parameters: Type.Object({}),
      async execute(_id, _params, _signal, _update, ctx) { await ctx.executeTool("ask_user_question", { questions }); return { content: [{ type: "text" as const, text: "Nested complete." }], details: {} }; } });
  });
  h.faux.setResponses([call("nested", {}), fauxAssistantMessage("Done")]);
  try {
    await h.session.prompt("Ask about model choice.");
    const sources = new SessionEvidence().list(h.manager), answer = sources.find(source => source.actor === "user" && source.text === "Use Sol")!;
    expect(answer).toBeDefined(); expect(JSON.stringify(answer.context)).toContain("Always use Astra?"); expect(JSON.stringify(answer.context)).toContain("authored preview");
    const service = new SessionEvidence();
    expect(service.evidence(h.manager, answer.id, "Use Sol", "preference").actor).toBe("user");
    expect(() => service.evidence(h.manager, answer.id, "authored preview", "preference")).toThrow("source");
    expect(h.manager.getBranch().filter(entry => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "ask_user_question")).toHaveLength(0);
  } finally { h.session.dispose(); }
});

test("working tool loop saves directly with provenance, no forced reread, and rejects fabricated quotes", async () => {
  const h = await harness(); let id = "";
  h.faux.setResponses([
    context => { id = sourceId(context); return call("memory_write", { scope: "global", topic: "writing", route: "Output style", content: "Prefer concise explanations.", kind: "preference", evidenceId: id, quote: "I prefer concise explanations.", always: true }); },
    fauxAssistantMessage("Saved."),
    context => { id = sourceId(context); return call("memory_write", { scope: "global", topic: "writing", route: "Output style", content: "Prefer exhaustive explanations.", kind: "preference", evidenceId: id, quote: "Invented preference", always: true }); },
    fauxAssistantMessage("Rejected."),
  ]);
  try {
    await h.session.prompt("I prefer concise explanations.");
    const saved = readLedger(h.locations.globalDir).records[0];
    expect(saved).toMatchObject({ content: "Prefer concise explanations.", evidence: { actor: "user", quote: "I prefer concise explanations.", source: { sessionId: h.manager.getSessionId() } } });
    const firstResult = h.session.messages.find(message => message.role === "toolResult" && message.toolName === "memory_write"); expect(firstResult?.role === "toolResult" && firstResult.isError).toBe(false);
    expect(h.faux.state.callCount).toBe(2);
    expect(h.session.messages.some(message => message.role === "toolResult" && message.toolName === "memory_evidence")).toBe(false);
    const anchor = h.manager.getEntry(saved.evidence.source!.anchorId)!;
    expect(anchor.type).toBe("message"); expect(JSON.stringify(anchor)).toContain("memory_write");
    await h.session.prompt("Add a small test."); expect(readLedger(h.locations.globalDir).records).toHaveLength(1);
    expect(h.session.messages.filter(message => message.role === "toolResult" && message.isError)).toHaveLength(1);
  } finally { h.session.dispose(); }
});

test("one-off task targeting preserves source origin and does not overwrite launch memory or change focus", async () => {
  const h = await harness(), target = path.join(h.root, "task-repo"); fs.mkdirSync(target); Bun.spawnSync(["git", "init", "-q"], { cwd: target }); let id = "";
  h.faux.setResponses([
    context => { id = sourceId(context); return call("memory_write", { projectPath: target, scope: "project", topic: "reporting", route: "Comparison baseline", content: "Compare against the last sent report.", kind: "decision", evidenceId: id, quote: "Compare against the last sent report." }); },
    () => call("memory_status", {}), fauxAssistantMessage("Saved for the task repository."),
  ]);
  try {
    await h.session.prompt("For the named task repo, Compare against the last sent report.");
    const record = readLedger(resolveLocations(target).projectDir!).records[0]; expect(record.evidence.source?.sessionId).toBe(h.manager.getSessionId());
    const source = new SessionEvidence().list(h.manager).find(item => item.id === record.evidence.reference)!; expect(source.originProject).toBe(h.locations.project!.id);
    expect(readLedger(h.locations.projectDir!).records).toEqual([]);
    const status = h.session.messages.find(message => message.role === "toolResult" && message.toolName === "memory_status"); expect(JSON.stringify(status)).toContain(h.locations.project!.id);
  } finally { h.session.dispose(); }
});

test("later sessions recall self-contained records without opening old files or authorizing historical saves", async () => {
  const h = await harness(); let id = "";
  h.faux.setResponses([context => { id = sourceId(context); return call("memory_write", { scope: "project", topic: "reports", route: "Recipient baseline", content: "Same audience uses the last actually sent report. New audiences use a first-report baseline, to preserve recipient continuity.", kind: "decision", evidenceId: id, quote: "last actually sent report" }); },
    fauxAssistantMessage("Saved"), fauxAssistantMessage("Unrelated response")]);
  try { await h.session.prompt("Use the last actually sent report for the same audience; first-report baseline for a new audience, so recipients get continuity."); await h.session.prompt("What is 2+2?"); }
  finally { h.session.dispose(); }
  const record = readLedger(h.locations.projectDir!).records[0], file = h.manager.getSessionFile()!;
  fs.writeFileSync(file, Buffer.from([0xff, 0x00]));
  const before = fs.readFileSync(file), later = await harness(() => {}, h.root);
  later.faux.setResponses([call("memory_search", { query: "recipient continuity" }),
    call("memory_evidence", { evidenceId: record.evidence.reference }),
    call("memory_write", { scope: "project", topic: "reports", route: "Wrong historical save", content: "Unsupported historical reuse.", kind: "decision", evidenceId: record.evidence.reference, quote: "last actually sent report" }),
    call("memory_read", { scope: "project", id: record.id }), fauxAssistantMessage("The saved decision is sufficient; old sessions are not inspected.")]);
  try {
    await later.session.prompt("Why did we choose that reporting baseline?");
    const results = later.session.messages.filter(message => message.role === "toolResult");
    expect(results.map(message => message.isError)).toEqual([false, true, true, false]);
    expect(JSON.stringify(results[0])).toContain("first-report baseline"); expect(JSON.stringify(results[1])).toContain("Historical inspection is not supported");
    expect(JSON.stringify(results[3])).toContain("recipient continuity"); expect(fs.readFileSync(file)).toEqual(before);
    expect(readLedger(later.locations.projectDir!).records).toEqual([record]);
  } finally { later.session.dispose(); }
});

test("corrupt project state does not hide valid global memory or block the coding response", async () => {
  const h = await harness(); saveRecord(h.locations.globalDir, input("Keep this valid global preference.", true));
  fs.mkdirSync(h.locations.projectDir!, { recursive: true }); fs.writeFileSync(ledgerPath(h.locations.projectDir!), "broken ledger"); let payload = "";
  h.faux.setResponses([context => { payload = JSON.stringify(context.messages); return fauxAssistantMessage("Coding continues."); }]);
  try { await h.session.prompt("Continue the task."); expect(payload).toContain("Keep this valid global preference."); expect(payload).toContain("project memory unavailable"); expect(h.faux.state.callCount).toBe(1); expect(fs.readFileSync(ledgerPath(h.locations.projectDir!), "utf8")).toBe("broken ledger"); }
  finally { h.session.dispose(); }
});

test("actual reload and tree navigation restore task focus, and compaction retains inspectable native sources", async () => {
  const h = await harness(pi => {
    pi.on("session_before_compact", event => ({ compaction: { summary: "Fixture compaction summary, not user authority.", firstKeptEntryId: event.preparation.firstKeptEntryId, tokensBefore: event.preparation.tokensBefore } }));
  });
  const target = path.join(h.root, "focused"); fs.mkdirSync(target); Bun.spawnSync(["git", "init", "-q"], { cwd: target });
  saveRecord(h.locations.projectDir!, { ...input("Launch detail"), topic: "launch-topic" });
  saveRecord(resolveLocations(target).projectDir!, { ...input("Task detail"), topic: "task-topic" });
  const payloads: string[] = [];
  h.faux.setResponses([fauxAssistantMessage("Launch work."), call("memory_focus", { projectPath: target }),
    context => { payloads.push(JSON.stringify(context.messages)); return fauxAssistantMessage("Task selected."); },
    context => { payloads.push(JSON.stringify(context.messages)); return fauxAssistantMessage("Focus survived reload."); },
    context => { payloads.push(JSON.stringify(context.messages)); return fauxAssistantMessage("Launch branch restored."); }]);
  try {
    await h.session.prompt("Start in the launch repository."); const launchLeaf = h.manager.getLeafId()!;
    const originalSource = new SessionEvidence().list(h.manager)[0];
    await h.session.prompt("The real task belongs to the other repository.");
    expect(payloads[0]).toContain("task-topic"); expect(payloads[0]).not.toContain("launch-topic");
    expect(h.manager.getBranch().filter(entry => entry.type === "custom" && entry.customType === "memory-focus-v1")).toHaveLength(1);
    fs.writeFileSync(path.join(h.root, "agent", "settings.json"), JSON.stringify({ compaction: { keepRecentTokens: 1 } }));
    await h.session.reload();
    expect(h.manager.getBranch().filter(entry => entry.type === "custom" && entry.customType === "memory-focus-v1")).toHaveLength(1);
    await h.session.prompt("Continue the task after reload.");
    expect(payloads[1]).toContain("task-topic"); expect(payloads[1]).not.toContain("launch-topic");
    await h.session.compact();
    expect(h.manager.getBranch().some(entry => entry.type === "compaction")).toBe(true);
    expect(new SessionEvidence().inspect(h.manager, originalSource.id).source.text).toBe(originalSource.text);
    await h.session.navigateTree(launchLeaf, { summarize: false }); await h.session.prompt("Continue the original branch.");
    expect(payloads[2]).toContain("launch-topic"); expect(payloads[2]).not.toContain("task-topic");
  } finally { h.session.dispose(); }
});
test("handled and queued input preserves observations without inventing delivered-message correspondence", async () => {
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), running = new Promise<void>(resolve => { started = resolve; });
  const h = await harness(pi => {
    pi.on("input", event => event.text === "handled observation" ? { action: "handled" } : undefined);
    pi.registerTool({ name: "pause_fixture", label: "Pause", description: "Deterministic queue fixture", parameters: Type.Object({}),
      async execute() { started(); await held; return { content: [{ type: "text" as const, text: "Released" }], details: {} }; } });
  });
  h.faux.setResponses([call("pause_fixture", {}), fauxAssistantMessage("First run complete."), fauxAssistantMessage("Queued request received.")]);
  try {
    await h.session.prompt("handled observation"); expect(h.faux.state.callCount).toBe(0);
    const first = h.session.prompt("Start paused task."); await running;
    await h.session.prompt("For future work, prefer complete rationale.", { streamingBehavior: "followUp" });
    release(); await first;
    const sources = new SessionEvidence().list(h.manager);
    expect(sources.filter(source => source.actor === "user").map(source => source.text)).toEqual(["handled observation", "Start paused task.", "For future work, prefer complete rationale."]);
    expect(h.session.messages.filter(message => message.role === "user").map(message => JSON.stringify(message.content)).join(" ")).not.toContain("handled observation");
    expect(h.session.messages.filter(message => message.role === "user")).toHaveLength(2);
  } finally { release(); h.session.dispose(); }
});

test("search initially admits the query's strongest lexical tier while keeping every other candidate accessible", async () => {
  const h = await harness();
  const stored = Array.from({ length: 40 }, (_, i) => saveRecord(h.locations.projectDir!, { ...input(`Exact identifier needle${i}.`), topic: "lookup-fixtures" }));
  let first: Record<string, any> | undefined, second: Record<string, any> | undefined;
  h.faux.setResponses([call("memory_search", { query: "needle39" }), context => {
    const response = context.messages.findLast(message => message.role === "toolResult");
    first = JSON.parse(response!.content.filter(part => part.type === "text").map(part => part.type === "text" ? part.text : "").join(""));
    return call("memory_search", { query: "needle39", cursor: first!.nextCursor });
  }, context => {
    const response = context.messages.findLast(message => message.role === "toolResult");
    second = JSON.parse(response!.content.filter(part => part.type === "text").map(part => part.type === "text" ? part.text : "").join(""));
    return fauxAssistantMessage("All candidate cues remain accessible.");
  }]);
  try {
    await h.session.prompt("Find the exact remembered identifier.");
    expect(first!.items).toHaveLength(1); expect(first!.items[0].id).toBe(stored[39].record.id); expect(first!.complete).toBe(false);
    expect(first!.primaryCandidates).toBe(1); expect(first!.items[0].recordComplete).toBe(true);
    expect(first!.items[0].record).toEqual(stored[39].record); expect(first!.items[0].hash).toBe(stored[39].hash);
    expect(second!.items).toHaveLength(39); expect(second!.complete).toBe(true);
    expect(second!.items.every(item => item.recordComplete === false && !("record" in item))).toBe(true);
  } finally { h.session.dispose(); }
});


test("non-phrase task intent returns the complete singleton word-coverage candidate", async () => {
  const h = await harness();
  const wanted = saveRecord(h.locations.projectDir!, input("alpha with an important qualification."));
  saveRecord(h.locations.projectDir!, input("alpha with a different subject."));
  let page: Record<string, any>;
  h.faux.setResponses([call("memory_search", { query: "alpha qualification" }), context => {
    page = JSON.parse(context.messages.findLast(message => message.role === "toolResult")!.content[0].text);
    return fauxAssistantMessage("Apply the complete qualification.");
  }]);
  try {
    await h.session.prompt("Find the remembered qualification.");
    expect(page!.primaryCandidates).toBe(1); expect(page!.items[0].exactPhrase).toBe(false);
    expect(page!.items[0].recordComplete).toBe(true); expect(page!.items[0].record).toEqual(wanted.record);
    expect(page!.items[0].hash).toBe(wanted.hash);
  } finally { h.session.dispose(); }
});

test("tied search candidates stay cues even on singleton pages and continuations bind current state", async () => {
  const h = await harness();
  const a = saveRecord(h.locations.projectDir!, input("alpha beta preserves the first qualification."));
  const b = saveRecord(h.locations.projectDir!, input("alpha beta preserves a different qualification."));
  saveRecord(h.locations.projectDir!, input("alpha only, a lower-tier candidate."));
  let first: Record<string, any>, second: Record<string, any>;
  const last = (context: any) => JSON.parse(context.messages.findLast((message: any) => message.role === "toolResult").content[0].text);
  h.faux.setResponses([call("memory_search", { query: "alpha beta", limit: 1 }), context => {
    first = last(context);
    h.session.model!.maxTokens += 128;
    return call("memory_search", { query: "alpha beta", limit: 1, cursor: first.nextCursor });
  }, context => {
    second = last(context);
    saveRecord(h.locations.projectDir!, { ...input("alpha beta now has a corrected qualification."), id: a.record.id, expectedHash: a.hash });
    return call("memory_search", { query: "alpha beta", cursor: second.nextCursor });
  }, fauxAssistantMessage("Changed memory requires a fresh search.")]);
  try {
    await h.session.prompt("Inspect the tied candidates.");
    for (const page of [first!, second!]) {
      expect(page.primaryCandidates).toBe(2); expect(page.items).toHaveLength(1);
      expect(page.items[0].recordComplete).toBe(false); expect(page.items[0]).not.toHaveProperty("record");
    }
    expect(first!.snapshot).toBe(second!.snapshot);
    expect(new Set([first!.items[0].id, second!.items[0].id])).toEqual(new Set([a.record.id, b.record.id]));
    const results = h.session.messages.filter(message => message.role === "toolResult");
    expect(results[2].isError).toBe(true); expect(JSON.stringify(results[2])).toContain("Results changed");
  } finally { h.session.dispose(); }
});

test("oversized singleton search returns an honest cue without truncating the record", async () => {
  const h = await harness();
  h.session.model!.contextWindow = 12_000; h.session.model!.maxTokens = 1_000;
  const saved = saveRecord(h.locations.projectDir!, input("oversizedpayload " + "Preserve this full paragraph.\n\n".repeat(6000)));
  const before = fs.readFileSync(ledgerPath(h.locations.projectDir!));
  let page: Record<string, any>;
  h.faux.setResponses([call("memory_search", { query: "oversizedpayload" }), context => {
    page = JSON.parse(context.messages.findLast(message => message.role === "toolResult")!.content[0].text);
    return fauxAssistantMessage("Read the record structurally by ID.");
  }]);
  try {
    await h.session.prompt("Find the oversized record.");
    expect(page!.complete).toBe(true); expect(page!.primaryCandidates).toBe(1);
    expect(page!.items[0].id).toBe(saved.record.id); expect(page!.items[0].hash).toBe(saved.hash);
    expect(page!.items[0].recordComplete).toBe(false); expect(page!.items[0]).not.toHaveProperty("record");
    expect(readLedger(h.locations.projectDir!).records[0].content).toBe(saved.record.content);
    expect(fs.readFileSync(ledgerPath(h.locations.projectDir!))).toEqual(before);
  } finally { h.session.dispose(); }
});

test("global discovery and optional current evidence survive corrupt project storage and malformed focus", async () => {
  const original = await harness(); let evidenceId = "";
  original.faux.setResponses([context => { evidenceId = sourceId(context); return call("memory_evidence", { evidenceId }); },
    () => call("memory_write", { scope: "global", topic: "writing", route: "Status style", content: "Prefer uniquefocus concise status reports.",
      kind: "preference", evidenceId, quote: "Prefer uniquefocus concise status reports." }), fauxAssistantMessage("Saved.")]);
  try { await original.session.prompt("Prefer uniquefocus concise status reports."); } finally { original.session.dispose(); }
  const record = readLedger(original.locations.globalDir).records[0];
  fs.mkdirSync(original.locations.projectDir!, { recursive: true }); fs.writeFileSync(ledgerPath(original.locations.projectDir!), "broken ledger");
  const sourceFile = record.evidence.source!.file!, sourceBytes = fs.readFileSync(sourceFile);
  const later = await harness(() => {}, original.root);
  try {
    for (const malformed of [false, true]) {
      if (malformed) later.manager.appendCustomEntry("memory-focus-v1", { path: "relative", projectId: "invalid" });
      let current = "";
      later.faux.setResponses([context => { current = sourceId(context); return call("memory_search", { query: "uniquefocus" }); },
        () => call("memory_evidence", { evidenceId: current }),
        call("memory_read", { scope: "global", id: record.id }), fauxAssistantMessage("Global memory remains usable; project coverage is unavailable.")]);
      const start = later.session.messages.length;
      await later.session.prompt("Find the remembered report preference and inspect its source.");
      const results = later.session.messages.slice(start).filter(message => message.role === "toolResult");
      expect(results).toHaveLength(3);
      expect(results.every(message => message.role === "toolResult" && !message.isError)).toBe(true);
      const search = JSON.parse(JSON.stringify(results[0])).details;
      expect(search.items[0].id).toBe(record.id); expect(search.coverageComplete).toBe(false);
      expect(search.unavailableScopes).toHaveLength(1); expect(search.unavailableScopes[0].scope).toBe("project");
      expect(JSON.stringify(results[1])).toContain("Find the remembered report preference");
      expect(JSON.parse(JSON.stringify(results[1])).details.view).toBe("conversation");
      expect(fs.readFileSync(sourceFile)).toEqual(sourceBytes);
    }
    expect(fs.readFileSync(ledgerPath(original.locations.projectDir!), "utf8")).toBe("broken ledger");
  } finally { later.session.dispose(); }
});

test("personal registration has no migration command, settlement scheduler or learner-only tools", () => {
  const events: string[] = [], names: string[] = [], commands: string[] = [];
  registerPersonalMemory({
    on: name => { events.push(name); },
    registerTool: tool => { names.push(tool.name); },
    registerCommand: name => { commands.push(name); },
  } as never);
  expect(commands).toEqual([]);
  expect(events).toEqual(["session_start", "session_tree", "input", "tool_result", "context_with_system"]);
  expect(names).toEqual(["memory_focus", "memory_evidence", "memory_write", "memory_read",
    "memory_search", "memory_forget", "memory_restore", "memory_status", "scratchpad"]);
});

test("personal main-agent guidance and legacy receipts add no idle, reload or navigation requests", async () => {
  process.env.PI_MEMORY_AUTO_CAPTURE = "1";
  const h = await harness(() => {}, undefined, registerPersonalMemory);
  const first = h.manager.appendCustomEntry("memory-learning-boundary-v1", { malformedOldJob: true });
  h.manager.appendCustomEntry("memory-learning-receipt-v1", { oldReceipt: "historical-only" });
  const history = structuredClone(h.manager.getBranch());
  let payload = "";
  h.faux.setResponses([
    context => { payload = JSON.stringify(context.messages); return fauxAssistantMessage("Answered the ordinary task."); },
    context => { payload = JSON.stringify(context.messages); return fauxAssistantMessage("Explicit-only mode."); },
  ]);
  try {
    expect(h.faux.state.callCount).toBe(0);
    await h.session.prompt("Explain what a closure is.");
    expect(payload).toContain("Learn autonomously through the memory tools");
    expect(payload).not.toContain("Do not add learning-only work to the foreground");
    expect(h.faux.state.callCount).toBe(1);
    await new Promise<void>(resolve => setImmediate(resolve));
    await h.session.reload();
    await h.session.navigateTree(first, { summarize: false });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(h.faux.state.callCount).toBe(1);
    for (const original of history) expect(h.manager.getEntry(original.id)).toEqual(original);
    process.env.PI_MEMORY_AUTO_CAPTURE = "0";
    await h.session.prompt("Another ordinary question.");
    expect(payload).toContain("Autonomous learning disabled. Save only when explicitly requested.");
    expect(h.faux.state.callCount).toBe(2);
    expect(readLedger(h.locations.globalDir).records).toEqual([]);
    expect(readLedger(h.locations.projectDir!).records).toEqual([]);
  } finally { h.session.dispose(); }
});

test("a settled decision can be saved in the ordinary work batch without an inspection request", async () => {
  let artifact = "";
  const h = await harness(pi => pi.registerTool({ name: "write_plan", label: "Plan", description: "Fixture work", parameters: Type.Object({ content: Type.String() }),
    async execute(_id, params) { artifact = params.content; return { content: [{ type: "text" as const, text: "Plan written." }], details: {} }; } }));
  h.faux.setResponses([context => fauxAssistantMessage([
    fauxToolCall("write_plan", { content: "Recipient-local weekdays. New audiences get a first-report baseline." }),
    fauxToolCall("memory_write", { scope: "project", topic: "reports", route: "Recurring report planning", content: "Recipient-local weekdays; new audiences get a first-report baseline for continuity.",
      kind: "decision", evidenceId: sourceId(context), quote: "Recipient-local weekdays; new audiences get a first-report baseline for continuity." }),
  ], { stopReason: "toolUse" }), fauxAssistantMessage("Work and decision saved.")]);
  try {
    await h.session.prompt("Recipient-local weekdays; new audiences get a first-report baseline for continuity. Write the plan.");
    expect(h.faux.state.callCount).toBe(2); expect(artifact).toContain("first-report baseline");
    expect(readLedger(h.locations.projectDir!).records[0].content).toContain("for continuity");
    const results = h.session.messages.filter(message => message.role === "toolResult");
    expect(results.map(message => message.toolName).sort()).toEqual(["memory_write", "write_plan"]);
    expect(results.every(message => !message.isError)).toBe(true);
    expect(JSON.stringify(results.find(message => message.toolName === "memory_write")).length).toBeLessThan(1000);
  } finally { h.session.dispose(); }
});

test("optional current readers keep their span and unitization across continuations without authorizing writes", async () => {
  const h = await harness(); h.faux.setResponses([fauxAssistantMessage("Initial orientation.")]);
  try {
    await h.session.prompt("Initial orientation.");
    const text = Array.from({ length: 45 }, (_, i) => `Qualification ${i}. ${"Recipient continuity matters. ".repeat(12)}\n\n`).join("");
    const sourceEntry = h.manager.appendCustomEntry(SOURCE_ENTRY, { type: "input", origin: "interactive", text, originProject: h.locations.project!.id });
    h.manager.appendMessage(fauxAssistantMessage("Do not drop a qualification."));
    const evidenceId = `${h.manager.getSessionId()}:${sourceEntry}`, service = new MemorySession();
    const tool = memoryOperations(service).find(tool => tool.name === "memory_evidence")!;
    let budget = 2000;
    const ctx = { cwd: h.cwd, sessionManager: h.manager, getContextUsage: () => ({ contextWindow: budget, tokens: 0 }), model: { maxTokens: 0 } } as never;
    const first = await tool.execute("initial", { evidenceId }, undefined, ctx);
    expect(first.isError).not.toBe(true);
    const initial = first.details as any; expect(initial.complete).toBe(false);
    const reading = JSON.parse(Buffer.from(initial.nextCursor, "base64url").toString("utf8")).reading;
    const inspected = service.evidence.inspect(h.manager, evidenceId, { anchorId: reading.anchorId, fromEntryId: reading.fromEntryId });
    const expected = [...structuralUnits({ source: inspected.source, citation: inspected.citation }, "source", reading.unitBudget),
      ...inspected.rawContext.map(conversationalEntry).flatMap((entry, index) => structuralUnits(entry, `context:${inspected.rawContext[index].id}`, reading.unitBudget))];
    const received = [...initial.items]; let cursor = initial.nextCursor, pages = 1;
    while (cursor) {
      h.manager.appendMessage(fauxAssistantMessage("Another reading call appended, not part of the frozen span."));
      budget = pages % 2 ? 2800 : 2200;
      const response = await tool.execute(`page-${pages}`, { evidenceId, cursor }, undefined, ctx);
      expect(response.isError).not.toBe(true);
      const page = response.details as any; expect(tokenEstimate(page)).toBeLessThanOrEqual(budget);
      expect(page.snapshot).toBe(initial.snapshot); received.push(...page.items); cursor = page.nextCursor; pages++;
    }
    expect(received).toEqual(expected); expect(pages).toBeGreaterThan(1);
    const latest = h.manager.getLeafId()!;
    expect(service.evidence.evidence(h.manager, evidenceId, "Qualification 0", "decision").source?.anchorId).toBe(latest);
    const mismatched = await tool.execute("different-view", { evidenceId, cursor: initial.nextCursor, view: "raw" }, undefined, ctx);
    expect(mismatched.isError).toBe(true); expect(JSON.stringify(mismatched)).toContain("Results changed");
    h.manager.branch(sourceEntry);
    const offBranch = await tool.execute("branch-changed", { evidenceId, cursor: initial.nextCursor }, undefined, ctx);
    expect(offBranch.isError).toBe(true);
  } finally { h.session.dispose(); }
});
