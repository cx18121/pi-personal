import { writeFileSync } from "node:fs";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

const countPath = process.env.CXSTACK_OVERFLOW_COUNT_PATH;
let calls = 0;

const streamSimple = (model) => {
	calls += 1;
	if (countPath) writeFileSync(countPath, String(calls));
	const stream = createAssistantMessageEventStream();
	queueMicrotask(() => {
		const output = {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 100,
				output: 10,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 110,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "pending",
			timestamp: Date.now(),
		};
		stream.push({ type: "start", partial: output });
		if (calls === 16) {
			output.stopReason = "error";
			output.errorMessage = "context_length_exceeded: synthetic CXStack overflow";
			stream.push({ type: "error", reason: "error", error: output });
			stream.end();
			return;
		}
		const text = calls === 17
			? "Synthetic compacted summary."
			: calls === 18
				? "RECOVERED_AFTER_CXSTACK_OVERFLOW"
				: `seed-${calls}`;
		output.content.push({ type: "text", text });
		stream.push({ type: "text_start", contentIndex: 0, partial: output });
		stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
		stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
		output.stopReason = "stop";
		stream.push({ type: "done", reason: "stop", message: output });
		stream.end();
	});
	return stream;
};

export default function registerOverflowProvider(pi) {
	pi.registerProvider("cxstack-overflow", {
		name: "CXStack overflow test",
		baseUrl: "http://127.0.0.1",
		apiKey: "synthetic-key",
		api: "cxstack-overflow-api",
		models: [
			{
				id: "cxstack-overflow-model",
				name: "CXStack overflow model",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 100000,
				maxTokens: 1000,
			},
		],
		streamSimple,
	});
}
