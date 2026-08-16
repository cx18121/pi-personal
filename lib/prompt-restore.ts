export type PromptRestoreState =
	| { status: "idle" }
	| { status: "candidate"; text: string; parentId: string }
	| { status: "waiting"; text: string; parentId: string; outputSeen: boolean }
	| { status: "restoring"; text: string; parentId: string };

type AssistantOutputPart =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string }
	| { type: "toolCall"; id?: string; name?: string; arguments?: object };

export const assistantHasOutput = (content: readonly AssistantOutputPart[]) =>
	content.some((part) => {
		if (part.type === "text") return part.text.length > 0;
		if (part.type === "thinking") return part.thinking.length > 0;
		return true;
	});

export const canRestorePrompt = (state: PromptRestoreState) =>
	state.status === "waiting" && !state.outputSeen;

export const armPromptRestore = (state: PromptRestoreState): PromptRestoreState =>
	state.status === "candidate"
		? { status: "waiting", text: state.text, parentId: state.parentId, outputSeen: false }
		: state;

export const recordAssistantOutput = (state: PromptRestoreState): PromptRestoreState =>
	state.status === "waiting" ? { ...state, outputSeen: true } : state;

export const beginPromptRestore = (state: PromptRestoreState): PromptRestoreState =>
	state.status === "waiting" && !state.outputSeen
		? { status: "restoring", text: state.text, parentId: state.parentId }
		: state;
