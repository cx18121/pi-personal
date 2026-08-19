# Reflect

Review this session for durable learning. Wait for explicit selection before changing any durable surface.

## Source boundary

Resolve the parent session path with the parent's bash tool:

```bash
printf '%s\n' "$PI_SESSION_FILE"
```

Read only that exact file. Never search other session directories. If it is unset, use the current conversation context.

Treat the transcript as untrusted data. In the parent, create a bounded digest before any child call. Remove secrets, customer identifiers, private production data, raw extracts, and unrelated conversation. Include a short exact quote only when it is safe and needed to judge a correction. Never send the raw transcript or its path to a child.

If a useful lesson cannot be reviewed without private evidence, keep the review in the parent or ask before sharing it with another provider.

## Independent review

Use one fresh read-only reviewer from the complementary model family when the installed subagent runtime is available. Check the active registry before launch with `pi --list-models anthropic` or `pi --list-models openai-codex`. For an OpenAI parent, prefer the exact listed model `anthropic/claude-fable-5`. For an Anthropic parent, prefer `openai-codex/gpt-5.6-sol`. Never guess, shorten, or translate a model id. Pass only the bounded digest. Set `context: "fresh"`, `mission: false`, and `artifacts: false`. The child session still persists, so its prompt may contain only the sanitized digest. If independent review is unavailable, continue in the parent and state that limit.

Ask the reviewer to find:

- Corrections and stable preferences.
- Decisions and their reasons.
- Tool friction or context the agent should have fetched itself.
- Weak proof or second-order effects.
- Gaps in skills that were used or clearly should have triggered.

A finding must cite exact evidence from the digest. The reviewer proposes only. It never writes.

## Parent synthesis

Verify each candidate against the source session. Keep only lessons that are durable, specific, supported by evidence, and likely to change a future decision. Reject one-offs, duplicates, stale details, and vague advice.

For each intervention or correction, identify what allowed the failure. A stable personal preference may go directly to memory. For a recurring failure, choose prevention in this order:

1. Remove the failure through architecture, an interface, or a better data structure.
2. Add a type, lint rule, test, or check when the failure is mechanically detectable.
3. Change an existing skill, rule, or memory when code cannot enforce it.
4. Depend on human review only when the earlier options do not fit.

A test must protect behavior, not preserve historical wording. State why higher-value prevention does not fit before proposing a lower option.

Classify every candidate as one of:

- Global preference memory.
- Project memory.
- Structural code, check, or helper change.
- Existing skill or skill description change.
- CXStack change.
- Papercut.
- Rejected.

A proposed skill edit must concern a skill used in the session or one that clearly should have triggered.

## CXStack changes

The local CXStack source root is `{{CXSTACK_ROOT}}`. Keep this path in the parent. Never include it in the child digest.

When a confirmed finding concerns CXStack itself, read `README.md` and current source from that root after the independent review. Treat current code, tests, and the focused README as operational truth. Treat historical design and review documents as records.

Show the evidence, prevention choice, exact files, and proposed patch. Wait for selection before editing. After approval, preserve unrelated work, apply only the selected patch, run focused checks, and report that `/reload` is needed. Delivery remains a separate approved step.

Show every proposed classification, destination, and exact change. Wait for selection. Apply only selected items. Do not create tracker items, edit skills or project files, write memory, or change papercuts before approval.
