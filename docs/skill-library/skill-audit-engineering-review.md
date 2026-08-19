The clean target is 12 skills. Delete 2, merge 3, keep 7 model-visible, and keep 5 explicit-only. No files were changed or published.

## Confirmed facts

- The request names 17 skills. I read every `SKILL.md`, all linked local references and scripts, and the Pi metadata files.
- The cluster contains 73,046 bytes of primary skill instructions and 34,809 bytes of supporting material. Loading every branch would expose 107,855 bytes.
- Pi currently sees 13 skills automatically and 4 only through `/skill:name`. Their automatic descriptions total 3,231 characters.
- Pi 0.84.2 supports `disable-model-invocation`. The files under `agents/openai.yaml` do not control Pi invocation.
- `pi-subagents` 0.51.0 and `workflowScript` are current. References to the generic `Agent` tool and `subagent_type=Explore` are stale.
- The installed question tool is `ask_user_question`, not `AskUserQuestion`.
- The CXStack checkout contains `/cx`, `/reflect`, and Context7 integration. Current Pi settings filter that package to `extensions/answer.ts`, so those other CXStack capabilities are not presently active.
- `improve-codebase-architecture` references a `domain-modeling` skill that is not installed.

The verdicts below are design judgments. I used the current request and project rules as the authority, then chose one owner for each method or output contract.

## Verdicts

| Skill | Verdict | Smallest change and replacement |
|---|---|---|
| [code-review](/Users/charliexue/.agents/skills/code-review/SKILL.md) | **EXPLICIT-ONLY** | Add `disable-model-invocation: true` and shorten the description to “Two-axis Standards and Spec review from a supplied base.” Keep it as the sole owner of that exact two-lane output. Ordinary reviews remain with the parent or CXStack Review method. Its current `pi-subagents` workflow is valid. |
| [codebase-design](/Users/charliexue/.agents/skills/codebase-design/SKILL.md) | **NARROW** | Keep it as the architecture owner. Remove the demand to use its vocabulary “exactly,” the claim that every module has exactly one interface, and other universal wording. Delete `DESIGN-IT-TWICE.md`; replace it with one conditional paragraph saying to compare materially different designs in the parent, using `pi-subagents` only when independent lanes justify the cost. Absorb the useful hotspot scan from `improve-codebase-architecture`. |
| [deslop](/Users/charliexue/.agents/skills/deslop/SKILL.md) | **DELETE** | Delete the directory. Its behavior-preserving cleanup rules are normal model behavior plus project style rules. `simplify` replaces the read-only complexity audit. The ordinary implementation path replaces edits. |
| [diagnosing-bugs](/Users/charliexue/.agents/skills/diagnosing-bugs/SKILL.md) | **NARROW** | Keep ownership of hard, intermittent, performance, or failed-first-fix investigations. Replace “no reproduction, no hypothesis” with “build the strongest practical falsifiable signal; when reproduction is unavailable, continue from exact logs, traces, runtime evidence, and code while stating the proof limit.” Separate diagnosis-only requests from authorized fixes. Remove its automatic architecture handoff. |
| [improve-codebase-architecture](/Users/charliexue/.agents/skills/improve-codebase-architecture/SKILL.md) | **MERGE** | Delete this skill and `HTML-REPORT.md`. Move only the hotspot scan and evidence-backed candidate ranking into `codebase-design`. Drop the forced HTML, CDN, Mermaid, missing `domain-modeling`, mandatory grilling, and stale `Agent` workflow. |
| [prototype](/Users/charliexue/.agents/skills/prototype/SKILL.md) | **EXPLICIT-ONLY** | Add `disable-model-invocation: true`. Keep its two specific artifact formats only when Charlie requests this prototype workflow. Replace “lift the prototype module into production” and forced throwaway branches with “record the learned contract; discard or retain the prototype locally as requested; implement production code normally.” Do not modify a production route or package script unless authorized. |
| [resolving-merge-conflicts](/Users/charliexue/.agents/skills/resolving-merge-conflicts/SKILL.md) | **DELETE** | Delete it. “Never abort,” “stage everything,” and “commit” assume authority the task may not grant. Current Git state, source commits, project rules, and the parent’s normal conflict-resolution behavior replace it. |
| [simplify](/Users/charliexue/.agents/skills/simplify/SKILL.md) | **NARROW** | Make the description explicitly read-only and remove bare “simplify” as a trigger for edit requests. Replace the supposedly exact line-reduction score with an optional labeled estimate. Make this the sole owner of overengineering and deletion review. Add a small conditional strict-maintainability reference containing the useful parts of Thermo-Nuclear. |
| [tdd](/Users/charliexue/.agents/skills/tdd/SKILL.md) | **NARROW** | Remove “or wants integration tests” from the trigger. TDD should load only for explicit test-first or red-green work. Permit a small refactor after green instead of postponing all refactoring to code review. Change the absolute mocking and single-assertion rules into behavior-based guidance. This remains the sole test-first method owner. |
| [thermo-nuclear-code-quality-review](/Users/charliexue/.agents/skills/thermo-nuclear-code-quality-review/SKILL.md) | **MERGE** | Delete the skill. Move only large-file growth, spaghetti-condition growth, and misplaced responsibility checks into a conditional `simplify` reference. Drop “presumptive blocker,” “withhold approval,” the universal 1,000-line gate, and the assumption that a dramatic rewrite always exists. `simplify` owns strict maintainability review; `codebase-design` owns architectural redesign. |
| [writing-for-agents](/Users/charliexue/.agents/skills/writing-for-agents/SKILL.md) | **KEEP** | It has one clear owner, a short automatic description, valid progressive disclosure, no stale tool contract, and material guidance beyond model defaults. |
| [plain-writing](/Users/charliexue/.agents/skills/plain-writing/SKILL.md) | **EXPLICIT-ONLY** | Add `disable-model-invocation: true` and describe it as Charlie’s explicit prose revision style. It currently claims almost every prose turn and has the cluster’s largest automatic description. Normal conversation uses the model’s plain-writing default and current instructions. `pr-description` retains its own inlined PR rules. |
| [pr-description](/Users/charliexue/.agents/skills/pr-description/SKILL.md) | **NARROW** | Make it own title and body content only. Remove the requirement to show Charlie before opening, the ready-versus-draft decision, and the external example links. PR creation and review state belong to the current request, project delivery rules, and available authority. Remove the `plain-writing` invocation pointer because the needed PR rules are already duplicated locally. |
| [grilling](/Users/charliexue/.agents/skills/grilling/SKILL.md) | **MERGE** | Move its useful decision-tree and frontier method into `grill-me`, then delete this directory. This leaves one interview owner and preserves Charlie’s established command name. |
| [grill-me](/Users/charliexue/.agents/skills/grill-me/SKILL.md) | **EXPLICIT-ONLY** | Keep the existing manual-only invocation. Replace the one-line router with the narrowed grilling method. Use `ask_user_question` for at most four current-frontier questions, inspect facts directly, and use bounded subagents only when independent work earns the cost. Do not add a separate final approval gate when the user’s answers already settle the requested decisions. |
| [read-the-damn-docs](/Users/charliexue/.agents/skills/read-the-damn-docs/SKILL.md) | **KEEP** | It is compact, proportional, local-first, and has a clear owner. Its direct-official-source fallback already covers the fact that Context7 is not active. The unlinked README is documentation residue, but it adds no Pi prompt cost and does not justify changing the skill. |
| [teach-me](/Users/charliexue/.agents/skills/teach-me/SKILL.md) | **NARROW** | Keep it explicit-only. Replace `AskUserQuestion` with `ask_user_question` when exposed and ordinary questions otherwise. Keep the checklist in the conversation unless Charlie asks for a file. End when the requested learning goal is met or Charlie stops, rather than requiring exhaustive verified mastery of every generated item. |

