import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	findActiveBackgroundWork,
	formatActiveBackgroundWorkError,
} from "../lib/background-work.js";

const PENDING_RELOAD_KEY = Symbol.for("pi-personal:pending-reload-continuation");

type PendingReloadContinuation = {
	sessionId: string;
	message: string;
};

type GlobalWithReload = typeof globalThis & {
	[PENDING_RELOAD_KEY]?: PendingReloadContinuation;
};

type CommandRunner = Pick<ExtensionAPI, "exec">;

export interface OpenHerdrSessionOptions {
	path?: string;
	prompt?: string;
	label?: string;
	focus?: boolean;
}

export interface OpenHerdrSessionResult {
	cwd: string;
	workspaceId?: string;
	tabId?: string;
	paneId: string;
	label?: string;
	prompt?: string;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function cleanSessionName(raw: string): string {
	const cleaned = raw.replace(/\s+/g, " ").trim();
	if (!cleaned) {
		throw new Error("Session name must not be empty.");
	}
	return cleaned.length > 120 ? cleaned.slice(0, 120).trimEnd() : cleaned;
}

export function deriveTabLabel(label?: string, prompt?: string, targetDir?: string): string | undefined {
	const explicit = label?.replace(/\s+/g, " ").trim();
	if (explicit) return truncateLabel(explicit);
	const fromPrompt = prompt?.replace(/\s+/g, " ").trim();
	if (fromPrompt) return truncateLabel(fromPrompt);
	if (targetDir) return truncateLabel(basename(targetDir));
	return undefined;
}

function truncateLabel(value: string, maxLength = 40): string {
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

async function canonicalDirectory(inputPath: string, currentCwd: string): Promise<string> {
	const trimmed = inputPath.trim().replace(/^@/, "");
	if (!trimmed) throw new Error("Target directory path is empty.");
	const expanded =
		trimmed === "~"
			? homedir()
			: trimmed.startsWith("~/") || trimmed.startsWith("~\\")
				? join(homedir(), trimmed.slice(2))
				: trimmed;
	const candidate = isAbsolute(expanded) ? resolve(expanded) : resolve(currentCwd, expanded);
	const info = await stat(candidate).catch(() => undefined);
	if (!info) throw new Error(`Directory does not exist: ${candidate}`);
	if (!info.isDirectory()) throw new Error(`Path is not a directory: ${candidate}`);
	return realpath(candidate);
}

function parseHerdrEnvelope(stdout: string, stderr: string): { result?: Record<string, any>; error?: { code?: string; message?: string } } {
	for (const text of [stdout, stderr]) {
		const trimmed = text.trim();
		if (!trimmed) continue;
		try {
			return JSON.parse(trimmed) as { result?: Record<string, any>; error?: { code?: string; message?: string } };
		} catch {
			// Try next output stream.
		}
	}
	return {};
}

async function runHerdrJson(
	pi: CommandRunner,
	args: string[],
	cwd: string,
	signal: AbortSignal | undefined,
	timeout: number,
): Promise<Record<string, any>> {
	const res = await pi.exec("herdr", args, { cwd, signal, timeout });
	if (signal?.aborted || res.killed) throw new Error("Aborted");
	const envelope = parseHerdrEnvelope(res.stdout, res.stderr);
	if (res.code !== 0 || envelope.error) {
		const message = envelope.error
			? `${envelope.error.code ?? "herdr_error"}: ${envelope.error.message ?? "unknown Herdr error"}`
			: res.stderr.trim() || res.stdout.trim() || `herdr ${args.join(" ")} failed`;
		throw new Error(message);
	}
	return envelope.result ?? {};
}

async function tryResolveGitSourceCheckout(
	pi: CommandRunner,
	targetDir: string,
	signal: AbortSignal | undefined,
): Promise<string | undefined> {
	try {
		const result = await runHerdrJson(pi, ["worktree", "list", "--cwd", targetDir], targetDir, signal, 5_000);
		const source = result?.source?.source_checkout_path;
		return typeof source === "string" && source ? await canonicalDirectory(source, targetDir) : undefined;
	} catch {
		return undefined;
	}
}

export async function executeOpenHerdrSession(
	pi: CommandRunner,
	ctx: Pick<ExtensionContext, "cwd">,
	signal: AbortSignal | undefined,
	options: OpenHerdrSessionOptions,
): Promise<OpenHerdrSessionResult> {
	const targetDir = options.path ? await canonicalDirectory(options.path, ctx.cwd) : await canonicalDirectory(ctx.cwd, ctx.cwd);
	const prompt = options.prompt?.trim() || undefined;
	const focus = options.focus ?? true;
	const focusFlag = focus ? "--focus" : "--no-focus";
	const label = deriveTabLabel(options.label, prompt, targetDir);

	const currentWorkspace = process.env.HERDR_WORKSPACE_ID;
	const sourceCheckout = await tryResolveGitSourceCheckout(pi, targetDir, signal);

	let workspaceId: string | undefined;
	let tabId: string | undefined;
	let paneId: string | undefined;

	if (sourceCheckout) {
		const openArgs = ["worktree", "open", "--cwd", sourceCheckout, "--path", targetDir];
		if (label) openArgs.push("--label", label);
		openArgs.push(focusFlag);
		const opened = await runHerdrJson(pi, openArgs, sourceCheckout, signal, 30_000);
		workspaceId = typeof opened?.workspace?.workspace_id === "string" ? opened.workspace.workspace_id : undefined;

		if (opened?.already_open) {
			if (!workspaceId) throw new Error("Herdr worktree open response did not include workspace.workspace_id");
			const tabArgs = ["tab", "create", "--workspace", workspaceId, "--cwd", targetDir];
			if (label) tabArgs.push("--label", label);
			tabArgs.push(focusFlag);
			const created = await runHerdrJson(pi, tabArgs, targetDir, signal, 10_000);
			tabId = typeof created?.tab?.tab_id === "string" ? created.tab.tab_id : undefined;
			paneId = typeof created?.root_pane?.pane_id === "string" ? created.root_pane.pane_id : undefined;
		} else {
			tabId = typeof opened?.tab?.tab_id === "string" ? opened.tab.tab_id : undefined;
			paneId = typeof opened?.root_pane?.pane_id === "string" ? opened.root_pane.pane_id : undefined;
		}
	} else {
		if (!currentWorkspace) {
			throw new Error("HERDR_WORKSPACE_ID is missing and the target directory is not a Git worktree.");
		}
		workspaceId = currentWorkspace;
		const tabArgs = ["tab", "create", "--workspace", currentWorkspace, "--cwd", targetDir];
		if (label) tabArgs.push("--label", label);
		tabArgs.push(focusFlag);
		const created = await runHerdrJson(pi, tabArgs, targetDir, signal, 10_000);
		tabId = typeof created?.tab?.tab_id === "string" ? created.tab.tab_id : undefined;
		paneId = typeof created?.root_pane?.pane_id === "string" ? created.root_pane.pane_id : undefined;
	}

	if (!paneId) {
		throw new Error("Herdr did not return a pane id for the new session.");
	}

	const piArgs = prompt ? ["pi", prompt] : ["pi"];
	const command = piArgs.map(shellQuote).join(" ");
	const runResult = await pi.exec("herdr", ["pane", "run", paneId, command], {
		cwd: targetDir,
		signal,
		timeout: 10_000,
	});
	if (signal?.aborted || runResult.killed) throw new Error("Aborted");
	if (runResult.code !== 0) {
		throw new Error(runResult.stderr.trim() || runResult.stdout.trim() || "Failed to launch Pi in the new Herdr pane.");
	}

	return { cwd: targetDir, workspaceId, tabId, paneId, label, prompt };
}

export default function registerSessionControls(pi: ExtensionAPI) {
	let pendingReload: { force: boolean; continueMessage?: string } | undefined;
	let activeReload: { force: boolean; continueMessage?: string } | undefined;

	pi.on("session_start", (event, ctx) => {
		if (event.reason !== "reload") return;
		const globalState = globalThis as GlobalWithReload;
		const pending = globalState[PENDING_RELOAD_KEY];
		if (!pending) return;
		if (pending.sessionId !== ctx.sessionManager.getSessionId()) return;
		delete globalState[PENDING_RELOAD_KEY];
		pi.sendUserMessage(pending.message);
	});

	pi.on("session_shutdown", () => {
		pendingReload = undefined;
		activeReload = undefined;
	});

	pi.registerCommand("reload-runtime", {
		description: "Reload Pi extensions, skills, prompts, themes, and context files",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const request = activeReload;
			activeReload = undefined;
			const force = request?.force === true || args.trim() === "--force" || args.trim() === "-f";

			if (!force) {
				const activeWork = findActiveBackgroundWork(pi.events, ctx.sessionManager.getSessionId());
				if (activeWork.processes.length > 0 || activeWork.subagents.length > 0) {
					ctx.ui.notify(
						formatActiveBackgroundWorkError(
							activeWork,
							"reload the runtime",
							"Stop them first or pass --force to stop them and reload anyway.",
						),
						"error",
					);
					return;
				}
			}

			const globalState = globalThis as GlobalWithReload;
			if (request?.continueMessage) {
				globalState[PENDING_RELOAD_KEY] = {
					sessionId: ctx.sessionManager.getSessionId(),
					message: request.continueMessage,
				};
			}

			try {
				await ctx.reload();
			} catch (error) {
				delete globalState[PENDING_RELOAD_KEY];
				throw error;
			}
			return;
		},
	});

	pi.registerTool(
		defineTool({
			name: "reload_runtime",
			label: "Reload Runtime",
			description:
				"Reload Pi extensions, skills, prompts, themes, settings, and context files in this session without restarting Pi.",
			promptSnippet: "Reload Pi extensions, skills, prompts, and context files in place after editing them",
			promptGuidelines: [
				"Use reload_runtime after editing Pi extensions, skills, prompts, settings, or AGENTS.md when you or the user want the current session to pick up the changes right away.",
				"Reloading stops running background processes and active subagents, so do not force it while they are still needed.",
			],
			parameters: Type.Object({
				continue_message: Type.Optional(
					Type.String({
						description: "Optional short prompt to automatically resume with once the reload finishes.",
					}),
				),
				force: Type.Optional(
					Type.Boolean({
						description: "Proceed even if background processes or subagents are active (stopping them).",
					}),
				),
			}),
			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const force = params.force === true;
				if (!force) {
					const activeWork = findActiveBackgroundWork(pi.events, ctx.sessionManager.getSessionId());
					if (activeWork.processes.length > 0 || activeWork.subagents.length > 0) {
						throw new Error(
							formatActiveBackgroundWorkError(
								activeWork,
								"reload the runtime",
								"Wait for or stop them first, or call reload_runtime with force: true to stop them and reload anyway.",
							),
						);
					}
				}

				const continueMessage = params.continue_message?.trim() || undefined;
				pendingReload = { force, continueMessage };
				return {
					content: [
						{
							type: "text" as const,
							text: continueMessage
								? "Reloading Pi runtime and continuing once reload completes."
								: "Reloading Pi runtime.",
						},
					],
					details: { force, continueMessage },
					terminate: true,
				};
			},
		}),
	);

