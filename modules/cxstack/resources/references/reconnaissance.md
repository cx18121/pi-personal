# Repository Reconnaissance

Use a child when repository exploration would consume substantial main-session context or when an independent source map improves a later decision.

Launch one fresh child with `spawn_agent`. Choose the available OpenAI model for fast exact repository reading, or the complementary choice from Model roles when an independent family perspective matters. Give it a bounded question, exact working directory, named source roots or symbols, known evidence, and the output needed by the parent.

Ask for:

1. Relevant files and entry points.
2. Callers, callees, data flow, and ownership.
3. Existing tests and verification commands.
4. Related implementations or duplicated policy.
5. Important unknowns and the next source that would settle them.

The task is read only. The child returns compressed evidence with file and symbol references, not a general codebase tour. The parent reads the load-bearing files itself before making a decision.
