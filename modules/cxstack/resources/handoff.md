Write a handoff so a fresh agent can continue this work in a new session. Save it with the write tool to `{{FILE}}`. The next agent will not see this conversation. It can query it with session_query at `{{SESSION}}`, so the handoff carries what drives the next decisions and points to the session for the rest.{{FOCUS}}

Use these sections in this order and omit any that would be empty:

- **Next**: the first useful action already authorized and the check that shows it is done. Name the exact action that needs permission separately. If permission is the first step, say why no useful work can proceed before it.
- **Goal**: what Charlie wants, why, and the acceptance check he will judge it by.
- **Path to done**: the remaining steps from here to that acceptance, ending at what Charlie will see or use.
- **State**: what is built, usable, and demonstrated, with exact branch, commits, PRs, and running processes. Mark each fact settled, last observed, or unverified. Start from the facts below.
- **Blockers**: what currently stops progress.
- **Watch**: the size, cost, or runtime signals that should make the next agent stop and ask whether a simpler route exists, with current values.
- **Decisions**: settled decisions and relevant standing preferences. Keep the reason and what each decision rules out or changes. Distinguish accepted decisions from recommendations and open questions.
- **Rejected**: directions ruled out, each with the reason.
- **Sources**: the files, commands, or skills the next action depends on. Anchor essential files to the worktree or commit that owns them. For temporary artifacts, give the exact path and how to recover the evidence if it disappears.

Aim for 500 to 800 words. Before shortening, check the draft against the accepted answers from any design interview. Carry forward each decision that changes the next work, or point to where it was recorded and say why it matters. Cut repeated status and generic repo rules first. The handoff is complete when a fresh agent can take the next authorized step without guessing or re-asking settled questions. Check current state with tools where the facts below do not settle it. Write it in Markdown, then reply with one line saying it is saved.

Facts collected from the repository:

```text
{{FACTS}}
```
