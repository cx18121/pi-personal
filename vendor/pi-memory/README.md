# pi-memory (local fork)

This is Charlie Xue's local, Markdown-only fork of Jay Zeng's [`pi-memory`](https://github.com/jayzeng/pi-memory).

- Upstream version: `0.4.2`
- Upstream commit: `39e6b998a2279c8fad4a2c6c64e26828c1d6023e`
- License: MIT; see `LICENSE`

The fork keeps the upstream tool shape and deletion recovery while replacing daily logs, qmd, embeddings, conversation indexing, and model-generated shutdown summaries with scoped local Markdown, in-process MiniSearch BM25+ retrieval, root/subagent permissions, and locked atomic writes.

## Storage

```text
~/.pi/agent/memory/
  global/{MEMORY.md,SCRATCHPAD.md,PAPERCUTS.md,topics/,recovery/}
  projects/<initial-repo-name>-<stable-id>/{MEMORY.md,SCRATCHPAD.md,PAPERCUTS.md,topics/,recovery/}
```

On first use, a repository receives an immutable project ID in its shared local Git config under `pi.memory-id`. Git worktrees therefore share memory, and moving or renaming the repository does not change its memory location. Separate clones receive separate IDs. Existing path-based project memory is moved to the stable location when the ID is first created. If Git metadata is read-only, memory keeps using the path-based identity until the ID can be stored. If both locations contain data, migration stops with an explicit error rather than hiding or merging either directory. Outside Git, only global memory is available.

## Configuration

The only user configuration variables are:

- `PI_MEMORY_DIR`: override the memory base directory.
- `PI_MEMORY_AUTO_CAPTURE`: set to `0`, `false`, `no`, or `off` to hide visible capture guidance.
- `PI_MEMORY_SUBAGENT_MODE`: `root` or `subagent` to override automatic role detection. The `root` force mode deliberately bypasses child detection.

Role detection also observes pi-subagents' runtime-only `PI_SUBAGENT_CHILD=1` marker, then falls back to comparing its parent and session markers. These are runtime facts, not memory configuration.

No qmd, embedding model, database, daemon, hosted service, or shutdown model call is used. Durable memory writes are append-only; deletion goes through `memory_forget`, which creates a recovery record first. Search builds a small in-memory MiniSearch index from global and active-project Markdown for each query, then discards it.

## Retrieval

Search uses MiniSearch BM25+ over cleaned body text, topic and heading names, and code identifiers. Identifier indexing preserves complete names and splits underscores, hyphens, paths, dots, camel case, acronyms, and number boundaries.

Normal search runs before typo correction. Prefix matching applies only to the final term, and only when it has at least three characters. One-edit fuzzy matching is a fallback for terms with at least five letters or numbers. Exact phrase checks use the original stored text and respect identifier boundaries. Results include an excerpt centred on the matching line or code fence.

Scratchpads hold unfinished work. Startup context includes the active project's `Now` handoff and unchecked items. Only explicit scratchpad tool calls change shared project scratchpads. Session compaction stays in the session and does not write to project storage. Papercuts hold observed workflow friction. When search demonstrably misses or misranks a relevant memory, agents are told to record the exact query, expected result, and evidence with a visible papercut call. Ordinary no-result searches are not failures. Papercuts remain readable through their tools but are excluded from normal memory search so reports cannot become search results themselves.
