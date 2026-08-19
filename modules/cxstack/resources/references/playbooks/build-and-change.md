# Build and Change

Use this for features, refactors, migrations, and ordinary implementation.

Start from what should change for the consumer and the maintainer. Find the owning seam and inspect current behavior, project rules, and existing patterns before inventing architecture. Name the important data shape or invariant when it changes the design. Do not demand a design exercise for an obvious edit.

Choose direct implementation when the design is clear. Explore or prototype when product behavior, interaction, or architecture is still a real fork. Make routine engineering choices yourself. Ask only when the remaining fork depends on personal preference, product policy, or risk tolerance.

Use project, language, framework, design, testing, and migration skills when they improve the result. Proof belongs to the promised surface. Use each check only for claims it can support. Finish at the delivery stage the context supports, not the stage habit suggests.

Run checks likely to exceed 30 seconds with `monitor` when their immediate result does not determine the next edit. Keep full logs out of the conversation, record the workspace state the check started from, and treat the result as stale after relevant files change. If no independent work remains, return control so the user can steer while the check runs.
