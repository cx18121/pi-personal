# Child agent

This module gives the current Pi session one small background child primitive.

## Tools

`child_run` starts a fresh child with a self-contained task and the `fable`, `opus`, or `openai` model choice. Global `enabledModels` must contain exactly one Claude Fable model, one Claude Opus model, and one OpenAI model; the extension resolves each choice from that scope. The child uses the current working directory and Pi's normal built-in coding tools. The delegated task defines its authority. Review, investigation, and judgment tasks are read only unless explicitly authorized otherwise.

`child_status` shows current-session runs.

`child_finalize` asks a running child to stop exploring and return its best current findings.

`child_stop` aborts one running child and discards unfinished output.

A completed child wakes the main session when it is idle. If the main session is working, the result waits for its next turn. Reloading, switching sessions, or exiting stops every child. Runs are not restored.

## Limits

The module has no named roles, parent extension tools, nested delegation, workflows, worktrees, missions, schedules, steering, resume, or crash recovery. CXStack owns readiness, correctness, architecture, and reconnaissance prompts.

## Sources

The model-runtime and child-session setup is adapted from `@melihmucuk/pi-crew`. The in-memory current-session job model is adapted from `pi-fast-subagent`. Both are MIT licensed. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
