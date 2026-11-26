import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { modelPolicy } from "../lib/model-policy.js";
import type { ModelPolicy } from "../lib/model-settings.mjs";

const HEALTHY_RECHECK_MS = 12 * 60 * 60 * 1000;
const FAILED_RECHECK_MS = 60 * 60 * 1000;
type CheckCache = Record<string, { ok: boolean; at: number }>;

const HARD_OUTAGE_PATTERNS: Array<[RegExp, string]> = [
  [/reached your specified api usage limits|usage limit|insufficient_quota|exceeded your current quota|credit balance is too low|billing/i, "quota or billing limit exceeded"],
  [/invalid_api_key|authentication_error|invalid x-api-key|\b401\b.*(?:unauthorized|invalid|auth)/i, "authentication failed"],
];

/** Returns a short outage reason for hard quota/billing/auth failures, or undefined for transient errors. */
export function detectProviderOutage(errorText: string | undefined): string | undefined {
  if (!errorText) return undefined;
  for (const [pattern, label] of HARD_OUTAGE_PATTERNS) {
    if (pattern.test(errorText)) return label;
  }
  return undefined;
}

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
  onOutage?: (provider: string, reason: string) => void,
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
    if (failure) {
      const outage = detectProviderOutage(failure);
      if (outage) onOutage?.(provider, outage);
      ctx.ui.notify(`${provider} is unavailable for agents: ${failure.slice(0, 160)}. Run /login, or remove its models from enabledModels.`, "warning");
    }
  }));
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`);
}

const entryType = "cx-child-provider";
const taskKey = (name: string) => name.replace(/^\/+/, "");

const textFromContent = (content: unknown): string =>
  typeof content === "string" ? content
    : Array.isArray(content)
      ? content.map((part) => (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "")).join("\n")
      : "";

export default function (
  pi: ExtensionAPI,
  readPolicy = modelPolicy,
  probe: (ctx: ExtensionContext, policy: ModelPolicy, onOutage?: (provider: string, reason: string) => void) => Promise<void> =
    (ctx, policy, onOutage) => checkProviders(ctx, policy, undefined, undefined, onOutage),
) {
  const children = new Map<string, string>();
  const quarantined = new Map<string, string>();

  const quarantine = (provider: string | undefined, reason: string | undefined, ctx?: ExtensionContext) => {
    if (!provider || !reason || quarantined.has(provider)) return;
    quarantined.set(provider, reason);
    ctx?.ui?.notify?.(`Quarantined ${provider} for child agents in this session (${reason}). Use another configured provider.`, "warning");
  };

  const effectiveDisabled = (policy: ModelPolicy) =>
    [...new Set([...(policy.disabledProviders ?? []), ...quarantined.keys()])];

  pi.on("session_start", (_event, ctx) => {
    quarantined.clear();
    if (ctx.mode === "tui") {
      void probe(ctx, readPolicy(), (provider, reason) => quarantine(provider, reason, ctx))
        .catch(() => { /* a failed probe must not affect startup */ });
    }
    children.clear();
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type !== "custom" || entry.customType !== entryType) continue;
      const data = entry.data as { task?: string; provider?: string };
      if (data.task && data.provider) children.set(data.task, data.provider);
    }
  });

  pi.on("message_end", (event, ctx) => {
    const message = event.message as { role?: string; provider?: string; stopReason?: string; errorMessage?: string; customType?: string; content?: unknown; details?: Record<string, unknown> };
    if (message.role === "assistant" && message.stopReason === "error") {
      quarantine(message.provider, detectProviderOutage(message.errorMessage), ctx);
      return;
    }
    if (message.customType === "pi-codex-subagent-completion") {
      const raw = textFromContent(message.content)
        .replace(/^\s*<subagent_notification>\s*/i, "")
        .replace(/\s*<\/subagent_notification>\s*$/i, "")
        .trim();
      let parsed: Record<string, unknown> | undefined;
      try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
      if (parsed?.status !== "failed") return;
      const errorText = typeof parsed.error === "string" ? parsed.error : undefined;
      const outage = detectProviderOutage(errorText);
      if (!outage) return;
      const explicitProvider = typeof parsed.provider === "string"
        ? parsed.provider
        : typeof message.details?.provider === "string"
          ? message.details.provider
          : undefined;
      const modelProvider = typeof parsed.model === "string" && parsed.model.includes("/")
        ? parsed.model.split("/")[0]
        : typeof parsed.model === "string" && parsed.model.includes(":")
          ? parsed.model.split(":")[0]
          : undefined;
      const task = typeof parsed.agent_name === "string"
        ? parsed.agent_name
        : typeof parsed.task_name === "string"
          ? parsed.task_name
          : typeof message.details?.agent_name === "string"
            ? message.details.agent_name
            : undefined;
      const provider = explicitProvider ?? modelProvider ?? (task ? children.get(taskKey(task)) : undefined);
      quarantine(provider, outage, ctx);
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    const policy = readPolicy();
    const disabled = effectiveDisabled(policy);
    const available = ctx.scopedModels
      .map(({ model }) => model)
      .filter((model) => !disabled.includes(model.provider))
      .map((model) => `${model.provider}/${model.id}`);
    const roles = { review: policy.overrides?.review, implementation: policy.overrides?.implementation };
    const quarantinedNote = quarantined.size
      ? ` Session-quarantined providers: ${[...quarantined].map(([p, r]) => `${p} (${r})`).join(", ")}.`
      : "";
    event.systemPromptOptions.sections.model_policy = `Automatic model policy comes from ~/.pi/agent/settings.json (cxModels). Never change the main session model automatically. Disabled automatic providers: ${disabled.join(", ") || "none"}.${quarantinedNote} Allowed scoped child choices: ${available.join(", ") || "none configured"}. Ordered role preferences (session means the current model): ${JSON.stringify(roles)}. Use an available permitted choice; report fallback substitutions. Prefer a different family for independent reviews when available, otherwise use fresh same-family context and disclose the limitation. This does not satisfy an explicitly cross-family experiment.`;
  });

  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "spawn_agent" && event.toolName !== "send_message") return;
    const disabled = effectiveDisabled(readPolicy());
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
    if (!provider || disabled.includes(provider)) {
      const reason = provider && quarantined.has(provider)
        ? `${provider} is quarantined in this session (${quarantined.get(provider)}). Choose a permitted configured fallback.`
        : provider
          ? `${provider} is disabled for automatic work in cxModels. Choose a permitted configured fallback.`
          : "Cannot establish this child's provider while automatic providers are disabled. Spawn a new child with an explicit permitted model instead.";
      return { block: true, reason };
    }
  });

  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "spawn_agent" && event.toolName !== "send_message") return;
    const input = event.input as Record<string, unknown>;
    const provider = event.toolName === "send_message"
      ? (typeof input.target === "string" ? children.get(taskKey(input.target)) : undefined)
      : typeof input.model === "string" ? input.model.split("/")[0]
        : input.agent_type ? undefined : ctx.model?.provider;
    if (event.isError) {
      quarantine(provider, detectProviderOutage(textFromContent(event.content)), ctx);
      return;
    }
    if (event.toolName === "spawn_agent" && typeof input.task_name === "string" && provider) {
      const task = taskKey(input.task_name);
      children.set(task, provider);
      pi.appendEntry(entryType, { task, provider });
    }
  });
}
