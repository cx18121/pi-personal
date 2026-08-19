# Final Claude and GPT plan review

These are the raw independent reviews requested before implementation. Parent dispositions follow after both reports.

## Claude review

# CXStack v0 — Independent Design Review

Scope: design doc, specialist audit, PStack comparison, package manifest only. No tools used, no prior verdicts considered.

## Overall assessment

The architecture is coherent. Activation is deterministic and cheap, the eight-principle kernel is genuinely small, playbooks are advisory rather than tracks, the judge contract is strict without loops, delivery stages are explicit, and every PStack removal I checked (mandatory todo, panels, capsule, natural opt-out, eval, autonomous runs) is declared with a stated reason rather than silently dropped. I attempted to find silent product decisions and removed trust mechanisms without replacement; the comparison table honestly accounts for them. The findings below are real but narrow.

---

## Confirmed findings

### 1. Kernel lifecycle across activation, `/cx off`, and compaction is internally underspecified — MEDIUM

**Location:** "Pi-native sticky mechanism" + Validation items 2 and 4.

**Evidence:** Three statements do not compose into one mechanism:
- "inject the compact kernel and capability index **once as a persistent custom context message** through `before_agent_start`"
- "`/cx off` **stops all CX injection**" (validation item 2)
- "On manual or threshold compaction … **append one fresh kernel** with `pi.sendMessage(...)`"

If the kernel is a persistent message in session context, `/cx off` stops *future* injection but the already-injected kernel remains visible to the model until compaction — the mode is "off" while its full instruction set is still in context. Conversely, if "persistent" means the message survives or is re-supplied across compaction, the post-compaction refresh produces **two** kernels, which validation item 4 ("append **one** exact fresh kernel") would fail. The design cannot have both readings, and neither is pinned.

**Consequence:** Either residual CX behavior after `/cx off` (contradicting the stated deterministic on/off experience) or duplicate kernels after compaction (contradicting validation). Validation items 2 and 4 as written are not implementable until this is resolved.

**Smallest correction:** Define one extension-owned kernel message with an explicit lifecycle: supplied while `active: true`, withdrawn (or explicitly countermanded) on `/cx off`, re-established exactly once after compaction. Restate validation items 2 and 4 against that lifecycle.

### 2. Numeric claims contradict the quoted approved texts — LOW

**Location:** Global baseline; comparison doc "then a 15-word marker"; kernel budget.

**Evidence:**
- The "approved 29-word `~/.pi/agent/AGENTS.md`" body as quoted is **31 words**.
- The marker ("CX is active. Match the task: stay direct when clear; load rigor only when it earns its cost.") is **18 words**, not 15.
- The enumerated kernel components (opening line ≈21 + eight principle lines ≈125 + closing ≈55 + capability index ≈55) total ≈255+ words, at or above the stated 220–250 budget before the promised "essential ownership, proof, and escalation rules."

**Consequence:** Validation item 4 requires "one **exact** fresh kernel," and lane 2 references "the approved 29-word" file — but the exact approved artifacts are ambiguous. An implementer cannot know whether the text or the count is authoritative.

**Smallest correction:** Pin the literal texts as the approved artifacts and delete or correct the word counts.

### 3. `/reflect` invocation mechanism is not in the implementation scope — LOW

**Location:** "Reflect" + "Implementation scope" lane 1.

**Evidence:** The CX skill needs `extensions/cx.ts` explicitly because `disable-model-invocation: true` removes it from discovery. `skills/reflect/SKILL.md` carries the same flag, but no extension or handler for `/reflect` is listed, and the design never states that Pi natively exposes user slash-invocation for such skills.

**Consequence:** If Pi does not natively support user-invoked skills under that flag, `/reflect` as specified cannot be triggered — a stated feature the scoped lane cannot deliver.

**Smallest correction:** One sentence confirming Pi's native explicit-invocation path, or add the handler to lane 1.

---

## Unknowns (not findings; cannot verify from the pack)

