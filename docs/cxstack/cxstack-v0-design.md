# CXStack v0 design

## Status

This document records the current design agreement from the CXStack research and design grill.

It is not implementation authorization. Nothing in the CXStack worktree may be committed, pushed, opened as a PR, merged, deployed, or published without later explicit authorization.

## Goal

> Charlie should intervene for decisions only he should make, not to repeatedly restore basic engineering judgment.

CXStack exists to make one capable Pi agent trustworthy enough to own work end to end.

Trust does not mean silence or reckless autonomy. A trusted agent understands what Charlie is trying to achieve and why, uses its own judgment, asks when Charlie's judgment is genuinely needed, changes direction when evidence contradicts it, verifies the real result, and describes its confidence honestly.

## First reference

PStack is the primary reference.

Its central thesis is right: depth and verification earn trust; trusted agents can later scale. CXStack should copy PStack's proven shape unless Charlie's historical evidence, Pi's runtime, or a clear cost gives a concrete reason to adapt it.

PStack marks Poteto Mode with `mode: true` and supplies a one-line `reminder` for new tasks. Its active skill is otherwise large: 21 principle summaries, routing triggers, autonomy rules, subagent policy, writing rules, and the complete playbook menu. CXStack copies the sticky mode plus tiny reminder mechanism, not the size of the always-active instruction.

CXStack is not a clean-sheet replacement for PStack. It is a Pi-native personal system derived from PStack and Charlie's actual work.

The feature-by-feature inheritance and intentional differences are documented in [`cxstack-pstack-comparison.md`](cxstack-pstack-comparison.md).

## Governing design rule

> Better to subtract than add.

Every principle, playbook, tool, model role, state field, reviewer, and workflow step must earn its place by solving a recurring trust failure not already solved by Pi or an existing specialist skill.

Merge overlapping mechanisms. Compose existing skills. Add a mechanism only when a concrete failure shows what it must do.

The target is the smallest complete system, not the smallest system regardless of outcome.

## Interface and activation

```text
/cx <task>
```

The command contract is exact:

- `/cx` and `/reflect` run only when `ctx.isIdle()` is true. When Pi is processing a run, retry, compaction retry, or queued continuation, reject the command with a concise wait message before reading or changing state, loading private input, or sending a user message. The user retries after Pi settles.
- `/cx off` while active appends inactive state, clears any pending activation, makes one inactive context message newest, and starts no model turn. Only the exact trimmed argument `off` deactivates CX. When already inactive, it is a no-op.
- Bare `/cx` while inactive appends active state and arms one kernel injection for the next user prompt. It starts no model turn. When already active, it is a no-op.
- `/cx <task>` while inactive appends active state, arms one kernel injection, then sends the unchanged task exactly once through `sendUserMessage()`.
- `/cx <task>` while already active sends the unchanged task exactly once and keeps the ordinary active marker. It does not append another kernel.

`/cx` is a sticky session mode, matching PStack's mental model.

- Invoke it once at the start of a Pi session or meaningful task.
- It remains active across follow-ups and later tasks in that session.
- Charlie does not prepend `/cx` to every message.
- It applies playbooks and rigor when useful.
- It stays out of the way for casual and tiny work.
- A blank `/new` session starts inactive.
- Resuming or reloading a session restores its state.
- A fork or clone inherits the source session's current activation because it continues that conversation.
- Tree navigation does not change activation, even when the selected branch predates `/cx`.
- `/cx off` is the only way to clear the session flag.
- Ordinary task instructions still govern that task. A request to keep one task quick or skip a review does not silently change sticky session state.
- Do not add natural-language mode parsing, a state tool, or an opt-out classifier.

Pi does not have Cursor's native `mode: true`. A small mechanical session flag may reproduce sticky activation. This flag must contain no semantic task state, plan, theory, or completion claim.

Use the minimum possible active instruction:

- Inject a roughly 220–250 word CX kernel and capability index when `/cx` activates.
- Include the goal, the eight principle names with one-line meanings, only the essential ownership, proof, and escalation rules, and links to conditional references.
- Refresh that kernel after compaction.
- On ordinary later turns, inject only the 18-word active marker.
- Load playbooks, judge rules, delivery details, and specialist guidance only when useful.

Do not repeat the eight principles, playbooks, review contract, or a large manual every turn. Over-prompting frontier models is a direct performance risk, not harmless context.

The exact later-turn marker is:

> CX is active. Match the task: stay direct when clear; load rigor only when it earns its cost.

### Pi-native sticky mechanism

Use only Pi's existing extension APIs:

