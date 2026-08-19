export const CX_STATE_ENTRY = "cx-state";
export const CX_ACTIVE_MESSAGE = "cx-active";
export const CX_INACTIVE_MESSAGE = "cx-inactive";
export const CX_MARKER =
	"CX is active. Match the task: stay direct when clear; load rigor only when it earns its cost.";
export const CX_INACTIVE_CONTENT =
	"CX is inactive. Ignore every earlier CX kernel and marker instruction in this session unless a later CX activation message appears.";

export type CxDirective = "active" | "inactive";

export type CxRuntimeState = {
	active: boolean;
	hasState: boolean;
	pending?: CxDirective;
};

export type CxEntry = {
	type: string;
	customType?: string;
	data?: unknown;
};

export type CxCommandDecision =
	| { kind: "busy" }
	| { kind: "activate" }
	| { kind: "activate-task"; task: string }
	| { kind: "deactivate" }
	| { kind: "task"; task: string }
	| { kind: "noop-active" }
	| { kind: "noop-inactive" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const activeValue = (entry: CxEntry) => {
	if (entry.type !== "custom" || entry.customType !== CX_STATE_ENTRY || !isRecord(entry.data)) {
		return undefined;
	}

	return typeof entry.data.active === "boolean" ? entry.data.active : undefined;
};

export const emptyCxState = (): CxRuntimeState => ({
	active: false,
	hasState: false,
});

export const restoreCxState = (entries: readonly CxEntry[]): CxRuntimeState => {
	const value = entries.map(activeValue).findLast((active) => active !== undefined);
	return value === undefined
		? emptyCxState()
		: {
				active: value,
				hasState: true,
			};
};

export const restoreCxStateFile = (content: string) => {
	const entries = content
		.split("\n")
		.filter((line) => line.trim())
		.flatMap((line): CxEntry[] => {
			let value: unknown;
			try {
				value = JSON.parse(line);
			} catch {
				return [];
			}
			if (!isRecord(value) || typeof value.type !== "string") return [];

			return [
				{
					type: value.type,
					...(typeof value.customType === "string" ? { customType: value.customType } : {}),
					...("data" in value ? { data: value.data } : {}),
				},
			];
		});

	return restoreCxState(entries);
};

export const expectedCxDirective = (state: CxRuntimeState): CxDirective | undefined => {
	if (state.active) return "active";
	return state.hasState ? "inactive" : undefined;
};

export const latestCxDirective = (entries: readonly CxEntry[]): CxDirective | undefined =>
	entries
		.map((entry) => {
			if (entry.type !== "custom_message") return undefined;
			if (entry.customType === CX_ACTIVE_MESSAGE) return "active";
			if (entry.customType === CX_INACTIVE_MESSAGE) return "inactive";
			return undefined;
		})
		.findLast((directive) => directive !== undefined);

export const refreshPendingDirective = (
	state: CxRuntimeState,
	contextEntries: readonly CxEntry[],
): CxRuntimeState => {
	const expected = expectedCxDirective(state);
	return {
		...state,
		pending: expected !== undefined && latestCxDirective(contextEntries) !== expected ? expected : undefined,
	};
};

export const decideCxCommand = (
	state: CxRuntimeState,
	args: string,
	idle: boolean,
): CxCommandDecision => {
	if (!idle) return { kind: "busy" };

	const command = args.trim();
	if (command === "off") {
		return state.active ? { kind: "deactivate" } : { kind: "noop-inactive" };
	}
	if (!command) {
		return state.active ? { kind: "noop-active" } : { kind: "activate" };
	}
	return state.active
		? { kind: "task", task: args }
		: { kind: "activate-task", task: args };
};

export const applyCxCommand = (
	state: CxRuntimeState,
	decision: CxCommandDecision,
): CxRuntimeState => {
	if (decision.kind === "activate" || decision.kind === "activate-task") {
		return { active: true, hasState: true, pending: "active" };
	}
	if (decision.kind === "deactivate") {
		return { active: false, hasState: true };
	}
	return state;
};

export const takeBeforeAgentDirective = (state: CxRuntimeState) => {
	if (state.pending !== undefined) {
		return {
			state: { ...state, pending: undefined },
			directive: state.pending,
			marker: false,
		};
	}

	return {
		state,
		directive: undefined,
		marker: state.active,
	};
};

export const clearPendingDirective = (state: CxRuntimeState): CxRuntimeState => ({
	...state,
	pending: undefined,
});

export const renderCxKernel = (content: string, resourceRoot: string) =>
	content.trim().replaceAll("(references/", `(${resourceRoot}/references/`);

export const cxDirectiveContent = (directive: CxDirective, kernel: string) =>
	directive === "active" ? kernel : CX_INACTIVE_CONTENT;
