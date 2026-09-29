import { describe, expect, test } from "bun:test";
import { completeHelper } from "../lib/model-policy.ts";
import { parseModelPolicy } from "../lib/model-settings.mjs";
import extension from "../extensions/model-policy.ts";

const primary = { provider: "openai-codex", id: "primary" };
const alternate = { provider: "anthropic", id: "alternate" };
const content = { messages: [] };
const ok = { stopReason: "stop", content: [{ type: "text", text: "[]" }] };
function harness() {
  const calls: string[] = [];
  const notices: string[] = [];
  const ctx = {
    model: primary, hasUI: true,
    scopedModels: [primary, alternate].map((model) => ({ model })),
    ui: { notify: (text: string) => notices.push(text) },
    sessionManager: { getEntries: () => [] },
    modelRegistry: {
      find: (provider: string, id: string) => [primary, alternate].find((m) => m.provider === provider && m.id === id),
      getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test", headers: {} }),
    },
  };
  const request = async (model: typeof primary) => { calls.push(`${model.provider}/${model.id}`); return ok; };
  return { ctx, request, calls, notices };
}

describe("shared helper policy", () => {
  test("defaults to the session without catalog selection", async () => {
    const h = harness();
    await completeHelper("corrections", h.ctx as never, content, new AbortController().signal, { policy: {}, request: h.request as never });
    expect(h.calls).toEqual(["openai-codex/primary"]);
  });
  test("feature override replaces helper defaults", async () => {
    const h = harness();
    await completeHelper("answer", h.ctx as never, content, new AbortController().signal, {
      policy: { helpers: ["session"], overrides: { answer: ["anthropic/alternate"] } }, request: h.request as never,
    });
    expect(h.calls).toEqual(["anthropic/alternate"]);
  });
  test("disabled providers are skipped, not called", async () => {
    const h = harness();
    await completeHelper("answer", h.ctx as never, content, new AbortController().signal, {
      policy: { disabledProviders: ["anthropic"], helpers: ["anthropic/alternate", "session"] }, request: h.request as never,
    });
    expect(h.calls).toEqual(["openai-codex/primary"]);
    expect(h.notices[0]).toContain("fallback openai-codex/primary");
  });
  test("quota errors advance only through explicit candidates", async () => {
    const h = harness();
    const request = async (model) => {
      h.calls.push(model.provider);
      return model === primary ? { stopReason: "error", errorMessage: "quota exhausted" } : ok;
    };
    await completeHelper("corrections", h.ctx as never, content, new AbortController().signal, {
      policy: { helpers: ["session", "anthropic/alternate"] }, request: request as never,
    });
    expect(h.calls).toEqual(["openai-codex", "anthropic"]);
    expect(h.notices[0]).toContain("quota exhausted");
  });
  test("exhaustion fails without implicit fallback", async () => {
    const h = harness();
    await expect(completeHelper("answer", h.ctx as never, content, new AbortController().signal, {
      policy: { disabledProviders: ["openai-codex"] }, request: h.request as never,
    })).rejects.toThrow("no configured model succeeded");
    expect(h.calls).toEqual([]);
  });
  test("missing models and missing auth use the configured fallback", async () => {
    const h = harness();
    h.ctx.modelRegistry.getApiKeyAndHeaders = async (model) => model === alternate
      ? { ok: false, error: "no auth" } : { ok: true, apiKey: "test" };
    await completeHelper("answer", h.ctx as never, content, new AbortController().signal, {
      policy: { helpers: ["missing/model", "anthropic/alternate", "session"] }, request: h.request as never,
    });
    expect(h.calls).toEqual(["openai-codex/primary"]);
    expect(h.notices[0]).toContain("no auth");
  });
  test("cancellation never advances to another model", async () => {
    const h = harness();
    await expect(completeHelper("answer", h.ctx as never, content, new AbortController().signal, {
      policy: { helpers: ["session", "anthropic/alternate"] },
      request: (async () => { h.calls.push("cancelled"); return { stopReason: "aborted" }; }) as never,
    })).rejects.toThrow("cancelled");
    expect(h.calls).toEqual(["cancelled"]);
  });
  test("cancellation during auth prevents starting a provider request", async () => {
    const h = harness();
    const controller = new AbortController();
    h.ctx.modelRegistry.getApiKeyAndHeaders = async () => {
      controller.abort();
      return { ok: true, apiKey: "test", headers: {} };
    };
    await expect(completeHelper("answer", h.ctx as never, content, controller.signal, {
      policy: {}, request: h.request as never,
    })).rejects.toThrow();
    expect(h.calls).toEqual([]);
  });
  test("cancellation racing with a successful response discards it", async () => {
    const h = harness();
    const controller = new AbortController();
    await expect(completeHelper("answer", h.ctx as never, content, controller.signal, {
      policy: { helpers: ["session", "anthropic/alternate"] },
      request: (async () => { h.calls.push("one request"); controller.abort(); return ok; }) as never,
    })).rejects.toThrow();
    expect(h.calls).toEqual(["one request"]);
  });
  test("passes provider-resolved environment, headers and endpoint", async () => {
    const h = harness();
    h.ctx.modelRegistry.getApiKeyAndHeaders = async () => ({
      ok: true, apiKey: "test", headers: { custom: "header" }, env: { SMOKE: "value" }, baseUrl: "http://127.0.0.1:9",
    });
    await completeHelper("answer", h.ctx as never, content, new AbortController().signal, {
      policy: {}, request: (async (model, _context, options) => {
        expect(model.baseUrl).toBe("http://127.0.0.1:9");
        expect(options.env).toEqual({ SMOKE: "value" });
        expect(options.headers).toEqual({ custom: "header" });
        return ok;
      }) as never,
    });
  });
  test("malformed policy and misspelled overrides fail visibly", () => {
    expect(() => parseModelPolicy({ helpers: [] })).toThrow("nonempty");
    expect(() => parseModelPolicy({ helpers: ["bare-model"] })).toThrow("provider/model");
    expect(() => parseModelPolicy({ overrides: { typo: ["session"] } })).toThrow("Unknown");
    expect(() => parseModelPolicy({ typo: [] })).toThrow("Unknown");
    expect(() => parseModelPolicy({ disabledProviders: ["anthropic "] })).toThrow("provider names");
    expect(() => parseModelPolicy({ disabledProviders: ["openai-codex/model"] })).toThrow("provider names");
    expect(parseModelPolicy(undefined)).toEqual({});
  });
});

