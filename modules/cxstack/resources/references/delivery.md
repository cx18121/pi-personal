# Delivery

Use for commit, push, pull request, merge, publication, deployment, and production verification.

1. **Resolve the expected stage.** Use the current explicit instruction, project contract, branch or pull-request state, repository workflow, and stable personal context in that order. Never infer commit, push, merge, deploy, production mutation, or publication from silence.
2. **Reconcile the artifact.** Confirm the Review route is complete when the delivered change has material correctness risk. Explicitly accept or report every material defect and residual risk before calling work ready. If a fix is required, leave Delivery, enter the appropriate change route, then return after the required review.
3. **Inspect repository state.** Separate changed, verified, committed, pushed, pull request opened, CI green, merged, deployed, production verified, and remediated. Keep one delivery record per repository.
4. **Prepare the delivery unit.** Preserve unrelated work, stage only intended files, load `commit-style` before commit or pull-request titles, and use `pr-description` for pull-request prose.
5. **Perform only authorized actions.** A local commit grants no later authority. Existing external receipts and green checks are evidence, not permission.
6. **Verify the resulting state.** Read the actual commit, remote branch, pull request, merge, deployment, or production surface claimed. Do not report a later state than observed.
7. **Hand back plainly.** Name what changed, what was proved, the exact delivery state, unresolved limits, and the next authorized owner.

When no delivery action is authorized, stop at the verified working tree and report its state. Across repositories, completion in one lane says nothing about another.
