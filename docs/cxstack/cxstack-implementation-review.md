# CXStack v0 implementation review

## Initial Claude review

# CXStack v0 implementation review

I inspected the extension code, state library, tests, package manifest, all CX/Reflect resources, the global baseline, the eight audited skill edits, and the bundled pi-memory changes directly against the approved design and specialist audit.

## What checks out (verified against the pack, not the summary)

- **Command contract**: `decideCxCommand`/`applyCxCommand` implement the exact contract — busy rejection before any side effect (`if (!ctx.isIdle())` precedes all state reads/writes in both handlers), exact trimmed `off` only (`"off now"` becomes a task), unchanged task forwarded exactly once via `sendUserMessage`, idempotent no-ops, no turn started by bare `/cx` or `/cx off`.
- **Sticky state**: boolean-only `cx-state` entries via `appendEntry`, latest-entry-wins session-wide restore, fork inheritance from `previousSessionFile` including inherited deactivation (`restoreCxStateFile` test covers active-then-off), tree navigation restores rather than mutates state.
- **Directive discipline**: pending directive injected as one persistent message with no marker that turn; otherwise only the 18-word marker (exact design text); inactive turns get nothing; compaction adds at most one directive and only when the rebuilt context's newest directive mismatches effective state, with `deliverAs: "steer"` on `willRetry`; never-activated sessions get nothing (`neededCompactionDirective(emptyCxState(), [])` → undefined).
- **Kernel**: verbatim match to the approved opening, eight principle lines, closing, and linked index; 244 words (in the 220–250 budget); references rewritten to the absolute installed resource root and existence-tested.
- **No bypass**: no `pi.skills`/`pi.prompts` in `package.json`, no `skills/cx/SKILL.md`; tested.
- **Playbooks, delivery, handoff, model roles**: match the reviewed drafts and design rules (no push/PR/merge inferred from silence, verified-clean-commit fallback, scratchpad-as-handoff-only, no automatic parent model switching, no panel machinery).
- **Reflect**: idle-gated before any work, explicit-only, bounded digest created in parent, `PI_SESSION_FILE` only, raw transcript and path never passed to the child, `context: "fresh"` / `mission: false` / `artifacts: false`, six-way classification, and an explicit "Apply only selected items… Do not create tracker items, edit skills or project files, write memory, or change papercuts before approval." No code path writes anything.
- **Immediate preference memory**: pi-memory startup context instructs visible `memory_write` of stable preferences/corrections during work — the "don't wait for Reflect" path exists.
- **Papercuts**: broadened wording lives in the shared pi-memory tool and startup guidance (no CX-only wrapper); papercut *content* stays out of startup context and out of search (`searchableMarkdownFiles` filters `PAPERCUTS.md`); low threshold, activity+friction+structural-improvement, no-secrets wording matches the design.
- **Global edits**: baseline is the approved 31-word body verbatim. All eight audit items are implemented and none exceed scope: `diagnosing-bugs` description matches the proposed text with body untouched; TDD seam rule replaced as proposed; `code-review` is Pi-native (pi-subagents, fresh lanes, MCP/local spec discovery, no `/setup-matt-pocock-skills`, two-axis output preserved un-reranked); `read-the-damn-docs` is the compact proportional dispatcher with the approved evidence order and no Codex wording; Pango PHP test rule is the approved replacement with the weakening ban intact; the two UI triggers narrowed as proposed; the two duplicates gained `disable-model-invocation: true`.

## Findings

### 1. LOW — Judge contract drops two judge-facing instructions from the approved prompt

