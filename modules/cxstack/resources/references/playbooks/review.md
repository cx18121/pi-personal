# Review

Use for explicit review requests or consequential artifact judgment. This route is read only. Fixing a finding requires a visible change route, followed by a fresh Review of the changed artifact.

1. **Establish the review contract.** Name the exact artifact, fixed point, originating intent, audience, confirmed decisions, project standards, changed files, evidence, and claims. Do not let the author's explanation replace primary sources.
2. **Run Simplify when earned.** Load the installed `simplify` skill from `~/.agents/skills/simplify/SKILL.md` when the artifact is consequential or the user requests a simplification pass. Identify complexity that can disappear without changing the intended result.
3. **Run Thermo when triggered.** Load `thermo-nuclear-code-quality-review` from `~/.agents/skills/thermo-nuclear-code-quality-review/SKILL.md` for most PR-sized production changes and whenever the change is structural, cross-cutting, abstraction-heavy, shared, or difficult to understand from callers. A skip stays visible with a reason.
4. **Disposition maintainability findings.** The parent verifies each finding as accepted, rejected, or unresolved. When fixing is authorized, leave Review, enter the appropriate Feature, Diagnose and Fix, Performance, or Refactor route for the accepted batch, then restart Review at step 1.
5. **Run one Correctness Review when earned.** After no accepted maintainability fix remains, launch one fresh child using the Correctness Review contract only when a wrong result is costly, hidden, hard to undo, or materially affects production, persistent data, security, money, deployment, shared interfaces, or durable architecture. Fold spec alignment into correctness. Mechanical standards stay tool-enforced.
6. **Disposition correctness findings.** Verify every finding against current source. An accepted fix leaves Review for the appropriate change route, then restarts Review. Re-review only after changed behavior or new evidence; an unchanged unresolved claim is reported rather than looped.
7. **Run relevant behavior checks.** After review findings are resolved, use project-supported checks and observe the real changed surface when warranted. Tests and prior reviews are evidence, not verdicts. Do not rerun unchanged green checks without a new question.
8. **Reconcile the result.** Report broken outcomes, missing proof, accepted decisions, residual risks, and actual delivery state. A clean verdict names the important surfaces checked and proof boundary.

A finding needs a concrete broken outcome, violated invariant, material current risk, or missing proof. Style nits, speculative hardening, and unrelated improvements are not findings.
