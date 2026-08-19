Delete 15 of the 20 skill directories. Keep three skills and narrow two. No files were edited and nothing was published.

The resulting owners should be `firecrawl`, `herdr`, `pango-dev-env`, package `monitor`, and package `pi-subagents`.

## Confirmed state

- Pi 0.84.2 registers `web_search`, `fetch_content`, browser UI tools, `monitor`, `subagent`, and `intercom`.
- `agent-browser` 0.34.0, Herdr 0.8.0, Firecrawl 1.17.1, `pango`, `pango-ready`, and `mise` are reachable.
- The local [Herdr skill](/Users/charliexue/.agents/skills/herdr/SKILL.md) exactly matches `herdr --skill`.
- The `superset` binary is absent. All eight Superset skills are already disabled in [Pi settings](/Users/charliexue/.pi/agent/settings.json:43).
- Firecrawl advertises commands that this installation does not have. These include `monitor`, `research`, `developer`, and generic `feedback`.
- Firecrawl links to six missing local skills: `agent`, `map`, `crawl`, `download`, `parse`, and `monitor`.
- `firecrawl-search` advertises a `developer` category and command that Firecrawl 1.17.1 does not support.
- `firecrawl-research-papers` depends on `firecrawl research`, which is unreachable.
- The active skills in this cluster cost about 836 catalog tokens using the analyzer’s approximate bytes divided by four rule. The three active Firecrawl skills account for about 448.
- The shared catalog analyzer is already at its full 5,440 token budget and omits 35 skills. Consolidating Firecrawl should reduce this cluster to about 450 tokens.
- Disabled skills have no current catalog cost, but they still add dead files, stale routing, and large invocation bodies. `improve` alone loads about 44 KB when its references are included. The package `pi-subagents` skill has about 109 KB of routed documentation, but it reads only the needed reference and owns the matching tool.

## Dispositions

