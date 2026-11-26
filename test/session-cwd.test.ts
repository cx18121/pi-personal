import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	CURRENT_SESSION_VERSION,
	SessionManager,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import registerSessionCwd, {
	defaultSessionDirFor,
	executeSessionMove,
	findActiveBackgroundWork,
	formatCdCommand,
	getCdCompletions,
	parseCdArgs,
	parseGitWorktreeList,
	resolveTargetDirectory,
	writeMovedSessionFile,
} from "../extensions/session-cwd.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let testRoot: string;

beforeEach(async () => {
	testRoot = await mkdtemp(join(tmpdir(), "pi-session-cwd-"));
});

afterEach(async () => {
	await rm(testRoot, { recursive: true, force: true });
});

describe("parseCdArgs", () => {
	test("parses empty, unquoted, quoted, and force flags", () => {
		expect(parseCdArgs("")).toEqual({ force: false });
		expect(parseCdArgs("   ")).toEqual({ force: false });
		expect(parseCdArgs("/tmp/foo")).toEqual({ path: "/tmp/foo", force: false });
		expect(parseCdArgs("/tmp/my project")).toEqual({ path: "/tmp/my project", force: false });
		expect(parseCdArgs('--force "/tmp/my project"')).toEqual({ path: "/tmp/my project", force: true });
		expect(parseCdArgs('"/tmp/my project" -f')).toEqual({ path: "/tmp/my project", force: true });
		expect(parseCdArgs("'/tmp/single quoted' --force")).toEqual({ path: "/tmp/single quoted", force: true });
		expect(parseCdArgs("--force")).toEqual({ force: true });
		expect(parseCdArgs(formatCdCommand('/tmp/dir "quoted"', true).replace(/^\/cd\s+/, ""))).toEqual({
			path: '/tmp/dir "quoted"',
			force: true,
		});
	});
});

describe("cd argument completions", () => {
	test("parses git worktree porcelain output", () => {
		const porcelain = [
			"worktree /repos/app",
			"HEAD abcdef",
			"branch refs/heads/main",
			"",
			"worktree /repos/app.fix",
			"HEAD 123456",
			"branch refs/heads/fix/auth",
			"",
			"worktree /repos/app.detached",
			"HEAD 999999",
			"detached",
		].join("\n");

		expect(parseGitWorktreeList(porcelain)).toEqual([
			{ path: "/repos/app", branch: "main" },
			{ path: "/repos/app.fix", branch: "fix/auth" },
			{ path: "/repos/app.detached", branch: undefined },
		]);
	});

	test("suggests sibling worktrees, subdirectories, symlinks, and preserves --force", async () => {
		const base = join(testRoot, "repo");
		const sub = join(base, "packages");
		const spaced = join(base, "my app");
		const hidden = join(base, ".hidden");
		const file = join(base, "README.md");
		const sibling = join(testRoot, "repo.wt-auth");
		const linked = join(base, "linked-dir");
		await mkdir(sub, { recursive: true });
		await mkdir(spaced, { recursive: true });
		await mkdir(hidden, { recursive: true });
		await mkdir(sibling, { recursive: true });
		await writeFile(file, "hi");
		await symlink(sibling, linked);

		const worktrees = [
			{ path: base, branch: "main" },
			{ path: sibling, branch: "fix/auth" },
		];

		const initial = getCdCompletions("", base, worktrees)!;
		expect(initial[0]).toMatchObject({ value: sibling, description: "worktree · fix/auth" });
		expect(initial.map((item) => item.label)).toContain("../");
		expect(initial.map((item) => item.label)).toContain("packages/");
		expect(initial.map((item) => item.label)).toContain("linked-dir/");
		expect(initial.map((item) => item.label)).not.toContain(".hidden/");
		expect(initial.map((item) => item.label)).not.toContain("README.md/");

		const spacedMatch = getCdCompletions("my", base, worktrees)!;
		expect(spacedMatch).toEqual([{ value: '"my app/"', label: "my app/" }]);

		const dotMatch = getCdCompletions(".", base, worktrees)!;
		expect(dotMatch.map((item) => item.label)).toContain(".hidden/");

		const branchMatch = getCdCompletions("auth", base, worktrees)!;
		expect(branchMatch[0]).toMatchObject({ value: sibling, description: "worktree · fix/auth" });

		const forced = getCdCompletions("--force pack", base, worktrees)!;
		expect(forced).toEqual([{ value: "--force packages/", label: "packages/" }]);
	});
});

