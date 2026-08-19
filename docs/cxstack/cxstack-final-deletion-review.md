# CXStack v0 — Final deletion-first architecture review

**Overall verdict:** The architecture is close to minimal. The extension mechanics, state model, model policy, reviewer policy, and evaluation scope survive deletion attempts. I find one whole mechanism that should be deleted (the long-work wrapper), one scope item that should leave v0 (the papercut redesign), and a cluster of always-active and conditional text duplications that should be merged. No finding is invented to fill a quota; several major areas are confirmed clean.

Throughout: **[AA]** = always-active prompt cost, **[C]** = conditional reference text, **[S]** = implementation/design scope (no runtime cost).

---

## Findings

### F1 — Delete the long-work wrapper entirely **[C, mechanism deletion]**

Quoted mechanism:

> **Long-work wrapper** … Use: Concrete completion condition. Native task state. Minimal decision and evidence trail. Resume behavior. Periodic reassessment.

Every element is already owned by another mechanism:

| Wrapper element | Existing owner |
| --- | --- |
| Concrete completion condition | Task framing: "For nontrivial work, begin with a compact frame: … Concrete completion condition." |
| Native task state | State → Native todo: "Owns current execution units and dependencies." |
| Resume behavior | Scratchpad: "an ephemeral cross-session handoff … Next ready action … latest verified state." |
| Periodic reassessment | Kernel closer: "Revise the approach when evidence changes." |
| Minimal decision and evidence trail | State → Conversation: "Owns the current working understanding." The design elsewhere explicitly rejects a decision diary ("Do not store a detailed frozen plan, long theory, decision diary"). |

The wrapper adds no capability; it adds a second name for four existing ones, and its only novel element (a "decision and evidence trail") contradicts the scratchpad's own prohibition. **Smallest change: delete the long-work wrapper as a named mechanism.** Multi-session work is already fully specified by task framing + todo + scratchpad.

### F2 — Merge the Review playbook's finding bar into the judge reference **[C, duplication with drift risk]**

The Review playbook and the judge prompt state the same contract nearly verbatim:

Review playbook:
> "A finding needs a broken outcome, violated invariant, material risk, or missing proof. … Style nits, preferences, speculative hardening, and unrelated improvements are not findings. … A clean verdict is useful after serious falsification attempts. … Attack the highest-consequence assumptions first: intention, target, domain model, implementation, scope, evidence, and delivery claims."

Judge prompt:
> "A finding needs evidence of a broken outcome, violated invariant, material risk, or missing proof. Style nits, preferences, speculative hardening, and unrelated improvements are not findings. A clean verdict is good after serious falsification attempts fail. … Attack the intention, target, domain model, implementation, scope, proof, and delivery claims."

The Review contract section restates the bar a third time ("Require a broken outcome, violated invariant, material risk, or missing proof. … Suggestions are not findings."). Three copies of one contract is exactly the drift the composition rule forbids ("Treat contradictions as system defects to remove"). **Smallest change: keep the finding bar in one place — the judge reference — and have the Review playbook and review-contract text point to it, retaining only what is unique to parent-conducted reviews (specialist output contracts, fix-on-request mode, artifact-verdict vs parent-completion separation).**

### F3 — Remove the papercut redesign from v0 scope **[S, scope deletion]**

Quoted mechanism:

> "Broaden the existing papercut tool and its system wording globally for every Pi agent." and Lane 1: "Global papercut wording and tests in bundled `vendor/pi-memory`."

The design's own governing rule requires every mechanism to solve "a recurring trust failure not already solved by Pi." The papercut broadening solves a Pi-wide ergonomics gap, not a CX trust failure, and the design itself concedes "The existing storage and permissions already support general papercuts." Nothing in `/cx` activation, the kernel, playbooks, review, or delivery depends on the broadened wording; CX can log papercuts through the existing tool on day one. This is precisely the shape of work the design already knows how to defer: "A thorough cleanup of the complete skill library … remains a separate workstream so it does not silently expand CX v0." **Smallest change: move the papercut tool and wording redesign out of Lane 1 into its own workstream, exactly as the full-library cleanup was moved.** The papercut *usage* guidance (what to log, when) can remain as design intent against the existing tool.

### F4 — Kernel opener duplicates the global baseline **[AA]**

Kernel opener:
> "Own the work. Charlie should step in for choices that are his to make, not to restore ordinary engineering judgment."

Global `~/.pi/agent/AGENTS.md`:
> "Own the work. Involve Charlie for choices that are his to make, not for ordinary engineering judgment."

