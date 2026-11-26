// Deterministic offline provider for testing session-controls against the real Pi runtime.
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

export default function (pi: any) {
	pi.registerProvider("controls-probe", {
		api: "controls-probe-api",
		baseUrl: "http://offline.invalid",
		apiKey: "offline-fixture",
		models: [
			{
				id: "fixture",
				name: "Offline controls fixture",
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

				if (prompt.startsWith("RENAME:")) {
					const done = sinceLastUser.some((m: any) => m.role === "toolResult" && m.toolName === "rename_session");
					if (!done) {
						call("rename_session", { name: prompt.slice("RENAME:".length).trim() });
					} else {
						const text = "RENAMED_OK";
						message.content.push({ type: "text", text });
						stream.push({ type: "text_start", contentIndex: 0, partial: message });
						stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
						stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
					}
				} else if (prompt === "RELOAD_AND_CONTINUE") {
					const done = sinceLastUser.some((m: any) => m.role === "toolResult" && m.toolName === "reload_runtime");
					if (!done) {
						call("reload_runtime", { continue_message: "AFTER_RELOAD_CHECK" });
					}
				} else if (prompt === "AFTER_RELOAD_CHECK") {
					const text = "POST_RELOAD_CONTINUED";
					message.content.push({ type: "text", text });
					stream.push({ type: "text_start", contentIndex: 0, partial: message });
					stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
					stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
				} else {
					const text = `ECHO:${prompt}`;
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
