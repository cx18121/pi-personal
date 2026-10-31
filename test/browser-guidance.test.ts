import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import browserGuidance from "../extensions/browser-guidance.ts";

function harness() {
	const handlers = new Map<string, (...args: any[]) => any>();
	const listeners = new Map<string, (data: any) => void>();
	const entries: any[] = [];
	const pi = {
		on: (event: string, handler: (...args: any[]) => any) => handlers.set(event, handler),
		events: {
			on: (channel: string, listener: (data: any) => void) => listeners.set(channel, listener),
			emit: (channel: string, data: any) => listeners.get(channel)?.(data),
		},
		appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }),
	};
	// Stand-in for pi-agent-browser-native's side of the instruction-group protocol.
	let managed = () => false;
	pi.events.on("pi:instruction-groups", (data) => {
		data.register({ tools: ["agent_browser", "agent_browser_code", "agent_browser_tools"], instructions: () => "FULL BROWSER GUIDANCE" });
		managed = data.isManaged;
	});
	const dir = mkdtempSync(join(tmpdir(), "browser-guidance-"));
	browserGuidance(pi as never, dir);
	const ctx = { cwd: dir, sessionManager: { getBranch: () => entries } };
	return { handlers, ctx, managed: () => managed(), entries };
}

test("replaces the eager guidance with a stable pointer and requires one read before browsing", async () => {
	const h = harness();
	h.handlers.get("session_start")!({}, h.ctx);
	expect(h.managed()).toBe(true);

	const sections = (): Record<string, string> => {
		const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
		h.handlers.get("before_agent_start")!(event, h.ctx);
		return event.systemPromptOptions.sections;
	};
	const first = sections().agent_browser!;
	expect(first).not.toContain("FULL BROWSER GUIDANCE");
	expect(sections().agent_browser).toBe(first);
	const file = first.match(/read (\S+\.md)\./)![1]!;
	expect(readFileSync(file, "utf8")).toContain("FULL BROWSER GUIDANCE");

	expect(h.handlers.get("tool_call")!({ toolName: "agent_browser" })).toMatchObject({ block: true });
	expect(h.handlers.get("tool_call")!({ toolName: "bash" })).toBeUndefined();
	h.handlers.get("tool_result")!({ toolName: "read", isError: false, input: { path: file, offset: 1, limit: 20 } }, h.ctx);
	expect(h.handlers.get("tool_call")!({ toolName: "agent_browser" })).toMatchObject({ block: true });
	h.handlers.get("tool_result")!({ toolName: "read", isError: false, input: { path: file } }, h.ctx);
	expect(h.handlers.get("tool_call")!({ toolName: "agent_browser" })).toBeUndefined();

	h.handlers.get("session_tree")!({}, h.ctx);
	expect(h.handlers.get("tool_call")!({ toolName: "agent_browser" })).toBeUndefined();
	h.handlers.get("session_compact")!({}, h.ctx);
	expect(h.handlers.get("tool_call")!({ toolName: "agent_browser" })).toMatchObject({ block: true });
	h.entries.push({ type: "compaction" });
	h.handlers.get("session_tree")!({}, h.ctx);
	expect(h.handlers.get("tool_call")!({ toolName: "agent_browser" })).toMatchObject({ block: true });
});
