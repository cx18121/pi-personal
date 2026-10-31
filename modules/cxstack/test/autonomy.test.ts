import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import autonomy from "../extensions/autonomy.ts";
import { findRepository, normalizeRemote } from "../lib/autonomy.ts";

test("remote forms of one repository share a key", () => {
	const key = "github.com/cx18121/pi-personal";
	expect(normalizeRemote("git@github.com:cx18121/pi-personal.git")).toBe(key);
	expect(normalizeRemote("https://github.com/cx18121/pi-personal.git")).toBe(key);
	expect(normalizeRemote("https://user:token@github.com/CX18121/pi-personal/")).toBe(key);
});

test("worktrees of a repository share its default branch and key", () => {
	const root = mkdtempSync(join(tmpdir(), "autonomy-repo-"));
	const repo = join(root, "repo");
	const run = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore" });
	execFileSync("git", ["init", "-q", "-b", "trunk", repo]);
	run(repo, "commit", "--allow-empty", "-qm", "init");
	run(repo, "remote", "add", "origin", "git@github.com:me/thing.git");
	run(repo, "update-ref", "refs/remotes/origin/trunk", "HEAD");
	run(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
	run(repo, "worktree", "add", "-q", join(root, "wt"), "-b", "feature");
	expect(findRepository(join(root, "wt"))).toEqual({ key: "github.com/me/thing", label: "me/thing", defaultBranch: "trunk" });
	expect(findRepository(root)).toBeUndefined();
});

test("the setting persists per repository and becomes one stable prompt line", async () => {
	const file = join(mkdtempSync(join(tmpdir(), "autonomy-store-")), "autonomy.json");
	const handlers = new Map<string, (...args: any[]) => any>();
	let command: any;
	const statuses = new Map<string, string | undefined>();
	const pi = { on: (event: string, handler: any) => handlers.set(event, handler), registerCommand: (_name: string, spec: any) => { command = spec; } };
	const repo = { key: "github.com/me/thing", label: "me/thing", defaultBranch: "main" };
	autonomy(pi as never, file, () => repo);
	const ctx = { cwd: "/x", ui: { setStatus: (key: string, value?: string) => statuses.set(key, value), notify() {}, select: async () => "push: also push feature branches and open draft PRs" } };
	const line = () => {
		const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
		handlers.get("before_agent_start")!(event, ctx);
		return event.systemPromptOptions.sections.autonomy;
	};

	handlers.get("session_start")!({}, ctx);
	expect(line()).toContain("Commit or push only when I ask.");
	expect(statuses.get("autonomy")).toBeUndefined();

	await command.handler("", ctx);
	expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ "github.com/me/thing": "push" });
	expect(line()).toContain("Push main only when I ask.");
	expect(line()).toBe(line());
	expect(statuses.get("autonomy")).toBe("push");

	await command.handler("main", ctx);
	handlers.get("session_start")!({}, ctx);
	expect(line()).toContain("including main");
	writeFileSync(file, JSON.stringify({ "github.com/me/thing": "commit" }));
	expect(line()).toContain("Push only when I ask.");
	await command.handler("bogus", ctx);
	await command.handler("ask", ctx);
	expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({});
});
