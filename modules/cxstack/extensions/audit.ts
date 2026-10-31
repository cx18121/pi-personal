import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { batches, computeMetrics, digest, parseSession, providerFailures, type Session } from "../lib/audit.js";

const cxstackRoot = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const packageRoot = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const DAY = 24 * 60 * 60 * 1000;

type Paths = { sessions: string; audits: string };
const defaultPaths = (): Paths => ({ sessions: join(getAgentDir(), "sessions"), audits: join(getAgentDir(), "cxstack", "audits") });

const latestAudit = (audits: string) => {
	try {
		// An audit counts once its report is saved, so an abandoned review leaves its sessions for the next one.
		const name = readdirSync(audits).filter((entry) => /^\d{4}-/.test(entry) && existsSync(join(audits, entry, "report.md"))).sort().at(-1);
		return name ? join(audits, name) : undefined;
	} catch {
		return undefined;
	}
};

const fixedPromptChars = (ctx: ExtensionContext) => {
	const system = ctx.sessionManager.getBranch().find((entry: any) => entry.type === "message" && entry.message?.role === "system") as any;
	if (!system) return undefined;
	const sections = Object.values(system.message.sections ?? {}).filter((value) => typeof value === "string") as string[];
	return sections.reduce((sum, value) => sum + value.length, 0) + JSON.stringify(system.message.toolsAdded ?? []).length;
};

export function runAudit(ctx: ExtensionContext, days: number | undefined, paths: Paths, now = Date.now()) {
	const previous = latestAudit(paths.audits);
	let previousUntil: number | undefined;
	if (previous) {
		try { previousUntil = Date.parse(JSON.parse(readFileSync(join(previous, "metrics.json"), "utf8")).until); } catch { /* unreadable previous audit */ }
	}
	const since = days !== undefined ? now - days * DAY : previousUntil ?? now - 30 * DAY;
	const current = ctx.sessionManager.getSessionFile();
	const files = readdirSync(paths.sessions).flatMap((dir) => {
		try { return readdirSync(join(paths.sessions, dir)).filter((name) => name.endsWith(".jsonl")).map((name) => join(paths.sessions, dir, name)); }
		catch { return []; }
	}).filter((file) => file !== current && statSync(file).mtimeMs >= since).sort();

	const seen = new Set<string>();
	const seenErrors = new Set<string>();
	const sessions: Session[] = [];
	const failures = { errors: 0, hangs: 0 };
	for (const file of files) {
		const lines = readFileSync(file, "utf8").split("\n");
		const session = parseSession(lines, since, seen);
		if (!session) continue;
		sessions.push(session);
		const found = providerFailures(lines, since, seenErrors);
		failures.errors += found.errors;
		failures.hangs += found.hangs;
	}
	sessions.sort((a, b) => a.turns[0]!.at - b.turns[0]!.at);
	const metrics = computeMetrics(sessions, failures, since, now, fixedPromptChars(ctx));
	const dir = join(paths.audits, new Date(now).toISOString().replace(/[:.]/g, "-"));
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
	// Sessions of one or two turns rarely show a trajectory. Their counts stay in the metrics.
	const parts = batches(sessions.filter((session) => session.turns.length >= 3).map(digest));
	parts.forEach((text, index) => writeFileSync(join(dir, `batch-${index + 1}.md`), text));
	return { dir, metrics, batches: parts.length, previous: previous && previousUntil !== undefined ? join(previous, "metrics.json") : undefined };
}

export default function (pi: ExtensionAPI, paths: () => Paths = defaultPaths) {
	const template = readFileSync(join(cxstackRoot, "resources", "audit.md"), "utf8");

	pi.registerCommand("audit", {
		description: "Review recent sessions for setup and CXStack improvements (optional: number of days)",
		handler: async (args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for Pi to finish, then retry /audit.", "warning");
				return;
			}
			const days = args.trim() ? Number(args.trim()) : undefined;
			if (days !== undefined && !(days > 0)) {
				ctx.ui.notify("Use /audit or /audit <days>.", "warning");
				return;
			}
			const result = runAudit(ctx, days, paths());
			if (result.metrics.sessions === 0) {
				ctx.ui.notify("No sessions since the last audit.", "info");
				return;
			}
			const instructions = template
				.replaceAll("{{CXSTACK_ROOT}}", cxstackRoot)
				.replaceAll("{{PACKAGE_ROOT}}", packageRoot)
				.replaceAll("{{AUDIT_DIR}}", result.dir)
				.replaceAll("{{SESSIONS}}", String(result.metrics.sessions))
				.replaceAll("{{SINCE}}", result.metrics.since.slice(0, 10))
				.replaceAll("{{BATCHES}}", String(result.batches))
				.replaceAll("{{PREVIOUS}}", result.previous ? `The previous audit's metrics are at \`${result.previous}\`.` : "There is no previous audit to compare against.");
			pi.sendUserMessage(instructions);
		},
	});
}
