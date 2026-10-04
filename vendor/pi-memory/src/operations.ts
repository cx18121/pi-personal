import { StringEnum, Type, validateToolArguments, type Static, type Tool, type JsonObject } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { assertMemoryMutationPermission, assertScratchpadPermission, mutateChecklist, scratchpadFilePath } from "./core.js";
import { archiveRecord, assertSafePath, currentRecords, ledgerPath, lookupLedgers, readLedger, readRecoveries, recordCue, recordHash, restoreRecord, saveRecord } from "./ledger.js";
import { conversationalEntry } from "./learning.js";
import { structuralUnits } from "./structural.js";
import { MemorySession } from "./runtime.js";
import { fingerprint, markdownUnits, pageUnits, responseBudget, tokenEstimate } from "./admission.js";
import { searchSources } from "./search.js";

export const scopeSchema = Type.Optional(StringEnum(["global", "project"] as const));
const projectPathSchema = Type.Optional(Type.String({ description: "Explicit one-off task repository. Does not change task focus. Root agents only." }));
const cursorSchema = Type.Optional(Type.String({ description: "Opaque continuation for this exact query/scope/snapshot. Changed state requires a fresh lookup." }));
export const result = (text: string, details: Record<string, unknown> = {}) => ({ content: [{ type: "text" as const, text }], details });
export const jsonResult = (value: Record<string, unknown>) => result(JSON.stringify(value), value);
export const errorResult = (error: unknown) => ({ ...result(`Memory error: ${error instanceof Error ? error.message : String(error)}`), isError: true });
type Result = ReturnType<typeof result> & { isError?: boolean };
export interface MemoryOperation extends Tool {
  parameters: ReturnType<typeof Type.Object>;
  label: string;
  execute(id: string, params: unknown, signal: AbortSignal | undefined, ctx: ExtensionContext): Promise<Result>;
}

