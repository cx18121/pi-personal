# Model roles

Keep the active parent model. Do not switch it automatically.

Use child models only for bounded contributions that earn their cost. These are soft defaults:

- Prefer GPT 5.6 Sol for implementation, debugging, tooling, and exact procedures.
- Prefer Claude Fable for intent, product and design judgment, synthesis, and long context.
- Prefer Claude Opus for the most demanding independent judgment when the extra cost earns its place.
- Prefer the complementary family for an independent challenge.

Let the task override these defaults when another model is a better fit. Do not build a classifier or route by keywords.

`spawn_agent` offers the exact models allowed by the current Pi configuration. For an independent challenge from an OpenAI parent, choose the available Claude Fable model by default and choose Opus only when the task needs its stronger judgment. From a Claude parent, choose the available OpenAI model. A provider authentication or quota failure blocks the child result. Report it instead of routing through another provider.

Give each child a short `task_name` and a self-contained `message` with current primary evidence, exact source paths, authority boundary, success condition, and output contract. Children do not load project context files automatically, so include every relevant project rule in the message. Independent reviews use fresh context by construction. One child is enough unless separate questions genuinely need separate contexts.

Continue independent work after spawning. Let the completion return automatically. Use `wait_agent` only when the next action depends on the result and no useful work remains. Use `send_message` to steer a running child or ask it to return its best current findings.

The main agent owns synthesis, decisions, and every project mutation. Child prompts define their authority. Review, investigation, and judgment tasks are read only unless explicitly authorized otherwise. Children gain no publication, merge, deployment, destructive, or product authority.
