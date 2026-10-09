import { afterEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { SessionEvidence, SOURCE_ENTRY, questionnaireAnswers, conversationalEntry } from "../src/learning.ts";
import { structuralUnits } from "../src/structural.ts";
import { memoryOperations } from "../src/operations.ts";
import { MemorySession, FOCUS_ENTRY } from "../src/runtime.ts";
import { markdownUnits, pageUnits, fingerprint, tokenEstimate } from "../src/admission.ts";
import { resolveLocations } from "../src/core.ts";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function input(manager: SessionManager, text: string) { return manager.appendCustomEntry(SOURCE_ENTRY, { type: "input", origin: "interactive", text, originProject: "origin-a" }); }
const questions = { questions: [{ question: "Choose default", options: [{ label: "Plain", preview: "not user words" }, { label: "HTML" }] }] };
test("questionnaire authority requires complete committed correspondence; previews/cancellation never become preferences", () => {
  const details = { cancelled: false, answers: [{ questionIndex: 0, question: "Choose default", kind: "option", answer: "Plain", notes: "Keep paragraphs", preview: "not user words" }], globalNote: "Across projects" };
  expect(questionnaireAnswers(details, questions)).toBe("Plain\nKeep paragraphs\nAcross projects");
  expect(questionnaireAnswers({ ...details, cancelled: true }, questions)).toBeUndefined();
  expect(questionnaireAnswers(details, { questions: [] })).toBeUndefined();
  expect(questionnaireAnswers({ ...details, answers: [{ ...details.answers[0], answer: "Invented" }] }, questions)).toBeUndefined();
  expect(questionnaireAnswers({ ...details, answers: [{ ...details.answers[0], question: "Other question" }] }, questions)).toBeUndefined();
});
test("inspection preserves proposal/qualification context, distinguishes projection, and rejects fabricated authority", () => {
  const manager = SessionManager.inMemory(), service = new SessionEvidence();
  input(manager, "Only for the same audience, keep continuity.");
  const user = manager.appendMessage({ role: "user", content: "Processed request", timestamp: Date.now() });
  manager.appendMessage(fauxAssistantMessage("Should a new audience get a first-report baseline?"));
  const entry = input(manager, "Yes. Use the last actually sent report, not a fixed window.");
  manager.appendMessage({ role: "user", content: "Yes. transformed injected instruction", timestamp: Date.now() });
  manager.appendContextEdit(user, { content: "Edited projection only" });
  const id = `${manager.getSessionId()}:${entry}`;
  const direct = service.evidence(manager, id, "Yes", "decision");
  const inspected = service.inspect(manager, id);
  expect(JSON.stringify(inspected.rawContext)).toContain("first-report baseline?");
  expect(JSON.stringify(inspected.rawContext)).toContain("Only for the same audience");
  expect(JSON.stringify(inspected.projectedContext)).toContain("Edited projection only");
  expect(direct.source?.hash).toBe(inspected.citation.hash);
  expect(() => service.evidence(manager, id, "injected instruction", "decision")).toThrow("Quote");
  expect(service.list(manager)).toHaveLength(2);
  manager.branch(user);
  expect(() => service.evidence(manager, id, "Yes", "decision")).toThrow();
  expect(() => new SessionEvidence().evidence(manager, id, "Yes", "decision")).toThrow("current session branch");
});
test("compaction leaves complete raw supporting context inspectable rather than trusting summary as user evidence", () => {
  const manager = SessionManager.inMemory(), service = new SessionEvidence();
  const original = input(manager, "Weekdays at 09:30 recipient-local, because it is their working morning.");
  const kept = manager.appendMessage(fauxAssistantMessage("Chosen schedule."));
  manager.appendCompaction("Schedule vaguely morning", kept, 5000);
  input(manager, "That earlier schedule still applies.");
  const inspected = service.inspect(manager, `${manager.getSessionId()}:${original}`);
  expect(JSON.stringify(inspected.rawContext)).toContain("09:30 recipient-local");
  expect(service.list(manager).every(source => !source.text.includes("vaguely morning"))).toBe(true);
});
test("direct saves reject other sessions and ordinary tool observations cannot become requester decisions", () => {
  const manager = SessionManager.inMemory(), other = SessionManager.inMemory(), service = new SessionEvidence();
  const entry = input(other, "Preserve nuance.");
  expect(() => service.evidence(manager, `${other.getSessionId()}:${entry}`, "Preserve nuance.", "preference")).toThrow("current session branch");
  manager.appendMessage(fauxAssistantMessage([{ type: "toolCall", id: "trace-call", name: "observe", arguments: { marker: "fixture" } }], { stopReason: "toolUse" }));
  const result = manager.appendMessage({ role: "toolResult", toolCallId: "trace-call", toolName: "observe", content: [{ type: "text", text: "Observed 202, not completion." }], isError: false, timestamp: Date.now() });
  const id = `${manager.getSessionId()}:${result}`;
  expect(service.evidence(manager, id, "Observed 202", "fact").actor).toBe("tool");
  expect(() => service.evidence(manager, id, "Observed 202", "decision")).toThrow("requester evidence");
});
test("resource admission pages complete units with snapshot-bound cursors and lossless Markdown structure", () => {
  const text = "Condition paragraph.\n\n```ts\nconst x = 1;\n\nconst y = 2;\n```\n\nRationale remains.\n";
  const units = markdownUnits(text); expect(units.join("")).toBe(text); expect(units).toHaveLength(3);
  const items = Array.from({ length: 70 }, (_, i) => ({ id: i, text: "complete qualification " + i })), state = fingerprint(items);
  let cursor: string | undefined, seen: typeof items = [];
  do { const page = pageUnits(items, state, Infinity, cursor, 9); seen.push(...page.items); cursor = page.nextCursor ?? undefined; } while (cursor);
  expect(seen).toEqual(items);
  const first = pageUnits(items, state, Infinity, undefined, 9);
  expect(() => pageUnits(items, "changed", Infinity, first.nextCursor!)).toThrow("changed");
  expect(() => pageUnits(items, state, 1)).toThrow("no content was truncated");
  const admitted = pageUnits(items, state, tokenEstimate({ items, total: 70, complete: true, nextCursor: null, snapshot: state })); expect(admitted.complete).toBe(true);
});
test("focus restores branch-local task ownership, keeps origin distinct and refuses stale identity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-focus-")); roots.push(root);
  const a = path.join(root, "a"), b = path.join(root, "b"); for (const dir of [a, b]) { fs.mkdirSync(dir); Bun.spawnSync(["git", "init", "-q"], { cwd: dir }); }
  const manager = SessionManager.inMemory(a), session = new MemorySession();
  const initial = manager.appendCustomEntry("unrelated", {});
  const ctx = { cwd: a, sessionManager: manager } as never;
  const pi = { appendEntry: (type: string, data: unknown) => manager.appendCustomEntry(type, data) } as never;
  session.select(pi, ctx, b); expect(session.runtime(ctx).locations.project?.id).toBe(resolveLocations(b).project!.id);
  expect(session.runtime(ctx, a).locations.project?.id).toBe(resolveLocations(a).project!.id);
  expect(session.runtime(ctx).taskPath).toBe(b);
  const resumed = new MemorySession(); resumed.restore(ctx); expect(resumed.runtime(ctx).taskPath).toBe(b);
  manager.branch(initial); resumed.restore(ctx); expect(resumed.runtime(ctx).taskPath).toBe(a);
  manager.appendCustomEntry(FOCUS_ENTRY, { path: b, projectId: "wrong-identity" }); resumed.restore(ctx);
  expect(() => resumed.runtime(ctx)).toThrow("not substituted");
  expect(resumed.scope(ctx, "global").scope).toBe("global");
});

