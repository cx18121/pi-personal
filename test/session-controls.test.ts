import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { ExecOptions, ExecResult } from "@earendil-works/pi-coding-agent";
import {
	cleanSessionName,
	deriveTabLabel,
	executeOpenHerdrSession,
} from "../extensions/session-controls.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const originalWorkspace = process.env.HERDR_WORKSPACE_ID;
let testRoot: string;

function success(stdout = ""): ExecResult {
	return { stdout, stderr: "", code: 0, killed: false };
}

function herdrJson(result: unknown): ExecResult {
	return success(JSON.stringify({ id: "test", result }));
}

beforeEach(async () => {
	testRoot = await mkdtemp(join(tmpdir(), "pi-session-controls-"));
	process.env.HERDR_WORKSPACE_ID = "w-current";
});

afterEach(async () => {
	if (originalWorkspace === undefined) delete process.env.HERDR_WORKSPACE_ID;
	else process.env.HERDR_WORKSPACE_ID = originalWorkspace;
	await rm(testRoot, { recursive: true, force: true });
});

describe("session-controls helpers", () => {
	test("cleanSessionName trims whitespace and rejects empty input", () => {
		expect(cleanSessionName("  Fix   cache\nbug ")).toBe("Fix cache bug");
		expect(() => cleanSessionName("   ")).toThrow("must not be empty");
	});

	test("deriveTabLabel prefers explicit label, then prompt, then directory basename", () => {
		expect(deriveTabLabel("Custom", "prompt text", "/a/b")).toBe("Custom");
		expect(deriveTabLabel(undefined, "Inspect failing webhook retries", "/a/b")).toBe(
			"Inspect failing webhook retries",
		);
		expect(deriveTabLabel(undefined, undefined, "/Users/test/my-repo")).toBe("my-repo");
	});
});

describe("executeOpenHerdrSession", () => {
	test("opens a new tab in an already-open Git worktree workspace and runs Pi with prompt", async () => {
		const repo = join(testRoot, "repo");
		const wt = join(testRoot, "repo-wt");
		await mkdir(repo, { recursive: true });
		await mkdir(wt, { recursive: true });
		const canonicalRepo = await realpath(repo);
		const canonicalWt = await realpath(wt);

		const calls: Array<{ command: string; args: string[]; options?: ExecOptions }> = [];
		const exec = async (command: string, args: string[], options?: ExecOptions): Promise<ExecResult> => {
			calls.push({ command, args, options });
			if (args[0] === "worktree" && args[1] === "list") {
				return herdrJson({ source: { source_checkout_path: repo } });
			}
			if (args[0] === "worktree" && args[1] === "open") {
				return herdrJson({
					workspace: { workspace_id: "w-wt" },
					root_pane: { pane_id: "w-wt:p-busy" },
					already_open: true,
				});
			}
			if (args[0] === "tab" && args[1] === "create") {
				return herdrJson({ tab: { tab_id: "w-wt:t2" }, root_pane: { pane_id: "w-wt:p2" } });
			}
			if (args[0] === "pane" && args[1] === "run") return success();
			throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
		};

		const opened = await executeOpenHerdrSession(
			{ exec },
			{ cwd: repo },
			undefined,
			{ path: wt, prompt: "Investigate test flake", label: "flake" },
		);

		expect(calls[1]?.args).toEqual([
			"worktree",
			"open",
			"--cwd",
			canonicalRepo,
			"--path",
			canonicalWt,
			"--label",
			"flake",
			"--focus",
		]);
		expect(calls[2]?.args).toEqual([
			"tab",
			"create",
			"--workspace",
			"w-wt",
			"--cwd",
			canonicalWt,
			"--label",
			"flake",
			"--focus",
		]);
		expect(calls[3]?.args).toEqual(["pane", "run", "w-wt:p2", "'pi' 'Investigate test flake'"]);
		expect(opened).toMatchObject({
			cwd: canonicalWt,
			workspaceId: "w-wt",
			tabId: "w-wt:t2",
			paneId: "w-wt:p2",
		});
	});

	test("falls back to a tab in the current workspace for a non-Git directory", async () => {
		const dir = join(testRoot, "plain-folder");
		await mkdir(dir, { recursive: true });
		const canonicalDir = await realpath(dir);

		const calls: string[][] = [];
		const exec = async (_command: string, args: string[]): Promise<ExecResult> => {
			calls.push(args);
			if (args[0] === "worktree" && args[1] === "list") {
				return { stdout: "", stderr: "not a git repo", code: 1, killed: false };
			}
			if (args[0] === "tab" && args[1] === "create") {
				return herdrJson({ tab: { tab_id: "w-current:t5" }, root_pane: { pane_id: "w-current:p5" } });
			}
			if (args[0] === "pane" && args[1] === "run") return success();
			throw new Error(`Unexpected: ${args.join(" ")}`);
		};

		const opened = await executeOpenHerdrSession({ exec }, { cwd: dir }, undefined, { focus: false });
		expect(calls[1]).toEqual([
			"tab",
			"create",
			"--workspace",
			"w-current",
			"--cwd",
			canonicalDir,
			"--label",
			"plain-folder",
			"--no-focus",
		]);
		expect(calls[2]).toEqual(["pane", "run", "w-current:p5", "'pi'"]);
		expect(opened.paneId).toBe("w-current:p5");
	});
});

describe("session-controls integration (real Pi RPC runtime)", () => {
	test("rename_session and reload_runtime with post-reload continuation work end to end", async () => {
		const agentDir = join(testRoot, "agent");
		const projectDir = join(testRoot, "proj");
		await mkdir(agentDir, { recursive: true });
		await mkdir(projectDir, { recursive: true });
		await writeFile(
			join(agentDir, "settings.json"),
			JSON.stringify({ compaction: { enabled: false }, retry: { enabled: false } }),
		);

		const providerPath = join(repoRoot, "test/fixtures/session-controls-provider.ts");
		const extensionPath = join(repoRoot, "extensions/session-controls.ts");

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
				"controls-probe",
				"--model",
				"fixture",
				"--thinking",
				"off",
				"-e",
				providerPath,
				"-e",
				extensionPath,
				"--tools",
				"rename_session,reload_runtime",
			],
			{
				cwd: projectDir,
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
			// 1. rename_session
			send({ id: "p1", type: "prompt", message: "RENAME:API Migration" });
			await until(
				(r) =>
					r.type === "message_end" &&
					r.message?.role === "assistant" &&
					textOf(r.message).includes("RENAMED_OK"),
			);
			const state1 = await getState("s1");
			expect(state1.sessionName).toBe("API Migration");

			// 2. reload_runtime with continue_message
			send({ id: "p2", type: "prompt", message: "RELOAD_AND_CONTINUE" });
			await until(
				(r) =>
					r.type === "message_end" &&
					r.message?.role === "assistant" &&
					textOf(r.message).includes("POST_RELOAD_CONTINUED"),
			);
		} finally {
			proc.kill("SIGTERM");
		}
	}, 25_000);
});