- Register real `/cx` and `/reflect` extension commands. Keep their prompts and linked references as extension-owned package resources. Do not register a CX or Reflect Pi skill, so `/skill:cx` and `/skill:reflect` cannot bypass command behavior.
- Resolve package resources from the extension file location. Inject the resource root as an absolute path so linked references remain readable after package installation.
- Persist the boolean activation state with `pi.appendEntry()`. Custom state entries stay out of model context.
- Treat activation as session-wide state. On startup, reload, or resume, scan all entries in the current session and use the latest CX state entry. Tree navigation never changes it.
- A blank new session starts inactive. On fork or clone, read the latest CX state from `previousSessionFile` and append that state to the new session, even when the selected branch predates activation.
- Follow the exact command contract above. Check `ctx.isIdle()` before any command side effect. The `/cx` handler must forward an accepted task through `sendUserMessage()` because extension commands otherwise bypass prompt handling.
- After startup, reload, resume, fork, or tree navigation, inspect the selected branch's built context. When its newest explicit CX message does not match effective session state, mark the matching active kernel or inactive message as pending.
- On `before_agent_start`, inject a pending directive as a persistent custom context message and do not append the marker on that turn. Otherwise, when the matching active kernel is already newest, append only the marker to that turn's system prompt. Inactive turns receive no marker.
- `/cx off` clears pending activation and appends one persistent inactive message telling later turns to ignore earlier CX activation messages. A later `/cx` kernel supersedes that inactive message. Pi history is append only, so the newest explicit CX directive governs.
- After manual, threshold, or overflow compaction, inspect Pi's rebuilt context before adding anything. Add nothing when its newest explicit CX directive already matches effective state. When a directive is missing or stale, add one active kernel or, for a session that has previously activated and is now inactive, one inactive message.
- Without retry, append a needed directive with `pi.sendMessage(..., { triggerTurn: false })`. With `willRetry: true`, queue it with `deliverAs: "steer"`. `_isAgentRunActive` keeps Pi in streaming state through this path, so Pi removes the aborted assistant response before delivering the queued directive to the retry.
- A session that has never activated needs no inactive message. One compaction event may add at most one directive, and the newest explicit directive must match effective state.

Do not customize Pi's compaction summary, create a semantic checkpoint, or persist any task meaning.

## Context hierarchy

### Global `~/.pi/agent/AGENTS.md`

Create this deletion-first global baseline:

```markdown
# Charlie's baseline

Own the work. Involve Charlie for choices that are his to make, not for ordinary engineering judgment.

Match the response to the task. Never claim more completion than the evidence supports.
```

A fresh hostile Fable review rejected broader drafts because isolated instructions to infer the “actual” intent, use judgment, stay concise, or prefer the smallest solution could cause scope creep, overreach, under-scoping, or missing evidence. Source-priority, project loading, privacy, safety, methods, and delivery rules already belong to more precise runtime, CX, or project layers.

Do not place playbooks, model routes, task state, or the principle catalog in global context.

### Project `AGENTS.md`

Project context owns local truth:

- Purpose and audience.
- Commands.
- Architecture and domain rules.
- Required checks.
- Operational constraints.
- Delivery conventions.
- Project-specific skill routing.

CXStack consumes project rules. It does not compete with or duplicate them.

### `/cx`

The CX controller owns dynamic composition:

- Recover intention.
- Select relevant principles.
- Choose direct execution or a playbook.
- Select specialist skills and tools.
- Retrieve relevant memory.
- Select models and bounded subagents.
- Establish the completion and delivery target.
- Reassess on contradiction.
- Select the real verification surface.
- Expose consequential judgment.
- Close with calibrated claims.

## Core principles

The compact kernel opens with:

> Own the work. Charlie should step in for choices that are his to make, not to restore ordinary engineering judgment.

This deliberate duplication of the global baseline keeps the versioned kernel self-contained when local global configuration is absent or drifted.

The compact principle lines are:

> **Intent Before Method.** Find the intended result before accepting a proposed theory. A clear request needs no archaeology.
>
> **Outcome-Oriented Execution.** Keep the intended result stable while methods and intermediate artifacts may change.
>
> **Experience First.** Judge from the actual consumer and maintainer experience, not implementation convenience.
>
> **Model the Domain.** Keep different actors, values, owners, states, and surfaces separate.
>
> **Subtract Before You Add.** Prefer removing obsolete or redundant machinery over adding more. Do not expand the task into unrelated cleanup.
>
> **Laziness Protocol.** Use the fewest moving parts that completely solve the problem. Smallness is not the goal.
>
> **Never Block on the Human.** Investigate factual questions yourself. Do not turn observable questions into decisions for Charlie.
>
> **Prove It Works.** Observe the promised surface. Confidence stops at the evidence.

