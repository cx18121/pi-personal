# CXStack

CXStack is a sticky work mode for Pi. It asks one agent to own a task from intent through verification. The agent should make routine engineering choices itself and ask only when the remaining choice needs your judgment.

It is based on the useful parts of [PStack](https://github.com/cursor/plugins/tree/main/pstack), adapted to Pi and this setup. It keeps the active prompt small and loads more guidance only when the task needs it.

## Use it

New blank sessions start with CX active, so you can send tasks normally. The footer shows `CX` while it is active.

You can still use `/cx` to start a task explicitly:

```text
/cx Fix the checkout regression. Reproduce it first and do not push.
```

CX stays active for later prompts in the same session. Turn it off for that session with:

```text
/cx off
```

Run `/cx` with no arguments to turn it back on. Explicit on or off state survives reloads, forks, and tree changes. Historical sessions created before default activation keep their prior state.

## What to expect

CX asks the agent to:

- Find the intended result before accepting a proposed theory.
- Judge the work from the consumer and maintainer experience.
- Keep different actors, values, owners, states, and surfaces separate.
- Remove obsolete machinery before adding more.
- Use the fewest moving parts that completely solve the problem.
- Investigate factual questions instead of asking you to decide them.
- Verify the promised surface and stop confidence at the evidence.

Direct is the default for ordinary questions, recommendations, reversible local work, and small fixes. Work earns a route only when a wrong result is costly, hidden, or hard to undo; when it materially affects production, persistent data, security, money, deployment, shared interfaces, or durable architecture; or when review or delivery is explicitly requested. A route names the authority boundary, not the amount of ceremony. Todo records actual independent work, dependencies, and waiting gates, never copied playbook steps. Direct work can escalate when consequences appear, and routed work can return to direct before process starts.

In this setup, `~/.config/rpiv-todo/config.json` owns Todo creation guidance through the tool's prompt override. Global `~/.pi/agent/AGENTS.md` owns the writing baseline. Both live in the dotfiles `pi` package, outside CXStack. Install that package alongside CXStack and reload Pi after changing these prompts.

CX remains active across follow-up prompts, session tree changes, forks, reloads, and compaction. Its control state is one session boolean. It also records the content hash of the active kernel and of each successfully loaded reference. These markers contain no prompts, source code, paths, customer data, or tool output. CX does not store a plan, task summary, theory, or completion claim. The visible Todo list carries actual unfinished work when a task needs one.

Readiness Review owns pre-implementation review, including the structural triggers and architecture questions. When both readiness and architecture apply, one child covers both. A settled review carries into implementation unless the direction, scope, or design materially changes.

During Correctness Review, independent non-destructive checks may run against the unchanged reviewed artifact. The review still blocks mutation, delivery, and completion. Checks invalidated by later fixes must run again.

## Audit

Run `/cx-audit` when you want to examine recent CX sessions for ways to improve the system:

```text
/cx-audit
```

The audit excludes the current session and reviews every prior session that used the current kernel version. Before versioned sessions exist, it reviews every detected CX session. It processes the cohort in batches of six, reads only the exact selected local session files, and looks for evidence about ownership, changed decisions, unnecessary work, verification, delivery, and missed or ineffective guidance.

The result is a qualitative review, not a score or dashboard. It proposes exact improvements and waits for approval before changing CXStack or any other durable surface.

## Reflect

Run `/reflect` after a useful session when you want to review what should improve next time:

```text
/reflect focus on the unnecessary questions and weak verification
```

Reflect reads only the current session. The parent removes secrets, customer identifiers, private production data, and unrelated conversation before asking one fresh reviewer for a challenge.

Reflect proposes exact changes and waits for your selection. It does not write memory, change a skill, edit project files, create tracker items, or change papercuts before approval.

Reflect works whether CX is active or not.

## Correction loop

In an active CX session, the model appends a structured marker when it identifies a correction. The correction extension removes the marker before display, stores the interpretation with exact session entry references, and shows an undoable notification. Ordinary responses need no marker and create no warning. Capture adds no tool call or model turn. `correction_log` exists only for approved Reflect backfills.

Correction candidates live in a private local event log outside normal prompt context. Grouping runs asynchronously against correction records only. A ready proposal must name a proof plan and earn any new eval it adds. It assigns an optional intervention to exactly one owner. The owners are code or tests, AGENTS.md, project documentation, CXStack, a skill, memory, or papercuts. Ready patterns appear at a later natural handoff and remain reviewable through `/corrections`. Accepting one proposal authorizes that exact local action and focused verification. Failed proof rejects the intervention. Commit, push, publication, and deployment remain separate.

Reflect can offer a missed correction for one-click backfill when the active model failed to record it.

## Improve CXStack

Reflect can classify a confirmed recurring failure as a CXStack change. It checks whether architecture can remove the failure first, then whether an automated check can catch it. It changes guidance only when code cannot enforce the behavior.

The parent reads this README and the current CXStack source, then shows the exact proposed patch. It waits for approval before editing. After approval, it applies only the selected change, runs focused checks, and tells you to reload.

CXStack does not rewrite itself automatically.

## Try it

Use your next small task with a clear expected result. State the delivery limit if it matters, e.g. `Do not push.`

Watch whether the agent:

- Keeps ordinary work direct and uses the operational consequence test before naming a route.
- Keeps investigation read only until implementation is explicit.
- Asks only when your judgment is needed.
- Changes direction when evidence contradicts its first approach.
- Returns to Investigation and Decision when a material fork appears.
- Keeps true routes proportional and runs maintainability or correctness reviews only when their risk earns them.
- Verifies the promised surface.
- States the real delivery status without claiming more than it proved.

Send another prompt without `/cx`, then try `/cx off` and `/cx` to restore it. At the end of the session, run `/reflect` and approve only lessons that will remain useful.

## Files

- [`extensions/cx.ts`](extensions/cx.ts) owns the `/cx` command, Pi session events, and version markers.
- [`extensions/audit.ts`](extensions/audit.ts) owns the `/cx-audit` command.
- [`extensions/corrections.ts`](extensions/corrections.ts) owns correction capture, grouping, undo, proposals, and `/corrections`.
- [`lib/cx.ts`](lib/cx.ts) owns deterministic state and directive rules.
- [`lib/audit.ts`](lib/audit.ts) selects recent sessions and extracts only CX version and reference markers.
- [`lib/corrections.ts`](lib/corrections.ts) owns correction event storage, provenance, state, and grouping validation.
- [`resources/kernel.md`](resources/kernel.md) contains the compact active guidance.
- [`resources/references`](resources/references/) contains the eight route playbooks, shared change spine, child review contracts, and conditional guidance.
- [`resources/audit.md`](resources/audit.md) contains the private cross-session audit process.
- [`extensions/reflect.ts`](extensions/reflect.ts) owns the `/reflect` command.
- [`resources/reflect.md`](resources/reflect.md) contains the private Reflect process.
- [`test/cxstack.test.ts`](test/cxstack.test.ts) and [`test/extensions.test.mjs`](test/extensions.test.mjs) cover the mechanical behavior.
