import { describe, expect, test } from "bun:test";
import registerProcessWatchdog, {
	formatDuration,
	shouldWatchProcessForStall,
} from "../extensions/process-watchdog.ts";

function harness(initialNow = 1_000_000) {
	let now = initialNow;
	const handlers = new Map<string, (...args: any[]) => any>();
	const eventListeners = new Map<string, Array<(payload: any) => void>>();
	const messages: Array<{ message: any; options: any }> = [];
	let liveList: any[] = [];

	const pi = {
		on: (event: string, fn: (...args: any[]) => any) => handlers.set(event, fn),
		registerMessageRenderer: () => {},
		sendMessage: (message: any, options: any) => messages.push({ message, options }),
		events: {
			on: (channel: string, fn: (payload: any) => void) => {
				const list = eventListeners.get(channel) ?? [];
				list.push(fn);
				eventListeners.set(channel, list);
			},
			emit: (channel: string, payload?: any) => {
				if (channel === "processes:request:list" && typeof payload?.reply === "function") {
					payload.reply(liveList);
					return;
				}
				for (const fn of eventListeners.get(channel) ?? []) fn(payload);
			},
		},
	};

	const watchdog = registerProcessWatchdog(pi as never, {
		silenceThresholdsMs: [4 * 60_000, 10 * 60_000],
		checkIntervalMs: 60_000,
		now: () => now,
	});

	return {
		handlers,
		messages,
		watchdog,
		emit: (channel: string, payload?: any) => pi.events.emit(channel, payload),
		setLiveList: (list: any[]) => { liveList = list; },
		advance: (ms: number) => { now += ms; },
	};
}

describe("process-watchdog", () => {
	test("watches one-shot commands like pango dev run and skips long-lived daemons/watchers", () => {
		expect(shouldWatchProcessForStall("MISE_EXEC_AUTO_INSTALL=false mise exec -- bun dev/src/cli.ts dev run --standalone", "turn")).toBe(true);
		expect(shouldWatchProcessForStall("npm test")).toBe(true);
		expect(shouldWatchProcessForStall("tail -f logs/app.log")).toBe(false);
		expect(shouldWatchProcessForStall("pnpm vite --port 3000")).toBe(false);
		expect(shouldWatchProcessForStall("bun test --watch")).toBe(false);
		expect(shouldWatchProcessForStall("kubectl port-forward svc/x 9330:9330")).toBe(false);
		expect(shouldWatchProcessForStall("pango dev run --standalone", "ignore")).toBe(false);
		expect(formatDuration(13 * 60_000 + 2_000)).toBe("13m 2s");
	});

	test("enriches process output and list results with elapsed and silence durations and alerts on silence", () => {
		const h = harness(10_000);
		const proc = {
			id: "proc_f172",
			name: "pango-dev-standalone",
			command: "MISE_EXEC_AUTO_INSTALL=false mise exec -- bun dev/src/cli.ts dev run --standalone",
			status: "running",
			startTime: 10_000,
		};
		h.setLiveList([proc]);
		h.handlers.get("tool_call")?.({ toolName: "process", input: { action: "start", name: proc.name, notify: { onSuccess: "turn" } } });
		h.emit("processes:started", proc);

		// Output at 1m 49s resets silence clock
		h.advance(109_000);
		h.emit("processes:output_changed", { id: proc.id, appendedText: [{ text: "portal startup 21s" }] });

		// 3m 30s of silence: not yet alerting, but tool_result shows stall warning
		h.advance(210_000);
		h.watchdog.checkStalls();
		expect(h.messages).toHaveLength(0);

		const enriched = h.handlers.get("tool_result")?.({
			toolName: "process",
			isError: false,
			input: { action: "output", id: proc.id },
			content: [{ type: "text", text: "stdout: portal startup 21s" }],
		});
		const appended = enriched.content.at(-1).text;
		expect(appended).toContain("running 5m 19s");
		expect(appended).toContain("silent 3m 30s");
		expect(appended).toContain("likely stalled or wedged");

		// Past 4m of silence: triggers one automatic wake-up alert
		h.advance(40_000);
		h.watchdog.checkStalls();
		expect(h.messages).toHaveLength(1);
		expect(h.messages[0]!.message.customType).toBe("process-stall-alert");
		expect(h.messages[0]!.message.content).toContain("portal startup 21s");
		expect(h.messages[0]!.options.triggerTurn).toBe(true);

		// Checking again before 10m threshold does not spam
		h.advance(60_000);
		h.watchdog.checkStalls();
		expect(h.messages).toHaveLength(1);

		// New output resets silence and alert schedule
		h.emit("processes:output_changed", { id: proc.id, appendedText: [{ text: "web container ready" }] });
		h.advance(4 * 60_000 + 1_000);
		h.watchdog.checkStalls();
		expect(h.messages).toHaveLength(2);

		// Process ends: cleaned up
		h.emit("processes:ended", { id: proc.id });
		expect(h.watchdog.tracked.size).toBe(0);
	});
});
