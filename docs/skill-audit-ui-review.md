# UI / design / document skill-cluster audit — deletion-first

## Context

The skill library is over prompt budget (skill-cleaner: description lines alone are ~241% of the 2% context target; every extra line dilutes trigger accuracy). The UI/design cluster has six skills that all claim motion/polish territory, two Apple skills that duplicate each other, and two document skills whose instructions call scripts that do not exist on disk. This audit assigns one general UI owner, clear narrow owners, and deletes the rest.

Evidence gathered (read-only):
- Read all nine SKILL.md files plus review-animations/STANDARDS.md, make-interfaces-feel-better's five reference files, and impeccable's animate.md.
- Ran skill-cleaner (3-month transcript scan): **zero invocations/reads** for animation-vocabulary, apple-design, apple-design-principles, review-animations, docx, xlsx. Usage evidence exists only for impeccable, make-interfaces-feel-better, emil-design-eng.
- `~/.agents/skills/docx` and `~/.agents/skills/xlsx` contain **only SKILL.md** — no `scripts/` at all — yet mandate `scripts/office/unpack.py`, `pack.py`, `soffice.py`, `validate.py`, `comment.py`, `accept_changes.py` (docx) and `scripts/recalc.py` (xlsx). Both also exist as second, unlinked copies at `~/.claude/skills/docx` and `~/.claude/skills/xlsx` (same content, also script-less). docx additionally hardcodes **"Codex" as the tracked-changes author** — it is an unadapted port.
- review-animations/STANDARDS.md is a near-complete condensation of emil-design-eng (same frequency table, easing curves, duration table, spring configs, gesture rules, perf rules, debugging advice).
- apple-design §16 is a condensed duplicate of the entire apple-design-principles skill.
- apple-design-principles has `disable-model-invocation: true` **and** a 702-char description written to auto-trigger aggressively — a dead contradiction; the description costs budget for a skill the model can never self-invoke.
- Observed but unexplained: apple-design and docx do not appear in the current session's model-visible skill list despite having no disable flag (docx) / no flag at all (apple-design). Deletion below makes the docx case moot; apple-design should be re-verified after the cleanup.

## Verdicts

| Skill | Verdict | Role after cleanup |
|---|---|---|
| impeccable | **KEEP** | General UI owner (design, redesign, critique, audit, all commands) |
| make-interfaces-feel-better | **NARROW** | Narrow owner: micro-detail polish ("feels off", radius, tabular nums, icon weight) |
| apple-design | **NARROW** | Narrow owner: gesture physics, springs, momentum, materials/depth |
| review-animations | **EXPLICIT-ONLY** (already is — keep as-is) | Explicit `/review-animations`; sole home of the Emil rule catalog via STANDARDS.md |
| emil-design-eng | **DELETE** | — |
| apple-design-principles | **DELETE** | — |
| animation-vocabulary | **DELETE** | — |
| docx | **DELETE** (both copies) | — |
| xlsx | **NARROW** (+ delete duplicate copy) | Narrow owner: spreadsheet files |

## Per-skill rationale and exact changes

### impeccable — KEEP (general UI owner)
Only skill with real infrastructure (24 command references, detector, live mode, hooks), version-managed (4.0.4), and in active use. Its references load on demand, so the ~2.5 MB on disk is not context cost. One flaw worth fixing while editing anyway: the 895-char description is the single largest line in the whole prompt budget. Optional edit: compress to ~1 sentence + trigger nouns (design/redesign/critique/audit/polish/animate/frontend/UI/landing page/dashboard/component), preserving the "Not for backend-only" exclusion. No other change.

### make-interfaces-feel-better — NARROW
Used, and its content is the good kind of opinionated (concentric radius, exact 0.96 press scale, icon cross-fade recipe). Two problems: (1) ~40% of SKILL.md is mandatory review bureaucracy (modes, finding caps, coverage tables, "Considered but Rejected", Block/Approve verdicts) that fires even for "make this button feel better"; (2) trigger overlap with impeccable on "polish".
- **Smallest change:** move the "Review Output Format" section (SKILL.md lines ~120–187) into `references/review-format.md`, referenced only when the user explicitly asks for a review/audit. Add one boundary sentence to the description: "For single-surface detail passes; whole-surface redesign/critique belongs to impeccable."
- **Survives:** everything; the format section moves, nothing is lost.

