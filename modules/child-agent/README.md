# Child agent

This module gives the current Pi session one small background child primitive.

## Tools

`child_run` starts a fresh child with a self-contained task and exact model. The child uses the current working directory and Pi's normal built-in coding tools. The delegated task defines its authority. Review, investigation, and judgment tasks are read only unless explicitly authorized otherwise.

`child_status` shows current-session runs.

`child_stop` stops one running child.

A completed child wakes the main session when it is idle. If the main session is working, the result waits for its next turn. Reloading, switching sessions, or exiting stops every child. Runs are not restored.

## Limits

The module has no named roles, parent extension tools, nested delegation, workflows, worktrees, missions, schedules, steering, resume, or crash recovery. CXStack owns readiness, correctness, architecture, and reconnaissance prompts.

## Sources

The model-runtime and child-session setup is adapted from `@melihmucuk/pi-crew`. The in-memory current-session job model is adapted from `pi-fast-subagent`. Both are MIT licensed. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
