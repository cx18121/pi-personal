import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import registerCorrections from "../extensions/corrections.ts";
import {
	correctionState,
	correctionsFile,
	readCorrectionEvents,
	type CorrectionCandidate,
	type CorrectionPattern,
} from "../lib/corrections.ts";
import { CX_STATE_ENTRY } from "../lib/cx.ts";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const readyPatterns = (candidates: CorrectionCandidate[]): CorrectionPattern[] => [{
	id: "pattern-test",
	title: "Unnecessary machinery",
	summary: "The agent proposed tooling without a current failure.",
	candidateIds: candidates.map(({ id }) => id),
	disposition: "ready",
	proof: {
		kind: "new_mechanical_eval",
		reason: "No existing routing case covers this behavior.",
	},
	eval: {
		input: "What should we improve next?",
		expectedBehavior: "Compare against doing nothing.",
		forbiddenBehavior: ["Propose machinery without a current failure"],
		rubric: [],
		models: ["openai", "fable"],
	},
	reason: "Strong durable correction.",
}];

function harness(
	group: (candidates: CorrectionCandidate[], ctx: ExtensionContext, signal: AbortSignal) => Promise<CorrectionPattern[]> = async (candidates) => readyPatterns(candidates),
	existingAgentDir?: string,
) {
	const agentDir = existingAgentDir ?? mkdtempSync(join(tmpdir(), "corrections-extension-"));
	if (!existingAgentDir) roots.push(agentDir);
	const handlers = new Map<string, (...args: any[]) => any>();
	const tools = new Map<string, ToolDefinition>();
	const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void>>();
	const notifications: string[] = [];
	const userMessages: string[] = [];
	const widgets: unknown[] = [];
	const entries = [
		{ type: "custom", id: "cx", customType: CX_STATE_ENTRY, data: { active: true } },
		{ type: "message", id: "request", message: { role: "user", content: "What should we do next?" } },
		{ type: "message", id: "answer", message: { role: "assistant", content: [] } },
		{ type: "message", id: "correction", message: { role: "user", content: "That is unnecessary." } },
		{ type: "message", id: "logging", message: { role: "assistant", content: [] } },
	];
	const pi = {
		on(event: string, handler: (...args: any[]) => any) {
			handlers.set(event, handler);
		},
		registerTool(tool: ToolDefinition) {
			tools.set(tool.name, tool);
		},
		registerCommand(name: string, command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> }) {
			commands.set(name, command.handler);
		},
		sendUserMessage(content: string) {
			userMessages.push(content);
		},
	} as unknown as ExtensionAPI;
	const context = {
		cwd: "/workspace",
		hasUI: true,
		modelRegistry: {} as never,
		scopedModels: [],
		sessionManager: {
			getEntries: () => entries,
			getBranch: () => entries,
			getSessionId: () => "session",
		},
		ui: {
			notify(message: string) {
				notifications.push(message);
			},
			setWidget(_key: string, value: unknown) {
				widgets.push(value);
			},
		},
	} as unknown as ExtensionContext;
	registerCorrections(pi, { agentDir, group });
	return { agentDir, handlers, tools, commands, notifications, userMessages, widgets, context };
}

async function execute(tool: ToolDefinition, params: Record<string, unknown>, context: ExtensionContext) {
	return tool.execute("tool-call", params as never, new AbortController().signal, undefined, context);
}

function capture(h: ReturnType<typeof harness>) {
	return h.handlers.get("message_end")?.({
		message: {
			role: "assistant",
			content: [{
				type: "text",
				text: `You're right.\n<cx-correction>{"category":"prioritization","agentDecision":"Proposed a sanitizer without a current failure","userFeedback":"That is unnecessary","expectedBehavior":"Compare against doing nothing","strength":"strong"}</cx-correction>`,
			}],
		},
	}, h.context);
}

test("capture returns before background grouping finishes", async () => {
	let resolveGrouping!: (patterns: CorrectionPattern[]) => void;
	let groupedCandidates: CorrectionCandidate[] = [];
	const grouping = new Promise<CorrectionPattern[]>((resolve) => {
		resolveGrouping = resolve;
	});
	const h = harness(async (candidates) => {
		groupedCandidates = candidates;
		return grouping;
	});

	const result = capture(h);
	expect(result?.message.content[0].text).toBe("You're right.");
	expect(correctionState(readCorrectionEvents(correctionsFile(h.agentDir))).candidates).toHaveLength(1);
	resolveGrouping(readyPatterns(groupedCandidates));
	await settle();
});