## Ownership after cleanup

- Ordinary task control and general review: parent agent, with CXStack when active.
- Standards versus Spec review: `code-review`.
- Architecture and deep modules: `codebase-design`.
- Hard bug investigation: `diagnosing-bugs`.
- Throwaway design artifacts: `prototype`.
- Overengineering and strict maintainability: `simplify`.
- Test-first development: `tdd`.
- Agent-facing instructions: `writing-for-agents`.
- Explicit prose revision: `plain-writing`.
- PR title and body: `pr-description`.
- Decision interviews: `grill-me`.
- External and version-sensitive contracts: `read-the-damn-docs`.
- Staged teaching: `teach-me`.

## Proposed cluster

Model-visible:

- `codebase-design`
- `diagnosing-bugs`
- `simplify`
- `tdd`
- `writing-for-agents`
- `pr-description`
- `read-the-damn-docs`

Explicit-only:

- `code-review`
- `prototype`
- `plain-writing`
- `grill-me`
- `teach-me`

Removed:

- `deslop`
- `resolving-merge-conflicts`

Merged:

- `improve-codebase-architecture` into `codebase-design`
- `thermo-nuclear-code-quality-review` into `simplify`
- `grilling` into `grill-me`

This reduces the cluster from 17 to 12 skills. The automatic description text falls from 3,231 to 1,702 characters before tightening the retained descriptions. Total skills deleted or merged: **5**, consisting of **2 deletions and 3 merges**.

I used prior invocation history only as a tie breaker for retaining the `grill-me` name and preserving a strict maintainability mode. It is historical evidence, not current runtime truth.