### apple-design — NARROW
Zero recorded use, but the gesture-physics material (velocity handoff, Apple's exponential momentum-projection function, rubber-band formula, materials/vibrancy, multimodal feedback, damping/response tables) is the deepest unique content in the cluster — nothing else covers it. Its description was already correctly narrowed; the body wasn't.
- **Smallest change:** delete §15 Typography (owned by make-interfaces-feel-better/typography.md and impeccable `typeset`) and §17 Process (generic advice). Keep §16 — after apple-design-principles is deleted it becomes the sole condensed home of the 8 principles. Remove the two typography rows from the Quick Reference table. After cleanup, verify the skill actually surfaces in the model skill list (it currently doesn't, cause unknown).
- **Survives:** §1–14, §16, Quick Reference minus typography rows — all in place.

### review-animations — EXPLICIT-ONLY (no change)
Already `disable-model-invocation: true`; the aggressive reviewer persona and Block/Approve format are appropriate for an explicit review command. Zero usage, but it becomes the only surviving home of the Emil catalog (STANDARDS.md), so it earns its place as the cluster's animation-review owner. No edit.

### emil-design-eng — DELETE
`disable-model-invocation` already, zero standalone value left: STANDARDS.md reproduces its entire technical catalog (frequency table, easing curves, durations, springs, interruptibility, clip-path, gestures, perf incl. the Framer Motion shorthand caveat, a11y, debugging, cohesion). What remains unique is anti-content: a mandatory persona, a mandatory canned first response advertising animations.dev, and a mandated table format duplicated in review-animations.
- **Exact change:** `rm -rf ~/.agents/skills/emil-design-eng` and the `~/.claude/skills/emil-design-eng` symlink.
- **Survives:** full technical catalog in `review-animations/STANDARDS.md` (verified near-verbatim). Only real loss: the Sonner library-authoring notes (DX-first, defaults, naming) — generic library advice, not worth a skill; if wanted, append 5 lines to STANDARDS.md under "Component authoring", but default is to let it go.

### apple-design-principles — DELETE
Unreachable by design (disable-model-invocation) yet paying a 702-char description written for auto-triggering; never invoked explicitly either. Content (WWDC26 8 principles + mandatory ✅/⚠/❌ scorecard) is duplicated in condensed form in apple-design §16, and design critique is owned by impeccable `critique`.
- **Exact change:** `rm -rf ~/.agents/skills/apple-design-principles` and its `~/.claude/skills` symlink.
- **Survives:** the 8 principles + tactical rules in apple-design §16 (kept above). Lost: the scorecard template and tensions table — generic critique scaffolding impeccable already covers.

### animation-vocabulary — DELETE
Zero usage; a naming lookup is squarely within model capability without a glossary. Decisively: the file says it is "a curated snapshot mirroring the project's `/vocabulary` page; keep the two in sync" — it is project-tied content living in the global library, a standing sync liability.
- **Exact change:** `rm -rf ~/.agents/skills/animation-vocabulary` and its `~/.claude/skills` symlink.
- **Survives:** the glossary's source of truth is the project's `/vocabulary` page it mirrors. If canonical wording matters for that project, recreate it as a project-local skill in that repo — not globally.

### docx — DELETE (both copies)
Broken on arrival: every workflow step (unpack → edit → pack, validation, comments, tracked-change acceptance, .doc conversion) calls one of six scripts that don't exist in either copy; it instructs "Use **Codex** as the author"; it assumes `npm install -g docx` and LibreOffice; it doesn't even appear in the session skill list; zero usage in 3 months. The XML reference is good material but unusable without the script bundle.
- **Exact change:** `rm -rf ~/.claude/skills/docx ~/.agents/skills/docx`.
- **Survives:** the complete skill *with* its scripts lives upstream in Anthropic's public skills repo (anthropics/skills). On the first real Word-document task, install the full upstream bundle (scripts included) instead of the text-only port — and fix the author name then.

### xlsx — NARROW
More defensible than docx: the pandas/openpyxl guidance works with tools actually present, and spreadsheets are a plausible recurring task. But (1) the MANDATORY step 5 ("recalculate with `scripts/recalc.py`") points at a script that doesn't exist, so the skill currently instructs an impossible verification; (2) ~60 lines of investment-banking procedure (blue/black/green/red color codes, SEC-filing source-citation formats, multiples formatting) is niche procedural bulk in the always-loaded body; (3) a second identical copy sits unlinked in `~/.agents/skills/xlsx`.
- **Smallest change:** (a) `rm -rf ~/.agents/skills/xlsx` (keep the loaded `~/.claude/skills/xlsx`, or move+symlink to match the .agents convention — pick one home); (b) either vendor `scripts/recalc.py` from the upstream anthropics/skills xlsx bundle or rewrite step 5 to a command that exists (`soffice --headless --convert-to xlsx --outdir` round-trip, then openpyxl error scan), verifying LibreOffice is installed; (c) move the "Financial models" block (color coding, number formats, hardcode-documentation formats) to `references/financial-models.md`, loaded only when the task is a financial model.
- **Survives:** everything; the financial-model standards move behind a reference.

## Resulting cluster (5 skills, was 9)

- **impeccable** — general UI owner: build, redesign, critique, audit, all design commands.
- **make-interfaces-feel-better** — narrow: micro-detail polish and "feels off" passes.
- **apple-design** — narrow: gesture physics, springs, momentum, materials/depth.
- **review-animations** — explicit-only: animation code review, owns STANDARDS.md (the surviving Emil catalog).
- **xlsx** — narrow: spreadsheet files, repaired verification step, finance bulk behind a reference.

**Deletion count: 4 skills deleted** (emil-design-eng, apple-design-principles, animation-vocabulary, docx) **+ 2 duplicate directories** (second docx copy counted with docx; unlinked xlsx copy) **+ 3 dangling `~/.claude/skills` symlinks** removed with their targets.

## Execution steps (on approval)

1. `rm -rf` the four deleted skills in `~/.agents/skills/` and both `~/.claude/skills/docx` + `~/.agents/skills/xlsx` duplicates.
2. Remove the now-dangling symlinks in `~/.claude/skills/` (emil-design-eng, apple-design-principles, animation-vocabulary).
3. Edit `apple-design/SKILL.md`: delete §15, §17, and the two typography Quick Reference rows.
4. Edit `make-interfaces-feel-better`: extract the Review Output Format section to `references/review-format.md`; add the one-sentence boundary to the description.
5. Edit `xlsx/SKILL.md`: fix the recalc step (vendor upstream script or swap to an existing command); extract the Financial-models block to `references/financial-models.md`.
6. Optionally compress the impeccable description (~895 → ~300 chars).

## Verification

- `node --experimental-strip-types ~/.claude/skills/skill-cleaner/scripts/skill-cleaner.mts --no-logs` — confirm the deleted skills are gone from the report, no new duplicates, and description-budget pressure dropped.
- Start a fresh session and confirm: the five surviving skills load; apple-design now appears in the model skill list (investigate loader if it still doesn't); no skill list entry references a deleted name.
- For xlsx: run the rewritten recalculation step once on a scratch workbook with a formula and confirm it reports errors correctly.
