# Model configuration

Edit `~/.pi/agent/settings.json`. This is the live model configuration for this machine. Repository profiles seed new installs but do not overwrite existing model choices. There is no model router, automatic catalog ranking, or second policy file.

## Native Pi settings

- `defaultProvider` and `defaultModel` choose the startup model.
- `defaultThinkingLevel` and `modelThinkingLevels` control thinking defaults.
- `enabledModels` controls model cycling and the choices offered to Codex Subagents. Use Pi's supported exact IDs or patterns.

Ordinary model and thinking switches affect the session only. Native `/model` and `/thinking` support Ctrl+S to save a default to this same file. Bootstrap preserves it. Saved defaults are machine-local rather than automatically committed to Git.

## Automatic work

Add a `cxModels` object alongside the native settings. For example:

```json
{
  "cxModels": {
    "disabledProviders": ["anthropic"],
    "helpers": ["session"],
    "overrides": {
      "answer": ["openai-codex/gpt-6-sol"],
      "review": ["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol"]
    }
  }
}
```

Omit any overrides you do not need. Active overrides are `answer`, `review`, and `implementation`. Legacy `corrections` and `memory` overrides remain accepted for settings compatibility but have no runtime consumer. The main agent learns through memory tools; memory does not call a helper model. Recall stays local. Arrays are ordered choices, not parallel calls. `session` means the active session model. Exact IDs in this example are illustrative.

For `/answer`, selection uses its override, then `helpers`, then `["session"]`. Only the first applicable list is used. An override replaces the shared list; add `session` explicitly if you want it as a fallback. Disabled providers and unavailable models are skipped. Authentication and provider-request failures advance to the next configured candidate. Cancellation stops immediately. Invalid response content is reported rather than silently asking more models. Exhausted choices produce an error; models outside the list are never tried.

For delegated work, `review` and `implementation` supply ordered preferences to the parent agent. These are not automatic classifiers. The parent selects an allowed model for each task and may retry a configured fallback after a provider failure. A fresh same-family reviewer is acceptable for ordinary independent review when disclosed. It does not complete a specifically cross-family experiment. The reviewing agent must supply evidence for any explicitly required model runs before reporting success.

`disabledProviders` applies to automatic helpers and child agents. It does not remove providers from Pi's native model picker, change the main model, clear credentials, or terminate already-running work. The child tool schema can still show disabled models, but spawning them is blocked. Children with unknown template providers, or resuming older children whose provider was not recorded, are blocked while exclusions are active; spawn a new child with an explicit permitted model instead. Direct manual commands and independently launched Pi processes are outside this guard.

Remove a provider from `disabledProviders` when you want automatic work to use it again. Changing policy affects subsequent calls and prompts; it does not cancel a request already in flight. Restart Pi after changing `enabledModels` so the upstream subagent tool refreshes its offered choices. Use `/reload` once after installing the new extension code.

## Maintenance and limits

Use `mise run update -- macos` or `linux` for deliberate extension and model-catalog updates followed by checks. Setup and bootstrap do not upgrade extensions. Pi runtime updates remain owned by mise/dotfiles. A successful minimum-version check is not a guarantee that an untested future Pi release is compatible.

Codex native compaction is unchanged. Its checkpoints are model-specific, so helper flexibility does not imply that switching the main model after compaction preserves its earlier context.
