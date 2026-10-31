// Mechanical half of /audit: metrics that reveal regressions no transcript reader
// notices (the prompt-cache bug went unseen for weeks), and compact per-turn
// digests so a model can judge every session's goal, path, and outcome cheaply.

type Json = Record<string, any>;

export type Turn = {
	at: number;
	gap?: number;
	text: string;
	final: string;
	end: number;
	calls: number;
	tools: Record<string, number>;
	aborted: boolean;
	toolErrors: number;
	firstPrompt?: { input: number; cached: number };
	subagentFailures: string[];
	cost: number;
};

export type Session = { id: string; cwd: string; compactions: number; turns: Turn[] };

export type Metrics = {
	since: string;
	until: string;
	sessions: number;
	turns: number;
	costUsd: number;
	warmFollowUps: number;
	warmCacheMissRate: number;
	providerErrors: number;
	providerHangs: number;
	interruptions: { total: number; resent: number; other: number };
	subagents: { spawns: number; spawnsPerHundredTurns: number; failures: Record<string, number> };
	turnSeconds: { median: number; p90: number; overTenMinutes: number };
	corrections: Record<string, number>;
	toolErrors: Record<string, number>;
	longSessions: number;
	maxCompactions: number;
	fixedPromptChars?: number;
};

// Phrases Charlie uses when the agent missed. Counts are a trend signal, not a verdict.
export const CORRECTION_PATTERNS: Record<string, RegExp> = {
	needed: /\b(do|did|does) (we|u|you) (even |really )?need\b|\bis (this|that|it) (even |really )?(needed|necessary)\b/i,
	explain: /\bexplain (it |this |that )?(again|simpl|like|as if|first|better)|\bno (prior )?context\b|\bwhat (are|r) (we|u|you) (even )?(doing|talking)|\b(idk|i don'?t know) what\b/i,
	complexity: /over ?complicat|too (complicated|careful|much)|\bsimpler?\b|\bjust (do|remove|commit|open)\b/i,
	frustration: /\bwtf\b|\bwhy (did|would|are) (u|you)\b|\?\?\?/i,
	status: /\b(update|status)\?|\bis it (still )?running\b|\bwhat'?s left\b/i,
};

const time = (value: unknown) => typeof value === "string" ? Date.parse(value) : Number(value) || 0;
const textOf = (content: unknown) => typeof content === "string" ? content
	: Array.isArray(content) ? content.flatMap((part: Json) => part?.type === "text" ? [part.text as string] : []).join("\n") : "";

export function parseSession(lines: string[], since: number, seen: Set<string>): Session | undefined {
	let header: Json | undefined;
	let compactions = 0;
	let current: Turn | undefined;
	let lastAssistant: number | undefined;
	const turns: Turn[] = [];
	for (const line of lines) {
		let entry: Json;
		try { entry = JSON.parse(line); } catch { continue; }
		if (entry.type === "session") { header = entry; continue; }
		if (entry.type === "compaction") { compactions++; continue; }
		// Forks repeat their parent's entries. Count each entry once across the audit.
		const key = `${entry.id}:${entry.timestamp}`;
		if (seen.has(key)) {
			if (entry.type === "message" && entry.message?.role === "assistant") lastAssistant = time(entry.timestamp);
			current = undefined;
			continue;
		}
		seen.add(key);
		if (entry.type === "custom_message" && entry.customType === "pi-codex-subagent-completion" && current) {
			const body = typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content);
			if (/"status":\s*"failed"/.test(body)) current.subagentFailures.push(body.match(/"error":\s*"([^"]{0,60})/)?.[1] ?? "unknown");
			continue;
		}
		if (entry.type !== "message") continue;
		const message = entry.message as Json;
		const at = time(entry.timestamp);
		if (message.role === "user") {
			const text = textOf(message.content).trim();
			if (!text || at < since) { current = undefined; continue; }
			current = { at, gap: lastAssistant === undefined ? undefined : (at - lastAssistant) / 1000, text, final: "", end: at, calls: 0, tools: {}, aborted: false, toolErrors: 0, subagentFailures: [], cost: 0 };
			turns.push(current);
		} else if (message.role === "assistant") {
			lastAssistant = at;
			if (!current) continue;
			const usage = message.usage ?? {};
			current.calls++;
			current.end = at;
			current.cost += usage.cost?.total ?? 0;
			current.firstPrompt ??= { input: (usage.input ?? 0) + (usage.cacheWrite ?? 0), cached: usage.cacheRead ?? 0 };
			if (message.stopReason === "aborted" || message.stopReason === "error") current.aborted = true;
			for (const part of message.content ?? []) {
				if (part.type === "toolCall") current.tools[part.name] = (current.tools[part.name] ?? 0) + 1;
				if (part.type === "text" && part.text?.trim()) current.final = part.text;
			}
		} else if (message.role === "toolResult" && message.isError && current) {
			current.toolErrors++;
		}
	}
	if (!header || turns.length === 0) return undefined;
	return { id: String(header.id ?? "").slice(-8), cwd: String(header.cwd ?? ""), compactions, turns };
}

