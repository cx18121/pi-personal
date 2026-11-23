import type { SessionEntry, ExtensionContext, ToolResultEvent, ProjectedSessionEntry } from "@earendil-works/pi-coding-agent";
import type { Evidence, MemoryKind, SourceCitation } from "./ledger.js";
import { fingerprint } from "./admission.js";

export const SOURCE_ENTRY = "memory-source-v2";
export interface ObservedInput { type: "input"; origin: "interactive" | "rpc"; text: string; originProject: string | null }
export interface NestedResult { type: "nested-tool"; toolName: string; toolCallId: string; parentToolCallId: string; input: unknown; content: unknown; details: unknown; isError: boolean; originProject: string | null }
type ReadonlySessionManager = ExtensionContext["sessionManager"];
export interface LearningSource { id: string; entryId: string; actor: "user" | "tool"; text: string; observedAt: string; originProject: string | null; context: unknown }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.filter(part => object(part) && part.type === "text" && typeof part.text === "string").map(part => (part as { text: string }).text).join("\n") : "";
}

/** Only committed selections and typed notes are requester evidence. Authored
 * questions/options/previews are retained as context, never as an answer. */
export function questionnaireAnswers(details: unknown, input: unknown): string | undefined {
  if (!object(details) || details.cancelled !== false || !Array.isArray(details.answers)
    || !object(input) || !Array.isArray(input.questions) || !details.answers.length) return undefined;
  const text: string[] = [];
  const seen = new Set<number>();
  for (const item of details.answers) {
    if (!object(item) || !Number.isSafeInteger(item.questionIndex)) return undefined;
    const index = item.questionIndex as number, question = input.questions[index];
    if (seen.has(index) || !object(question) || item.question !== question.question || !Array.isArray(question.options)) return undefined;
    seen.add(index);
    const labels = question.options.filter(object).map(option => option.label);
    if (item.kind === "option" && typeof item.answer === "string" && labels.includes(item.answer)) text.push(item.answer);
    else if (item.kind === "custom" && typeof item.answer === "string" && item.answer.trim()) text.push(item.answer);
    else if (item.kind === "multi" && question.multiSelect === true && Array.isArray(item.selected)
      && item.selected.length && item.selected.every(label => typeof label === "string" && labels.includes(label))) text.push(...item.selected as string[]);
    else return undefined;
    if (typeof item.notes === "string") text.push(item.notes);
  }
  if (seen.size !== input.questions.length) return undefined;
  if (typeof details.globalNote === "string") text.push(details.globalNote);
  return text.filter(Boolean).join("\n") || undefined;
}

