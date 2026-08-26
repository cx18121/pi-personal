import { describe, expect, test } from "bun:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { registerChildAgent } from "../extensions/child-agent.js";
import type { ChildInput, ChildResult } from "../lib/session.js";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function settle(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function harness(idle = true) {
	const handlers = new Map<string, (...args: any[]) => any>();
	const tools = new Map<string, ToolDefinition>();
	const messages: Array<{ message: any; options: any }> = [];
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	const pi = {
		on(event: string, handler: (...args: any[]) => any) {
			handlers.set(event, handler);
		},
		registerTool(tool: ToolDefinition) {
			tools.set(tool.name, tool);
		},
		sendMessage(message: any, options: any) {
			messages.push({ message, options });
		},
	} as unknown as ExtensionAPI;
	const context = {
		cwd: "/workspace",
		hasUI: true,
		isIdle: () => idle,
		modelRegistry: {} as never,
		sessionManager: {
			getSessionId: () => "owner-session",
		},
		ui: {
			setStatus(key: string, value: string | undefined) {
				statuses.push({ key, value });
			},
		},
	} as unknown as ExtensionContext;
	return { pi, handlers, tools, messages, statuses, context };
}

async function execute(
	tool: ToolDefinition,
	params: Record<string, unknown>,
	context: ExtensionContext,
) {
	return tool.execute("tool-call", params as never, new AbortController().signal, undefined, context);
}

describe("child agent extension", () => {
	test("starts a background child and wakes an idle owner with one result", async () => {
		const run = deferred<ChildResult>();
		let input: ChildInput | undefined;
		const h = harness(true);
		registerChildAgent(h.pi, {
			runChild: (value) => {
				input = value;
				return run.promise;
			},
		});
		h.handlers.get("session_start")?.({}, h.context);

		const started = await execute(
			h.tools.get("child_run")!,
			{ task: "Review the diff", model: "anthropic/test-model" },
			h.context,
		);
		const id = (started.details as { id: string }).id;
		expect(started.content[0]).toMatchObject({ type: "text", text: expect.stringContaining(id) });
		expect(input).toMatchObject({
			task: "Review the diff",
			model: "anthropic/test-model",
			cwd: "/workspace",
		});
		expect(h.statuses.at(-1)).toEqual({ key: "child-agent", value: "child 1" });

		run.resolve({ output: "No issues found.", model: "anthropic/reported" });
		await settle();

		expect(h.messages).toHaveLength(1);
		expect(h.messages[0]?.message.content).toContain("No issues found.");
		expect(h.messages[0]?.options).toEqual({ deliverAs: "followUp", triggerTurn: true });
		expect(h.statuses.at(-1)).toEqual({ key: "child-agent", value: undefined });
	});

	test("queues a busy owner failure and exposes its reason in status", async () => {
		const h = harness(false);
		registerChildAgent(h.pi, {
			runChild: async () => {
				throw new Error("provider unavailable");
			},
		});
		h.handlers.get("session_start")?.({}, h.context);

		const started = await execute(
			h.tools.get("child_run")!,
			{ task: "Check readiness", model: "anthropic/test-model" },
			h.context,
		);
		await settle();
		const status = await execute(
			h.tools.get("child_status")!,
			{ id: (started.details as { id: string }).id },
			h.context,
		);

		expect(h.messages[0]?.options).toEqual({ deliverAs: "nextTurn" });
		expect(status.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("provider unavailable") });
	});

	test("reports status and stops a child", async () => {
		const run = deferred<ChildResult>();
		let childSignal: AbortSignal | undefined;
		const h = harness();
		registerChildAgent(h.pi, {
			runChild: (input) => {
				childSignal = input.signal;
				return run.promise;
			},
		});
		h.handlers.get("session_start")?.({}, h.context);
		const started = await execute(
			h.tools.get("child_run")!,
			{ task: "Long review", model: "anthropic/test-model" },
			h.context,
		);
		const id = (started.details as { id: string }).id;

		const status = await execute(h.tools.get("child_status")!, { id }, h.context);
		expect(status.content[0]).toMatchObject({ type: "text", text: expect.stringContaining(`${id} · running`) });
		const stopped = await execute(h.tools.get("child_stop")!, { id }, h.context);
		expect(stopped.content[0]).toMatchObject({ type: "text", text: `Stopped ${id}.` });
		expect(childSignal?.aborted).toBeTrue();
	});

	test("shutdown aborts children and blocks late delivery", async () => {
		const run = deferred<ChildResult>();
		let childSignal: AbortSignal | undefined;
		const h = harness();
		registerChildAgent(h.pi, {
			runChild: (input) => {
				childSignal = input.signal;
				return run.promise;
			},
		});
		h.handlers.get("session_start")?.({}, h.context);
		await execute(
			h.tools.get("child_run")!,
			{ task: "Review", model: "anthropic/test-model" },
			h.context,
		);

		h.handlers.get("session_shutdown")?.();
		expect(childSignal?.aborted).toBeTrue();
		run.resolve({ output: "late" });
		await settle();
		expect(h.messages).toEqual([]);
	});
});
