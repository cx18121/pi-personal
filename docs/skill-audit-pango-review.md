# Project skill library audit — `.agents/skills` (deletion-first)

## Context

Charlie asked for a full-library audit of the 11 project skills in
`/Users/charliexue/Work/pango/backend-app/.agents/skills`, checked against AGENTS.md,
coding-standards.md, and the live repository (installed dependencies, current runtime,
pango CLI). Read-only: verdicts and smallest safe changes only, no edits, no publication.
Project source and current runtime were treated as ground truth; every claim below was
verified against the repo in this session.

Library size: ~8,105 lines across the 11 skills.

## Verdicts at a glance

| Skill | Verdict | One-line reason |
|---|---|---|
| bunnyshell-environments | **DELETE** | Platform retired; zero repo usage; ~2,400 lines of generic vendor docs |
| dev-note | **KEEP** | 21 lines, already explicit-only, script target exists |
| ext-php-rs | **KEEP** | Matches pinned 0.15.15; detail correctly disclosed in references |
| laravel-model-states | **KEEP** | Version, contract, paths, verification all check out |
| pango-debug | **NARROW** | Failure-modes section describes a retired native php-fpm stack |
| pango-e2e-mockless | **KEEP** | Every trap verified live, incl. exact line numbers; one command nit |
| pango-js-ts-style | **NARROW** | neverthrow mandate wrong for repo; `as` ban forbids `as const` and import aliases; API dumps |
| pango-php-style | **NARROW** | Duplicates coding-standards; brick/date-time not installed in web; example/API bulk |
| pango-rust-style | **KEEP** (prune) | Content correct and live; stdlib API dumps and one no-op rule deletable |
| pr-tour | **KEEP** | Explicit-trigger workflow skill; all assets and CLI commands verified |
| zen-jdm | **NARROW** | Rust API examples contradict zen-engine 0.55 as used by crates/enigma |

Deletion count: **1 whole skill** (bunnyshell-environments, 14 files, ~2,417 lines) plus
**~700 intra-skill lines** across the three style skills, zen-jdm, and pango-debug.

---

## 1. bunnyshell-environments — DELETE

**Evidence**
- No `bunnyshell.yaml` and no `bns` invocation anywhere in the repo, dev tooling, or mise
  tasks (repo-wide search excluding `.agents/`; only hits are a stale git ref
  `origin/bunnyshell` and `dev/remote/README.md:133`).
- `dev/remote/README.md` documents the replacement: remote dev is first-party EKS via
  `terraform-aws/envs/remote-dev`, and the fnox keys "still hold the old `bunnyshell-k8s`
  keys" — Bunnyshell is explicitly the *old* provider.
- The skill is a vendored plugin (`.claude-plugin/plugin.json`) of generic vendor
  documentation: 608-line SKILL.md + 9 reference files (~1,800 lines) about the `bns` CLI,
  PATs, yaml schema, Rails/Django checklists — none of it Pango knowledge.
- Trigger cost: its description fires on "ephemeral environments", "environment
  deployment", "port forwarding", "SSH access" — generic phrases that can hijack unrelated
  infra work toward a platform the project no longer uses.

**Smallest safe change**: delete the whole `bunnyshell-environments/` directory. If anyone
still operates a personal Bunnyshell account, the plugin belongs at user level
(`~/.claude/skills`), not in the repo.

## 2. dev-note — KEEP

21 lines, `disable-model-invocation: true` (already explicit-only), and its one command
target `pr-tour/assets/save_note.py` exists. Correct shape: a thin invocation surface over
pr-tour's note store. Merging into pr-tour would remove the mid-work `/dev-note` entry
point for no saving. No change.

## 3. ext-php-rs — KEEP

- Live consumer: `crates/enigma/Cargo.toml` pins `ext-php-rs = "0.15.15"`;
  `crates/enigma/src/lib.rs` uses `#[php_function]`/`#[php_module]` + `wrap_function!`
  exactly as the skill shows.
- Version check: `#[php_interface]` and the unified `#[php(...)]` attribute exist in the
  installed 0.15.15 source (`~/.cargo/registry/.../ext-php-rs-0.15.15/guide/src/macros/interface.md`).
