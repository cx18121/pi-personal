import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum, Type } from "@earendil-works/pi-ai";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { runChildSession } from "../../child-agent/lib/session.js";
import {
	appendCorrectionEvent,
	correctionState,
	correctionsFile,
	createCorrectionCandidate,
	extractCorrectionMarker,
	groupingInput,
	inferCorrectionSource,
	parseGroupingOutput,
	readCorrectionEvents,
	type CorrectionCandidate,
	type CorrectionInterpretation,
	type CorrectionPattern,
	type CorrectionSource,
} from "../lib/corrections.js";
import { cxContentVersion, renderCxKernel, restoreCxState } from "../lib/cx.js";

const resourceRoot = fileURLToPath(new URL("../resources/", import.meta.url));
const kernel = renderCxKernel(
	readFileSync(join(resourceRoot, "kernel.md"), "utf8"),
	resourceRoot,
);
const kernelVersion = cxContentVersion(kernel);
const captureInstructions = `Correction capture is evidence, not a durable rule. When Charlie's current feedback may mean your previous judgment, action, priority, scope, or explanation should have differed, answer normally and append this hidden marker at the end:
<cx-correction>{"category":"...","agentDecision":"...","userFeedback":"...","expectedBehavior":"...","strength":"weak|strong"}</cx-correction>
Do not mention the marker. Do not append a marker for ordinary new information or a scope change requested before your response.`;
const groupingInstructions = readFileSync(join(resourceRoot, "correction-grouping.md"), "utf8").trim();

type CorrectionsDependencies = {
	agentDir?: string;
	group?: (candidates: CorrectionCandidate[], ctx: ExtensionContext, signal: AbortSignal) => Promise<CorrectionPattern[]>;
};

const now = () => new Date().toISOString();
const sorted = (values: string[]) => [...values].sort();
const patternTarget = (pattern: CorrectionPattern) => pattern.intervention
	? `${pattern.intervention.scope} ${pattern.intervention.owner}`
	: pattern.eval ? "eval only" : pattern.proof.kind;
const acceptedPrompt = (pattern: CorrectionPattern) => `Implement the accepted correction proposal below. This is authorization for the exact local change and focused verification, but not commit, push, publication, or deployment.

Pattern ID: ${pattern.id}
Pattern: ${pattern.title}
Evidence: ${pattern.summary}
Proof: ${pattern.proof.kind} — ${pattern.proof.reason}
${pattern.eval ? `Eval:\n${JSON.stringify(pattern.eval, null, 2)}\n` : ""}${pattern.intervention ? `Intervention:\n${JSON.stringify(pattern.intervention, null, 2)}\n` : ""}
If the proof does not improve its target behavior or a relevant regression appears, revert the candidate intervention and call correction_outcome with outcome rejected_by_proof. Otherwise call correction_outcome with outcome applied and concise evidence.`;
const sameValues = (left: string[], right: string[]) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

function fableModel(ctx: ExtensionContext): string {
	const matches = ctx.scopedModels.map(({ model }) => model)
		.filter(({ provider, id }) => provider === "anthropic" && id.includes("fable"));
	if (matches.length !== 1) throw new Error(`Correction grouping requires one scoped Fable model; found ${matches.length}.`);
	return `${matches[0]!.provider}/${matches[0]!.id}`;
}

async function defaultGroup(
	candidates: CorrectionCandidate[],
	ctx: ExtensionContext,
	signal: AbortSignal,
): Promise<CorrectionPattern[]> {
	const result = await runChildSession({
		task: `${groupingInstructions}\n\nCandidates:\n${groupingInput(candidates)}`,
		model: fableModel(ctx),
		cwd: ctx.cwd,
		agentDir: getAgentDir(),
		parentRegistry: ctx.modelRegistry,
		signal,
		tools: [],
	});
	return parseGroupingOutput(result.output, candidates);
}