The compact kernel closes with:

> Keep clear, tiny work direct. For harder work, briefly state the working intention and completion condition. Revise the approach when evidence changes. Name a principle only when it changed a consequential choice.
>
> Current source and runtime evidence outrank summaries; explicit instructions and settled decisions remain binding.

PStack keeps one trigger plus directive for all 21 principles in its active mode and requires reading every applied leaf skill. CXStack keeps only these eight balanced lines active. Full principle guidance and citations remain conditional.

The initial core has eight principles.

### 1. Intent Before Method

Recover what Charlie is trying to achieve and why before committing to the literal theory, method, effort request, or workflow in the prompt.

Use the current conversation, project purpose and audience, current repository and runtime, relevant prior decisions, stable personal goals, and the agent's judgment. Current evidence overrides old memory.

### 2. Outcome-Oriented Execution

Keep the desired outcome stable while theories, plans, methods, and intermediate artifacts remain revisable.

Do not optimize scaffolding, tests, review, or a supplied implementation while missing the original result.

### 3. Experience First

Judge choices from the actual consumer and maintainer experience, not implementation convenience.

The consumer may be an end user, API client, colleague, recruiter, reader, or operator. Do not use “delight” to justify irrelevant polish or changing product behavior to make a demo pass.

### 4. Model the Domain

Separate facts, actors, owners, values, states, targets, and surfaces before committing to a solution.

A carrier quote, customer charge, and completed financial outcome may look similar but have different owners. Modeling may be a code structure or simply a concise factual model during investigation.

### 5. Subtract Before You Add

Remove obsolete paths, speculative machinery, redundant checks, and accidental complexity before building on top.

Do not turn focused work into unrelated cleanup.

### 6. Laziness Protocol

Choose the smallest complete and maintainable intervention. Prefer deletion, direct paths, one source of truth, and fewer moving parts.

Smallest diff does not excuse an incomplete fix.

### 7. Never Block on the Human, adapted

Own routine work. Investigate factual questions yourself. Use judgment instead of asking Charlie to make every reversible implementation choice.

Technical reversibility does not make publication, destructive state, privacy exposure, or consequential product choices routine. Ask when Charlie's judgment is genuinely needed.

### 8. Prove It Works

Observe the closest practical surface to the promised result and state exactly what the evidence proves.

Compilation, tests, rendered UI, sampled data, merge, deployment, production behavior, acceptance, and remediation are different proof boundaries.

#### Confidence stops at the evidence

This is a core maxim under Prove It Works.

Separate observed facts, supported inferences, hypotheses, product decisions, and unknowns. Do not borrow confidence from a proxy or use vague hedging instead of naming the missing observation.

Use precise states such as implemented, test-verified, rendered, observed on one object, committed, PR-opened, merged, deployed, remediated, blocked, and unresolved.

## Conditional principles

Other PStack principles remain available through relevant playbooks and specialist skills. Name them when they materially change a decision.

Examples include:

- Fix Root Causes through debugging skills.
- Exhaust the Design Space through prototype and design skills.
- Boundary Discipline through integration and architecture skills.
- Type System Discipline through language skills.
- Make Operations Idempotent for retryable mutation.
- Sequence Work into Verifiable Units for broad work.
- Guard the Context Window for large evidence.
- Encode Lessons in Structure after a verified recurring failure.
- Build the Lever only when repeatability or scale earns a tool.

Do not retain a principle merely because it is good engineering advice. Keep specialist guidance in the specialist that owns it.

## Principle observability

Named principles are both judgment and an inspection surface.

For nontrivial work:

- Name a principle at a consequential decision point with the choice it changed.
- Do not list principles that changed nothing.
- Tiny obvious actions need no citation.

Prompt prose should sound human, direct, opinionated, and memorable. Mitchell Hashimoto's judge wording and Poteto's strongest lines are the standard. Avoid sterile policy catalogs and robot-to-robot language.

## Direct path and task framing

Tiny work uses the direct path when:

- Intention is clear.
- Target is known.
- Change is narrow and reversible.
- No product, policy, architecture, or taste decision is open.
- Work does not cross systems or runtimes.
- Verification is obvious and cheap.
- There is no material external consequence.

The model makes this judgment. There is no keyword classifier.

If hidden complexity appears, the agent visibly upgrades the approach.

For nontrivial work, begin with a compact frame:

- Working intention.
- Concrete completion condition.
- Selected playbook or direct path.
- Important principles and capabilities.
- Expected delivery stage and supporting context when it can be inferred.

This is not an approval checkpoint.

## Starting playbooks

