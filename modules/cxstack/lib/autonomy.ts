import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const LEVELS = ["ask", "commit", "push", "main"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_SUMMARY: Record<Level, string> = {
	ask: "commit and push only when asked",
	commit: "commit verified work without asking",
	push: "also push feature branches and open draft PRs",
	main: "also push the default branch (personal projects)",
};

export type Repository = { key: string; label: string; defaultBranch: string };

const git = (cwd: string, args: string[]) => {
	try {
		return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2_000 }).trim();
	} catch {
		return undefined;
	}
};

/** github.com:owner/repo, https://github.com/owner/repo.git and ssh forms share one key. */
export const normalizeRemote = (url: string) => url
	.replace(/^[a-z+]+:\/\//, "")
	.replace(/^[^@/]+@/, "")
	.replace(/:(?!\d+\/)/, "/")
	.replace(/\.git$/, "")
	.replace(/\/+$/, "")
	.toLowerCase();

/** Every worktree and clone of one repository shares its setting through the origin remote. */
export function findRepository(cwd: string): Repository | undefined {
	const commonDir = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
	if (!commonDir) return undefined;
	const remote = git(cwd, ["remote", "get-url", "origin"]);
	const key = remote ? normalizeRemote(remote) : `local:${resolve(commonDir)}`;
	const head = git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
	return {
		key,
		label: remote ? key.split("/").slice(-2).join("/") : resolve(commonDir, ".."),
		defaultBranch: head?.replace(/^origin\//, "") || "main",
	};
}

type Store = Record<string, Level>;

export const readLevel = (file: string, key: string): Level => {
	try {
		const value = (JSON.parse(readFileSync(file, "utf8")) as Store)[key];
		return LEVELS.includes(value) ? value : "ask";
	} catch {
		return "ask";
	}
};

export function writeLevel(file: string, key: string, level: Level) {
	let store: Store = {};
	try { store = JSON.parse(readFileSync(file, "utf8")); } catch { /* first setting */ }
	if (level === "ask") delete store[key];
	else store[key] = level;
	mkdirSync(dirname(file), { recursive: true });
	const temporary = `${file}.${process.pid}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`);
	renameSync(temporary, file);
}

/** One stable prompt line. It changes only when the setting does, so the prompt cache holds. */
export function autonomyLine(repository: Repository, level: Level) {
	const where = `Autonomy for ${repository.label}: ${level}.`;
	const commit = "Commit each verified, coherent piece of work without asking, using commit-style.";
	switch (level) {
		case "ask": return `${where} Commit or push only when I ask.`;
		case "commit": return `${where} ${commit} Push only when I ask.`;
		case "push": return `${where} ${commit} Push feature branches and open draft pull requests without asking. Push ${repository.defaultBranch} only when I ask.`;
		case "main": return `${where} ${commit} Push any branch, including ${repository.defaultBranch}, and open pull requests without asking. When pushing ${repository.defaultBranch} deploys, ask first.`;
	}
}
