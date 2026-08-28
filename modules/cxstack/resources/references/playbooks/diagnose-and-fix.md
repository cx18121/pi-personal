# Diagnose and Fix

Use for consequential defects, regressions, and incidents when repair is requested. Read the Change Spine first and apply these route-specific requirements under its named concepts. Do not copy them into Todo.

Under **Establish route evidence**:

1. **Reproduce the exact failure.** Identify the affected object or surface, expected behavior, observed behavior, and the observation that distinguishes fixed from masked.
2. **Preserve raw evidence.** Capture the source event, value, trace, or runtime boundary before transforming it.
3. **Trace the cause.** Keep confirmed facts, falsified hypotheses, and open questions separate. Trace the object across actors, states, queues, runtimes, and data transformations. For regressions, inspect the introducing diff or bisect before designing the fix.
4. **Name the owning seam and root cause.** Treat the supplied theory as a lead. Do not turn an urgent repair into an architecture project, but correct the model when the root cause requires it.

Under **Work in verifiable units**:

5. **Repair the root cause.** Build expected values from source events and business meaning rather than repeating the production formula in a query or fixture.
6. **Prove the original symptom is gone.** Exercise the same surface and include the relevant empty, default, fallback, retry, or masked behavior. State the closest verified boundary when the real surface is unavailable.

An explanation is not a fix. A workaround passing does not prove root cause.
