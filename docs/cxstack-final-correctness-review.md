# Initial hostile correctness review

# CXStack v0 — Final Independent Judge Verdict

**Verdict: NOT CLEAN.** Two material findings survive, plus two low-severity findings. The core mechanism (boolean session state, kernel injection, marker, reconstruction) is implementable with the supplied Pi APIs, and most falsification attempts failed. But one runtime interaction contradicts supplied Pi source, and a class of designed behavior has no defined carrier that an active session can actually discover.

---

## Finding 1 — Conditional guidance has no discoverable runtime carrier (Severity: High)

**Claim under attack:** "Load playbooks, judge rules, delivery details, and specialist guidance only when useful." / Implementation lane 1: "`skills/cx/SKILL.md` for the compact kernel and one-line playbook index. Four thin playbook references and one judge reference."

**Evidence:**
- The kernel's contents are fully specified: goal, eight principle lines, the two closing paragraphs, the one-sentence playbook index, and "only the essential ownership, proof, and escalation rules." Nothing in that specification names the judge reference, the delivery-stage inference ladder (the ordered 5-source list and the "verified clean commit" fallback), the Sol/Fable soft role map, or the scratchpad handoff discipline.
- The four playbook texts are quoted verbatim. None points at the judge prompt file, the review-disposition rules (accepted/rejected/unresolved, "fix only verified findings," no auto-loop), the model-family preference for adversarial review, or the delivery ladder. "Finish at the delivery stage the context supports" gestures at delivery without giving the model access to the ordered inference rule.
- Lane 1's artifact list contains no file for model roles, delivery inference, review contract dispositions, or scratchpad rules. "README and design docs" are not runtime-loaded.
- The loading mechanism itself is underspecified: if the CX skill is model-invocable, its description appears in *every* session's system prompt — including `/cx off` sessions — leaking CX guidance and weakening the validation claim "`/cx off` stops all CX injection." If it is `disable-model-invocation: true`, the kernel names playbooks only by title with no path, and nothing tells the model where to `read` them.

**Consequence:** The design's central trust machinery — one complementary-family judge with the strict finding bar, owner-verified dispositions, honest delivery-stage inference, scratchpad-at-real-boundaries — is specified in the design document but structurally unreachable at runtime. These behaviors would silently not operate, which is exactly the failure class CXStack exists to fix.

**Smallest correction:** Add explicit pointers (kernel or SKILL.md index line) to the judge reference and a small delivery/roles/scratchpad reference; add those references to lane 1's artifact list; specify the CX skill's invocation mode and how playbook paths resolve under it.

---

## Finding 2 — Kernel injection during overflow compaction defeats Pi's retry cleanup (Severity: Medium)

**Claim under attack:** "On `session_compact`, append one fresh persistent kernel message with `pi.sendMessage(..., { triggerTurn: false })`. Pi fires the event after rebuilding post-compaction state and before any automatic retry, so the exact kernel is present immediately..." and validation item 4: "overflow compaction append[s] one exact fresh kernel."

**Evidence (supplied compaction source):** `session_compact` is emitted after `agent.state.messages = sessionContext.messages` and **before** the `willRetry` block. That block removes the aborted assistant response only conditionally:

```js
const lastMsg = messages[messages.length - 1];
if (lastMsg?.role === "assistant" && (lastMsg.stopReason === "error" || lastMsg.stopReason === "length")) {
    this.agent.state.messages = messages.slice(0, -1);
}
```

With `triggerTurn: false`, `sendCustomMessage` falls to the final branch and pushes the kernel directly onto `agent.state.messages` during the handler. The kernel is now the last message. `lastMsg?.role === "assistant"` is false, so the error/length assistant message survives into the retried state — the exact state Pi's own comment says `agent.continue()` rejects (or, at best, the truncated/error response is retained in the retried context).

**Consequence:** Overflow recovery — the highest-stakes compaction path — can fail or retry with a corrupted trailing context precisely when the extension is doing what the design mandates. The design's timing claim is technically true (event fires before retry) but the interaction is broken; the validation plan would likely catch this only if the overflow test asserts retry success, which it does not specify.

**Smallest correction:** When `event.willRetry` is true, defer the kernel (e.g., `deliverAs: "nextTurn"` or inject on the next `before_agent_start`) instead of appending into post-compaction state.

---

