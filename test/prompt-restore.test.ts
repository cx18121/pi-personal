import { describe, expect, test } from "bun:test";
import {
	armPromptRestore,
	assistantHasOutput,
	beginPromptRestore,
	canRestorePrompt,
	recordAssistantOutput,
} from "../lib/prompt-restore.ts";

describe("prompt restore", () => {
	test("arms a captured prompt and restores it before output", () => {
		const waiting = armPromptRestore({
			status: "candidate",
			text: "edit me",
			parentId: "parent",
		});
		expect(canRestorePrompt(waiting)).toBe(true);
		expect(beginPromptRestore(waiting)).toEqual({
			status: "restoring",
			text: "edit me",
			parentId: "parent",
		});
	});

	test("keeps normal interrupt behavior after output", () => {
		const waiting = armPromptRestore({
			status: "candidate",
			text: "edit me",
			parentId: "parent",
		});
		const responding = recordAssistantOutput(waiting);
		expect(canRestorePrompt(responding)).toBe(false);
		expect(beginPromptRestore(responding)).toEqual(responding);
	});

	test("detects text, thinking, and tool output", () => {
		expect(assistantHasOutput([])).toBe(false);
		expect(assistantHasOutput([{ type: "text", text: "" }])).toBe(false);
		expect(assistantHasOutput([{ type: "thinking", thinking: "" }])).toBe(false);
		expect(assistantHasOutput([{ type: "text", text: "answer" }])).toBe(true);
		expect(assistantHasOutput([{ type: "thinking", thinking: "reasoning" }])).toBe(true);
		expect(
			assistantHasOutput([{ type: "toolCall", id: "call", name: "read", arguments: {} }]),
		).toBe(true);
	});

	test("does not restore unarmed, idle, or already restoring prompts", () => {
		expect(canRestorePrompt({ status: "idle" })).toBe(false);
		expect(canRestorePrompt({ status: "candidate", text: "edit me", parentId: "parent" })).toBe(false);
		expect(
			canRestorePrompt({
				status: "restoring",
				text: "edit me",
				parentId: "parent",
			}),
		).toBe(false);
	});
});
