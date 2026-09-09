# Refactor

Use for consequential behavior-preserving changes to shared structure, ownership, naming, or representation. Read the Change Spine first and apply these route-specific requirements under its named concepts.

Under **Establish route evidence**:

1. **Pin current behavior.** Capture the observable outputs, public interfaces, callers, error behavior, and relevant performance before moving structure.
2. **Name the complexity to remove.** State which duplicated fact, scattered change, leaky interface, or reader burden disappears.
3. **Choose the target seam.** Trace callers and ownership. Apply the structural triggers and review requirements in Readiness Review.
4. **Define deletion.** Name the old path, adapter, helper, or representation that the refactor removes. A second path is not a completed refactor.

Under **Work in verifiable units**:

5. **Move callers and delete the old path.** Avoid compatibility layers without real external consumers.
6. **Re-run the pinned observations.** Prove behavior stayed equivalent and inspect the final diff for moved rather than removed complexity.

Do not smuggle feature behavior into a refactor. If behavior must change, reroute visibly to Feature.