describe("automatic child guard", () => {
  test("blocks excluded spawns and resumptions without changing the main model", async () => {
    const h = harness();
    const handlers = new Map();
    const entries: unknown[] = [];
    extension({ on: (name, handler) => handlers.set(name, handler), appendEntry: (type, data) => entries.push({ type, data }) } as never,
      () => ({ disabledProviders: ["anthropic"] }));
    const call = (toolName, input) => handlers.get("tool_call")({ toolName, input }, h.ctx);
    expect(call("spawn_agent", { model: "anthropic/alternate" }).block).toBe(true);
    expect(call("spawn_agent", { task_name: "child", model: "openai-codex/primary" })).toBeUndefined();
    expect(call("spawn_agent", { agent_type: "unknown" }).block).toBe(true);
    expect(call("send_message", { target: "unrecorded" }).block).toBe(true);
    await handlers.get("tool_result")({ toolName: "spawn_agent", input: { task_name: "child", model: "openai-codex/primary" } }, h.ctx);
    expect(call("send_message", { target: "/child" })).toBeUndefined();
    expect(entries).toHaveLength(1);
    expect(h.ctx.model).toBe(primary);
    const prompt = handlers.get("before_agent_start")({ systemPrompt: "base" }, h.ctx).systemPrompt;
    expect(prompt).toContain("Allowed scoped child choices: openai-codex/primary.");
  });
});
