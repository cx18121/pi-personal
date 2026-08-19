# Full skill library audit

## Scope

The audit covers every skill available to Pi from the current global, project, and package roots. It also covers the active Claude and Codex skills that duplicate or extend that library.

The Pi inventory contains 57 skills. There are 44 global skills, 11 Pango skills, and 2 package owned Pi skills. The cross runtime pass adds PDF, Playwright, and Skill Cleaner. Sixteen global skills were hidden by Pi settings but still installed.

The source inventory is in [`skill-library-inventory.json`](skill-library-inventory.json). Independent cluster reviews are saved beside this document. Their suggestions are evidence, not inherited decisions.

## Audit rules

Each skill needs one clear job. A model invoked description must name the distinct branches that require the skill without synonym lists. A skill stays explicit when only Charlie should start it. Current source, tools, dependencies, and project rules win over copied instructions. Repeated method belongs to one owner. Stale commands, forced approval, and unsupported authority are defects. Reference material should load only when its branch needs it.

## Runtime findings

A fresh Pi process initially discovered 25 subagents and 57 skills. The old runner error came from this long running process retaining code from before `pi-subagents` 0.51.0 added `external-job`. A normal fresh reviewer child completed successfully.

The audit then found that `pi-subagents` treats Markdown under legacy `~/.agents` paths as agent definitions, except the active `~/.agents/skills` branch. The old `skills-archive` and Superset command directories therefore created 18 false user agents. Moving those archives outside `~/.agents` leaves exactly 7 valid built-in agents. After cleanup, a fresh Pango process discovers 35 skills, with 23 global, 10 project, and 2 package skills.

The former global skill catalog was too broad. It contains retired Superset behavior, three overlapping Firecrawl skills that duplicate Pi tools, six overlapping UI and motion skills, two broken document bundles, and style guides with large standard library examples.

## Global engineering and work skills

| Skill | Decision | Final owner or change |
| --- | --- | --- |
| `code-review` | Keep | Own Standards and Spec review. Keep model discovery because branch and pull request review requests should route automatically. |
| `codebase-design` | Narrow and merge | Own deep module and seam design. Remove compulsory vocabulary and universal claims. Absorb the useful architecture hotspot scan. |
| `deslop` | Keep | Own explicit cleanup of generated code. It edits when the user requests cleanup, unlike the read only Simplify review. |
| `diagnosing-bugs` | Narrow | Own hard, intermittent, performance, and failed first fix investigations. Continue from exact runtime evidence when reproduction is unavailable instead of stopping all diagnosis. |
| `improve-codebase-architecture` | Merge and remove | Move the useful hotspot scan to Codebase Design. Remove forced HTML, missing skills, and stale agent calls. |
| `prototype` | Narrow | Keep the logic and UI prototype branches. Record the learned contract and keep publication forbidden unless separately requested. |
| `resolving-merge-conflicts` | Narrow | Keep the specialist process. Remove the bans on aborting and the automatic stage and commit authority. |
| `simplify` | Narrow and merge | Own read only overengineering review. Replace exact line count theater with an optional estimate. Absorb a small strict maintainability reference. |
| `tdd` | Narrow | Trigger only for explicit test first work. Allow refactoring after green. Replace universal mock and assertion rules with behavior based guidance. |
| `thermo-nuclear-code-quality-review` | Merge and remove | Preserve only structural growth, misplaced responsibility, and spaghetti checks in Simplify. |
| `writing-for-agents` | Keep | Own agent facing prose, skill mechanics, and context pointers. |
| `plain-writing` | Keep | Charlie wants this style by default, so it remains model discoverable. |
| `pr-description` | Narrow | Own title and body text. Remove authority over opening state and remove the routine approval checkpoint. |
| `grilling` | Merge and remove | Move its decision tree method into `grill-me`. |
| `grill-me` | Merge and enable | Keep the established `/grill-me` name and natural grill triggers in one skill. Use facts from tools and ask only current frontier decisions. |
| `read-the-damn-docs` | Keep | It is already short, proportional, local first, and current. |
| `teach-me` | Narrow | Keep explicit. Use `ask_user_question`, keep the checklist in conversation by default, and stop when the requested learning goal is met. |

