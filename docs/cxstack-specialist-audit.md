# CXStack route-targeted specialist audit

## Status

This document records proposed compatibility changes for skills CXStack will commonly compose.

It is not authorization to edit the live skill library. Apply these changes only as part of an approved CXStack implementation.

Sources:

- Four-playbook set review: `bc0b15df`.
- Route-targeted skill audit: `e0b320ee`.
- Focused UI cluster audit: `1b805456`.
- Parent verification and Charlie's decisions through Q89.

## Composition rule

The current request and project context define the outcome. A specialist owns its technical method and output only when its contract fits that work.

Do not solve contradictions by declaring that CX or the specialist always wins. Remove the contradiction from the skill trigger or contract.

## Required before common CX routes

### `diagnosing-bugs`

**Decision:** Keep the method. Narrow automatic loading to hard cases.

The body describes a discipline for hard bugs, but the current description loads it for every report of something broken, failing, throwing, or slow. That forces trivial repairs into a strict reproduction program.

Proposed description scope:

> Use for hard, elusive, intermittent, or performance bugs, or when a first repair attempt failed. Also use when Charlie explicitly asks for a full diagnosis or debugging investigation.

Do not change the body in v0. Review its strict no-reproduction stopping rule during the later full skill cleanup.

### `tdd`

**Decision:** Keep seam discipline. Remove routine human approval.

Replace the requirement to confirm every test seam with Charlie.

Proposed rule:

> Before writing tests, state the public seams under test. Confirm with Charlie only when seam placement is a genuine architecture, product, or scope choice. Otherwise choose the seam and proceed.

Keep red, green, vertical slices, public-interface tests, and the anti-pattern guidance.

### `code-review`

**Decision:** Keep the generic branch, PR, work-in-progress, and review-since trigger. Keep the separate Standards and Spec axes.

Make the workflow Pi-native:

- Replace Claude Code `Agent` calls and the `general-purpose` agent name with Pi subagents using two isolated lanes.
- Use the installed `pi-subagents` contract and parent synthesis.
- Use project-provided issue and spec sources, available MCP tools, local docs, commit references, or the user. Remove the missing `/setup-matt-pocock-skills` dependency.
- Preserve the two-axis output instead of reranking it. The CX Review playbook already defers to specialist output contracts.
- Treat the two independent axes as the review contribution. Do not add another judge merely to meet a count.

### `read-the-damn-docs`

**Decision:** Preserve broad documentation grounding but replace the long always-loaded procedure with a compact proportional dispatcher.

Use when an answer or implementation depends on an external library, framework, SDK, API, CLI, cloud service, provider, or other version-sensitive contract.

Order of evidence:

1. Read project wiki and docs, the installed version, source and types, nearby usage, schemas, and tests for project truth.
2. Use Context7 as the preferred normal source for current upstream library documentation.
3. Read direct official pages, changelogs, source, schemas, or migration guides when Context7 is missing, version-unclear, or the claim affects auth, security, billing, data, migrations, deployment, compliance, or another consequential boundary.
4. Use general web search for discovery and gaps.

Keep the pass proportional. A tiny edit with an established local contract needs a quick local confirmation, not a research project. Replace stale `Codex` wording with `agent`. Move long examples and detailed method into conditional references or delete them.

### Pango PHP test rules

**Decision:** Let tests change when the requested behavior changes the tested contract. Keep the protection against making a failing test easier.

Replace the current same-turn permission gate with:

> Keep existing tests unchanged unless the requested behavior itself changes the tested contract. Never weaken assertions, fixtures, expected values, or test semantics merely to make a failure pass.

The two nearby red-first bug-test rules can be collapsed during the later full cleanup. That is not required for CX v0.

## Focused UI cluster

### Primary general owner

Keep `impeccable` unchanged as the primary general UI design, redesign, critique, and audit skill. It is versioned third-party content. Do not fork it merely to narrow its description.

### Narrow specialists

Keep `make-interfaces-feel-better`, but narrow automatic discovery to explicit polish, “make it feel better”, “feels off”, micro-interaction, and named detail work such as optical alignment, radii, typography, tabular numbers, icon weight, and motion restraint. Do not load it for every frontend edit.

Keep `apple-design`, but narrow automatic discovery to gesture-driven and physics-based interaction, springs, drag and swipe, sheets, momentum, interruption, and Apple material and depth. Do not advertise it as a general typography, reduced-motion, or product-critique skill.

Keep `animation-vocabulary` unchanged for reverse lookup of motion names.

Keep `review-animations` unchanged. Pi honors its existing `disable-model-invocation: true`, so it remains explicit-only.

### Duplicate UI skills

Add `disable-model-invocation: true` to:

- `apple-design-principles`.
- `emil-design-eng`.

This removes automatic prompt cost and collisions without deleting them in v0. The later full-library cleanup will decide whether to merge any unique material and remove them.

## Keep unchanged for v0

The audit found no material CX conflict in:

- `codebase-design`.
- `prototype`.
- `simplify`.
- `deslop`.
- `plain-writing`.
- `writing-for-agents`.
- `pr-description`.
- `pi-subagents`.
- `monitor`.
- `pango-dev-env`.
- `pango-debug`.
- `pango-e2e-mockless`.
- `pango-rust-style`.

Keep does not mean permanently approved. The separate full-library cleanup may still simplify or merge them.

## Deferred to full skill cleanup

- Whether Pango should permit `as const` while banning type-asserting casts. This is a TypeScript policy choice, not a CX v0 dependency.
- Deeper simplification of the strict diagnosing workflow.
- Deduplication across the complete UI skill library.
- Removal or merging of explicit-only duplicate UI skills.
- Duplication inside Pango language style guides.
- All skills not on common CX routes.

## CX-side change already accepted

The generic Review playbook no longer tells the agent to load a broad “review skills” category. Explicit review specialists keep their own triggers and output contracts.

## Minimum approved audit scope

Before normal CX use, change only:

1. `diagnosing-bugs` trigger.
2. TDD seam approval rule.
3. `code-review` runtime and source discovery.
4. `read-the-damn-docs` size and evidence order.
5. Pango PHP existing-test rule.
6. `make-interfaces-feel-better` trigger.
7. `apple-design` trigger.
8. `apple-design-principles` and `emil-design-eng` discovery mode.

Do not include the full skill-library cleanup in CXStack v0.