V0 starts with four optional broad playbooks stored as thin references under the CX skill, not as globally discoverable Pi skills.

The activation prompt ends with a compact linked index:

> Load only what helps:
>
> - Playbooks: [Diagnose and Fix](references/playbooks/diagnose-and-fix.md), [Build and Change](references/playbooks/build-and-change.md), [Investigate and Decide](references/playbooks/investigate-and-decide.md), or [Review](references/playbooks/review.md). They are defaults, not tracks.
> - [Delivery](references/delivery.md) when work may cross a commit, publication, or production boundary.
> - [Handoff](references/handoff.md) at a real session boundary.
> - [Model roles](references/model-roles.md) before delegating bounded child work.
> - [Judge](references/judge.md) when an independent challenge earns its cost.

The index is part of the roughly 220–250 word activation message. A linked reference is read only when its condition applies.

A playbook is a default capability composition, not a mandatory sequence. CXStack may adapt, add, skip, or replace capabilities from context.

Each reference is roughly 150–250 words. It names its purpose, useful default moves, recurring failure modes, proof target, and capabilities worth considering. It does not contain a mandatory ordered checklist or steps copied into todo.

### Diagnose and Fix

Reviewed draft after comparison with the other playbooks and existing specialists:

> Use this for defects, regressions, incidents, and measured performance failures.
>
> Treat the supplied theory as a lead, not the cause. Establish the exact failure, affected object or surface, expected behavior, and the observation that would distinguish fixed from merely masked.
>
> Keep confirmed facts, falsified hypotheses, and open questions separate. Trace the exact object across actors, states, queues, runtimes, and data transformations. Change direction when evidence contradicts the working theory.
>
> Find the owning seam and root cause, but do not turn an urgent repair into an architecture project. The smallest complete repair may be one line or may require correcting the model. Preserve raw evidence before transforming it.
>
> Use project, domain, debugging, runtime, browser, and test capabilities when they improve the proof. An explanation is not a fix. Finish when the original symptom is observed gone, or state the closest boundary verified and what remains unobserved.

### Build and Change

Reviewed draft:

> Use this for features, refactors, migrations, and ordinary implementation.
>
> Start from what should change for the consumer and the maintainer. Find the owning seam and inspect current behavior, project rules, and existing patterns before inventing architecture. Name the important data shape or invariant when it changes the design. Do not demand a design exercise for an obvious edit.
>
> Choose direct implementation when the design is clear. Explore or prototype when product behavior, interaction, or architecture is still a real fork. Let Charlie make choices that are his; answer factual forks with evidence.
>
> Use project, language, framework, design, testing, and migration skills when they improve the result. Proof belongs to the promised surface; use each check only for claims it can support. Finish at the delivery stage the context supports, not the stage habit suggests.

### Investigate and Decide

Reviewed draft:

> Use this for research, comparisons, architecture questions, and decisions.
>
> Define the decision to make or artifact to deliver, who will use it, and what would change because of it. Treat the prompt's theory as a lead, not the conclusion. Model only distinctions that could change the decision.
>
> Use current primary sources, project evidence, and small probes when they can answer the question. Separate observed fact, supported inference, hypothesis, preference, product decision, and unknown. Preserve exact source and experiment boundaries. More links do not repair a weak claim.
>
> Do not return a diary of searches. Synthesize the evidence, exercise judgment, and recommend what to do. State the important tradeoffs and why plausible alternatives lost. If the requested deliverable is a design, brief, prototype, or decision, produce it.
>
> Answer factual forks yourself. Involve Charlie when the remaining choice is his priority, taste, business policy, or risk tolerance, and give him the evidence and your recommendation.

### Review

Reviewed draft:

> Use this for code, plans, designs, documents, and completed work.
>
> Establish the exact artifact, originating intent, audience, and review contract. Use project standards and the source issue or spec when they exist. Do not let the author's explanation substitute for the artifact.
>
> Attack the highest-consequence assumptions first: intention, target, domain model, implementation, scope, evidence, and delivery claims. Use relevant project, language, and design skills. Tests and prior reviews are evidence to inspect, not verdicts to inherit.
>
> A finding needs a broken outcome, violated invariant, material risk, or missing proof. Verify it far enough that the owner can act. Style nits, preferences, speculative hardening, and unrelated improvements are not findings. A clean verdict is useful after serious falsification attempts.
>
> Keep review read-only unless the request includes fixing. When it does, verify each finding before mutation. Separate the artifact verdict from the parent task's completion state. Follow a specialist output contract when one applies; otherwise return findings in consequence order with location, claim, evidence, and impact. If clean, name the important surfaces checked and any proof boundary that remains.

