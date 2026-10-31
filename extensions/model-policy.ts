import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { modelPolicy } from "../lib/model-policy.js";
import type { ModelPolicy } from "../lib/model-settings.mjs";

const HEALTHY_RECHECK_MS = 12 * 60 * 60 * 1000;
const FAILED_RECHECK_MS = 60 * 60 * 1000;
type CheckCache = Record<string, { ok: boolean; at: number }>;

/**
 * Child agents fail late when a provider's credentials are missing or invalid:
 * the parent pays for a spawn and waits for the error. Probe each enabled
 * provider with one tiny request, at most twice a day while it stays healthy
 * and at most hourly while it fails, so a failure warns once per hour.
 */
export async function checkProviders(
  ctx: ExtensionContext,
  policy: ModelPolicy,
  cacheFile = join(getAgentDir(), "cache", "provider-check.json"),
  request: typeof completeSimple = completeSimple,
) {
  let cache: CheckCache = {};
  try { cache = JSON.parse(readFileSync(cacheFile, "utf8")); } catch { /* first run */ }
  const cheapest = new Map<string, ExtensionContext["scopedModels"][number]["model"]>();
  for (const { model } of ctx.scopedModels) {
    if (policy.disabledProviders?.includes(model.provider)) continue;
    const current = cheapest.get(model.provider);
    if (!current || model.cost.input < current.cost.input) cheapest.set(model.provider, model);
  }
  const now = Date.now();
  await Promise.all([...cheapest].map(async ([provider, model]) => {
    const last = cache[provider];
    if (last && now - last.at < (last.ok ? HEALTHY_RECHECK_MS : FAILED_RECHECK_MS)) return;
    let failure: string | undefined;
    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok) failure = auth.error;
      else {
        const response = await request(auth.baseUrl ? { ...model, baseUrl: auth.baseUrl } : model, {
          messages: [{ role: "user", content: [{ type: "text", text: "Reply with ok." }], timestamp: now }],
        }, { apiKey: auth.apiKey, headers: auth.headers, env: auth.env, signal: AbortSignal.timeout(30_000), reasoning: "low", maxTokens: 200 });
        if (response.stopReason === "error") failure = response.errorMessage ?? "request failed";
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    cache[provider] = { ok: !failure, at: now };
    if (failure) ctx.ui.notify(`${provider} is unavailable for agents: ${failure.slice(0, 160)}. Run /login, or remove its models from enabledModels.`, "warning");
  }));
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`);
}

const entryType = "cx-child-provider";
const taskKey = (name: string) => name.replace(/^\/+/, "");

export default function (pi: ExtensionAPI, readPolicy = modelPolicy, probe: (ctx: ExtensionContext, policy: ModelPolicy) => Promise<void> = checkProviders) {
  const children = new Map<string, string>();
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui") void probe(ctx, readPolicy()).catch(() => { /* a failed probe must not affect startup */ });
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
