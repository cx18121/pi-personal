import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

// pi-agent-browser-native injects about 37k characters of guidance into every
// prompt. Most sessions never browse. This takes ownership of that guidance
// through the package's instruction-group protocol, keeps a one-line pointer in
// the prompt, and requires one read of the full text before the first browser
// call. The pointer only changes when the guidance changes, so the prompt cache holds.

type Group = { tools: string[]; instructions: (ctx: ExtensionContext) => string };

const READ_ENTRY = "browser-guidance-read";

export default function (pi: ExtensionAPI, cacheDir = join(getAgentDir(), "cache", "agent-browser")) {
	let group: Group | undefined;
	let file: string | undefined;
	let hash: string | undefined;
	let read = false;

	const refresh = (ctx: ExtensionContext) => {
		if (!group) return;
		const text = group.instructions(ctx);
		const next = createHash("sha256").update(text).digest("hex").slice(0, 12);
		if (next === hash && file) return;
		mkdirSync(cacheDir, { recursive: true });
		file = join(cacheDir, `guidance-${next}.md`);
		writeFileSync(file, `${text}\n`, "utf8");
		hash = next;
	};

	const restore = (ctx: ExtensionContext) => {
		refresh(ctx);
		// Only a read after the latest compaction is still in the model's context.
		const branch = ctx.sessionManager.getBranch();
		const compacted = branch.findLastIndex((entry) => entry.type === "compaction");
		read = branch.slice(compacted + 1).some((entry) =>
			entry.type === "custom" && entry.customType === READ_ENTRY && (entry.data as { hash?: string })?.hash === hash);
	};

	pi.on("session_start", (_event, ctx) => {
		group = undefined;
		pi.events.emit("pi:instruction-groups", {
			register: (registered: Group) => { group = registered; },
			isManaged: () => group !== undefined,
		});
		restore(ctx);
	});
	pi.on("session_tree", (_event, ctx) => restore(ctx));
	// The full text leaves the model's context with compaction, so require a fresh read.
	pi.on("session_compact", () => { read = false; });

	pi.on("before_agent_start", (event, ctx) => {
		if (!group) return;
		refresh(ctx);
		event.systemPromptOptions.sections.agent_browser =
			`Browser tools (${group.tools.slice(0, 3).join(", ")}): before your first browser call in this session, read ${file}. It holds the required workflow and safety rules.`;
	});

	pi.on("tool_call", (event) => {
		if (!group || read || !file || !group.tools.includes(event.toolName)) return;
		return { block: true, reason: `Read ${file} first. It holds the browser workflow and safety rules. Then retry this call.` };
	});

	pi.on("tool_result", (event, ctx) => {
		if (read || !file || event.toolName !== "read" || event.isError) return;
		const { path, offset, limit } = event.input as { path?: unknown; offset?: unknown; limit?: unknown };
		if (typeof path !== "string" || offset != null || limit != null) return;
		const expanded = path.replace(/^@/, "").replace(/^~(?=\/|$)/, homedir());
		if (resolve(ctx.cwd, expanded) !== file) return;
		read = true;
		pi.appendEntry(READ_ENTRY, { hash });
	});
}