| Skill | Result | Replacement and smallest action |
|---|---|---|
| [find-skills](/Users/charliexue/.agents/skills/find-skills/SKILL.md) | **DELETE** | Use `web_search` only when Charlie explicitly asks to find a skill. Use Pi’s native `install` and `config` commands for installation. Delete the disabled directory and its settings entry. |
| [firecrawl](/Users/charliexue/.agents/skills/firecrawl/SKILL.md) | **NARROW** | Generic search uses `web_search`. Known URLs use `fetch_content`. Browser development uses `agent-browser`. Keep Firecrawl for explicit Firecrawl requests, site mapping, bulk crawl, or structured extraction that native tools cannot do. Replace the 17.6 KB body with a help-first guide based on the installed CLI. Remove missing commands, dead links, forced feedback calls, installation behavior, and Claude style `Bash(...)` tool metadata. |
| [firecrawl-deep-research](/Users/charliexue/.agents/skills/firecrawl-deep-research/SKILL.md) | **DELETE** | Use `web_search`, `fetch_content`, and package `pi-subagents` researchers. Delete the disabled directory and settings entry. |
| [firecrawl-interact](/Users/charliexue/.agents/skills/firecrawl-interact/SKILL.md) | **DELETE** | Use `agent-browser` for browser development and Pi browser UI tools for visible or signed-in browser work. The narrow Firecrawl owner can still run `firecrawl interact` when Charlie names it. Delete the disabled directory and settings entry. |
| [firecrawl-research-papers](/Users/charliexue/.agents/skills/firecrawl-research-papers/SKILL.md) | **DELETE** | Use native web tools and `pi-subagents`. Its required `firecrawl research` command does not exist in the installed CLI. Delete the disabled directory and settings entry. |
| [firecrawl-scrape](/Users/charliexue/.agents/skills/firecrawl-scrape/SKILL.md) | **MERGE** | Use `fetch_content` by default. Keep only current specialized scrape flags in the narrow Firecrawl skill, then delete this active directory. |
| [firecrawl-search](/Users/charliexue/.agents/skills/firecrawl-search/SKILL.md) | **MERGE** | Use `web_search` by default. Keep only current Firecrawl search flags in the narrow Firecrawl skill. Remove the unsupported developer command and automatic feedback policy, then delete this active directory. |
| [herdr](/Users/charliexue/.agents/skills/herdr/SKILL.md) | **KEEP** | It has a reachable owner, current commands, exact version matched instructions, and an explicit-only trigger. |
| [improve](/Users/charliexue/.agents/skills/improve/SKILL.md) | **DELETE** | Use focused owners such as `code-review`, `simplify`, `diagnosing-bugs`, `codebase-design`, and `thermo-nuclear-code-quality-review`. Use `pi-subagents` only when orchestration is justified. Delete the disabled directory and settings entry. This also removes its forced planning system and weaker-model execution policy, which conflict with the repository’s scaled process. |
| [pango-dev-env](/Users/charliexue/.agents/skills/pango-dev-env/SKILL.md) | **NARROW** | Keep the Pango CLI, AWS safety rules, store separation, and current repository guide. Remove Superset from the description. Copy the required `pango-ready` and store policy facts into this skill or another Pango-owned location, then remove the dependency on `~/.superset/pango/README.md`. |
| [superset-10x](/Users/charliexue/.agents/skills/superset-10x/SKILL.md) | **DELETE** | Use Pi and Herdr documentation for current workflows. Delete the disabled directory and settings entry. |
| [superset-automate](/Users/charliexue/.agents/skills/superset-automate/SKILL.md) | **DELETE** | Use `pi-subagents` schedules for requested recurring agent work. Use `monitor` only to observe running work. Delete the disabled directory and settings entry. |
| [superset-contribute](/Users/charliexue/.agents/skills/superset-contribute/SKILL.md) | **DELETE** | For any future Superset contribution, read the current repository instructions and use `gh`, Herdr, and Pi. Delete the static product-specific skill and settings entry. |
| [superset-doctor](/Users/charliexue/.agents/skills/superset-doctor/SKILL.md) | **DELETE** | Use the current product owner’s diagnostics, such as Herdr help and status or package doctor commands. Delete the disabled directory and settings entry. |
| [superset-feedback](/Users/charliexue/.agents/skills/superset-feedback/SKILL.md) | **DELETE** | Draft feedback normally and submit through the current project’s issue tracker only after approval. Delete the disabled directory and settings entry. |
| [superset-orchestrate](/Users/charliexue/.agents/skills/superset-orchestrate/SKILL.md) | **DELETE** | `pi-subagents` owns managed headless delegation. Herdr owns visible persistent terminals. `intercom` owns Pi session messaging. `monitor` owns observation. Delete the disabled directory and settings entry. |
| [superset-setup](/Users/charliexue/.agents/skills/superset-setup/SKILL.md) | **DELETE** | Use repository setup instructions and Pi worktree support. Use Herdr when Charlie explicitly wants visible workspace setup. Delete the disabled directory and settings entry. |
| [superset-standup](/Users/charliexue/.agents/skills/superset-standup/SKILL.md) | **DELETE** | Use `pi-subagents` status and mission records. Use Herdr only when Charlie asks to inspect visible panes. Use `intercom` for other Pi sessions. Delete the disabled directory and settings entry. |
| [monitor](/Users/charliexue/.pi/agent/npm/node_modules/pi-process-monitor/skills/monitor/SKILL.md) | **KEEP** | The package owns the skill and matching tools. Its observer and workload split is clear and current. |
| [pi-subagents](/Users/charliexue/.pi/agent/npm/node_modules/pi-subagents/skills/pi-subagents/SKILL.md) | **KEEP** | The package owns the skill, tool, references, schedules, missions, worktrees, and supervisor protocol. It replaces Superset orchestration without duplicating another owner. |

## Resulting routing map

| Need | Owner |
|---|---|
| Search the web | Pi `web_search` |
| Read a known URL | Pi `fetch_content` |
| Develop or test in a browser | `agent-browser` |
| Operate a visible or signed-in browser | Pi browser UI tools |
| Map or crawl a site, or use Firecrawl extraction | Narrow `firecrawl` |
| Observe a process, remote job, file, or endpoint | Package `monitor` |
| Delegate managed headless work or schedule agents | Package `pi-subagents` |
| Message another Pi session | `intercom` |
| Use visible persistent terminals or workspaces | `herdr`, only when explicitly requested |
| Work in Pango or read Pango production state | Narrow `pango-dev-env` |
| Audit code | The focused review skill that matches the request |
| Find or install a skill | Direct explicit request using native Pi management and web search |
| Any old Superset workflow | Route to Pi, Herdr, `intercom`, or `monitor` based on the table above |

Deletion count: **15 skill directories**. This consists of 13 direct `DELETE` results and two merged Firecrawl source skills. Five skills remain. No `EXPLICIT-ONLY` change is needed because Herdr already enforces that behavior.
