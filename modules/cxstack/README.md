# CXStack

CXStack is a sticky work mode for Pi. It asks one agent to own a task from intent through verification. The agent should make routine engineering choices itself and ask only when the remaining choice needs your judgment.

It is based on the useful parts of [PStack](https://github.com/cursor/plugins/tree/main/pstack), adapted to Pi and this setup. It keeps the active prompt small and loads more guidance only when the task needs it.

## Use it

Start a task with `/cx`:

```text
/cx Fix the checkout regression. Reproduce it first and do not push.
```

Pi shows `CX active.` and starts the task. CX stays active for later prompts in the same session, so you do not need to repeat the command.

You can also turn it on without starting a task:

```text
/cx
```

Turn it off with:

```text
/cx off
```

A new blank session starts with CX off.

## What to expect

CX asks the agent to:

- Find the intended result before accepting a proposed theory.
- Judge the work from the consumer and maintainer experience.
- Keep different actors, values, owners, states, and surfaces separate.
- Remove obsolete machinery before adding more.
- Use the fewest moving parts that completely solve the problem.
- Investigate factual questions instead of asking you to decide them.
- Verify the promised surface and stop confidence at the evidence.

Small tasks should stay direct. Harder tasks may use guidance for diagnosis, implementation, investigation, review, delivery, handoff, model choice, or an independent challenge.

CX remains active across follow-up prompts, session tree changes, forks, reloads, and compaction. It stores only one session boolean. It does not store a plan, task summary, theory, or completion claim.

## Reflect

Run `/reflect` after a useful session when you want to review what should improve next time:

```text
/reflect focus on the unnecessary questions and weak verification
```

Reflect reads only the current session. The parent removes secrets, customer identifiers, private production data, and unrelated conversation before asking one fresh reviewer for a challenge.

Reflect proposes exact changes and waits for your selection. It does not write memory, change a skill, edit project files, create tracker items, or change papercuts before approval.

Reflect works whether CX is active or not.

## Improve CXStack

Reflect can classify a confirmed recurring failure as a CXStack change. It checks whether architecture can remove the failure first, then whether an automated check can catch it. It changes guidance only when code cannot enforce the behavior.

The parent reads this README and the current CXStack source, then shows the exact proposed patch. It waits for approval before editing. After approval, it applies only the selected change, runs focused checks, and tells you to reload.

CXStack does not rewrite itself automatically.

## Try it

Use your next small task with a clear expected result. State the delivery limit if it matters, e.g. `Do not push.`

Watch whether the agent:

- Asks only when your judgment is needed.
- Changes direction when evidence contradicts its first approach.
- Keeps the change within the requested scope.
- Verifies the promised surface.
- States the real delivery status without claiming more than it proved.

After activation, send another prompt without `/cx`. Then try `/cx off`. At the end of the session, run `/reflect` and approve only lessons that will remain useful.

## Files

- [`extensions/cx.ts`](extensions/cx.ts) owns the `/cx` command and Pi session events.
- [`lib/cx.ts`](lib/cx.ts) owns deterministic state and directive rules.
- [`resources/kernel.md`](resources/kernel.md) contains the compact active guidance.
- [`resources/references`](resources/references/) contains guidance loaded only when useful.
- [`extensions/reflect.ts`](extensions/reflect.ts) owns the `/reflect` command.
- [`resources/reflect.md`](resources/reflect.md) contains the private Reflect process.
- [`test/cxstack.test.ts`](test/cxstack.test.ts) and [`test/extensions.test.mjs`](test/extensions.test.mjs) cover the mechanical behavior.

The detailed v0 design and review history remain in [`docs`](../../docs/). They are historical records, not a second source of runtime truth.