	pi.on("agent_settled", () => {
		if (!pendingReload) return;
		const next = pendingReload;
		pendingReload = undefined;
		activeReload = next;
		pi.sendUserMessage(next.force ? "/reload-runtime --force" : "/reload-runtime", {
			expandPromptTemplates: true,
		});
	});

	pi.registerTool(
		defineTool({
			name: "rename_session",
			label: "Rename Session",
			description: "Set or update the display name of the current Pi session shown in /resume and the terminal title.",
			promptSnippet: "Rename the current Pi session when requested or when the session's focus changes",
			parameters: Type.Object({
				name: Type.String({
					description: "New display name for the current session.",
				}),
			}),
			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const previousName = ctx.sessionManager.getSessionName();
				const name = cleanSessionName(params.name);
				pi.setSessionName(name);
				return {
					content: [{ type: "text" as const, text: `Renamed session to "${name}".` }],
					details: { previousName, name },
				};
			},
		}),
	);

	if (process.env.HERDR_ENV === "1") {
		pi.registerTool(
			defineTool({
				name: "open_herdr_session",
				label: "Open Herdr Session",
				description:
					"Open a new independent interactive Pi session in another Herdr tab or worktree workspace without closing this session.",
				promptSnippet: "Open a separate interactive Pi tab in Herdr without closing this session",
				promptGuidelines: [
					"Use open_herdr_session only when the user explicitly asks to open another interactive Pi tab or window while keeping this session open.",
				],
				parameters: Type.Object({
					path: Type.Optional(
						Type.String({
							description: "Existing directory or Git worktree for the new session. Defaults to the current working directory.",
						}),
					),
					prompt: Type.Optional(
						Type.String({
							description: "Optional initial prompt to start the new Pi session with.",
						}),
					),
					label: Type.Optional(
						Type.String({
							description: "Optional Herdr tab label.",
						}),
					),
					focus: Type.Optional(
						Type.Boolean({
							description: "Whether to focus the new Herdr tab. Defaults to true.",
						}),
					),
				}),
				async execute(_toolCallId, params, signal, _onUpdate, ctx) {
					const opened = await executeOpenHerdrSession(pi, ctx, signal, {
						path: params.path,
						prompt: params.prompt,
						label: params.label,
						focus: params.focus,
					});
					return {
						content: [
							{
								type: "text" as const,
								text:
									`Opened new Pi session in Herdr.\n` +
									`Directory: ${opened.cwd}\n` +
									`Workspace: ${opened.workspaceId ?? "unknown"}\n` +
									`Pane: ${opened.paneId}`,
							},
						],
						details: opened,
					};
				},
			}),
		);
	}
}
