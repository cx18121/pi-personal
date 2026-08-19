# Cursor plugins audit

Source: [`cursor/plugins`](https://github.com/cursor/plugins) at commit `c7f203457c16815379130697c41e74fd202e9978`.

The repository currently contains 31 plugin manifests, 82 skills, and 12 agents. Most plugins fall into three groups:

1. General engineering workflows.
2. Cursor specific development tools.
3. Remote MCP integrations for external products.

This audit asks what would improve Charlie's work or CXStack without copying machinery that Pi or current skills already provide.

## Best ideas to keep

### Verify This

Location: `cursor-team-kit/skills/verify-this/SKILL.md`.

This is the strongest general idea outside PStack. It turns a claim into a falsifiable statement, captures the old and changed behavior under the same conditions, compares raw evidence, and returns one of three honest verdicts: verified, not verified, or inconclusive.

It fits the CX principle Prove It Works. The useful additions are the baseline and treatment comparison, the requirement to use the same measurement conditions, and the explicit inconclusive verdict.

Do not add it to the active CX prompt. Consider an explicit local verification skill or a small addition to the relevant CX playbooks after v0 proves stable.

### CLI for Agents

Location: `cli-for-agent/skills/cli-for-agents/SKILL.md`.

This is directly useful for the Pango CLI and future Pi tools. It asks CLI authors to provide noninteractive flags, useful examples in every help page, input through flags or standard input, actionable errors, safe retries, dry run support, predictable command structure, and machine useful success output.

This earns consideration as a conditional method skill. It should not become a global always active rule. A later Pango skill update could use it when designing or reviewing `pango` commands.

### Agent Compatibility

Location: `agent-compatibility/`.

The useful idea is to audit a repository from three practical views:

1. Can a new agent start the project from the documented path?
2. Can it verify a small change without running an unnecessarily heavy loop?
3. Do the docs match what actually works?

The plugin adds an external scanner, four agents, and a combined score. Those parts do not earn their cost for CXStack. A one time audit of Pango or `pi-personal` using the three questions could still find useful setup and verification friction.

### Workflow From Chats

Location: `cursor-team-kit/skills/workflow-from-chats/SKILL.md`.

This overlaps the new CX Reflect design. Its useful ideas are to separate strong, medium, weak, and contradictory evidence and to choose among a skill, a rule, a workflow document, or no artifact.

CX Reflect already has a broader and safer destination model because it includes global memory, project memory, structural mechanisms, and papercuts. Do not install this skill. Consider only its contradiction rule: when durable evidence conflicts, ask Charlie rather than saving both versions.

### Control UI and Control CLI

Locations:

- `cursor-team-kit/skills/control-ui/SKILL.md`
- `cursor-team-kit/skills/control-cli/SKILL.md`

These contain useful verification details. They prefer an existing project harness, stable selectors, fresh snapshots, deterministic waits, isolated sessions, retained evidence, and cleanup of only the processes they started.

Do not install the generic UI skill because Charlie prefers `agent-browser`, and Pango already has `pango-debug`. Reuse the best guardrails if a bounded Pango verification pilot is created. The CLI skill may help when testing an interactive Pi or Herdr interface, but it does not need to enter CXStack.

### PR Review Canvas

Location: `pr-review-canvas/skills/pr-review-canvas/SKILL.md`.

The useful review presentation ideas are:

1. Show core logic before wiring and mechanical changes.
2. Explain difficult logic with short pseudocode only when needed.
3. Trace surprising behavior with one concrete old and new example.
4. Keep generated and mechanical changes collapsed.

The current `pr-tour` skill already owns this job. Compare its output with these ideas during a later `pr-tour` review instead of adding another overlapping skill.

## Ideas already covered better

### Continual Learning

The plugin mines changed transcripts and writes up to 12 user preferences and 12 workspace facts directly into `AGENTS.md`.

Pi memory and CX Reflect are a better fit. They separate global and project scope, keep writes visible, update stale memory, distinguish papercuts from preferences, and require approval before Reflect changes durable state. Writing all learned facts into `AGENTS.md` would make the active prompt grow and mix preferences with repository contracts.

### Cursor Team Kit

Most of the bundle already has a local owner:

- `deslop` is installed.
- Merge conflict resolution is installed.
- Code review, PR descriptions, and PR tours are installed.
- Pango has its own test and development environment skills.
- Pi subagents already provide monitoring and orchestration.

Installing the whole bundle would create trigger conflicts and duplicate authority rules.

### Thermos

Thermos duplicates the CX judge and code review skills. Its prompts use absolute language, arbitrary file size limits, and pressure to find ambitious restructures. This can create review theater and scope growth. Do not copy it.

### Orchestrate and Ralph Loop

Pi already has subagents, missions, monitors, and controlled continuation. The research found no strong case where broad fanout added several unique accepted contributions. Repeating the same prompt until a model claims completion also conflicts with evidence based stopping. Do not copy these plugins.

### Teaching

The teaching skills are short generic checklists for learning plans and retrospectives. They add little beyond normal model judgment and do not belong in CXStack.

### Docs Canvas

The skill calls itself a placeholder and depends on Cursor Canvas. It is not ready or portable.

### Create Plugin and Cursor SDK

These solve Cursor specific plugin and SDK work. They do not apply to Pi.

## External product integrations

The repository includes remote MCP configurations for Gmail, Google Drive, Google Calendar, GitHub, Playwright, Zoom, Circleback, Intercom, Salesforce, HubSpot, and several sales or recruiting products.

Do not install these as a bundle. Each one adds authentication, data access, and action authority. Add one only when Charlie has a real workflow for that product.

Likely candidates, if needed later, are Google Calendar, Gmail, Google Drive, and a meeting transcript source such as Zoom or Circleback. GitHub is already well covered by `gh`. Playwright overlaps `agent-browser` and Charlie's stated browser preference.

## Recommendation

Do not add another Cursor plugin to CXStack v0.

Keep three follow ups:

1. Consider a small explicit local `verify-this` skill after CXStack is stable.
2. Adapt the CLI for Agents rules when the Pango CLI next receives a meaningful design change.
3. Run a scoreless startup, validation, and docs audit when improving agent readiness in Pango or `pi-personal`.

The verification skill pilot remains separate. If it succeeds on one Pango surface, reuse the Control UI guardrails and then decide whether generic creation and maintenance skills are justified.
