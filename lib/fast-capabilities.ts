// Use public provider metadata. No credentials or conversation data are sent.
const CODEX_CATALOG = "https://raw.githubusercontent.com/openai/codex/main/codex-rs/models-manager/models.json";
const OPENAI_PRICING = "https://developers.openai.com/api/docs/pricing.md";
const CLAUDE_FAST_DOCS = "https://platform.claude.com/docs/en/build-with-claude/fast-mode.md";
const CACHE_MS = 30 * 60_000;
const FAILURE_CACHE_MS = 15_000;

export const record = (value: unknown): Record<string, unknown> | undefined =>
	typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

type FastTier = "priority" | "fast";
export const isFastTier = (tier: unknown): tier is FastTier => tier === "priority" || tier === "fast";
type FastModels = Map<string, FastTier>;

function codexFastModels(data: unknown): FastModels {
	const models = record(data)?.models;
	if (!Array.isArray(models) || models.length === 0) throw new Error("Missing Codex model catalog");
	const supported = new Map<string, FastTier>();
	for (const value of models as unknown[]) {
		const model = record(value);
		if (typeof model?.slug !== "string") continue;
		const tiers = model.service_tiers;
		const legacy = model.additional_speed_tiers;
		const tier = Array.isArray(tiers)
			? tiers.map((entry: unknown) => record(entry)?.id).find(isFastTier)
			: Array.isArray(legacy) && legacy.includes("fast") ? "priority" : undefined;
		if (tier) supported.set(model.slug, tier);
	}
	return supported;
}

function markdownSection(text: string, heading: RegExp, boundary: RegExp): string {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => heading.test(line));
	if (start === -1) throw new Error("Missing Fast mode section");
	const end = lines.findIndex((line, index) => index > start && boundary.test(line));
	return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

// These providers don't expose a public API field for Fast support. Read only
// the relevant tables, not model mentions elsewhere in the docs.
function openAiFastModels(text: string): FastModels {
	const section = markdownSection(text, /^### Fast pricing data\s*$/, /^#{1,3} /);
	const ids = Array.from(section.matchAll(/^\|\s*([a-z\d][a-z\d.-]+)(?:\s+\([^|]*\))?\s*\|\s*\$/gm), (match) => match[1]);
	if (ids.length === 0) throw new Error("Missing OpenAI Fast pricing table");
	return new Map(ids.map((id) => [id, "priority"]));
}

function claudeFastModels(text: string): FastModels {
	const section = markdownSection(text, /^#### \[Messages API\]/, /^#{1,4} /);
	const models = new Map<string, FastTier>();
	for (const line of section.split("\n")) {
		const [, status, platforms, modelLinks] = line.split("|").map((cell) => cell.trim());
		// Exclude beta/deprecated models that require a separate header, and deployments that use a different API.
		if (status !== "Available" || !platforms?.split(",").some((platform) => platform.trim() === "Claude API")) continue;
		for (const match of modelLinks?.matchAll(/\/docs\/en\/models\/([a-z\d-]+)\/overview\)/g) ?? []) {
			models.set(`claude-${match[1]}`, "fast");
		}
	}
	if (models.size === 0) throw new Error("Missing Claude Messages API Fast availability table");
	return models;
}

export type FastModel = { provider: string; api: string; id: string; baseUrl: string };
type RequestField = "speed" | "service_tier";
type Lookup = { url: string; field: RequestField; parse: (res: Response) => Promise<FastModels> };

function lookupFor(model: FastModel, oauth: boolean): Lookup | undefined {
	let origin: string;
	try { origin = new URL(model.baseUrl).origin; } catch { return; }
	if (model.provider === "openai-codex" && model.api === "openai-codex-responses" && oauth && origin === "https://chatgpt.com") {
		return { url: CODEX_CATALOG, field: "service_tier", parse: async (res) => codexFastModels(await res.json()) };
	}
	if (model.provider === "openai" && model.api === "openai-responses" && origin === "https://api.openai.com") {
		return { url: OPENAI_PRICING, field: "service_tier", parse: async (res) => openAiFastModels(await res.text()) };
	}
	if (model.provider === "anthropic" && model.api === "anthropic-messages" && !oauth && origin === "https://api.anthropic.com") {
		return { url: CLAUDE_FAST_DOCS, field: "speed", parse: async (res) => claudeFastModels(await res.text()) };
	}
	if (model.provider === "openrouter" && model.api === "openai-completions" && origin === "https://openrouter.ai"
		&& /^[\w.-]+\/[\w.-]+$/.test(model.id)) {
		const id = model.id;
		return {
			url: `https://openrouter.ai/api/v1/models/${id}/endpoints`, field: "service_tier",
			parse: async (res) => {
				const endpoints = record(record(await res.json())?.data)?.endpoints;
				if (!Array.isArray(endpoints)) throw new Error("Missing OpenRouter model endpoints");
				return new Map(endpoints.some((endpoint: unknown) => isFastTier(record(endpoint)?.service_tier)) ? [[id, "priority"]] : []);
			},
		};
	}
}

export type FastCapability =
	| { field: RequestField; value: FastTier }
	| { reason: "unsupported" | "unavailable" };

export function createFastCapabilities(fetchMetadata: typeof fetch = fetch) {
	const cache = new Map<string, { expires: number; result: Promise<FastModels | undefined> }>();
	return async (model: FastModel, oauth: boolean): Promise<FastCapability> => {
		const lookup = lookupFor(model, oauth);
		if (!lookup) return { reason: "unsupported" };
		let entry = cache.get(lookup.url);
		if (!entry || entry.expires <= Date.now()) {
			entry = { expires: Date.now() + CACHE_MS, result: Promise.resolve(undefined) };
			const pending = entry;
			entry.result = (async () => {
				try {
					const res = await fetchMetadata(lookup.url, { signal: AbortSignal.timeout(3_000) });
					if (!res.ok) throw new Error(`Metadata HTTP ${res.status}`);
					return await lookup.parse(res);
				} catch {
					pending.expires = Date.now() + FAILURE_CACHE_MS;
					return undefined;
				}
			})();
			cache.set(lookup.url, entry);
		}
		const models = await entry.result;
		if (!models) return { reason: "unavailable" };
		const value = models.get(model.id);
		return value ? { field: lookup.field, value } : { reason: "unsupported" };
	};
}
