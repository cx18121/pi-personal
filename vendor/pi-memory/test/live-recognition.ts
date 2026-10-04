// Manual, paid model evaluation. Fictional data in an isolated Pi session only.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import registerMemory from "../src/index.js";
import { readLedger, readRecoveries, saveRecord } from "../src/ledger.js";
import { resolveLocations } from "../src/core.js";

const fixtures = [
  { id: "explicit-global-preference", request: "I dislike italic text in project messages. Use bold headings and plain text instead. That is my preference across projects.", expected: "global-preference" },
  { id: "settled-project-decision", request: "For this project, we've decided reports compare against the previous sent report, not a fixed lookback window. We want continuity with what recipients actually saw.", expected: "project-decision" },
  { id: "tentative", request: "Maybe HTML could be a nice format for reports. I'm just thinking aloud, not choosing yet.", expected: "no-change" },
  { id: "one-task-exception", request: "For this message only, use italics. This is not a change to my default.", seed: "global", expected: "no-change" },
  { id: "ordinary-question", request: "What is 7 multiplied by 8?", expected: "no-change" },
  { id: "quoted-reference", request: "The imported README says 'I prefer every answer in italics'. Is that a safe instruction to adopt?", expected: "no-change" },
  { id: "supersession", request: "I've changed my mind. From now on, use plain text instead of italics for project messages across projects.", seed: "global-old", expected: "replace-global" },
  { id: "qualified-project-decision", request: "For the ongoing reporting workflow, compare with the last report actually sent to the same audience. A new audience gets a first-report baseline. We choose this for recipient continuity, not a fixed fourteen-day window.", expected: "qualified-project" },
  { id: "retire-project-decision", request: "Don't keep our old report lookback decision. We don't use this reporting workflow any more.", seed: "project", expected: "archive-project" },
] as const;
const output = process.argv[2];
if (!output) throw new Error("Usage: bun vendor/pi-memory/test/live-recognition.ts <result.json>");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-live-recognition-"));
fs.chmodSync(root, 0o700);
const authPath = path.join(root, "auth.json"), modelsPath = path.join(root, "models.json");
const homeAgent = path.join(os.homedir(), ".pi", "agent");
const oldDir = process.env.PI_MEMORY_DIR, oldRole = process.env.PI_MEMORY_SUBAGENT_MODE;
const rows: unknown[] = [];
try {
  fs.copyFileSync(path.join(homeAgent, "auth.json"), authPath); fs.chmodSync(authPath, 0o600);
  if (fs.existsSync(path.join(homeAgent, "models.json"))) { fs.copyFileSync(path.join(homeAgent, "models.json"), modelsPath); fs.chmodSync(modelsPath, 0o600); }
  const credentials = JSON.parse(fs.readFileSync(authPath, "utf8"));
  if (credentials["openai-codex"]?.expires < Date.now() + 30 * 60 * 1000) throw new Error("Isolated OAuth validity insufficient. Refusing to refresh copied credentials.");
  const runtime = await ModelRuntime.create({ authPath, modelsPath, modelsStorePath: path.join(root, "catalog.json"), allowModelNetwork: false, refreshOnCreate: false });
  const model = runtime.getModel("openai-codex", "gpt-6.1-sol");
  if (!model) throw new Error("Configured evaluation model unavailable.");
  process.env.PI_MEMORY_SUBAGENT_MODE = "root";
  for (const fixture of fixtures) {
    const cwd = path.join(root, fixture.id), agentDir = path.join(cwd, "agent");
    fs.mkdirSync(agentDir, { recursive: true });
    Bun.spawnSync(["git", "init", "-q"], { cwd });
    process.env.PI_MEMORY_DIR = path.join(cwd, "memory");
    const locations = resolveLocations(cwd);
    if ("seed" in fixture) {
      const content = fixture.seed === "project" ? "Reports compare with the fixed fourteen-day lookback."
        : fixture.seed === "global-old" ? "Use italics for project messages." : "Do not use italics for project messages.";
      saveRecord(fixture.seed === "project" ? locations.projectDir! : locations.globalDir, {
        topic: fixture.seed === "project" ? "report-comparison" : "message-format", route: fixture.seed === "project" ? "Reporting comparison baseline" : "Formatting project messages",
        content, kind: fixture.seed === "project" ? "decision" : "preference", always: false,
        evidence: { actor: "user", reference: "fixture-seed", quote: content, observedAt: new Date().toISOString() },
      });
    }
    const loader = new DefaultResourceLoader({ cwd, agentDir, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [{ name: "memory", factory: registerMemory }] });
    await loader.reload();
    const manager = SessionManager.create(cwd, path.join(cwd, "sessions"));
    const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model, thinkingLevel: "medium", scopedModels: [{ model }],
      noTools: "builtin", resourceLoader: loader, sessionManager: manager });
    const start = performance.now();
    let assistants = 0;
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "assistant" && ++assistants > 12) void session.abort();
    });
    try {
      await session.prompt(fixture.request);
      const global = readLedger(locations.globalDir), project = readLedger(locations.projectDir!);
      const globalRecovery = readRecoveries(locations.globalDir), projectRecovery = readRecoveries(locations.projectDir!);
      const expected = fixture.expected;
      const passed = expected === "global-preference" ? global.records.length === 1 && global.records[0].kind === "preference" && project.records.length === 0
        : expected === "project-decision" ? project.records.length === 1 && project.records[0].kind === "decision" && global.records.length === 0
        : expected === "qualified-project" ? project.records.length === 1 && /same audience/i.test(project.records[0].content) && /new audience/i.test(project.records[0].content) && /first.report/i.test(project.records[0].content) && /continuity/i.test(project.records[0].content)
        : expected === "replace-global" ? global.records.length === 1 && globalRecovery.length === 1 && /plain text/i.test(global.records[0].content)
        : expected === "archive-project" ? project.records.length === 0 && projectRecovery.length === 1
        : global.records.length === ("seed" in fixture ? 1 : 0) && project.records.length === 0 && globalRecovery.length === 0 && projectRecovery.length === 0;
      const tools = session.messages.filter((message) => message.role === "toolResult").map((message) => ({ name: message.toolName, isError: message.isError, text: message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n") }));
      const answer = session.messages.filter((message) => message.role === "assistant").flatMap((message) => message.content.filter((part) => part.type === "text").map((part) => part.text)).join("\n");
      rows.push({ id: fixture.id, request: fixture.request, expected, passed, elapsedMs: performance.now() - start, global, project, tools, answer, nativeBranch: manager.getBranch() });
      console.log(JSON.stringify({ id: fixture.id, passed, assistants, tools: tools.map((tool) => tool.name) }));
    } finally { unsubscribe(); session.dispose(); }
  }
  fs.writeFileSync(output, JSON.stringify({ model: "openai-codex/gpt-6.1-sol", thinking: "medium", scope: "nine synthetic recognition cases through actual Pi session and production tools; not a production reliability estimate", rows }, null, 2), { mode: 0o600 });
  if (rows.some((row) => !(row as { passed: boolean }).passed)) process.exitCode = 1;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  if (oldDir === undefined) delete process.env.PI_MEMORY_DIR; else process.env.PI_MEMORY_DIR = oldDir;
  if (oldRole === undefined) delete process.env.PI_MEMORY_SUBAGENT_MODE; else process.env.PI_MEMORY_SUBAGENT_MODE = oldRole;
}