When CX is active, both are in every prompt; the global file also survives compaction, so the kernel refresh does not need to re-carry it. Principle 7's kernel line already covers the operational half ("Investigate factual questions yourself. Do not turn observable questions into decisions for Charlie."). **Smallest change: delete the kernel opener; the global baseline plus Never Block on the Human carry it.** Same logic applies to the closer's "Verify the real surface," which duplicates Prove It Works' "Observe the promised surface" three lines earlier — delete it.

### F5 — The proportionality rule is stated four times in always-active text **[AA]**

The same rule appears in:

1. Global baseline: "Match the response to the task."
2. Kernel Laziness line: "Use the fewest moving parts that completely solve the problem."
3. Kernel closer: "…then use only capabilities that help."
4. Per-turn marker: "Match the task: stay direct when clear; load rigor only when it earns its cost."

Over-prompting is named a direct performance risk by the design itself. **Smallest change: keep (1) and (2); delete "use only capabilities that help" from the closer; reduce the marker to "CX is active."** The marker's remaining job — PStack's sticky reminder — is fully done by two words plus the persistent kernel already in context.

### F6 — Merge Subtract Before You Add into Laziness Protocol **[AA, principle merge]**

Full Laziness text:
> "Choose the smallest complete and maintainable intervention. **Prefer deletion**, direct paths, one source of truth, and fewer moving parts."

Subtract Before You Add:
> "Prefer removing obsolete or redundant machinery over adding more. Do not expand the task into unrelated cleanup."

Laziness already contains "prefer deletion"; both carry the same anti-cleanup caveat ("Do not expand the task into unrelated cleanup" / "Do not turn focused work into unrelated cleanup"). Two kernel lines defend one behavior. **Smallest change: merge into one kernel line — fewest moving parts, prefer deletion over addition, no unrelated cleanup — reducing the kernel to seven principles.**

*Lower-confidence sibling:* Intent Before Method ("Find the intended result before accepting a proposed theory") and Outcome-Oriented Execution ("Keep the intended result stable while methods … may change") both defend the intended result against the literal method, at start and mid-task respectively. They are mergeable into one line if Charlie accepts; the phase distinction (wrong target accepted vs outcome drifting mid-work) is the strongest argument for keeping two. I flag it but do not insist.

### F7 — Delivery wrapper carries a second copy of the stage list and a framing rule **[C]**

Delivery wrapper:
> "Delivery stages remain distinct: changed, verified, committed, pushed, PR-opened, CI-green, merged, deployed, production-verified, remediated."

Prove It Works maxim:
> "Use precise states such as implemented, test-verified, rendered, observed on one object, committed, PR-opened, merged, deployed, remediated, blocked, and unresolved."

Two overlapping enumerations of the same state ladder will drift. Also, the wrapper's "For nontrivial work, make the inferred stage and evidence visible" duplicates task framing's "Expected delivery stage and supporting context when it can be inferred." **Smallest change: keep one canonical state list (under Prove It Works, since the kernel is the always-live carrier) and have the delivery wrapper reference it; delete the wrapper's visibility sentence.** The wrapper's unique, non-deletable content — the ordered evidence sources and "Do not infer push, PR, merge, deployment, or production mutation from silence" — stays.

### F8 — Playbooks restate kernel principles already in context **[C]**

The kernel is guaranteed present whenever a playbook loads, yet:

- Diagnose and Fix: "Treat the supplied theory as a lead, not the cause" and Investigate and Decide: "Treat the prompt's theory as a lead, not the conclusion" both restate Intent Before Method's "Find the intended result before accepting a proposed theory."
- Build and Change: "Let Charlie make choices that are his; answer factual forks with evidence" and Investigate and Decide: "Answer factual forks yourself. Involve Charlie when the remaining choice is his priority, taste, business policy, or risk tolerance…" both restate Never Block on the Human.

