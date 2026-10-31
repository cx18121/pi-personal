import { readFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

type RepoStats = {
	label: string;
	additions: number;
	deletions: number;
	ahead: number;
	behind: number;
	stashes: number;
	dirty: boolean;
};

const emptyRepoStats = (cwd: string): RepoStats => ({
	label: basename(cwd),
	additions: 0,
	deletions: 0,
	ahead: 0,
	behind: 0,
	stashes: 0,
	dirty: false,
});

const parseCount = (value: string | undefined) => {
	const parsed = Number.parseInt(value ?? "0", 10);
	return Number.isFinite(parsed) ? parsed : 0;
};

const parseDiff = (diff: string) => diff
	.split("\n")
	.filter(Boolean)
	.map((line) => line.split("\t"))
	.reduce(
		(totals, [added, removed]) => ({
			additions: totals.additions + (added === "-" ? 0 : parseCount(added)),
			deletions: totals.deletions + (removed === "-" ? 0 : parseCount(removed)),
		}),
		{ additions: 0, deletions: 0 },
	);

const countFileLines = async (path: string) => readFile(path).then(
	(content) => {
		if (content.length === 0 || content.includes(0)) return 0;
		const text = content.toString("utf8");
		return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
	},
	() => 0,
);

const thinkingColor = (level: ReturnType<ExtensionAPI["getThinkingLevel"]>) => {
	switch (level) {
		case "off": return "thinkingOff";
		case "minimal": return "thinkingMinimal";
		case "low": return "thinkingLow";
		case "medium": return "thinkingMedium";
		case "high": return "thinkingHigh";
		case "xhigh": return "thinkingXhigh";
		case "max": return "thinkingMax";
	}
};

type Usage = { input?: number; cacheRead?: number; cacheWrite?: number };

// Share of the latest request's prompt served from the provider cache.
const cacheHitPercent = (usage: Usage | undefined) => {
	if (!usage) return undefined;
	const prompt = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
	return prompt > 0 ? Math.round((100 * (usage.cacheRead ?? 0)) / prompt) : undefined;
};

const latestAssistantUsage = (entries: ReadonlyArray<{ type: string; message?: { role?: string; usage?: Usage } }>) => {
	for (let index = entries.length - 1; index >= 0; index--) {
		const message = entries[index]?.message;
		if (entries[index]?.type === "message" && message?.role === "assistant" && message.usage) return message.usage;
	}
	return undefined;
};

type ProcessInfo = { name: string; status: string };
const LIVE_PROCESS_STATUSES = new Set(["running", "terminating", "terminate_timeout"]);

export default function (pi: ExtensionAPI) {
	let repoStats = emptyRepoStats(process.cwd());
	let cacheHit: number | undefined;
	let runningProcesses: string[] = [];
	let requestRender = () => {};

	// pi-processes answers list requests on its event bus. Show only live processes.
	const refreshProcesses = () => {
		let processes: ProcessInfo[] = [];
		pi.events.emit("processes:request:list", { reply: (result: ProcessInfo[]) => { processes = result; } });
		runningProcesses = processes.filter((item) => LIVE_PROCESS_STATUSES.has(item.status)).map((item) => item.name);
		requestRender();
	};
	pi.events.on("processes:changed", refreshProcesses);

	pi.on("message_end", (event) => {
		const message = event.message as { role?: string; usage?: Usage };
		if (message.role !== "assistant" || !message.usage) return;
		cacheHit = cacheHitPercent(message.usage);
		requestRender();
	});
	pi.on("session_tree", (_event, ctx) => {
		cacheHit = cacheHitPercent(latestAssistantUsage(ctx.sessionManager.getBranch() as never));
		requestRender();
	});

	const refreshRepoStats = async (cwd: string) => {
		const [location, status, diff, stashes, untracked] = await Promise.all([
			pi.exec("git", ["rev-parse", "--show-toplevel", "--git-common-dir"], { cwd, timeout: 2_000 }),
			pi.exec("git", ["status", "--porcelain=v2", "--branch"], { cwd, timeout: 2_000 }),
			pi.exec("git", ["diff", "--numstat", "HEAD", "--"], { cwd, timeout: 2_000 }),
			pi.exec("git", ["stash", "list", "--format=%gd"], { cwd, timeout: 2_000 }),
			pi.exec("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd, timeout: 2_000 }),
		]);

		if ([location, status, diff, stashes, untracked].some((result) => result.code !== 0)) {
			repoStats = emptyRepoStats(cwd);
			requestRender();
			return;
		}

		const [topLevel = cwd, commonDirectory = ".git"] = location.stdout.trim().split("\n");
		const commonPath = resolve(cwd, commonDirectory);
		const repository = basename(dirname(commonPath));
		const subdirectory = relative(topLevel, cwd);
		const branchLine = status.stdout.split("\n").find((line) => line.startsWith("# branch.ab "));
		const [, , ahead = "+0", behind = "-0"] = branchLine?.split(" ") ?? [];
		const changes = parseDiff(diff.stdout);
		const untrackedAdditions = await Promise.all(
			untracked.stdout.split("\0").filter(Boolean).map((path) => countFileLines(resolve(cwd, path))),
		).then((counts) => counts.reduce((sum, count) => sum + count, 0));

		repoStats = {
			label: subdirectory ? `${repository}/${subdirectory}` : repository,
			...changes,
			additions: changes.additions + untrackedAdditions,
			ahead: Math.abs(parseCount(ahead)),
			behind: Math.abs(parseCount(behind)),
			stashes: stashes.stdout.split("\n").filter(Boolean).length,
			dirty: status.stdout.split("\n").some((line) => line && !line.startsWith("#")),
		};
		requestRender();
	};

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		cacheHit = cacheHitPercent(latestAssistantUsage(ctx.sessionManager.getBranch() as never));
		refreshProcesses();

		ctx.ui.setFooter((tui, theme, footerData) => {
			requestRender = () => tui.requestRender();
			const unsubscribe = footerData.onBranchChange(() => {
				void refreshRepoStats(ctx.cwd);
			});

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number) {
					const separator = theme.fg("dim", "  ·  ");
					const branch = footerData.getGitBranch();
					const gitMarks = [
						repoStats.dirty ? "*" : "",
						repoStats.stashes > 0 ? "≡" : "",
						repoStats.ahead > 0 ? `⇡${repoStats.ahead}` : "",
						repoStats.behind > 0 ? `⇣${repoStats.behind}` : "",
					].filter(Boolean).join("");
					const location = [
						theme.bold(theme.fg("syntaxKeyword", repoStats.label)),
						branch ? theme.bold(theme.fg("syntaxType", ` ${branch}`)) : "",
						gitMarks ? theme.fg(repoStats.dirty ? "warning" : "accent", `(${gitMarks})`) : "",
					].filter(Boolean).join("  ");
					const locationLine = truncateToWidth(location, width, theme.fg("dim", "…"));
					const model = theme.bold(theme.fg("customMessageLabel", ctx.model?.id ?? "no model"));
					const thinkingLevel = pi.getThinkingLevel();
					const thinking = theme.fg(thinkingColor(thinkingLevel), thinkingLevel);
					const statuses = footerData.getExtensionStatuses();
					const autonomy = statuses.get("autonomy");
					const fastMode = statuses.get("fast-mode");
					const context = ctx.getContextUsage();
					const contextPercent = context?.percent;
					const roundedContext = contextPercent === null || contextPercent === undefined
						? undefined
						: Math.round(contextPercent);
					const formatContext = (text: string) => {
						if (roundedContext !== undefined && roundedContext > 80) return theme.fg("error", text);
						if (roundedContext !== undefined && roundedContext > 50) return `\u001b[38;2;214;162;67m${text}\u001b[39m`;
						return theme.fg("success", text);
					};
					const filled = roundedContext === undefined ? 0 : Math.max(0, Math.min(10, Math.round(roundedContext / 10)));
					const contextBar = `${formatContext("█".repeat(filled))}${theme.fg("borderMuted", "█".repeat(10 - filled))}`;
					const contextLabel = formatContext(roundedContext === undefined ? "?" : `${roundedContext}%`);
					// Low hit rates on follow-up requests usually mean something rewrote the prompt prefix.
					const cacheLabel = cacheHit === undefined
						? ""
						: theme.fg(cacheHit < 50 ? "error" : cacheHit < 80 ? "warning" : "dim", `cache ${cacheHit}%`);
					const worktreeDiff = [
						repoStats.additions > 0 ? theme.fg("success", `+${repoStats.additions}`) : "",
						repoStats.deletions > 0 ? theme.fg("error", `−${repoStats.deletions}`) : "",
					].filter(Boolean).join(" ");
					const processes = runningProcesses.length === 0 ? ""
						: theme.fg("accent", runningProcesses.length === 1 ? `▶ ${runningProcesses[0]}` : `▶ ${runningProcesses.length} processes`);
					const status = [
						[model, thinking, fastMode, autonomy ? theme.fg("accent", `autonomy ${autonomy}`) : ""].filter(Boolean).join(" "),
						[`${contextBar} ${contextLabel}`, cacheLabel].filter(Boolean).join(" "),
						worktreeDiff,
						processes,
					].filter(Boolean).join(separator);
					const statusLine = truncateToWidth(status, width, theme.fg("dim", "…"));
					return [locationLine, statusLine];
				},
			};
		});

		await refreshRepoStats(ctx.cwd);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		await refreshRepoStats(ctx.cwd);
	});
}