test("aborted grouping retries from the durable queue on next startup", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "corrections-retry-"));
	roots.push(agentDir);
	let groupCalls = 0;
	const first = harness((_candidates, _ctx, signal) => {
		groupCalls++;
		return new Promise((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
		});
	}, agentDir);
	capture(first);
	capture(first);
	await settle();
	first.handlers.get("session_shutdown")?.();
	await settle();
	expect(groupCalls).toBe(1);
	expect(correctionState(readCorrectionEvents(correctionsFile(agentDir))).patterns).toEqual([]);

	const second = harness(async (candidates) => readyPatterns(candidates), agentDir);
	second.handlers.get("session_start")?.({}, second.context);
	await settle();
	expect(correctionState(readCorrectionEvents(correctionsFile(agentDir))).patterns).toHaveLength(1);
});

test("captures a correction, groups it off the response path, and supports undo", async () => {
	const h = harness();
	capture(h);
	const candidateId = correctionState(readCorrectionEvents(correctionsFile(h.agentDir))).candidates[0]!.id;
	await settle();
	await h.handlers.get("agent_settled")?.({}, h.context);
	expect(h.notifications).toContain("Harness improvement ready: Unnecessary machinery. Run /corrections to review.");
	expect(h.notifications.some((message) => message.includes(`/corrections undo ${candidateId}`))).toBeTrue();

	await h.commands.get("corrections")?.(`undo ${candidateId}`, h.context);
	const state = correctionState(readCorrectionEvents(correctionsFile(h.agentDir)));
	expect(state.candidates).toEqual([]);
	expect(state.patterns).toEqual([]);
});

test("Reflect can backfill an approved correction with exact provenance", async () => {
	const h = harness();
	const result = await execute(h.tools.get("correction_log")!, {
		category: "prioritization",
		agentDecision: "Proposed unnecessary machinery",
		userFeedback: "That is unnecessary",
		expectedBehavior: "Compare against doing nothing",
		strength: "strong",
		source: {
			requestEntryId: "request",
			assistantEntryId: "answer",
			correctionEntryId: "correction",
		},
	}, h.context);
	expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("Backfilled correction") });
});

test("deferred proposals remain reviewable and can be accepted later", async () => {
	const h = harness();
	capture(h);
	await settle();
	const patternId = correctionState(readCorrectionEvents(correctionsFile(h.agentDir))).patterns[0]!.id;

	await h.commands.get("corrections")?.(`defer ${patternId}`, h.context);
	expect(correctionState(readCorrectionEvents(correctionsFile(h.agentDir))).patterns[0]?.id).toBe(patternId);
	await h.commands.get("corrections")?.(`accept ${patternId}`, h.context);
	expect(h.userMessages[0]).toContain("Implement the accepted correction proposal");
});

test("accepted proposals authorize the exact local action without delivery", async () => {
	const h = harness();
	capture(h);
	await settle();
	const state = correctionState(readCorrectionEvents(correctionsFile(h.agentDir)));
	const pattern = state.patterns[0]!;

	await h.commands.get("corrections")?.(`accept ${pattern.id}`, h.context);
	expect(h.userMessages[0]).toContain("This is authorization for the exact local change");
	expect(h.userMessages[0]).toContain("not commit, push, publication, or deployment");
	expect(h.userMessages[0]).toContain(pattern.eval!.expectedBehavior);
	expect(h.userMessages[0]).toContain("revert the candidate intervention");
	const outcome = await execute(h.tools.get("correction_outcome")!, {
		patternId: pattern.id,
		outcome: "rejected_by_proof",
		evidence: "The candidate regressed a routing case.",
	}, h.context);
	expect(outcome.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("rejected_by_proof") });
	await settle();
	const events = readCorrectionEvents(correctionsFile(h.agentDir));
	expect(events.some((event) => event.type === "proposal_outcome" && event.outcome === "rejected_by_proof")).toBeTrue();
	const rejected = correctionState(events);
	expect(rejected.candidates).toHaveLength(1);
	expect(rejected.patterns).toHaveLength(1);
});
