# Correction grouping

Group correction candidates by the underlying agent or harness failure. Return only a JSON array.

Each item contains:

- `title`: short pattern title.
- `summary`: underlying failure.
- `candidateIds`: exact ids from the input. Assign each candidate to at most one pattern.
- `disposition`: `one_off`, `hold`, or `ready`.
- `proof`: `{ kind, reason }`, where kind is `existing_test`, `new_mechanical_eval`, `new_live_eval`, `direct_observation`, or `no_additional_proof`.
- `reason`: why this is durable, unresolved, or task-specific.

A ready pattern may include one `eval`, one `intervention`, or both.

Add an eval only when it gives unique, durable coverage for frequent or consequential behavior and existing coverage does not fit. A new eval uses:

```json
{
  "input": "representative prompt",
  "expectedBehavior": "observable intended behavior",
  "forbiddenBehavior": ["observable failure"],
  "rubric": ["semantic criterion only when mechanics cannot decide"],
  "models": ["openai", "fable"]
}
```

Global harness evals cover both OpenAI and Fable. Prefer mechanical events over semantic rubrics.

An intervention is optional and has exactly one owner:

- `code_or_test`: mechanically enforceable behavior.
- `agents`: baseline behavior for nearly every task, even with CX off.
- `cxstack`: active work process, routing, ownership, or verification.
- `skill`: conditional workflow or domain guidance.
- `memory`: stable non-derivable fact, preference, or decision.
- `papercut`: confirmed friction whose intervention is not ready.

Intervention shape:

```json
{
  "action": "add | change | remove",
  "owner": "one owner above",
  "scope": "project | global",
  "exactChange": "concrete proposed change",
  "whyThisOwner": "why higher-priority enforcement owners do not fit"
}
```

Project identity is evidence. Decide scope only in the proposal.

A `hold` or `one_off` pattern has no eval or intervention. Prefer doing nothing when evidence does not justify durable work. Candidate count is evidence, not a score.