describe("resolveTargetDirectory", () => {
	test("resolves relative, tilde, @-prefixed, and symlinked directories", async () => {
		const baseDir = join(testRoot, "base");
		const targetDir = join(testRoot, "target");
		const linkDir = join(testRoot, "target-link");
		const filePath = join(testRoot, "file.txt");
		await mkdir(baseDir, { recursive: true });
		await mkdir(targetDir, { recursive: true });
		await symlink(targetDir, linkDir);
		await writeFile(filePath, "hello");

		const canonicalTarget = await realpath(targetDir);
		expect(await resolveTargetDirectory("../target", baseDir)).toBe(canonicalTarget);
		expect(await resolveTargetDirectory(`@${linkDir}`, baseDir)).toBe(canonicalTarget);
		expect(await resolveTargetDirectory("~", baseDir)).toBe(await realpath(homedir()));

		await expect(resolveTargetDirectory(join(testRoot, "missing"), baseDir)).rejects.toThrow(
			"Directory does not exist",
		);
		await expect(resolveTargetDirectory(filePath, baseDir)).rejects.toThrow("Path is not a directory");
	});
});

describe("findActiveBackgroundWork", () => {
	test("detects running pi-processes jobs and alive pi-codex-subagents children", async () => {
		const agentDir = join(testRoot, "agent");
		const sessionId = "session-abc";
		const scopeKey = createHash("sha256").update(sessionId).digest("hex").slice(0, 24);
		const scopeDir = join(agentDir, "pi-codex-subagents", "runs", scopeKey);
		await mkdir(scopeDir, { recursive: true });

		await writeFile(
			join(scopeDir, "alive.info.json"),
			JSON.stringify({
				status: "running",
				canonicalName: "worker/alive",
				childProcess: { pid: process.pid },
			}),
		);
		await writeFile(
			join(scopeDir, "dead.info.json"),
			JSON.stringify({
				status: "running",
				canonicalName: "worker/dead",
				childProcess: { pid: 999_999_999 },
			}),
		);
		await writeFile(
			join(scopeDir, "done.info.json"),
			JSON.stringify({
				status: "completed",
				canonicalName: "worker/done",
				childProcess: { pid: process.pid },
			}),
		);

		const events = {
			emit(channel: string, payload: unknown) {
				if (channel === "processes:request:list") {
					(payload as { reply: (list: unknown[]) => void }).reply([
						{ id: "p1", name: "dev-server", status: "running" },
						{ id: "p2", name: "old-build", status: "finished" },
					]);
				}
			},
		};

		const work = findActiveBackgroundWork(events, sessionId, agentDir);
		expect(work.processes).toEqual(["dev-server"]);
		expect(work.subagents).toEqual(["worker/alive"]);
	});
});

