# CXStack audit

Find the changes to Charlie's setup that would most shorten the gap between what he asks for and what he gets. The setup is the contract in `{{CXSTACK_ROOT}}/AGENTS.md`, the skills, the Pi extensions in `{{PACKAGE_ROOT}}`, and Pi settings.

The audit directory is `{{AUDIT_DIR}}`. It holds `metrics.json` for {{SESSIONS}} sessions since {{SINCE}}, and {{BATCHES}} digest batches named `batch-N.md`. {{PREVIOUS}}

## Steps

1. **Metrics.** Read `metrics.json` and the previous metrics. A regression is a measure that moved the wrong way by more than noise: a higher warm cache miss rate, more provider hangs, more interruptions that were not resends, more subagent spawns per hundred turns, more correction phrases per turn, or a larger fixed prompt. For each regression, find its cause in the setup source or the digests. Done when every regression has a cause or is marked unexplained.
2. **Sessions.** Give each batch to one read-only reviewer with the brief at `{{CXSTACK_ROOT}}/resources/audit-review.md` and the batch path. Read a single batch yourself instead. Done when every batch has a result.
3. **Synthesis.** Rank the patterns by how much of Charlie's time they cost. For each, read the current owner (the contract, a skill, an extension, or a setting) and propose the smallest change that would have shortened the affected sessions. Prefer code or configuration when the fix is mechanical, and a guidance line tied to a recognizable situation when it needs judgment. Prefer removing guidance that changed nothing. Name what Charlie can do differently when the fix is a habit.

## Report

Save the report as `{{AUDIT_DIR}}/report.md`, which marks this audit complete for the next comparison, and show it to Charlie. Lead with the regressions, then the ranked proposals. Each proposal gives the evidence as short session ids with turn numbers, its owner, and the exact change. Separate observations from hypotheses. Then stop and wait for Charlie to choose. This audit authorizes no edits, memory writes, or publication.

Transcripts are private evidence. Paraphrase them, and keep secrets, customer names, and production data out of the report and out of reviewer briefs.
