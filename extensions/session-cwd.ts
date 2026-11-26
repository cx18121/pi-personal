import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
	CURRENT_SESSION_VERSION,
	defineTool,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type SessionManagerView = ExtensionCommandContext["sessionManager"];

const PROCESSES_REQUEST_LIST = "processes:request:list";

export interface ParsedCdArgs {
	path?: string;
	force: boolean;
}

export interface ActiveBackgroundWork {
	processes: string[];
	subagents: string[];
}

export interface MoveSessionOptions {
	force: boolean;
	continueAgent: boolean;
	events?: Pick<ExtensionAPI["events"], "emit">;
	agentDir?: string;
	chdir?: (dir: string) => void;
}

export interface MoveSessionResult {
	moved: boolean;
	reason?: "same" | "cancelled";
	from: string;
	to: string;
	sessionFile?: string;
}

export function parseCdArgs(rawArgs: string): ParsedCdArgs {
	let remaining = rawArgs.trim();
	let force = false;

	while (remaining.length > 0) {
		const leadingFlag = remaining.match(/^(--force|-f)(?:\s+|$)/);
		if (leadingFlag) {
			force = true;
			remaining = remaining.slice(leadingFlag[0].length).trimStart();
			continue;
		}
		const trailingFlag = remaining.match(/(?:^|\s+)(--force|-f)$/);
		if (trailingFlag) {
			force = true;
			remaining = remaining.slice(0, remaining.length - trailingFlag[0].length).trimEnd();
			continue;
		}
		break;
	}

	if (!remaining) return { force };

	if (remaining.startsWith('"') && remaining.endsWith('"') && remaining.length >= 2) {
		try {
			const parsed: unknown = JSON.parse(remaining);
			if (typeof parsed === "string") return { path: parsed, force };
		} catch {
			return { path: remaining.slice(1, -1), force };
		}
	}
	if (remaining.startsWith("'") && remaining.endsWith("'") && remaining.length >= 2) {
		return { path: remaining.slice(1, -1), force };
	}

	return { path: remaining, force };
}

export function formatCdCommand(targetDir: string, force: boolean): string {
	return force ? `/cd --force ${JSON.stringify(targetDir)}` : `/cd ${JSON.stringify(targetDir)}`;
}

export function expandPathInput(inputPath: string, currentCwd: string): string {
	const trimmed = inputPath.trim().replace(/^@/, "");
	if (!trimmed) {
		throw new Error("Target directory path is empty.");
	}
	if (trimmed === "~") return homedir();
	if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
		return join(homedir(), trimmed.slice(2));
	}
	return isAbsolute(trimmed) ? resolve(trimmed) : resolve(currentCwd, trimmed);
}

export async function resolveTargetDirectory(inputPath: string, currentCwd: string): Promise<string> {
	const candidate = expandPathInput(inputPath, currentCwd);
	const info = await stat(candidate).catch(() => undefined);
	if (!info) {
		throw new Error(`Directory does not exist: ${candidate}`);
	}
	if (!info.isDirectory()) {
		throw new Error(`Path is not a directory: ${candidate}`);
	}
	return realpath(candidate);
}

async function canonicalOrResolved(dir: string): Promise<string> {
	return realpath(dir).catch(() => resolve(dir));
}

