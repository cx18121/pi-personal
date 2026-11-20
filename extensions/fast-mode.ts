import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createFastCapabilities, isFastTier, record, type FastModel } from "../lib/fast-capabilities.js";

const ENTRY = "personal-fast-mode";
const STATUS = "fast-mode";
const ARGS = ["on", "off", "status"];

// Scope opt-in to the provider, transport and model that the user enabled.
const modelKey = (model: FastModel) => JSON.stringify([model.provider, model.api, model.id, model.baseUrl]);

export default function fastMode(pi: ExtensionAPI, capability = createFastCapabilities()) {
	const enabled = new Set<string>();
	let last: { key: string; tier?: string; bypassed?: boolean } | undefined;

	const optIn = (ctx: ExtensionContext) => ctx.model !== undefined && enabled.has(modelKey(ctx.model));
	const getCapability = (ctx: ExtensionContext, model: NonNullable<ExtensionContext["model"]>) =>
		capability(model, ctx.modelRegistry.isUsingOAuth(model));
	const setStatus = (ctx: ExtensionContext, active: boolean) => {
		if (!ctx.hasUI) return;
		const outcome = ctx.model && last?.key === modelKey(ctx.model) ? last : undefined;
		const warning = outcome?.bypassed ? "request set tier" : outcome?.tier && !isFastTier(outcome.tier) ? "fast not used" : undefined;
		ctx.ui.setStatus(STATUS, active ? ctx.ui.theme.fg(warning ? "warning" : "accent", warning ?? "fast") : undefined);
	};
	const refresh = async (ctx: ExtensionContext) => {
		setStatus(ctx, false);
		const model = ctx.model;
		if (model && optIn(ctx)) {
			const supported = "field" in await getCapability(ctx, model);
			if (ctx.model === model && optIn(ctx)) setStatus(ctx, supported);
		}
	};
	const setEnabled = (model: FastModel, value: boolean) => {
		const key = modelKey(model);
		if (value) enabled.add(key);
		else enabled.delete(key);
		pi.appendEntry(ENTRY, { key, enabled: value });
	};
	const restore = (ctx: ExtensionContext) => {
		enabled.clear();
		last = undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== ENTRY) continue;
			const data = record(entry.data);
			// The previous toggle did not record a model. Don't carry over that opt-in.
			if (typeof data?.key !== "string") continue;
			if (data.enabled === true) enabled.add(data.key);
			else if (data.enabled === false) enabled.delete(data.key);
		}
	};

	const command = async (arg: string, ctx: ExtensionContext) => {
		const model = ctx.model;
		if (!model) return ctx.ui.notify("Select a model before using /fast.", "warning");
		const label = `${model.provider}/${model.id}`;
		const active = optIn(ctx);
		if (arg === "off" || (arg === "" && active) || (arg === "status" && !active)) {
			if (active) setEnabled(model, false);
			setStatus(ctx, false);
			return ctx.ui.notify(`Fast mode off for ${label}.`, "info");
		}

		const result = await getCapability(ctx, model);
		if (ctx.model !== model) return;
		if (!("field" in result)) {
			setStatus(ctx, false);
			const why = result.reason === "unavailable" ? "couldn't check provider support" : "this provider doesn't list Fast support";
			return ctx.ui.notify(`Fast mode ${active ? "paused" : "off"} for ${label}: ${why}.`, "warning");
		}

		if (!active) setEnabled(model, true);
		setStatus(ctx, true);
		const outcome = last?.key === modelKey(model) ? last : undefined;
		const note = outcome?.bypassed ? " The last request already set its own tier; /fast left it unchanged."
			: outcome?.tier ? ` Last response reported: ${outcome.tier}.`
			: outcome ? " Fast was requested; the provider didn't confirm the tier." : "";
		const billing = model.provider === "openai-codex" ? "Increased ChatGPT usage applies." : "Premium rates apply.";
		ctx.ui.notify(`Fast mode on for ${label}. ${billing}${arg === "status" ? note : ""}`, "info");
	};

	pi.registerFlag("fast", { description: "Request Fast mode for the starting model (premium usage)", type: "boolean", default: false });
	pi.registerCommand("fast", {
		description: "Toggle Fast mode for the current model (on|off|status)",
		getArgumentCompletions: (prefix) => ARGS.filter((arg) => arg.startsWith(prefix)).map((arg) => ({ value: arg, label: arg })),
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			if (arg && !ARGS.includes(arg)) return ctx.ui.notify("Usage: /fast [on|off|status]", "warning");
			await command(arg, ctx);
		},
	});

	pi.on("session_start", async (event, ctx) => {
		restore(ctx);
		if (event.reason === "startup" && pi.getFlag("fast") === true) await command("on", ctx);
		else await refresh(ctx);
	});
	pi.on("session_tree", async (_event, ctx) => { restore(ctx); await refresh(ctx); });
	pi.on("session_shutdown", (_event, ctx) => setStatus(ctx, false));
	pi.on("model_select", (_event, ctx) => refresh(ctx));

	pi.on("before_provider_request", async (event, ctx) => {
		last = undefined;
		const model = ctx.model;
		const payload = record(event.payload);
		if (!model || !optIn(ctx) || payload?.model !== model.id) return;
		const result = await getCapability(ctx, model);
		if (ctx.model !== model || !optIn(ctx)) return;
		if (!("field" in result)) return setStatus(ctx, false);
		const bypassed = "service_tier" in payload || (result.field === "speed" && "speed" in payload);
		last = { key: modelKey(model), bypassed };
		setStatus(ctx, true);
		if (!bypassed) return { ...payload, [result.field]: result.value };
	});

	pi.on("provider_stream_event", (event, ctx) => {
		const model = ctx.model;
		if (!last || last.bypassed || !model || last.key !== modelKey(model)
			|| event.provider !== model.provider || event.api !== model.api || event.model !== model.id) return;
		const data = record(event.data);
		const response = record(data?.response);
		const tier = model.provider === "anthropic"
			? record(data?.usage)?.speed ?? record(record(data?.message)?.usage)?.speed
			: response?.service_tier ?? data?.service_tier;
		if (typeof tier === "string" && tier !== last.tier) {
			last.tier = tier;
			setStatus(ctx, optIn(ctx));
		}
	});

	// Preserve the original extension's Opus 5.5 cost display when Anthropic confirms Fast.
	// Don't apply that model's multiplier to other Claude models or to OpenAI's own accounting.
	pi.on("message_end", (event, ctx) => {
		const { message } = event;
		if (message.role !== "assistant" || message.provider !== "anthropic" || message.model !== "claude-opus-5-5"
			|| !ctx.model || last?.key !== modelKey(ctx.model) || !isFastTier(last?.tier)) return;
		const cost = message.usage.cost;
		return { message: { ...message, usage: { ...message.usage, cost: {
			input: cost.input * 2, output: cost.output * 2, cacheRead: cost.cacheRead * 2,
			cacheWrite: cost.cacheWrite * 2, total: cost.total * 2,
		} } } };
	});
}
