

This package contains my personal Pi extensions and integrations

## Extensions

- [`extensions/answer.ts`](extensions/answer.ts) adds `/answer` and `Ctrl+.`. It finds questions in the last assistant response, shows them in a form, and sends the completed answers back to Pi.
- [`extensions/apple-notes.ts`](extensions/apple-notes.ts) adds `/note` and tools for searching, listing, reading, saving, and creating Apple Notes.
- [`extensions/clear-command.ts`](extensions/clear-command.ts) adds `/clear` for starting a session with no conversation context. It also hides `/new` from command completion.
- [`extensions/color-footer.ts`](extensions/color-footer.ts) replaces the standard footer with two lines that show the project, Git branch, pending changes, model, thinking level, Fast mode, context use, and diff size.
- [`extensions/core-mcp.ts`](extensions/core-mcp.ts) connects Pi to Linear, Exa, Better Stack, Ecotone, Context7, and Slack through one MCP gateway. It keeps direct MCP tools hidden and blocks mutating Better Stack and Slack tools.
- [`extensions/effort.ts`](extensions/effort.ts) adds `/effort` for choosing or setting the current model's thinking level.
- [`extensions/fast-mode.ts`](extensions/fast-mode.ts) adds `/fast` for using OpenAI Priority processing on supported OpenAI API and ChatGPT OAuth models. The setting is saved in the current session.
- [`extensions/notify.ts`](extensions/notify.ts) sends a terminal notification with the end of the assistant response when Pi finishes. It stays silent inside Herdr because Herdr handles those notifications.
- [`extensions/reminders.ts`](extensions/reminders.ts) adds `/reminders` and a tool for listing, creating, updating, completing, and deleting Apple Reminders.
- [`extensions/side-conversations.ts`](extensions/side-conversations.ts) adds `/btw` for a quick conversation without tools and `/side` for a separate Pi session with the current context. It opens the session in Herdr, Superset, or the current terminal.
- [`extensions/superset.ts`](extensions/superset.ts) reports Pi session activity and input requests to Superset when Pi runs inside a Superset terminal.
- [`extensions/time.ts`](extensions/time.ts) adds a read only tool that returns the local date, time, weekday, time zone, and elapsed session time.

## Bundled integrations

- [`vendor/pi-memory`](vendor/pi-memory/README.md) stores global and project memory in local Markdown. It provides search, topics, scratchpads, papercuts, safe deletion, and recovery without a database or hosted service.
- [`vendor/pi-paster`](vendor/pi-paster/README.md) turns pasted or dropped images into Pi attachments. It also adds image previews and `/image-compress` for replacing old image blocks with text summaries in a copied session.

## Support files

- [`lib/reminders.ts`](lib/reminders.ts) validates reminder data and groups reminders by date for the `/reminders` view.
- [`lib/time-context.ts`](lib/time-context.ts) formats local time and calculates elapsed session time for the time tool.
- [`scripts/apple-notes.js`](scripts/apple-notes.js) uses macOS automation to read and change Apple Notes.
- [`scripts/apple-reminders.js`](scripts/apple-reminders.js) uses macOS automation to read and change Apple Reminders.
- [`test/time-reminders.test.ts`](test/time-reminders.test.ts) tests the shared time and reminder behavior.

## Origins

Most of this package was written for my own setup. These parts have a direct upstream source or starting point:

- [`extensions/answer.ts`](extensions/answer.ts) is adapted from Mitsuhiko's [`answer.ts`](https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/answer.ts).
- [`extensions/color-footer.ts`](extensions/color-footer.ts) and [`extensions/notify.ts`](extensions/notify.ts) started from Pi's [`custom-footer.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/examples/extensions/custom-footer.ts) and [`notify.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/examples/extensions/notify.ts) examples. Their current behavior is customized for this setup.
- [`extensions/core-mcp.ts`](extensions/core-mcp.ts) is a local configuration wrapper around [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter).
- [`extensions/effort.ts`](extensions/effort.ts) is a new implementation inspired by [`pi-effort`](https://github.com/ricardofrantz/pi-effort), updated for the current Pi model and thinking APIs.
- [`extensions/side-conversations.ts`](extensions/side-conversations.ts) grew from the side-channel workflow in [`pi-btw`](https://github.com/dbachelder/pi-btw). The tool-free drawer and external `/side` session are custom implementations.
- [`vendor/pi-memory`](vendor/pi-memory/README.md) is a local Markdown-only fork of Jay Zeng's [`pi-memory`](https://github.com/jayzeng/pi-memory).
- [`vendor/pi-paster`](vendor/pi-paster/README.md) is a bundled and customized copy of [`pi-paster`](https://github.com/beowulf11/pi-paster).

The other extensions and support files were built directly for this package with Pi's extension APIs.

## Install

```bash
cd ~/Projects/personal/pi-personal
npm install
pi install "$HOME/Projects/personal/pi-personal"
```