export function nestedSupplement(event: ToolResultEvent, originProject: string | null): NestedResult | undefined {
  if (!event.parentToolCallId || event.toolName.startsWith("memory_") || event.toolName === "scratchpad") return undefined;
  return { type: "nested-tool", toolName: event.toolName, toolCallId: event.toolCallId, parentToolCallId: event.parentToolCallId,
    input: event.input, content: event.content, details: event.details, isError: event.isError, originProject };
}
function callArguments(branch: SessionEntry[], callId: string) {
  for (const entry of [...branch].reverse()) if (entry.type === "message" && entry.message.role === "assistant") {
    const call = entry.message.content.find(part => part.type === "toolCall" && part.id === callId);
    if (call?.type === "toolCall") return call.arguments;
  }
  return undefined;
}
function sourceAt(branch: SessionEntry[], entry: SessionEntry, sessionId: string): LearningSource | undefined {
  const base = { id: `${sessionId}:${entry.id}`, entryId: entry.id, observedAt: entry.timestamp };
  if (entry.type === "custom" && entry.customType === SOURCE_ENTRY && object(entry.data)) {
    const data = entry.data;
    if (data.type === "input" && ["interactive", "rpc"].includes(String(data.origin)) && typeof data.text === "string" && data.text.trim()
      && (data.originProject === null || typeof data.originProject === "string")) {
      return { ...base, actor: "user", text: data.text, originProject: data.originProject as string | null,
        context: { observedSubmission: data, binding: "Observed input at this position. No one-to-one persisted-user-message binding is asserted." } };
    }
    if (data.type === "nested-tool" && typeof data.toolName === "string" && typeof data.toolCallId === "string" && typeof data.parentToolCallId === "string" && typeof data.isError === "boolean") {
      const answer = data.toolName === "ask_user_question" && !data.isError ? questionnaireAnswers(data.details, data.input) : undefined;
      if (data.toolName === "ask_user_question" && !answer) return undefined;
      const text = answer ?? textContent(data.content);
      if (text.trim()) return { ...base, actor: answer ? "user" : "tool", text, originProject: typeof data.originProject === "string" ? data.originProject : null, context: data };
    }
  }
  if (entry.type === "message" && entry.message.role === "toolResult") {
    const message = entry.message;
    if (message.toolName.startsWith("memory_") || message.toolName === "scratchpad") return undefined;
    const input = callArguments(branch.slice(0, branch.findIndex(item => item.id === entry.id)), message.toolCallId);
    const answer = message.toolName === "ask_user_question" && !message.isError ? questionnaireAnswers(message.details, input) : undefined;
    if (message.toolName === "ask_user_question" && !answer) return undefined;
    const text = answer ?? textContent(message.content);
    if (text.trim()) return { ...base, actor: answer ? "user" : "tool", text, originProject: null, context: { input, result: message } };
  }
  // Persisted user messages do not retain input provenance. They remain context,
  // not an invented authenticated source of preferences.
  return undefined;
}
function anchoredBranch(entries: SessionEntry[], anchor: string) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const branch: SessionEntry[] = [], seen = new Set<string>();
  let id: string | null = anchor;
  while (id) {
    if (seen.has(id)) throw new Error("Source ancestry contains a cycle.");
    seen.add(id);
    const entry = byId.get(id);
    if (!entry) throw new Error("Source ancestry is missing an entry.");
    branch.push(entry); id = entry.parentId;
  }
  return branch.reverse();
}
function span(branch: SessionEntry[], citation: Pick<SourceCitation, "entryId" | "fromEntryId">) {
  const index = branch.findIndex(entry => entry.id === citation.entryId);
  if (index < 0) throw new Error("Source is not an ancestor of the context anchor.");
  const from = citation.fromEntryId ? branch.findIndex(entry => entry.id === citation.fromEntryId) : 0;
  if (from < 0 || from > index) throw new Error("Invalid source-context start.");
  return branch.slice(from);
}
function sourceHash(source: LearningSource, context: SessionEntry[]) {
  return fingerprint({ source, context });
}

