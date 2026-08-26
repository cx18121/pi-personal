import { describe, expect, test } from "bun:test";
import { ChildJobs } from "../lib/jobs.js";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function settle(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("ChildJobs", () => {
	test("delivers one bounded completion", async () => {
		const run = deferred<{ output: string; model?: string }>();
		const settled: string[] = [];
		const jobs = new ChildJobs({
			maxOutputBytes: 40,
			onSettled: (job) => settled.push(`${job.status}:${job.output}`),
		});
		const job = jobs.start({
			ownerSessionId: "owner",
			task: "Review the current implementation in detail",
			model: "provider/model",
			run: () => run.promise,
		});

		expect(job.status).toBe("running");
		run.resolve({ output: "abcdefghijklmnopqrstuvwxyz".repeat(3), model: "provider/reported" });
		await settle();

		expect(jobs.get(job.id)).toMatchObject({
			status: "completed",
			reportedModel: "provider/reported",
		});
		expect(settled).toHaveLength(1);
		expect(settled[0]).toContain("[Child output truncated]");
		expect(Buffer.byteLength(jobs.get(job.id)?.output ?? "", "utf8")).toBeLessThanOrEqual(40);
	});

	test("bounds failures and keeps UTF-8 output valid", async () => {
		const settled: Array<{ output?: string; error?: string }> = [];
		const successful = new ChildJobs({
			maxOutputBytes: 40,
			onSettled: (job) => settled.push(job),
		});
		successful.start({
			ownerSessionId: "owner",
			task: "Review",
			model: "provider/model",
			run: async () => ({ output: "😀".repeat(100) }),
		});
		await settle();

		const failed = new ChildJobs({
			maxOutputBytes: 40,
			onSettled: (job) => settled.push(job),
		});
		failed.start({
			ownerSessionId: "owner",
			task: "Review",
			model: "provider/model",
			run: async () => {
				throw new Error("failure".repeat(100));
			},
		});
		await settle();

		expect(Buffer.byteLength(settled[0]?.output ?? "", "utf8")).toBeLessThanOrEqual(40);
		expect(settled[0]?.output).not.toContain("�");
		expect(Buffer.byteLength(settled[1]?.error ?? "", "utf8")).toBeLessThanOrEqual(40);
		expect(settled[1]?.error).toContain("[Child output truncated]");
	});

	test("stops a running child without delivering a late result", async () => {
		const run = deferred<{ output: string }>();
		const settled: string[] = [];
		let childSignal: AbortSignal | undefined;
		const jobs = new ChildJobs({ onSettled: (job) => settled.push(job.status) });
		const job = jobs.start({
			ownerSessionId: "owner",
			task: "Review",
			model: "provider/model",
			run: (signal) => {
				childSignal = signal;
				return run.promise;
			},
		});

		await Promise.resolve();
		expect(jobs.stop(job.id)).toBe("stopped");
		expect(childSignal?.aborted).toBeTrue();
		run.resolve({ output: "late" });
		await settle();

		expect(jobs.get(job.id)?.status).toBe("stopped");
		expect(settled).toEqual([]);
	});

	test("enforces the running limit", () => {
		const jobs = new ChildJobs({ maxRunning: 1 });
		const first = deferred<{ output: string }>();
		jobs.start({
			ownerSessionId: "owner",
			task: "First",
			model: "provider/model",
			run: () => first.promise,
		});

		expect(() => jobs.start({
			ownerSessionId: "owner",
			task: "Second",
			model: "provider/model",
			run: async () => ({ output: "second" }),
		})).toThrow("At most 1 child agents may run at once.");
	});

	test("shutdown aborts every child and suppresses completion delivery", async () => {
		const first = deferred<{ output: string }>();
		const second = deferred<{ output: string }>();
		const signals: AbortSignal[] = [];
		const settled: string[] = [];
		const jobs = new ChildJobs({ onSettled: (job) => settled.push(job.id) });
		for (const run of [first, second]) {
			jobs.start({
				ownerSessionId: "owner",
				task: "Review",
				model: "provider/model",
				run: (signal) => {
					signals.push(signal);
					return run.promise;
				},
			});
		}

		await Promise.resolve();
		jobs.shutdown();
		expect(signals).toHaveLength(2);
		expect(signals.every((signal) => signal.aborted)).toBeTrue();
		first.resolve({ output: "late first" });
		second.resolve({ output: "late second" });
		await settle();
		expect(settled).toEqual([]);
		expect(jobs.running()).toEqual([]);
	});
});
