# Delivery

Infer the expected delivery stage from this evidence, in order:

1. The current explicit instruction and conversation.
2. The project `AGENTS.md` delivery contract.
3. Existing branch, worktree, pull request, issue, or release state.
4. Repository workflow and release documentation.
5. Stable personal context.

For nontrivial work, state the expected stage and the evidence that supports it. Never infer push, pull request creation, merge, deployment, production mutation, or publication from silence.

For isolated implementation work with no established later stage, the fallback is a verified clean commit. A commit is not authorization for any later action.

Keep these states distinct: changed, verified, committed, pushed, pull request opened, CI green, merged, deployed, production verified, and remediated. Report only the state the evidence proves.

Across repositories, keep one delivery record per repository. A completed local lane does not imply that another lane was committed or published.
