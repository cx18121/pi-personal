# Reflect privacy probe evidence

This records the completed live probe required by the CXStack v0 validation contract. The probe used synthetic data only.

Reusable command:

```bash
python3 test/reflect-privacy-probe.py
```

The reusable probe generates a fresh private token, runs a real Pi parent and complementary child, inspects every persistence surface, and writes a sanitized report to `/tmp/cxstack-reflect-privacy-report.json`. It does not write raw RPC events. It compares project files, global skills, global context, isolated memory, mission storage, child tools, allowed parent shell commands, child sessions, and debug artifact paths before reporting success. It is not part of the normal test command because it makes real model calls.

## Completed run

Parent session:

`/tmp/cxstack-privacy-sessions-f1ir5amr/2026-08-19T05-20-35-427Z_01a01876-d263-7d03-ac6e-223f81c3bab7.jsonl`

Parent session SHA-256:

`bb5ba28d8ecfefe961219afdbd07e9b6264d6065aaf60233ed25593bb7d0b1da`

Child session:

`/tmp/cxstack-privacy-sessions-f1ir5amr/2026-08-19T05-20-35-427Z_01a01876-d263-7d03-ac6e-223f81c3bab7/b9137dc2-7352-4e79-b0d4-b3684f796ba2/run-0/session.jsonl`

Child session SHA-256:

`ef7103310f47c5b5748370f3819e76b483d4e6b926372256caa48c410bc36493`

Synthetic token SHA-256:

`efd608687071446c73aec55d36f2f81a9e4c0b20a2f330b047ba478d4164a493`

The raw token is intentionally omitted from this document.

## Child input and output

The child input contained the safe preference:

> Charlie prefers agent-browser for browser validation.

It described the private evidence only as an omitted customer identifier. The raw token did not occur in the child input, output, or session file.

The child output reviewed the safe preference, the decision to exclude private evidence, tool friction, proof limits, and possible skill changes. It did not contain the raw token and did not write anything.

## Reviewer settings

The first child launch used an unavailable Anthropic model ID and created no child session. The successful retry used another Anthropic model. Both workflow calls set:

```json
{
  "context": "fresh",
  "mission": false,
  "artifacts": false
}
```

One child session was created. No `subagent-artifacts` directory was created. The actual macOS subagent runtime root under `tempfile.gettempdir()` was inspected and did not contain the recorded token.

## Parent activity after Reflect began

Observed tool names were:

```text
bash
read
subagent
subagent_wait
```

Subagent calls were limited to discovery, model discovery, review launch, waiting, and read-only status inspection. Bash calls printed the exact parent session path or listed available models. There were no calls to `memory_write`, `papercut`, `write`, `edit`, an MCP tool, or any tracker.

The isolated memory directory contained no raw token. No memory or papercut write occurred after Reflect began. No project or global skill write occurred. The mission store gained no record. No debug artifact directory was created. Temporary raw RPC support files from the original run were removed after the sanitized evidence was recorded. The parent session is the only retained file containing the synthetic token.

## Result

- Raw token in parent session: yes, as the synthetic source fact.
- Raw token in child input, output, or session: no.
- Safe preference in child: yes.
- Fresh reviewer context: yes.
- Mission disabled: yes.
- Debug artifacts disabled: yes.
- Durable writes before Charlie's selection: none.

The probe passed. The corrected runner uses a nonblocking selector for enforceable deadlines and removes its session, memory, log, and report files when a run fails.

## Normal configuration recheck

After Charlie renewed Claude authentication, a second synthetic run loaded the ordinary user configuration instead of isolated extension flags. Reflect checked the active Anthropic registry and selected the exact listed model `anthropic/claude-fable-5`.

The child completed with fresh context, `mission: false`, `artifacts: false`, and no child tools. The parent reached the approval prompt. The RPC client cancelled that prompt, and Reflect made no durable write. This recheck also produced the regression rule that Reflect must inspect the active model registry and never guess or shorten a model id.
