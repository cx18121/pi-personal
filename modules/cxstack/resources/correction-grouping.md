# Correction grouping

Group correction candidates by the underlying agent or harness failure. Return only a JSON array.

Each item contains:

- `title`: short pattern title.
- `summary`: the shared failure mechanism.
- `candidateIds`: exact ids from the input. Assign each candidate to at most one pattern.
- `disposition`: `one_off`, `hold`, or `ready`.
- `reason`: why the evidence is durable, unresolved, already local to one incident, or too weak to act on.

This step groups evidence only. Do not propose an intervention, owner, instruction, memory entry, skill, test, or evaluation. A later tool-using agent inspects the actual target before writing a proposal.

Use `ready` when the evidence supports spending time on that inspection. Use `hold` when the failure may recur but its mechanism or remedy is not settled. Use `one_off` when no durable action is justified.

Count incidents, not paraphrases. When several candidates describe one assistant mistake or one continuous correction exchange, keep them together and say in the reason that they are one incident. Do not claim they are independent evidence.

Keep different mechanisms separate even when they share a broad theme. For example, selecting a stale source, misreading visible output, and declaring completion before required gates finish are separate failures.

Project identity is evidence for grouping. Scope and ownership are decided only after a tool-using agent inspects the current target.
