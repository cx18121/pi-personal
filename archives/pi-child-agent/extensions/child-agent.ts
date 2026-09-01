import { StringEnum, Type } from "@earendil-works/pi-ai";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { ChildJobs, type ChildSnapshot } from "../lib/jobs.js";
import {
	runChildSession,
	type ChildInput,
	type ChildResult,
	type ChildSessionControl,
} from "../lib/session.js";

const statusKey = "child-agent";
const statusRefreshMilliseconds = 1_000;
const childModelChoices = ["fable", "opus", "openai"] as const;

type ChildModelChoice = (typeof childModelChoices)[number];
type ChildRunner = (input: ChildInput) => Promise<ChildResult>;

type ChildAgentDependencies = {
	runChild?: ChildRunner;
};

function configuredChildModel(ctx: ExtensionContext, choice: ChildModelChoice): string {
	const matches = ctx.scopedModels.map(({ model }) => model).filter(({ provider, id }) => {
		if (choice === "fable") return provider === "anthropic" && id.includes("fable");
		if (choice === "opus") return provider === "anthropic" && id.includes("opus");
		return provider === "openai" || provider === "openai-codex";
	});
	if (matches.length !== 1) {
		throw new Error(`child_run requires exactly one scoped ${choice} model; found ${matches.length}.`);
	}
	return `${matches[0]!.provider}/${matches[0]!.id}`;
}

