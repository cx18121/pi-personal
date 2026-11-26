import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import handoff, { deriveHandoffLabel, parseHandoffArgs } from "../extensions/handoff.ts";

function harness(writes: boolean, herdr?: { workspace: string }, options?: { sessionName?: string }) {
	const dir = mkdtempSync(join(tmpdir(), "handoff-"));
	let command: any;
	let tool: any;
	const listeners = new Map<string, Array<(...args: any[]) => any>>();
	let sent = "";
	let running = false;
	const result: {
		editor?: string;
		autoSent?: string;
		parent?: string;
		notices: string[];
		statuses: Array<[string, string | undefined]>;
		herdr: string[][];
	} = { notices: [], statuses: [], herdr: [] };
	process.env.HERDR_ENV = herdr ? "1" : "";
	process.env.HERDR_WORKSPACE_ID = herdr?.workspace ?? "";
	const pi = {
		registerCommand: (_name: string, spec: any) => { command = spec; },
		registerTool: (spec: any) => { tool = spec; },
		registerFlag() {},
		on: (event: string, fn: (...args: any[]) => any) => {
			const list = listeners.get(event) ?? [];
			list.push(fn);
			listeners.set(event, list);
		},
		exec: async (cmd: string, args: string[]) => {
			if (cmd === "herdr") {
				result.herdr.push(args);
				return { code: 0, stdout: args[1] === "create" ? JSON.stringify({ result: { root_pane: { pane_id: "w1:p9" } } }) : "", stderr: "" };
			}
			return cmd === "git" && args[0] === "branch" ? { code: 0, stdout: "fix/x\n" }
				: cmd === "git" && args[0] === "status" ? { code: 0, stdout: " M a.ts\n" } : { code: 1, stdout: "" };
		},
		sendUserMessage: (text: string, opts?: { expandPromptTemplates?: boolean }) => {
			sent = text;
			if (opts?.expandPromptTemplates && text === "/handoff") {
				void command.handler("", ctx);
				return;
			}
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
		waitForIdle: async () => {},
		ui: {
			notify: (message: string) => result.notices.push(message),
			setStatus: (key: string, value: string | undefined) => result.statuses.push([key, value]),
		},
		sessionManager: {
			getSessionFile: () => "/sessions/old.jsonl",
			getSessionDir: () => join(dir, "sessions"),
			getSessionName: () => options?.sessionName,
		},
		newSession: async (opts: any) => {
			result.parent = opts.parentSession;
			await opts.withSession({
				ui: { setEditorText: (text: string) => { result.editor = text; }, notify() {} },
				sendUserMessage: async (text: string) => { result.autoSent = text; },
			});
			return { cancelled: false };
		},
	};
	return {
		run: (args: string) => command.handler(args, ctx),
		callTool: async (params: any) => {
			const res = await tool.execute("tc-1", params, undefined, undefined, ctx);
			if (res.terminate) {
				for (const fn of listeners.get("agent_settled") ?? []) await fn({}, ctx);
			}
			return res;
		},
		sent: () => sent,
		result,
	};
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

test("inside Herdr the new session opens in a new tab linked to the old one, and the old session stays", async () => {
	const h = harness(true, { workspace: "w1" });
	await h.run("add docs");
	expect(h.result.parent).toBeUndefined();
	const [create, run] = h.result.herdr;
	expect(create).toEqual(["tab", "create", "--workspace", "w1", "--cwd", "/repo", "--label", "add docs", "--focus"]);
	expect(run!.slice(0, 2)).toEqual(["pane", "run"]);
	expect(run![2]).toBe("w1:p9");
	const [, sessionFile, handoffFile] = run![3]!.match(/^'pi' '--session' '([^']+)' '--handoff' '([^']+)'$/)!;
	expect(JSON.parse(readFileSync(sessionFile!, "utf8")).parentSession).toBe("/sessions/old.jsonl");
	expect(readFileSync(handoffFile!, "utf8")).toContain("Ship the fix");
});

test("a Pi started with --handoff waits with the pointer in its editor", () => {
	let start: any;
	let editor = "";
	handoff({ registerCommand() {}, registerFlag() {}, getFlag: () => "/h/x.md", on: (name: string, fn: any) => { if (name === "session_start") start = fn; } } as never);
	const ctx = { hasUI: true, ui: { setEditorText: (t: string) => { editor = t; }, notify() {} }, sessionManager: { getHeader: () => ({ parentSession: "/sessions/old.jsonl" }) } };
	start({ reason: "reload" }, ctx);
	expect(editor).toBe("");
	start({ reason: "startup" }, ctx);
	expect(editor).toStartWith("Continue from the handoff at /h/x.md.");
	expect(editor).toContain("/sessions/old.jsonl");
});

test("parseHandoffArgs and deriveHandoffLabel handle --go and fallback labels", () => {
	expect(parseHandoffArgs("--go ship tests")).toEqual({ focus: "ship tests", autoStart: true });
	expect(parseHandoffArgs("ship tests --go")).toEqual({ focus: "ship tests", autoStart: true });
	expect(parseHandoffArgs("--go")).toEqual({ focus: "", autoStart: true });
	expect(parseHandoffArgs("just focus")).toEqual({ focus: "just focus", autoStart: false });

	const dir = mkdtempSync(join(tmpdir(), "handoff-label-"));
	const file = join(dir, "h.md");
	writeFileSync(file, "## Goal\nSomething\n## Migrate billing queue\nDetails");
	expect(deriveHandoffLabel("", "Session Title", file)).toBe("Session Title");
	expect(deriveHandoffLabel("", undefined, file)).toBe("Migrate billing queue");
});

test("/handoff --go auto-starts in Herdr and falls back to the session name as tab label", async () => {
	const h = harness(true, { workspace: "w1" }, { sessionName: "Billing Queue Fix" });
	await h.run("--go");
	const [create, run] = h.result.herdr;
	expect(create).toEqual(["tab", "create", "--workspace", "w1", "--cwd", "/repo", "--label", "Billing Queue Fix", "--focus"]);
	expect(run![3]).not.toContain("--handoff");
	expect(run![3]).toContain("Continue from the handoff at ");
	expect(h.result.statuses[0]).toEqual(["handoff", "writing handoff…"]);
	expect(h.result.statuses.at(-1)).toEqual(["handoff", undefined]);
});

test("handoff tool writes the handoff directly and opens a Herdr tab or replaces the session", async () => {
	const hHerdr = harness(false, { workspace: "w1" }, { sessionName: "Old Name" });
	const resHerdr = await hHerdr.callTool({ content: "## Next\nFinish PR", focus: "Finish PR", auto_start: true });
	expect(resHerdr.details.herdr).toBe(true);
	expect(readFileSync(resHerdr.details.file, "utf8")).toContain("Finish PR");
	expect(hHerdr.result.herdr[0]).toContain("Finish PR");
	expect(hHerdr.result.herdr[1]![3]).toContain("Continue from the handoff at ");

	const hLocal = harness(false);
	const resLocal = await hLocal.callTool({ content: "## Next\nLocal switch", auto_start: true });
	expect(resLocal.terminate).toBe(true);
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(hLocal.result.parent).toBe("/sessions/old.jsonl");
	expect(hLocal.result.autoSent).toMatch(/^Continue from the handoff at \S+\.md\./);
});
