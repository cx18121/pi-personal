import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { completeHelper } from "../lib/model-policy.js";

// Names an unnamed interactive session after its first run, so /resume lists
// titles instead of raw first messages. Sessions that already have a name,
// including side sessions, keep it.

const SYSTEM_PROMPT = "Name this coding-agent session in 3 to 7 words, in sentence case, describing what the user wants done. Reply with the name only.";

type Entry = { type: string; message?: { role?: string; content?: unknown } };

const text = (content: unknown) => typeof content === "string" ? content
	: Array.isArray(content) ? content.flatMap((part) => part?.type === "text" ? [part.text as string] : []).join("\n") : "";

export const cleanTitle = (raw: string) => raw.split("\n")[0]!
	.replace(/^["'`*#\s]+|["'`*.\s]+$/g, "")
	.replace(/\s+/g, " ")
	.slice(0, 60)
	.trim();

export default function (pi: ExtensionAPI, complete = completeHelper) {
	let attempted = false;

	pi.on("session_start", () => { attempted = false; });

	pi.on("agent_end", (_event, ctx: ExtensionContext) => {
		if (attempted || !ctx.hasUI) return;
		attempted = true;
		if (ctx.sessionManager.getSessionName()) return;
		const messages = (ctx.sessionManager.getBranch() as Entry[]).flatMap((entry) => entry.type === "message" && entry.message ? [entry.message] : []);
		const request = text(messages.find((message) => message.role === "user")?.content).trim();
		if (!request) return;
		const reply = text(messages.findLast((message) => message.role === "assistant")?.content).trim();
		const prompt: UserMessage = {
			role: "user",
			content: [{ type: "text", text: `User request:\n${request.slice(0, 2_000)}\n\nAgent reply:\n${reply.slice(0, 600)}` }],
			timestamp: Date.now(),
		};
		void complete("title", ctx, { systemPrompt: SYSTEM_PROMPT, messages: [prompt] }, AbortSignal.timeout(30_000), {
			request: (model, context, options) => completeSimple(model, context, { ...options, reasoning: "low", maxTokens: 400 }),
		}).then((response) => {
			const title = cleanTitle(text(response.content));
			if (title && !ctx.sessionManager.getSessionName()) pi.setSessionName(title);
		}).catch(() => { /* an unnamed session is the existing behavior */ });
	});
}
