import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import handoff from "../extensions/handoff.ts";

function harness(writes: boolean) {
	const dir = mkdtempSync(join(tmpdir(), "handoff-"));
	let command: any;
	let sent = "";
	let running = false;
	const result: { editor?: string; parent?: string; notices: string[] } = { notices: [] };
	const pi = {
		registerCommand: (_name: string, spec: any) => { command = spec; },
		exec: async (cmd: string, args: string[]) => cmd === "git" && args[0] === "branch" ? { code: 0, stdout: "fix/x\n" }
			: cmd === "git" && args[0] === "status" ? { code: 0, stdout: " M a.ts\n" } : { code: 1, stdout: "" },
		sendUserMessage: (text: string) => {
			sent = text;
			setTimeout(() => { running = true; }, 5);
			setTimeout(() => {
				if (writes) writeFileSync(text.match(/to `([^`]+\.md)`/)![1]!, "## Goal\nShip the fix, price $& rounding.");
				running = false;
			}, 20);
		},
	};
	handoff(pi as never, dir, 2);
	const ctx = {
		cwd: "/repo",
		isIdle: () => !running,
		ui: { notify: (message: string) => result.notices.push(message) },
		sessionManager: { getSessionFile: () => "/sessions/old.jsonl" },
		newSession: async (options: any) => {
			result.parent = options.parentSession;
			await options.withSession({ ui: { setEditorText: (text: string) => { result.editor = text; }, notify() {} } });
			return { cancelled: false };
		},
	};
	return { run: (args: string) => command.handler(args, ctx), sent: () => sent, result };
}

test("the current agent saves the handoff and a new session starts from a pointer to it", async () => {
	const h = harness(true);
	await h.run("add the docs $&");
	expect(h.sent()).toContain("session_query at `/sessions/old.jsonl`");
	expect(h.sent()).toContain("focus on: add the docs $&");
	expect(h.sent()).toContain("Branch: fix/x");
	expect(h.sent()).toContain(" M a.ts");
	expect(h.result.parent).toBe("/sessions/old.jsonl");
	expect(h.result.editor).toMatch(/^Continue from the handoff at \S+\.md\./);
	expect(h.result.editor).not.toContain("Ship the fix");
});

test("no session opens when the agent saves no handoff", async () => {
	const h = harness(false);
	await h.run("");
	expect(h.result.parent).toBeUndefined();
	expect(h.result.notices.at(-1)).toContain("No handoff was saved");
});