## Finding 3 — Kernel word budget is internally inconsistent (Severity: Low)

**Location:** "Inject a roughly 180–250 word CX kernel" and comparison doc: "About 180 words at activation."

**Evidence:** The mandated quoted content alone — eight principle lines (~125 words), the two closing paragraphs (~60 words), the playbook sentence (~28 words) — is already ~215 words before adding the goal and the "essential ownership, proof, and escalation rules." The comparison's "about 180 words" is not achievable with the specified inclusions; even 250 is tight, which directly feeds Finding 1 (no room for the missing pointers).

**Consequence:** Minor internal contradiction; whoever implements will either exceed the budget or cut mandated content without guidance on which.

**Correction:** Restate the budget honestly (~250–300) or explicitly rank kernel content by priority.

---

## Finding 4 — Versioned kernel depends on unversioned lane 2 with no verification (Severity: Low)

**Location:** "The global baseline already carries the ownership sentence, so the kernel does not repeat it." Lane 2: "These files are not currently versioned."

**Evidence:** The versioned lane 1 kernel deliberately omits a core rule because an unversioned local file supplies it. The validation section (typechecking, package tests, RPC discovery, privacy review, artifact checks) contains no check that `~/.pi/agent/AGENTS.md` exists with the expected content, and lane separation means lane 1 can be complete while lane 2 is absent, drifted, or rolled back — silently deleting the ownership principle from CX-active behavior. The non-versioning itself is honestly disclosed; the silent coupling is not mitigated.

**Correction:** Either repeat the one ownership sentence in the kernel (cost: ~15 words) or add a lane-2 presence check to validation.

---

## Attacks that failed (verified sound)

- **State machine:** `pi.appendEntry()` for the boolean (out of model context per docs), reconstruction via `ctx.sessionManager.getEntries()` on `session_start` (covers startup/reload/new/resume/fork) and `session_tree`. `/new` yields an empty branch → inactive; fork/clone continue the branch → inherited. All consistent with supplied lifecycle docs.
- **Persistent kernel and per-turn marker:** custom messages via `before_agent_start` return / `pi.sendMessage` are persisted and participate in LLM context (confirmed in `sendCustomMessage` source); per-turn system-prompt append is supported and reset each prompt (confirmed in the before-agent source: override or reset to base every turn).
- **Manual/threshold compaction refresh:** the injection point after state rebuild is correct for the non-retry paths, and appending a message does not modify Pi's summary.
- **Package registration:** correctly identified as required — the existing `pi` manifest lists only `extensions`, so conventional `skills/` auto-discovery would *not* apply; the plan explicitly adds skill registration.
- **Context7 dispatcher vs project rules:** the proposed evidence order puts project wiki/docs/source first, Context7 second; no conflict with project `AGENTS.md` primacy or the composition rule.
- **Scope consistency:** publication prohibition, three-lane separation, and "audit is not authorization" statements are mutually consistent; deferred items are labeled as deferred.
- **PStack comparison honesty:** claims are framed as Charlie's historical evidence and cited sources; the 49-compaction study is reported with its limits ("no reviewed case," not "proven safe"). No feature clearly required for the stated goal is hidden — omissions are listed with reconsideration conditions.

## Unknowns (not defects)

- Whether `before_agent_start` fires for turns triggered by `pi.sendUserMessage()` from the `/cx <task>` command handler (extension commands bypass the normal input path). The mechanisms to work around it exist either way.
- Whether `agent.continue()` accepts a custom message as the final message in the willRetry path (Finding 2 is a risk either way: rejection or retained broken response).
- Whether the scratchpad is an existing pi-memory capability; the design assumes it without citing its carrier.
- Kernel-message accumulation across multiple compactions when a prior kernel falls after `firstKeptEntryId` — plausible but unobserved; low stakes.

---

**Summary:** The activation mechanics are sound and honestly scoped. Fix the overflow-retry injection interaction (Finding 2) and give the judge/delivery/roles/scratchpad guidance a real, discoverable carrier (Finding 1) before implementation authorization. Findings 3 and 4 are cheap to close alongside.


# Narrow recheck after accepted fixes

# Narrow recheck — two prior findings only

## Claim 1: Conditional behaviors discoverable from the explicit-only skill; no leak while off

**Verdict: PASS**

