import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendCorrectionEvent,
	correctionState,
	correctionsFile,
	createCorrectionCandidate,
	extractCorrectionMarker,
	inferCorrectionSource,
	parseGroupingOutput,
	protocolGapInterpretation,
	readCorrectionEvents,
} from "../lib/corrections.ts";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

type TestSessionEntry = { type: string; id: string; message: { role: string; content?: unknown } };
const sourceEntries = (): TestSessionEntry[] => [
	{ type: "message", id: "request", message: { role: "user" } },
	{ type: "message", id: "answer", message: { role: "assistant" } },
	{ type: "message", id: "correction", message: { role: "user" } },
	{ type: "message", id: "logging", message: { role: "assistant" } },
];

const candidate = () => createCorrectionCandidate({
	sessionId: "session",
	project: "/workspace",
	source: { requestEntryId: "request", assistantEntryId: "answer", correctionEntryId: "correction" },
	category: "prioritization",
	agentDecision: "Proposed unnecessary machinery",
	userFeedback: "This does not solve a current problem",
	expectedBehavior: "Compare against doing nothing",
	strength: "strong",
	kernelVersion: "kernel",
	now: new Date("2026-08-28T00:00:00Z"),
});

describe("correction storage", () => {
	test("appends private events and derives undo state", () => {
		const root = mkdtempSync(join(tmpdir(), "corrections-"));
		roots.push(root);
		const file = correctionsFile(root);
		const recorded = candidate();
		appendCorrectionEvent(file, { type: "candidate_recorded", at: recorded.createdAt, candidate: recorded });
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(correctionState(readCorrectionEvents(file)).candidates).toHaveLength(1);
		appendCorrectionEvent(file, { type: "candidate_undone", at: recorded.createdAt, candidateId: recorded.id });
		expect(correctionState(readCorrectionEvents(file)).candidates).toEqual([]);
	});

	test("extracts and hides model-authored correction markers", () => {
		const extracted = extractCorrectionMarker(`You're right.\n<cx-correction>{"category":"scope","agentDecision":"Expanded the task","userFeedback":"Keep it narrow","expectedBehavior":"Preserve the requested scope","strength":"strong"}</cx-correction>`);
		expect(extracted.content).toBe("You're right.");
		expect(extracted.classification).toBe("correction");
		expect(extracted.interpretation).toEqual({
			category: "scope",
			agentDecision: "Expanded the task",
			userFeedback: "Keep it narrow",
			expectedBehavior: "Preserve the requested scope",
			strength: "strong",
		});
		expect(extractCorrectionMarker("ordinary answer")).toEqual({ content: "ordinary answer" });
		expect(extractCorrectionMarker('Done.\n<cx-correction>{"kind":"none"}</cx-correction>')).toEqual({
			content: "Done.",
			classification: "none",
		});
	});

	test("infers exact request, answer, and correction provenance", () => {
		expect(inferCorrectionSource(sourceEntries())).toEqual({
			requestEntryId: "request",
			assistantEntryId: "answer",
			correctionEntryId: "correction",
		});
		expect(() => inferCorrectionSource(sourceEntries(), {
			requestEntryId: "answer",
			assistantEntryId: "request",
			correctionEntryId: "correction",
		})).toThrow("is not a user message");
	});

	test("creates a weak candidate from a missing classification", () => {
		const entries = sourceEntries();
		entries[1]!.message.content = [{ type: "text", text: "Moved the technical notes to the wiki." }];
		entries[2]!.message.content = "I don't think those belong in the wiki.";
		expect(protocolGapInterpretation(entries)).toEqual({
			category: "missing correction classification",
			agentDecision: "Moved the technical notes to the wiki.",
			userFeedback: "I don't think those belong in the wiki.",
			expectedBehavior: "Review this turn because its required correction classification was missing.",
			strength: "weak",
		});
	});

	test("validates grouping evidence and creates stable pattern ids", () => {
		const recorded = candidate();
		const output = JSON.stringify([{
			title: "Unnecessary machinery",
			summary: "The agent proposed tooling without a current failure.",
			candidateIds: [recorded.id],
			disposition: "ready",
			proof: {
				kind: "new_mechanical_eval",
				reason: "No existing case covers the routing outcome.",
			},
			eval: {
				input: "What should we improve next?",
				expectedBehavior: "Compare against doing nothing.",
				forbiddenBehavior: ["Propose machinery without a current failure"],
				rubric: [],
				models: ["openai", "fable"],
			},
			reason: "The correction identifies a durable prioritization rule.",
		}]);
		const first = parseGroupingOutput(output, [recorded]);
		const second = parseGroupingOutput(output, [recorded]);
		expect(first).toEqual(second);
		expect(first[0]?.id).toStartWith("pattern-");
		const repeatedEvidence = output.replace(`"candidateIds":["${recorded.id}"]`, `"candidateIds":["${recorded.id}","${recorded.id}"]`);
		expect(parseGroupingOutput(repeatedEvidence, [recorded])[0]).toMatchObject({
			id: first[0]?.id,
			candidateIds: [recorded.id],
		});
		expect(() => parseGroupingOutput(output.replaceAll(recorded.id, "unknown"), [recorded])).toThrow("unknown evidence");
		const duplicate = JSON.stringify([...(JSON.parse(output) as object[]), { ...(JSON.parse(output) as object[])[0], title: "Duplicate" }]);
		expect(() => parseGroupingOutput(duplicate, [recorded])).toThrow("reuses candidate");
	});

	test("requires proof, earns evals, and keeps one intervention owner", () => {
		const recorded = candidate();
		const intervention = JSON.stringify([{
			title: "Prioritize common work",
			summary: "Frequent value was underweighted.",
			candidateIds: [recorded.id],
			disposition: "ready",
			proof: { kind: "existing_test", reason: "The routing suite covers this contract." },
			intervention: {
				action: "change",
				owner: "agents",
				scope: "global",
				exactChange: "Add the 98/98 priority rule to AGENTS.md.",
				whyThisOwner: "It applies to nearly every task even when CX is off.",
			},
			reason: "A strong correction identifies baseline behavior.",
		}]);
		expect(parseGroupingOutput(intervention, [recorded])[0]?.intervention?.owner).toBe("agents");
		expect(parseGroupingOutput(intervention.replace('"agents"', '"project_docs"'), [recorded])[0]?.intervention?.owner).toBe("project_docs");

		const uselessEval = intervention
			.replace('"existing_test"', '"new_live_eval"')
			.replace('"intervention":', '"eval":null,"intervention":');
		expect(() => parseGroupingOutput(uselessEval, [recorded])).toThrow("Invalid correction eval");
	});
});
