import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { SessionManager } from "@earendil-works/pi-coding-agent";
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

const createHarness = (sessionManager) => {
	const handlers = new Map();
	const commands = new Map();
	const entries = [];
	const messages = [];
	const userMessages = [];
	const notifications = [];
	const statuses = [];
	const pi = {
		on(event, handler) {
			handlers.set(event, handler);
		},
		registerCommand(name, command) {
			commands.set(name, command);
		},
		appendEntry(customType, data) {
			entries.push({ customType, data });
			sessionManager?.appendCustomEntry(customType, data);
		},
		sendMessage(message, options) {
			messages.push({ message, options });
			sessionManager?.appendCustomMessageEntry(
				message.customType, message.content, message.display, message.details,
			);
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
		sessionManager: sessionManager ?? {
			getEntries: () => sessionEntries,
			buildContextEntries: () => contextEntries,
			getSessionFile: () => sessionFile,
		},
		ui: {
			theme: {
				fg(_color, text) {
					return text;
				},
			},
			notify(message, level) {
				notifications.push({ message, level });
			},
			setStatus(key, value) {
				statuses.push({ key, value });
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
		statuses,
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
	test("delivers an updated kernel after two reloads before the next turn", () => {
		const session = SessionManager.inMemory("/workspace");
		session.appendCustomEntry(CX_STATE_ENTRY, { active: true, version: "old" });
		session.appendCustomMessageEntry(CX_ACTIVE_MESSAGE, "Old kernel", false, {
			directive: "active", version: "old",
		});
		for (let reload = 0; reload < 2; reload += 1) {
			const harness = createHarness(session);
			registerCx(harness.pi);
			const ctx = harness.context();
			harness.handlers.get("session_start")({ reason: "reload" }, ctx);
			if (reload === 0) continue;
			const result = harness.handlers.get("before_agent_start")(
				{ systemPromptOptions: { sections: {} } }, ctx,
			);
			expect(result?.message.customType).toBe(CX_ACTIVE_MESSAGE);
			expect(result?.message.details.version).toBe(
				createHash("sha256").update(result.message.content).digest("hex").slice(0, 12),
			);
		}
	});

	test("updates an older selected branch even after delivering the new kernel elsewhere", () => {
		const session = SessionManager.inMemory("/workspace");
		session.appendCustomEntry(CX_STATE_ENTRY, { active: true, version: "old" });
		const oldBranch = session.appendCustomMessageEntry(CX_ACTIVE_MESSAGE, "Old kernel", false, {
			directive: "active", version: "old",
		});
		const harness = createHarness(session);
		registerCx(harness.pi);
		const ctx = harness.context();
		harness.handlers.get("session_start")({ reason: "reload" }, ctx);
		const current = harness.handlers.get("before_agent_start")(
			{ systemPromptOptions: { sections: {} } }, ctx,
		).message;
		session.appendCustomMessageEntry(current.customType, current.content, false, current.details);
		session.branch(oldBranch);
		harness.handlers.get("session_tree")({}, ctx);
		const result = harness.handlers.get("before_agent_start")(
			{ systemPromptOptions: { sections: {} } }, ctx,
		);
		expect(result?.message.content).toBe(current.content);
		expect(result?.message.details.version).toBe(current.details.version);
	});

	test("reuses an already delivered current kernel after reload", () => {
		const session = SessionManager.inMemory("/workspace");
		const first = createHarness(session);
		registerCx(first.pi);
		first.handlers.get("session_start")({ reason: "startup" }, first.context());
		const delivered = first.handlers.get("before_agent_start")(
			{ systemPromptOptions: { sections: {} } }, first.context(),
		).message;
		session.appendCustomMessageEntry(delivered.customType, delivered.content, false, delivered.details);
		const restored = createHarness(session);
		registerCx(restored.pi);
		restored.handlers.get("session_start")({ reason: "reload" }, restored.context());
		const event = { systemPromptOptions: { sections: {} } };
		expect(restored.handlers.get("before_agent_start")(event, restored.context())).toBeUndefined();
		expect(event.systemPromptOptions.sections.cx_marker).toBe(CX_MARKER);
		expect(restored.entries).toEqual([]);
	});

	test("fingerprints the observed read result rather than startup file contents", () => {
		const harness = createHarness();
		registerCx(harness.pi);
		const ctx = harness.context();
		harness.handlers.get("session_start")({ reason: "startup" }, ctx);
		const text = "Reference content changed after the extension loaded.";
		harness.handlers.get("tool_result")({
			toolName: "read", input: { path: join(moduleRoot, "resources/references/playbooks/prototype.md") },
			content: [{ type: "text", text }], isError: false,
		}, ctx);
		expect(harness.entries.at(-1)).toEqual({
			customType: CX_REFERENCE_ENTRY,
			data: {
				reference: "playbooks/prototype", kind: "read-result",
				version: createHash("sha256").update(text).digest("hex").slice(0, 12),
			},
		});
	});

	test("does not count a nested read as a model-facing reference observation", () => {
		const harness = createHarness();
		registerCx(harness.pi);
		const ctx = harness.context();
		harness.handlers.get("session_start")({ reason: "startup" }, ctx);
		const count = harness.entries.length;
		harness.handlers.get("tool_result")({
			toolName: "read", parentToolCallId: "codemode-call",
			input: { path: join(moduleRoot, "resources/references/playbooks/prototype.md") },
			content: [{ type: "text", text: "Discarded inside a script" }], isError: false,
		}, ctx);
		expect(harness.entries).toHaveLength(count);
	});

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

	test("activates blank sessions before their first turn", () => {
		for (const reason of ["startup", "reload", "resume", "new"]) {
			const harness = createHarness();
			registerCx(harness.pi);
			const ctx = harness.context();
			harness.handlers.get("session_start")({ reason }, ctx);

			expect(harness.entries).toEqual([
				{
					customType: CX_STATE_ENTRY,
					data: { active: true },
				},
			]);
			expect(harness.statuses.at(-1)).toEqual({ key: "cx-mode", value: "CX" });
			expect(
				harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx).message
					.customType,
			).toBe(CX_ACTIVE_MESSAGE);
		}
	});

	test("preserves historical sessions without CX state", () => {
		for (const reason of ["startup", "reload", "resume"]) {
			const harness = createHarness();
			registerCx(harness.pi);
			const history = [{ type: "message" }];
			const ctx = harness.context({ sessionEntries: history, contextEntries: history });
			harness.handlers.get("session_start")({ reason }, ctx);

			expect(harness.entries).toEqual([]);
			expect(harness.statuses.at(-1)).toEqual({ key: "cx-mode", value: undefined });
			expect(
				harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx),
			).toBeUndefined();
		}
	});

	test("preserves explicit off state on reload", () => {
		const harness = createHarness();
		registerCx(harness.pi);
		const inactive = stateEntry(false);
		const inactiveContext = directiveEntry(CX_INACTIVE_MESSAGE);
		const ctx = harness.context({
			sessionEntries: [inactive],
			contextEntries: [inactiveContext],
		});
		harness.handlers.get("session_start")({ reason: "reload" }, ctx);

		expect(harness.entries).toEqual([]);
		expect(harness.statuses.at(-1)).toEqual({ key: "cx-mode", value: undefined });
		expect(
			harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx),
		).toBeUndefined();
	});

	test("forwards tasks in a default-active session, then uses only the marker", async () => {
		const harness = createHarness();
		registerCx(harness.pi);
		const ctx = harness.context();
		harness.handlers.get("session_start")({ reason: "startup" }, ctx);

		const task = "  fix the promised surface  ";
		await harness.commands.get("cx").handler(task, ctx);
		expect(harness.entries).toEqual([
			{
				customType: CX_STATE_ENTRY,
				data: { active: true },
			},
		]);
		expect(harness.userMessages).toEqual([{ content: task, options: undefined }]);
		expect(harness.statuses.at(-1)).toEqual({ key: "cx-mode", value: "CX" });

		const activation = harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx);
		expect(activation.message.customType).toBe(CX_ACTIVE_MESSAGE);
		expect(activation.message.details.version).toBe(
			createHash("sha256").update(activation.message.content).digest("hex").slice(0, 12),
		);
		expect(activation.systemPrompt).toBeUndefined();

		await harness.commands.get("cx").handler("next task", ctx);
		expect(harness.entries).toHaveLength(1);
		expect(harness.userMessages).toHaveLength(2);
		const options = { sections: { neighboring: "preserve this section" } };
		const event = { systemPrompt: "base", systemPromptOptions: options };
		expect(harness.handlers.get("before_agent_start")(event, ctx)).toBeUndefined();
		expect(options.sections.cx_marker).toBe(CX_MARKER);
		expect(options.sections.neighboring).toBe("preserve this section");
		expect(options).not.toHaveProperty("forceSystemPrompt");
		harness.handlers.get("before_agent_start")(event, ctx);
		expect(options.sections.cx_marker).toBe(CX_MARKER);
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
				data: { active: true },
			},
			{ customType: CX_STATE_ENTRY, data: { active: false } },
		]);
		expect(harness.messages.at(-1)).toEqual({
			message: expect.objectContaining({ customType: CX_INACTIVE_MESSAGE }),
			options: { triggerTurn: false },
		});
		expect(harness.userMessages).toEqual([]);
		expect(harness.statuses.at(-1)).toEqual({ key: "cx-mode", value: undefined });
	});

	test("records successful reference reads without transcript content", async () => {
		const harness = createHarness();
		registerCx(harness.pi);
		const ctx = harness.context();
		harness.handlers.get("session_start")({ reason: "startup" }, ctx);
		await harness.commands.get("cx").handler("", ctx);

		const referencePath = join(
			moduleRoot,
			"resources/references/playbooks/prototype.md",
		);
		harness.handlers.get("tool_result")(
			{ toolName: "read", input: { path: referencePath }, content: [{ type: "text", text: "Reference text" }], isError: false },
			ctx,
		);
		expect(harness.entries.at(-1)).toEqual({
			customType: CX_REFERENCE_ENTRY,
			data: {
				reference: "playbooks/prototype",
				kind: "read-result",
				version: expect.any(String),
			},
		});
		expect(JSON.stringify(harness.entries.at(-1))).not.toContain(referencePath);

		const count = harness.entries.length;
		harness.handlers.get("tool_result")(
			{ toolName: "read", input: { path: referencePath }, content: [], isError: false },
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
		harness.handlers.get("session_compact")({ reason: "overflow", willRetry: true }, missingContext);
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
				data: { active: true },
			}),
			JSON.stringify({
				type: "custom_message", customType: CX_ACTIVE_MESSAGE,
				details: { directive: "active", version: "kernel-v1" },
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
				content: "Audit the selected CXStack sessions in the supplied manifest.",
				options: undefined,
			},
		]);

		const injected = harness.handlers.get("before_agent_start")({}, ctx);
		expect(injected.message.customType).toBe("cx-audit-instructions");
		expect(injected.message.content).toContain("source-session");
		expect(injected.message.content).toContain("kernel-v1");
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
		expect(injected.message.content).toContain("`/sessions/current.jsonl`");
		expect(injected.message.content).not.toContain("{{CXSTACK_ROOT}}");
		expect(injected.message.content).not.toContain("{{SESSION_PATH}}");
		expect(harness.handlers.get("before_agent_start")({ systemPrompt: "base" }, ctx)).toBeUndefined();
	});
});
