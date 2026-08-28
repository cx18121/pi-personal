import { expect, test } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import colorFooter from "../extensions/color-footer.ts";

test("renders background child status from extension statuses", async () => {
	const handlers = new Map<string, (...args: any[]) => any>();
	let footerFactory: ((tui: any, theme: any, data: any) => any) | undefined;
	const pi = {
		on(event: string, handler: (...args: any[]) => any) {
			handlers.set(event, handler);
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
				["cx-mode", "CX"],
				["child-agent", "child 1 · 3m 43s"],
			]),
			onBranchChange: () => () => {},
		},
	);
	const output = footer?.render(200).join("\n") ?? "";

	expect(output).toContain("CX");
	expect(output).toContain("child 1 · 3m 43s");
});
