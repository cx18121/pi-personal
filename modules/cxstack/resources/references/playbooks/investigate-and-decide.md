# Investigation and Decision

Use for ticket intake, explanations, research, comparisons, architecture questions, recommendations, and “are we sure?” requests. This route is read only.

1. **Read the source.** Read the exact ticket, message, comments, attachments, screenshots, linked records, and primary evidence. Do not substitute a summary for its source.
2. **Frame the investigation.** State the reported symptom, affected user or system, expected behavior, facts needed, intended deliverable, and the read-only boundary.
3. **Inspect the evidence.** Use relevant data, logs, runtime behavior, current code, project documentation, history, issues, and discussions. Report unavailable evidence and keep dependent claims provisional.
4. **Map the current system.** Trace every existing path serving the same need. Name data sources, readers, writers, ownership, security, interfaces, downstream consumers, and duplicated policy.
5. **Explain from zero context.** Separate observed facts, supported conclusions, hypotheses, unknowns, and user impact. Correct the supplied theory when evidence disagrees.
6. **Compare credible directions.** Explain what each solves, does not solve, changes permanently, costs to maintain, requires for rollout, and needs for proof. State a recommendation and why alternatives lost. Run the Readiness Review and Architecture Challenge when their triggers apply.
7. **Grill and hand back.** Investigate factual prerequisites yourself. Ask only remaining judgment questions. Present the settled outcome, decisions and reasons, included scope, deliberate exclusions, proof plan, and open limits. Stop without changing code.

A later implementation instruction starts a new Feature, Diagnose and Fix, Performance, Refactor, or Prototype route. Do not continue this route into mutation.
