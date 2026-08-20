import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import registerCxAudit from "../extensions/audit.ts";
import registerCx from "../extensions/cx.ts";
import registerReflect from "../extensions/reflect.ts";
import {
	CX_ACTIVE_MESSAGE,
	CX_INACTIVE_MESSAGE,
	CX_MARKER,
	CX_REFERENCE_ENTRY,
	CX_STATE_ENTRY,
} from "../lib/cx.ts";

const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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
	const context = ({
		idle = true,
		sessionEntries = [],
		contextEntries = [],
		sessionFile = "/sessions/current.jsonl",
	} = {}) => ({
		cwd: "/workspace",
		isIdle: () => idle,
		sessionManager: {
			getEntries: () => sessionEntries,
			buildContextEntries: () => contextEntries,
			getSessionFile: () => sessionFile,
		},
		ui: {
			notify(message, level) {
				notifications.push({ message, level });
			},
		},
	});
	return {
		pi,
		handlers,
		commands,
		entries,
		messages,
		userMessages,
		notifications,
		context,
	};
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
		expect(harness.entries).toEqual([
			{
				customType: CX_STATE_ENTRY,
				data: { active: true, version: expect.any(String) },
			},
		]);
		expect(harness.userMessages).toEqual([{ content: task, options: undefined }]);

		const activation = harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
		expect(activation.message.customType).toBe(CX_ACTIVE_MESSAGE);
		expect(harness.entries[0].data.version).toBe(
			createHash("sha256").update(activation.message.content).digest("hex").slice(0, 12),
		);
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
			{
				customType: CX_STATE_ENTRY,
				data: { active: true, version: expect.any(String) },
			},
			{ customType: CX_STATE_ENTRY, data: { active: false } },
		]);
		expect(harness.messages.at(-1)).toEqual({
			message: expect.objectContaining({ customType: CX_INACTIVE_MESSAGE }),
			options: { triggerTurn: false },
		});
		expect(harness.userMessages).toEqual([]);
	});

	test("records successful reference reads without transcript content", async () => {
		const harness = createHarness();
		registerCx(harness.pi);
		const ctx = harness.context();
		harness.handlers.get("session_start")({ reason: "startup" }, ctx);
		await harness.commands.get("cx").handler("", ctx);

		const referencePath = join(
			moduleRoot,
			"resources/references/playbooks/build-and-change.md",
		);
		harness.handlers.get("tool_result")(
			{ toolName: "read", input: { path: referencePath }, isError: false },
			ctx,
		);
		expect(harness.entries.at(-1)).toEqual({
			customType: CX_REFERENCE_ENTRY,
			data: {
				reference: "playbooks/build-and-change",
				version: expect.any(String),
			},
		});
		expect(JSON.stringify(harness.entries.at(-1))).not.toContain(referencePath);

		const count = harness.entries.length;
		harness.handlers.get("tool_result")(
			{ toolName: "read", input: { path: referencePath, offset: 2 }, isError: false },
			ctx,
		);
		harness.handlers.get("tool_result")(
			{ toolName: "read", input: { path: referencePath, limit: 1 }, isError: false },
			ctx,
		);
		harness.handlers.get("tool_result")(
			{ toolName: "read", input: { path: referencePath }, isError: true },
			ctx,
		);
		harness.handlers.get("tool_result")(
			{ toolName: "read", input: { path: "/workspace/README.md" }, isError: false },
			ctx,
		);
		expect(harness.entries).toHaveLength(count);
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

describe("CX audit extension wiring", () => {
	test("selects earlier CX sessions and injects one private audit turn", async () => {
		const harness = createHarness();
		const cxSession = [
			JSON.stringify({ type: "session", id: "source" }),
			JSON.stringify({
				type: "custom",
				customType: CX_STATE_ENTRY,
				data: { active: true, version: "kernel-v1" },
			}),
		].join("\n");
		registerCxAudit(harness.pi, {
			listSessions: async () => [
				{
					path: "/sessions/source.jsonl",
					id: "source-session",
					modified: new Date("2026-08-20T10:00:00Z"),
				},
			],
			readSession: () => cxSession,
		});
		const ctx = harness.context();
		await harness.commands.get("cx-audit").handler("", ctx);
		expect(harness.userMessages).toEqual([
			{
				content: "Audit the recent CXStack sessions in the supplied manifest.",
				options: undefined,
			},
		]);

		const injected = harness.handlers.get("before_agent_start")({}, ctx);
		expect(injected.message.customType).toBe("cx-audit-instructions");
		expect(injected.message.content).toContain("source-session");
		expect(injected.message.content).toContain("kernel-v1");
		expect(injected.message.content).toContain("Do not produce scores");
		expect(injected.message.content).toContain("complete approved cohort");
		expect(injected.message.content).toContain("no more than six sessions at a time");
		expect(injected.message.content).not.toContain('"cwd"');
		expect(injected.message.content).not.toContain("{{SESSION_MANIFEST}}");
		expect(harness.handlers.get("before_agent_start")({}, ctx)).toBeUndefined();
	});

	test("does not start an audit without an earlier CX session", async () => {
		const harness = createHarness();
		registerCxAudit(harness.pi, {
			listSessions: async () => [],
			readSession: () => "",
		});
		await harness.commands.get("cx-audit").handler("", harness.context());
		expect(harness.userMessages).toEqual([]);
		expect(harness.notifications).toEqual([
			{ message: "No earlier CX sessions are available to audit.", level: "info" },
		]);
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
				content: "Reflect on this session.\n\nFocus:\ntool choice",
				options: undefined,
			},
		]);
		const injected = harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
		expect(injected.message.customType).toBe("reflect-instructions");
		expect(injected.message.content).toContain("Wait for selection");
		expect(injected.message.content).toContain("CXStack change.");
		expect(injected.message.content).not.toContain("{{CXSTACK_ROOT}}");
		expect(harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx)).toBeUndefined();
	});
});
