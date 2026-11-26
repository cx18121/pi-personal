# pi-personal

This package contains my personal Pi extensions and integrations.

See [`modules/cxstack/README.md`](modules/cxstack/README.md) for CXStack: the agent contract linked as `~/.pi/agent/AGENTS.md`, `/autonomy`, `/handoff`, and `/audit`.

## Layout

- `modules/cxstack/` contains CXStack: the agent contract, its commands, and their tests.
- `archives/pi-child-agent/` contains the frozen, directly installable custom child package that Codex Subagents replaced.
- `extensions/`, `lib/`, `scripts/`, and `test/` contain standalone personal extensions and their support files.
- `vendor/` contains bundled local forks.

## Extensions

- [`extensions/clear-command.ts`](extensions/clear-command.ts) adds `/clear` for starting a session with no conversation context. It also hides `/new` from command completion.
- [`extensions/color-footer.ts`](extensions/color-footer.ts) replaces the standard footer with two lines that show the project, Git branch, pending changes, model, thinking level, active modes, context use, the latest request's prompt-cache hit rate, diff size, running pi-processes processes, and running subagents with per-run elapsed time. A low cache rate on follow-up requests usually means something rewrote the prompt prefix.
- [`extensions/core-mcp.ts`](extensions/core-mcp.ts) registers Linear, Exa, Better Stack, Ecotone, Context7, Slack, Pencil, PostHog, Circleback, and Pango ClickHouse with Pi's built-in MCP support (Pi 0.99 or newer). Servers connect at session startup and tools load on demand through `tool_search`. Mutating Better Stack and Slack tools stay hidden and unreachable. Exa exposes only its four configured tools. PostHog connects to `https://mcp.posthog.com/mcp` with `x-posthog-mcp-version: 2` and reads its personal API key from the macOS Keychain item `pi-posthog-mcp` (account `charliexue`). Use `/mcp` to check connections and sign in. These extension registrations are not loaded by shell `pi mcp` commands. ClickHouse uses the pinned official stdio server and the read-only `pango_mcp_readonly` database user. [`scripts/clickhouse-mcp.py`](scripts/clickhouse-mcp.py) passes only the configured ClickHouse variables and basic runtime paths to the standalone `uv` executable at `~/.local/bin/uv`. Do not use a versioned mise install path, which can disappear after an upgrade, or a mise shim, which can overwrite connection settings with the current project's environment. Its password comes from the macOS Keychain item `pi-clickhouse-readonly` with account `pango_mcp_readonly`. Native OAuth credentials live in `~/.pi/agent/mcp-auth.json`; sign in again when migrating from the adapter rather than copying its tokens.
- [`extensions/effort.ts`](extensions/effort.ts) adds `/effort` for choosing or setting the current model's thinking level.
- [`extensions/fast-mode.ts`](extensions/fast-mode.ts) adds `/fast [on|off|status]` and `pi --fast` for supported models on the Claude API, ChatGPT OAuth, OpenAI API, and OpenRouter. It checks current provider metadata rather than guessing from model names. Fast is opt-in for each model on the current session branch. If support can't be verified, requests stay unchanged. Providers may charge more or consume more of your usage allowance. Status shows the response tier when the provider reports it.
- [`extensions/inline-skills.ts`](extensions/inline-skills.ts) loads skills from short `/name` tokens anywhere in a prompt. It replaces Pi's native `/skill:name` skill completion with the same short form at the start of a prompt.
- [`extensions/notify.ts`](extensions/notify.ts) sends a terminal notification with the end of the assistant response when Pi finishes. It stays silent inside Herdr because Herdr handles those notifications.
- [`extensions/prompt-restore.ts`](extensions/prompt-restore.ts) restores a submitted text prompt to the editor when Escape cancels it before the assistant produces output.
- [`extensions/model-policy.ts`](extensions/model-policy.ts) supplies configured child-model preferences and blocks automatically using disabled providers. Native Pi “save as default” remains available. Ordinary session model and thinking changes are not saved automatically. At interactive startup it probes each enabled provider with one tiny request, at most every 12 hours while healthy, and warns when credentials fail so child agents do not fail late.
- [`extensions/process-watchdog.ts`](extensions/process-watchdog.ts) tracks running `pi-processes` jobs via their event bus, appends exact running and silence durations to `process` `list` and `output` tool results so the model can see wedged jobs immediately, and wakes the agent automatically after 4m and 10m of silence on one-shot jobs (skipping streaming watchers and servers).
- [`extensions/session-controls.ts`](extensions/session-controls.ts) adds `reload_runtime` (with an active process and subagent guard plus optional post-reload continuation), `rename_session`, and (inside Herdr) `open_herdr_session` for opening a separate interactive Pi tab without closing the current pane.
- [`extensions/session-cwd.ts`](extensions/session-cwd.ts) adds `/cd <path>` and a `change_directory` tool to move the active session's working directory in place to another existing directory while preserving the conversation. It forks the active session into the target directory, switches the runtime so tools, project context files, skills, footer, and extensions rebind to the new path, aligns `process.cwd()`, and removes the superseded session file. It refuses to switch while `pi-processes` jobs or `pi-codex-subagents` children are active unless forced.
- [`extensions/session-title.ts`](extensions/session-title.ts) names an unnamed interactive session after its first run, using the `title` helper model from `cxModels`, so `/resume` lists titles.
- [`extensions/side-conversations.ts`](extensions/side-conversations.ts) adds `/btw` for a quick conversation without tools and `/side` for a separate Pi session with the current context. It opens the session in Herdr, Superset, or the current terminal.
- [`extensions/subagent-idle.ts`](extensions/subagent-idle.ts) removes blocking subagent waits from the main agent. When only children remain, the main agent ends its turn and stays available for your messages. The upstream package delivers child results and resumes the session automatically. There is no polling, wait cancellation, or installed-package patch. Activating the changed tool list may cause a one-time provider cache miss. Normal idle and continuation turns preserve the session and existing context.
- [`extensions/superset.ts`](extensions/superset.ts) reports Pi session activity and input requests to Superset when Pi runs inside a Superset terminal.
- [`extensions/time.ts`](extensions/time.ts) adds a read only tool that returns the local date, time, weekday, time zone, and elapsed session time.