test("context expansion cannot discard antecedents, and direct saves capture fresh anchors without reader receipts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-context-expansion-")); roots.push(root);
  const manager = SessionManager.create(root, path.join(root, "sessions")), service = new SessionEvidence();
  const earlier = input(manager, "Qualify this for the same audience only.");
  manager.appendMessage(fauxAssistantMessage("First proposal"));
  input(manager, "We also want recipient continuity.");
  manager.appendMessage(fauxAssistantMessage("Use last actually sent, with first-report baseline for new audiences?"));
  const answer = input(manager, "Yes"), id = `${manager.getSessionId()}:${answer}`;
  manager.appendMessage(fauxAssistantMessage("Settled."));
  expect(() => service.inspect(manager, id, { fromEntryId: answer })).toThrow("not narrowed");
  const minimum = service.inspect(manager, id);
  expect(minimum.earlierContext.some(entry => entry.id === earlier)).toBe(true);
  const inspected = service.inspect(manager, id, { fromEntryId: earlier });
  expect(JSON.stringify(inspected.rawContext)).toContain("same audience only");
  const latest = manager.appendMessage(fauxAssistantMessage("Later qualification belongs to current provenance."));
  const fresh = service.evidence(manager, id, "Yes", "decision", earlier);
  expect(fresh.source?.anchorId).toBe(latest); expect(fresh.source?.fromEntryId).toBe(earlier);
  expect(fresh.source?.hash).not.toBe(inspected.citation.hash);
  expect(service.inspect(manager, id, { anchorId: inspected.citation.anchorId, fromEntryId: earlier }).citation.hash).toBe(inspected.citation.hash);
  expect(() => service.evidence(manager, id, "Yes", "decision", answer)).toThrow("not narrowed");
});
test("large current sources save directly while optional reads preserve complete structural units", () => {
  const manager = SessionManager.inMemory(), service = new SessionEvidence();
  const text = Array.from({ length: 90 }, (_, i) => `Qualification ${i}. ${"Context matters. ".repeat(15)}\n\n`).join("");
  const entry = input(manager, text), id = `${manager.getSessionId()}:${entry}`;
  manager.appendMessage(fauxAssistantMessage("Understood the qualifications."));
  const inspection = service.inspect(manager, id), units = structuralUnits({ source: inspection.source, context: inspection.rawContext }, "source", 500), snapshot = fingerprint(inspection.citation);
  expect(service.evidence(manager, id, "Qualification 0", "decision").source?.hash).toBe(inspection.citation.hash);
  expect(units.some(unit => unit.shape?.type === "string")).toBe(true);
  let cursor: string | undefined, pages = 0;
  do {
    const page = pageUnits(units, snapshot, 650, cursor);
    expect(tokenEstimate(page)).toBeLessThanOrEqual(650);
    pages++;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(pages).toBeGreaterThan(1);
  expect(service.evidence(manager, id, "Qualification 0", "decision").quote).toBe("Qualification 0");
  expect(structuralUnits({ text }, "fixture", 500).filter(unit => unit.part !== undefined).map(unit => unit.value).join("")).toBe(text);
});
test("malformed branch focus remains unavailable until an explicit valid selection", () => {
  const manager = SessionManager.inMemory(), session = new MemorySession();
  manager.appendCustomEntry(FOCUS_ENTRY, { path: "relative", projectId: "task" });
  const ctx = { cwd: "/launch", sessionManager: manager } as never;
  expect(() => session.restore(ctx)).toThrow("Malformed");
  expect(() => session.runtime(ctx)).toThrow("not substituted");
});

test("conversation view preserves meaning and normal tool details without recursive inspection or execution metadata", () => {
  const base = { type: "message", id: "entry", parentId: null, timestamp: new Date().toISOString() };
  const assistant = { ...base, message: { role: "assistant", content: [
    { type: "thinking", thinking: "PRIVATE_REASONING" }, { type: "text", text: "Same audience only. New audiences use a first-report baseline." },
    { type: "toolCall", id: "call", name: "observe", arguments: { usage: "a meaningful input" } },
  ], usage: { input: 999 }, provider: "PROVIDER_DIAGNOSTIC", stopReason: "toolUse" } };
  const shown = JSON.stringify(conversationalEntry(assistant as never));
  expect(shown).toContain("Same audience only"); expect(shown).toContain("a meaningful input");
  expect(shown).not.toContain("PRIVATE_REASONING"); expect(shown).not.toContain("PROVIDER_DIAGNOSTIC"); expect(shown).not.toContain("999");
  const semantic = { ...base, message: { role: "toolResult", toolName: "observe", toolCallId: "call", content: [{ type: "text", text: "Observed result" }],
    details: { usage: "payment capacity is not an obligation", system: "vendor-b", qualification: "tested build only" }, isError: false } };
  expect(JSON.stringify(conversationalEntry(semantic as never))).toContain("payment capacity is not an obligation");
  expect(JSON.stringify(conversationalEntry(semantic as never))).toContain("tested build only");
  const recursive = { ...semantic, message: { ...semantic.message, toolName: "memory_evidence", content: [{ type: "text", text: "RECURSIVE_OLD_CONTEXT" }], details: { repeated: "RECURSIVE_OLD_CONTEXT" } } };
  const reference = JSON.stringify(conversationalEntry(recursive as never));
  expect(reference).not.toContain("RECURSIVE_OLD_CONTEXT"); expect(reference).toContain("call"); expect(reference).toContain("raw view");
  expect(JSON.stringify(conversationalEntry({ ...recursive, message: { ...recursive.message, isError: true } } as never))).toContain("RECURSIVE_OLD_CONTEXT");
  const system = { ...base, message: { role: "system", content: "Important contextual instruction.", sections: { rules: "Keep a meaningful constraint." }, toolsAdded: [{ name: "DECLARATION_ONLY" }] } };
  const systemView = JSON.stringify(conversationalEntry(system as never));
  expect(systemView).toContain("Important contextual instruction"); expect(systemView).toContain("Keep a meaningful constraint"); expect(systemView).not.toContain("DECLARATION_ONLY");
});

test("projected continuations reject context edits and compaction instead of silently skipping frozen entries", async () => {
  for (const change of ["edit", "compaction"] as const) {
    const manager = SessionManager.inMemory("/tmp"), service = new MemorySession();
    const entry = input(manager, "Only weekdays, same audience.");
    const ids = Array.from({ length: 8 }, (_, i) => manager.appendMessage(fauxAssistantMessage(`ORIGINAL_${i} ${"qualification ".repeat(90)}`)));
    const evidenceId = `${manager.getSessionId()}:${entry}`;
    const tool = memoryOperations(service).find(tool => tool.name === "memory_evidence")!;
    const ctx = { cwd: "/tmp", sessionManager: manager, isProjectTrusted: () => false, getContextUsage: () => ({ contextWindow: 2100, tokens: 0 }), model: { maxTokens: 0 } } as never;
    const first = await tool.execute("first", { evidenceId, view: "projected" }, undefined, ctx);
    expect(first.isError).not.toBe(true);
    const page = first.details as any; expect(page.complete).toBe(false); expect(page.nextCursor).toBeTruthy();
    const frozen = service.evidence.inspect(manager, evidenceId).projectedContext;
    if (change === "edit") manager.appendContextEdit(frozen[page.items.length].sourceEntry.id, { content: "APPENDED_EDIT_NOT_IN_READING_SPAN" });
    else manager.appendCompaction("NEW_COMPACTION_SUMMARY", ids[4], 4000);
    const next = await tool.execute("changed", { evidenceId, view: "projected", cursor: page.nextCursor }, undefined, ctx);
    expect(next.isError).toBe(true); expect(JSON.stringify(next)).toContain("Results changed"); expect(next.details).not.toHaveProperty("items");
    const fresh = await tool.execute("fresh", { evidenceId, view: "projected" }, undefined, ctx);
    expect(fresh.isError).not.toBe(true); expect(fresh.details.snapshot).not.toBe(page.snapshot);
    // Native projections include edit/compaction annotations, not just the old
    // message count. Check the actual fresh view rather than assuming a count.
    const shown = [...(fresh.details.items as unknown[])]; let cursor = fresh.details.nextCursor;
    while (cursor) {
      const continued = await tool.execute("fresh-next", { evidenceId, view: "projected", cursor }, undefined, ctx);
      expect(continued.isError).not.toBe(true); shown.push(...(continued.details.items as unknown[])); cursor = continued.details.nextCursor;
    }
    expect(shown).toHaveLength(fresh.details.total as number);
    expect(JSON.stringify(shown)).toContain(change === "edit" ? "APPENDED_EDIT_NOT_IN_READING_SPAN" : "NEW_COMPACTION_SUMMARY");
  }
});