describe("writeMovedSessionFile", () => {
	test("copies full session to target default session dir without parentSession", async () => {
		const agentDir = join(testRoot, "agent");
		const dirA = join(testRoot, "dirA");
		const dirB = join(testRoot, "dirB");
		await mkdir(dirA, { recursive: true });
		await mkdir(dirB, { recursive: true });

		const sm = SessionManager.create(dirA, defaultSessionDirFor(dirA, agentDir));
		sm.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });
		sm.appendSessionInfo("My Session");

		const movedFile = await writeMovedSessionFile(
			sm as ExtensionCommandContext["sessionManager"],
			dirB,
			{ agentDir },
		);
		expect(movedFile.startsWith(defaultSessionDirFor(dirB, agentDir))).toBe(true);

		const lines = (await readFile(movedFile, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
		expect(lines[0]).toMatchObject({
			type: "session",
			version: CURRENT_SESSION_VERSION,
			cwd: dirB,
		});
		expect(lines[0].parentSession).toBeUndefined();
		expect(lines.some((entry) => entry.type === "message" && entry.message.content === "hello")).toBe(true);
		expect(lines.some((entry) => entry.type === "session_info" && entry.name === "My Session")).toBe(true);
	});

	test("preserves custom sessionDir and active branch when navigated earlier via /tree", async () => {
		const agentDir = join(testRoot, "agent");
		const customSessionDir = join(testRoot, "custom-sessions");
		const dirA = join(testRoot, "dirA");
		const dirB = join(testRoot, "dirB");
		await mkdir(dirA, { recursive: true });
		await mkdir(dirB, { recursive: true });

		const sm = SessionManager.create(dirA, customSessionDir);
		const firstId = sm.appendMessage({ role: "user", content: "first", timestamp: Date.now() });
		sm.appendMessage({ role: "user", content: "second-abandoned", timestamp: Date.now() });
		sm.appendSessionInfo("Branched Name");
		sm.branch(firstId);

		const movedFile = await writeMovedSessionFile(
			sm as ExtensionCommandContext["sessionManager"],
			dirB,
			{ agentDir },
		);
		expect(dirname(movedFile)).toBe(customSessionDir);

		const reopened = SessionManager.open(movedFile);
		expect(reopened.getCwd()).toBe(dirB);
		expect(reopened.getSessionName()).toBe("Branched Name");
		const contents = reopened
			.getBranch()
			.filter((entry) => entry.type === "message")
			.map((entry) => entry.message.content);
		expect(contents).toEqual(["first"]);
	});

	test("writes a valid header-only session file for an empty session", async () => {
		const agentDir = join(testRoot, "agent");
		const dirA = join(testRoot, "dirA");
		const dirB = join(testRoot, "dirB");
		await mkdir(dirA, { recursive: true });
		await mkdir(dirB, { recursive: true });

		const sm = SessionManager.create(dirA, defaultSessionDirFor(dirA, agentDir));
		const movedFile = await writeMovedSessionFile(
			sm as ExtensionCommandContext["sessionManager"],
			dirB,
			{ agentDir },
		);

		const reopened = SessionManager.open(movedFile);
		expect(reopened.getCwd()).toBe(dirB);
		expect(reopened.getEntries()).toEqual([]);
	});
});