1. **Overflow compaction mechanics.** "Pi can remove the aborted assistant response first, then deliver the kernel before the retry LLM call" is asserted, not evidenced, and the design elsewhere restricts itself to "only Pi's existing extension APIs." If this steer-before-retry sequencing does not exist natively, validation item 5 fails without new machinery.
2. **`PI_SESSION_FILE` availability** to the parent's bash tool for Reflect.
3. **Removability of injected persistent context messages** — bears directly on the correction to Finding 1.
4. **The claim that privacy/safety rules "already belong to more precise runtime, CX, or project layers"** — the 31-word baseline deletes them on the assumption those layers exist; not verifiable here.

---

## Explicitly checked and clean

- No contradiction between "Never Block on the Human" and escalation carve-outs (publication, destructive state, privacy, product choices are named exceptions).
- Judge contract, Review playbook, and code-review audit are mutually consistent ("two axes are the contribution; do not add a judge to meet a count").
- Delivery fallback (verified clean commit, never inferring push/PR/merge) is a declared product decision with the evidence hierarchy above it — not silent.
- Papercut global broadening and lane-2 unversioned skill edits are declared, bounded, and deferred to the full cleanup for ownership — not scope creep by the design's own rule.
- Per-turn cost (18-word marker) will not inhibit the parent model; the kernel-once design honestly implements the anti-over-prompting rationale.

---

## Verdict

**GO** for local implementation — conditional on resolving Finding 1 (kernel lifecycle) before or during extension implementation, since validation items 2, 4, and 5 cannot be written correctly until it is pinned, and confirming Unknowns 1 and 3 against Pi's actual APIs early, since the sticky mechanism depends on them.

Reason: the design achieves its stated goal architecture — minimal active instruction, deterministic activation, judgment preserved in the model, one strict independent challenge, evidence-bounded claims — with no removed PStack trust mechanism left uncompensated and no silent product decision found. The confirmed findings are precision defects in one mechanism and in artifact pinning, all correctable inside the already-scoped lanes. Per the design's own rule, implementation still requires Charlie's explicit authorization; this verdict covers design readiness only.


## GPT review

NO GO. Pi supports the core injection and compaction design, but four material contracts are not implementation ready.

## Confirmed findings

### 1. High: `/cx <task>` can silently discard the task

**Location:** [Interface and activation](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:39), [validation](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:636)

**Evidence:** Pi executes extension commands before prompt handling. Once `/cx` is handled, it returns without sending a prompt. The arguments are passed only to the command handler. See [agent-session.js](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:792) and [argument parsing](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:924). The design never says that the handler must forward `<task>`.

A bare `/cx` also cannot immediately inject through `before_agent_start`, because that event requires a user prompt.

**Consequence:** A valid implementation could activate CX and silently drop Charlie’s first task.

**Smallest correction:** Define the command contract exactly:

- `/cx off` appends `active: false` and starts no model turn.
- Bare `/cx` appends `active: true`; its kernel waits for the next prompt.
- Any other arguments append `active: true`, then send the unchanged arguments exactly once through `sendUserMessage()`.
- The resulting turn consumes the pending kernel before model execution.

Add tests for bare activation, activation with a task, exact `off` parsing, task delivery once, and kernel injection once.

### 2. High: the planned skill packaging does not provide the promised commands

**Location:** [Pi-native sticky mechanism](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:75), [Reflect](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:568), [implementation scope](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:650)

**Evidence:** Pi registers skills as `/skill:<name>`. `disable-model-invocation: true` only removes a skill from the model prompt. It remains explicitly available through `/skill:<name>`. See [skills.md](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/skills.md:73) and its [frontmatter contract](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/skills.md:137).

Registering the whole skill directory would therefore:

- Provide `/skill:reflect`, not the promised `/reflect`.
- Expose `/skill:cx`, which injects the kernel without setting the boolean state, marker behavior, compaction refresh, or `/cx off` lifecycle.

**Consequence:** Reflect’s documented entrypoint does not exist, while CX gains an unintended bypass that produces inconsistent mode behavior.

**Smallest correction:** Choose one explicit contract:

- Rename the public Reflect command to `/skill:reflect`; or
- Add a real `/reflect` extension command.

Do not register the CX kernel as a public Pi skill. Keep it as an extension-owned resource, or register only the Reflect skill path. Add discovery tests proving the available commands, the absence of `/skill:cx`, and successful resolution of every linked CX reference from the installed package location.