/** Error and hang counts need every assistant entry, including those outside a user turn. */
export function providerFailures(lines: string[], since: number, seen: Set<string>) {
	let errors = 0;
	let hangs = 0;
	let previous: number | undefined;
	for (const line of lines) {
		let entry: Json;
		try { entry = JSON.parse(line); } catch { continue; }
		if (entry.type !== "message") continue;
		const at = time(entry.timestamp);
		const key = `${entry.id}:${entry.timestamp}`;
		if (entry.message?.role === "assistant" && entry.message.stopReason === "error" && at >= since && !seen.has(key)) {
			seen.add(key);
			errors++;
			if (previous !== undefined && at - previous > 600_000) hangs++;
		}
		previous = at;
	}
	return { errors, hangs };
}

const quantile = (values: number[], q: number) => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
};

export function computeMetrics(sessions: Session[], failures: { errors: number; hangs: number }, since: number, until: number, fixedPromptChars?: number): Metrics {
	const turns = sessions.flatMap((session) => session.turns);
	// A follow-up within five minutes should reuse the provider cache.
	const warm = turns.filter((turn) => turn.gap !== undefined && turn.gap < 300 && turn.firstPrompt && turn.firstPrompt.input + turn.firstPrompt.cached > 20_000);
	const missed = warm.filter((turn) => turn.firstPrompt!.cached < turn.firstPrompt!.input);
	let resent = 0;
	let interrupted = 0;
	for (const session of sessions) {
		session.turns.forEach((turn, index) => {
			if (!turn.aborted) return;
			interrupted++;
			const next = session.turns[index + 1];
			if (next && next.at - turn.end < 60_000) resent++;
		});
	}
	const spawns = turns.reduce((sum, turn) => sum + (turn.tools.spawn_agent ?? 0), 0);
	const subagentFailures: Record<string, number> = {};
	const toolErrors: Record<string, number> = {};
	const corrections = Object.fromEntries(Object.keys(CORRECTION_PATTERNS).map((name) => [name, 0]));
	for (const turn of turns) {
		for (const failure of turn.subagentFailures) subagentFailures[failure] = (subagentFailures[failure] ?? 0) + 1;
		if (turn.toolErrors) toolErrors.total = (toolErrors.total ?? 0) + turn.toolErrors;
		for (const [name, pattern] of Object.entries(CORRECTION_PATTERNS)) if (pattern.test(turn.text)) corrections[name]!++;
	}
	const durations = turns.map((turn) => (turn.end - turn.at) / 1000);
	return {
		since: new Date(since).toISOString(),
		until: new Date(until).toISOString(),
		sessions: sessions.length,
		turns: turns.length,
		costUsd: Math.round(turns.reduce((sum, turn) => sum + turn.cost, 0)),
		warmFollowUps: warm.length,
		warmCacheMissRate: warm.length ? Math.round((100 * missed.length) / warm.length) / 100 : 0,
		providerErrors: failures.errors,
		providerHangs: failures.hangs,
		interruptions: { total: interrupted, resent, other: interrupted - resent },
		subagents: { spawns, spawnsPerHundredTurns: turns.length ? Math.round((1000 * spawns) / turns.length) / 10 : 0, failures: subagentFailures },
		turnSeconds: { median: Math.round(quantile(durations, 0.5)), p90: Math.round(quantile(durations, 0.9)), overTenMinutes: durations.filter((value) => value > 600).length },
		corrections,
		toolErrors,
		longSessions: sessions.filter((session) => session.turns.length > 100).length,
		maxCompactions: Math.max(0, ...sessions.map((session) => session.compactions)),
		...(fixedPromptChars === undefined ? {} : { fixedPromptChars }),
	};
}

const clip = (value: string, length: number) => {
	const flat = value.replace(/\s+/g, " ").trim();
	return flat.length <= length ? flat : `${flat.slice(0, length)}…`;
};
const clock = (at: number) => new Date(at).toISOString().slice(5, 16).replace("T", " ");

export function digest(session: Session) {
	const lines = [`# session ${session.id} cwd=${session.cwd} turns=${session.turns.length} compactions=${session.compactions}`];
	session.turns.forEach((turn, index) => {
		const tools = Object.entries(turn.tools).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => `${name}:${count}`).join(",");
		const flags = [turn.aborted ? "ABORTED" : "", turn.toolErrors ? `toolErr=${turn.toolErrors}` : "", turn.subagentFailures.length ? `subagentFail=${turn.subagentFailures.length}` : ""].filter(Boolean).join(" ");
		lines.push(`[${index}] ${clock(turn.at)} dur=${Math.round((turn.end - turn.at) / 1000)}s calls=${turn.calls} ${flags} tools=${tools}`);
		lines.push(`  U: ${clip(turn.text, 500)}`);
		lines.push(`  A: ${clip(turn.final, 350)}`);
	});
	return `${lines.join("\n")}\n`;
}

/** Contiguous batches of roughly equal size, so each reviewer reads whole sessions in order. */
export function batches(digests: string[], limit = 250_000) {
	const result: string[][] = [[]];
	let size = 0;
	for (const text of digests) {
		if (size > 0 && size + text.length > limit) { result.push([]); size = 0; }
		result.at(-1)!.push(text);
		size += text.length;
	}
	return result.filter((batch) => batch.length > 0).map((batch) => batch.join("\n"));
}