export interface SourceInspection {
  source: LearningSource;
  citation: SourceCitation;
  rawContext: SessionEntry[];
  projectedContext: ProjectedSessionEntry[];
  earlierContext: Array<{ id: string; type: string; timestamp: string }>;
}
export class SessionEvidence {
  list(manager: ReadonlySessionManager) {
    const branch = manager.getBranch(), sessionId = manager.getSessionId();
    return branch.flatMap(entry => { const source = sourceAt(branch, entry, sessionId); return source ? [source] : []; });
  }
  inspect(manager: ReadonlySessionManager, id: string, options: { fromEntryId?: string; anchorId?: string } = {}): SourceInspection {
    const sessionId = manager.getSessionId(), file = manager.getSessionFile();
    // A reader cursor may anchor an earlier span, but only on current ancestry.
    // Writes omit anchorId and always capture fresh write-time provenance.
    const anchorId = options.anchorId ?? manager.getLeafId() ?? "";
    const branch = anchoredBranch(manager.getBranch(), anchorId);
    const source = branch.flatMap(entry => { const value = sourceAt(branch, entry, sessionId); return value?.id === id ? [value] : []; })[0];
    if (!source) throw new Error("Evidence unavailable on the current session branch or not an authorized source type. Historical inspection is not supported.");
    const position = branch.findIndex(entry => entry.id === source.entryId);
    const previous = branch.slice(0, position).findLast(entry => entry.type === "custom" && entry.customType === SOURCE_ENTRY && object(entry.data) && entry.data.type === "input");
    const minimum = previous?.id ?? branch[0]?.id;
    const fromEntryId = options.fromEntryId ?? minimum;
    if (fromEntryId && branch.findIndex(entry => entry.id === fromEntryId) > branch.findIndex(entry => entry.id === minimum)) throw new Error("Context may be expanded earlier, not narrowed past the relevant exchange.");
    const context = span(branch, { entryId: source.entryId, fromEntryId });
    const citation: SourceCitation = { sessionId, ...(file ? { file } : {}), entryId: source.entryId, anchorId, ...(fromEntryId ? { fromEntryId } : {}), hash: sourceHash(source, context) };
    return structuredClone({ source, citation, rawContext: context,
      projectedContext: manager.buildSessionProjection().entries.filter(entry => context.some(raw => raw.id === entry.sourceEntry.id)),
      earlierContext: branch.slice(0, branch.length - context.length).map(entry => ({ id: entry.id, type: entry.type, timestamp: entry.timestamp })) });
  }
  /** The newest requester source on the current branch that contains the exact quote.
   * Corrections are often saved a few turns after they were said. */
  resolveQuote(manager: ReadonlySessionManager, quote: string): string | undefined {
    if (!quote.trim()) return undefined;
    return this.list(manager).findLast(source => source.actor === "user" && source.text.includes(quote))?.id;
  }
  evidence(manager: ReadonlySessionManager, id: string, quote: string, kind: Exclude<MemoryKind, "legacy">, fromEntryId?: string): Evidence {
    const { source, citation } = this.inspect(manager, id, { fromEntryId });
    if (!quote.trim() || !source.text.includes(quote)) throw new Error(`Quote is not an exact substring of evidence ${id}. Copy one contiguous span verbatim from a single source, without stitching, trimming or tool wrapper text.`);
    if (kind !== "fact" && source.actor !== "user") throw new Error("Preferences and settled decisions require requester evidence.");
    return { actor: source.actor, reference: source.id, quote, observedAt: source.observedAt, source: citation };
  }
}

/** Conversational content, not a second transcript. Preserve substantive native
 * fields and ordinary tool details; only typed execution machinery is omitted.
 * The original entry IDs remain available through explicit raw inspection. */
export function conversationalEntry(entry: SessionEntry): unknown {
  if (entry.type !== "message") return entry;
  const message = entry.message;
  if (message.role === "assistant") return { ...entry, message: { role: message.role,
    content: message.content.filter(part => part.type !== "thinking"), stopReason: message.stopReason,
    ...(message.errorMessage ? { errorMessage: message.errorMessage } : {}) } };
  if (message.role === "system") {
    const { toolsAdded: _declarations, ...context } = message;
    return { ...entry, message: context };
  }
  if (message.role === "toolResult") {
    const { role, toolCallId, toolName, content, details, isError } = message;
    if (toolName === "memory_evidence" && !isError) return { ...entry, message: { role, toolCallId, toolName, isError,
      omitted: "Prior memory inspection payload. Its native entry is available through raw view; do not recursively replay it." } };
    return { ...entry, message: { role, toolCallId, toolName, content, details, isError } };
  }
  return entry;
}

export const LEARNING_POLICY = [
  "Memory is context, not authority. Current instructions, code, and docs override it. Verify mutable facts before consequential use.",
  "Recall with memory_search using a short task query when remembered context could change the work, then memory_read by ID for tied or oversized results (or browse a topic if search misses). Skip scopes reported empty.",
  "Save explicit lasting preferences, settled decisions, and verified gotchas from current-session evidence with their conditions and rationale. Keep each record scoped to what was actually established, never saving one-task exceptions, guesses, or assistant proposals. Replace superseded records by ID and expectedHash.",
  "Reserve standing memory for explicit user preferences that apply without a task cue. Do not duplicate maintained code, docs, AGENTS.md, or skills. Keep project status in trackers or handoffs and unfinished work in scratchpad. Use memory_focus when the task repo differs from the workspace.",
].join("\n");
