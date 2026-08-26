# Model roles

Keep the active parent model. Do not switch it automatically.

Use child models only for bounded contributions that earn their cost. These are soft defaults:

- Prefer GPT 5.6 Sol for implementation, debugging, tooling, and exact procedures.
- Prefer Claude Fable for intent, product and design judgment, synthesis, and long context.
- Prefer the complementary family for an independent challenge.

Let the task override these defaults when another model is a better fit. Do not build a classifier or route by keywords.

Before `child_run`, choose an exact `provider/model` from the current Pi registry. Use `pi --list-models <provider>` when the exact identifier is not already known. A listed model can still fail authentication or quota checks; that failure blocks the child result and is not a clean review. Report it or choose another configured exact model instead of guessing an identifier.

Give each child a self-contained task, current primary evidence, exact source paths, authority boundary, success condition, and output contract. Independent reviews use fresh context by construction. One child is enough unless separate questions genuinely need separate contexts.

The main agent owns synthesis, decisions, and every project mutation. Child prompts define their authority. Review, investigation, and judgment tasks are read only unless explicitly authorized otherwise. Children gain no publication, merge, deployment, destructive, or product authority.