- **File/quote**: `resources/cx/references/judge.md`. The blockquote ends: "…Label unknowns as unknowns, not defects. Do not edit or autofix."
- **Evidence**: The approved contract includes, inside the judge's own prompt: "Work from fresh raw context: … Do not accept the author's summary when the source is available." and "Return a clean verdict when no material finding survives." The implementation moves the fresh-context material into owner-side prose ("Do not give it a persuasive author summary") and drops both sentences from the prompt the judge actually receives.
- **Consequence**: The owner-side rule only prevents *sending* a summary. If the packet nevertheless contains both a narrative and raw sources, the judge has no instruction to prefer the source over the narrative — the exact trust failure this line defends against. The explicit clean-verdict return instruction is only partially covered by "A clean verdict is good after serious falsification attempts fail."
- **Smallest correction**: Append the two omitted sentences to the blockquote in `judge.md` (adjust the fresh-context sentence to the judge's voice if desired).

No other finding survives. No privacy boundary is broken in the supplied code or prose; no instruction contradiction between kernel, references, global baseline, and the audited skills; no hidden per-turn prompt growth beyond the approved marker and the pre-existing memory startup context; no Reflect write path before approval.

## Unknowns (not findings; depend on Pi internals absent from this pack)

1. **Stale `pending` across compaction**: if navigation sets `pending` and a subsequent compaction finds the rebuilt context *already* matching (so `neededCompactionDirective` returns undefined), `pending` is not cleared and the next turn injects one redundant — but state-consistent — kernel. Whether Pi's rebuilt context can retain the directive in that sequence is unverifiable here. Cheap hardening: run `refreshPendingDirective` against the rebuilt context in `session_compact` even when no directive is needed.
2. **Clone inheritance**: `session_start` handles `reason === "fork"`; whether clone reports the same reason (or copies entries so `restoreCurrentSession` suffices) requires Pi source.
3. **Handler composition**: both pi-memory and cx return `systemPrompt` from `before_agent_start`; both use the chaining pattern (`${event.systemPrompt}\n\n…`), but Pi's multi-extension merge semantics are not in the pack.
4. **Fork fallback**: on an unreadable `previousSessionFile`, falling back to the new session's own entries is only correct if fork copies entries; it does warn visibly either way.
5. **Reflect privacy probe**: the sentinel-containment result is asserted only in the verification evidence; the prose contract itself matches the design.
6. **Closeout**: the design's four-fact closeout contract has no dedicated prompt surface, but the approved implementation scope enumerates no closeout resource; facts are partially carried by the kernel's proof line, `delivery.md`, and playbook finish rules. Recorded as an observation, not a deviation.

## Verdict

**GO** for local completion. One LOW correction (judge.md contract sentences) is worth making before normal use; nothing blocks. No commit or publication authority is implied by this verdict.


## Initial GPT review

NO GO for local completion. The CX runtime implementation itself looks sound, but one authority conflict and two required validation gaps remain.

## Findings

1. **HIGH — Reflect’s approval gate conflicts with higher-priority write instructions.**

   [reflect.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/extensions/reflect.ts:13) injects Reflect’s “do not change durable surfaces” rule as a custom message. Pi converts custom messages to user-role context in [messages.js](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/messages.js:75).

   Meanwhile, pi-memory injects system-level instructions through [index.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/vendor/pi-memory/src/index.ts:54) telling the agent to write stable corrections and papercuts in [core.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/vendor/pi-memory/src/core.ts:831). That conflicts with the approval requirement in [reflect.md](/Users/charliexue/Projects/personal/pi-personal-cxstack/resources/reflect.md:3).

   Consequence: when Reflect finds an unstored stable correction or papercut, the higher-priority system prompt tells it to write before Charlie selects anything. No write was observed, but the approved authority boundary is not reliably enforced.

   Smallest correction: add a generic exception to the pi-memory system wording: during an explicit approval-gated review, propose durable writes and wait for selection. Cover the composed prompt in a focused test.

2. **MEDIUM — The CX tests overclaim runtime mechanics.**

   [cxstack.test.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cxstack.test.ts:33) imports only pure helpers:

   - “Rejects every command while Pi is busy” tests `decideCxCommand(..., false)`, while the real handler performs the guard separately and then always passes `true` at [cx.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/extensions/cx.ts:96).
   - “Preserves the activation task exactly once” never invokes or spies on `sendUserMessage()` at [cx.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/extensions/cx.ts:126).
   - Compaction tests never exercise `triggerTurn: false`, `deliverAs: "steer"`, or Pi’s overflow retry ordering at [cx.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/extensions/cx.ts:78) and [agent-session.js](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1670).
   - There are no handler-level tests for session start, tree navigation, `before_agent_start` merging, or Reflect.

   Consequence: the suite remains green if material extension wiring breaks, despite test names implying those boundaries are covered.

   Smallest correction: add a focused ExtensionAPI harness around the registered handlers, plus a Pi-level test for overflow retry and custom-context persistence.

3. **MEDIUM — The required Reflect privacy probe has not been completed or evidenced.**

   The repository has no Reflect privacy or sentinel test; Reflect appears in the suite only through manifest registration. The approved validation explicitly requires inspecting actual child input, output, session record, mission storage, and debug artifacts in [cxstack-v0-design.md](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:660). The supplied verification evidence also omits this probe.

   Consequence: there is no observed proof that raw sentinel data remains only in the parent session.

   Smallest correction: after fixing finding 1, run one synthetic sentinel probe with `context: "fresh"`, `mission: false`, and `artifacts: false`, then inspect every required persistence surface.

## Verified clean

Source inspection supports the intended `/cx` behavior for idle rejection, exact task forwarding, session-wide state, fork and clone inheritance, tree repair, directive precedence, compaction refresh, overflow steering, resource paths, and command-only discovery.

Also verified:

- `npm test`: 23 passed.
- `npm run typecheck`: passed.
- Papercut changes remain wording-only and preserve storage, retrieval, and permissions.
- Global baseline and specialist edits match the approved scope.
- Pango change is isolated to `pango-php-style` on `chore/clean-up-agent-skills`.

## Unknowns and delivery state

The package dry run could not be repeated in this read-only environment because npm could not create its cache temporary file. The supplied successful pack result and source inspection support the packaging claim, but I did not independently re-observe the tarball.

CXStack remains uncommitted and unpushed on `feature/cxstack-v0`, one commit behind `origin/main`. The Pango lane is also uncommitted and unpublished. No files were modified during this review.

**NO GO**

## Claude correction recheck

# Recheck verdicts

## Finding 1 — Complete approved judge instructions: PASS

The prior finding was that the judge prompt omitted two approved lines: source-priority and clean-verdict. Both now appear in the supplied `<judge>` contract:

- **Source-priority:** "Work from fresh raw context. Use the request and relevant history, project rules, the artifact, observed evidence, and claimed delivery state. Do not accept the author's summary when the source is available."
- **Clean-verdict:** "A clean verdict is good after serious falsification attempts fail." and "Return a clean verdict when no material finding survives."

Caveat: I can only confirm the supplied `<judge>` text. I have not independently verified this is the exact text shipped in the package, only that the evidence provided contains the previously missing lines.

## Finding 2 — Reflect authority over ordinary memory/papercut guidance: PASS

The ambiguity was that Pi memory's normal immediate-write guidance ("Use visible memory_write tool calls during work…", "Use a visible papercut add call… even on a first occurrence") could outrank Reflect's approval gate. The supplied `<memory-system>` source now resolves this at three levels:

1. **System-prompt level (unconditional):** `buildStartupContext` always includes "During an explicit approval-gated review, propose durable memory and papercut writes and wait for the user's selection instead of writing them immediately." This line sits in the base array, so it applies regardless of role or auto-capture setting, and it directly overrides both preceding immediate-write instructions.
2. **Tool level:** the `memory_write` description ends with "During an explicit approval-gated review, propose the write and wait for selection," and the `papercut` description with "propose the entry and wait for selection."
3. **Reflect prompt level:** "Do not change any durable surface before Charlie selects the proposed changes" and "Do not create tracker items, edit skills or project files, write memory, or change papercuts before approval."

Reflect self-identifies as an approval-gated review, so the exception clause unambiguously binds it. No surviving conflict.

## Note on privacy evidence

The live Reflect privacy probe (token confined to parent, no writes after Reflect began, fresh/no-mission/no-artifact child) is **reported evidence only**. It is consistent with the design above but I did not observe it, and it was not required to reach the two verdicts here. No other areas reviewed; no files edited.


## GPT correction recheck

NO GO. Findings 1 and 2 pass. Finding 3 fails because the Reflect privacy result is not backed by inspectable evidence.

1. PASS. Reflect approval authority

The conflict is resolved.

The memory extension adds its guidance to the system prompt and now states that approval gated reviews must keep memory and papercut writes as proposals until the user selects them. See [core.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/vendor/pi-memory/src/core.ts:831) and [index.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/vendor/pi-memory/src/index.ts:55). The tool descriptions repeat the exception at [index.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/vendor/pi-memory/src/index.ts:61) and [index.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/vendor/pi-memory/src/index.ts:237).

Reflect clearly identifies itself as such a review and forbids durable changes before selection in [reflect.md](/Users/charliexue/Projects/personal/pi-personal-cxstack/resources/reflect.md:1) and [reflect.md](/Users/charliexue/Projects/personal/pi-personal-cxstack/resources/reflect.md:48).

Pi 0.84.2 combines returned messages and system prompt changes during `before_agent_start` in [runner.js](/Users/charliexue/Projects/personal/pi-personal-cxstack/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js:837), then applies both before the run in [agent-session.js](/Users/charliexue/Projects/personal/pi-personal-cxstack/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:884). The higher authority memory wording therefore agrees with Reflect instead of outranking it.

2. PASS. Command, state, directive, and retry coverage

The new tests cover the material wiring without claiming behavioral quality.

The handler tests directly exercise:

- Busy rejection before side effects at [cx-extensions.test.mjs](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cx-extensions.test.mjs:62).
- Exact task forwarding, state persistence, first kernel injection, and later marker use at [cx-extensions.test.mjs](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cx-extensions.test.mjs:74).
- Deactivation without a model turn and the newest inactive directive at [cx-extensions.test.mjs](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cx-extensions.test.mjs:96).
- Tree restoration and both compaction delivery modes at [cx-extensions.test.mjs](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cx-extensions.test.mjs:115).
- Reflect busy rejection and one turn instruction injection at [cx-extensions.test.mjs](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cx-extensions.test.mjs:138).

The pure tests cover latest session state, fork file restoration, stale directive repair, and newest directive selection at [cxstack.test.ts](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cxstack.test.ts:68).

The live probe forces a synthetic overflow and asserts the retry event, successful recovered response, removal of the error assistant message, and an active directive after compaction at [cx-overflow-probe.mjs](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cx-overflow-probe.mjs:77) and [cx-overflow-probe.mjs](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cx-overflow-probe.mjs:91).

That matches Pi 0.84.2. Steer messages are queued while a run is active in [agent-session.js](/Users/charliexue/Projects/personal/pi-personal-cxstack/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1068). Pi emits the compaction event before removing the failed assistant response and continuing in [agent-session.js](/Users/charliexue/Projects/personal/pi-personal-cxstack/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1670).

I reran the suite. All 29 Bun tests passed. The live probe could not start because this read only sandbox denied its temporary directory creation. No probe assertion failed.

3. FAIL. Reflect privacy probe evidence

The implementation report does not provide sufficient concrete evidence.

The required check explicitly calls for inspecting the actual child input, child output, child session, mission storage, and debug artifacts in [cxstack-v0-design.md](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:660).

The report gives only a summary assertion in [cxstack-implementation-report.md](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-implementation-report.md:57). It provides no probe command, sentinel identifier, parent or child session path, inspected child input or output, mission location, artifact roots, or before and after write inventory.

Repository artifacts do not fill that gap:

- The test command runs the Bun tests and only the overflow probe at [package.json](/Users/charliexue/Projects/personal/pi-personal-cxstack/package.json:6).
- The Reflect handler test only proves instruction injection at [cx-extensions.test.mjs](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/cx-extensions.test.mjs:149).
- There is no Reflect privacy probe or saved probe evidence file in the repository.
- The report checks only memory and papercut writes, while Reflect also forbids tracker, skill, and project file changes before approval at [reflect.md](/Users/charliexue/Projects/personal/pi-personal-cxstack/resources/reflect.md:48).

This creates an evidence contradiction with the statement that the implementation “adds” the live privacy probe at [cxstack-implementation-report.md](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-implementation-report.md:71). A manual probe may have occurred, but the current repository and report do not let a reviewer verify that it inspected every required persistence surface.

No files were edited. No commit or publication action was taken.

## GPT privacy evidence rechecks

FAIL.

The recorded live Reflect run itself passes:

- Parent and child files match their recorded SHA 256 hashes.
- The recorded sentinel hash matches. It occurs twice in the parent, at the original source message and the later parent file read result. It occurs zero times in the child.
- Both reviewer launches used `context: "fresh"`, `mission: false`, and `artifacts: false`. The first failed before saving a child session. The second created the recorded Claude Sonnet 4.6 child.
- The child received only the safe preference and an abstract statement that private evidence was omitted. It made zero tool calls.
- After Reflect began, the parent made 17 calls. These were 3 `bash`, 5 `read`, 7 `subagent`, and 2 `subagent_wait` calls. The shell commands only resolved the parent path or inspected models.
- No matching mission record exists. No `subagent-artifacts` directory exists.
- The isolated memory file was written before Reflect began and contains only the safe preference. Its modification time predates the Reflect prompt. No durable workflow write occurred between Reflect starting and the final selection request.

The reusable probe still fails the requirement:

- [reflect-privacy-probe.py](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/reflect-privacy-probe.py:175) writes every RPC row to `/tmp/cxstack-reflect-privacy.rpc.jsonl`. Those rows include the sentinel from the parent transcript. This creates an additional unsanitized persistent copy outside the parent session. The script has no cleanup.
- The script snapshots the project, isolated memory, mission store, and artifact directories, but it does not snapshot global skill locations or tracker surfaces. Its tool guard also permits `bash` and does not inspect child tool calls, so future writes through those paths could pass.
- The generated RPC and report files are currently absent, but their cleanup happened outside the reusable script.

This contradicts the implementation report’s claim that the sentinel remained only in the parent session and means the future probe does not cover the same persistence surfaces.

NO GO for local completion. No files were edited.

FAIL

NO GO for local completion.

The retained evidence is otherwise correct:

- Both recorded session hashes match.
- The child input, output, and session exclude the token.
- Workflow settings were `fresh`, with missions and artifacts disabled.
- Memory was written before Reflect, with no later memory or mission write.
- Hash-based scanning found the token only in the retained parent session.
- The corrected script no longer writes raw RPC events.

The blocker is [reflect-privacy-probe.py](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/reflect-privacy-probe.py:149). It checks `/tmp/pi-subagents-uid-501`, which does not exist. The actual retained runtime files are under `/var/folders/.../T/pi-subagents-uid-501`. Therefore, the runtime assertion passes without inspecting the real subagent runtime files.

No files were changed.

PASS — [reflect-privacy-probe.py](/Users/charliexue/Projects/personal/pi-personal-cxstack/test/reflect-privacy-probe.py:149) resolves the platform temp directory with `tempfile.gettempdir()`. The retained parent hash matched, and the child plus resolved runtime root had zero token matches across 439 runtime files. [Evidence](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-reflect-privacy-evidence.md:59) accurately records this.

GO for local completion. No files changed, committed, or published.
## Parent disposition

Accepted every material finding.

- Restored the two missing judge instructions.
- Added a system-level approval-gated review exception to Pi memory and both durable-write tool descriptions.
- Added handler-level command and event tests.
- Added an automated live Pi overflow and retry probe.
- Ran the real Reflect privacy probe, saved sanitized hashes and evidence, and added a reusable manual probe.
- Removed extra raw RPC copies created by the first probe script.
- Expanded the reusable probe to check project files, global skills and context, memory, missions, parent shell commands, child tools, the actual platform subagent runtime, and debug artifacts.

Claude passed both corrected areas. GPT passed command, state, compaction, packaging, and the final privacy evidence. Final verdict: GO for local completion. No delivery authority was granted.
