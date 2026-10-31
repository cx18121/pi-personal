import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// /handoff asks the current agent, which still holds the full context and a warm
// prompt cache, to write the handoff to a file. The new session starts from a
// short pointer to that file, so the agent-written text never enters the new
// session as Charlie's own message, and memory cannot cite it as his words.

const template = readFileSync(fileURLToPath(new URL("../resources/handoff.md", import.meta.url)), "utf8");
const START_TIMEOUT_MS = 60_000;

type Exec = ExtensionAPI["exec"];

export async function repositoryFacts(exec: Exec, cwd: string) {
	const run = async (command: string, args: string[]) => {
		try {
			const result = await exec(command, args, { cwd, timeout: 5_000 });
			return result.code === 0 ? result.stdout.trimEnd() : "";
		} catch {
			return "";
		}
	};
	const branch = (await run("git", ["branch", "--show-current"])).trim();
	if (!branch && !(await run("git", ["rev-parse", "--git-dir"]))) return `Working directory: ${cwd} (not a Git repository)`;
	const [head, upstream, status, pr] = await Promise.all([
		run("git", ["log", "-1", "--format=%h %s"]),
		run("git", ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]),
		run("git", ["status", "--short"]),
		run("gh", ["pr", "view", "--json", "number,url,state,isDraft", "--jq", "\"#\\(.number) \\(.state)\\(if .isDraft then \" draft\" else \"\" end) \\(.url)\""]),
	]);
	const [behind, ahead] = upstream.trim().split(/\s+/);
	const changes = status.split("\n").filter(Boolean);
	return [
		`Working directory: ${cwd}`,
		`Branch: ${branch || "detached"}`,
		`HEAD: ${head.trim()}`,
		upstream ? `Upstream: ${ahead} ahead, ${behind} behind` : "Upstream: none",
		pr ? `Pull request: ${pr.trim()}` : "",
		changes.length ? `Uncommitted changes (${changes.length}):\n${changes.slice(0, 30).join("\n")}` : "Uncommitted changes: none",
	].filter(Boolean).join("\n");
}

const fill = (text: string, values: Record<string, string>) =>
	Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, () => value), text);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function (pi: ExtensionAPI, handoffDir = join(getAgentDir(), "handoffs"), pollMs = 250) {
	pi.registerCommand("handoff", {
		description: "Continue this work in a fresh session from a written handoff (optional: focus for the next session)",
		handler: async (args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for Pi to finish, then retry /handoff.", "warning");
				return;
			}
			const session = ctx.sessionManager.getSessionFile();
			if (!session) {
				ctx.ui.notify("This session is not saved, so it cannot be handed off.", "warning");
				return;
			}
			mkdirSync(handoffDir, { recursive: true });
			const file = join(handoffDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
			const focus = args.trim();
			const facts = await repositoryFacts(pi.exec.bind(pi), ctx.cwd);
			const requested = Date.now();
			pi.sendUserMessage(fill(template, {
				FILE: file,
				SESSION: session,
				FOCUS: focus ? ` The next session will focus on: ${focus}` : "",
				FACTS: facts,
			}));

			// The prompt may compact before the run starts. isIdle covers both.
			let started = false;
			for (let waited = 0; ; waited += pollMs) {
				await sleep(pollMs);
				if (!ctx.isIdle()) started = true;
				else if (started || existsSync(file)) break;
				else if (waited >= START_TIMEOUT_MS) break;
			}
			if (!existsSync(file) || statSync(file).mtimeMs < requested) {
				ctx.ui.notify(`No handoff was saved to ${file}. The session is unchanged.`, "warning");
				return;
			}
			const pointer = `Continue from the handoff at ${file}. Read it, restate the goal and the next step in two lines, then continue. The previous session is ${session}; query it with session_query for details the handoff omits.`;
			await ctx.newSession({
				parentSession: session,
				withSession: async (next) => {
					next.ui.setEditorText(pointer);
					next.ui.notify(`Handoff saved to ${file}. Review it if you like, then press Enter.`, "info");
				},
			});
		},
	});
}
