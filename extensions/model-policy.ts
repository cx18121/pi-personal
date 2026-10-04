import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { modelPolicy } from "../lib/model-policy.js";

const entryType = "cx-child-provider";
const taskKey = (name: string) => name.replace(/^\/+/, "");

export default function (pi: ExtensionAPI, readPolicy = modelPolicy) {
  const children = new Map<string, string>();
  pi.on("session_start", (_event, ctx) => {
    children.clear();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type !== "custom" || entry.customType !== entryType) continue;
      const data = entry.data as { task?: string; provider?: string };
      if (data.task && data.provider) children.set(data.task, data.provider);
    }
  });
  pi.on("before_agent_start", (event, ctx) => {
    const policy = readPolicy();
    const available = ctx.scopedModels
      .map(({ model }) => model)
      .filter((model) => !policy.disabledProviders?.includes(model.provider))
      .map((model) => `${model.provider}/${model.id}`);
    const roles = { review: policy.overrides?.review, implementation: policy.overrides?.implementation };
    event.systemPromptOptions.sections.model_policy = `Automatic model policy comes from ~/.pi/agent/settings.json (cxModels). Never change the main session model automatically. Disabled automatic providers: ${policy.disabledProviders?.join(", ") || "none"}. Allowed scoped child choices: ${available.join(", ") || "none configured"}. Ordered role preferences (session means the current model): ${JSON.stringify(roles)}. Use an available permitted choice; report fallback substitutions. Prefer a different family for independent reviews when available, otherwise use fresh same-family context and disclose the limitation. This does not satisfy an explicitly cross-family experiment.`;
  });
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "spawn_agent" && event.toolName !== "send_message") return;
    const disabled = readPolicy().disabledProviders ?? [];
    if (!disabled.length) return;
    const input = event.input as Record<string, unknown>;
    let provider: string | undefined;
    if (event.toolName === "send_message") {
      provider = typeof input.target === "string" ? children.get(taskKey(input.target)) : undefined;
    } else if (typeof input.model === "string") {
      provider = input.model.split("/")[0];
    } else if (!input.agent_type) {
      provider = ctx.model?.provider;
    }
    if (!provider || disabled.includes(provider)) return {
      block: true,
      reason: provider ? `${provider} is disabled for automatic work in cxModels. Choose a permitted configured fallback.`
        : "Cannot establish this child's provider while automatic providers are disabled. Spawn a new child with an explicit permitted model instead.",
    };
  });
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "spawn_agent" || event.isError) return;
    const input = event.input as Record<string, unknown>;
    const provider = typeof input.model === "string" ? input.model.split("/")[0]
      : input.agent_type ? undefined : ctx.model?.provider;
    if (typeof input.task_name !== "string" || !provider) return;
    const task = taskKey(input.task_name);
    children.set(task, provider);
    pi.appendEntry(entryType, { task, provider });
  });
}
