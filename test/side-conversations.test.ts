import { expect, test } from "bun:test";
import {
  deriveSideSessionName,
  reuseMainRequest,
  reuseResponsesMainRequest,
} from "../extensions/side-conversations.ts";

const cached = { type: "ephemeral" };
const effort = (level: string) => ({ role: "system", content: [], output_config: { effort: level } });

test("keeps the main request as the cached prefix and appends newer messages", () => {
  const main = {
    model: "claude-opus-5-5",
    system: [{ type: "text", text: "main system", cache_control: cached }],
    tools: [{ name: "bash" }],
    thinking: { type: "adaptive" },
    messages: [
      { role: "user", content: [{ type: "text", text: "task" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "t1" }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", cache_control: cached }] },
      effort("high"),
    ],
  };
  const fresh = {
    model: "claude-opus-5-5",
    system: [{ type: "text", text: "btw system" }],
    messages: [
      { role: "user", content: [{ type: "text", text: "task" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "t1" }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1" }] },
      { role: "assistant", content: [{ type: "text", text: "done" }] },
      { role: "user", content: [{ type: "text", text: "question", cache_control: cached }] },
      effort("low"),
    ],
  };

  const request = reuseMainRequest(main, fresh);

  expect(request.system).toBe(main.system);
  expect(request.tools).toBe(main.tools);
  expect(request.thinking).toBe(main.thinking);
  expect(request.tool_choice).toEqual({ type: "none" });
  expect(request.messages).toEqual([
    ...main.messages.slice(0, 3),
    { role: "assistant", content: [{ type: "text", text: "done" }] },
    { role: "user", content: [{ type: "text", text: "question" }] },
    effort("high"),
  ]);
});

test("does not replay the main request's premium tier for side questions", () => {
  const messages = [{ role: "user", content: "task" }];
  const main = { messages, speed: "fast", service_tier: "priority" };
  const fresh = { messages: [...messages, { role: "user", content: "question" }] };
  expect(reuseMainRequest(main, fresh)).not.toHaveProperty("speed");
  expect(reuseMainRequest(main, fresh)).not.toHaveProperty("service_tier");
  expect(reuseMainRequest(main, { ...fresh, service_tier: "standard_only" }).service_tier).toBe("standard_only");
});

test("uses current branch context when the cached request is not its prefix", () => {
  const main = { system: "old system", messages: [{ role: "user", content: [{ type: "text", text: "old" }] }] };
  const fresh = { system: "current system", messages: [
    { role: "user", content: [{ type: "text", text: "new branch" }] },
    { role: "user", content: [{ type: "text", text: "question" }] },
  ] };
  expect(reuseMainRequest(main, fresh)).toEqual({ ...fresh, tool_choice: { type: "none" } });
});

test("matching only the last message does not establish a shared prefix", () => {
  const sameLast = { role: "user", content: [{ type: "text", text: "continue" }] };
  const main = { messages: [{ role: "user", content: "old branch" }, sameLast] };
  const fresh = { messages: [{ role: "user", content: "new branch" }, sameLast, { role: "user", content: "question" }] };
  expect(reuseMainRequest(main, fresh).messages).toEqual(fresh.messages);
});

test("reuses OpenAI Codex / Responses cached prefix, instructions, tools, and cache key", () => {
  const main = {
    model: "gpt-6.2-sol",
    instructions: "main system prompt",
    tools: [{ type: "function", name: "bash" }],
    reasoning: { effort: "high", summary: "auto" },
    prompt_cache_key: "sess-123",
    service_tier: "priority",
    input: [
      { role: "user", content: [{ type: "input_text", text: "task" }] },
      { type: "function_call", call_id: "c1", name: "bash", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "ok" },
    ],
  };
  const fresh = {
    model: "gpt-6.2-sol",
    instructions: "btw system prompt",
    prompt_cache_key: "sess-123",
    input: [
      { role: "user", content: [{ type: "input_text", text: "task" }] },
      { type: "function_call", call_id: "c1", name: "bash", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "ok" },
      { role: "user", content: [{ type: "input_text", text: "side question" }] },
    ],
  };

  const request = reuseResponsesMainRequest(main, fresh);

  expect(request.instructions).toBe("main system prompt");
  expect(request.tools).toBe(main.tools);
  expect(request.reasoning).toEqual(main.reasoning);
  expect(request.prompt_cache_key).toBe("sess-123");
  expect(request).not.toHaveProperty("service_tier");
  expect(request.tool_choice).toBe("none");
  expect(request.input).toEqual(fresh.input);
});

test("reuses OpenAI Responses leading developer message and falls back on branch divergence", () => {
  const main = {
    model: "gpt-5",
    input: [
      { role: "developer", content: "main system" },
      { role: "user", content: "task" },
    ],
  };
  const matchingFresh = {
    model: "gpt-5",
    input: [
      { role: "developer", content: "btw system" },
      { role: "user", content: "task" },
      { role: "user", content: "question" },
    ],
  };
  const divergedFresh = {
    model: "gpt-5",
    input: [
      { role: "developer", content: "btw system" },
      { role: "user", content: "other branch" },
      { role: "user", content: "question" },
    ],
  };

  expect(reuseResponsesMainRequest(main, matchingFresh)).toEqual({
    model: "gpt-5",
    input: [
      { role: "developer", content: "main system" },
      { role: "user", content: "task" },
      { role: "user", content: "question" },
    ],
    tool_choice: "none",
  });
  expect(reuseResponsesMainRequest(main, divergedFresh)).toEqual({
    ...divergedFresh,
    tool_choice: "none",
  });
});

test("deriveSideSessionName builds readable session names without doubling prefix", () => {
  expect(deriveSideSessionName("Check webhook retries", "Main")).toBe("Side: Check webhook retries");
  expect(deriveSideSessionName("", "Main", ["Why did cache miss?"])).toBe("Side: Why did cache miss?");
  expect(deriveSideSessionName("", "Billing Refactor")).toBe("Side: Billing Refactor");
  expect(deriveSideSessionName("", "Side: Already Prefixed")).toBe("Side: Already Prefixed");
  expect(deriveSideSessionName("", undefined)).toBe("Side conversation");
});
