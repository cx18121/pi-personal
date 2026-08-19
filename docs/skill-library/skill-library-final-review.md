# Skill library cleanup review

## Review set

Four independent cluster audits inspected every global and Pango skill before cleanup. GPT reviewed engineering and tool ownership. Claude reviewed UI, document, and Pango ownership. Their full reports are saved as:

1. [`skill-audit-engineering-review.md`](skill-audit-engineering-review.md)
2. [`skill-audit-ui-review.md`](skill-audit-ui-review.md)
3. [`skill-audit-tools-review.md`](skill-audit-tools-review.md)
4. [`skill-audit-pango-review.md`](skill-audit-pango-review.md)

The parent verified each recommendation against current source, tools, package versions, runtime behavior, and Charlie's settled preferences. The parent rejected suggestions that would make Plain Writing manual, remove the distinct Deslop workflow, hide Code Review from Pi, or remove the merge conflict specialist.

## First applied review

GPT found nine global integration problems after the first cleanup:

1. The repaired DOCX and XLSX bundles still lacked host dependencies.
2. Impeccable used project-relative script paths that did not exist for a global skill.
3. Impeccable Doctor could repair files during a report-only request.
4. Claude could discover Pi-only Code Review instructions.
5. Explicit-only Firecrawl could not route an unhandled native capability gap.
6. Prototype references still authorized production and Git mutation.
7. TDD references retained the universal assertion and mock rules removed from the main skill.
8. Apple Design still contained broad product critique.
9. Grill Me disabled implicit Codex routing.

Every finding was accepted and corrected.

Claude found three Pango issues:

1. Bunnyshell could return through `skills-lock.json`, and its MCP server remained configured.
2. Four test invariants had been lost while moving shared rules.
3. The changed-contract test rule no longer required explicit per-test approval.

The first two were accepted and corrected. The third matches Charlie's already approved decision: tests may change when requested behavior changes the tested contract, while weakening tests remains forbidden.

## Corrections

The correction pass:

1. Temporarily installed the current official DOCX and XLSX bundles and their Python, Node, Pandoc, Poppler, and LibreOffice dependencies so the repair could be tested.
2. Rewrote every Impeccable Markdown command to the global skill path and made Doctor report-only unless repair is requested.
3. Removed the Claude Code Review link while keeping the Pi skill.
4. Restored narrow model routing for Firecrawl capability gaps.
5. Removed production handoff and branch creation from Prototype references.
6. Aligned TDD reference rules with the main skill.
7. Removed broad design principles from Apple Design.
8. Enabled implicit Grill Me routing for Codex.
9. Deleted the Bunnyshell lock and MCP entries.
10. Restored the missing test transaction, mutation, expected-builder, and naming rules in `coding-standards.md`.
11. Moved archives and retired command files outside `~/.agents`, which removed 18 false user agents from Pi Subagents discovery.

## Runtime evidence

A fresh Pango Pi process reports:

```text
agents: total 7 (builtin 7, package 0, user 0, project 0)
skills: total 35 (project 10, user 23, user-package 2)
```

A normal fresh reviewer child returned `SUBAGENT_OK`.

Synthetic document checks passed on the host:

1. DOCX creation with the `docx` npm module.
2. DOCX schema validation with the bundled validator.
3. DOCX to PDF conversion with the bundled LibreOffice wrapper.
4. PDF page rendering through Poppler.
5. XLSX creation with a formula.
6. Formula recalculation through the bundled `recalc.py`.
7. Zero formula errors and cached value `42` from the recalculated workbook.

GPT independently verified all artifact hashes, the DOCX and XLSX ZIP structures, the PDF text and page count, the rendered JPEG, the formula XML, and the cached value. This proved that the complete bundles worked. It did not establish a need to keep them.

The audit found no DOCX or XLSX use in the reviewed three-month history. Charlie selected the leaner final state after reviewing the dependency cost. Both skills, their Claude links, Pandoc, LibreOffice, the global `docx` npm package, and the Python packages installed only for these skills were removed. The complete bundles can return with their dependencies on the first real document task.

GPT's final document evidence result before removal was `PASS. GO.` Claude rechecked the Pango findings after correction and returned `PASS on all three findings. GO.`

## Final verdict

The cleanup is ready for local use. The Pango portion was committed and pushed as `0de5835e4`, then [Pango pull request #655](https://github.com/pango-tech/backend-app/pull/655) merged into `master` as `bc63959f4`. The local global skills and the `pi-personal` worktree remain separate and uncommitted.
