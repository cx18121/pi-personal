# Local coding memory

This extension stores durable memory in local Markdown and keeps unfinished work in a separate scratchpad. The working agent learns autonomously through memory tools while doing the task, and uses the same tools for recall and explicit memory requests. There is no separate learning model or completion-time pass. There is no whole-store curator, correction inbox, database, embeddings, or hosted service.

## Recall

Each model request receives the complete topic inventory for global memory and the focused task project, plus explicit standing preferences. Records and scratchpads stay out of the prompt until the agent requests them. The request hook replaces its memory section without persisting that section in the native conversation.

When remembered knowledge could change the task, the agent writes a short task-specific query for `memory_search`, which uses local MiniSearch ranking with exact phrases, identifier matching, prefixes, and typo tolerance. Scopes explicitly reported empty need no search. Once a complete applicable record is available, recall stops. A citation is not a reason to inspect an old session. A singleton strongest lexical candidate includes its complete record, hash and provenance when the final response fits. Tied candidates remain cues for the agent to select, rather than dumping their bodies or choosing an arbitrary winner. An oversized record remains a cue for complete structural reading by ID. Candidate pagination, record exposure and semantic applicability are distinct. Topic browsing with `memory_read` remains a fallback. All eligible lexical candidates remain accessible. Derived indexes are keyed by complete source contents and may be reused in process. Each lookup still reads and validates current storage, so replacement, expiry, and removal become visible without a timestamp-based cache assumption.

There are no fixed character or record-count limits on semantic coverage. Tools admit complete units using the available model context and output reserve. When a complete result does not fit, continuation returns complete cues, Markdown paragraphs/code fences, or JSON structural units. The response explicitly identifies incomplete coverage. Cursors bind the query, scope, and snapshot. Changed storage requires a new lookup. A paragraph or code fence larger than the available context produces an explicit error rather than a misleading prefix or summary.

Lexical retrieval can miss paraphrases, and topic selection depends on the agent. The system does not guarantee that an agent reads every applicable record or follows every remembered preference. Recognition and future-task usefulness need model-level evaluation as well as storage tests.

## Learning and evidence

`memory_write` saves supported preferences, decisions, and verified gotchas. Replacement requires the existing ID and current hash. The agent should preserve conditions and rationale that affect future behavior, rather than turn a local exception into a universal rule. Exact repeated saves return an unchanged receipt. Body whitespace is preserved, including literals and code indentation. Semantic deduplication remains the working agent's judgment after reading the existing record. Explicit ID-based route or provenance corrections are not suppressed as duplicates.

Pi's native session tree owns the conversation evidence. `memory_write` checks the original source and exact quote on the current branch and generates provenance at write time. It does not require a prior inspection call or exposure receipt. The agent must understand the relevant exchange, including qualifications and antecedents. If that context is already available, it can save directly. If context is missing or unclear, `memory_evidence` reads it from the current session, including entries hidden by compaction. Assistant proposals, questions, and rejected alternatives are interpretive context, not user authority.

Optional inspection defaults to conversational content. It retains visible assistant text and tool calls, observed input, normal tool content/details, questionnaires, and contextual entries. It omits typed thinking, provider diagnostics, tool declarations, and recursive successful memory-inspection payloads. Omitted inspection entries remain identifiable by native entry/tool references. Explicit raw and projected views are available for current-session diagnostics. The preceding user turn is included by default; earlier expansion cannot narrow away that minimum. Reader cursors preserve their current-branch anchor and structural unitization across appended tool calls and changing budgets. If compaction or a context edit changes a projected view, its continuation is rejected and a fresh read is required. Reader state does not authorize or block writes. A write can explicitly include an earlier `fromEntryId` without depending on a prior inspection.

Two supplements live in the same native session. One records observed interactive/RPC submissions before this package's input transformers. It does not invent a binding to a future transformed or queued user message. The other preserves complete nested tool arguments/results that Pi does not persist independently. Ordinary top-level messages/results are not copied into a second archive.

The package registers memory before its input transformers. Earlier third-party transformers would invalidate original-input attribution because Pi 0.99.1 does not expose pre-transform text to later handlers. This is an extension-order dependency, not authenticated-human proof. Extension-origin input is not requester evidence.

Questionnaire authority uses the installed `ask_user_question` contract. Only committed selections, custom answers, and notes can be quoted as requester evidence. Questions/options/previews remain context. Cancelled or malformed results confer no committed authority. Tool observations can support facts, but cannot establish user preferences.

Persisted provenance retains service-generated session/entry references, observation time, exact quote, and the existing contextual snapshot fields for debugging and format compatibility. These fields do not promise that the model saw or understood the captured bytes. There is no historical-session reader or validation pipeline. Old citation fields remain valid stored data, not authority to reopen a file. Memories must be self-contained. Missing, changed, or deleted old sessions do not invalidate recall. Mutable facts require checking current owning sources before consequential use, not replaying old conversations.

