# CXStack v0 compared with PStack

## Position

PStack is the primary reference. CXStack keeps its trust-first thesis, named judgment, adaptive routing, model diversity, and real verification. It changes mechanisms only where Charlie's work or Pi's runtime gives a concrete reason.

This comparison uses the PStack source inspected at commit `2a80444` and Lauren Tan's “How I Use Cursor” article.

| Area | PStack | CXStack v0 | Reason for the difference |
| --- | --- | --- | --- |
| Goal | Earn trust through depth and verification before scaling agents. | Same. One agent should own work without Charlie restoring ordinary judgment. | No intentional difference. |
| Activation | Poteto Mode uses Cursor `mode: true` and a short reminder. Invoke once and let the mode stay quiet when irrelevant. | `/cx` stores one Pi session boolean. `/new` starts off, resume and fork restore it, and `/cx off` clears it. | Pi has no Cursor mode primitive. A hidden boolean reproduces the behavior without semantic task state. |
| Natural opt-out | The reminder tells the model to stay out when the user opts out. | Only `/cx off` changes sticky state. Task instructions still change that task. | Deterministic state avoids ambiguous scope and compaction behavior. |
| Active prompt | Poteto Mode contains 21 principle summaries, many triggers, autonomy rules, subagent policy, writing rules, and the complete playbook menu. | The approved activation body and linked index contain 244 words, followed by an 18-word marker. Other material loads only when useful. | Charlie's history and frontier-model behavior show that large active prompts can inhibit judgment. |
| Principles | All 21 are listed in the mode. Applied principles require reading leaf skills and citing the decisions they changed. | Eight core principles have balanced one-line definitions. Other principles live in playbooks and specialists. Name a principle only when it changes a consequential choice. | Preserve shared judgment and observability without repeating a large catalog or producing citation theater. |
| Intent | Skills such as How, Why, Figure It Out, and playbooks recover and challenge the work. Interrogate normally tests whether work achieves stated intent. | Intent Before Method is core. The owner and judge may challenge whether the target and stated intent are correct. | Charlie's failed cases often began with the wrong target or a supplied theory that reviewers accepted. |
| Task framing | Multi-step work starts with a todo and copies matched playbook steps. | Tiny work stays direct. Harder work briefly states intention and completion condition, then composes useful capabilities. | Mandatory framing and copied steps can anchor plans and add ceremony. |
| Playbooks | More than twenty detailed task playbooks plus Figure It Out, Autonomous Run, Orchestrate, Babysit, Shipping, and autopilot variants. | Four thin references: Diagnose and Fix, Build and Change, Investigate and Decide, and Review. Delivery is shared guidance; task framing, todo, reassessment, and scratchpad handle long work without another wrapper. | Four shapes cover current work. No evidence yet earns program orchestration or many fixed tracks. |
| Playbook form | Ordered steps are copied into todo and skipped steps require reasons. | Useful moves, failure modes, proof target, and capabilities. No mandatory sequence. | Preserve model judgment and allow evidence to change the approach. |
| Todo | Mandatory for every multi-step task. | Native todo for current execution when useful. | Tiny and clear work should not pay task-management cost. |
| Long work | Show Me Your Work, autonomous-run, pause/pickup, and program playbooks maintain decision trails. | One ephemeral scratchpad handoff only at real session boundaries. Conversation and todo own current work. | Durable plans became stale and acted like a second authority in Charlie's history. |
| Persistent state | Cursor mode and PStack rules support the active workflow. | Only the activation boolean is custom state. No semantic capsule, frozen plan, workflow database, or custom compaction. | Compaction research did not justify another model-maintained source of truth. |
| Compaction | Cursor maintains mode behavior through its mode reminder. | Pi appends one exact persistent kernel after compaction and does not alter the summary. | Exact refresh prevents summary drift while leaving Pi's compaction untouched. |
| Capability system | PStack provides its own large plugin of principles, skills, playbooks, model roles, and setup rules. | Compose Pi context files, skills, extensions, MCP, memory, models, and subagents. | Pi already has the required substrate. A second plugin API adds no proven value. |
| Specialist knowledge | PStack bundles much of its engineering method. | Reuse existing global and project specialists after a route-targeted compatibility audit. | Pango, language, runtime, and document skills already contain local truth. Duplicating them would create drift. |
| Models | Several configured model families and complete effort-specific slugs. Different workflow roles route to different models. | Start with Sol and Fable as soft child-role defaults. Keep the parent model and Pi's normal effort setting. | Two families provide complementary judgment without a general router or mid-session parent switching. |
| Effort | Model and effort are coupled in PStack routes, often at max or xhigh. | Effort is ordinary Pi configuration, currently xhigh, not a CX subsystem. | Historical evidence did not show effort alone removes the main trust failures. |
| Subagents | Broad use of Task, Architect, Arena, Swarm, and role-specific delegates. | Bounded children only when their capability earns its cost. Parent owns synthesis. | No strong historical case showed that routine three-or-more lane fanout produced unique accepted value. |
| Mixed panels | Interrogate commonly uses Fable, Sol, Grok, and Opus with shared prompts, consensus, disagreement, and lead disposition. | No dedicated panel mechanism in v0. Pi can still run several ordinary children when context genuinely demands it. | Initial model set has two families, and review loops and fanout often produced churn. |
| Adversarial review | Contested designs route to Interrogate. Arena and Architect compare candidates with cross-family judges. | One context-selected complementary judge at the highest-leverage boundary. Read-only, strict finding bar, owner verification, no automatic loop. | Preserve independent falsification while avoiding finding-count pressure and review theater. |
| Judge scope | Interrogate focuses on whether work achieves the stated intent. | Judge attacks intention, target, domain model, implementation, scope, proof, and delivery. | Wrong-intent and wrong-target failures were central in Charlie's history. |
| Design exploration | Function boundaries and novel decisions can trigger Architect, Arena, or several prototypes. | Prototype or design skills load only when a real unresolved fork earns exploration. | Mandatory exploration on every boundary would slow obvious work and create options without a decision need. |
| Autonomy | Reversible work and many external actions proceed. PStack pauses for irreversible writes. Several playbooks continue through PR and shipping. | Own routine engineering. Infer delivery from request, project, and current workflow. A verified commit is the isolated-work fallback. Do not infer push, PR, merge, deploy, or production mutation from silence. | Charlie wants technical ownership without ambiguous publication authority. |
| Verification | Prove It Works requires the real artifact rather than compilation or proxy checks. | Same, plus “Confidence stops at the evidence” and explicit proof jurisdictions. | Charlie's history contained clean tests and reviews inside rejected, reverted, undeployed, or operationally wrong work. |
| Closeout | Each playbook defines its reply and PR link. | Format varies. Preserve outcome, evidence, open state, and actual delivery state only when the task needs them. | Fixed closeouts become repetitive and distort casual or tiny tasks. |
| Writing | Poteto Mode carries detailed reply and comment style, plus Unslope and Technical Writing. | Use existing plain-writing and specialist writing skills. Global baseline says only to match the response to the task and calibrate completion claims. | Avoid another always-active style manual. |
| Learning | Reflect uses three reviewers and a synthesizer, then routes accepted lessons mainly into skills after user approval. Automate Me can update the personal mode. Eval supports blind comparisons. | Save stable corrections through Pi memory during normal work. Explicit `/reflect` uses one complementary reviewer and the parent to sort missed lessons into memory, skills, structural changes, papercuts, or rejection. It waits for approval before writing. | Personal preferences do not all belong in skill prose. One reviewer preserves independent challenge without routine panel cost. Automatic learning can turn anecdotes into rules. |
| Papercuts | No equivalent core mechanism in the inspected mode. | Local project/global workflow-friction checklist, excluded from startup and retrieval. | Charlie wants small friction captured without making it task state or authority. |
| Evaluation | PStack includes an Eval playbook and blind candidate comparisons. | Test deterministic mechanics only. Learn behavioral value from normal real work and papercuts. | Fake task scenarios have weak external validity for this system. |
| Global baseline | Poteto Mode carries the personal style when active. | A 31-word global `AGENTS.md` body preserves ownership and evidence-calibrated communication even when CX is off. | These two expectations apply across all Pi work and survived hostile deletion review. |
| Customization | Setup PStack configures model roles and rules. | No `.cx` config or model setup UI in v0. Use Pi's existing settings, project context, and skill discovery. | There is no demonstrated customization gap yet. |
| Scale | PStack supports autonomous runs, stacked PRs, queues, and long-running orchestration. | No autonomous-run or project-program machinery in v0. | Charlie's immediate failure is basic trust, not lack of agent fleet scale. |

## Intentional omissions from v0

CXStack does not yet include:

- A general model router.
- Automatic parent-model switching.
- Mixed review panels.
- Architect or Arena bakeoffs as mandatory routes.
- Swarm orchestration.
- Autonomous-run, autopilot, or program coordination.
- A workflow database or semantic checkpoint.
- Custom compaction summaries.
- Automatic skill mutation.
- A synthetic behavioral benchmark.
- A second plugin or capability registry.

These are postponed, not declared useless. Add one only after normal CX work exposes a repeated gap that Pi and current specialists cannot solve.

## What CX keeps from PStack

The important inheritance remains intact:

- Trust before scale.
- Depth before breadth.
- Named principles.
- Intent and outcome over literal method.
- Domain modeling.
- Subtraction and small complete interventions.
- Dynamic task routing.
- Complementary model families.
- Independent adversarial judgment.
- Real-surface verification.
- Human-readable evidence and delivery claims.
- Learning from recurring failures without accepting every reviewer suggestion.