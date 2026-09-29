# Model roles

Keep the active parent model. Do not switch it automatically.

Use child models only for bounded contributions that earn their cost. Model choices live in `~/.pi/agent/settings.json`, not in workflow instructions. The automatic model policy in the current prompt supplies disabled providers and ordered review or implementation preferences from `cxModels.overrides`. `session` means the current model. Use the first permitted, available configured preference. Without an override, choose from the permitted scoped models for the task, or inherit the session model.

Prefer a complementary family for an independent challenge. If it is unavailable, a fresh same-family reviewer may continue ordinary review with that limitation disclosed. An explicitly cross-family experiment remains incomplete until its required families have been tested.

`spawn_agent` lists scoped choices, which may still include temporarily disabled providers. The automatic-use guard blocks those providers without restricting manual main-session selection. On authentication or quota failure, report the failure and use only the next configured permitted fallback. If the configured choices are exhausted, report the blocker. Do not rewrite persistent settings to make a task succeed.

Give each child a short `task_name` and a self-contained `message` with current primary evidence, exact source paths, authority boundary, success condition, and output contract. Children do not load project context files automatically, so include every relevant project rule in the message. Independent reviews use fresh context by construction. One child is enough unless separate questions genuinely need separate contexts.

Continue independent work after spawning. Let the completion return automatically. Use `wait_agent` only when the next action depends on the result and no useful work remains. Use `send_message` to steer a running child or ask it to return its best current findings.

The main agent owns synthesis, decisions, and every project mutation. Child prompts define their authority. Review, investigation, and judgment tasks are read only unless explicitly authorized otherwise. Children gain no publication, merge, deployment, destructive, or product authority.
