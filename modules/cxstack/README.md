# CXStack

CXStack is how my agents work for me: hand an agent an outcome and get back something I can use without supervising it. It has four parts.

## The contract

[`AGENTS.md`](AGENTS.md) is linked to `~/.pi/agent/AGENTS.md` by bootstrap, so every Pi session loads it. It covers acceptance (agree on what good looks like early, with samples when value is a judgment call), effort (run the decisive check first, size work to evidenced risk), continuity, honest reporting, explanations, and authority. Each rule targets a failure that recurred in a review of real sessions, and each is phrased as a situation the agent can recognize.

Conditional workflows live in skills instead: `independent-review` for adversarial review and delegation, `commit-style` and `pr-description` for delivery, `diagnosing-bugs`, and `prototype`.

## `/autonomy`

`/autonomy [ask|commit|push|main]` sets my standing permission for the current repository.

- `ask` (default): commit and push only when asked.
- `commit`: commit each verified piece of work without asking.
- `push`: also push feature branches and open draft pull requests.
- `main`: also push the default branch. Meant for personal projects.

The setting is keyed by the `origin` remote, so every worktree and clone shares it. It is stored in `~/.pi/agent/cxstack/autonomy.json`, shown in the footer, and added to the prompt as one line that changes only when the setting does. A current instruction overrides it. Merge, deploy, and production changes always need explicit authority. Nothing enforces the setting mechanically, because agents have kept to stated authority.

## `/handoff [focus]`

The current agent, which holds the full context and a warm prompt cache, writes a handoff: goal and acceptance check, state, decisions and rejected directions with reasons, open questions, next step, and sources. The command adds repository facts it collects itself (branch, HEAD, upstream, pull request, uncommitted files). The handoff is saved under `~/.pi/agent/handoffs/`, and a new session opens with it in the editor for review. The new session links to the old one and can query it with `session_query`. The Herdr worktree jump accepts the same kind of handoff.

## `/audit [days]`

A script reads sessions since the last audit (or the last 30 days) and writes `metrics.json` and digest batches to `~/.pi/agent/cxstack/audits/<time>/`. Metrics catch regressions that transcript reading misses: warm cache miss rate, provider errors and hangs, interruptions split into resends and others, subagent spawns and failures, turn durations, correction phrases, and the fixed prompt size. The model then compares metrics with the previous audit, gives each digest batch to a reviewer with [`resources/audit-review.md`](resources/audit-review.md) to judge each session's goal, path, detour, and outcome, and proposes ranked changes with their owners. It waits for my selection before changing anything.

## Tests

```sh
bun test ./modules/cxstack/test
```
