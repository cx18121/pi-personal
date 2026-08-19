import { describe, expect, test } from "bun:test";
import registerCx from "../extensions/cx.ts";
import registerReflect from "../extensions/reflect.ts";
import {
	CX_ACTIVE_MESSAGE,
	CX_INACTIVE_MESSAGE,
	CX_MARKER,
	CX_STATE_ENTRY,
} from "../lib/cx.ts";

const createHarness = () => {
	const handlers = new Map();
	const commands = new Map();
	const entries = [];
	const messages = [];
	const userMessages = [];
	const notifications = [];
	const pi = {
		on(event, handler) {
			handlers.set(event, handler);
		},
		registerCommand(name, command) {
			commands.set(name, command);
		},
		appendEntry(customType, data) {
			entries.push({ customType, data });
		},
		sendMessage(message, options) {
			messages.push({ message, options });
		},
		sendUserMessage(content, options) {
			userMessages.push({ content, options });
		},
	};
	const context = ({ idle = true, sessionEntries = [], contextEntries = [] } = {}) => ({
		isIdle: () => idle,
		sessionManager: {
			getEntries: () => sessionEntries,
			buildContextEntries: () => contextEntries,
		},
		ui: {
			notify(message, level) {
				notifications.push({ message, level });
			},
		},
	});
	return { pi, handlers, commands, entries, messages, userMessages, notifications, context };
};

const stateEntry = (active) => ({
	type: "custom",
	customType: CX_STATE_ENTRY,
	data: { active },
});

const directiveEntry = (customType) => ({
	type: "custom_message",
	customType,
});

describe("CX extension wiring", () => {
	test("rejects busy commands before every state and model side effect", async () => {
		const harness = createHarness();
		registerCx(harness.pi);
		await harness.commands.get("cx").handler("ship it", harness.context({ idle: false }));
		expect(harness.entries).toEqual([]);
		expect(harness.messages).toEqual([]);
		expect(harness.userMessages).toEqual([]);
		expect(harness.notifications).toEqual([
			{ message: "Wait for Pi to finish, then retry /cx.", level: "warning" },
		]);
	});

	test("forwards an activation task once, then uses only the marker", async () => {
		const harness = createHarness();
		registerCx(harness.pi);
		const ctx = harness.context();
		harness.handlers.get("session_start")({ reason: "startup" }, ctx);

		const task = "  fix the promised surface  ";
		await harness.commands.get("cx").handler(task, ctx);
		expect(harness.entries).toEqual([{ customType: CX_STATE_ENTRY, data: { active: true } }]);
		expect(harness.userMessages).toEqual([{ content: task, options: undefined }]);

		const activation = harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
		expect(activation.message.customType).toBe(CX_ACTIVE_MESSAGE);
		expect(activation.systemPrompt).toBeUndefined();

		await harness.commands.get("cx").handler("next task", ctx);
		expect(harness.entries).toHaveLength(1);
		expect(harness.userMessages).toHaveLength(2);
		const ordinary = harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
		expect(ordinary).toEqual({ systemPrompt: `base\n\n${CX_MARKER}` });
	});

	test("deactivates without a model turn and makes the inactive directive newest", async () => {
		const harness = createHarness();
		registerCx(harness.pi);
		const ctx = harness.context();
		harness.handlers.get("session_start")({ reason: "startup" }, ctx);
		await harness.commands.get("cx").handler("", ctx);
		await harness.commands.get("cx").handler("off", ctx);

		expect(harness.entries).toEqual([
			{ customType: CX_STATE_ENTRY, data: { active: true } },
			{ customType: CX_STATE_ENTRY, data: { active: false } },
		]);
		expect(harness.messages.at(-1)).toEqual({
			message: expect.objectContaining({ customType: CX_INACTIVE_MESSAGE }),
			options: { triggerTurn: false },
		});
		expect(harness.userMessages).toEqual([]);
	});

	test("restores tree state and uses the correct compaction delivery mode", () => {
		const harness = createHarness();
		registerCx(harness.pi);
		const active = stateEntry(true);
		const activeContext = directiveEntry(CX_ACTIVE_MESSAGE);
		const ctx = harness.context({ sessionEntries: [active], contextEntries: [activeContext] });
		harness.handlers.get("session_start")({ reason: "startup" }, ctx);

		const missingContext = harness.context({ sessionEntries: [active], contextEntries: [] });
		harness.handlers.get("session_tree")({}, missingContext);
		const treeTurn = harness.handlers.get("before_agent_start")(
			{ systemPrompt: "base" },
			missingContext,
		);
		expect(treeTurn.message.customType).toBe(CX_ACTIVE_MESSAGE);

		harness.handlers.get("session_compact")({ willRetry: false }, missingContext);
		expect(harness.messages.at(-1).options).toEqual({ triggerTurn: false });
		harness.handlers.get("session_compact")({ willRetry: true }, missingContext);
		expect(harness.messages.at(-1).options).toEqual({ deliverAs: "steer" });
	});
});

describe("Reflect extension wiring", () => {
	test("rejects while busy without loading a review turn", async () => {
		const harness = createHarness();
		registerReflect(harness.pi);
		await harness.commands.get("reflect").handler("", harness.context({ idle: false }));
		expect(harness.userMessages).toEqual([]);
		expect(harness.notifications).toEqual([
			{ message: "Wait for Pi to finish, then retry /reflect.", level: "warning" },
		]);
	});

	test("injects private instructions on the one accepted review turn", async () => {
		const harness = createHarness();
		registerReflect(harness.pi);
		const ctx = harness.context();
		await harness.commands.get("reflect").handler("tool choice", ctx);
		expect(harness.userMessages).toEqual([
			{
				content: "Reflect on this session.\n\nFocus from Charlie:\ntool choice",
				options: undefined,
			},
		]);
		const injected = harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
		expect(injected.message.customType).toBe("reflect-instructions");
		expect(injected.message.content).toContain("Wait for his selection");
		expect(harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx)).toBeUndefined();
	});
});
