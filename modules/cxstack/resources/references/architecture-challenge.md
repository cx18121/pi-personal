# Architecture Challenge

Use before implementation when a change meets a structural trigger:

1. It adds or changes a public interface.
2. It crosses a module, service, database, or process boundary.
3. It moves ownership between layers.
4. It introduces a durable data shape, state machine, registry, or catalog.
5. It changes a shared path used by unrelated features.
6. It has more than one credible whole-design shape.

First ground the design in current callers, data, ownership, and existing policy sources. Then launch one fresh child with `child_run` using the complementary choice from Model roles.

Give it the requested outcome, current-system model, caller-facing usage, proposed data shape and module boundaries, alternatives, constraints, and proof plan. Ask it to find shallow abstractions, leaked internal knowledge, duplicated policy, misplaced ownership, speculative structure, and a simpler complete shape.

The child is read only and returns evidence-backed challenges. This review is a barrier: do not confirm or implement the design until its result arrives and is resolved. Continue only independent read-only investigation while it runs, or return control and let the result wake the session. Do not poll `child_status` for ordinary completion. A failed child leaves the design blocked.

Resolve factual and engineering concerns in the main session. A remaining architecture, maintenance, rollout, or product tradeoff goes to Charlie before implementation.
