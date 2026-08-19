import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const instructions = readFileSync(
	fileURLToPath(new URL("../resources/reflect.md", import.meta.url)),
	"utf8",
).trim();

export default function registerReflect(pi: ExtensionAPI) {
	let pending = false;

	pi.on("before_agent_start", () => {
		if (!pending) return undefined;
		pending = false;
		return {
			message: {
				customType: "reflect-instructions",
				content: instructions,
				display: false,
			},
		};
	});

	pi.on("session_shutdown", () => {
		pending = false;
	});

	pi.registerCommand("reflect", {
		description: "Review this session for durable learning",
		handler: async (args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for Pi to finish, then retry /reflect.", "warning");
				return;
			}

			pending = true;
			const focus = args.trim()
				? `Reflect on this session.\n\nFocus:\n${args}`
				: "Reflect on this session.";
			pi.sendUserMessage(focus);
		},
	});
}