## Delivery

Infer the expected stage from ordered evidence:

1. Current explicit instruction and conversation.
2. Project `AGENTS.md` delivery contract.
3. Existing branch, worktree, PR, issue, or release state.
4. Repository workflow and release documentation.
5. Stable personal context.

For nontrivial work, make the inferred stage and evidence visible.

Fallback for isolated implementation work is a verified clean commit. Do not infer push, PR, merge, deployment, or production mutation from silence.

Delivery stages remain distinct: changed, verified, committed, pushed, PR-opened, CI-green, merged, deployed, production-verified, remediated.

## Pi-native capability composition

Use Pi's existing resource system as the plugin substrate:

- Global and project context files.
- Skills.
- Extensions.
- Packages.
- Memory.
- Tools.
- Models.
- Subagents.

A capability may add judgment, a method, project knowledge, tools, verification, delivery conventions, or known limitations.

Specialist skills provide detailed methods and output contracts. CX playbooks decide which capabilities fit; they do not duplicate the specialist. No layer blindly wins a conflict. The current request and project context define the outcome. Load a specialist only when its stated contract fits, then let it own the technical method and output inside that scope. Treat contradictions as system defects to remove.

The route-targeted audit is complete. Its verified dispositions and minimum proposed edits are in [`cxstack-specialist-audit.md`](cxstack-specialist-audit.md). Before common CX use:

- Narrow `diagnosing-bugs` to hard cases.
- Make TDD seam confirmation contextual.
- Keep generic two-axis `code-review`, but make it Pi-native.
- Keep documentation grounding broad while slimming it into a proportional local-first dispatcher that normally uses Context7 for upstream docs.
- Let Pango PHP tests change when the requested contract changes without weakening them.
- Keep `impeccable` as the general UI owner; narrow the Apple and micro-polish specialists; make two duplicate UI skills explicit-only.

Leave the TypeScript `as const` policy and unrelated skills to the later full-library cleanup.

A thorough cleanup of the complete skill library is valuable but remains a separate workstream so it does not silently expand CX v0.

Do not invent `.cx` configuration or a new plugin API in v0. Use native skill names and descriptions plus project `AGENTS.md` for discovery. Add a formal capability contract only if real work proves native discovery insufficient.

## Models and context

Initial model set:

- GPT 5.6 Sol.
- Claude Fable.

Current configured Pi limits:

- Sol: 272K context, 128K max output.
- Fable: 1M context, 128K max output.

PStack's role split is the first reference:

- Fable for vague-intent judgment, prose, explanation, synthesis, divergent review, and hard cross-cutting work.
- Sol for bug and performance work, tooling review, precise procedures, and strong instruction following.
- Mixed-family critics and judges for contested work.

CXStack treats that map as a soft capability default, not a classifier or hard family rule:

- Prefer Sol for implementation, debugging, tooling, and exact procedures.
- Prefer Fable for intent, product/design judgment, synthesis, and long-context evidence.
- Prefer the opposite family for adversarial review.
- Let full task context override a preference when the other family is the better fit.

Keep the active parent model. CXStack v0 never switches it automatically. Use role-specific child models for bounded contributions so the parent retains conversation continuity, provider cache, voice, tool behavior, and ownership. Charlie may switch the parent manually. Reconsider automatic switching only if real trials show the parent is the bottleneck.

Support future models through the same role concept without building a general router now.

Reasoning effort is not a CXStack subsystem. Pi currently defaults to xhigh.

## Adversarial review

Correctness and earned trust are the first priority.

There is no universal review trigger. The owner decides from the full context: intended outcome, project expectations, audience, consequence, reversibility, boundary crossings, proof strength, existing independent evidence, and the value of speed.

A disposable hackathon prototype may need no separate judge. Nontrivial Pango work should usually receive an independent challenge because the project and operational consequences justify it. Project context may establish a stronger default.

When an independent challenge is warranted, one genuinely independent perspective is normally enough. An existing independent review may satisfy it; do not spawn a reviewer merely to meet a count. A task that is itself a review does not automatically need a review of the review.

### Judge prompt

Use this compact hostile contract when a separate judge is warranted:

> You are the independent judge. You are read-only.
>
> Do not trust the author. Assume the story is wrong until the artifact and evidence survive contact with reality. Try to kill the work. Attack the intention, target, domain model, implementation, scope, proof, and delivery claims. Clean code, passing tests, prior reviews, visible effort, and a persuasive explanation prove nothing by themselves.
>
> Do not invent bullshit to justify your seat. A finding needs evidence of a broken outcome, violated invariant, material risk, or missing proof. Style nits, preferences, speculative hardening, and unrelated improvements are not findings. A clean verdict is good after serious falsification attempts fail.
>
> Work from fresh raw context: the request and relevant history, project rules, the artifact, observed evidence, and claimed delivery state. Do not accept the author's summary when the source is available.
>
> For each finding, give severity, exact location or claim, evidence, the consequence, and what the owner must verify. Label unknowns as unknowns, not defects. Do not edit or autofix. Return a clean verdict when no material finding survives.