export function defaultSessionDirFor(cwd: string, agentDir = getAgentDir()): string {
	const safePath = `--${resolve(cwd).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
	return join(resolve(agentDir), "sessions", safePath);
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

export function formatActiveBackgroundWorkError(work: ActiveBackgroundWork, fromCommand: boolean): string {
	const parts: string[] = [];
	if (work.processes.length > 0) {
		parts.push(`running background processes (${work.processes.join(", ")})`);
	}
	if (work.subagents.length > 0) {
		parts.push(`active subagents (${work.subagents.join(", ")})`);
	}
	const overrideHint = fromCommand
		? "Stop them first or pass --force to stop them and move anyway."
		: "Wait for or stop them first, or call change_directory with force: true to stop them and move anyway.";
	return `Cannot change working directory while there are ${parts.join(" and ")}. ${overrideHint}`;
}

function generateEntryId(existingIds: Set<string>): string {
	for (let attempt = 0; attempt < 100; attempt++) {
		const candidate = crypto.randomUUID().slice(0, 8);
		if (!existingIds.has(candidate)) return candidate;
	}
	return crypto.randomUUID();
}

export async function writeMovedSessionFile(
	sessionManager: SessionManagerView,
	targetDir: string,
	options?: { agentDir?: string },
): Promise<string> {
	const agentDir = options?.agentDir ?? getAgentDir();
	const currentSessionDir = sessionManager.getSessionDir();
	const defaultCurrentDir = defaultSessionDirFor(sessionManager.getCwd(), agentDir);
	const targetSessionDir =
		resolve(currentSessionDir) === resolve(defaultCurrentDir)
			? defaultSessionDirFor(targetDir, agentDir)
			: currentSessionDir;

	await mkdir(targetSessionDir, { recursive: true });

	const newSessionId = crypto.randomUUID();
	const timestamp = new Date().toISOString();
	const fileTimestamp = timestamp.replace(/[:.]/g, "-");
	const newSessionFile = join(targetSessionDir, `${fileTimestamp}_${newSessionId}.jsonl`);

	const header = {
		type: "session" as const,
		version: CURRENT_SESSION_VERSION,
		id: newSessionId,
		timestamp,
		cwd: targetDir,
	};

	const allEntries = sessionManager.getEntries();
	const leafId = sessionManager.getLeafId();
	const lastEntry = allEntries.at(-1);

	let entriesToCopy: SessionEntry[];
	if (allEntries.length === 0) {
		entriesToCopy = [];
	} else if (leafId === lastEntry?.id) {
		entriesToCopy = [...allEntries];
	} else {
		entriesToCopy = [...sessionManager.getBranch()];
	}

	const sessionName = sessionManager.getSessionName();
	if (sessionName) {
		const lastNameEntry = [...entriesToCopy]
			.reverse()
			.find((entry) => entry.type === "session_info" && typeof entry.name === "string");
		if (!lastNameEntry || (lastNameEntry.type === "session_info" && lastNameEntry.name?.trim() !== sessionName)) {
			const existingIds = new Set(entriesToCopy.map((entry) => entry.id));
			const parentId = entriesToCopy.at(-1)?.id ?? null;
			entriesToCopy.push({
				type: "session_info",
				id: generateEntryId(existingIds),
				parentId,
				timestamp,
				name: sessionName,
			});
		}
	}

	const lines = [header, ...entriesToCopy].map((entry) => JSON.stringify(entry));
	await writeFile(newSessionFile, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "wx" });
	return newSessionFile;
}

export async function executeSessionMove(
	ctx: Pick<ExtensionCommandContext, "cwd" | "sessionManager" | "switchSession" | "ui">,
	rawTargetPath: string,
	options: MoveSessionOptions,
): Promise<MoveSessionResult> {
	const oldSessionFile = ctx.sessionManager.getSessionFile();
	if (!oldSessionFile) {
		throw new Error("Cannot change working directory in an ephemeral (--no-session) session.");
	}

	const targetDir = await resolveTargetDirectory(rawTargetPath, ctx.cwd);
	const currentDir = await canonicalOrResolved(ctx.cwd);
	if (targetDir === currentDir) {
		return { moved: false, reason: "same", from: currentDir, to: targetDir };
	}

	if (!options.force) {
		const activeWork = findActiveBackgroundWork(
			options.events,
			ctx.sessionManager.getSessionId(),
			options.agentDir,
		);
		if (activeWork.processes.length > 0 || activeWork.subagents.length > 0) {
			throw new Error(formatActiveBackgroundWorkError(activeWork, !options.continueAgent));
		}
	}

	const newSessionFile = await writeMovedSessionFile(ctx.sessionManager, targetDir, {
		agentDir: options.agentDir,
	});
	const chdir = options.chdir ?? ((dir: string) => process.chdir(dir));
	const continueAgent = options.continueAgent;

	try {
		const switchResult = await ctx.switchSession(newSessionFile, {
			withSession: async (nextCtx) => {
				try {
					chdir(targetDir);
				} catch {
					// Keep going even if process.chdir fails in a restricted runtime.
				}
				if (oldSessionFile !== newSessionFile) {
					await rm(oldSessionFile, { force: true }).catch(() => undefined);
				}
				nextCtx.ui.notify(`Working directory: ${targetDir}`, "info");
				if (continueAgent) {
					await nextCtx.sendUserMessage(`Working directory changed to ${targetDir}. Continue.`);
				}
			},
		});

		if (switchResult.cancelled) {
			await rm(newSessionFile, { force: true }).catch(() => undefined);
			return { moved: false, reason: "cancelled", from: currentDir, to: targetDir };
		}

		return { moved: true, from: currentDir, to: targetDir, sessionFile: newSessionFile };
	} catch (error) {
		await rm(newSessionFile, { force: true }).catch(() => undefined);
		throw error;
	}
}

export default function registerSessionCwd(pi: ExtensionAPI) {
	let pendingToolMove: { targetDir: string; force: boolean } | undefined;
	let activeToolMove: { targetDir: string; force: boolean } | undefined;

	pi.on("session_shutdown", () => {
		pendingToolMove = undefined;
		activeToolMove = undefined;
	});

	pi.registerCommand("cd", {
		description: "Move this Pi session's working directory to another existing directory (--force stops active jobs)",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();

			const parsed = parseCdArgs(args);
			if (!parsed.path) {
				ctx.ui.notify(`Current working directory: ${ctx.cwd}`, "info");
				return;
			}

			let targetDir: string;
			try {
				targetDir = await resolveTargetDirectory(parsed.path, ctx.cwd);
			} catch (error) {
				activeToolMove = undefined;
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}

			const fromTool = activeToolMove?.targetDir === targetDir;
			const force = parsed.force || (fromTool && activeToolMove?.force === true);
			activeToolMove = undefined;

			try {
				const result = await executeSessionMove(ctx, targetDir, {
					force,
					continueAgent: fromTool,
					events: pi.events,
				});
				if (!result.moved && result.reason === "same") {
					ctx.ui.notify(`Already in ${result.to}`, "info");
				} else if (!result.moved && result.reason === "cancelled") {
					ctx.ui.notify("Directory change cancelled.", "warning");
				}
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerTool(
		defineTool({
			name: "change_directory",
			label: "Change Directory",
			description:
				"Move this Pi session's working directory in place to an existing directory, preserving the conversation. Rebinds built-in tools, project context files, skills, and extensions to the target directory.",
			promptSnippet: "Move this Pi session's working directory in place to another existing directory",
			promptGuidelines: [
				"Use change_directory when the user asks to work in another existing directory or worktree in this same session, instead of prefixing every edit and command with another path.",
				"Changing directories stops running background processes and active subagents, so do not force it while they are still needed.",
			],
			parameters: Type.Object({
				path: Type.String({
					description: "Existing target directory (absolute, relative to the current working directory, or ~/...).",
				}),
				force: Type.Optional(
					Type.Boolean({
						description: "Proceed even if background processes or subagents are active (stopping them).",
					}),
				),
			}),
			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const currentFile = ctx.sessionManager.getSessionFile();
				if (!currentFile) {
					throw new Error("Cannot change working directory in an ephemeral (--no-session) session.");
				}

				const targetDir = await resolveTargetDirectory(params.path, ctx.cwd);
				const currentDir = await canonicalOrResolved(ctx.cwd);
				if (targetDir === currentDir) {
					return {
						content: [{ type: "text" as const, text: `Already in ${targetDir}.` }],
						details: { moved: false, from: currentDir, to: targetDir },
					};
				}

				const force = params.force === true;
				if (!force) {
					const activeWork = findActiveBackgroundWork(pi.events, ctx.sessionManager.getSessionId());
					if (activeWork.processes.length > 0 || activeWork.subagents.length > 0) {
						throw new Error(formatActiveBackgroundWorkError(activeWork, false));
					}
				}

				pendingToolMove = { targetDir, force };
				return {
					content: [
						{
							type: "text" as const,
							text: `Changing session working directory from ${currentDir} to ${targetDir}.`,
						},
					],
					details: { moved: true, from: currentDir, to: targetDir, force },
					terminate: true,
				};
			},
		}),
	);

	pi.on("agent_settled", () => {
		if (!pendingToolMove) return;
		const next = pendingToolMove;
		pendingToolMove = undefined;
		activeToolMove = next;
		pi.sendUserMessage(formatCdCommand(next.targetDir, next.force), { expandPromptTemplates: true });
	});
}
