// Deterministic offline provider for the manual runtime probe. Never loaded by
// the personal package. Real child Pi processes pause at explicit release files.
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createAssistantMessageEventStream, getCurrentTools, getCurrentSystemPrompt } from "@earendil-works/pi-ai";

export default function (pi: any) {
  const directory = process.env.PI_WAIT_PROBE_DIR!;
  pi.on("session_start", (_event: any, ctx: any) => {
    if (ctx.mode === "tui") appendFileSync(join(directory, "tui-ready"), "ready\n");
  });
  pi.on("tool_execution_start", (event: any) => {
    appendFileSync(join(directory, "tools.jsonl"), JSON.stringify({ pid: process.pid, name: event.toolName }) + "\n");
  });
  pi.on("agent_settled", () => {
    appendFileSync(join(directory, "settled.jsonl"), JSON.stringify({ pid: process.pid, tools: pi.getActiveTools() }) + "\n");
  });
  pi.registerProvider("wait-probe", {
    api: "wait-probe-api",
    baseUrl: "http://offline.invalid",
    apiKey: "offline-fixture",
    models: [{
      id: "fixture", name: "Offline wait fixture", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000, maxTokens: 1024,
    }],
    streamSimple(model: any, context: any, options: any) {
      const stream = createAssistantMessageEventStream();
      const message: any = {
        role: "assistant", content: [], api: model.api, provider: model.provider,
        model: model.id, timestamp: Date.now(), stopReason: "pending",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      const textOf = (m: any) => typeof m.content === "string" ? m.content :
        m.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("") || "";
      const lastUser = context.messages.findLast((m: any) => m.role === "user");
      const prompt = textOf(lastUser);
      const tools = getCurrentTools(context.messages);
      const systemPrompt = getCurrentSystemPrompt(context.messages);
      appendFileSync(join(directory, "requests.jsonl"), JSON.stringify({ pid: process.pid, messages: context.messages, tools, systemPrompt }) + "\n");
      void (async () => {
        try {
          stream.push({ type: "start", partial: message });
          if (prompt.startsWith("CHILD_")) {
            appendFileSync(join(directory, "child-starts.jsonl"), JSON.stringify({ prompt, pid: process.pid }) + "\n");
            while (!existsSync(join(directory, prompt + ".release"))) {
              await delay(10, undefined, { signal: options.signal });
            }
            if (prompt === "CHILD_FAIL") throw new Error("Synthetic child failure.");
          }
          if (prompt === "QUESTION_HOLD") {
            appendFileSync(join(directory, "parent-active"), "active");
            while (!existsSync(join(directory, "PARENT.release"))) await delay(10, undefined, { signal: options.signal });
          }
          const call = (name: string, args: any) => {
            const index = message.content.length;
            const toolCall = { type: "toolCall", id: "probe-" + name + "-" + index + "-" + Date.now(), name, arguments: args };
            message.content.push(toolCall);
            stream.push({ type: "toolcall_start", contentIndex: index, partial: message });
            stream.push({ type: "toolcall_end", contentIndex: index, toolCall, partial: message });
          };
          if (prompt.startsWith("START_")) {
            const since = context.messages.slice(context.messages.lastIndexOf(lastUser) + 1);
            const spawned = since.some((m: any) => m.role === "toolResult" && m.toolName === "spawn_agent");
            const waited = since.some((m: any) => m.role === "toolResult" && m.toolName.startsWith("wait_"));
            if (!spawned) {
              call("spawn_agent", { task_name: "worker-a", message: prompt === "START_FAIL" ? "CHILD_FAIL" : "CHILD_A" });
              if (prompt === "START_ALL") call("spawn_agent", { task_name: "worker-b", message: "CHILD_B" });
            } else if (!waited && tools.some((tool: any) => tool.name === "wait_agent")) {
              call(prompt === "START_ALL" ? "wait_all_agents" : "wait_agent",
                { targets: prompt === "START_ALL" ? ["worker-a", "worker-b"] : ["worker-a"] });
            }
          }
          if (prompt === "CHECK_CALLABLE" && !context.messages.slice(context.messages.lastIndexOf(lastUser) + 1).some((m: any) => m.role === "toolResult")) {
            call("codemode", { code: 'text(ALL_TOOLS.filter(t => t.name === "wait_agent" || t.name === "wait_all_agents")); try { await tools.wait_agent({}); } catch (e) { text(String(e)); }' });
          }
          if (message.content.length) {
            message.stopReason = "toolUse";
            stream.push({ type: "done", reason: "toolUse", message });
          } else {
            const text = prompt.startsWith("CHILD_") ? prompt + "_RESULT" :
              prompt.includes("<subagent_notification>") ? "CHILD_RESULT_DELIVERED" :
              prompt.startsWith("QUESTION") ? "REPLIED_TO_" + prompt :
              prompt.startsWith("START_") ? "BACKGROUND_TASK_PENDING" : "DONE";
            message.content.push({ type: "text", text });
            stream.push({ type: "text_start", contentIndex: 0, partial: message });
            stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
            stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
            message.stopReason = "stop";
            stream.push({ type: "done", reason: "stop", message });
          }
        } catch (error: any) {
          message.stopReason = options.signal?.aborted ? "aborted" : "error";
          message.errorMessage = String(error);
          stream.push({ type: "error", reason: message.stopReason, error: message });
        } finally {
          stream.end();
        }
      })();
      return stream;
    },
  });
}