describe("executeSessionMove", () => {
	test("moves session, aligns chdir, removes old file, and supports continuation", async () => {
		const agentDir = join(testRoot, "agent");
		const dirA = await realpath(await mkdir(join(testRoot, "dirA"), { recursive: true }).then(() => join(testRoot, "dirA")));
		const dirB = await realpath(await mkdir(join(testRoot, "dirB"), { recursive: true }).then(() => join(testRoot, "dirB")));

		const sm = SessionManager.create(dirA, defaultSessionDirFor(dirA, agentDir));
		sm.appendMessage({ role: "user", content: "hi", timestamp: Date.now() });
		sm.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "ok" }],
			api: "test",
			provider: "test",
			model: "test",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		});
		const oldFile = sm.getSessionFile()!;
		expect(existsSync(oldFile)).toBe(true);

		const chdirCalls: string[] = [];
		const notifications: string[] = [];
		const sentMessages: string[] = [];

		const result = await executeSessionMove(
			{
				cwd: dirA,
				sessionManager: sm,
				ui: {
					notify(message: string) {
						notifications.push(message);
					},
				} as any,
				async switchSession(sessionPath, options) {
					expect(existsSync(sessionPath)).toBe(true);
					await options?.withSession?.({
						ui: {
							notify(message: string) {
								notifications.push(message);
							},
						},
						async sendUserMessage(content: string) {
							sentMessages.push(content);
						},
					} as any);
					return { cancelled: false };
				},
			},
			dirB,
			{
				force: false,
				continueAgent: true,
				agentDir,
				chdir: (dir) => chdirCalls.push(dir),
			},
		);

		expect(result.moved).toBe(true);
		expect(result.to).toBe(dirB);
		expect(chdirCalls).toEqual([dirB]);
		expect(existsSync(oldFile)).toBe(false);
		expect(existsSync(result.sessionFile!)).toBe(true);
		expect(notifications).toEqual([`Working directory: ${dirB}`]);
		expect(sentMessages).toEqual([`Working directory changed to ${dirB}. Continue.`]);
	});

	test("blocks when background processes exist unless force is true", async () => {
		const agentDir = join(testRoot, "agent");
		const dirA = join(testRoot, "dirA");
		const dirB = join(testRoot, "dirB");
		await mkdir(dirA, { recursive: true });
		await mkdir(dirB, { recursive: true });

		const sm = SessionManager.create(dirA, defaultSessionDirFor(dirA, agentDir));
		const events = {
			emit(channel: string, payload: unknown) {
				if (channel === "processes:request:list") {
					(payload as { reply: (list: unknown[]) => void }).reply([
						{ id: "p1", name: "vite-dev", status: "running" },
					]);
				}
			},
		};

		await expect(
			executeSessionMove(
				{
					cwd: dirA,
					sessionManager: sm,
					ui: { notify() {} } as any,
					async switchSession() {
						return { cancelled: false };
					},
				},
				dirB,
				{ force: false, continueAgent: false, events, agentDir },
			),
		).rejects.toThrow("vite-dev");
	});

	test("cleans up new session file and keeps old file if switchSession is cancelled", async () => {
		const agentDir = join(testRoot, "agent");
		const dirA = join(testRoot, "dirA");
		const dirB = join(testRoot, "dirB");
		await mkdir(dirA, { recursive: true });
		await mkdir(dirB, { recursive: true });

		const sm = SessionManager.create(dirA, defaultSessionDirFor(dirA, agentDir));
		sm.appendMessage({ role: "user", content: "hi", timestamp: Date.now() });
		sm.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "ok" }],
			api: "test",
			provider: "test",
			model: "test",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		});
		const oldFile = sm.getSessionFile()!;
		let attemptedPath = "";

		const result = await executeSessionMove(
			{
				cwd: dirA,
				sessionManager: sm,
				ui: { notify() {} } as any,
				async switchSession(sessionPath) {
					attemptedPath = sessionPath;
					return { cancelled: true };
				},
			},
			dirB,
			{ force: false, continueAgent: false, agentDir },
		);

		expect(result.moved).toBe(false);
		expect(result.reason).toBe("cancelled");
		expect(existsSync(oldFile)).toBe(true);
		expect(existsSync(attemptedPath)).toBe(false);
	});

	test("refuses ephemeral sessions", async () => {
		const dirA = join(testRoot, "dirA");
		const dirB = join(testRoot, "dirB");
		await mkdir(dirA, { recursive: true });
		await mkdir(dirB, { recursive: true });

		const sm = SessionManager.inMemory(dirA);
		await expect(
			executeSessionMove(
				{
					cwd: dirA,
					sessionManager: sm,
					ui: { notify() {} } as any,
					async switchSession() {
						return { cancelled: false };
					},
				},
				dirB,
				{ force: false, continueAgent: false },
			),
		).rejects.toThrow("ephemeral");
	});
});

