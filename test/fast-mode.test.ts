import { expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fastMode from "../extensions/fast-mode.ts";
import { createFastCapabilities, type FastModel } from "../lib/fast-capabilities.ts";

const sol = { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6.2-sol", baseUrl: "https://chatgpt.com/backend-api" };
const opus = { provider: "anthropic", api: "anthropic-messages", id: "claude-opus-5-5", baseUrl: "https://api.anthropic.com" };
const router = { provider: "openrouter", api: "openai-completions", id: "openai/gpt-6.2-sol", baseUrl: "https://openrouter.ai/api/v1" };
const api = { provider: "openai", api: "openai-responses", id: "gpt-future-api", baseUrl: "https://api.openai.com/v1" };
const lookup = async (url: string) => {
	if (url.includes("raw.githubusercontent.com")) return Response.json({ models: [
		{ slug: sol.id, service_tiers: [{ id: "priority" }, { id: "ultrafast" }] },
		{ slug: "gpt-future", service_tiers: [{ id: "fast" }] },
		{ slug: "gpt-standard-only", service_tiers: [{ id: "ultrafast" }] },
	] });
	if (url.includes("openrouter.ai")) return Response.json({ data: { endpoints: [{ service_tier: "priority" }] } });
	if (url.includes("developers.openai.com")) return new Response(`### Standard pricing data
| gpt-standard-only | $1.00 |
### Fast pricing data
| Model | Input |
| --- | --- |
| gpt-future-api | $1.00 |
### Ultrafast pricing data
| gpt-ultra-only | $1.00 |`);
	if (url.includes("platform.claude.com")) return new Response(`#### [Messages API](https://platform.claude.com/docs/en/build-with-claude/working-with-messages)
| Status | Cloud platforms | Models |
| --- | --- | --- |
| Available | Claude API, Google Cloud | [Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/overview), [Claude Future](https://platform.claude.com/docs/en/models/future/overview) |
| Research preview | Claude API | [Claude Preview](https://platform.claude.com/docs/en/models/preview/overview) |
| Available | Microsoft Foundry | [Claude Foundry](https://platform.claude.com/docs/en/models/foundry/overview) |
#### [Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview)
| Available | Claude API | [Claude Managed](https://platform.claude.com/docs/en/models/managed/overview) |`);
	return new Response(null, { status: 404 });
};

test("discovers exact Fast support for future model IDs without accepting other tiers or transports", async () => {
	const calls: string[] = [];
	const check = createFastCapabilities(async (url) => { calls.push(String(url)); return lookup(String(url)); });
	expect(await check(sol, true)).toEqual({ field: "service_tier", value: "priority" });
	expect(await check({ ...sol, id: "gpt-future" }, true)).toEqual({ field: "service_tier", value: "fast" });
	expect(await check({ ...sol, id: "gpt-standard-only" }, true)).toEqual({ reason: "unsupported" });
	expect(await check(sol, false)).toEqual({ reason: "unsupported" });
	expect(await check({ ...sol, baseUrl: "https://custom.example.com" }, true)).toEqual({ reason: "unsupported" });
	expect(calls).toHaveLength(1);
	expect(await check(api, false)).toEqual({ field: "service_tier", value: "priority" });
	expect(await check({ ...api, id: "gpt-ultra-only" }, false)).toEqual({ reason: "unsupported" });
	expect(await check(router, true)).toEqual({ field: "service_tier", value: "priority" });
	expect(await check({ ...opus, id: "claude-future" }, false)).toEqual({ field: "speed", value: "fast" });
	for (const id of ["claude-preview", "claude-foundry", "claude-managed"]) {
		expect(await check({ ...opus, id }, false)).toEqual({ reason: "unsupported" });
	}
});

function harness(model: FastModel, fetchMetadata = lookup, flag = false) {
	const hooks = new Map<string, (...args: any[]) => any>();
	const entries: unknown[] = [];
	const notifications: string[] = [];
	const statuses = new Map<string, string | undefined>();
	const ctx = {
		model, hasUI: true,
		sessionManager: { getBranch: () => entries },
		modelRegistry: { isUsingOAuth: (model: FastModel) => model.provider === "openai-codex" || model.provider === "openrouter" },
		ui: { notify: (message: string) => notifications.push(message), theme: { fg: (_: string, text: string) => text },
			setStatus: (key: string, value: string | undefined) => statuses.set(key, value) },
	};
	const emit = (name: string, event: object) => hooks.get(name)!(event, ctx);
	const pi = {
		on: (name: string, handler: (...args: any[]) => any) => hooks.set(name, handler),
		registerCommand: (name: string, spec: {handler: (...args: any[]) => any}) => hooks.set(`/${name}`, spec.handler),
		registerFlag() {}, getFlag: () => flag,
		appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
	} as unknown as ExtensionAPI;
	fastMode(pi, createFastCapabilities((url) => fetchMetadata(String(url))));
	return { ctx, emit, entries, notifications, statuses, request: (payload: object = { model: ctx.model.id }) => emit("before_provider_request", { payload }),
		command: (arg: string) => hooks.get("/fast")!(arg, ctx) };
}

test("one toggle writes only the current model's field after opt-in and reports provider confirmation", async () => {
	const { ctx, command, emit, request, notifications, statuses } = harness(sol);
	expect(await request()).toBeUndefined();
	await command("status");
	expect(notifications.at(-1)).toContain("off");
	await command("on");
	expect(await request()).toEqual({ model: sol.id, service_tier: "priority" });
	emit("provider_stream_event", { provider: sol.provider, api: sol.api, model: sol.id, data: { response: { service_tier: "default" } } });
	await command("status");
	expect(notifications.at(-1)).toContain("Last response reported: default");
	expect(statuses.get("fast-mode")).toBe("fast not used");
	expect(await request({ model: sol.id, service_tier: "priority" })).toBeUndefined();
	expect(statuses.get("fast-mode")).toBe("request set tier");
	await command("status");
	expect(notifications.at(-1)).toContain("left it unchanged");
	expect(await request({ model: "other-model" })).toBeUndefined();
	ctx.model = opus;
	await emit("model_select", {});
	expect(await request()).toBeUndefined();
	await command("");
	expect(await request()).toEqual({ model: opus.id, speed: "fast" });
	expect(await request({ model: opus.id, service_tier: "standard_only" })).toBeUndefined();
	await command("off");
	expect(await request()).toBeUndefined();
	ctx.model = sol;
	await emit("model_select", {});
	expect(await request()).toEqual({ model: sol.id, service_tier: "priority" });
});

test("reload restores scoped opt-in without restoring the old unscoped toggle or replaying --fast", async () => {
	const { emit, entries, command, request } = harness(sol, lookup, true);
	entries.push({ type: "custom", customType: "personal-fast-mode", data: { enabled: true } });
	await emit("session_start", { reason: "reload" });
	expect(await request()).toBeUndefined();
	await emit("session_start", { reason: "startup" });
	expect(await request()).toEqual({ model: sol.id, service_tier: "priority" });
	await emit("session_start", { reason: "reload" });
	expect(await request()).toEqual({ model: sol.id, service_tier: "priority" });
	await command("off");
	await emit("session_start", { reason: "reload" });
	expect(await request()).toBeUndefined();
});

test("an unavailable capability source never opts in or changes a standard request", async () => {
	let lookups = 0;
	const { command, request, entries, notifications } = harness(sol, async () => {
		lookups++;
		return Response.json({ changed_schema: true });
	});
	await command("status");
	await request();
	expect(lookups).toBe(0);
	await command("on");
	expect(notifications.at(-1)).toContain("couldn't check provider support");
	expect(entries).toHaveLength(0);
	expect(await request()).toBeUndefined();
	expect(lookups).toBe(1);
});