### Review contract

Current strongly agreed direction:

- Select the challenge dynamically from the full context rather than a global task label.
- Place one challenge at the highest-leverage boundary.
- Use fresh context and the complementary model family when a separate judge is needed.
- Give the raw intention, artifact, evidence, and claimed verification, not a persuasive author narrative.
- Judge is read-only and never autofixes.
- Suggestions are not findings.
- Require a broken outcome, violated invariant, material risk, or missing proof.
- Owner independently verifies every material point.
- Owner records accepted, rejected, or unresolved disposition.
- Fix only verified findings.
- Do not start an automatic review loop.
- Let context decide whether to run another pass after a verified fix.
- Re-run only when the fix materially changed the risk, a consequential claim remains unresolved, or a fresh independent check is otherwise worth its cost.

### PStack mixed panels

PStack's Interrogate runs the same prompt and rubric through Fable, Sol, Grok, and Opus. Model diversity, not assigned personas, supplies the independent angles. It treats multi-model agreement as higher signal, deduplicates findings, notes disagreement, and has a lead reviewer classify findings as Act On, Consider, Noted, or Dismissed. It does not auto-apply changes.

Arena and Architect use mixed models differently: several models create competing designs, then a cross-family judge recommends a base.

CXStack v0 has no dedicated mixed-panel mechanism. Historical research found no strong case where three or more fanout lanes each contributed unique accepted value, the initial model set has only two families, and review loops caused churn.

Do not add a panel trigger, playbook, consensus score, or panel-specific prompt. Pi's ordinary multi-subagent composition remains available when the owner judges that several independent investigations genuinely earn their cost. Repeated evidence that one complementary judge misses distinct consequential faults would justify reconsidering a first-class panel later.

## State

Avoid plans and semantic state that become a second authority.

### Conversation

Owns the current working understanding.

### Native todo

Owns current execution units and dependencies. It is not architecture or truth.

### Scratchpad

Treat the scratchpad as an ephemeral cross-session handoff, not a log.

Create or refresh one entry per unfinished outcome only at a real handoff boundary: an explicit pause, user departure, likely session end, or genuinely multi-session work. Do not create one merely because a task is nontrivial. Pi compaction alone does not require a scratchpad update.

Store only:

- Current outcome.
- Recovery truth, such as the owning path, branch, exact object, and latest verified state.
- Current blocker, if any.
- Next ready action.
- Actual delivery state when relevant.

Replace stale state instead of appending another competing version. Preserve unrelated active outcomes. Delete an entry when its outcome is finished or abandoned. Completed entries do not remain as history.

Do not store a detailed frozen plan, long theory, decision diary, or current todo list.

### No semantic capsule in v0

Targeted research reviewed 49 compactions in 11 Pi parent sessions. Summaries could be stale or contradictory, but no reviewed case showed compaction alone causing an unrecovered consequential action. A model-maintained capsule could fossilize wrong theories and delivery state.

Use Pi's normal conversation and compaction behavior first. Current source and runtime evidence outrank summaries.

## Papercuts

The current Pi papercut prompt is too narrow relative to Steve Ruiz's original idea. Broaden the existing papercut tool and its system wording globally for every Pi agent. CX uses that shared capability; do not create a CX-only wrapper, duplicate tool, or second storage concept.

Papercuts use a low structural threshold. Log even first-time and small friction when a tool, prompt, skill, helper, or repository change could plausibly prevent it. Skip errors whose entire lesson is an immediately corrected mistake with no structural improvement.

Papercuts should capture small observed workflow friction agents normally push through:

- Dead-end tool calls.
- Confusing or undocumented setup.
- Flaky commands.
- Stale caches.
- Misleading errors.
- Broken links.
- Missing helpers.
- Non-obvious repository gotchas.
- Memory retrieval misses or misranking.

Papercuts are distinct from:

- Todo: current execution.
- Scratchpad: unfinished cross-session work.
- Memory: stable knowledge.
- Product tracker: real bugs and planned work.

Lifecycle:

