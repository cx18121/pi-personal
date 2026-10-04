import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { autoCaptureEnabled } from "./core.js";
import { routingIndex } from "./ledger.js";
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
}
