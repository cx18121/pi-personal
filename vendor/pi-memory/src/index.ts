import * as path from "node:path";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  assertMemoryMutationPermission,
  assertPapercutPermission,
  assertScratchpadPermission,
  autoCaptureEnabled,
  buildStartupContext,
  checklistFilePath,
  findRecoveryScope,
  forgetMemory,
  listTopics,
  memoryFilePath,
  mutateChecklist,
  readText,
  resolveAgentRole,
  resolveLocations,
  resolveScope,
  restoreMemory,
  scopeInventory,
  searchMemory,
  writeMemory,
  type MemoryScope,
} from "./core.js";

const scopeSchema = Type.Optional(
  StringEnum(["global", "project"] as const, {
    description: "Memory scope. Defaults to project inside Git and global outside Git.",
  }),
);

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { ...textResult(`Memory error: ${message}`), isError: true };
}

function runtime(ctx: ExtensionContext) {
  return {
    locations: resolveLocations(ctx.cwd),
    role: resolveAgentRole(process.env, ctx.sessionManager.getSessionId()),
  };
}

function scopePath(ctx: ExtensionContext, requested?: MemoryScope) {
  const state = runtime(ctx);
  return { ...state, ...resolveScope(state.locations, requested) };
}

export default function registerMemory(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const { locations, role } = runtime(ctx);
    const context = buildStartupContext({ locations, role, autoCapture: autoCaptureEnabled() });
    return { systemPrompt: `${event.systemPrompt}\n\n${context}` };
  });

  pi.registerTool({
    name: "memory_write",
    label: "Memory Write",
    description:
      "Visibly save a stable preference, correction, confirmed recurring fix, or useful fact to local Markdown. Current sources override memory. Prefer a concise MEMORY.md index and topic files for detail. During an explicit approval-gated review, propose the write and wait for selection.",
    parameters: Type.Object({
      scope: scopeSchema,
      target: Type.Optional(StringEnum(["memory", "topic"] as const)),
      topic: Type.Optional(Type.String({ description: "Lowercase topic slug when target is topic." })),
      content: Type.String({ description: "Markdown to store." }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const state = scopePath(ctx, params.scope);
        assertMemoryMutationPermission(state.role);
        const target = params.target ?? "memory";
        const filePath = writeMemory({
          dir: state.dir,
          target,
          topic: params.topic,
          content: params.content,
          sessionId: ctx.sessionManager.getSessionId(),
        });
        const destination =
          target === "topic" ? `${state.scope} topic "${params.topic}"` : `${state.scope} MEMORY.md`;
        return textResult(`Saved to ${destination}:\n\n${params.content}`, {
          path: filePath,
          scope: state.scope,
          target,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "memory_read",
    label: "Memory Read",
    description: "Read global or active-project memory, topics, scratchpad, or papercuts.",
    parameters: Type.Object({
      scope: scopeSchema,
      target: StringEnum(["memory", "topic", "topics", "scratchpad", "papercuts"] as const),
      topic: Type.Optional(Type.String({ description: "Lowercase topic slug for target=topic." })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const state = scopePath(ctx, params.scope);
        if (params.target === "topics") {
          const topics = listTopics(state.dir);
          return textResult(topics.length ? topics.map((topic) => `- ${topic}`).join("\n") : "No topics found.", {
            scope: state.scope,
            topics,
          });
        }
        const filePath =
          params.target === "memory" || params.target === "topic"
            ? memoryFilePath(state.dir, params.target, params.topic)
            : checklistFilePath(state.dir, params.target);
        const content = readText(filePath);
        return textResult(content || `${path.basename(filePath)} is empty or does not exist.`, {
          path: filePath,
          scope: state.scope,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "memory_search",
    label: "Memory Search",
    description:
      "Search local Markdown in global and active-project memory with in-process BM25+ ranking. Exact phrases rank first; prefix matching is enabled, with typo tolerance only as a fallback.",
    parameters: Type.Object({
      query: Type.String(),
      limit: Type.Optional(Type.Number({ description: "Maximum results, 1-25. Default 5." })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const { locations } = runtime(ctx);
        const results = searchMemory(locations, params.query, params.limit ?? 5);
        if (!results.length) return textResult(`No memory found for "${params.query}".`, { count: 0 });
        const formatted = results
          .map(
            (result, index) =>
              `### Result ${index + 1}\n**File:** ${result.path}\n\n${result.excerpt}`,
          )
          .join("\n\n---\n\n");
        return textResult(formatted, { count: results.length, results });
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "memory_forget",
    label: "Memory Forget",
    description: "Remove matching memory entries and create a local recovery record before deletion.",
    parameters: Type.Object({
      scope: scopeSchema,
      target: Type.Optional(StringEnum(["memory", "topic"] as const)),
      topic: Type.Optional(Type.String()),
      match: Type.String({ description: "Case-insensitive substring identifying entries to remove." }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const state = scopePath(ctx, params.scope);
        assertMemoryMutationPermission(state.role);
        const result = forgetMemory({
          dir: state.dir,
          target: params.target,
          topic: params.topic,
          match: params.match,
        });
        return textResult(
          `Removed ${result.removed} entr${result.removed === 1 ? "y" : "ies"}. Recovery ID: ${result.recoveryId}.`,
          result,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "memory_restore",
    label: "Memory Restore",
    description: "Restore entries deleted by memory_forget using its recovery ID.",
    parameters: Type.Object({ recoveryId: Type.String() }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const { locations, role } = runtime(ctx);
        assertMemoryMutationPermission(role);
        const found = findRecoveryScope(locations, params.recoveryId);
        const result = restoreMemory(found.dir, params.recoveryId);
        return textResult(
          result.alreadyRestored
            ? `Recovery ${params.recoveryId} was already restored.`
            : `Restored ${result.restored} entr${result.restored === 1 ? "y" : "ies"}.`,
          { ...result, scope: found.scope },
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "scratchpad",
    label: "Scratchpad",
    description:
      "Manage global or project unfinished-work checklists. Project scope is the default inside Git. Subagents are read-only.",
    parameters: Type.Object({
      scope: scopeSchema,
      action: StringEnum(["add", "done", "undo", "clear_done", "list"] as const),
      text: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const state = scopePath(ctx, params.scope);
        assertScratchpadPermission(state.role, params.action);
        const filePath = checklistFilePath(state.dir, "scratchpad");
        const content = mutateChecklist({
          filePath,
          action: params.action,
          text: params.text,
          sessionId: ctx.sessionManager.getSessionId(),
        });
        return textResult(content || "Scratchpad is empty.", { path: filePath, scope: state.scope });
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "papercut",
    label: "Papercut",
    description:
      "Report and manage small workflow friction. Add even a first occurrence when a tool, prompt, skill, helper, or repository change could plausibly prevent it. Include the activity, friction, and plausible structural improvement. Skip incidental mistakes with no structural lesson and never include secrets. During an explicit approval-gated review, propose the entry and wait for selection. Any agent may append or list; only root agents may edit, resolve, or clear items.",
    parameters: Type.Object({
      scope: scopeSchema,
      action: StringEnum(["add", "done", "undo", "clear_done", "list", "edit", "resolve"] as const),
      text: Type.Optional(Type.String({ description: "Item text or substring to match." })),
      replacement: Type.Optional(Type.String({ description: "Replacement text for edit." })),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const state = scopePath(ctx, params.scope);
        assertPapercutPermission(state.role, params.action);
        const filePath = checklistFilePath(state.dir, "papercuts");
        const content = mutateChecklist({
          filePath,
          action: params.action,
          text: params.text,
          replacement: params.replacement,
          sessionId: ctx.sessionManager.getSessionId(),
        });
        return textResult(content || "Papercuts are empty.", { path: filePath, scope: state.scope });
      } catch (error) {
        return errorResult(error);
      }
    },
  });

  pi.registerTool({
    name: "memory_status",
    label: "Memory Status",
    description: "Show local memory paths, active project identity, role, permissions, and file counts.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _update, ctx) {
      try {
        const { locations, role } = runtime(ctx);
        const global = scopeInventory(locations.globalDir);
        const project = locations.projectDir ? scopeInventory(locations.projectDir) : null;
        const lines = [
          "# Memory status",
          "",
          `- Base: ${locations.baseDir}`,
          `- Role: ${role}`,
          `- Durable memory writes: ${role === "root" ? "allowed" : "read-only"}`,
          `- Scratchpad writes: ${role === "root" ? "allowed" : "read-only"}`,
          `- Papercut append: allowed`,
          `- Papercut edit/resolve: ${role === "root" ? "allowed" : "read-only"}`,
          `- Project: ${locations.project ? `${locations.project.id} (${locations.project.commonRoot})` : "none"}`,
          "",
          `- Global: ${global.dir} — ${global.files} files, ${global.bytes} bytes, ${global.topics} topics`,
          ...(project
            ? [`- Project: ${project.dir} — ${project.files} files, ${project.bytes} bytes, ${project.topics} topics`]
            : []),
          "",
          "Configuration: PI_MEMORY_DIR, PI_MEMORY_AUTO_CAPTURE, PI_MEMORY_SUBAGENT_MODE",
        ];
        return textResult(lines.join("\n"), { role, locations, global, project });
      } catch (error) {
        return errorResult(error);
      }
    },
  });
}
