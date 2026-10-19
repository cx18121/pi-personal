# Review

Review the work against the intended result and its actual consumers. Use primary sources and surrounding behavior rather than treating the author's account or passing checks as the verdict.

Beyond the review required before consequential delivery, use independent review when another perspective or a separate investigation would help. Give the reviewer the question, relevant source locations, settled decisions, and evidence already available. Ask them to challenge the premise as well as the implementation, including whether the proposed direction could make the result worse. Include failures and context they cannot recover from the sources. Use [Delegation](model-roles.md) for model selection and authority.

For design, examine whether the proposed experience and system fit the need, including simpler credible alternatives. For implementation, trace the behavior and its affected consumers. Use `maintainability-review` when avoidable complexity or duplication is part of the question.

A useful finding identifies a concrete broken outcome, an important mismatch with the intended experience, or an unresolved assumption that could change the decision. Give its source, consequence, and a way to resolve it. Distinguish demonstrated defects from uncertainty. Execution is valuable when it resolves something that source inspection or reasoning cannot establish adequately.

The owner verifies findings and resolves the ones that matter to the task. A review request alone authorizes proposals, not fixes. When fixes are already authorized, make the relevant changes and check the affected behavior. Keep unaffected evidence. Another review is useful only if a remaining consequential question needs it.

While a reviewer examines a fixed artifact, continue independent work that leaves it unchanged. Resolve that review before taking the consequential action it informs. Report the actual result and remaining limits, including when no material finding survives.