### 3. High: sticky state is simultaneously branch-local and session-global

**Location:** [activation promises](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:45), especially lines 54 and 55, versus [current-branch reconstruction](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:81)

**Evidence:** `appendEntry()` creates a child of the current leaf. `getBranch()` returns only ancestors of the selected leaf. See [session-manager.js](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js:819) and [getBranch()](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js:943).

Tree navigation can move the leaf to a point before activation. See [agent-session.js](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:2408). Forking copies only the path to the selected target. See [session-manager.js](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js:1072) and [fork handling](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session-runtime.js:174).

**Consequence:** Under the specified current-branch reducer, tree navigation or a fork from before activation clears CX without `/cx off`. That contradicts both sticky session state and unconditional fork inheritance.

**Smallest correction:** Prefer the session-global interpretation. Reconstruct from the latest CX entry across the entire session, not only the selected branch. On `session_start` with reason `fork`, read the latest source state through `previousSessionFile` and append that boolean to the new session. Test:

- Tree navigation to before activation.
- Forking from before activation.
- Reload and resume.
- `/cx off` followed by tree navigation.
- A fork after deactivation.

The alternative is to declare state branch-local and weaken the fork and “only `/cx off`” promises.

### 4. High: Reflect’s default subagent behavior violates its privacy and authority rules

**Location:** [Reflect session handling](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:574) and [approval boundary](/Users/charliexue/Projects/personal/pi-personal-cxstack/docs/cxstack-v0-design.md:589)

**Evidence:** The installed `pi-subagents` runtime:

- Creates a mission tracker by default for an ordinary task. See [configuration.md](/Users/charliexue/.pi/agent/npm/node_modules/pi-subagents/docs/configuration.md:375).
- Writes input, output, transcript, and metadata artifacts by default. See [configuration.md](/Users/charliexue/.pi/agent/npm/node_modules/pi-subagents/docs/configuration.md:399) and [tool-reference.md](/Users/charliexue/.pi/agent/npm/node_modules/pi-subagents/docs/tool-reference.md:55).
- Always persists child sessions. See [configuration.md](/Users/charliexue/.pi/agent/npm/node_modules/pi-subagents/docs/configuration.md:270).

The built-in [reviewer](/Users/charliexue/.pi/agent/npm/node_modules/pi-subagents/agents/reviewer.md:1) is correctly read only. The persistence defaults are the problem.

A child that reads the raw parent session places that content into its provider request and persistent child transcript. `artifacts: false` does not disable the child session log.

**Consequence:** Reflect can create a tracker before approval and can persist private parent-session evidence in another provider’s child session. This conflicts directly with the stated tracker and privacy boundaries.

**Smallest correction:** Require `context: "fresh"`, the read-only `reviewer` agent, `mission: false`, and `artifacts: false`. Since sessions cannot be disabled, the parent should create a bounded, redacted digest and pass that instead of the raw session path. If raw cross-provider review remains required, the specification must explicitly authorize that disclosure and define retention and deletion behavior.

Add a deterministic privacy test using sentinel private data. Verify that no mission or debug artifact is created and that the sentinel does not enter the child prompt, session, or output.

## Unknowns requiring a design choice

- Whether CX activation is truly global to a Pi session or local to each branch. The current goal and `/cx off` rule favor session-global state.
- Whether explicit Reflect invocation authorizes sending the complete raw transcript to a complementary provider and retaining it in a child session. The current privacy wording does not answer this.

## Verified feasible surfaces

Pi 0.84.2 supports the intended `before_agent_start` message and system-prompt injection. Manual and automatic compaction rebuild context before `session_compact`. Overflow recovery emits that event, then removes the aborted assistant response before retry. The proposed kernel steering order is therefore feasible. See [manual compaction](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1367) and [overflow ordering](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1670).

All lane-two specialist targets and the separate [Pango PHP skill](/Users/charliexue/Work/pango/backend-app/.agents/skills/pango-php-style/SKILL.md:1) exist. The three-lane authority separation is clear. No files were modified.

