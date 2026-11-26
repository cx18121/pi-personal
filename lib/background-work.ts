import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROCESSES_REQUEST_LIST = "processes:request:list";

export interface ActiveBackgroundWork {
	processes: string[];
	subagents: string[];
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		return code === "EPERM";
	}
}

export function findActiveBackgroundWork(
	events: Pick<ExtensionAPI["events"], "emit"> | undefined,
	sessionId: string | undefined,
	agentDir = getAgentDir(),
): ActiveBackgroundWork {
	const processes: string[] = [];
	if (events) {
		try {
			events.emit(PROCESSES_REQUEST_LIST, {
				reply: (list: unknown) => {
					if (!Array.isArray(list)) return;
					for (const item of list) {
						if (!item || typeof item !== "object") continue;
						const record = item as { status?: unknown; name?: unknown; id?: unknown };
						if (record.status === "running" || record.status === "terminating") {
							const label =
								typeof record.name === "string" && record.name.trim()
									? record.name.trim()
									: typeof record.id === "string"
										? record.id
										: "unnamed";
							processes.push(label);
						}
					}
				},
			});
		} catch {
			// Ignore if pi-processes is unavailable or throws.
		}
	}

	const subagents: string[] = [];
	if (sessionId) {
		const scopeKey = createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
		const scopeDir = join(resolve(agentDir), "pi-codex-subagents", "runs", scopeKey);
		if (existsSync(scopeDir)) {
			try {
				for (const name of readdirSync(scopeDir)) {
					if (!name.endsWith(".info.json")) continue;
					try {
						const raw = readFileSync(join(scopeDir, name), "utf8");
						const info = JSON.parse(raw) as {
							status?: unknown;
							canonicalName?: unknown;
							taskName?: unknown;
							childProcess?: { pid?: unknown };
						};
						if (info.status !== "starting" && info.status !== "running") continue;
						const pid = info.childProcess?.pid;
						if (typeof pid === "number" && Number.isInteger(pid) && pid > 0 && !isPidAlive(pid)) {
							continue;
						}
						const label =
							typeof info.canonicalName === "string" && info.canonicalName
								? info.canonicalName
								: typeof info.taskName === "string" && info.taskName
									? info.taskName
									: name;
						subagents.push(label);
					} catch {
						// Skip unreadable subagent metadata files.
					}
				}
			} catch {
				// Skip unreadable runs directory.
			}
		}
	}

	return { processes, subagents };
}

export function formatActiveBackgroundWorkError(
	work: ActiveBackgroundWork,
	actionDescription: string,
	overrideHint: string,
): string {
	const parts: string[] = [];
	if (work.processes.length > 0) {
		parts.push(`running background processes (${work.processes.join(", ")})`);
	}
	if (work.subagents.length > 0) {
		parts.push(`active subagents (${work.subagents.join(", ")})`);
	}
	return `Cannot ${actionDescription} while there are ${parts.join(" and ")}. ${overrideHint}`;
}