**Smallest change: strip the pure restatements; keep only the playbook-specific application** (e.g., Investigate's "give him the evidence and your recommendation" is genuinely additive and stays).

### F9 — Duplicate statement of principle pre-declaration **[S, design-doc only]**

Task framing bullet "Important principles and capabilities" and Principle observability's "State the one to three principles expected to shape the approach" are the same instruction in two sections. No runtime cost if only one lands in the conditional reference. **Smallest change: state it once.**

### F10 — Specialist audit items 6–8 are not v0 blockers **[S, note, low severity]**

The audit's own heading marks only items 1–5 as "Required before common CX routes"; the UI cluster sits outside it, yet the minimum approved scope includes items 6–8 (`make-interfaces-feel-better` trigger, `apple-design` trigger, two `disable-model-invocation` flags). Nothing in the four playbooks or the trust goal depends on them. However, each edit is itself a subtraction of automatic prompt cost, and each costs a few lines. Deferring them to the full-library cleanup shrinks v0 scope but saves no runtime complexity and re-exposes any frontend work to skill collisions. **Disposition: acceptable either way; if strict deletion-first is applied, move 6–7 to the full cleanup and keep 8 (two one-line frontmatter flags that remove live prompt cost).** Items 1–5 all block common routes (trivial repairs forced into hard-bug discipline; TDD blocking on Charlie; `code-review` broken on Pi; always-loaded docs procedure; Pango test gate) and are correctly in scope.

---

## Playbooks and wrappers — earned existence

| Mechanism | Verdict | Basis |
| --- | --- | --- |
| Diagnose and Fix | **Earns it** | Owns fixed-vs-masked proof and evidence separation for ordinary defects; nothing else covers this once `diagnosing-bugs` is narrowed to hard cases. |
| Build and Change | **Earns it** | Owns the seam-first, direct-vs-explore fork and delivery-stage inference for implementation; largest route, no overlap with the other three. |
| Investigate and Decide | **Earns it** | Only mechanism owning research synthesis, source boundaries, and the duty to recommend rather than return "a diary of searches." Distinct output shape from Review (recommendation vs findings). |
| Review | **Earns it, after F2 merge** | Parent-conducted review with fixing mode and specialist-contract deference is not covered by the judge (read-only child) or `code-review` (code only). Its finding bar must live in the shared judge reference. |
| Long-work wrapper | **Does not earn it** | Fully decomposes into task framing, todo, scratchpad, and the kernel's reassessment line (F1). Delete. |
| Delivery wrapper | **Earns it, slimmed per F7** | The evidence-source order and the no-publication-from-silence rule are unique and central to Charlie's autonomy boundary; nothing else states them. |

---

## Confirmed clean (deletion attempted, failed)

- **Extension hooks:** each of the five (appendEntry state, session_start/session_tree reconstruction, before_agent_start kernel, per-turn marker append, session_compact refresh) maps one-to-one onto a validation requirement (activation, off, state reconstruction, compaction refresh). Nothing mergeable.
- **State:** boolean flag only; no capsule, no custom compaction, no plan documents. Scratchpad is the sole cross-session mechanism and has a real, unduplicated job. Clean.
- **Model machinery:** soft role defaults, no router, no parent switching, effort delegated to Pi. Already at the floor.
- **Reviewer machinery:** one context-selected judge, no panels, no loops, no counts. The panel omission is well-evidenced ("no strong case where three or more fanout lanes each contributed unique accepted value"). Clean apart from F2's text duplication.
- **Learning/evaluation:** manual papercut review, deterministic-mechanics-only validation, no synthetic benchmarks. Clean apart from F3's scope.
- **Implementation lanes:** three lanes correspond to three genuinely different repositories and delivery authorities; unmergeable without mixing publication states. Clean after F3 removes papercut work from Lane 1.
- **Global AGENTS.md:** 29 words, survives hostile review, needed for CX-off sessions. Keep (it becomes the sole carrier of the ownership line per F4).
- **Design-document length** (context hierarchy list, comparison tables, principle expansions): documentation, not runtime prompt. No prompt cost; not findings.

---

## Smallest coherent v0 after accepted deletions

- **Always active when on:** the boolean session flag; one kernel of ~150–200 words — seven principle lines (six if the Intent/Outcome merge is accepted), the one-sentence playbook index, and a closer stripped of the duplicated opener, "verify the real surface," and "use only capabilities that help"; a two-word turn marker ("CX is active."); one exact kernel refresh after compaction. Plus the 29-word global baseline, which alone carries ownership and evidence-calibrated claims.
- **Conditional:** four playbooks, deduplicated of kernel restatements, with Review pointing at the single judge reference; one judge reference owning the finding bar; a slimmed delivery reference owning the evidence order and no-publication-from-silence rule, pointing at the single Prove It Works state list.
- **State:** conversation, native todo, scratchpad handoff. No long-work wrapper.
- **Specialist edits before common use:** audit items 1–5, plus the two `disable-model-invocation` flags; UI trigger narrowings optionally deferred to the full cleanup.
- **Implementation:** Lane 1 without the papercut redesign; Lane 2 and Lane 3 unchanged.
- **Separate workstreams:** full skill-library cleanup and the global papercut redesign.

Everything else in the design — sticky activation semantics, compaction behavior, model roles, review contract, closeout facts, validation scope — stands as written.