describe("extension integration (real Pi RPC runtime)", () => {
	test("moves cwd via /cd and via the change_directory tool end to end", async () => {
		const agentDir = join(testRoot, "agent");
		const dirA = join(testRoot, "projA");
		const dirB = join(testRoot, "projB");
		const dirC = join(testRoot, "projC");
		await mkdir(agentDir, { recursive: true });
		await mkdir(dirA, { recursive: true });
		await mkdir(dirB, { recursive: true });
		await mkdir(dirC, { recursive: true });
		await writeFile(join(dirA, "marker.txt"), "ALPHA");
		await writeFile(join(dirB, "marker.txt"), "BRAVO");
		await writeFile(join(dirC, "marker.txt"), "CHARLIE");
		await writeFile(
			join(agentDir, "settings.json"),
			JSON.stringify({ compaction: { enabled: false }, retry: { enabled: false } }),
		);

		const canonicalA = await realpath(dirA);
		const canonicalB = await realpath(dirB);
		const canonicalC = await realpath(dirC);

		const providerPath = join(repoRoot, "test/fixtures/session-cwd-provider.ts");
		const extensionPath = join(repoRoot, "extensions/session-cwd.ts");

		const proc = spawn(
			"pi",
			[
				"--mode",
				"rpc",
				"--offline",
				"-ne",
				"-nc",
				"-ns",
				"-np",
				"--provider",
				"cwd-probe",
				"--model",
				"fixture",
				"--thinking",
				"off",
				"-e",
				providerPath,
				"-e",
				extensionPath,
				"--tools",
				"read,change_directory",
			],
			{
				cwd: dirA,
				env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" },
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		const records: any[] = [];
		let buffer = "";
		let stderr = "";
		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		proc.stdout.on("data", (chunk) => {
			buffer += chunk.toString();
			let end: number;
			while ((end = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, end);
				buffer = buffer.slice(end + 1);
				try {
					records.push(JSON.parse(line));
				} catch {
					stderr += line;
				}
			}
		});

		const send = (value: unknown) => proc.stdin.write(`${JSON.stringify(value)}\n`);
		const until = async (predicate: (r: any) => boolean, timeout = 15_000) => {
			const deadline = Date.now() + timeout;
			while (Date.now() < deadline) {
				const found = records.find(predicate);
				if (found) return found;
				if (proc.exitCode !== null) throw new Error(`Pi exited early (${proc.exitCode}): ${stderr}`);
				await delay(15);
			}
			throw new Error(`RPC timeout: ${stderr}\n${JSON.stringify(records.slice(-6))}`);
		};
		const getState = async (id: string) => {
			send({ id, type: "get_state" });
			return (await until((r) => r.id === id)).data;
		};
		const textOf = (m: any) =>
			typeof m?.content === "string"
				? m.content
				: m?.content
						?.filter((c: any) => c.type === "text")
						.map((c: any) => c.text)
						.join("") || "";

		try {
			// 0. /cd on a brand-new empty session (before any prompt flushes to disk)
			send({ id: "cd0", type: "prompt", message: `/cd ${dirB}` });
			await until((r) => r.id === "cd0" && r.type === "response");
			const stateB0 = await getState("s-b0");
			expect(existsSync(stateB0.sessionFile)).toBe(true);

			// Move back to dirA via /cd and run initial prompt
			send({ id: "cd-a", type: "prompt", message: `/cd ${dirA}` });
			await until((r) => r.id === "cd-a" && r.type === "response");

			// 1. Initial prompt in dirA
			send({ id: "p1", type: "prompt", message: "READ_MARKER" });
			await until(
				(r) =>
					r.type === "message_end" &&
					r.message?.role === "assistant" &&
					textOf(r.message).includes("MARKER=ALPHA"),
			);
			await until((r) => r.type === "agent_settled");
			const stateA = await getState("s-a");
			expect(await realpath(stateA.sessionFile ? dirname(stateA.sessionFile) : "")).toBe(
				await realpath(defaultSessionDirFor(canonicalA, agentDir)),
			);
			const sessionFileA = stateA.sessionFile as string;
			expect(existsSync(sessionFileA)).toBe(true);

			// 2. Manual /cd to dirB
			send({ id: "cd1", type: "prompt", message: `/cd ${dirB}` });
			await until((r) => r.id === "cd1" && r.type === "response");
			const stateB = await getState("s-b");
			expect(stateB.sessionFile).not.toBe(sessionFileA);
			expect(existsSync(sessionFileA)).toBe(false);
			expect(existsSync(stateB.sessionFile)).toBe(true);

			send({ id: "p2", type: "prompt", message: "READ_MARKER" });
			const replyB = await until(
				(r) =>
					r.type === "message_end" &&
					r.message?.role === "assistant" &&
					textOf(r.message).includes("MARKER=BRAVO"),
			);
			expect(textOf(replyB.message)).toContain(`CWD=${canonicalB}`);

			// 3. Tool-driven change_directory to dirC (auto-continues in dirC)
			const sessionFileB = stateB.sessionFile as string;
			send({ id: "p3", type: "prompt", message: `MOVE_TO:${dirC}` });
			const replyC = await until(
				(r) =>
					r.type === "message_end" &&
					r.message?.role === "assistant" &&
					textOf(r.message).includes("CONTINUED") &&
					textOf(r.message).includes("MARKER=CHARLIE"),
			);
			expect(textOf(replyC.message)).toContain(`CWD=${canonicalC}`);
			const stateC = await getState("s-c");
			expect(stateC.sessionFile).not.toBe(sessionFileB);
			expect(existsSync(sessionFileB)).toBe(false);
			expect(existsSync(stateC.sessionFile)).toBe(true);
			expect(canonicalA).not.toBe(canonicalB);
		} finally {
			proc.kill("SIGTERM");
		}
	}, 25_000);
});
