import assert from "node:assert/strict";
import test from "node:test";
import { addPriorityTier, restoreFastMode, supportsFastMode } from "../extensions/fast-mode.ts";

const openAiModel = {
	provider: "openai",
	api: "openai-responses",
	id: "gpt-5.6-sol",
};

const chatGptModel = {
	provider: "openai-codex",
	api: "openai-codex-responses",
	id: "gpt-5.6-sol",
};

test("supports OpenAI API and eligible ChatGPT OAuth models", () => {
	assert.equal(supportsFastMode(openAiModel, false), true);
	assert.equal(supportsFastMode(chatGptModel, true), true);
	assert.equal(supportsFastMode(chatGptModel, false), false);
	assert.equal(supportsFastMode({ ...openAiModel, id: "gpt-5.3-codex-spark" }, false), false);
});

test("restores the latest session state", () => {
	assert.equal(restoreFastMode([
		{ type: "custom", customType: "personal-fast-mode", data: { enabled: true } },
		{ type: "custom", customType: "other", data: { enabled: false } },
		{ type: "custom", customType: "personal-fast-mode", data: { enabled: false } },
	]), false);
	assert.equal(restoreFastMode([]), false);
});

test("adds the priority service tier to matching requests", () => {
	assert.deepEqual(addPriorityTier({ model: "gpt-5.6-sol", input: [] }, "gpt-5.6-sol"), {
		model: "gpt-5.6-sol",
		input: [],
		service_tier: "priority",
	});
});

test("preserves mismatched requests and existing service tiers", () => {
	assert.equal(addPriorityTier({ model: "gpt-5.5" }, "gpt-5.6-sol"), undefined);
	assert.equal(addPriorityTier({ model: "gpt-5.6-sol", service_tier: "default" }, "gpt-5.6-sol"), undefined);
});
