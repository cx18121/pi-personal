# Personal Pi package

This package contains Charlie's personal Pi extensions.

It provides:

- The two-line project, Git, model, thinking, Fast mode, context, and diff footer.
- `/clear` as a fresh-session command while hiding `/new` from completion.
- `/answer` and `Ctrl+.` for answering questions from the last assistant response.
- `/note` and native tools for searching, reading, saving, and creating Apple Notes.
- `/reminders` and a native tool for browsing and managing Apple Reminders through the default list and existing lists.
- A read-only time tool for local date, time zone, and elapsed Pi session time.
- `/btw` for quick tool-free side questions and `/side` for context-aware sessions in Herdr, Superset, or another terminal.
- Isolated MCP access for Linear, Exa, Better Stack, Ecotone, Context7, and Slack.
- A model-aware `/effort` picker and direct thinking-level commands.
- `/fast` for session-persistent OpenAI Fast mode on supported API and ChatGPT OAuth models.
- Completion notifications outside Herdr. Herdr owns notifications inside Herdr.
- Superset agent status and notifications when Pi runs in a Superset terminal.
- Compact image attachment rows and readable autocomplete descriptions based on pi-paster 0.2.3.

Secrets and OAuth tokens are not stored here. The Slack client secret stays in macOS Keychain under `pi-slack-mcp-client-secret`.

## Install

```bash
cd ~/dotfiles/pi/package
npm install
pi install "$HOME/dotfiles/pi/package"
```

Reload Pi after installation.