- Reference layout is the right call: 105-line SKILL.md index, 12 reference files loaded
  only "when details matter". This is how references should carry detail.

Optional one-line improvement (not required): name `crates/enigma` in the description as
the grounding example.

## 4. laravel-model-states — KEEP

- `spatie/laravel-model-states: ^2.14` confirmed in `web/composer.json:61`; skill says 2.14.
- `HasStatesContract` verified in vendor and in use (`web/app/Models/OrderReturn.php:53`);
  `web/app/States/{Inspection,ManualReview,Settlement}` exist as claimed.
- Verification section routes through `pango test filter` per AGENTS.md.
- Good decision table (enum vs states) that prevents over-reach — this is trigger
  ownership done right.

## 5. pango-debug — NARROW

**Keep** (verified live): token minting via `AuthenticatePango`
(`web/app/Http/Middleware/AuthenticatePango.php` exists), the `%7C` encoding gotcha, the
agent-browser workflow (CLI installed at `~/.local/share/fnm/.../bin/agent-browser`), the
Tailwind 4 `@source` note, the OTel note.

**Stale — the "Common local-stack failure modes" section describes a retired stack**:
- It prescribes `pkill -9 -f php-fpm`, watching `web/storage/app_data/run/php-fpm.sock`
  and `web/storage/logs/php-fpm.log`, and Caddy-on-host 502s. `php-fpm.sock` appears
  nowhere in the repo outside this skill; the current stack runs FrankenPHP inside docker
  compose (`web/docker-compose.yml:86`: `exec frankenphp run --config /etc/frankenphp/Caddyfile.dev`),
  with lifecycle owned by `pango dev run|restart|stop` (AGENTS.md).
- `cd web && php artisan tinker` contradicts AGENTS.md's "Run a command in the web
  container: `pango dev exec php artisan …`".
- `http://local.pango.se` still appears in `web/.env.testing` and `web/cypress.config.js`,
  but the per-worktree slot URL should be re-verified against `pango dev` output before
  trusting it.

**Smallest safe change**: rewrite the failure-modes list against the docker/FrankenPHP
stack (restart = `pango dev restart`, diagnose = `pango dev logs web`), route the tinker
recipe through `pango dev exec`, and confirm the current stack URL. A stale-opcache tip is
only worth keeping if the symptom still reproduces on FrankenPHP.

## 6. pango-e2e-mockless — KEEP

Everything spot-checked is live: all 8 wiki pages exist under `wiki/infrastructure/`;
`ReturnFormController::appProxyRuntime()` at line 134; the hardcoded BCC at
`web/app/Mail/Notification.php:86` (the cited line number is still exact);
`dev/src/commands/{e2e-run,app-refresh-scopes,utils-upload-s3*}.ts` all exist. The
trap documentation (fnox `-d` silently discarding values, Mailgun sandbox storage API,
legacy-vs-surface runtime selectors) is exactly the unwritten-convention cache a skill
should be.

One nit, not blocking: the Running section uses `bun dev/src/cli.ts e2e run` while
AGENTS.md names the `pango` CLI as the preferred entry (`pango e2e …`). Align the four
command lines to `pango e2e run` / `pango e2e stack-down`, or add one line saying why raw
bun is required there.

## 7. pango-js-ts-style — NARROW

