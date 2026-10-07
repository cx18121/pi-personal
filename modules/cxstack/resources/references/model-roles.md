# Model roles

Keep the active parent model. Do not switch it automatically.

Use child models only for bounded contributions that earn their cost. Model choices live in `~/.pi/agent/settings.json`, not in workflow instructions. The automatic model policy in the current prompt supplies disabled providers and ordered review or implementation preferences from `cxModels.overrides`. `session` means the current model. Use the first permitted, available configured preference. Without an override, choose from the permitted scoped models for the task, or inherit the session model.

Prefer a complementary family for an independent challenge. If it is unavailable, a fresh same-family reviewer may continue ordinary review with that limitation disclosed. An explicitly cross-family experiment remains incomplete until its required families have been tested.

`spawn_agent` lists scoped choices, which may still include temporarily disabled providers. The automatic-use guard blocks those providers without restricting manual main-session selection. On authentication or quota failure, report the failure and use only the next configured permitted fallback. If the configured choices are exhausted, report the blocker. Do not rewrite persistent settings to make a task succeed.

Give each child a short `task_name` and a concise source-based `message` with its question, scope, authority boundary, exact source paths and fixed point, success condition, and output contract. Point to authoritative documents and the current diff, including untracked additions, rather than copying them. The child must read the relevant primary sources. Carry observed proof, failures, and critical context unavailable from those sources. Children do not load project context files automatically, so include applicable rules or explicit instructions to read their owning files. Independent reviews use fresh context by construction. One child is enough unless separate questions genuinely need separate contexts.

Use `send_message` to steer a running child or ask it to return its best current findings. The installed `subagent-idle` extension owns waiting behavior and supplies the main agent's idle/completion guidance.

The main agent owns synthesis, decisions, and every project mutation. Child prompts define their authority. Review, investigation, and judgment tasks are read only unless explicitly authorized otherwise. Children gain no publication, merge, deployment, destructive, or product authority.