## UI, motion, and document skills

| Skill | Decision | Final owner or change |
| --- | --- | --- |
| `impeccable` | Keep and narrow pointer | Own general UI design, redesign, critique, and audit. Shorten its model visible description without changing the routed body. |
| `make-interfaces-feel-better` | Narrow | Own explicit micro detail polish. Move the large review report contract behind a reference used only for review requests. |
| `apple-design` | Narrow and enable | Own gesture physics, springs, momentum, interruption, and Apple materials. Remove typography, generic process, and broad product critique sections. |
| `review-animations` | Keep explicit | Own explicit animation review and the retained Emil standards catalog. |
| `apple-design-principles` | Remove | Its scorecard and principles overlap Impeccable and Apple Design. |
| `emil-design-eng` | Remove | Review Animations already retains the useful motion catalog. Remove the mandatory persona and course advertisement. |
| `animation-vocabulary` | Remove | The glossary has no observed use and mirrors an external page that would need manual synchronization. |
| `docx` | Remove | It had no use in the reviewed three-month history. Install the complete current bundle and its dependencies when a real Word document task requires it. |
| `xlsx` | Remove | It had no use in the reviewed three-month history. Ordinary CSV work does not need it. Install the complete bundle and LibreOffice only when a real spreadsheet task requires formula recalculation. |
| `pdf` | Keep one copy | Use the shorter Codex copy as the canonical PDF skill. Keep visual rendering as the proof target. |

## Tools and operations

| Skill | Decision | Final owner or change |
| --- | --- | --- |
| `find-skills` | Remove | Use native search and Pi package management only when Charlie asks to find a skill. |
| `firecrawl` | Narrow | Native `web_search` and `fetch_content` own normal web work. Keep model routing only for an explicit Firecrawl request or a capability native tools cannot provide. |
| `firecrawl-deep-research` | Remove | Native web tools and bounded researchers replace it. |
| `firecrawl-interact` | Remove | Agent Browser and Pi browser UI tools replace it. |
| `firecrawl-research-papers` | Remove | Its required installed CLI command does not exist. Native research tools replace it. |
| `firecrawl-scrape` | Merge and remove | Native `fetch_content` owns normal URL extraction. Keep only valid specialized flags in the explicit Firecrawl skill. |
| `firecrawl-search` | Merge and remove | Native `web_search` owns normal search. Keep only valid specialized flags in the explicit Firecrawl skill. |
| `herdr` | Keep | It already triggers only when Charlie explicitly mentions Herdr and matches the installed CLI. |
| `improve` | Remove | Focused review, diagnosis, design, and simplification owners replace its forced planning system. |
| `pango-dev-env` | Narrow | Remove Superset from its trigger and copy the store safety rules into the skill. Keep the current helper dependency visible until the helper itself moves. |
| `superset-10x` | Remove | Retired product workflow. |
| `superset-automate` | Remove | Pi schedules replace it. |
| `superset-contribute` | Remove | Current project instructions replace it if that work returns. |
| `superset-doctor` | Remove | Herdr and Pi package diagnostics replace it. |
| `superset-feedback` | Remove | Ordinary feedback drafting and the current tracker replace it. |
| `superset-orchestrate` | Remove | Pi Subagents, Herdr, Intercom, and Monitor have separate current ownership. |
| `superset-setup` | Remove | Current repository setup and worktree guidance replace it. |
| `superset-standup` | Remove | Pi run status, missions, Herdr, and Intercom replace it. |
| `monitor` | Keep package owned | The package owns the matching tools and current instructions. |
| `pi-subagents` | Keep package owned | The package owns its tool, references, schedules, missions, worktrees, and supervisor protocol. |
| `playwright` | Remove | Charlie prefers Agent Browser. The Playwright skill duplicates that browser workflow and is Codex only. |
| `skill-cleaner` | Keep explicit | Keep one canonical copy for future manual audits. Never scan transcripts unless the task explicitly needs usage evidence. |

## Pango project skills

