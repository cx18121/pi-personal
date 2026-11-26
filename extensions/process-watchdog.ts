import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const DEFAULT_SILENCE_THRESHOLDS_MS = [4 * 60_000, 10 * 60_000];
const DEFAULT_CHECK_INTERVAL_MS = 30_000;
const STALL_HINT_THRESHOLD_MS = 3 * 60_000;

const LONG_LIVED_COMMAND_RE =
	/\b(tail\s+-[a-zA-Z]*f|logs?\s+(?:-f|--follow)|--watch\b|\bwatch\b|vite\b|next\s+dev|nuxt\s+dev|storybook\b|nodemon\b|http\.server|artisan\s+serve|port-forward\b|kubectl\s+proxy)\b/i;

export interface ProcessSnapshot {
	id: string;
	name: string;
	command?: string;
	status: string;
	startTime?: number;
}

export interface TrackedProcess {
	id: string;
	name: string;
	command: string;
	startTime: number;
	lastOutputAt: number;
	lastLine: string;
	watchStall: boolean;
	alertsSent: number;
}

export function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const remMinutes = minutes % 60;
	return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

/** True for one-shot commands expected to finish (builds, tests, pango dev run), false for streaming daemons/watchers. */
export function shouldWatchProcessForStall(command: string, onSuccess?: string): boolean {
	if (onSuccess === "ignore") return false;
	if (LONG_LIVED_COMMAND_RE.test(command)) return false;
	return true;
}

export function formatProcessTimingNote(tracked: TrackedProcess, now: number, stallHintMs = STALL_HINT_THRESHOLD_MS): string {
	const running = formatDuration(now - tracked.startTime);
	const silentMs = Math.max(0, now - tracked.lastOutputAt);
	const silent = formatDuration(silentMs);
	const warning = tracked.watchStall && silentMs >= stallHintMs
		? " — no new output; likely stalled or wedged, inspect why instead of waiting"
		: "";
	return `[process timing: ${tracked.name} (${tracked.id}) running ${running}, silent ${silent} since last output${warning}]`;
}

export function formatStallAlert(tracked: TrackedProcess, now: number): string {
	const running = formatDuration(now - tracked.startTime);
	const silent = formatDuration(Math.max(0, now - tracked.lastOutputAt));
	const lastLine = tracked.lastLine ? `\nLast output line: ${tracked.lastLine}` : "";
	return [
		`Background process "${tracked.name}" (${tracked.id}) has been running for ${running} with ${silent} of silence since its last output.`,
		`Command: ${tracked.command}${lastLine}`,
		"Check whether it is wedged (inspect logs or container/slot state), or stop and diagnose/retry instead of waiting silently.",
	].join("\n");
}

export interface WatchdogOptions {
	silenceThresholdsMs?: number[];
	checkIntervalMs?: number;
	now?: () => number;
}

