import { Type } from "@earendil-works/pi-ai";
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
} from "../lib/session.js";

const statusKey = "child-agent";

type ChildRunner = (input: ChildInput) => Promise<ChildResult>;

type ChildAgentDependencies = {
	runChild?: ChildRunner;
};

function elapsed(job: ChildSnapshot, now = Date.now()): string {
	const milliseconds = (job.completedAt ?? now) - job.startedAt;
	const seconds = Math.max(0, Math.round(milliseconds / 1000));
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
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
	return `${heading}: ${job.id}\nTask: ${job.taskPreview}\nModel: ${job.reportedModel ?? job.requestedModel}\n\n${body}`;
}

export function registerChildAgent(
	pi: ExtensionAPI,
	dependencies: ChildAgentDependencies = {},
): void {
	const runChild = dependencies.runChild ?? runChildSession;
	let context: ExtensionContext | null = null;

	const refreshStatus = () => {
		if (!context?.hasUI) return;
		const count = jobs.running().length;
		context.ui.setStatus(statusKey, count > 0 ? `child ${count}` : undefined);
	};

	const deliver = (job: ChildSnapshot) => {
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
		if (context?.hasUI) context.ui.setStatus(statusKey, undefined);
		context = null;
	});

	pi.registerTool({
		name: "child_run",
		label: "Run Child",
		description: "Start one fresh child agent in the background for bounded review, judgment, or repository reconnaissance. The child belongs to the current Pi session and returns a run id immediately.",
		promptSnippet: "Start a fresh background child for bounded judgment, review, or repository reconnaissance.",
		promptGuidelines: [
			"Use child_run only when the active workflow requires independent context or a complementary model. Pass a self-contained task and an exact provider/model id.",
			"After child_run starts, continue useful parent work or return control. Do not poll child_status while waiting for ordinary completion.",
		],
		parameters: Type.Object({
			task: Type.String({ minLength: 1, maxLength: 32_768, description: "Self-contained child task" }),
			model: Type.String({ minLength: 3, maxLength: 256, description: "Exact provider/model id" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const ownerSessionId = ctx.sessionManager.getSessionId();
			if (!ownerSessionId) throw new Error("Child runs require a persisted parent session.");
			const cwd = ctx.cwd;
			const agentDir = getAgentDir();
			const parentRegistry = ctx.modelRegistry;
			const job = jobs.start({
				ownerSessionId,
				task: params.task,
				model: params.model,
				run: (signal) => runChild({
					task: params.task,
					model: params.model,
					cwd,
					agentDir,
					parentRegistry,
					signal,
				}),
			});
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
