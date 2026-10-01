import { expect, test } from "bun:test";
import registerSubagentIdle from "../extensions/subagent-idle.ts";
import { readFileSync } from "node:fs";

function harness(active = ["read", "spawn_agent", "wait_agent", "wait_all_agents", "send_message", "codemode"]) {
  const handlers = new Map<string, Function>();
  const changes: string[][] = [];
  const pi = {
    on: (event: string, handler: Function) => handlers.set(event, handler),
    getActiveTools: () => active,
    setActiveTools: (tools: string[]) => { changes.push(tools); active = tools; },
  };
  registerSubagentIdle(pi as never);
  const start = (guidelines: string[] = []) => {
    const event = { systemPromptOptions: { selectedTools: [...active], promptGuidelines: guidelines } };
    handlers.get("before_agent_start")!(event);
    return event.systemPromptOptions;
  };
  return { handlers, changes, start, active: () => active, enable: (tools: string[]) => { active = tools; } };
}

test("startup and reload remove only blocking waits", () => {
  const h = harness();
  h.handlers.get("session_start")!();
  expect(h.active()).toEqual(["read", "spawn_agent", "send_message", "codemode"]);
  h.handlers.get("session_start")!();
  expect(h.changes).toHaveLength(1);
});

test("new turns repair restored waits without removing other tools or forcing the prompt", () => {
  const h = harness(["read"]);
  const initial = h.start(["Existing guideline."]);
  h.enable(["read", "wait_agent", "wait_all_agents", "list_agents"]);
  const restored = h.start();
  expect(restored.selectedTools).toEqual(["read", "list_agents"]);
  expect(h.active()).toEqual(restored.selectedTools);
  expect(initial.promptGuidelines[0]).toBe("Existing guideline.");
  expect(initial.promptGuidelines[1]).toContain("end your turn with the task still pending");
  expect(initial).not.toHaveProperty("forceSystemPrompt");
});

test("idle guidance is stable and added once, without repeated loadout changes", () => {
  const h = harness();
  const first = h.start();
  const next = h.start(first.promptGuidelines);
  expect(next.promptGuidelines).toEqual(first.promptGuidelines);
  expect(next.promptGuidelines).toHaveLength(1);
  expect(h.changes).toHaveLength(1);
});

test("does not enable tools when the session intentionally has none", () => {
  const h = harness([]);
  expect(h.start().selectedTools).toEqual([]);
  expect(h.changes).toHaveLength(0);
});

test("package owns idle policy and setup no longer patches subagent source", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(manifest.pi.extensions).toContain("./extensions/subagent-idle.ts");
  for (const filename of ["bootstrap", "update"]) {
    expect(readFileSync(new URL("../scripts/" + filename, import.meta.url), "utf8")).not.toContain("patch-subagent-waits");
  }
});
