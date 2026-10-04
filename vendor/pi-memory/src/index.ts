import * as path from "node:path";
import * as fs from "node:fs";
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { assertMemoryMutationPermission, autoCaptureEnabled } from "./core.js";
import { assertSafePath, migrateLedger, routingIndex } from "./ledger.js";
import { LEARNING_POLICY } from "./learning.js";
import { MemorySession } from "./runtime.js";
import { responseBudget, tokenEstimate } from "./admission.js";
import { errorResult, jsonResult, memoryOperations } from "./operations.js";

export default function registerMemory(pi: ExtensionAPI) {
  const session = new MemorySession();
  session.register(pi);
  function memoryContext(ctx: ExtensionContext) {
    const policy = ["# Local memory", LEARNING_POLICY,
      !autoCaptureEnabled() ? "Autonomous learning disabled. Save only when explicitly requested."
        : "Learn autonomously through the memory tools when lasting knowledge is established. Ordinary questions and one-task exceptions need no memory work.",
      session.role(ctx) === "subagent" ? "Subagents are read-only." : "",
      session.currentInput ? `Current observed submission reference: ${session.currentInput}. It is provenance metadata, not an additional request.` : ""].filter(Boolean).join("\n\n");
    const sections: string[] = [];
    const { stores, unavailable } = session.readScopes(ctx);
    for (const { scope, ledger } of stores) {
      const index = routingIndex(ledger) || "No current records. This scope has nothing to recall.";
      sections.push(`## ${scope} memory\n${index}`);
    }
    for (const { scope, reason } of unavailable) sections.push(`${scope} memory unavailable. ${reason}`);
    const complete = [policy, ...sections].join("\n\n");
    if (tokenEstimate(complete) <= responseBudget(ctx)) return complete;
    return `${policy}\n\nMemory inventory/standing preferences could not be admitted in the available context. Coverage is incomplete; use memory_read with complete-unit continuation after making context space. No record or preference was truncated or silently sampled.`;
  }
  pi.on("context_with_system", (event, ctx) => {
    let installed = false;
    return { messages: event.messages.map(message => {
      if (message.role !== "system") return message;
      const sections = { ...message.sections }; delete sections.memory;
      if (!installed) { sections.memory = memoryContext(ctx); installed = true; }
      return { ...message, sections };
    }) };
  });

  pi.registerTool({
    name: "memory_focus", label: "Memory Focus",
    description: "Select the actual Git task repository for default learning and recall. Persists on this session branch. No Git configuration writes. One-off projectPath tools do not change focus.",
    parameters: Type.Object({ projectPath: Type.String() }),
    async execute(_id, params, _signal, _update, ctx) {
      try { const state = session.select(pi, ctx, params.projectPath); return jsonResult({ taskPath: state.taskPath, project: state.locations.project }); }
      catch (error) { return errorResult(error); }
    },
  });
  for (const tool of memoryOperations(session)) pi.registerTool({ ...tool,
    execute: (id, params, signal, _update, ctx) => tool.execute(id, params, signal, ctx),
  });
  pi.registerCommand("memory-migrate", {
    description: "Preview lossless import of legacy Markdown. Add 'apply' to write, or 'all apply' for one host-wide cutover. Originals remain untouched.",
    handler: async (args, ctx) => {
      try {
        assertMemoryMutationPermission(session.runtime(ctx).role);
        const words = args.trim().split(/\s+/).filter(Boolean);
        if (!["", "apply", "all", "all apply"].includes(words.join(" "))) throw new Error("Usage: /memory-migrate [all] [apply]");
        const apply = words.includes("apply");
        const locations = session.runtime(ctx).locations;
        const targets: Array<{ scope: string; dir: string }> = session.scopes(ctx);
        if (words.includes("all")) {
          targets.splice(1);
          const projectsDir = path.join(locations.baseDir, "projects");
          assertSafePath(projectsDir);
          if (fs.existsSync(projectsDir)) for (const name of fs.readdirSync(projectsDir).sort()) {
            if (!/^[a-z0-9][a-z0-9-]*-[0-9a-f]{10}$/.test(name)) continue;
            const dir = path.join(projectsDir, name);
            assertSafePath(dir);
            if (fs.statSync(dir).isDirectory()) targets.push({ scope: name, dir });
          }
        }
        const reports = targets.map(({ scope, dir }) => {
          const imported = migrateLedger(dir, apply);
          return `${scope}: ${imported.alreadyMigrated ? "already migrated" : apply ? "imported" : "preview"}, ${imported.ledger.records.length} records from ${imported.ledger.imports.length} original files.`;
        });
        ctx.ui.notify(reports.join("\n"), "info");
      } catch (error) { ctx.ui.notify(`Memory migration failed: ${String(error)}`, "error"); }
    },
  });
}
