import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type CorrectionStrength = "weak" | "strong";
export type CorrectionOwner = "code_or_test" | "agents" | "project_docs" | "cxstack" | "skill" | "memory" | "papercut";
export type CorrectionProofKind = "existing_test" | "new_mechanical_eval" | "new_live_eval" | "direct_observation" | "no_additional_proof";

export type CorrectionInterpretation = {
	category: string;
	agentDecision: string;
	userFeedback: string;
	expectedBehavior: string;
	strength: CorrectionStrength;
};

export type CorrectionSource = {
	requestEntryId: string;
	assistantEntryId: string;
	correctionEntryId: string;
};

export type CorrectionCandidate = {
	id: string;
	sessionId: string;
	project: string;
	source: CorrectionSource;
	category: string;
	agentDecision: string;
	userFeedback: string;
	expectedBehavior: string;
	strength: CorrectionStrength;
	kernelVersion: string;
	createdAt: string;
};

export type CorrectionPattern = {
	id: string;
	title: string;
	summary: string;
	candidateIds: string[];
	disposition: "one_off" | "hold" | "ready";
	proof: {
		kind: CorrectionProofKind;
		reason: string;
	};
	eval?: {
		input: string;
		expectedBehavior: string;
		forbiddenBehavior: string[];
		rubric: string[];
		models: Array<"openai" | "fable">;
	};
	intervention?: {
		action: "add" | "change" | "remove";
		owner: CorrectionOwner;
		scope: "project" | "global";
		exactChange: string;
		whyThisOwner: string;
	};
	reason: string;
};

export type CorrectionEvent =
	| { type: "candidate_recorded"; at: string; candidate: CorrectionCandidate }
	| { type: "candidate_undone"; at: string; candidateId: string }
	| { type: "grouping_snapshot"; at: string; candidateIds: string[]; patterns: CorrectionPattern[] }
	| { type: "proposal_surfaced"; at: string; patternId: string }
	| { type: "proposal_decided"; at: string; patternId: string; decision: "accepted" | "rejected" | "deferred" }
	| { type: "proposal_outcome"; at: string; patternId: string; outcome: "applied" | "rejected_by_proof"; evidence: string };

export type CorrectionState = {
	candidates: CorrectionCandidate[];
	patterns: CorrectionPattern[];
	decisions: Map<string, "accepted" | "rejected" | "deferred">;
	outcomes: Map<string, "applied" | "rejected_by_proof">;
	surfaced: Set<string>;
};

type SessionEntry = {
	id?: unknown;
	type?: unknown;
	message?: { role?: unknown; content?: unknown };
};

const bounded = (value: string, max = 600) => value.replace(/\s+/g, " ").trim().slice(0, max);
const text = (value: unknown) => typeof value === "string" ? value : undefined;
const stringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string")
	? value
	: undefined;
const messageText = (content: unknown) => {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part): part is { type: "text"; text: string } => Boolean(part) && typeof part === "object" && part.type === "text" && typeof part.text === "string")
		.map(({ text }) => text)
		.join("\n");
};