export default function registerCorrections(
	pi: ExtensionAPI,
	dependencies: CorrectionsDependencies = {},
): void {
	const filePath = correctionsFile(dependencies.agentDir ?? getAgentDir());
	const group = dependencies.group ?? defaultGroup;
	let grouping: Promise<void> | undefined;
	let groupAgain = false;
	let currentCorrection: { interpretation: CorrectionInterpretation; source: CorrectionSource } | undefined;
	let groupingController: AbortController | undefined;

	const activeState = () => correctionState(readCorrectionEvents(filePath));
	const recordCandidate = (
		interpretation: CorrectionInterpretation,
		ctx: ExtensionContext,
		explicitSource?: CorrectionSource,
	) => {
		if (!restoreCxState(ctx.sessionManager.getEntries()).active) throw new Error("Correction capture requires an active CX session.");
		const sessionId = ctx.sessionManager.getSessionId();
		if (!sessionId) throw new Error("Correction capture requires a persisted session.");
		const source = inferCorrectionSource(ctx.sessionManager.getBranch(), explicitSource);
		const candidate = createCorrectionCandidate({
			sessionId,
			project: ctx.cwd,
			source,
			...interpretation,
			kernelVersion,
		});
		appendCorrectionEvent(filePath, { type: "candidate_recorded", at: now(), candidate });
		scheduleGrouping(ctx);
		return candidate;
	};
	const needsGrouping = () => {
		const events = readCorrectionEvents(filePath);
		const state = correctionState(events);
		const snapshotIndex = events.findLastIndex((event) => event.type === "grouping_snapshot");
		const snapshot = snapshotIndex < 0 ? undefined : events[snapshotIndex];
		const invalidated = events.slice(snapshotIndex + 1).some(
			(event) => event.type === "candidate_recorded"
				|| event.type === "candidate_undone"
				|| (event.type === "proposal_outcome" && event.outcome === "rejected_by_proof"),
		);
		return {
			candidates: state.candidates,
			needed: state.candidates.length > 0 && (
				!snapshot
				|| snapshot.type !== "grouping_snapshot"
				|| !sameValues(snapshot.candidateIds, state.candidates.map(({ id }) => id))
				|| invalidated
			),
		};
	};

	const scheduleGrouping = (ctx: ExtensionContext) => {
		groupAgain = true;
		if (grouping) return;
		groupingController = new AbortController();
		const controller = groupingController;
		grouping = (async () => {
			while (groupAgain) {
				groupAgain = false;
				const pending = needsGrouping();
				if (!pending.needed) continue;
				const patterns = await group(pending.candidates, ctx, controller.signal);
				appendCorrectionEvent(filePath, {
					type: "grouping_snapshot",
					at: now(),
					candidateIds: pending.candidates.map(({ id }) => id),
					patterns,
				});
			}
		})().catch((error) => {
			if (!controller.signal.aborted && ctx.hasUI) {
				ctx.ui.notify(`Correction grouping failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
			}
		}).finally(() => {
			const restart = groupAgain && !controller.signal.aborted;
			grouping = undefined;
			groupingController = undefined;
			if (restart) scheduleGrouping(ctx);
		});
	};

	pi.on("before_agent_start", (event, ctx) => {
		if (!restoreCxState(ctx.sessionManager.getEntries()).active) return undefined;
		currentCorrection = undefined;
		return { systemPrompt: `${event.systemPrompt}\n\n${captureInstructions}` };
	});

	pi.on("message_end", (event, ctx) => {
		if (event.message.role !== "assistant") return undefined;
		if (!restoreCxState(ctx.sessionManager.getEntries()).active) return undefined;
		let interpretation: CorrectionInterpretation | undefined;
		let changed = false;
		const content: typeof event.message.content = [];
		for (const part of event.message.content) {
			if (part.type !== "text") {
				content.push(part);
				continue;
			}
			const extracted = extractCorrectionMarker(part.text);
			if (extracted.content !== part.text) changed = true;
			if (extracted.interpretation) interpretation = extracted.interpretation;
			if (extracted.content === part.text) content.push(part);
			else if (extracted.content) content.push({ ...part, text: extracted.content });
		}
		const safeContent = content.some((part) => part.type === "text" || part.type === "toolCall")
			? content
			: [...content, { type: "text" as const, text: "I completed the response." }];
		if (interpretation) {
			try {
				currentCorrection = {
					interpretation,
					source: inferCorrectionSource(ctx.sessionManager.getBranch()),
				};
			} catch (error) {
				if (ctx.hasUI) ctx.ui.notify(`Correction capture failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
			}
		}

		if (event.message.stopReason === "stop") {
			const completedCorrection = currentCorrection;
			currentCorrection = undefined;
			if (completedCorrection) {
				try {
					const candidate = recordCandidate(completedCorrection.interpretation, ctx, completedCorrection.source);
					if (ctx.hasUI) ctx.ui.notify(`Correction recorded · ${candidate.category} · ${candidate.strength}. Undo: /corrections undo ${candidate.id}`, "info");
				} catch (error) {
					if (ctx.hasUI) ctx.ui.notify(`Correction capture failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
				}
			}
		} else if (changed && !interpretation && ctx.hasUI) {
			ctx.ui.notify("Ignored an invalid correction marker.", "warning");
		}
		return changed ? { message: { ...event.message, content: safeContent } } : undefined;
	});

	pi.on("session_start", (_event, ctx) => {
		if (!restoreCxState(ctx.sessionManager.getEntries()).active) return;
		scheduleGrouping(ctx);
	});

	pi.on("session_shutdown", () => {
		groupingController?.abort();
	});

	pi.on("agent_settled", (_event, ctx) => {
		const state = activeState();
		const pattern = state.patterns.find(({ disposition, id }) => disposition === "ready" && !state.surfaced.has(id));
		if (!pattern || !ctx.hasUI) return;
		appendCorrectionEvent(filePath, { type: "proposal_surfaced", at: now(), patternId: pattern.id });
		ctx.ui.notify(`Harness improvement ready: ${pattern.title}. Run /corrections to review.`, "info");
	});

	pi.registerTool({
		name: "correction_log",
		label: "Backfill Correction",
		description: "Backfill one approved correction candidate from Reflect using exact session entry ids.",
		parameters: Type.Object({
			category: Type.String({ minLength: 1, maxLength: 80 }),
			agentDecision: Type.String({ minLength: 1, maxLength: 600 }),
			userFeedback: Type.String({ minLength: 1, maxLength: 600 }),
			expectedBehavior: Type.String({ minLength: 1, maxLength: 600 }),
			strength: StringEnum(["weak", "strong"] as const),
			source: Type.Object({
				requestEntryId: Type.String({ minLength: 1, maxLength: 64 }),
				assistantEntryId: Type.String({ minLength: 1, maxLength: 64 }),
				correctionEntryId: Type.String({ minLength: 1, maxLength: 64 }),
			}),
		}),
		async execute(_toolCallId, params, _signal, _update, ctx) {
			const candidate = recordCandidate({
				category: params.category,
				agentDecision: params.agentDecision,
				userFeedback: params.userFeedback,
				expectedBehavior: params.expectedBehavior,
				strength: params.strength,
			}, ctx, params.source);
			return {
				content: [{ type: "text", text: `Backfilled correction ${candidate.id}. Undo with /corrections undo ${candidate.id}.` }],
				details: { id: candidate.id, category: candidate.category, strength: candidate.strength },
			};
		},
		renderCall(_args, theme) {
			return new Text(theme.fg("muted", "Backfill correction"), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as { id?: string; category?: string; strength?: string } | undefined;
			const label = [details?.category, details?.strength].filter(Boolean).join(" · ");
			const undo = details?.id ? `\n${theme.fg("dim", `/corrections undo ${details.id}`)}` : "";
			return new Text(`${theme.fg("accent", `Correction recorded${label ? ` · ${label}` : ""}`)}${undo}`, 0, 0);
		},
	});

	pi.registerTool({
		name: "correction_outcome",
		label: "Record Correction Outcome",
		description: "Record whether an accepted correction proposal passed its proof and was applied or rejected.",
		parameters: Type.Object({
			patternId: Type.String({ minLength: 1, maxLength: 64 }),
			outcome: StringEnum(["applied", "rejected_by_proof"] as const),
			evidence: Type.String({ minLength: 1, maxLength: 600 }),
		}),
		async execute(_toolCallId, params, _signal, _update, ctx) {
			const state = activeState();
			if (state.decisions.get(params.patternId) !== "accepted") throw new Error(`Correction pattern ${params.patternId} is not accepted.`);
			appendCorrectionEvent(filePath, {
				type: "proposal_outcome",
				at: now(),
				patternId: params.patternId,
				outcome: params.outcome,
				evidence: params.evidence.replace(/\s+/g, " ").trim(),
			});
			if (params.outcome === "rejected_by_proof") scheduleGrouping(ctx);
			return {
				content: [{ type: "text", text: `Recorded ${params.outcome} for ${params.patternId}.` }],
				details: { patternId: params.patternId, outcome: params.outcome },
			};
		},
	});

	pi.registerCommand("corrections", {
		description: "Review, undo, accept, reject, or defer correction evidence",
		handler: async (args, ctx) => {
			const [action, id] = args.trim().split(/\s+/, 2);
			if (action === "undo" && id) {
				appendCorrectionEvent(filePath, { type: "candidate_undone", at: now(), candidateId: id });
				scheduleGrouping(ctx);
				ctx.ui.notify(`Undid ${id}.`, "info");
				return;
			}

			const state = activeState();
			const pattern = id ? state.patterns.find(({ id: patternId }) => patternId === id) : undefined;
			if (["accept", "reject", "defer"].includes(action) && id) {
				if (!pattern) {
					ctx.ui.notify(`Unknown correction pattern: ${id}`, "warning");
					return;
				}
				const decision = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "deferred";
				appendCorrectionEvent(filePath, { type: "proposal_decided", at: now(), patternId: id, decision });
				if (decision === "accepted") {
					pi.sendUserMessage(acceptedPrompt(pattern));
					return;
				}
				ctx.ui.notify(`${decision === "rejected" ? "Rejected" : "Deferred"} ${pattern.title}.`, "info");
				return;
			}

			const ready = state.patterns.filter(({ disposition }) => disposition === "ready");
			const lines = [
				`${state.candidates.length} active correction candidate${state.candidates.length === 1 ? "" : "s"}.`,
				...ready.slice(0, 5).map((pattern) => `${pattern.id} · ${pattern.title} → ${patternTarget(pattern)}\n${pattern.intervention?.exactChange ?? pattern.eval?.expectedBehavior ?? pattern.proof.reason}`),
				ready.length === 0 ? "No improvement proposal is ready." : "Use /corrections accept|reject|defer <pattern-id>.",
			];
			ctx.ui.setWidget("corrections-review", lines, { placement: "aboveEditor" });
		},
	});
}
