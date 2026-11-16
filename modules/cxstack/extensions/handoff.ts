import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// /handoff asks the current agent, which still holds the full context and a warm
// prompt cache, to write the handoff to a file. The new session starts from a
// short pointer to that file, so the agent-written text never enters the new
// session as Charlie's own message, and memory cannot cite it as his words.
// Inside Herdr the new session opens in a new tab and the old one keeps running
// in its own tab. Elsewhere the new session replaces the old one in place.

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

const pointer = (file: string, session: string | undefined) =>
	`Continue from the handoff at ${file}. Read it, restate the goal and the next step in two lines, then continue.` +
	(session ? ` The previous session is ${session}; query it with session_query for details the handoff omits.` : "");

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/** Opens the new session in a focused Herdr tab beside the old one. Returns false outside Herdr. */
async function openInHerdrTab(exec: Exec, cwd: string, sessionDir: string, session: string, file: string, focus: string) {
	const workspace = process.env.HERDR_WORKSPACE_ID;
	if (process.env.HERDR_ENV !== "1" || !workspace) return false;
	// A header-only session file carries the parent link; pi --session opens it as a new session.
	const next = SessionManager.create(cwd, sessionDir, { parentSession: session });
	const nextFile = next.getSessionFile()!;
	mkdirSync(dirname(nextFile), { recursive: true });
	writeFileSync(nextFile, `${JSON.stringify(next.getHeader())}\n`, { flag: "wx" });
	const label = focus ? ["--label", focus.length > 40 ? `${focus.slice(0, 39)}…` : focus] : [];
	const created = await exec("herdr", ["tab", "create", "--workspace", workspace, "--cwd", cwd, ...label, "--focus"], { cwd, timeout: 10_000 });
	const pane = created.code === 0 ? JSON.parse(created.stdout).result?.root_pane?.pane_id : undefined;
	if (!pane) throw new Error(created.stderr.trim() || created.stdout.trim() || "herdr tab create failed");
	const command = ["pi", "--session", nextFile, "--handoff", file].map(shellQuote).join(" ");
	const ran = await exec("herdr", ["pane", "run", pane, command], { cwd, timeout: 10_000 });
	if (ran.code !== 0) throw new Error(ran.stderr.trim() || ran.stdout.trim() || "herdr pane run failed");
	return true;
}

export default function (pi: ExtensionAPI, handoffDir = join(getAgentDir(), "handoffs"), pollMs = 250) {
	pi.registerFlag("handoff", {
		description: "Start with a pointer to this handoff file in the editor (used by /handoff)",
		type: "string",
	});

	pi.on("session_start", (event, ctx) => {
		const file = pi.getFlag("handoff");
		if (event.reason !== "startup" || typeof file !== "string" || !file || !ctx.hasUI) return;
		ctx.ui.setEditorText(pointer(file, ctx.sessionManager.getHeader()?.parentSession));
		ctx.ui.notify(`Handoff saved to ${file}. Review it if you like, then press Enter.`, "info");
	});

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
			try {
				if (await openInHerdrTab(pi.exec.bind(pi), ctx.cwd, ctx.sessionManager.getSessionDir(), session, file, focus)) {
					ctx.ui.notify(`Handoff opened in a new Herdr tab. This session stays here.`, "info");
					return;
				}
			} catch (error) {
				ctx.ui.notify(`Could not open a Herdr tab (${error instanceof Error ? error.message : error}). Continuing in this tab.`, "warning");
			}
			await ctx.newSession({
				parentSession: session,
				withSession: async (next) => {
					next.ui.setEditorText(pointer(file, session));
					next.ui.notify(`Handoff saved to ${file}. Review it if you like, then press Enter.`, "info");
				},
			});
		},
	});

	// A compaction means the session has run long. Remind Charlie once per compaction; nothing enters the context.
	pi.on("session_compact", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.notify("This session has compacted. If the goal is done or has changed, consider /handoff.", "info");
	});
}
