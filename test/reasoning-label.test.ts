import { expect, test } from "bun:test";
import registerReasoningLabel from "../extensions/reasoning-label.ts";

test("labels hidden reasoning as completed state", () => {
	const handlers = new Map<string, (...args: any[]) => unknown>();
	registerReasoningLabel({
		on(event: string, handler: (...args: any[]) => unknown) {
			handlers.set(event, handler);
		},
	} as never);
	const labels: string[] = [];

	handlers.get("session_start")?.({}, {
		ui: {
			setHiddenThinkingLabel(label: string) {
				labels.push(label);
			},
		},
	});

	expect(labels).toEqual(["Reasoning hidden"]);
});
