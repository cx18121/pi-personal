# One-session Jev search trial

Run from the project you want Pi to work on.

```sh
node ~/Projects/personal/pi-personal/scripts/jev-trial.mjs \
  --env-file ~/Projects/personal/jev-context/.env
```

This starts ordinary Pi with Sol on medium. The launcher uses Pi's installed package resolver to retain enabled extensions, substitutes the sibling `jev-search` checkout for stock FFF, and omits `remember-last-model` so the trial does not save a new global model default. Skills, prompts, context files and themes still use normal Pi discovery. It does not install packages or edit settings.

The env file supplies only `TYPESAFE_API_KEY`. You can instead set that variable before launching. Do not paste the key into Pi. Jev receives the search intent and candidate code snippets, so use this trial only on source you are authorized to send to that service.

`ffgrep` now takes an `intent` describing what evidence the agent needs. Jev reorders the collected matches without filtering them out. `fffind` is unchanged. Search output states the ordering and reports any fallback to native ordering. No extra search tool is added.

Exit normally to end the trial. Start ordinary `pi` to return to the installed FFF extension. To resume a trial conversation with Jev, use this launcher again and pass `-- --resume`. The currently running parent session is not changed.

## Checks and limits

```sh
# Inspect the selected extension paths and CLI arguments without running Pi.
node ~/Projects/personal/pi-personal/scripts/jev-trial.mjs --check

# Focused launcher test.
node --test ~/Projects/personal/pi-personal/test/jev-trial.test.mjs
```

Verified locally with Pi 0.85.1. Interactive startup displayed Sol medium and the normal extension set, then `/quit` exited cleanly. A real Sol search used Jev without fallback. A separate registered-tool check confirmed missing credentials return native results with a notice. Global settings were byte-identical before and after both CLI and interactive checks. Evidence is in `../jev-search/results/trial/`.

The launcher honors saved project trust decisions and the global trust policy. If a project needs a trust decision, settle it in ordinary Pi first. It stops rather than installing missing packages or guessing which extension to replace. It expects the installed `@ff-labs/pi-fff` package and the sibling `jev-search` checkout with its dependencies already present.

Pi starts with `--offline` to avoid startup updates and installs. This does not disable model or Jev requests. Extra Pi arguments go after `--`. Do not add stock FFF or the model-remembering extension back with `-e`.

This is an opt-in usability trial, not a benchmark or a global rollout. Existing benchmark results and their original model settings remain unchanged.
