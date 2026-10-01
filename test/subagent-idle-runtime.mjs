// Manual offline probe against the installed Pi CLI and real child processes.
// Run: node test/subagent-idle-runtime.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = join(homedir(), ".pi/agent/npm/node_modules/@ogulcancelik/pi-codex-subagents/index.ts");
const provider = join(root, "test/fixtures/subagent-idle-provider.ts");
const policy = join(root, "extensions/subagent-idle.ts");
const temporary = mkdtempSync(join(tmpdir(), "pi-idle-probe-"));
const textOf = (m) => typeof m.content === "string" ? m.content : m.content?.filter((c) => c.type === "text").map((c) => c.text).join("") || "";
const processes = [];
assert(!readFileSync(upstream, "utf8").includes("responsiveSubagentWait"), "Old installed-source patch remains.");

async function runCase(name, { all = false, baseline = false, failed = false, activeDelivery = false } = {}) {
  const directory = join(temporary, name);
  const agentDir = join(directory, "agent");
  mkdirSync(join(agentDir, "pi-codex-subagents"), { recursive: true });
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ compaction: { enabled: false }, retry: { enabled: false } }));
  writeFileSync(join(agentDir, "pi-codex-subagents/config.json"), JSON.stringify({
    retentionDays: 0, defaults: { extensions: [provider] },
  }));
  const args = ["--mode", "rpc", "--no-session", "--offline", "-ne", "-nc", "-ns", "-np",
    "--provider", "wait-probe", "--model", "fixture", "--thinking", "off", "-e", provider, "-e", upstream,
    "-e", "builtin:codemode", "--tools", "read,spawn_agent,wait_agent,wait_all_agents,list_agents,read_agent_response,send_message,interrupt_agent,codemode"];
  if (!baseline) args.push("-e", policy);
  const proc = spawn("pi", args, {
    cwd: directory, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_SUBAGENT_TEMP_DIR: join(directory, "sockets"),
      PI_WAIT_PROBE_DIR: directory, PI_OFFLINE: "1" }, stdio: ["pipe", "pipe", "pipe"],
  });
  processes.push(proc);
  const records = [];
  let buffer = "", stderr = "";
  proc.stderr.on("data", (chunk) => { stderr += chunk; });
  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try { records.push(JSON.parse(line)); } catch { stderr += line; }
    }
  });
  const send = (value) => proc.stdin.write(JSON.stringify(value) + "\n");
  const until = async (predicate, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const record = records.find(predicate);
      if (record) return record;
      if (proc.exitCode !== null) throw new Error(`Pi exited: ${stderr}`);
      await delay(10);
    }
    throw new Error(`Probe timeout in ${name}: ${stderr}\n${JSON.stringify(records.slice(-4))}`);
  };
  const state = async (id) => {
    send({ id, type: "get_state" });
    return (await until((r) => r.id === id)).data;
  };
  const infos = () => {
    const runs = join(agentDir, "pi-codex-subagents/runs");
    return existsSync(runs) ? readdirSync(runs).flatMap((scope) => readdirSync(join(runs, scope))
      .filter((file) => file.endsWith(".info.json")).map((file) => JSON.parse(readFileSync(join(runs, scope, file))))) : [];
  };
  const completions = () => records.filter((r) => r.type === "message_end" && r.message?.customType === "pi-codex-subagent-completion");
  const replies = () => records.filter((r) => r.type === "message_end" && r.message?.role === "assistant");
  const before = await state("state-before");
  send({ id: "start", type: "prompt", message: failed ? "START_FAIL" : all ? "START_ALL" : "START_ONE" });
  if (baseline) {
    await until((r) => r.type === "tool_execution_start" && r.toolName === "wait_agent");
    assert.equal((await state("blocked")).isStreaming, true);
    console.log("BASELINE: original upstream holds the parent active in wait_agent.");
    writeFileSync(join(directory, "CHILD_A.release"), "");
    await until((r) => r.type === "agent_settled");
  } else {
    await until((r) => r.type === "agent_settled");
    assert.equal((await state("idle-before-input")).isStreaming, false);
    const pending = infos().filter((i) => i.status === "running");
    assert.equal(pending.length, all ? 2 : 1);
    for (const info of pending) process.kill(info.childProcess.pid, 0);
    assert(replies().some((r) => textOf(r.message) === "BACKGROUND_TASK_PENDING"));
    assert(!records.some((r) => r.type === "tool_execution_start" && r.toolName.startsWith("wait_")));
    console.log(`PASS ${name}: parent settled BEFORE user input while ${pending.length} children remained running.`);

    const question = activeDelivery ? "QUESTION_HOLD" : "QUESTION_" + name;
    const submitted = Date.now();
    send({ id: "question", type: "prompt", message: question }); // No steer, abort, or wait-release action.
    await until((r) => r.id === "question" && r.success && r.data.disposition === "started");
    if (activeDelivery) {
      await until(() => existsSync(join(directory, "parent-active")));
      writeFileSync(join(directory, "CHILD_A.release"), "");
      await until(() => infos().some((i) => i.status === "completed"));
      assert.equal((await state("active-during-completion")).isStreaming, true);
      writeFileSync(join(directory, "PARENT.release"), "");
    }
    await until((r) => r.type === "message_end" && r.message?.role === "assistant" && textOf(r.message) === "REPLIED_TO_" + question);
    console.log(`PASS ${name}: ordinary prompt answered in ${Date.now() - submitted}ms, with no interruption.`);

    if (all) {
      writeFileSync(join(directory, "CHILD_A.release"), "");
      await until(() => completions().length === 1 && replies().some((r) => textOf(r.message) === "CHILD_RESULT_DELIVERED"));
      await until(() => records.filter((r) => r.type === "agent_settled").length >= 3);
      assert.equal((await state("idle-with-other-child")).isStreaming, false);
      assert.equal(infos().filter((i) => i.status === "running").length, 1);
      writeFileSync(join(directory, "CHILD_B.release"), "");
    } else if (!activeDelivery) {
      writeFileSync(join(directory, failed ? "CHILD_FAIL.release" : "CHILD_A.release"), "");
    }
    const expected = all ? 2 : 1;
    await until(() => completions().length === expected && replies().filter((r) => textOf(r.message) === "CHILD_RESULT_DELIVERED").length === expected);
    assert.equal(new Set(completions().map((r) => r.message.details.agent_name)).size, expected);
    if (failed) assert.equal(completions()[0].message.details.status, "failed");
    console.log(`PASS ${name}: ${expected} automatic ${failed ? "failure" : "completion"} notifications resumed the parent once each.`);

    send({ id: "callable", type: "prompt", message: "CHECK_CALLABLE" });
    const nested = await until((r) => r.type === "tool_execution_end" && r.toolName === "codemode");
    assert.equal(nested.isError, false);
    assert.match(textOf(nested.result), /\[\]/);
    assert.match(textOf(nested.result), /TypeError|not.*function|not.*callable/);
    const requests = readFileSync(join(directory, "requests.jsonl"), "utf8").trim().split("\n").map(JSON.parse).filter((r) => r.pid === proc.pid);
    for (let i = 1; i < requests.length; i++) {
      assert.deepEqual(requests[i].messages.slice(0, requests[i - 1].messages.length), requests[i - 1].messages, "existing provider context was rewritten");
    }
    for (const request of requests) {
      assert(!request.tools.some((tool) => ["wait_agent", "wait_all_agents"].includes(tool.name)));
      assert.equal(request.systemPrompt.split("Subagent results arrive automatically.").length - 1, 1);
    }
    console.log(`PASS ${name}: waits absent from direct and codemode access; guidance stable; all provider transcript prefixes unchanged.`);
  }
  const after = await state("state-after");
  assert.equal(after.sessionId, before.sessionId);
  assert.deepEqual(after.model, before.model);
  proc.stdin.end();
  await new Promise((resolve) => proc.once("exit", resolve));
}

try {
  await runCase("baseline", { baseline: true });
  await runCase("single-idle");
  await runCase("two-children", { all: true });
  await runCase("failure", { failed: true });
  await runCase("completion-during-response", { activeDelivery: true });
} finally {
  for (const proc of processes) if (proc.exitCode === null) proc.kill("SIGTERM");
  rmSync(temporary, { recursive: true, force: true });
}
