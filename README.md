# Personal Pi package

This package contains Charlie's personal Pi extensions.

It provides:

- The two-line project, Git, model, thinking, context, and diff footer.
- `/clear` as a fresh-session command while hiding `/new` from completion.
- `/answer` and `Ctrl+.` for answering questions from the last assistant response.
- `/note` and native tools for searching, reading, creating, and appending Apple Notes.
- Isolated MCP access for Linear, Exa, Better Stack, Ecotone, Context7, and Slack.
- A model-aware `/effort` picker and direct thinking-level commands.
- Completion notifications outside Herdr. Herdr owns notifications inside Herdr.
- Compact image attachment rows based on pi-paster 0.2.3.

Secrets and OAuth tokens are not stored here. The Slack client secret stays in macOS Keychain under `pi-slack-mcp-client-secret`.

## Install

```bash
cd ~/dotfiles/pi/package
npm install
pi install "$HOME/dotfiles/pi/package"
```

Reload Pi after installation.