export default function registerProcessWatchdog(pi: ExtensionAPI, options: WatchdogOptions = {}) {
	const thresholds = options.silenceThresholdsMs ?? DEFAULT_SILENCE_THRESHOLDS_MS;
	const checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
	const nowFn = options.now ?? (() => Date.now());

	const tracked = new Map<string, TrackedProcess>();
	const pendingOnSuccessByName = new Map<string, string | undefined>();
	let ticker: ReturnType<typeof setInterval> | undefined;

	const stopTicker = () => {
		if (ticker !== undefined) {
			clearInterval(ticker);
			ticker = undefined;
		}
	};

	const checkStalls = () => {
		const now = nowFn();
		for (const item of tracked.values()) {
			if (!item.watchStall) continue;
			const nextThreshold = thresholds[item.alertsSent];
			if (nextThreshold === undefined) continue;
			const silentMs = now - item.lastOutputAt;
			if (silentMs < nextThreshold) continue;
			item.alertsSent += 1;
			pi.sendMessage({
				customType: "process-stall-alert",
				content: formatStallAlert(item, now),
				display: true,
				details: {
					id: item.id,
					name: item.name,
					runningMs: now - item.startTime,
					silentMs,
				},
			}, { deliverAs: "followUp", triggerTurn: true });
		}
		if (tracked.size === 0) stopTicker();
	};

	const ensureTicker = () => {
		if (ticker !== undefined || tracked.size === 0) return;
		ticker = setInterval(checkStalls, checkIntervalMs);
		ticker.unref?.();
	};

	const upsertRunning = (info: ProcessSnapshot) => {
		if (!info?.id || info.status !== "running") return;
		const now = nowFn();
		const existing = tracked.get(info.id);
		if (existing) return;
		const onSuccess = pendingOnSuccessByName.get(info.name);
		pendingOnSuccessByName.delete(info.name);
		const startTime = typeof info.startTime === "number" ? info.startTime : now;
		tracked.set(info.id, {
			id: info.id,
			name: info.name,
			command: info.command ?? "",
			startTime,
			lastOutputAt: startTime,
			lastLine: "",
			watchStall: shouldWatchProcessForStall(info.command ?? "", onSuccess),
			alertsSent: 0,
		});
		ensureTicker();
	};

	const hydrateRunning = () => {
		let list: ProcessSnapshot[] = [];
		pi.events.emit("processes:request:list", {
			reply: (result: ProcessSnapshot[]) => {
				if (Array.isArray(result)) list = result;
			},
		});
		const liveIds = new Set<string>();
		for (const item of list) {
			if (item?.status === "running") {
				liveIds.add(item.id);
				upsertRunning(item);
			}
		}
		for (const id of [...tracked.keys()]) {
			if (!liveIds.has(id)) tracked.delete(id);
		}
		if (tracked.size === 0) stopTicker();
	};

	pi.events.on("processes:started", (info: unknown) => {
		if (info && typeof info === "object") upsertRunning(info as ProcessSnapshot);
	});

	pi.events.on("processes:ended", (info: unknown) => {
		const id = info && typeof info === "object" ? (info as { id?: unknown }).id : undefined;
		if (typeof id === "string") {
			tracked.delete(id);
			if (tracked.size === 0) stopTicker();
		}
	});

	pi.events.on("processes:output_changed", (payload: unknown) => {
		if (!payload || typeof payload !== "object") return;
		const { id, appendedText } = payload as { id?: unknown; appendedText?: Array<{ text?: unknown }> };
		if (typeof id !== "string") return;
		const item = tracked.get(id);
		if (!item) return;
		const hasBytes = Array.isArray(appendedText) && appendedText.some((entry) => typeof entry?.text === "string" && entry.text.trim().length > 0);
		if (!hasBytes) return;
		item.lastOutputAt = nowFn();
		item.alertsSent = 0;
		for (let i = appendedText!.length - 1; i >= 0; i--) {
			const raw = appendedText![i]?.text;
			const line = typeof raw === "string" ? raw.trim() : "";
			if (line) {
				item.lastLine = line.slice(0, 200);
				break;
			}
		}
	});

	pi.on("tool_call", (event) => {
		if (event.toolName !== "process") return;
		const input = event.input as { action?: unknown; name?: unknown; notify?: { onSuccess?: unknown } };
		if (input?.action === "start" && typeof input.name === "string") {
			pendingOnSuccessByName.set(
				input.name,
				typeof input.notify?.onSuccess === "string" ? input.notify.onSuccess : undefined,
			);
		}
	});

	pi.on("tool_result", (event) => {
		if (event.toolName !== "process" || event.isError) return;
		const input = event.input as { action?: unknown; id?: unknown };
		const action = input?.action;
		if (action !== "output" && action !== "list") return;
		hydrateRunning();
		const now = nowFn();
		const notes: string[] = [];
		if (action === "output" && typeof input.id === "string") {
			const item = tracked.get(input.id);
			if (item) notes.push(formatProcessTimingNote(item, now));
		} else if (action === "list" && tracked.size > 0) {
			for (const item of tracked.values()) notes.push(formatProcessTimingNote(item, now));
		}
		if (!notes.length) return;
		const existing = Array.isArray(event.content) ? event.content : [];
		return {
			content: [...existing, { type: "text" as const, text: `\n${notes.join("\n")}` }],
		};
	});

	pi.registerMessageRenderer("process-stall-alert", (message: any, _options: any, theme: Theme) => {
		const name = message.details?.name ?? "process";
		const silent = typeof message.details?.silentMs === "number" ? formatDuration(message.details.silentMs) : "a while";
		return new Text(theme.fg("warning", `⚠ ${name} silent for ${silent} — waking agent to check if wedged`), 0, 0);
	});

	pi.on("session_start", () => {
		hydrateRunning();
	});

	pi.on("session_shutdown", () => {
		stopTicker();
		tracked.clear();
		pendingOnSuccessByName.clear();
	});

	return { checkStalls, tracked };
}