function elapsed(job: ChildSnapshot, now = Date.now()): string {
	const milliseconds = (job.completedAt ?? now) - job.startedAt;
	const seconds = Math.max(0, Math.round(milliseconds / 1000));
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function footerStatus(running: ChildSnapshot[], now = Date.now()): string | undefined {
	if (running.length === 0) return undefined;
	const oldest = running.reduce((left, right) => left.startedAt <= right.startedAt ? left : right);
	return `child ${running.length} · ${elapsed(oldest, now)}`;
}

function statusDetail(job: ChildSnapshot): string | undefined {
	if (job.status !== "failed" || !job.error) return undefined;
	const singleLine = job.error.replace(/\s+/g, " ").trim();
	return singleLine.length <= 240 ? singleLine : `${singleLine.slice(0, 239)}…`;
}

function formatStatus(job: ChildSnapshot): string {
	const model = job.reportedModel && job.reportedModel !== job.requestedModel
		? `${job.requestedModel} → ${job.reportedModel}`
		: job.requestedModel;
	const summary = `${job.id} · ${job.status} · ${elapsed(job)} · ${model} · ${job.taskPreview}`;
	const detail = statusDetail(job);
	return detail ? `${summary}\n  ${detail}` : summary;
}

function completionContent(job: ChildSnapshot): string {
	const heading = job.status === "completed" ? "Child completed" : "Child failed";
	const body = job.status === "completed" ? job.output ?? "(no output)" : job.error ?? "Unknown child failure.";
	return `${heading}: ${job.id}\nTask: ${job.taskPreview}\nModel: ${job.reportedModel ?? job.requestedModel}\n\n${body}\n\nParent action: Resume the owning task now. Reconcile Todo before replying. Complete satisfied work, or keep the blocked task active and name the blocker.`;
}

export function registerChildAgent(
	pi: ExtensionAPI,
	dependencies: ChildAgentDependencies = {},
): void {
	const runChild = dependencies.runChild ?? runChildSession;
	const controls = new Map<string, ChildSessionControl>();
	const pendingFinalization = new Set<string>();
	let context: ExtensionContext | null = null;
	let statusTimer: ReturnType<typeof setInterval> | undefined;

	const stopStatusTimer = () => {
		if (!statusTimer) return;
		clearInterval(statusTimer);
		statusTimer = undefined;
	};

	const refreshStatus = () => {
		if (!context?.hasUI) return;
		const running = jobs.running();
		context.ui.setStatus(statusKey, footerStatus(running));
		if (running.length === 0) {
			stopStatusTimer();
			return;
		}
		if (statusTimer) return;
		statusTimer = setInterval(refreshStatus, statusRefreshMilliseconds);
		statusTimer.unref?.();
	};

	const deliver = (job: ChildSnapshot) => {
		controls.delete(job.id);
		pendingFinalization.delete(job.id);
		refreshStatus();
		if (!context) return;
		if (context.sessionManager.getSessionId() !== job.ownerSessionId) return;

		const message = {
			customType: "child-agent-result",
			content: completionContent(job),
			display: false,
			details: { id: job.id, status: job.status },
		};
		if (context.isIdle()) {
			pi.sendMessage(message, { deliverAs: "followUp", triggerTurn: true });
			return;
		}
		pi.sendMessage(message, { deliverAs: "nextTurn" });
	};

	const jobs = new ChildJobs({ onSettled: deliver });

	pi.on("session_start", (_event, ctx) => {
		context = ctx;
		refreshStatus();
	});

	pi.on("session_shutdown", () => {
		jobs.shutdown();
		controls.clear();
		pendingFinalization.clear();
		stopStatusTimer();
		if (context?.hasUI) context.ui.setStatus(statusKey, undefined);
		context = null;
	});

	pi.registerTool({
		name: "child_run",
		label: "Run Child",
		description: "Start one fresh child agent in the background for bounded review, judgment, or repository reconnaissance. The child belongs to the current Pi session and returns a run id immediately.",
		promptSnippet: "Start a fresh background child for bounded judgment, review, or repository reconnaissance.",
		promptGuidelines: [
			"Use child_run only when the active workflow requires independent context or a complementary model. Pass a self-contained task and choose fable, opus, or openai.",
			"After child_run starts, continue useful parent work or return control. Do not poll child_status while waiting for ordinary completion.",
			"Use child_finalize to stop exploration and preserve current findings. Use child_stop only when the output should be abandoned.",
		],
		parameters: Type.Object({
			task: Type.String({ minLength: 1, maxLength: 32_768, description: "Self-contained child task" }),
			model: StringEnum(childModelChoices, { description: "Child model family" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const ownerSessionId = ctx.sessionManager.getSessionId();
			if (!ownerSessionId) throw new Error("Child runs require a persisted parent session.");
			const cwd = ctx.cwd;
			const agentDir = getAgentDir();
			const parentRegistry = ctx.modelRegistry;
			const model = configuredChildModel(ctx, params.model);
			let jobId: string | undefined;
			const job = jobs.start({
				ownerSessionId,
				task: params.task,
				model,
				run: (signal) => runChild({
					task: params.task,
					model,
					cwd,
					agentDir,
					parentRegistry,
					signal,
					onControl: (control) => {
						if (!jobId) return;
						controls.set(jobId, control);
						if (pendingFinalization.delete(jobId)) void control.finalize();
					},
				}),
			});
			jobId = job.id;
			context = ctx;
			refreshStatus();
			return {
				content: [{ type: "text", text: `Started ${job.id}. The result will return to this Pi session.` }],
				details: { id: job.id, status: job.status },
			};
		},
	});

	pi.registerTool({
		name: "child_status",
		label: "Child Status",
		description: "Inspect one current-session child run or list recent runs. Use for diagnosis or when the user asks, not as a polling loop.",
		parameters: Type.Object({
			id: Type.Optional(Type.String({ minLength: 1, maxLength: 64, description: "Exact child run id" })),
		}),
		async execute(_toolCallId, params) {
			const selected = params.id ? jobs.get(params.id) : undefined;
			if (params.id && !selected) {
				return { content: [{ type: "text", text: `Unknown child run: ${params.id}` }], details: { count: 0 } };
			}
			const values = selected ? [selected] : jobs.list();
			return {
				content: [{ type: "text", text: values.length > 0 ? values.map(formatStatus).join("\n") : "No child runs in this Pi session." }],
				details: { count: values.length },
			};
		},
	});

	pi.registerTool({
		name: "child_finalize",
		label: "Finalize Child",
		description: "Ask one running child to stop exploring and return its best current findings without discarding them.",
		parameters: Type.Object({
			id: Type.String({ minLength: 1, maxLength: 64, description: "Exact child run id" }),
		}),
		async execute(_toolCallId, params) {
			const job = jobs.get(params.id);
			if (!job) {
				return { content: [{ type: "text", text: `Unknown child run: ${params.id}` }], details: { result: "not_found" } };
			}
			if (job.status !== "running") {
				return { content: [{ type: "text", text: `${params.id} is already complete.` }], details: { result: "already_terminal" } };
			}
			const control = controls.get(params.id);
			if (!control) {
				pendingFinalization.add(params.id);
				return { content: [{ type: "text", text: `Queued finalization for ${params.id}.` }], details: { result: "queued" } };
			}
			await control.finalize();
			return { content: [{ type: "text", text: `Requested final findings from ${params.id}.` }], details: { result: "requested" } };
		},
	});

	pi.registerTool({
		name: "child_stop",
		label: "Stop Child",
		description: "Stop one running child owned by the current Pi session.",
		parameters: Type.Object({
			id: Type.String({ minLength: 1, maxLength: 64, description: "Exact child run id" }),
		}),
		async execute(_toolCallId, params) {
			const result = jobs.stop(params.id);
			refreshStatus();
			const text = result === "stopped"
				? `Stopped ${params.id}.`
				: result === "already_terminal"
					? `${params.id} is already complete.`
					: `Unknown child run: ${params.id}`;
			return { content: [{ type: "text", text }], details: { result } };
		},
	});
}

export default registerChildAgent;
