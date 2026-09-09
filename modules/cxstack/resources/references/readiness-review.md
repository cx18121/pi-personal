# Readiness Review

Use when the consequence gate is met and an implementation direction needs approval, or before implementation when a structural trigger below applies. A settled review covers the implementation route that follows unless direction, scope, or design materially changes.

## Structural triggers

1. It adds or changes a public interface.
2. It crosses a module, service, database, or process boundary.
3. It moves ownership between layers.
4. It introduces a durable data shape, state machine, registry, or catalog.
5. It changes a shared path used by unrelated features.
6. It has more than one credible whole-design shape.

## One review

Launch one fresh background child with `spawn_agent` using the complementary choice from Model roles. The child is read only. When a structural trigger applies, include the architecture questions in this same review, not a second child.

Give the child primary evidence, not a persuasive author summary:

1. The originating request and linked evidence already inspected.
2. Project rules, relevant source paths, and the traced current-system model.
3. Credible directions, the proposed direction, and why alternatives lost.
4. Open facts and judgment questions.
5. Intended scope, exclusions, and proof plan.

Ask for missing factual prerequisites, overlooked systems or policy sources, hidden duplication or ownership conflicts, unsupported assumptions, credible whole-design alternatives dismissed too early, and choices that belong to Charlie.

For structural work, ground the design in current callers, data, ownership, and existing policy sources. Add caller-facing usage, proposed data shape, and module boundaries to the brief. Ask for shallow abstractions, leaked internal knowledge, misplaced ownership, speculative structure, and a simpler complete shape.

The child reports concrete gaps with evidence. It does not edit files or decide product direction.

## Resolve before implementation

Do not present the settled implementation contract or start mutation until the child result arrives and is resolved. Continue only independent read-only investigation while it runs, or return control and let the result wake the session. Do not poll `list_agents` for ordinary completion. A failed child leaves readiness blocked.

Resolve missing facts and ordinary engineering concerns yourself. Bring Charlie only remaining product, architecture, rollout, or maintenance choices. Re-run one fresh review only when a material revision changes the reviewed decision.

In Investigation and Decision, present the settled contract and stop before code. In an authorized implementation route, continue once the review is resolved and no judgment fork remains.