**No leak while off.** The skill is gated three ways in the corrected design:
- "Mark the CX skill `disable-model-invocation: true`. It is absent from normal skill discovery and adds no prompt while CX is off."
- "Custom entries stay out of model context" (activation boolean via `pi.appendEntry()` carries no prompt).
- Validation item 2: "`/cx off` stops all CX injection."

**Discoverability coverage.** Every conditional behavior named in the design now maps to a concrete linked reference or an explicitly stated native discovery path:

| Conditional behavior | Concrete hook |
|---|---|
| Four playbooks | `references/playbooks/diagnose-and-fix.md`, `build-and-change.md`, `investigate-and-decide.md`, `review.md` in the activation index |
| Delivery details | `references/delivery.md` — "when work may cross a commit, publication, or production boundary" |
| Handoff/scratchpad | `references/handoff.md` — "at a real session boundary" |
| Model/subagent roles | `references/model-roles.md` — "before delegating bounded child work" |
| Judge contract | `references/judge.md` — "when an independent challenge earns its cost" |
| Conditional principles | Explicitly routed: "remain available through relevant playbooks and specialist skills," each example bound to an owning skill class |
| Specialist skills | Native discovery: "Use native skill names and descriptions plus project `AGENTS.md` for discovery" |
| Papercuts | Deliberately not CX-owned: "CX uses that shared capability; do not create a CX-only wrapper" — global Pi surface, so no CX link required |

The index is inside the injected body ("The index is part of the roughly 220–250 word activation message"), and the measured 244 words is within that budget. Implementation scope matches the index one-to-one: "Four thin playbook references. Conditional references for delivery, handoff, model roles, and the judge." References resolve "relative to the skill directory," so they are reachable only through the injected kernel — no off-state exposure. The eight core principles are active in the kernel itself ("the eight principle names with one-line meanings"), so their expanded design-doc text is documentation, not a runtime conditional load.

## Claim 2: `willRetry:true` — steer queues rather than appends, removal precedes delivery

**Verdict: PASS**, with one identified residual ordering failure path.

**Evidence for the pass.** Ordering in the compaction source:

1. `appendCompaction(...)` → state rebuilt from `buildSessionContext()`, which "can restore that kept entry, leaving an assistant as the final message."
2. `await this._extensionRunner.emit({ type: "session_compact", ..., willRetry })` — awaited, so the CX handler's `pi.sendMessage(kernel, { deliverAs: "steer" })` completes before step 3.
3. In `sendCustomMessage`, during a mid-turn overflow retry `this.isStreaming` is true and `triggerTurn` is unset, so `this.isStreaming && options?.triggerTurn !== false` selects `this.agent.steer(appMessage)` — the kernel is **queued** ("Streaming: queues message, processed when loop pulls from queue"), not pushed onto `agent.state.messages`.
4. Only then does the `if (willRetry)` block run: `lastMsg?.role === "assistant" && (stopReason === "error" || stopReason === "length")` still sees the aborted assistant response as the final message and slices it off, then `return true` lets the turn continue and the loop deliver the queued kernel before the retry LLM call.

So: queue-not-append ✓, removal-before-delivery ✓, matching the design text "Pi can remove the aborted assistant response first, then deliver the kernel before the retry LLM call."

**Residual ordering failure (from the supplied source).** The steer branch is guarded by `this.isStreaming && options?.triggerTurn !== false`. If either condition fails during the handler — the session is not in streaming state at `session_compact` emit time, or the extension mistakenly passes `triggerTurn: false` alongside `deliverAs: "steer"` (the pattern the design prescribes for manual/threshold refresh) — execution falls to the final `else` branch: `this.agent.state.messages.push(appMessage)`. The kernel is then **appended after** the restored error/length assistant message. The subsequent willRetry cleanup inspects only `messages[messages.length - 1]`; with a `role: "custom"` kernel last, the `lastMsg?.role === "assistant"` check fails and the aborted assistant response is never removed. The correctness of the design therefore depends on (a) `isStreaming` being true throughout the overflow-retry compaction window — not demonstrable from the supplied excerpts — and (b) the extension passing `deliverAs: "steer"` without `triggerTurn: false`, exactly as the corrected design specifies and nothing more.


# Reflect scope review

# CXStack Reflect Review

One finding survives.

---

## Finding 1 — Medium: The session-file handoff to the reviewer is unspecified, and Pi's documented environment behavior makes the naive reading wrong

**Evidence.**