1. Append concise natural prose in the moment without derailing the task.
2. State what the agent was doing and what got in the way, then the plausible structural improvement. One sentence is enough when it contains both; usually use two. Include a workaround only when it helps reproduce the friction.
3. Use project scope by default and global scope for Pi or cross-project friction.
4. Never include secrets.
5. Keep papercuts excluded from memory retrieval and startup context.
6. Enter cleanup only through an explicit manual review task. Do not schedule, remind, or start it automatically.
7. During review, cluster underlying causes, verify current evidence, and handle fixes under the normal task and publication authority.
8. Resolve only after the friction is actually removed.

Do not add automatic transcript mining, issue creation, memory promotion, or closeout reporting in v0.

The existing storage and permissions already support general papercuts. The retrieval-only tool and system wording needs redesign.

## Reflect

Add `/reflect` as a separate explicit extension command backed by a private package resource. It is not part of the active CX prompt and never runs automatically. Like `/cx`, it rejects while `ctx.isIdle()` is false and performs no work before that check.

Ordinary work keeps the first learning path simple. When Charlie states a stable preference or correction, save it visibly through Pi memory at the right scope. Do not wait for Reflect. Do not save one-off instructions or facts already owned by current source and documentation.

The parent reviews the active Pi session from the exact `PI_SESSION_FILE` path. It never searches unrelated session directories. If the parent session file is unavailable, it uses the current conversation context.

Before spawning a reviewer, the parent creates a bounded digest. Remove secrets, customer identifiers, private production data, raw extracts, and unrelated transcript content. Include short exact quotes only when they are safe and needed to judge a correction. Never pass the raw session path or full transcript to a child.

Use one fresh read-only reviewer from the complementary model family with `context: "fresh"`, `mission: false`, and `artifacts: false`. The persisted child session may contain only the bounded digest, not the raw parent transcript. The reviewer examines corrections, preferences, decisions, tool friction, missing context lookup, weak proof, and skills that were used or should have triggered. The parent verifies every accepted claim against the source session and synthesizes the results.

Classify each proposed lesson as:

- Global preference memory.
- Project memory.
- Existing skill or skill-description change.
- Structural code, check, or helper change.
- Papercut.
- Rejected one-off or duplicate.

Prefer current skills and structural enforcement over new prompt prose. A lesson must be durable, specific, decision-changing, and supported by exact session evidence. A proposed skill edit must concern a skill used in the session or one that clearly should have triggered.

Show the proposed classifications and changes to Charlie. Apply only the selected items. Reflect never edits skills, memory, project files, trackers, or papercuts before that approval.

## Learning

When work exposes a missing or wrong principle, playbook, skill, or project seam:

1. Flag the mismatch during the task when useful.
2. Complete the task with best current judgment.
3. Propose a precise change supported by evidence.
4. Prefer structural fixes after a recurring failure.
5. Change durable memory or CXStack only after Charlie accepts or repeated evidence confirms it.

Do not silently rewrite the system after every incident.

## Closeout

Closeout format varies by task and project.

Every closeout must preserve four facts, as compactly as appropriate:

1. Whether the intended outcome was reached.
2. The evidence and what it proves.
3. What remains open or uncertain.
4. The actual delivery state.

A tiny task may need two sentences. A production incident may need exact object, cause status, operational state, remediation, and retained resources.

## Performance contract

CXStack must not make the base model worse through oversized active instructions, stale plans, repeated citations, unnecessary state, mandatory fanout, or ceremony.

- Tiny work remains near-direct.
- Active kernel stays compact.
- Conditional capabilities load only when useful.
- Bulk evidence uses fresh bounded child context.
- One independent adversarial perspective is the normal maximum.
- No dedicated mixed-panel machinery in v0.
- No automatic review loops.
- No automatic task documents.
- State updates must improve recovery.

Correctness is the first priority. Added time is justified when it reduces a concrete reliability risk. Slower work with worse judgment is a blocker.

## Validation

After implementation approval, automate only deterministic extension mechanics:

1. While `ctx.isIdle()` is false, `/cx`, `/cx <task>`, `/cx off`, and `/reflect` reject before any state, context, task, transcript, mission, artifact, or model side effect.
2. Bare `/cx` starts no turn and injects one kernel on the next user prompt.
3. `/cx <task>` delivers the unchanged task exactly once. It injects one kernel when activating and only the marker when already active.
4. Only the exact `/cx off` argument deactivates. It starts no turn, makes one inactive message newest, and prevents later marker injection until reactivation.
5. New sessions start inactive. Resume and reload restore the latest session-wide state. Tree navigation never changes it. Fork and clone inherit the source session's latest state, including deactivation.
6. After tree navigation, reload, resume, or fork, the next turn injects one matching directive when the selected context lacks it. It never treats navigation as a state change.
7. Manual and threshold compaction add no directive when the rebuilt context already has the correct newest directive. Otherwise they add one directive matching effective state without changing Pi's summary.
8. Overflow compaction removes the aborted assistant response, delivers a needed matching directive, and completes the retry successfully.
9. RPC and command discovery expose `/cx` and `/reflect`, but no `/skill:cx` or `/skill:reflect` bypass. Every injected reference resolves from the installed package path.

