# Performance

Use for measured speed, memory, CPU, I/O, cost, or throughput problems. Read and copy the Change Spine first, then add these route-specific steps.

Under **Establish route evidence**:

1. **Define the metric and workload.** Name the user-visible symptom, representative input, environment, measurement method, and target.
2. **Capture a repeatable baseline.** Record several comparable runs and normal variance before changing code.
3. **Profile the measured path.** Use traces, profiles, query plans, counters, or focused instrumentation to locate cost. Do not optimize from intuition.
4. **State one falsifiable hypothesis.** Name the measured cause, proposed change, and expected effect before implementation.

Under **Work in verifiable units**:

5. **Change one cause at a time.** Preserve correctness and reject wins that move cost into an unmeasured path.
6. **Repeat the baseline measurement.** Compare equivalent before and after runs, report variance and regressions, and keep only a demonstrated win.

A faster proxy does not prove the user path improved. Performance claims require the measured result.