- Design: "Reflect reviews the active Pi session from the exact `PI_SESSION_FILE` path" and "Use one fresh read-only reviewer… The reviewer examines corrections, preferences, decisions…" — the reviewer must therefore receive the transcript, but the design never states *who resolves the variable* or *how the path reaches the reviewer*.
- Pi docs: "The values are resolved when each command starts" and bash tools "expose the session environment by default"; with the explicit design intent that "Pi removes inherited values for these variables so nested Pi processes do not expose stale parent-session metadata." By documented design, a child context that evaluates `$PI_SESSION_FILE` sees **its own** session value (or unset), never the parent's.
- PStack's equivalent step is explicit about this hazard class ("The parent finds its own transcript file before fanning out… substituting the transcript path… where marked"). CXStack dropped the mechanism along with the panel, but the mechanism is load-bearing independent of panel size.

**Consequence.** A straightforward implementation of the SKILL.md — reviewer told to read `$PI_SESSION_FILE` — silently reviews the wrong transcript: its own near-empty child session, or falls into the digest fallback when the variable is unset in the child. Reflect then proposes lessons from no evidence while appearing to work. Parent verification may catch it, but the failure is silent by default, which conflicts with the design's own requirement that lessons be "supported by exact session evidence."

**Smallest correction.** One sentence in the Reflect design/SKILL.md: *the parent resolves `$PI_SESSION_FILE` via its own bash tool before spawning, passes the literal absolute path in the reviewer prompt, and the reviewer must never evaluate `PI_SESSION_FILE` itself.* Optionally cover this once in the focused mechanics tests, since it is deterministic extension-adjacent behavior, not a behavioral benchmark.

---

## Checks that did not produce findings

- **Ephemeral sessions:** explicitly handled ("If the file is unavailable, use a concise digest of the current conversation"), matching the docs' "unset for ephemeral sessions."
- **Prompt growth:** `disable-model-invocation: true`, explicit-only invocation, no startup injection, papercuts excluded from retrieval/startup. The only always-visible growth vector is "skill-description change," which edits existing descriptions and is bounded by the performance contract. Not a broken outcome.
- **Reviewer authority / write approval:** reviewer is read-only; "Reflect never edits skills, memory, project files, trackers, or papercuts before that approval"; parent verifies and synthesizes; Charlie selects. Internally consistent. (I did not require PStack's non-readonly/MCP arrangement: PStack's justification is Cursor-specific and the parent retains full lookup authority for verification.)
- **Memory vs skill routing:** the ordinary-path immediate memory save ("save it visibly… Do not wait for Reflect") is not a contradiction with "Change durable memory… only after Charlie accepts" — a preference Charlie states *is* Charlie's acceptance, and the save is visible, not silent. The one-off exclusion and the "skill used or should have triggered" constraint close the routing boundary. Absence of a "new skill" category is a deliberate anti-growth choice, not a gap.
- **Papercut overlap:** Reflect-classified papercuts pass through approval while ordinary papercuts are appended immediately; stricter within Reflect, not contradictory. Papercut/memory/skill boundaries are explicit.
- **Privacy:** review is pinned to the exact current-session path, unrelated session directories are excluded, transcript is treated as untrusted, and private evidence is kept out of durable output (evidence citations live in the ephemeral proposal shown to Charlie). No breach path found.
- **Discoverability:** `skills/reflect/SKILL.md` is registered via `package.json` per the implementation scope; explicit-only invocation is the stated intent, not an oversight.

## Verdict

**One Medium finding.** With the one-sentence path-handoff correction, the design stands as the smallest complete adaptation for the stated need: the single complementary reviewer, digest fallback, approval gate, and six-way classification each map to a distinct stated requirement, and I found nothing removable without losing one.


## Parent disposition

The medium finding was accepted. The design now requires the parent to resolve `PI_SESSION_FILE` before spawning and pass the literal parent-session path. A child reviewer must not resolve the variable itself. No other Reflect change was required.

# Superseding Reflect privacy correction

The later full GPT plan review found that passing the raw parent session path to a complementary reviewer would persist private source material in the child session. That invalidates the earlier path handoff disposition above.

The final design keeps raw transcript access in the parent. The parent creates a bounded, redacted digest and passes only that digest to a fresh read-only child with `mission: false` and `artifacts: false`. The parent verifies accepted claims against the source session.
