# Feature

Use for new or changed production behavior. Read and copy the Change Spine first, then add these route-specific steps.

Under **Establish route evidence**:

1. **Name the behavior and consumer.** State the changed user outcome, unchanged behavior, acceptance examples, and important failure states.
2. **Name the data shape and owner.** Identify the values, states, actors, writers, readers, and owning seam before writing logic.
3. **Run architecture work when structurally triggered.** Use the Architecture Challenge when the change affects a public interface, crosses a system boundary, moves ownership, introduces a durable model or registry, changes a shared path, or has materially different whole-design shapes.
4. **Confirm the implementation contract.** Do not mutate while a required product, architecture, rollout, or maintenance decision remains open.

Under **Work in verifiable units**:

5. **Implement through the owning seam.** Prefer existing patterns and remove obsolete paths instead of layering another representation.
6. **Exercise the changed behavior.** Observe the consumer surface, important failure state, and preserved behavior with the project's supported tools.

The main agent implements by default. Use children for bounded judgment, review, or reconnaissance, not normal project writes.
