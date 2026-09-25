# Model roles

Keep the active parent model. Do not switch it automatically.

Use child models only for bounded contributions that earn their cost. These are soft defaults:

- Prefer GPT-6 Sol for implementation, debugging, tooling, and exact procedures.
- Prefer Claude Opus 5.5 for intent, product and design judgment, synthesis, long context, and demanding independent judgment.
- Prefer the complementary family for an independent challenge.

Let the task override these defaults when another model is a better fit. Do not build a classifier or route by keywords.

`spawn_agent` offers the exact models allowed by the current Pi configuration. For an independent challenge from an OpenAI parent, choose Claude Opus 5.5. From a Claude parent, choose GPT-6 Sol. A provider authentication or quota failure blocks the child result. Report it instead of routing through another provider.

Give each child a short `task_name` and a self-contained `message` with current primary evidence, exact source paths, authority boundary, success condition, and output contract. Children do not load project context files automatically, so include every relevant project rule in the message. Independent reviews use fresh context by construction. One child is enough unless separate questions genuinely need separate contexts.

Continue independent work after spawning. Let the completion return automatically. Use `wait_agent` only when the next action depends on the result and no useful work remains. Use `send_message` to steer a running child or ask it to return its best current findings.

The main agent owns synthesis, decisions, and every project mutation. Child prompts define their authority. Review, investigation, and judgment tasks are read only unless explicitly authorized otherwise. Children gain no publication, merge, deployment, destructive, or product authority.
