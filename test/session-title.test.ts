import { expect, test } from "bun:test";
import sessionTitle, { cleanTitle } from "../extensions/session-title.ts";

test("titles an unnamed interactive session once from its first exchange", async () => {
	const handlers = new Map<string, (...args: any[]) => any>();
	let name: string | undefined;
	const prompts: string[] = [];
	const pi = { on: (event: string, handler: any) => handlers.set(event, handler), setSessionName: (value: string) => { name = value; } };
	const complete = async (_task: string, _ctx: unknown, context: any) => {
		prompts.push(context.messages[0].content[0].text);
		return { content: [{ type: "text", text: "\"Fix checkout totals.\"" }] };
	};
	sessionTitle(pi as never, complete as never);
	const ctx = {
		hasUI: true,
		sessionManager: {
			getSessionName: () => name,
			getBranch: () => [
				{ type: "message", message: { role: "user", content: [{ type: "text", text: "checkout totals are wrong" }] } },
				{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Fixed the rounding." }] } },
			],
		},
	};
	handlers.get("agent_end")!({}, ctx);
	await new Promise((resolve) => setTimeout(resolve, 0));
	handlers.get("agent_end")!({}, ctx);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(name).toBe("Fix checkout totals");
	expect(prompts).toHaveLength(1);
	expect(prompts[0]).toContain("checkout totals are wrong");
});

test("keeps existing names and skips headless children", async () => {
	const handlers = new Map<string, (...args: any[]) => any>();
	let calls = 0;
	sessionTitle({ on: (event: string, handler: any) => handlers.set(event, handler), setSessionName() {} } as never, (async () => { calls++; }) as never);
	handlers.get("agent_end")!({}, { hasUI: false, sessionManager: { getSessionName: () => undefined, getBranch: () => [] } });
	handlers.get("session_start")!({});
	handlers.get("agent_end")!({}, { hasUI: true, sessionManager: { getSessionName: () => "side-abc123", getBranch: () => [] } });
	expect(calls).toBe(0);
	expect(cleanTitle("## Rework the memory cache\nextra")).toBe("Rework the memory cache");
});
