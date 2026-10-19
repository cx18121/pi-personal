# CXStack

CXStack is a sticky work mode for Pi. It asks the agent to own the intended result, make routine engineering choices, and judge work from the consumer and maintainer experience.

## Use it

New blank sessions start with CX active. The footer shows `CX`. Send tasks normally, or activate it explicitly:

```text
/cx Fix the checkout regression. Do not push.
```

Use `/cx off` to turn it off, and `/cx` to turn it back on. Explicit state survives reloads, forks, and tree changes. Historical sessions without CX state keep their prior behavior.

## What it changes

The kernel emphasizes intent, useful outcomes, clear domain ownership, and removing unnecessary machinery. It asks the agent to spend verification effort on uncertainties that could change its judgment or next action. Source inspection, reasoning, execution, and user feedback can each be the appropriate evidence.

Discussion and review stay read only until changes are requested. Within authorized work, the agent chooses engineering methods without route announcements or workflow transitions. Material user-owned choices still come back to you. Commit, push, publication, deployment, and production mutation require authority for the action and target.

References provide techniques for product design, diagnosis, performance, refactoring, prototypes, review, delegation, delivery, and handoff. They are consulted when useful, not treated as stages every task must complete. Changes whose failure could be hidden or hard to undo require independent adversarial review before delivery unless you explicitly waive it. For other work, review is conditional on the value of another perspective. The review challenges the proposed direction as well as its implementation.

Todo creation, the writing baseline, model policy, and child waiting have their own owners outside CXStack. CXStack does not maintain a parallel plan or execution ledger.

## Session state and evidence

The runtime stores one session-wide on/off state. Active directives identify the hash of the kernel content they contain. Restoration compares the selected context's directive with the current kernel, so an undelivered update or an older branch does not count as current guidance. Compaction can restore missing guidance.

Reference metadata records the reference name and a fingerprint of a successful top-level `read` result observed by the extension. It contains no transcript text, source content, or absolute path. It does not prove a complete file was read, that the model retained it, or that another extension left the result unchanged afterward. Nested reads are excluded because their output may never reach the model. Older markers are labeled legacy rather than treated as equivalent evidence.

## Reflect

Run `/reflect` to propose durable improvements from the current session:

```text
/reflect focus on unnecessary work and the quality of the result
```

The parent can handle straightforward lessons. If another perspective would help, it sends a bounded sanitized digest to a reviewer rather than the raw transcript or private details. It may read the exact proposed destination to check whether a change is still needed.

Reflect shows actionable proposals and waits for your selection before changing memory, skills, code, or guidance. It works whether CX is active or not.

## Audit

Run `/cx-audit` to examine prior CX sessions. The extension scans local candidate session files to select the cohort. The model receives a manifest, not those scanned transcript bodies, and reviews only the selected files.

The cohort contains every prior session with a recorded current-version kernel directive, excluding the current session. If none exist, it contains every detected CX session. This can be a large cohort. Session-wide version observations do not establish which guidance governed every individual task. Historical activation-state versions are not proof of kernel delivery.

Audit looks for changes that improve work quality and judgment, including unnecessary effort and ineffective guidance. It proposes changes and waits for approval. It does not rewrite CXStack automatically.

## Making changes

Use current source and observed behavior rather than historical design records. Keep each rule with one owner. Preserve behavior tests for runtime contracts, not assertions that freeze instruction wording.

The focused runtime tests are:

```sh
bun test ./modules/cxstack/test
python3 -B -m unittest discover -s modules/cxstack/test -p '*_test.py'
```

The package's `test` script includes both. The Python tests use the standard library and make no provider calls.

`test/reflect-privacy-probe.py` is an explicit synthetic live probe, separate from that suite. It requests a reviewer and requires at least one matching successful result, allowing a successful fallback after a failed attempt. Its sentinel check covers initial and follow-up messages sent to children, not the children's full context. It also checks selected local files for changes. It requires configured provider access and does not establish a general privacy guarantee.

After approved guidance or extension edits, use `/reload`. Commit, push, and publication remain separate actions.

## Source owners

- `extensions/cx.ts` and `lib/cx.ts` own activation, restoration, directive identity, and reference observations.
- `extensions/audit.ts` and `lib/audit.ts` own cohort selection and audit initiation.
- `extensions/reflect.ts` owns reflection initiation.
- `resources/kernel.md` contains active guidance. `resources/references/` contains optional techniques.
- `resources/audit.md` and `resources/reflect.md` contain the two learning workflows.
- `test/cxstack.test.ts` and `test/extensions.test.mjs` cover runtime behavior. The live reflection probe is separate.