**NO GO for local implementation until the command, packaging, branch-state, and Reflect privacy contracts are corrected.**
## Parent disposition after the full reviews

All seven confirmed findings from the first Claude and GPT reviews were accepted. The design now defines:

- An append-only active and inactive directive lifecycle.
- Exact literal prompt counts.
- Real extension commands backed by private resources.
- Exact `/cx <task>` forwarding.
- Session-wide state across tree navigation and fork or clone.
- A bounded, redacted Reflect digest with no raw transcript in the child.

The corrected plan was frozen and rechecked by both model families.

## Claude final recheck

# CXStack v0 Final Recheck

**1. Command contract — PASS.**
All five cases are exhaustively defined: bare `/cx` inactive (state + armed kernel, no turn), bare `/cx` active (no-op), `/cx <task>` inactive (state + kernel + one `sendUserMessage()`), `/cx <task>` active (one send, marker only, no second kernel), `/cx off` active (inactive message newest, pending cleared, no turn), `/cx off` inactive (no-op). The one apparent tension — `/cx <task>` while active but with a kernel still pending from a prior bare `/cx` — is resolved deterministically by the `before_agent_start` rule: a pending directive is injected and the marker is suppressed on that turn. Validation items 1–3 match the contract. No silent turn, duplicate task, or marker/kernel collision path exists.

**2. State and directive lifecycle — PASS.**
State is a boolean in out-of-context entries; effective state is the latest entry session-wide, so tree navigation cannot change it while the branch-inspection + pending-directive rule repairs any branch whose newest explicit CX message mismatches. Fork/clone read `previousSessionFile` and append the inherited state. Compaction (manual, threshold, overflow) adds at most one directive and only when the rebuilt context's newest directive is missing or stale; never-activated sessions get no inactive message; a later kernel supersedes an inactive message under the append-only newest-governs rule. The "refresh kernel after compaction" summary is refined, not contradicted, by the conditional mechanism. No unnecessary prompt growth path found.

**3. Resource privacy — PASS.**
Extension-only `package.json` registration, explicit prohibition on registering CX/Reflect as skills or prompts, resources resolved from the extension file location with absolute-path injection, and validation item 8 checking RPC discovery for absence of `/skill:cx` and `/skill:reflect`. Discovery is closed to the two commands.

**4. Reflect composition — PASS.**
The ordinary memory path (visible, immediate save of Charlie-stated stable preferences) and the Reflect path (bounded digest → fresh complementary read-only child → parent verification against `PI_SESSION_FILE` → Charlie approval → apply selected only) are disjoint and non-contradictory: the ordinary path is authorized by Charlie's explicit statement; Reflect-originated writes of any class, including papercuts, wait for approval, while in-task papercut appends remain governed by the separate papercut lifecycle. Child privacy (digest only, no raw path or transcript) composes with the sentinel validation probe. No contradiction found.

**5. Literal counts and scope — PASS.**
Marker: exactly 18 words as claimed. Global baseline body: exactly 31 words (header excluded, matching "31-word body"). Kernel literal texts (opening 20 + eight principle lines 125 + closing 46 + capability index 53) total 244 words — within the stated 220–250 budget, though with little headroom; the literal texts being authoritative removes ambiguity. Playbook drafts fall in or near the roughly 150–250 word band. The three implementation lanes cover every mechanism the spec requires (cx.ts, reflect.ts, kernel + four playbooks + four conditional references, reflect resource, papercut wording in `vendor/pi-memory`, global baseline, specialist edits, Pango skill change) and exclude everything the spec forbids. No orphan feature or unowned mechanism.

---

**Verdict: GO** for local implementation, subject to the snapshot's own constraints — Charlie's explicit approval is still required, and no commit, push, PR, merge, deployment, or publication is authorized.

## GPT source recheck

The snapshot hash matches. The design is not ready for implementation because Pi allows extension commands during an active run, but the snapshot does not define that case.

1. **FAIL: command forwarding and no-op behavior**

The idle behavior is implementable. Pi preserves everything following the command’s first space, so the handler can use `args.trim() === "off"` only for classification while forwarding the original task unchanged. This matches the [exact `/cx` contract](/tmp/cxstack-v0-design-final-recheck.md:47) and Pi’s [command argument parsing](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:924).

