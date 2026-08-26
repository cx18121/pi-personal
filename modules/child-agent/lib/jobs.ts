import { randomUUID } from "node:crypto";

export type ChildStatus = "running" | "completed" | "failed" | "stopped";

export type ChildResult = {
	output: string;
	model?: string;
};

export type ChildSnapshot = {
	id: string;
	ownerSessionId: string;
	taskPreview: string;
	requestedModel: string;
	reportedModel?: string;
	status: ChildStatus;
	startedAt: number;
	completedAt?: number;
	output?: string;
	error?: string;
};

type ChildRecord = ChildSnapshot & {
	controller: AbortController;
};

type ChildJobsOptions = {
	maxRunning?: number;
	maxTerminal?: number;
	maxOutputBytes?: number;
	onSettled?: (job: ChildSnapshot) => void;
};

type StartChild = {
	ownerSessionId: string;
	task: string;
	model: string;
	run: (signal: AbortSignal) => Promise<ChildResult>;
};

const defaultMaxRunning = 4;
const defaultMaxTerminal = 20;
const defaultMaxOutputBytes = 50 * 1024;
const taskPreviewCharacters = 160;

function snapshot(record: ChildRecord): ChildSnapshot {
	const { controller: _controller, ...value } = record;
	return { ...value };
}

function truncateUtf8(value: string, maxBytes: number): string {
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;

	const suffix = "\n\n[Child output truncated]";
	if (Buffer.byteLength(suffix, "utf8") >= maxBytes) return suffix.slice(0, maxBytes);
	const contentBytes = maxBytes - Buffer.byteLength(suffix, "utf8");
	const bytes = Buffer.from(value, "utf8");
	let end = Math.min(bytes.length, contentBytes);
	while (end > 0 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
	return `${bytes.subarray(0, end).toString("utf8")}${suffix}`;
}

function taskPreview(task: string): string {
	const compact = task.replace(/\s+/g, " ").trim();
	return compact.length <= taskPreviewCharacters
		? compact
		: `${compact.slice(0, taskPreviewCharacters - 1)}…`;
}

export class ChildJobs {
	private readonly jobs = new Map<string, ChildRecord>();
	private readonly maxRunning: number;
	private readonly maxTerminal: number;
	private readonly maxOutputBytes: number;
	private readonly onSettled?: (job: ChildSnapshot) => void;
	private closed = false;

	constructor(options: ChildJobsOptions = {}) {
		this.maxRunning = options.maxRunning ?? defaultMaxRunning;
		this.maxTerminal = options.maxTerminal ?? defaultMaxTerminal;
		this.maxOutputBytes = options.maxOutputBytes ?? defaultMaxOutputBytes;
		this.onSettled = options.onSettled;
	}

	start(input: StartChild): ChildSnapshot {
		if (this.closed) throw new Error("Child runtime is not active.");
		if (this.running().length >= this.maxRunning) {
			throw new Error(`At most ${this.maxRunning} child agents may run at once.`);
		}

		const id = `child-${randomUUID().slice(0, 8)}`;
		const record: ChildRecord = {
			id,
			ownerSessionId: input.ownerSessionId,
			taskPreview: taskPreview(input.task),
			requestedModel: input.model,
			status: "running",
			startedAt: Date.now(),
			controller: new AbortController(),
		};
		this.jobs.set(id, record);

		void Promise.resolve().then(() => input.run(record.controller.signal)).then(
			(result) => this.settle(record, {
				status: "completed",
				output: truncateUtf8(result.output, this.maxOutputBytes),
				reportedModel: result.model,
			}),
			(error: unknown) => this.settle(record, {
				status: "failed",
				error: truncateUtf8(error instanceof Error ? error.message : String(error), this.maxOutputBytes),
			}),
		);

		return snapshot(record);
	}

	get(id: string): ChildSnapshot | undefined {
		const record = this.jobs.get(id);
		return record ? snapshot(record) : undefined;
	}

	list(): ChildSnapshot[] {
		return [...this.jobs.values()]
			.sort((left, right) => right.startedAt - left.startedAt)
			.map(snapshot);
	}

	running(): ChildSnapshot[] {
		return this.list().filter((job) => job.status === "running");
	}

	stop(id: string): "stopped" | "not_found" | "already_terminal" {
		const record = this.jobs.get(id);
		if (!record) return "not_found";
		if (record.status !== "running") return "already_terminal";

		record.status = "stopped";
		record.completedAt = Date.now();
		record.controller.abort(new Error("Child stopped by parent."));
		this.pruneTerminal();
		return "stopped";
	}

	shutdown(): void {
		if (this.closed) return;
		this.closed = true;
		for (const record of this.jobs.values()) {
			if (record.status !== "running") continue;
			record.status = "stopped";
			record.completedAt = Date.now();
			record.controller.abort(new Error("Parent session ended."));
		}
	}

	private settle(
		record: ChildRecord,
		result: Pick<ChildSnapshot, "status" | "output" | "error" | "reportedModel">,
	): void {
		if (record.status !== "running" || this.closed) return;
		record.status = result.status;
		record.completedAt = Date.now();
		record.output = result.output;
		record.error = result.error;
		record.reportedModel = result.reportedModel;
		const settled = snapshot(record);
		this.pruneTerminal();
		this.onSettled?.(settled);
	}

	private pruneTerminal(): void {
		const terminal = [...this.jobs.values()]
			.filter((job) => job.status !== "running")
			.sort((left, right) => (left.completedAt ?? 0) - (right.completedAt ?? 0));
		for (const record of terminal.slice(0, Math.max(0, terminal.length - this.maxTerminal))) {
			this.jobs.delete(record.id);
		}
	}
}