| Skill | Decision | Final owner or change |
| --- | --- | --- |
| `bunnyshell-environments` | Remove | Pango no longer uses Bunnyshell. The repository documents its replacement. |
| `dev-note` | Keep explicit | It is a small capture command over the PR tour store. |
| `ext-php-rs` | Keep | It matches the pinned crate and discloses detailed references only when needed. |
| `laravel-model-states` | Keep | It matches the installed package and current state model paths. |
| `pango-debug` | Narrow | Replace retired host PHP FPM instructions with the Docker and FrankenPHP stack. Use `pango dev exec` for Tinker. |
| `pango-e2e-mockless` | Keep and correct commands | Use the preferred `pango e2e` entry points. |
| `pango-js-ts-style` | Narrow | Allow `as const` and import aliases while banning compiler overriding assertions. Scope Neverthrow to `dev/`, remove install instructions and standard library examples, and align nullish defaults with the no fallback chain rule. |
| `pango-php-style` | Narrow | Keep PHP house rules. Remove standard library and monad API dumps. Correct library availability. Move shared test and location rules to `coding-standards.md`. |
| `pango-rust-style` | Narrow | Keep Rust house rules. Remove standard library examples, API dumps, and the meaningless inheritance rule. |
| `pr-tour` | Keep | It is an explicit project workflow with verified assets and commands. |
| `zen-jdm` | Narrow | Replace stale pre 0.55 loader and custom node examples with the current `crates/enigma` patterns. |

## Shared Pango rules

`coding-standards.md` becomes the single home for the language independent `location.name` rule and exact test proof rules. Language skills point to it instead of copying those rules.

`as const` is allowed because it preserves literal and readonly inference. Import aliases are also allowed. Assertions such as `as SomeType`, `as any`, `as unknown as SomeType`, angle bracket casts, and non null assertions remain forbidden unless a current external boundary cannot be typed another way and a checked adapter contains the exception.

## Ownership

Personal and modified skills remain in the current global skill root during this cleanup. The audit report and exact changes live in the uncommitted `pi-personal` worktree. Package owned skills stay with their package. Pango skills stay in the separate Pango skill worktree.

The pre-cleanup archive moved to `~/.pi/agent/backups/skills-archive-before-cxstack-audit`. Keeping it outside `~/.agents` prevents Pi Subagents from treating archived Markdown as user agents. Claude links to compatible global skills. Pi-only Code Review is not linked into Claude.

Future skill updates must preserve this audit or be reviewed as replacements. An upstream update does not silently restore a removed trigger or rule.

## Rejected reviewer suggestions

Plain Writing remains model discoverable because Charlie explicitly wants it as the default prose style. Code Review remains model discoverable because branch and pull request reviews need its exact two axis contract. Deslop remains separate from Simplify because one applies requested cleanup while the other reports complexity without editing. Merge conflict handling remains a specialist because source intent and in progress Git state need a specific process. Prototype remains model discoverable behind explicit prototype language instead of requiring Charlie to remember a command.

## Applied result

The global library now contains 23 skills instead of 44. The Pango worktree contains 10 project skills instead of 11. Package owned Monitor and Pi Subagents remain unchanged. A fresh Pango Pi process discovers 35 skills and exactly 7 built-in subagents, with no false user or project agents.

The active global skill bodies fell from 5,444 lines to 1,778 lines. The Pango skill bodies fell from 2,614 lines to 1,102 lines. Removed skills and pre-edit files remain recoverable from the backup outside the discovery roots.

The first correction pass proved that complete DOCX and XLSX bundles could work, but the audit found no use for either skill in the reviewed three-month history. Charlie chose the leaner final state. Both skills and the dependencies installed only for them were removed. They can be installed together on the first real document task.

Final targeted Claude and GPT reviews returned GO after corrections. The full review trail is in [`skill-library-final-review.md`](skill-library-final-review.md).

The Pango portion was committed as `0de5835e4`, then [Pango pull request #655](https://github.com/pango-tech/backend-app/pull/655) merged into `master` as `bc63959f4`. The local global skills and the `pi-personal` worktree remain separate from that pull request.
