import { join } from "node:path";
import type { Context } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai/compat";
import { getAgentDir, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readModelPolicy, type ModelPolicy } from "./model-settings.mjs";

export const modelPolicy = () => readModelPolicy(join(getAgentDir(), "settings.json"));

/** A nested call may try only the explicitly configured ordered candidates. */
export async function completeHelper(
  task: "corrections" | "answer",
  ctx: ExtensionContext,
  context: Context,
  signal: AbortSignal,
  dependencies: { policy?: ModelPolicy; request?: typeof complete } = {},
) {
  const policy = dependencies.policy ?? modelPolicy();
  const candidates = policy.overrides?.[task] ?? policy.helpers ?? ["session"];
  const request = dependencies.request ?? complete;
  const failures: string[] = [];
  const tried = new Set<string>();
  for (const candidate of candidates) {
    signal.throwIfAborted();
    const slash = candidate.indexOf("/");
    const model = candidate === "session" ? ctx.model
      : ctx.modelRegistry.find(candidate.slice(0, slash), candidate.slice(slash + 1));
    if (!model) {
      failures.push(`${candidate}: model not available`);
      continue;
    }
    const pair = `${model.provider}/${model.id}`;
    if (tried.has(pair)) continue;
    tried.add(pair);
    if (policy.disabledProviders?.includes(model.provider)) {
      failures.push(`${pair}: provider disabled for automatic work`);
      continue;
    }
    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      signal.throwIfAborted();
      if (!auth.ok) throw new Error(auth.error);
      const response = await request(auth.baseUrl ? { ...model, baseUrl: auth.baseUrl } : model, context, {
        apiKey: auth.apiKey, headers: auth.headers, env: auth.env, signal,
      });
      signal.throwIfAborted();
      if (response.stopReason === "aborted") throw new DOMException("Helper cancelled", "AbortError");
      if (response.stopReason === "error") throw new Error(response.errorMessage ?? "Provider request failed");
      if (failures.length && ctx.hasUI) ctx.ui.notify(`${task} used fallback ${pair}. ${failures.join("; ")}`, "warning");
      return response;
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
      failures.push(`${pair}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`${task}: no configured model succeeded. ${failures.join("; ")}. Edit cxModels in ~/.pi/agent/settings.json.`);
}
