import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAudit } from "../extensions/audit.ts";

const start = Date.parse("2026-10-20T12:00:00Z");
let id = 0;
const at = (seconds: number) => new Date(start + seconds * 1000).toISOString();
const user = (seconds: number, text: string) => ({ type: "message", id: `u${id++}`, timestamp: at(seconds), message: { role: "user", content: [{ type: "text", text }] } });
const assistant = (seconds: number, usage: object, extra: object = {}) => ({ type: "message", id: `a${id++}`, timestamp: at(seconds),
	message: { role: "assistant", usage: { cost: { total: 0.5 }, ...usage }, content: [{ type: "text", text: "done" }], ...extra } });

test("metrics count forked history once and flag cache misses, resends, and corrections", () => {
	const root = mkdtempSync(join(tmpdir(), "audit-"));
	const sessions = join(root, "sessions", "project");
	mkdirSync(sessions, { recursive: true });
	const shared = [
		{ type: "session", id: "parent-0001", cwd: "/p" },
		user(0, "build the export"),
		assistant(30, { input: 40_000, cacheRead: 0 }),
		user(60, "do we even need the retry layer?"),
		assistant(90, { input: 38_000, cacheRead: 2_000 }),
		user(100, "go"),
		assistant(101, { input: 10, cacheRead: 40_000 }, { stopReason: "aborted" }),
	];
	const parent = [...shared, user(110, "go, and keep it small"), assistant(200, { input: 500, cacheRead: 41_000 })];
	const fork = [{ type: "session", id: "fork-0002", cwd: "/p" }, ...shared.slice(1), user(400, "now the docs"), assistant(500, { input: 600, cacheRead: 42_000 })];
	const write = (name: string, entries: object[]) => writeFileSync(join(sessions, name), entries.map((entry) => JSON.stringify(entry)).join("\n"));
	write("a.jsonl", parent);
	write("b.jsonl", fork);

	const ctx: any = { sessionManager: { getSessionFile: () => undefined, getBranch: () => [] } };
	const result = runAudit(ctx, 30, { sessions: join(root, "sessions"), audits: join(root, "audits") }, start + 1000 * 1000);
	expect(result.metrics.sessions).toBe(2);
	expect(result.metrics.turns).toBe(5);
	expect(result.metrics.warmFollowUps).toBe(4);
	expect(result.metrics.warmCacheMissRate).toBe(0.25);
	expect(result.metrics.interruptions).toEqual({ total: 1, resent: 1, other: 0 });
	expect(result.metrics.corrections.needed).toBe(1);
	expect(readdirSync(result.dir).sort()).toEqual(["batch-1.md", "metrics.json"]);
	expect(readFileSync(join(result.dir, "batch-1.md"), "utf8")).toContain("U: do we even need the retry layer?");

	const unfinished = runAudit(ctx, undefined, { sessions: join(root, "sessions"), audits: join(root, "audits") }, start + 1500 * 1000);
	expect(unfinished.previous).toBeUndefined();
	expect(unfinished.metrics.sessions).toBe(2);
	writeFileSync(join(result.dir, "report.md"), "done");
	const next = runAudit(ctx, undefined, { sessions: join(root, "sessions"), audits: join(root, "audits") }, start + 2000 * 1000);
	expect(next.previous).toBe(join(result.dir, "metrics.json"));
	expect(next.metrics.sessions).toBe(0);
});