export function looksLikeCorrection(input: string): boolean {
	const text = input.replace(/\s+/g, " ").toLowerCase();
	return [
		/\b(i|we) (?:do not|don't|dont) think\b/,
		/\b(?:you are|you're|ur|u are) (?:wrong|confused|missing|overthinking)\b/,
		/\b(?:that|this) (?:is|seems|feels) (?:wrong|unnecessary|overkill|too much|confusing)\b/,
		/\b(?:why did|why didn't|why didnt) (?:you|u)\b/,
		/\b(?:do|did) we (?:really )?need\b/,
		/\b(?:are|r) (?:you|u) sure\b/,
		/\b(?:not what i asked|i didn't ask|i didnt ask)\b/,
		/\b(?:let's|lets|we should) (?:defer|skip|stop)\b/,
		/\bi (?:just |keep )?(?:corrected|correct) (?:u|you)\b/,
		/\bshould(?:'ve| have) been (?:a )?correction\b/,
	].some((pattern) => pattern.test(text));
}

export function fallbackCorrectionInterpretation(entries: SessionEntry[], userFeedback: string): CorrectionInterpretation {
	const source = inferCorrectionSource(entries);
	const assistant = entries.find((entry) => entry.id === source.assistantEntryId);
	const decision = messageText(assistant?.message?.content);
	return {
		category: "unclassified correction signal",
		agentDecision: decision || "Previous assistant response",
		userFeedback,
		expectedBehavior: "Review this feedback to determine how the previous response should have differed.",
		strength: "weak",
	};
}

export function correctionsFile(agentDir: string): string {
	return join(agentDir, "corrections", "events.jsonl");
}

export function appendCorrectionEvent(filePath: string, event: CorrectionEvent): void {
	mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
	appendFileSync(filePath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600, flag: "a" });
	chmodSync(filePath, 0o600);
}

export function readCorrectionEvents(filePath: string): CorrectionEvent[] {
	let content = "";
	try {
		content = readFileSync(filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	return content.split("\n").filter(Boolean).map((line, index) => {
		try {
			return JSON.parse(line) as CorrectionEvent;
		} catch {
			throw new Error(`Invalid correction event at line ${index + 1}.`);
		}
	});
}

export function correctionState(events: CorrectionEvent[]): CorrectionState {
	const candidates = new Map<string, CorrectionCandidate>();
	const undone = new Set<string>();
	const decisions = new Map<string, "accepted" | "rejected" | "deferred">();
	const outcomes = new Map<string, "applied" | "rejected_by_proof">();
	const surfaced = new Set<string>();
	const patternsById = new Map<string, CorrectionPattern>();
	let patterns: CorrectionPattern[] = [];

	for (const event of events) {
		if (event.type === "candidate_recorded") candidates.set(event.candidate.id, event.candidate);
		if (event.type === "candidate_undone") undone.add(event.candidateId);
		if (event.type === "grouping_snapshot") {
			patterns = event.patterns;
			for (const pattern of event.patterns) patternsById.set(pattern.id, pattern);
		}
		if (event.type === "proposal_surfaced") surfaced.add(event.patternId);
		if (event.type === "proposal_decided") decisions.set(event.patternId, event.decision);
		if (event.type === "proposal_outcome") outcomes.set(event.patternId, event.outcome);
	}

	const settledCandidates = new Set(
		[...decisions]
			.filter(([patternId, decision]) =>
				decision === "rejected" || (decision === "accepted" && outcomes.get(patternId) !== "rejected_by_proof"),
			)
			.flatMap(([patternId]) => patternsById.get(patternId)?.candidateIds ?? []),
	);
	const activeCandidates = [...candidates.values()].filter(
		(candidate) => !undone.has(candidate.id) && !settledCandidates.has(candidate.id),
	);
	const activeIds = new Set(activeCandidates.map(({ id }) => id));
	return {
		candidates: activeCandidates,
		patterns: patterns.filter((pattern) => {
			const decision = decisions.get(pattern.id);
			const reconsider = decision === "accepted" && outcomes.get(pattern.id) === "rejected_by_proof";
			const reviewable = !decision || decision === "deferred" || reconsider;
			return reviewable && pattern.candidateIds.every((id) => activeIds.has(id));
		}),
		decisions,
		outcomes,
		surfaced,
	};
}

export function inferCorrectionSource(entries: SessionEntry[], explicit?: CorrectionSource): CorrectionSource {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	if (explicit) {
		const roles = [
			[explicit.requestEntryId, "user"],
			[explicit.assistantEntryId, "assistant"],
			[explicit.correctionEntryId, "user"],
		] as const;
		for (const [id, role] of roles) {
			if (byId.get(id)?.message?.role !== role) throw new Error(`Correction source ${id} is not a ${role} message.`);
		}
		return explicit;
	}

	const messages = entries.filter((entry) => entry.type === "message" && typeof entry.id === "string" && entry.message);
	const correction = messages.findLastIndex((entry) => entry.message?.role === "user");
	const assistant = messages.findLastIndex((entry, index) => index < correction && entry.message?.role === "assistant");
	const request = messages.findLastIndex((entry, index) => index < assistant && entry.message?.role === "user");
	if ([correction, assistant, request].some((index) => index < 0)) {
		throw new Error("Correction logging needs a request, the corrected assistant response, and the user feedback.");
	}
	return {
		requestEntryId: messages[request]!.id as string,
		assistantEntryId: messages[assistant]!.id as string,
		correctionEntryId: messages[correction]!.id as string,
	};
}

export function extractCorrectionMarker(content: string): { content: string; interpretation?: CorrectionInterpretation } {
	const startToken = "<cx-correction>";
	const endToken = "</cx-correction>";
	const start = content.lastIndexOf(startToken);
	const end = content.indexOf(endToken, start + startToken.length);
	if (start < 0 || end < 0) return { content };
	const cleaned = `${content.slice(0, start)}${content.slice(end + endToken.length)}`.trimEnd();
	let value: unknown;
	try {
		value = JSON.parse(content.slice(start + startToken.length, end));
	} catch {
		return { content: cleaned };
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) return { content: cleaned };
	const record = value as Record<string, unknown>;
	const category = text(record.category);
	const agentDecision = text(record.agentDecision);
	const userFeedback = text(record.userFeedback);
	const expectedBehavior = text(record.expectedBehavior);
	const strength = record.strength === "weak" || record.strength === "strong" ? record.strength : undefined;
	if (!category || !agentDecision || !userFeedback || !expectedBehavior || !strength) return { content: cleaned };
	return {
		content: cleaned,
		interpretation: { category, agentDecision, userFeedback, expectedBehavior, strength },
	};
}

export function createCorrectionCandidate(input: {
	sessionId: string;
	project: string;
	source: CorrectionSource;
	category: string;
	agentDecision: string;
	userFeedback: string;
	expectedBehavior: string;
	strength: CorrectionStrength;
	kernelVersion: string;
	now?: Date;
}): CorrectionCandidate {
	return {
		id: `correction-${randomUUID().slice(0, 8)}`,
		sessionId: input.sessionId,
		project: input.project,
		source: input.source,
		category: bounded(input.category, 80),
		agentDecision: bounded(input.agentDecision),
		userFeedback: bounded(input.userFeedback),
		expectedBehavior: bounded(input.expectedBehavior),
		strength: input.strength,
		kernelVersion: input.kernelVersion,
		createdAt: (input.now ?? new Date()).toISOString(),
	};
}

export function groupingInput(candidates: CorrectionCandidate[]): string {
	return JSON.stringify(candidates.map(({ id, project, category, agentDecision, userFeedback, expectedBehavior, strength }) => ({
		id,
		project,
		category,
		agentDecision,
		userFeedback,
		expectedBehavior,
		strength,
	})), null, 2);
}

export function parseGroupingOutput(output: string, candidates: CorrectionCandidate[]): CorrectionPattern[] {
	const start = output.indexOf("[");
	const end = output.lastIndexOf("]");
	if (start < 0 || end < start) throw new Error("Correction grouping returned no JSON array.");
	const value: unknown = JSON.parse(output.slice(start, end + 1));
	if (!Array.isArray(value)) throw new Error("Correction grouping must return an array.");
	const candidateIds = new Set(candidates.map((candidate) => candidate.id));
	const patterns = value.map((item, index) => {
		if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Invalid correction pattern ${index + 1}.`);
		const record = item as Record<string, unknown>;
		const evidence = stringArray(record.candidateIds);
		const title = text(record.title);
		const summary = text(record.summary);
		const reason = text(record.reason);
		const disposition = ["one_off", "hold", "ready"].includes(String(record.disposition))
			? record.disposition as CorrectionPattern["disposition"]
			: undefined;
		const proofRecord = record.proof && typeof record.proof === "object" && !Array.isArray(record.proof)
			? record.proof as Record<string, unknown>
			: undefined;
		const proofKind = ["existing_test", "new_mechanical_eval", "new_live_eval", "direct_observation", "no_additional_proof"].includes(String(proofRecord?.kind))
			? proofRecord?.kind as CorrectionProofKind
			: undefined;
		const proofReason = text(proofRecord?.reason);
		if (!title || !summary || !evidence?.length || !disposition || !proofKind || !proofReason || !reason) {
			throw new Error(`Incomplete correction pattern ${index + 1}.`);
		}
		if (evidence.some((id) => !candidateIds.has(id))) throw new Error(`Correction pattern ${index + 1} references unknown evidence.`);
		const uniqueEvidence = [...new Set(evidence)].sort();

		let evalCase: CorrectionPattern["eval"];
		if (record.eval !== undefined) {
			if (!record.eval || typeof record.eval !== "object" || Array.isArray(record.eval)) throw new Error(`Invalid correction eval ${index + 1}.`);
			const evalRecord = record.eval as Record<string, unknown>;
			const input = text(evalRecord.input);
			const expectedBehavior = text(evalRecord.expectedBehavior);
			const forbiddenBehavior = stringArray(evalRecord.forbiddenBehavior);
			const rubric = stringArray(evalRecord.rubric);
			const models = stringArray(evalRecord.models)?.filter((model): model is "openai" | "fable" => model === "openai" || model === "fable");
			if (!input || !expectedBehavior || !forbiddenBehavior || !rubric || !models?.length) throw new Error(`Incomplete correction eval ${index + 1}.`);
			evalCase = { input: bounded(input), expectedBehavior: bounded(expectedBehavior), forbiddenBehavior, rubric, models: [...new Set(models)] };
		}

		let intervention: CorrectionPattern["intervention"];
		if (record.intervention !== undefined) {
			if (!record.intervention || typeof record.intervention !== "object" || Array.isArray(record.intervention)) throw new Error(`Invalid correction intervention ${index + 1}.`);
			const interventionRecord = record.intervention as Record<string, unknown>;
			const action = ["add", "change", "remove"].includes(String(interventionRecord.action))
				? interventionRecord.action as "add" | "change" | "remove"
				: undefined;
			const owner = ["code_or_test", "agents", "project_docs", "cxstack", "skill", "memory", "papercut"].includes(String(interventionRecord.owner))
				? interventionRecord.owner as CorrectionOwner
				: undefined;
			const scope = interventionRecord.scope === "project" || interventionRecord.scope === "global" ? interventionRecord.scope : undefined;
			const exactChange = text(interventionRecord.exactChange);
			const whyThisOwner = text(interventionRecord.whyThisOwner);
			if (!action || !owner || !scope || !exactChange || !whyThisOwner) throw new Error(`Incomplete correction intervention ${index + 1}.`);
			intervention = { action, owner, scope, exactChange: bounded(exactChange, 1000), whyThisOwner: bounded(whyThisOwner) };
		}

		const needsEval = proofKind === "new_mechanical_eval" || proofKind === "new_live_eval";
		if (needsEval !== Boolean(evalCase)) throw new Error(`Correction pattern ${index + 1} has an inconsistent eval proof.`);
		if (evalCase && (!evalCase.models.includes("openai") || !evalCase.models.includes("fable"))) {
			throw new Error(`Correction eval ${index + 1} must cover OpenAI and Fable.`);
		}
		if (disposition === "ready" && !evalCase && !intervention) throw new Error(`Ready correction pattern ${index + 1} proposes no action.`);
		if (disposition !== "ready" && (evalCase || intervention)) throw new Error(`Unready correction pattern ${index + 1} proposes an action.`);

		const fingerprint = createHash("sha256").update(uniqueEvidence.join("\0")).digest("hex").slice(0, 10);
		return {
			id: `pattern-${fingerprint}`,
			title: bounded(title, 120),
			summary: bounded(summary),
			candidateIds: uniqueEvidence,
			disposition,
			proof: { kind: proofKind, reason: bounded(proofReason) },
			...(evalCase ? { eval: evalCase } : {}),
			...(intervention ? { intervention } : {}),
			reason: bounded(reason),
		};
	});
	const assignedCandidates = new Set<string>();
	for (const [index, pattern] of patterns.entries()) {
		for (const candidateId of pattern.candidateIds) {
			if (assignedCandidates.has(candidateId)) {
				throw new Error(`Correction pattern ${index + 1} reuses candidate ${candidateId}.`);
			}
			assignedCandidates.add(candidateId);
		}
	}
	return patterns;
}
