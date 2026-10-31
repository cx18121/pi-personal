Write a handoff so a fresh agent can continue this work in a new session. Save it with the write tool to `{{FILE}}`. The next agent will not see this conversation. It can query it with session_query at `{{SESSION}}`, so the handoff carries what drives the next decisions and points to the session for the rest.{{FOCUS}}

Use these sections in this order and omit any that would be empty:

- **Next**: the immediate next action, the check that shows it is done, and what needs Charlie's permission.
- **Goal**: what Charlie wants, why, and the acceptance check he will judge it by.
- **Path to done**: the remaining steps from here to that acceptance, ending at what Charlie will see or use.
- **State**: what is built, usable, and demonstrated, with exact branch, commits, PRs, and running processes. Mark each fact settled, last observed, or unverified. Start from the facts below.
- **Blockers**: what currently stops progress.
- **Watch**: the size, cost, or runtime signals that should make the next agent stop and ask whether a simpler route exists, with current values.
- **Decisions**: settled decisions and Charlie's standing preferences, each with its reason.
- **Rejected**: directions ruled out, each with the reason.
- **Sources**: the files, commands, and links to read first. Point to logs and test output here rather than narrating them.

Aim for 500 to 800 words. A detail earns its place when the next agent needs it to act. The handoff is complete when a fresh agent reading only it could take the next step without asking Charlie anything he already answered. Check current state with tools where the facts below do not settle it. Write it in Markdown, then reply with one line saying it is saved.

Facts collected from the repository:

```text
{{FACTS}}
```
