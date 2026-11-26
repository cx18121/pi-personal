import { expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import colorFooter, { formatProcesses, formatSubagents } from "../extensions/color-footer.ts";

test("renders active extension modes", async () => {
	const handlers = new Map<string, (...args: any[]) => any>();
	let footerFactory: ((tui: any, theme: any, data: any) => any) | undefined;
	const listeners = new Map<string, () => void>();
	let processes = [{ name: "dev-server", status: "running" }, { name: "old-check", status: "exited" }];
	const pi = {
		on(event: string, handler: (...args: any[]) => any) {
			handlers.set(event, handler);
		},
		events: {
			on: (channel: string, listener: () => void) => listeners.set(channel, listener),
			emit: (channel: string, payload: any) => { if (channel === "processes:request:list") payload.reply(processes); },
		},
		async exec(_command: string, args: string[]) {
			if (args[0] === "rev-parse") return { code: 0, stdout: "/workspace\n.git\n", stderr: "" };
			if (args[0] === "status") return { code: 0, stdout: "# branch.ab +0 -0\n", stderr: "" };
			return { code: 0, stdout: "", stderr: "" };
		},
		getThinkingLevel: () => "high",
	} as unknown as ExtensionAPI;
	const context = {
		cwd: "/workspace",
		mode: "tui",
		model: { id: "test-model" },
		getContextUsage: () => ({ percent: 12 }),
		sessionManager: {
			getBranch: () => [{ type: "message", message: { role: "assistant", usage: { input: 1_000, cacheRead: 9_000, cacheWrite: 0 } } }],
		},
		ui: {
			setFooter(factory: typeof footerFactory) {
				footerFactory = factory;
			},
		},
	} as unknown as ExtensionContext;

	colorFooter(pi);
	await handlers.get("session_start")?.({}, context);

	const footer = footerFactory?.(
		{ requestRender() {} },
		{
			bold: (text: string) => text,
			fg: (_color: string, text: string) => text,
		},
		{
			getGitBranch: () => "main",
			getExtensionStatuses: () => new Map([
				["autonomy", "push"],
			]),
			onBranchChange: () => () => {},
		},
	);
	const output = footer?.render(200).join("\n") ?? "";

	expect(output).toContain("autonomy push");
	expect(output).toContain("cache 90%");

	handlers.get("message_end")?.({ message: { role: "assistant", usage: { input: 40_000, cacheRead: 10_000 } } });
	expect(footer?.render(200).join("\n")).toContain("cache 20%");

	expect(output).toContain("▶ dev-server · /ps");
	expect(output).not.toContain("old-check");
	processes = [{ name: "old-check", status: "exited" }];
	listeners.get("processes:changed")!();
	expect(footer?.render(200).join("\n")).not.toContain("▶");
});

test("shows how long running processes and subagents have run", () => {
	const now = Date.parse("2026-11-10T12:00:00Z");
	expect(formatProcesses([{ name: "tests", status: "running", startTime: now - 3 * 60_000 }], now)).toBe("▶ tests 3m · /ps");
	expect(formatProcesses([
		{ name: "server", status: "running", startTime: now - 75 * 60_000 },
		{ name: "tests", status: "running", startTime: now - 40_000 },
	], now)).toBe("▶ 2 processes, longest server 1h 15m · /ps");
	expect(formatSubagents([{ name: "/reviewer", status: "running", startTime: now - 2 * 60_000 }], now)).toBe("◌ reviewer 2m · /subagents");
	expect(formatSubagents([
		{ name: "/wave/a", status: "running", startTime: now - 6 * 60_000 },
		{ name: "/wave/b", status: "starting", startTime: now - 25_000 },
	], now)).toBe("◌ 2 subagents, longest wave/a 6m · /subagents");
	expect(formatSubagents([
		{ name: "/wave/a", status: "running", startTime: now - 60_000 },
		{ name: "/wave/b", status: "queued" },
		{ name: "/wave/c", status: "queued" },
	], now)).toBe("◌ 1 running, 2 queued · /subagents");
});
