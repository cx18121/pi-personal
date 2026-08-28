# Model roles

Keep the active parent model. Do not switch it automatically.

Use child models only for bounded contributions that earn their cost. These are soft defaults:

- Prefer GPT 5.6 Sol for implementation, debugging, tooling, and exact procedures.
- Prefer Claude Fable for intent, product and design judgment, synthesis, and long context.
- Prefer Claude Opus for the most demanding independent judgment when the extra cost earns its place.
- Prefer the complementary family for an independent challenge.

Let the task override these defaults when another model is a better fit. Do not build a classifier or route by keywords.

`child_run` exposes only `fable`, `opus`, and `openai`. For an independent challenge from an OpenAI parent, choose `fable` by default and `opus` only when the task needs its stronger judgment. From a Claude parent, choose `openai`. A provider authentication or quota failure blocks the child result; report it instead of routing through another provider.

Give each child a self-contained task, current primary evidence, exact source paths, authority boundary, success condition, and output contract. Independent reviews use fresh context by construction. One child is enough unless separate questions genuinely need separate contexts.

The main agent owns synthesis, decisions, and every project mutation. Child prompts define their authority. Review, investigation, and judgment tasks are read only unless explicitly authorized otherwise. Children gain no publication, merge, deployment, destructive, or product authority.
