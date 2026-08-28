# Correctness Review

Run only when invoked by Review step 5 after accepted maintainability changes, before final behavior checks or delivery.

Launch one fresh background child with `child_run` using the complementary choice from Model roles. The child is read only because the delegated task says so.

Give it:

1. The originating issue and confirmed implementation contract.
2. Settled decisions, scope, and exclusions.
3. The complete current diff, including untracked additions.
4. Relevant project and language rules.
5. The source paths and surrounding callers or consumers.
6. Verification already observed.
7. Failed attempts, checks not run, blockers, and claimed delivery state.

Ask it to try to falsify correctness. It should trace concrete execution paths, identify affected invariants and consumers, construct realistic counterexamples, inspect tests as evidence rather than verdicts, and use read-only repository tools to settle questions. Identify the load-bearing safety claims, meaning the smallest set of facts that must hold for the change to be safe. Prove each claim by running the real code when practical. Label any claim that remains supported only by reading or reasoning as unproven. Spec alignment belongs in this review.

A finding requires a concrete broken outcome, violated invariant, or missing proof with exact source evidence. Style, speculative hardening, and unrelated improvements are not findings. The child does not edit files.

This review is a barrier. Do not run final behavior checks, enter Delivery, or claim completion until the child result arrives and is resolved. Continue only independent read-only inspection while it runs, or return control and let the result wake the session. Do not poll `child_status` for ordinary completion. A failed child leaves correctness review unresolved.

The parent verifies every finding and records it as accepted, rejected, or unresolved. Any accepted fix leaves Review and enters the appropriate change route, then starts Review again on the changed artifact. Run another correctness review only when a material fix changed reviewed behavior or new evidence can settle an important claim. An unchanged unresolved claim is reported, not reviewed in a loop.