`PI_MEMORY_AUTO_CAPTURE=0` tells the working agent to save only when explicitly requested. This is prompt guidance, not a technical prohibition on explicit tool mutations. Explicit memory tools and source inspection remain available. Subagents cannot mutate memory, scratchpads, or focus. These restrictions apply to the memory implementation, not every generic filesystem tool available to an agent.

## Main-agent learning

The working agent decides when lasting knowledge has been established, uses the supporting conversation already in context, checks existing knowledge when needed, and saves or updates it through the ordinary tools. It retrieves missing antecedents only when necessary. No model is invoked by memory at settlement, idle time, resume or shutdown. Ordinary questions, tentative ideas and task-only exceptions require no memory work unless they establish a separate lasting decision.

This avoids a routine second model pass and forced evidence rereads, not all learning overhead. Lookup, optional context inspection, and writes can still add foreground model continuations. Capture depends on the working agent's judgment and attention; there is no completeness receipt, automatic retry queue or guarantee that every useful lesson is saved. Quality and marginal usage must be evaluated on actual tasks.

Existing native background-learning boundary/receipt entries remain untouched historical metadata. They have no active consumer. Legacy `cxModels.overrides.memory` settings are accepted but unused. The main model is not selected or gated by helper policy when using memory tools.

## Task scope

`memory_focus` selects the actual Git task repository and persists that selection on the current session branch. Default tools, learning, scratchpads, and automatic recall share this resolver. Resume and tree navigation restore branch-local focus. Missing paths, malformed focus, and changed identities do not silently substitute launch-project memory. Valid global preferences and search results remain available when project storage or focus fails. Current-session evidence does not depend on memory-store availability. Combined reads report unavailable scopes explicitly instead of presenting partial coverage as complete.

A root tool's `projectPath` is explicit one-off targeting. It does not change focus. Source origin and destination ownership stay separate, so a submission observed in workspace A may support an explicitly scoped decision for task repository B.

Project identity uses an existing `pi.memory-id` or the Git common-root path hash. Linked worktrees share that identity. Moving a repository without a configured stable ID changes its identity. Reads never create Git configuration or rename storage, and stable/legacy directory collisions fail explicitly. There is no cross-machine synchronization.

## Storage and recovery

Each scope has one authoritative `MEMORY.ledger.md`. Its generated topic header, current records, and import manifest share a locked atomic replacement. Length-delimited metadata preserves arbitrary Markdown bodies, Unicode, code fences, and metadata-looking text. This is a managed format, not arbitrary hand-edit compatibility.

Records have stable IDs, changing revisions, kind, provenance, current hashes, and optional explicit expiration. Expired records leave recall without being destroyed. Corrupt storage, including invalid UTF-8 bytes in active records or recovery, fails explicitly rather than being silently decoded or replaced. Directories use mode 700 and files mode 600. Symlinked storage is rejected apart from macOS system aliases for `/var`, `/tmp`, and `/etc`.

New before-images live separately under `recovery/ledger-v1/` using the same codec. A replacement/archive writes its before-image before committing active state. Restore checks the expected resulting hash and refuses to overwrite a newer change. Newly owned recovery retains the latest transition per record. Imported recovery and older archives are preserved, so this is limited recovery rather than full historical version control or privacy erasure.

Writes synchronize the private temporary file before rename and synchronize the containing directory afterward. Readers see the previous or replacement file. Scope locks serialize concurrent writers, while ID/hash checks reject stale edits. Filesystem and hardware durability still depend on the host honoring synchronization.

## Legacy files

Existing ledgers remain readable, including legacy records and import metadata. Old `MEMORY.md` files, topics, and archives are not imported or searched. Scratchpads remain separate from durable recall.

If a scope has old Markdown but no active ledger, reads and writes report that state rather than silently loading or overwriting it. There is no migration command or automatic import path.

## Tools and checks

- `memory_focus` selects the task repository.
- `memory_evidence` optionally reads missing source context from the current session only.
- `memory_write` saves/replaces one supported record.
- `memory_read` browses topics or reads complete records.
- `memory_search` searches current scoped records locally.
- `memory_forget` and `memory_restore` provide targeted conflict-safe recovery.
- `memory_status` reports scope and store/recovery state.
- `scratchpad` manages unfinished work without automatic injection.

```sh
bun test ./vendor/pi-memory/test
npm --prefix vendor/pi-memory run typecheck
```

Session tests use actual Pi sessions with a faux provider. They prove plumbing and lifecycle behavior, not model recognition. `test/live-recognition.ts` is a separate paid synthetic model evaluation. `test/performance.ts` measures local latency without provider requests.

The correction review queue is retired, with its private event history preserved. Explicit Reflect still proposes durable interventions and waits for approval. This module retains the upstream MIT license.