**(a) The neverthrow mandate is wrong for this repo.** `neverthrow` is a dependency only
of `dev/package.json` (the pango CLI). It is not installed in `web/`, `returns-portal/`,
`returns/`, `pick-and-pack/`, or `desktop/`. Yet line 61 mandates it for all JS/TS, and
the How section says "install with `npm install neverthrow`, install
`eslint-plugin-neverthrow`" — an instruction to add a new dependency, contradicting
coding-standards ("Never add a new one for what a few lines can do") and the skill's own
reuse-first rule (line 63).
*Smallest change*: scope the neverthrow rule and section to workspaces where it is
installed (`dev/`), delete the install steps and the two "Key … Methods" API dumps
(~55 lines — that's what the package types are for).

**(b) The blanket `as` ban forbids `as const` and import aliases.** Line 58: "Never write
the TypeScript `as` keyword anywhere, for any reason." `as const` is a safe const
assertion used 17× in `web/resources/js` + `returns-portal/src`; import aliasing
(`import { Modal as AppBridgeModal }`, `web/resources/js/inertia/components/PrintAgentModal.tsx:1`)
is not a type assertion at all; and the codebase itself carries real casts the rule
outlaws (`as unknown as ComponentProps<'button'>`, `web/resources/js/inertia/components/InertiaSaveBar.tsx:28`).
*Smallest change*: reword to ban compiler-overriding assertions specifically (`as T`,
`as any`, `as unknown as`, angle-bracket casts, non-null `!`), explicitly allowing
`as const` and import aliases.

**(c) "Use `??` for fallbacks" vs coding-standards "No fallback chains" (severity error).**
Single-default `??` is fine; the wording invites chains.
*Smallest change*: "Use `??` over `||` for a single default; never chain fallbacks
(see coding-standards)."

**(d) No-op example bulk.** Lines 87–226 spell out one-line examples for `map`, `filter`,
`some`, `every`, destructuring, `??=` — behavior any current model already produces.
~140 deletable lines.

**(e) Duplication**: the `location.name` rule (line 77) is repeated verbatim in
pango-php-style (line 93) — see "Rules to move" below. "Do not write code comments"
(line 73) triplicates coding-standards + user CLAUDE.md; delete from the skill.

The App Bridge patched-hook rules (67–69) and `patterns/` files are verified grounded
(`web/resources/js/pango-shopify/hooks/useAppBridge.js` exists; pattern examples name real
components) — keep those.

## 8. pango-php-style — NARROW

**(a) Duplication with coding-standards.md** (which loads every turn via CLAUDE.md):
line 53 restates "Single source of truth" + "No fallback chains" nearly verbatim,
including the same examples (`country ?: country_code`); line 59 restates "No inline code
comments"; the controller example at lines 163–170 re-illustrates fallback chains.
*Smallest change*: delete the restatements; keep only the PHP-specific rendering if it
adds shape (`?:` chains).

**(b) Library list has a per-workspace error.** Verified installed in `web/composer.json`:
`gosuperscript/monads`, `beberlei/assert`, `brick/money`, `brick/postcode`,
`omaralalwi/php-builders`, `rinvex/countries`. **Not** direct deps of web:
`azjezz/psl` (transitive-only in composer.lock, though used 82× in `web/app` — worth
promoting to a direct require, separate task) and `brick/date-time` (only required by
`libs/ongoing-owner-api-php`). As written, the skill mandates reaching for a library that
would be a new dependency in `web/`.
*Smallest change*: annotate psl/date-time with where they are actually available, or fix
the composer files first.

**(c) Test-policy block (lines 79–93) is process, not style.** Fifteen dense rules
(red-first regression proof, no absence-only assertions, exact-shape JSON asserts) that
also bind reviewers — they belong in coding-standards.md or a shared reference both the
skill and reviews point at. Flagged for move, not deletion: the content is good.

**(d) No-op bulk**: one-line examples for every `array_*` function (lines 238–296,
~60 lines) and the monads Key-Methods API dump (lines 422–449) duplicate library docs.

Verified accurate: PHP 8.5 assumptions (pipe operator, property hooks, `clone(...)`),
mago inline-body note (`mago.toml` + `mise/quality.toml:23` confirm mago is the CI
formatter), `byHashOrFail()` guidance.

## 9. pango-rust-style — KEEP (with prune)

Live consumers: `crates/enigma`, `shopify/extensions/payment-customization`,
`shopify/extensions/delivery-customization-postnord-service-points`. House rules
(`Ok(variable)` over `Ok(multiline)`, chain over early returns, no `unwrap()` for business
flow) are real and non-default — keep.

Prune candidates (~170 lines, none load-bearing):
- "Use composition over inheritance" (line 31) — Rust has no inheritance; no-op.
- One-line stdlib examples (map/filter/fold/…, lines 124–204) and the Key
  Result/Option Methods dumps (lines 275–302) — stdlib doc cache.
- The `Option` example `users.get(&1).map(|n| n.to_string()).unwrap_or("Guest".to_string())`
  models a fallback — fine as syntax demo, but sits oddly next to the no-fallback standard;
  low priority.

## 10. pr-tour — KEEP

- Explicit trigger only ("someone asks for a PR tour") — correct ownership; procedural
  bulk is the point of a workflow skill and loads only on invocation.
- All assets verified: `assets/{build_tour.py,example-spec.py,save_note.py,tour-renderer.js}`,
  renderer source + committed bundle, `pango utils upload-s3` command exists
  (`dev/src/commands/utils-upload-s3.test.ts`).
- Memory confirms active use with output conventions already settled.

## 11. zen-jdm — NARROW

The JDM-format half is sound (node table, edges, hit policies — consistent with the JDM
fixtures embedded in `crates/enigma/src/lib.rs` tests). The Rust-API half contradicts
zen-engine 0.55 as pinned (`crates/enigma/Cargo.toml`: `zen-engine = "0.55"`) and used:

| Skill says | Repo/0.55 reality |
|---|---|
| `use zen_engine::handler::custom_node_adapter::CustomNodeAdapter` | `use zen_engine::nodes::custom::{CustomNodeAdapter, CustomNodeRequest, DynamicCustomNode}` (`primitives.rs:10`) |
| `#[async_trait] async fn handle(&self, request: &Value)` | `fn handle(&self, request: CustomNodeRequest) -> Pin<Box<dyn Future<Output = NodeResult> + '_>>`, no async-trait (`primitives.rs:104`) |
| Loader: `async fn load(&self, key: &str) -> Result<String, Box<dyn Error>>` | `MemoryLoader` + `Arc<dyn DecisionLoader>` + typed `DecisionContent` (`lib.rs:19,215`) |
| Cargo: add `async-trait` | enigma does not depend on async-trait |

The skill's own gotcha ("check docs.rs for exact trait names") concedes the examples are
unverified — a hedge doing the job the examples should do.

**Smallest safe change**: replace the Loaders and Custom-node sections with the
enigma-grounded idioms (or delete them and point at
`crates/enigma/src/{lib.rs,primitives.rs}` as the canonical pattern), drop async-trait
from the Cargo list, and add `crates/enigma` to the description so the skill grounds in
project source instead of remembered docs. Keep `references/node-content.md` and
`references/expression-language.md` (format-level, version-stable).

---

## Rules that should move

1. **`location.name` semantics** — duplicated verbatim in pango-js-ts-style:77 and
   pango-php-style:93. One meaning, two copies that will drift. Move to
   coding-standards.md (it is a domain fact, language-independent) and delete both copies.
2. **PHP test policy block** (pango-php-style:79–93) — process rules that bind writing and
   reviewing; move to coding-standards.md or a shared `pango-php-tests` reference the
   style skill points at.
3. **"Do not write code comments"** in all three style skills — already covered by
   coding-standards "No inline code comments" and the user's global CLAUDE.md; delete the
   three copies.
4. **`??` fallback wording** in both js-ts and php style skills — align with
   coding-standards "No fallback chains" instead of restating a softer version.

## Coherent Pango skill map (after changes)

- **Style (auto-trigger by language, path-scoped via coding-standards)**:
  pango-php-style · pango-js-ts-style · pango-rust-style — house rules only; shared
  domain facts and test policy live in coding-standards.md; no library-API dumps.
- **Library skills (auto-trigger by dependency, grounded in the pinned version)**:
  laravel-model-states (spatie 2.14) · ext-php-rs (0.15.15, references on demand) ·
  zen-jdm (0.55, examples re-grounded in crates/enigma).
- **Environment/verification (auto-trigger by task)**:
  pango-debug (browser validation on the docker/FrankenPHP stack) ·
  pango-e2e-mockless (e2e-live tier; wiki carries the deep detail).
- **Explicit workflow commands (fire only by name)**:
  pr-tour · dev-note (its capture surface).
- **Deleted**: bunnyshell-environments — retired platform, generic vendor docs.

## Verification (if the changes are later applied)

- `grep -rn "php-fpm\|neverthrow\|bunnyshell" .agents/skills` returns nothing outside
  `dev/`-scoped neverthrow wording.
- `grep -rn "location.name" .agents/skills coding-standards.md` shows exactly one
  authoritative copy.
- Re-run one exercise per surviving library skill (e.g. `cargo check -p enigma` after
  copying the zen-jdm loader example) to prove examples compile against pinned versions.
