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
