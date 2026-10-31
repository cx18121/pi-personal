import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	autonomyLine,
	findRepository,
	LEVEL_SUMMARY,
	LEVELS,
	readLevel,
	writeLevel,
	type Level,
	type Repository,
} from "../lib/autonomy.js";

// /autonomy is Charlie's standing permission to commit or push in one repository.
// The contract in AGENTS.md tells the agent to follow the line this adds.

export default function (pi: ExtensionAPI, file = join(getAgentDir(), "cxstack", "autonomy.json"), find = findRepository) {
	let repository: Repository | undefined;
	let level: Level = "ask";

	const show = (ctx: ExtensionContext) => ctx.ui.setStatus("autonomy", repository && level !== "ask" ? level : undefined);
	const load = (ctx: ExtensionContext) => {
		repository = find(ctx.cwd);
		level = repository ? readLevel(file, repository.key) : "ask";
		show(ctx);
	};

	pi.on("session_start", (_event, ctx) => load(ctx));

	// Another session may have changed the setting. The line only changes when the setting does.
	pi.on("before_agent_start", (event, ctx) => {
		if (!repository) return;
		level = readLevel(file, repository.key);
		show(ctx);
		event.systemPromptOptions.sections.autonomy = autonomyLine(repository, level);
	});

	pi.registerCommand("autonomy", {
		description: "Set whether the agent may commit or push in this repository",
		getArgumentCompletions: (prefix) => LEVELS.filter((value) => value.startsWith(prefix.trim()))
			.map((value) => ({ value, label: value, description: LEVEL_SUMMARY[value] })),
		handler: async (args, ctx) => {
			load(ctx);
			if (!repository) {
				ctx.ui.notify("Not in a Git repository.", "warning");
				return;
			}
			let next = args.trim() as Level | "";
			if (!next) {
				const choice = await ctx.ui.select(
					`Autonomy for ${repository.label} (now ${level})`,
					LEVELS.map((value) => `${value}: ${LEVEL_SUMMARY[value]}`),
				);
				if (!choice) return;
				next = choice.split(":")[0] as Level;
			}
			if (!LEVELS.includes(next)) {
				ctx.ui.notify(`Use one of: ${LEVELS.join(", ")}.`, "warning");
				return;
			}
			writeLevel(file, repository.key, next);
			level = next;
			show(ctx);
			ctx.ui.notify(`Autonomy for ${repository.label}: ${next}. Applies from your next message.`, "info");
		},
	});
}