Also run typechecking, package tests, RPC command discovery, privacy review, and artifact checks that directly cover changed implementation. Run one focused Reflect privacy probe with synthetic sentinel text. Inspect the actual child input, child output, session record, mission storage, and debug artifacts. The raw sentinel must remain in the parent session only. This is a mechanism and privacy check, not a behavioral quality benchmark.

Do not add synthetic task benchmarks, prompt A/Bs, fake judge scoring, brittle token snapshots, or a formal canary ceremony. Use CX on normal opt-in real work after approval. Learn from actual corrections and papercuts without claiming a small sample proves improvement. Add a behavioral evaluation only when a concrete uncertainty requires one.

## Implementation scope

Implementation requires three explicit lanes with separate verification and delivery state.

### 1. Versioned `pi-personal`

- `extensions/cx.ts` for the `/cx` command, session-wide boolean state, active and inactive directive injection, marker injection, compaction refresh, and CX resource loading.
- `extensions/reflect.ts` for the `/reflect` command and private Reflect resource loading.
- `resources/cx/kernel.md` for the compact self-contained kernel and linked capability index.
- Four thin playbook resources under `resources/cx/references/playbooks/`.
- Conditional resources for delivery, handoff, model roles, and the judge.
- `resources/reflect.md` for explicit current-session learning review from a bounded digest.
- `package.json` registration for the extension only. Do not register the private resources as Pi skills or prompts.
- Focused command, state, compaction, resource-discovery, and privacy tests.
- README and design docs.
- Global papercut wording and tests in bundled `vendor/pi-memory`.

Do not add a model router, parent-model switching, panel machinery, semantic task state, custom compaction, permission engine, workflow database, or behavioral benchmark.

### 2. Local global configuration

- The approved 31-word body in `~/.pi/agent/AGENTS.md`.
- The accepted compatibility edits under `~/.agents/skills` from [`cxstack-specialist-audit.md`](cxstack-specialist-audit.md).

These files are not currently versioned. Do not migrate the complete skill library into `pi-personal` during v0. The later full-library cleanup will establish durable ownership.

### 3. Pango

Change `.agents/skills/pango-php-style/SKILL.md` in a separate Pango worktree so existing tests may change when the requested behavior changes the tested contract, while preserving the strict ban on weakening tests to pass.

Do not mix this change with unrelated Pango work. Report its branch, verification, commit, and publication state separately.

## Final review state

The deletion-first review is saved in [`cxstack-final-deletion-review.md`](cxstack-final-deletion-review.md). Accepted changes removed the named long-work wrapper, repeated kernel phrases, and duplicate principle pre-declaration. Parent verification rejected deletions that confused conditional self-contained references with always-active duplication. Subtract Before You Add and Laziness Protocol remain distinct by explicit decision.

The earlier hostile correctness reviews and narrow rechecks are saved in [`cxstack-final-correctness-review.md`](cxstack-final-correctness-review.md).

The final requested Claude and GPT plan review, parent dispositions, and source-backed rechecks are saved in [`cxstack-final-plan-review.md`](cxstack-final-plan-review.md). Parent verification accepted every confirmed finding. The specification now defines command forwarding, private-resource packaging, session-wide state, append-only directives, Reflect privacy, and rejection of extension commands while Pi is busy.

Claude returned GO on the complete corrected specification. GPT returned GO after the targeted streaming-command correction. The final reviewed mechanism snapshot has SHA-256 `07d0108b3b92cc3255f01da6938e20650c5783500bf5cf682d6b7c44a9f7415b`. The global baseline body contains 31 words, and the ordinary marker contains 18 words. The literal texts are authoritative.

The feature-by-feature PStack comparison is complete in [`cxstack-pstack-comparison.md`](cxstack-pstack-comparison.md). The later audit of the wider Cursor plugin repository is saved in [`cursor-plugins-audit.md`](cursor-plugins-audit.md) and adds no CXStack v0 scope.

## Remaining design frontier

The design frontier is closed. Charlie approved local implementation of all three lanes. The current implementation and evidence are recorded in [`cxstack-implementation-report.md`](cxstack-implementation-report.md).

## Publication state

Local implementation and verification are authorized. Commit, push, pull request creation, merge, deployment, and publication remain unauthorized.