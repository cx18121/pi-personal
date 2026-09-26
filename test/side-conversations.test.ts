import { expect, test } from "bun:test";
import { reuseMainRequest } from "../extensions/side-conversations.ts";

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

  const request = reuseMainRequest(main, fresh, "question");

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

test("appends only the question when the main request is not in the current history", () => {
  const main = { messages: [{ role: "user", content: [{ type: "text", text: "old" }] }] };
  const fresh = { messages: [{ role: "user", content: [{ type: "text", text: "new" }] }] };

  expect(reuseMainRequest(main, fresh, "question").messages).toEqual([
    ...main.messages,
    { role: "user", content: [{ type: "text", text: "question" }] },
  ]);
});
