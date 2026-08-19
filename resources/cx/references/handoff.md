# Handoff

Use the scratchpad only when unfinished work must survive a real session boundary. Examples include an explicit pause, Charlie leaving, a likely session end, or work that genuinely spans sessions. Compaction alone does not require a handoff.

Keep one current entry per unfinished outcome. Store only:

- The current outcome.
- Recovery truth, such as the owning path, branch, exact object, and latest verified state.
- The current blocker, if one exists.
- The next ready action.
- The actual delivery state when relevant.

Replace stale state instead of appending a competing version. Preserve unrelated active outcomes. Remove the entry when the outcome is finished or abandoned.

Do not use the scratchpad for a detailed plan, theory, decision diary, completed history, or a copy of the current todo list. Native todo owns current execution. Current source and runtime evidence outrank the handoff.
