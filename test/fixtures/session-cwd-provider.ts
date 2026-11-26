// Deterministic offline provider for testing session-cwd against the real Pi runtime.
import { createAssistantMessageEventStream, getCurrentSystemPrompt } from "@earendil-works/pi-ai";

export default function (pi: any) {
	pi.registerProvider("cwd-probe", {
		api: "cwd-probe-api",
		baseUrl: "http://offline.invalid",
		apiKey: "offline-fixture",
		models: [
			{
				id: "fixture",
				name: "Offline cwd fixture",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 1024,
			},
		],
		streamSimple(model: any, context: any) {
			const stream = createAssistantMessageEventStream();
			const message: any = {
				role: "assistant",
				content: [],
				api: model.api,
				provider: model.provider,
				model: model.id,
				timestamp: Date.now(),
				stopReason: "stop",
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
			};

			const textOf = (m: any) =>
				typeof m?.content === "string"
					? m.content
					: m?.content
							?.filter((c: any) => c.type === "text")
							.map((c: any) => c.text)
							.join("") || "";

			const lastUser = context.messages.findLast((m: any) => m.role === "user");
			const prompt = textOf(lastUser);
			const sinceLastUser = context.messages.slice(context.messages.lastIndexOf(lastUser) + 1);
			const systemPrompt = getCurrentSystemPrompt(context.messages) ?? "";
			const cwdMatch = systemPrompt.match(/<cwd>\s*([^\n<]+)\s*<\/cwd>/);
			const reportedCwd = cwdMatch ? cwdMatch[1].trim() : "unknown";

			const call = (name: string, args: any) => {
				const index = message.content.length;
				const toolCall = {
					type: "toolCall",
					id: `probe-${name}-${index}-${Date.now()}`,
					name,
					arguments: args,
				};
				message.content.push(toolCall);
				stream.push({ type: "toolcall_start", contentIndex: index, partial: message });
				stream.push({ type: "toolcall_end", contentIndex: index, toolCall, partial: message });
			};

			void (async () => {
				stream.push({ type: "start", partial: message });

				if (prompt.startsWith("MOVE_TO:")) {
					const target = prompt.slice("MOVE_TO:".length).trim();
					const alreadyCalled = sinceLastUser.some(
						(m: any) => m.role === "toolResult" && m.toolName === "change_directory",
					);
					if (!alreadyCalled) {
						call("change_directory", { path: target });
					}
				} else if (prompt.startsWith("READ_MARKER")) {
					const toolResult = sinceLastUser.find((m: any) => m.role === "toolResult" && m.toolName === "read");
					if (!toolResult) {
						call("read", { path: "marker.txt" });
					} else {
						const marker = textOf(toolResult).trim();
						const text = `CWD=${reportedCwd} MARKER=${marker}`;
						message.content.push({ type: "text", text });
						stream.push({ type: "text_start", contentIndex: 0, partial: message });
						stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
						stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
					}
				} else if (prompt.startsWith("Working directory changed to ")) {
					const toolResult = sinceLastUser.find((m: any) => m.role === "toolResult" && m.toolName === "read");
					if (!toolResult) {
						call("read", { path: "marker.txt" });
					} else {
						const marker = textOf(toolResult).trim();
						const text = `CONTINUED CWD=${reportedCwd} MARKER=${marker}`;
						message.content.push({ type: "text", text });
						stream.push({ type: "text_start", contentIndex: 0, partial: message });
						stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
						stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
					}
				} else {
					const text = `OK CWD=${reportedCwd}`;
					message.content.push({ type: "text", text });
					stream.push({ type: "text_start", contentIndex: 0, partial: message });
					stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
					stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
				}

				if (message.content.some((c: any) => c.type === "toolCall")) {
					message.stopReason = "toolUse";
					stream.push({ type: "done", reason: "toolUse", message });
				} else {
					message.stopReason = "stop";
					stream.push({ type: "done", reason: "stop", message });
				}
				stream.end();
			})();

			return stream;
		},
	});
}
