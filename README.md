

This package contains my personal Pi extensions and integrations

## Extensions

- `extensions/answer.ts` adds `/answer` and `Ctrl+.`. It finds questions in the last assistant response, shows them in a form, and sends the completed answers back to Pi.
- `extensions/apple-notes.ts` adds `/note` and tools for searching, listing, reading, saving, and creating Apple Notes.
- `extensions/clear-command.ts` adds `/clear` for starting a session with no conversation context. It also hides `/new` from command completion.
- `extensions/color-footer.ts` replaces the standard footer with two lines that show the project, Git branch, pending changes, model, thinking level, Fast mode, context use, and diff size.
- `extensions/core-mcp.ts` connects Pi to Linear, Exa, Better Stack, Ecotone, Context7, and Slack through one MCP gateway. It keeps direct MCP tools hidden and blocks mutating Better Stack and Slack tools.
- `extensions/effort.ts` adds `/effort` for choosing or setting the current model's thinking level.
- `extensions/fast-mode.ts` adds `/fast` for using OpenAI Priority processing on supported OpenAI API and ChatGPT OAuth models. The setting is saved in the current session.
- `extensions/notify.ts` sends a terminal notification with the end of the assistant response when Pi finishes. It stays silent inside Herdr because Herdr handles those notifications.
- `extensions/reminders.ts` adds `/reminders` and a tool for listing, creating, updating, completing, and deleting Apple Reminders.
- `extensions/side-conversations.ts` adds `/btw` for a quick conversation without tools and `/side` for a separate Pi session with the current context. It opens the session in Herdr, Superset, or the current terminal.
- `extensions/superset.ts` reports Pi session activity and input requests to Superset when Pi runs inside a Superset terminal.
- `extensions/time.ts` adds a read only tool that returns the local date, time, weekday, time zone, and elapsed session time.

## Bundled integrations

- `vendor/pi-memory` stores global and project memory in local Markdown. It provides search, topics, scratchpads, papercuts, safe deletion, and recovery without a database or hosted service.
- `vendor/pi-paster` turns pasted or dropped images into Pi attachments. It also adds image previews and `/image-compress` for replacing old image blocks with text summaries in a copied session.

## Support files

- `lib/reminders.ts` validates reminder data and groups reminders by date for the `/reminders` view.
- `lib/time-context.ts` formats local time and calculates elapsed session time for the time tool.
- `scripts/apple-notes.js` uses macOS automation to read and change Apple Notes.
- `scripts/apple-reminders.js` uses macOS automation to read and change Apple Reminders.
- `test/time-reminders.test.ts` tests the shared time and reminder behavior.

## Install

```bash
cd ~/Projects/personal/pi-personal
npm install
pi install "$HOME/Projects/personal/pi-personal"
```