## Bundled integrations

- [`vendor/pi-codex-subagents`](vendor/pi-codex-subagents/README.md) is a vendored fork of [`@ogulcancelik/pi-codex-subagents`](https://github.com/ogulcancelik/pi-extensions/tree/main/packages/pi-codex-subagents) 0.3.5. It adds explicit `cwd` targeting on `spawn_agent`, repo-local ancestor `AGENTS.md` auto-loading (excluding global `~/.pi/agent/AGENTS.md`), additive merging of default, optional-default, and template extensions, a `maxConcurrency` spawn queue, safe single automatic retries on transient transport or overload errors, sealed non-blocking `wave` completion delivery (with wave cancellation on `interrupt_agent`, wave duration/cost stats, early failure notification, and saved `<id>.response.md` paths), and live subagent activity events for `color-footer.ts`.
- [`vendor/pi-memory`](vendor/pi-memory/README.md) stores global and project memory in local Markdown. It provides a complete topic inventory, native-session evidence, task-project focus, on-demand reads, scratchpads, and conflict-safe updates without a database or hosted service.
- [`vendor/pi-diff`](vendor/pi-diff/src/index.ts) renders `edit` and `write` results as syntax-highlighted diffs with red and green row backgrounds. It is a fork of [`@heyhuynhgiabuu/pi-diff`](https://github.com/buddingnewinsights/pi-diff) 0.9.1 with two changes. [`src/shiki.ts`](vendor/pi-diff/src/shiki.ts) loads Shiki themes and grammars statically with the JavaScript regex engine, because Pi's compiled runtime cannot resolve Shiki's lazy imports and the upstream package silently renders uncolored code. Its `apply_patch` tool is disabled by default.
- [`vendor/pi-compact-tools`](vendor/pi-compact-tools/extensions/compact-tools.ts) renders `read`, `grep`, `find`, `ls`, `bash`, and other extensions' tools as compact expandable rows. It is a trimmed fork of [`pi-compact-tools`](https://github.com/nedleeds/pi-compact-tools) 0.11.2. It keeps only the compact rows, removing the thinking restyle, the tool progress message, silent mode, the Claude Code style, release notices, its edit and write renderers, PowerShell support, and the pulsing status dot. It also restyles built-in tool names that another extension owns, so `bash` stays owned by `tool-safety.ts` and `edit` and `write` stay with pi-diff. [`config/compact-tools.json`](config/compact-tools.json) is linked to `~/.pi/agent/compact-tools.json` by bootstrap.
- [`vendor/pi-paster`](vendor/pi-paster/README.md) turns pasted or dropped images into Pi attachments. It also adds image previews and `/image-compress` for replacing old image blocks with text summaries in a copied session.

## Support files

- [`lib/time-context.ts`](lib/time-context.ts) formats local time and calculates elapsed session time for the time tool.
- [`test/time-context.test.ts`](test/time-context.test.ts) tests local time and elapsed session time.

## Origins

Most of this package was written for my own setup. These parts have a direct upstream source or starting point:

- [`extensions/color-footer.ts`](extensions/color-footer.ts) and [`extensions/notify.ts`](extensions/notify.ts) started from Pi's [`custom-footer.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/examples/extensions/custom-footer.ts) and [`notify.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/examples/extensions/notify.ts) examples. Their current behavior is customized for this setup.
- [`extensions/effort.ts`](extensions/effort.ts) is a new implementation inspired by [`pi-effort`](https://github.com/ricardofrantz/pi-effort), updated for the current Pi model and thinking APIs.
- [`extensions/inline-skills.ts`](extensions/inline-skills.ts) is a customized copy of Tifan Dwi Avianto's [`@tifan/pi-inline-skills`](https://github.com/tifandotme/pi-extensions/tree/master/packages/pi-inline-skills).
- [`extensions/session-title.ts`](extensions/session-title.ts) names an unnamed interactive session after its first run, using the `title` helper model from `cxModels`, so `/resume` lists titles.
- [`extensions/side-conversations.ts`](extensions/side-conversations.ts) grew from the side-channel workflow in [`pi-btw`](https://github.com/dbachelder/pi-btw). The tool-free drawer and external `/side` session are custom implementations.
- [`archives/pi-child-agent`](archives/pi-child-agent/) preserves the replaced child runtime and its upstream notices as a frozen Pi package.
- [`vendor/pi-memory`](vendor/pi-memory/README.md) is a local Markdown-only fork of Jay Zeng's [`pi-memory`](https://github.com/jayzeng/pi-memory).
- [`vendor/pi-paster`](vendor/pi-paster/README.md) is a bundled and customized copy of [`pi-paster`](https://github.com/beowulf11/pi-paster).

The other extensions and support files were built directly for this package with Pi's extension APIs.

## Portable setup

The top-level machine bootstrap in `cx18121/dotfiles` invokes this package. To apply it directly inside an already configured mise environment:

```bash
mise run bootstrap -- macos
mise run check -- macos
```

Use `linux` on a Linux development host.

`config/settings.base.json` contains shared preferences. The platform files contain complete package lists and first-install defaults. `scripts/settings.mjs` merges them with the optional machine-local overlay at `~/.config/pi/settings.local.json` and writes `~/.pi/agent/settings.json` atomically. After installation, that native settings file owns model defaults, thinking defaults, scoped models, and `cxModels`. Bootstrap preserves those fields, Pi's changelog state, and unknown runtime settings. The setup check validates installation-owned settings rather than demanding that your model choices match the initial seeds.

See [Model configuration](config/README.md) for the single place to configure helper models, per-feature overrides, fallbacks, and temporary provider exclusions.

Bootstrap does not upgrade installed extensions. For deliberate maintenance, run `mise run update -- macos` (or `linux`). It updates installed extensions and the model catalog, then runs tests, typechecks, and setup checks. It stops on the first failure and does not roll updates back. Pi itself remains managed by mise and dotfiles.

Bootstrap and update run `scripts/patch-extension-peers.mjs` to correct host dependency declarations in the installed `@juicesharp/rpiv-todo` and `pi-slopchop` manifests until upstream fixes them. After a direct `pi update`, run `node scripts/patch-extension-peers.mjs` before reloading Pi.

The subagent idle extension has focused tests in `test/subagent-idle.test.ts`. Run `node test/subagent-idle-runtime.mjs` and `python3 test/subagent-idle-tui-probe.py` for offline checks against the installed Pi and real child processes. They use temporary settings and a deterministic fixture provider, without calling a model service or changing your sessions.

See `config/settings.local.example.json` for adding work-only or machine-specific packages without committing local paths.

