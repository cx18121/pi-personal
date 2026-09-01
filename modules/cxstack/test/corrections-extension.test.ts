import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { CorrectionReviewTheme } from "../components/corrections-review.ts";
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
	const customComponents: Component[] = [];
	const customOptions: Array<{ overlay?: boolean } | undefined> = [];
	const confirmations: string[] = [];
	const entries = [
		{ type: "custom", id: "cx", customType: CX_STATE_ENTRY, data: { active: true } },
		{ type: "message", id: "request", message: { role: "user", content: "What should we do next?" } },
		{ type: "message", id: "answer", message: { role: "assistant", content: [{ type: "text", text: "Use a sanitizer." }] } },
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
		mode: "tui",
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
			confirm(title: string, message: string) {
				confirmations.push(`${title}\n${message}`);
				return Promise.resolve(true);
			},
			custom<Result>(
				factory: (
					tui: { requestRender(): void },
					theme: CorrectionReviewTheme,
					keybindings: { matches(data: string, binding: string): boolean },
					done: (result: Result) => void,
				) => Component,
				options?: { overlay?: boolean },
			) {
				customOptions.push(options);
				return new Promise<Result>((resolve) => {
					customComponents.push(factory(
						{ requestRender() {} },
						{
							fg: (_color: string, text: string) => text,
							bg: (_color: string, text: string) => text,
							bold: (text: string) => text,
						},
						{ matches: () => false },
						resolve,
					));
				});
			},
		},
	} as unknown as ExtensionContext;
	registerCorrections(pi, { agentDir, group });
	return {
		agentDir,
		entries,
		handlers,
		tools,
		commands,
		notifications,
		userMessages,
		widgets,
		customComponents,
		customOptions,
		confirmations,
		context,
	};
}

async function execute(tool: ToolDefinition, params: Record<string, unknown>, context: ExtensionContext) {
	return tool.execute("tool-call", params as never, new AbortController().signal, undefined, context);
}

function capture(h: ReturnType<typeof harness>) {
	return h.handlers.get("message_end")?.({
		message: {
			role: "assistant",
			stopReason: "stop",
			content: [{
				type: "text",
				text: `You're right.\n<cx-correction>{"category":"prioritization","agentDecision":"Proposed a sanitizer without a current failure","userFeedback":"That is unnecessary","expectedBehavior":"Compare against doing nothing","strength":"strong"}</cx-correction>`,
			}],
		},
	}, h.context);
}

test("does not classify ordinary responses or stop reasons", () => {
	const h = harness();
	const before = h.handlers.get("before_agent_start")?.({ prompt: "Continue.", systemPrompt: "base" }, h.context);
	expect(before.systemPrompt).not.toContain('{"kind":"none"}');
	for (const stopReason of ["toolUse", "length", "error", "aborted", "stop"]) {
		h.handlers.get("message_end")?.({
			message: { role: "assistant", stopReason, content: [{ type: "text", text: "Checking." }] },
		}, h.context);
	}
	expect(correctionState(readCorrectionEvents(correctionsFile(h.agentDir))).candidates).toEqual([]);
	expect(h.notifications).toEqual([]);
});

test("keeps a correction classification through a failed response retry", () => {
	const h = harness();
	h.handlers.get("before_agent_start")?.({ prompt: "That is unnecessary.", systemPrompt: "base" }, h.context);
	const marker = `Retrying.\n<cx-correction>{"category":"prioritization","agentDecision":"Proposed a sanitizer without a current failure","userFeedback":"That is unnecessary","expectedBehavior":"Compare against doing nothing","strength":"strong"}</cx-correction>`;
	const failed = h.handlers.get("message_end")?.({
		message: { role: "assistant", stopReason: "error", content: [{ type: "text", text: marker }] },
	}, h.context);
	expect(failed?.message.content[0].text).toBe("Retrying.");
	expect(correctionState(readCorrectionEvents(correctionsFile(h.agentDir))).candidates).toEqual([]);

	h.handlers.get("message_end")?.({
		message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Completed." }] },
	}, h.context);
	expect(correctionState(readCorrectionEvents(correctionsFile(h.agentDir))).candidates).toHaveLength(1);
	expect(h.notifications.some((message) => message.startsWith("Correction recorded"))).toBeTrue();
});

test("binds an intermediate correction marker before later steering arrives", () => {
	const h = harness();
	h.handlers.get("before_agent_start")?.({ prompt: "That is unnecessary.", systemPrompt: "base" }, h.context);
	const marker = `Checking.\n<cx-correction>{"category":"prioritization","agentDecision":"Proposed a sanitizer without a current failure","userFeedback":"That is unnecessary","expectedBehavior":"Compare against doing nothing","strength":"strong"}</cx-correction>`;
	h.handlers.get("message_end")?.({
		message: { role: "assistant", stopReason: "toolUse", content: [{ type: "text", text: marker }] },
	}, h.context);
	h.entries.push({ type: "message", id: "later-steering", message: { role: "user", content: "One more thing." } });
	h.handlers.get("message_end")?.({
		message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Completed." }] },
	}, h.context);
	const recorded = correctionState(readCorrectionEvents(correctionsFile(h.agentDir))).candidates;
	expect(recorded).toHaveLength(1);
	expect(recorded[0]?.source.correctionEntryId).toBe("correction");
});

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
	first.handlers.get("session_shutdown")?.({}, first.context);
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

test("opens a dismissible temporary correction review without leaving a widget", async () => {
	const h = harness();
	capture(h);
	await settle();
	const command = h.commands.get("corrections");
	expect(command).toBeDefined();
	if (!command) return;

	const review = command("", h.context);
	await settle();
	const component = h.customComponents[0];
	expect(component).toBeDefined();
	expect(h.customOptions[0]).toBeUndefined();
	expect(h.widgets.at(-1)).toBeUndefined();
	expect(component?.render(120).join("\n")).toContain("Unnecessary machinery");
	component?.handleInput?.("q");
	await review;
	expect(h.userMessages).toEqual([]);
});

test("accepts a selected correction after confirmation", async () => {
	const h = harness();
	capture(h);
	await settle();
	const command = h.commands.get("corrections");
	expect(command).toBeDefined();
	if (!command) return;

	const review = command("", h.context);
	await settle();
	h.customComponents[0]?.handleInput?.("a");
	await review;
	expect(h.confirmations[0]).toContain("Accept correction?");
	expect(h.userMessages[0]).toContain("Implement the accepted correction proposal");
});

test("starts a discussion without deciding or applying the correction", async () => {
	const h = harness();
	capture(h);
	await settle();
	const command = h.commands.get("corrections");
	expect(command).toBeDefined();
	if (!command) return;

	const review = command("", h.context);
	await settle();
	h.customComponents[0]?.handleInput?.("c");
	await review;
	const state = correctionState(readCorrectionEvents(correctionsFile(h.agentDir)));
	expect(state.decisions.size).toBe(0);
	expect(h.userMessages[0]).toContain("This is discussion only");
	expect(h.userMessages[0]).toContain("Unnecessary machinery");
	expect(h.userMessages[0]).toContain("That is unnecessary");
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
