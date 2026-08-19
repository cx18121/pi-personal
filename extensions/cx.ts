import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	applyCxCommand,
	clearPendingDirective,
	CX_ACTIVE_MESSAGE,
	cxDirectiveContent,
	CX_INACTIVE_MESSAGE,
	CX_MARKER,
	CX_STATE_ENTRY,
	decideCxCommand,
	emptyCxState,
	refreshPendingDirective,
	renderCxKernel,
	restoreCxState,
	restoreCxStateFile,
	takeBeforeAgentDirective,
	type CxDirective,
} from "../lib/cx.js";

const resourceRoot = fileURLToPath(new URL("../resources/cx", import.meta.url));
const kernel = renderCxKernel(readFileSync(join(resourceRoot, "kernel.md"), "utf8"), resourceRoot);

const directiveMessage = (directive: CxDirective) => ({
	customType: directive === "active" ? CX_ACTIVE_MESSAGE : CX_INACTIVE_MESSAGE,
	content: cxDirectiveContent(directive, kernel),
	display: false,
	details: { directive },
});

export default function registerCx(pi: ExtensionAPI) {
	let state = emptyCxState();

	const restoreCurrentSession = (ctx: ExtensionContext) => {
		state = refreshPendingDirective(
			restoreCxState(ctx.sessionManager.getEntries()),
			ctx.sessionManager.buildContextEntries(),
		);
	};

	pi.on("session_start", (event, ctx) => {
		if (event.reason === "new") {
			state = emptyCxState();
			return;
		}

		if (event.reason === "fork" && event.previousSessionFile) {
			try {
				state = restoreCxStateFile(readFileSync(event.previousSessionFile, "utf8"));
			} catch (error) {
				ctx.ui.notify(
					`CX could not read the source session state: ${error instanceof Error ? error.message : String(error)}`,
					"warning",
				);
				state = restoreCxState(ctx.sessionManager.getEntries());
			}
			if (state.hasState) pi.appendEntry(CX_STATE_ENTRY, { active: state.active });
			state = refreshPendingDirective(state, ctx.sessionManager.buildContextEntries());
			return;
		}

		restoreCurrentSession(ctx);
	});

	pi.on("session_tree", (_event, ctx) => restoreCurrentSession(ctx));

	pi.on("before_agent_start", (event) => {
		const next = takeBeforeAgentDirective(state);
		state = next.state;
		if (next.directive) return { message: directiveMessage(next.directive) };
		if (next.marker) return { systemPrompt: `${event.systemPrompt}\n\n${CX_MARKER}` };
		return undefined;
	});

	pi.on("session_compact", (event, ctx) => {
		state = refreshPendingDirective(state, ctx.sessionManager.buildContextEntries());
		const directive = state.pending;
		if (!directive) return;

		state = clearPendingDirective(state);
		if (event.willRetry) {
			pi.sendMessage(directiveMessage(directive), { deliverAs: "steer" });
			return;
		}
		pi.sendMessage(directiveMessage(directive), { triggerTurn: false });
	});

	pi.on("session_shutdown", () => {
		state = emptyCxState();
	});

	pi.registerCommand("cx", {
		description: "Activate or deactivate CXStack",
		handler: async (args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for Pi to finish, then retry /cx.", "warning");
				return;
			}

			const decision = decideCxCommand(state, args, true);
			state = applyCxCommand(state, decision);

			if (decision.kind === "noop-active") {
				ctx.ui.notify("CX is already active.", "info");
				return;
			}
			if (decision.kind === "noop-inactive") {
				ctx.ui.notify("CX is already inactive.", "info");
				return;
			}
			if (decision.kind === "deactivate") {
				pi.appendEntry(CX_STATE_ENTRY, { active: false });
				pi.sendMessage(directiveMessage("inactive"), { triggerTurn: false });
				ctx.ui.notify("CX off.", "info");
				return;
			}
			if (decision.kind === "activate" || decision.kind === "activate-task") {
				pi.appendEntry(CX_STATE_ENTRY, { active: true });
			}
			if (decision.kind === "activate") {
				ctx.ui.notify("CX active.", "info");
				return;
			}
			if (decision.kind === "activate-task" || decision.kind === "task") {
				ctx.ui.notify("CX active.", "info");
				pi.sendUserMessage(decision.task);
			}
		},
	});
}
