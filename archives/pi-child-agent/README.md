# Archived child agent

This is the last standalone copy of the custom Pi child agent before `@ogulcancelik/pi-codex-subagents` replaced it. The source was archived from pi-personal commit `79833e7c4b17b70ca6fc1c3ffb205ac66e392bbf`.

It provides `child_run`, `child_status`, `child_finalize`, and `child_stop`. It expects exactly one scoped Claude Fable model, one scoped Claude Opus model, and one scoped OpenAI model.

Install this archived package directly if the old tools are needed again:

```bash
pi install /Users/charliexue/Projects/personal/pi-personal/archives/pi-child-agent
```

Remove it with:

```bash
pi remove /Users/charliexue/Projects/personal/pi-personal/archives/pi-child-agent
```

See `ORIGINAL_README.md` for behavior and `THIRD_PARTY_NOTICES.md` for attribution. This package is frozen and receives no maintenance.
