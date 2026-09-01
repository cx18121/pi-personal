# Readiness Review

Use when the consequence gate is met and an implementation direction needs approval.

Launch one fresh background child with `spawn_agent` using the complementary choice from Model roles. The child is read only because the delegated task says so.

Give the child primary evidence, not a persuasive author summary:

1. The originating request, ticket, or message.
2. Linked records, logs, screenshots, and data already inspected.
3. Project rules and the relevant source paths.
4. The traced current-system model.
5. Credible directions considered.
6. The proposed direction and why alternatives lost.
7. Open facts and judgment questions.
8. Intended scope, exclusions, and proof plan.

Ask it to find:

1. Missing factual prerequisites.
2. Existing systems or policy sources not accounted for.
3. Hidden duplication or ownership conflicts.
4. Unsupported assumptions.
5. Credible whole-design alternatives that were dismissed too early.
6. Product, architecture, rollout, or maintenance choices that belong to Charlie.

It reports only concrete gaps with evidence. It does not edit files or decide product direction.

This review is a barrier. Do not present the implementation contract or start mutation until the child result arrives and is resolved. Continue only independent read-only investigation while it runs, or return control and let the result wake the session. Do not poll `list_agents` for ordinary completion. A failed child leaves readiness blocked.

Resolve missing facts and ordinary engineering concerns before involving Charlie. Re-run one fresh readiness review only when a material revision changed the decision. Bring Charlie only the remaining judgment forks, then present the settled implementation contract and stop before code.