However, Pi executes extension commands immediately even while streaming. A plain `sendUserMessage()` then requires `deliverAs`; otherwise it fails, and the extension wrapper only reports the asynchronous error. Evidence: [immediate command execution](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:783), [streaming delivery requirement](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md:1426), and [caught asynchronous failure](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1855).

The handler could therefore append active state and then lose the task.

2. **PASS: session-wide state and directive reconstruction**

The specified mechanism is supported:

- `getEntries()` returns the complete append-only session, while custom state entries stay outside model context.
- The active branch context can be rebuilt and inspected independently.
- Fork and clone provide `previousSessionFile`, allowing the new session to inherit the source session’s latest global state even when the selected branch predates activation.
- Tree changes rebuild context before the event.
- Manual, threshold, and overflow compaction rebuild context before `session_compact`.

This matches the [state and lifecycle specification](/tmp/cxstack-v0-design-final-recheck.md:89), Pi’s [complete entry access](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js:976), [context-building rules](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md:320), [fork lifecycle](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session-runtime.js:174), and [post-compaction rebuilding](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1670).

The active kernel and inactive tombstone design correctly handles append-only history by treating the newest explicit directive as authoritative.

3. **FAIL: directive and marker delivery ordering**

For idle prompts, the ordering is correct. Pi constructs the user message, runs `before_agent_start`, appends returned persistent custom messages, applies the modified system prompt, and only then starts the agent. That supports the promised kernel-or-marker behavior. Evidence: [specification](/tmp/cxstack-v0-design-final-recheck.md:93) and [Pi prompt ordering](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:867).

The overflow compaction ordering is also sound. Pi rebuilds context, emits `session_compact`, removes the failed assistant response, and drains steering messages before the retry call.

The same streaming ambiguity still breaks the overall promise. Queued `sendUserMessage(..., { deliverAs: "steer" })` messages enter the running agent loop directly. They do not pass through `before_agent_start`, so an inactive `/cx <task>` would not receive its pending kernel and an active task would not receive the promised system marker. `/cx off` with `triggerTurn:false` is appended to session state but not to the already-created agent context snapshot.

4. **PASS: private resources and command-only packaging**

The plan correctly registers extensions without registering CX or Reflect as skills or prompts. With a Pi manifest present, package discovery loads only explicitly listed resources, so private files under `resources/` do not acquire a skill-command path. Pi also reports extension commands, prompts, and skills as separate command sources. Evidence: [packaging contract](/tmp/cxstack-v0-design-final-recheck.md:666), [manifest-only collection](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/package-manager.js:1805), and [separate skill command naming](/Users/charliexue/.local/share/mise/installs/node/24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1824).

Resolving from `import.meta.url` and injecting an absolute installed resource root is feasible and already matches the package’s extension pattern.

5. **PASS: Reflect feasibility and privacy mechanism**

The [Reflect contract](/tmp/cxstack-v0-design-final-recheck.md:579) is supported:

- The parent can use the exact current session path.
- `context: "fresh"` prevents transcript inheritance.
- The built-in reviewer has only `read`, `grep`, `find`, and `ls`.
- `mission:false` creates no mission or shared state.
- `artifacts:false` suppresses debug artifacts.
- Pi-subagents still creates a separate persisted child session, so passing only the bounded redacted digest limits what that session records.
- The parent retains the raw source for verification.
- The focused sentinel probe checks every stated persistence sink.

Evidence: [fresh, mission, and artifact controls](/Users/charliexue/.pi/agent/npm/node_modules/pi-subagents/docs/tool-reference.md:37), [reviewer tool restrictions](/Users/charliexue/.pi/agent/npm/node_modules/pi-subagents/agents/reviewer.md:1), and [retained child-session behavior](/Users/charliexue/.pi/agent/npm/node_modules/pi-subagents/docs/tool-reference.md:107).

This is a controlled data-flow guarantee, which is what the snapshot specifies. It is not an operating-system sandbox.

6. **FAIL: regression-test sufficiency**

The [listed tests](/tmp/cxstack-v0-design-final-recheck.md:645) adequately cover idle commands, state restoration, navigation, all compaction classes, discovery, installed references, and Reflect persistence sinks.