/** Memory tool definitions own argument validation and cancellation checks. */
export function memoryOperations(session: MemorySession): MemoryOperation[] {
  const tools: MemoryOperation[] = [];
  function add<T extends ReturnType<typeof Type.Object>>(tool: Tool<T> & { label: string;
    execute(id: string, params: Static<T>, signal: AbortSignal | undefined, ctx: ExtensionContext): Promise<Result> }) {
    tools.push({ ...tool, execute(id, params, signal, ctx) {
      signal?.throwIfAborted();
      const validated = validateToolArguments(tool, { type: "toolCall", id, name: tool.name, arguments: params as JsonObject });
      return tool.execute(id, validated, signal, ctx);
    } });
  }
  add({
    name: "memory_evidence", label: "Memory Evidence",
    description: "Read missing or unclear source context from the current session only. No inspection call is required when the relevant exchange is already in working context. Default conversation view omits execution metadata and recursive inspection payloads; raw view is available for diagnostics. Assistant proposals/questions are context, not authority. Without evidenceId, browse/search current source references. No historical-session lookup.",
    parameters: Type.Object({ evidenceId: Type.Optional(Type.String()), query: Type.Optional(Type.String()),
      fromEntryId: Type.Optional(Type.String({ description: "Earlier native entry from the context index. Expands context, never narrows away the source." })),
      cursor: cursorSchema, view: Type.Optional(StringEnum(["conversation", "raw", "projected", "earlier"] as const)) }),
    async execute(_id, params, signal, ctx) {
      try { signal?.throwIfAborted();
        const manager = ctx.sessionManager;
        const sources = session.evidence.list(manager);
        const budget = responseBudget(ctx);
        if (!params.evidenceId) {
          const matches = params.query ? new Set(searchSources(sources.map(source => ({ path: source.id, content: source.text })), params.query).map(hit => hit.path)) : undefined;
          const catalog = sources.filter(source => !matches || matches.has(source.id)).map(({ id, entryId, actor, observedAt, originProject }) => ({ id, entryId, actor, observedAt, originProject }));
          return jsonResult(pageUnits(catalog, fingerprint({ session: manager.getSessionId(), catalog, query: params.query }), budget, params.cursor));
        }
        // The cursor owns only reader pagination, never permission to save.
        // Freeze ancestry and structural unitization across appended tool calls
        // and changing resource budgets, without storing a second context copy.
        const reading: { sessionId: string; anchorId: string; fromEntryId?: string; unitBudget: number | null } | undefined = params.cursor
          ? JSON.parse(Buffer.from(params.cursor, "base64url").toString("utf8")).reading : undefined;
        if (params.cursor && (!reading || reading.sessionId !== manager.getSessionId() || typeof reading.anchorId !== "string"
          || (reading.fromEntryId !== undefined && typeof reading.fromEntryId !== "string")
          || (reading.unitBudget !== null && (!Number.isSafeInteger(reading.unitBudget) || reading.unitBudget < 0)))) throw new Error("Invalid current-session reader cursor.");
        if (reading && params.fromEntryId !== undefined && params.fromEntryId !== reading.fromEntryId) throw new Error("Reader context changed. Start a fresh inspection.");
        const inspection = session.evidence.inspect(manager, params.evidenceId, { fromEntryId: reading?.fromEntryId ?? params.fromEntryId, anchorId: reading?.anchorId });
        const view = params.view ?? "conversation";
        const metadata = { view, earlierContextAvailable: inspection.earlierContext.length > 0,
          note: view === "conversation"
            ? "Complete conversational units for this span, not raw execution data. Tool declarations, assistant thinking/provider diagnostics and successful prior inspection payloads are omitted. Native entries remain available through explicit raw view. Observed submissions have no asserted native-message binding. Proposals/questions are context, not authority."
            : "Current-session context only. Reading is optional and does not authorize a write. Continue pages when needed to understand all applicable qualifications." };
        const continuation = { reading: reading ?? { sessionId: manager.getSessionId(), anchorId: inspection.citation.anchorId,
          fromEntryId: inspection.citation.fromEntryId, unitBudget: null as number | null } };
        const spanSnapshot = fingerprint({ citation: inspection.citation, view,
          ...(view === "projected" ? { projection: inspection.projectedContext } : {}) });
        if (!reading) {
          const envelopeCost = tokenEstimate(pageUnits([], spanSnapshot, Infinity, undefined, undefined, metadata, continuation))
            + tokenEstimate(Buffer.from(JSON.stringify({ ...continuation, reading: { ...continuation.reading, unitBudget: Number.MAX_SAFE_INTEGER }, snapshot: spanSnapshot, offset: Number.MAX_SAFE_INTEGER })).toString("base64url"));
          continuation.reading.unitBudget = Number.isFinite(budget) ? Math.max(0, Math.floor(budget - envelopeCost)) : null;
        }
        const snapshot = fingerprint({ spanSnapshot, reading: continuation.reading });
        if (view === "earlier") return jsonResult(pageUnits(inspection.earlierContext, snapshot, budget, params.cursor, undefined, metadata, continuation));
        if (view === "projected") return jsonResult(pageUnits(inspection.projectedContext, snapshot, budget, params.cursor, undefined, metadata, continuation));
        const unitBudget = continuation.reading.unitBudget ?? Infinity;
        const entries = view === "raw" ? inspection.rawContext : inspection.rawContext.map(conversationalEntry);
        const units = [...structuralUnits({ source: inspection.source, citation: inspection.citation }, "source", unitBudget),
          ...entries.flatMap((entry, index) => structuralUnits(entry, `context:${inspection.rawContext[index].id}`, unitBudget))];
        return jsonResult(pageUnits(units, snapshot, budget, params.cursor, undefined, metadata, continuation));
      } catch (error) { return errorResult(error); }
    },
  });
  add({
    name: "memory_write", label: "Memory Write",
    description: "Save/replace one settled, contextual memory directly from an authorized current-session source and exact quote. No prior inspection call required. Understand the relevant exchange; read missing antecedents only when needed. Preserve qualifications and rationale. ID/current hash required for replacement; no historical sources or approval inbox.",
    parameters: Type.Object({ scope: scopeSchema, projectPath: projectPathSchema, topic: Type.String({ description: "Meaningful one-line topic name, reusable for related records." }),
      route: Type.String({ description: "One-line cue explaining when this complete record matters." }), content: Type.String(), kind: StringEnum(["preference", "decision", "fact"] as const),
      evidenceId: Type.String(), quote: Type.String(), fromEntryId: Type.Optional(Type.String({ description: "Include an earlier current-session antecedent in provenance when needed. May expand, not narrow, the default exchange." })),
      always: Type.Optional(Type.Boolean()), expiresAt: Type.Optional(Type.String()), id: Type.Optional(Type.String()), expectedHash: Type.Optional(Type.String()) }),
    async execute(_id, params, signal, ctx) {
      try { signal?.throwIfAborted();
        const state = session.scope(ctx, params.scope, params.projectPath); assertMemoryMutationPermission(state.role);
        const evidence = session.evidence.evidence(ctx.sessionManager, params.evidenceId, params.quote, params.kind, params.fromEntryId);
        const { projectPath: _project, scope: _scope, evidenceId: _evidenceId, quote: _quote, fromEntryId: _fromEntry, ...fields } = params;
        const saved = saveRecord(state.dir, { ...fields, always: params.always ?? false, evidence });
        return jsonResult({ outcome: saved.unchanged ? "unchanged" : "saved", scope: state.scope, id: saved.record.id, hash: saved.hash, recoveryId: saved.recoveryId });
      } catch (error) { return errorResult(error); }
    },
  });
  add({
    name: "memory_read", label: "Memory Read",
    description: "Read a complete current record by ID. A topic returns record cues; no topic/ID returns the complete topic inventory and standing preferences. Continuations expose complete structural units, not character excerpts. Incomplete reads do not establish all conditions.",
    parameters: Type.Object({ scope: scopeSchema, projectPath: projectPathSchema, id: Type.Optional(Type.String()), topic: Type.Optional(Type.String()), cursor: cursorSchema,
      view: Type.Optional(StringEnum(["record", "units"] as const)) }),
    async execute(_id, params, signal, ctx) {
      try { signal?.throwIfAborted();
        const state = session.scope(ctx, params.scope, params.projectPath), records = currentRecords(readLedger(state.dir));
        const budget = responseBudget(ctx), snapshot = fingerprint({ scope: state.dir, records, id: params.id, topic: params.topic, view: params.view });
        if (!params.id) {
          const items: Record<string, unknown>[] = params.topic ? records.filter(record => record.topic === params.topic).map(recordCue)
            : [...records.filter(record => record.always).map(record => ({ standingPreference: record.content, ...recordCue(record) })),
              ...[...new Set(records.filter(record => !record.always).map(record => record.topic))].sort().map(topic => ({ topic, records: records.filter(record => record.topic === topic).length }))];
          return jsonResult(pageUnits(items, snapshot, budget, params.cursor, undefined, { scope: state.scope }));
        }
        const record = records.find(item => item.id === params.id);
        if (!record) throw new Error("Current record not found (possibly expired or removed).");
        const full = { scope: state.scope, record, hash: recordHash(record), complete: true };
        if (params.view !== "units" && !params.cursor && tokenEstimate(full) <= budget) return jsonResult(full);
        const { content, evidence, ...metadata } = record;
        const { quote, ...provenance } = evidence;
        const units = [{ field: "metadata", value: { ...metadata, evidence: provenance, hash: recordHash(record) } },
          ...markdownUnits(content).map((text, index) => ({ field: "content", index, text })),
          ...markdownUnits(quote).map((text, index) => ({ field: "evidence.quote", index, text }))];
        return jsonResult(pageUnits(units, snapshot, budget, params.cursor, undefined, { scope: state.scope, id: record.id, structuralRead: true }));
      } catch (error) { return errorResult(error); }
    },
  });
  add({
    name: "memory_search", label: "Memory Search", description: "Recall current global and focused-project memory using a short task-specific query. A singleton strongest lexical candidate includes its complete record when it fits; tied candidates remain cues for selection. Judge applicability, not just similarity. All matches remain accessible. No archives, scratchpads, unrelated projects or model/network calls.",
    parameters: Type.Object({ query: Type.String({ description: "A focused retrieval intent based on the task and its context, including useful domain terms or identifiers. Not the entire conversation." }), projectPath: projectPathSchema, cursor: cursorSchema, limit: Type.Optional(Type.Number()) }),
    async execute(_id, params, signal, ctx) {
      try { signal?.throwIfAborted(); const available = session.readScopes(ctx, params.projectPath), hits = lookupLedgers(available.stores, params.query);
        // Present the strongest lexical tier first, rather than dumping every
        // shared-word match. Remaining candidates stay explicitly accessible.
        const exact = hits.filter(hit => hit.exactPhrase);
        const words = Math.max(0, ...hits.map(hit => hit.matchingWords));
        const primary = exact.length ? exact : words ? hits.filter(hit => hit.matchingWords === words) : hits;
        const selected = new Set(primary.map(hit => `${hit.scope}/${hit.id}`));
        const ranked = [...primary, ...hits.filter(hit => !selected.has(`${hit.scope}/${hit.id}`))];
        const limit = params.limit ?? (!params.cursor && primary.length ? primary.length : undefined);
        const snapshot = fingerprint({ scopes: available.stores.map(({ scope, dir }) => ({ scope, dir })), unavailable: available.unavailable, query: params.query, ranked });
        const budget = responseBudget(ctx);
        const metadata = { unavailableScopes: available.unavailable, coverageComplete: !available.unavailable.length, retrieval: "lexical", primaryCandidates: primary.length,
          note: "A singleton strongest lexical candidate may include a complete record. Tied or oversized candidates are cues; use memory_read by ID when needed. recordComplete describes record exposure; complete describes candidate pagination, not semantic coverage. Other matches remain accessible via nextCursor. Judge conditions and applicability." };
        const items: Array<(typeof ranked)[number] & { recordComplete: boolean; record?: ReturnType<typeof currentRecords>[number] }> = ranked.map(hit => ({ ...hit, recordComplete: false }));
        if (primary.length === 1) {
          const hit = primary[0];
          const record = available.stores.find(store => store.scope === hit.scope)!.ledger.records.find(record => record.id === hit.id)!;
          const full = { ...hit, recordComplete: true, record };
          const envelope = pageUnits([full, ...items.slice(1)], snapshot, Infinity, undefined, 1, metadata);
          if (tokenEstimate(envelope) <= budget) items[0] = full;
        }
        return jsonResult(pageUnits(items, snapshot, budget, params.cursor, limit, metadata)); }
      catch (error) { return errorResult(error); }
    },
  });
  add({
    name: "memory_forget", label: "Memory Forget", description: "Archive a current record by ID/hash. Keeps a conflict-safe before-image, not a privacy erasure or full historical version-control promise.",
    parameters: Type.Object({ scope: scopeSchema, projectPath: projectPathSchema, id: Type.String(), expectedHash: Type.String() }),
    async execute(_id, params, signal, ctx) {
      try { signal?.throwIfAborted(); const state = session.scope(ctx, params.scope, params.projectPath); assertMemoryMutationPermission(state.role);
        return jsonResult({ archived: params.id, ...archiveRecord(state.dir, params.id, params.expectedHash) }); }
      catch (error) { return errorResult(error); }
    },
  });
  add({
    name: "memory_restore", label: "Memory Restore", description: "Restore a retained before-image without overwriting a newer correction. New owned recovery retains the latest transition per record, not every revision.",
    parameters: Type.Object({ scope: scopeSchema, projectPath: projectPathSchema, recoveryId: Type.String() }),
    async execute(_id, params, signal, ctx) {
      try { signal?.throwIfAborted(); const state = session.scope(ctx, params.scope, params.projectPath); assertMemoryMutationPermission(state.role);
        return jsonResult(restoreRecord(state.dir, params.recoveryId)); }
      catch (error) { return errorResult(error); }
    },
  });
  add({
    name: "memory_status", label: "Memory Status", description: "Scope and current/recovery counts. Use memory_evidence for source inspection, memory_read for full inventory. Status never dumps source excerpts.",
    parameters: Type.Object({ projectPath: projectPathSchema, recoveries: Type.Optional(Type.Boolean()), cursor: cursorSchema }),
    async execute(_id, params, signal, ctx) {
      try { signal?.throwIfAborted(); const state = session.runtime(ctx, params.projectPath);
        const recoveryCues: Array<Record<string, unknown>> = [];
        const inventory = session.scopes(ctx, params.projectPath).map(({ scope, dir }) => {
          try { signal?.throwIfAborted(); const ledger = readLedger(dir), recovery = readRecoveries(dir);
            if (params.recoveries) recoveryCues.push(...recovery.map(entry => ({ scope, recoveryId: entry.recoveryId, recordId: entry.before.id, restored: entry.restored })));
            return { scope, path: ledgerPath(dir), current: currentRecords(ledger).length, recoveries: recovery.length }; }
          catch (error) { return { scope, error: String(error) }; }
        });
        const metadata = { role: state.role, project: state.locations.project, taskPath: state.taskPath, inventory, currentInput: session.currentInput };
        return jsonResult(pageUnits(recoveryCues, fingerprint({ metadata, recoveryCues }), responseBudget(ctx), params.cursor, undefined, metadata));
      } catch (error) { return errorResult(error); }
    },
  });
  add({
    name: "scratchpad", label: "Scratchpad", description: "Unfinished-work checklist. Read explicitly when resuming work. Never injected into durable recall. Subagents are read-only.",
    parameters: Type.Object({ scope: scopeSchema, projectPath: projectPathSchema, action: StringEnum(["add", "done", "undo", "clear_done", "list"] as const), text: Type.Optional(Type.String()) }),
    async execute(_id, params, signal, ctx) {
      try { signal?.throwIfAborted(); const state = session.scope(ctx, params.scope, params.projectPath); assertScratchpadPermission(state.role, params.action);
        const file = scratchpadFilePath(state.dir); assertSafePath(file);
        return result(mutateChecklist({ filePath: file, action: params.action, text: params.text, sessionId: ctx.sessionManager.getSessionId() }) || "Scratchpad is empty."); }
      catch (error) { return errorResult(error); }
    },
  });
  return tools;
}