They do not execute `/cx`, `/cx <task>`, `/cx off`, or `/reflect` while an agent run is active. Consequently, they can pass while state is mutated but the task, kernel, marker, or inactive directive is lost or delivered at the wrong boundary.

The single material ambiguity is the policy for extension commands received during streaming. The specification must choose whether to reject them without mutation, defer them until idle, or define complete steering behavior that preserves the exact kernel, marker, inactive-message, and no-extra-turn promises. The tests must then cover that policy.

NO GO
## Streaming-command correction

The GPT source recheck found one additional material edge. Pi executes extension commands during active runs, while queued user messages bypass `before_agent_start`. The parent accepted the finding.

The final rule is that `/cx`, `/cx <task>`, `/cx off`, and `/reflect` first require `ctx.isIdle()`. When false, they reject before every state, context, task, transcript, mission, artifact, or model side effect. The user retries after Pi settles.

The corrected immutable snapshot has SHA-256 `07d0108b3b92cc3255f01da6938e20650c5783500bf5cf682d6b7c44a9f7415b`.

## GPT targeted streaming recheck

PASS

- Snapshot SHA-256 matches `07d0108b3b92cc3255f01da6938e20650c5783500bf5cf682d6b7c44a9f7415b`.
- The design requires the idle check before reading state, loading private input, or sending messages, with user retry after settlement: [snapshot:47](/tmp/cxstack-v0-design-streaming-fix.md:47). It reiterates “before any command side effect” for `/cx`: [snapshot:93](/tmp/cxstack-v0-design-streaming-fix.md:93), and “performs no work before that check” for `/reflect`: [snapshot:582](/tmp/cxstack-v0-design-streaming-fix.md:582).
- Pi parses `/cx`, `/cx <task>`, and `/cx off` through the same `cx` handler, passing the remainder as arguments: [agent-session.js:924](/Users/charliexue/.cache/aube/virtual-store/@earendil-works+pi-coding-agent@0.84.2-823301d910cccc67/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:924). Therefore the handler-first check covers all three forms.
- Pi executes extension commands before its streaming and queue checks: [agent-session.js:797](/Users/charliexue/.cache/aube/virtual-store/@earendil-works+pi-coding-agent@0.84.2-823301d910cccc67/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:797). The TUI also deliberately executes extension commands immediately during compaction or streaming: [interactive-mode.js:2478](/Users/charliexue/.cache/aube/virtual-store/@earendil-works+pi-coding-agent@0.84.2-823301d910cccc67/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js:2478).
- `ctx.isIdle()` is bound to `!_isAgentRunActive`: [agent-session.js:591](/Users/charliexue/.cache/aube/virtual-store/@earendil-works+pi-coding-agent@0.84.2-823301d910cccc67/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:591), [agent-session.js:1893](/Users/charliexue/.cache/aube/virtual-store/@earendil-works+pi-coding-agent@0.84.2-823301d910cccc67/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1893). That flag remains active through retries, compaction, and queued continuations until settlement: [agent-session.js:744](/Users/charliexue/.cache/aube/virtual-store/@earendil-works+pi-coding-agent@0.84.2-823301d910cccc67/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:744).
- The original risk is confirmed: streaming messages return through the queue path before `before_agent_start`, which appears only on the idle prompt path: [agent-session.js:830](/Users/charliexue/.cache/aube/virtual-store/@earendil-works+pi-coding-agent@0.84.2-823301d910cccc67/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:830), [agent-session.js:884](/Users/charliexue/.cache/aube/virtual-store/@earendil-works+pi-coding-agent@0.84.2-823301d910cccc67/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:884).
- The focused test contract explicitly covers all four forms and asserts rejection before state, context, task, transcript, mission, artifact, or model effects: [snapshot:646](/tmp/cxstack-v0-design-streaming-fix.md:646). The remaining cases preserve the already-reviewed idle behavior.

GO
## Final disposition

Claude returned GO on the full corrected specification. GPT returned GO after the accepted streaming-command correction. Parent verification accepts both verdicts. No known design or Pi feasibility blocker remains for local implementation.
