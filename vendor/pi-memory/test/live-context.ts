// Manual paid evaluation. Fictional multi-turn work through production Pi tools.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import registerMemory from "../src/index.js";
import { readLedger, saveRecord } from "../src/ledger.js";
import { resolveLocations } from "../src/core.js";
const output = process.argv[2];
if (!output) throw new Error("Usage: bun vendor/pi-memory/test/live-context.ts <result.json>");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-native-context-live-")); fs.chmodSync(root, 0o700);
const authPath = path.join(root, "auth.json"), modelsPath = path.join(root, "models.json"), home = path.join(os.homedir(), ".pi", "agent");
const previousDir = process.env.PI_MEMORY_DIR, previousRole = process.env.PI_MEMORY_SUBAGENT_MODE;
const rows: Array<Record<string, unknown>> = [];
const timestamp = new Date().toISOString();
const seed = (topic: string, content: string, kind: "preference" | "decision" = "decision") => ({ topic, route: `When deciding ${topic}`, kind, content, always: false,
  evidence: { actor: "user" as const, reference: "fictional-seed", quote: content, observedAt: timestamp } });
const environment = "For Maple, ordinary development and integration tests stay local because deterministic feedback matters.\n\nThe shared sandbox is an exception only for explicitly requested benchmark behavior. Benchmark claims are fixture/build specific, and workloads must use comparable request shapes. Do not treat a sandbox benchmark as proof about every customer workload.";
try {
  fs.copyFileSync(path.join(home, "auth.json"), authPath); fs.chmodSync(authPath, 0o600);
  if (fs.existsSync(path.join(home, "models.json"))) { fs.copyFileSync(path.join(home, "models.json"), modelsPath); fs.chmodSync(modelsPath, 0o600); }
  const credentials = JSON.parse(fs.readFileSync(authPath, "utf8"));
  if (credentials["openai-codex"]?.expires < Date.now() + 30 * 60 * 1000) throw new Error("Insufficient isolated credential validity. Refusing copied-credential refresh.");
  const runtime = await ModelRuntime.create({ authPath, modelsPath, modelsStorePath: path.join(root, "catalog.json"), allowModelNetwork: false, refreshOnCreate: false });
  const model = runtime.getModel("openai-codex", "gpt-6.1-sol"); if (!model) throw new Error("Permitted configured model unavailable.");
  process.env.PI_MEMORY_SUBAGENT_MODE = "root";
  const maple = path.join(root, "maple"), cedar = path.join(root, "cedar");
  for (const cwd of [maple, cedar]) { fs.mkdirSync(cwd); Bun.spawnSync(["git", "init", "-q"], { cwd }); }
  const store = path.join(root, "memory"); process.env.PI_MEMORY_DIR = store;
  const mapleLocation = resolveLocations(maple), cedarLocation = resolveLocations(cedar);
  saveRecord(mapleLocation.projectDir!, seed("environment-policy", environment));
  saveRecord(mapleLocation.globalDir, seed("recurring-message-format", "Use plain paragraphs for recurring project digests across projects.", "preference"));
  for (let i = 0; i < 35; i++) saveRecord(cedarLocation.projectDir!, seed(`unrelated-fixture-${i}`, `Fictional unrelated project decision ${i} about asset marker ${i}.`));
  async function session(cwd: string, name: string, requests: string[]) {
    const agentDir = path.join(root, name); fs.mkdirSync(agentDir, { recursive: true });
    const loader = new DefaultResourceLoader({ cwd, agentDir, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      extensionFactories: [{ name: "memory", factory: registerMemory }] }); await loader.reload();
    const manager = SessionManager.create(cwd, path.join(agentDir, "sessions"));
    const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model, thinkingLevel: "medium", scopedModels: [{ model }], noTools: "builtin", resourceLoader: loader, sessionManager: manager });
    let requestsMade = 0;
    const unsubscribe = session.subscribe(event => { if (event.type === "message_end" && event.message.role === "assistant" && ++requestsMade > 25) void session.abort(); });
    const started = performance.now();
    try {
      for (const request of requests) await session.prompt(request);
      const answers = session.messages.filter(message => message.role === "assistant").flatMap(message => message.content.filter(part => part.type === "text").map(part => part.text));
      const tools = session.messages.filter(message => message.role === "toolResult").map(message => ({ name: message.toolName, error: message.isError, content: message.content }));
      const result = { name, requests, answers, tools, nativeBranch: manager.getBranch(), elapsedMs: performance.now() - started, requestsMade };
      rows.push(result); console.log(JSON.stringify({ name, requestsMade, tools: tools.map(tool => tool.name) })); return result;
    } finally { unsubscribe(); session.dispose(); }
  }
  await session(maple, "environment-learning", [
    "Before deciding, how would you handle customer reproductions with scrubbed synthetic data alongside our existing benchmark exception? Explain the options without changing our policy yet.",
    "Agreed. Add the synthetic-data customer reproduction exception for this project. Keep the rest of our environment decision, including why ordinary development stays local and the benchmark limitations.",
  ]);
  const environmentRecord = readLedger(mapleLocation.projectDir!).records.find(record => record.topic === "environment-policy");
  await session(maple, "cedar-scheduling-learning", [
    `This conversation starts in Maple, but the actual task is for ${cedar}. We are considering delivery options for a recurring Cedar digest. We care about recipients seeing it during their working morning. Explain the tradeoff between one shared UTC time and recipient-local delivery; do not settle a schedule yet.`,
    "Choose 09:30 in each recipient's own timezone, weekdays only. Plain paragraphs remain our recurring format. For today's sample only, HTML is fine. Do not change the recurring format.",
  ]);
  const cedarRecords = readLedger(cedarLocation.projectDir!).records;
  const schedule = cedarRecords.filter(record => !record.topic.startsWith("unrelated-fixture-"));
  const globalFormat = readLedger(mapleLocation.globalDir).records;
  const future = await session(cedar, "future-digest-plan", ["Draft the recurring team-digest delivery plan for Toronto and Singapore, including the report format."]);
  process.env.PI_MEMORY_DIR = path.join(root, "empty-control");
  const empty = await session(cedar, "empty-digest-control", ["Draft the recurring team-digest delivery plan for Toronto and Singapore, including the report format."]);
  const answer = future.answers.join("\n");
  const checks = {
    environmentOneCurrentRecord: readLedger(mapleLocation.projectDir!).records.length === 1,
    environmentPreservesQualifications: !!environmentRecord && [/local/i, /deterministic|feedback/i, /benchmark/i, /fixture|build/i, /comparab|request shapes/i, /synthetic/i, /scrub|saniti/i].every(pattern => pattern.test(environmentRecord.content)),
    taskRepositorySelected: schedule.length === 1 && !readLedger(mapleLocation.projectDir!).records.some(record => /09:30/.test(record.content)),
    recurringFormatUnchanged: globalFormat.length === 1 && /plain paragraphs/i.test(globalFormat[0].content) && !/html/i.test(globalFormat[0].content),
    scheduleSpecificity: schedule.some(record => /09:30/.test(record.content) && /weekday/i.test(record.content) && /recipient|each.*timezone|local/i.test(record.content)),
    futureSpecificity: /09:30/.test(answer) && /weekday|Monday.*Friday/i.test(answer) && /plain/i.test(answer) && /local|recipient|their.*time.?zone/i.test(answer),
    futureRecordExposed: future.tools.some(tool => ["memory_read", "memory_search"].includes(tool.name) && /09:30/.test(JSON.stringify(tool.content)) && /working morning/.test(JSON.stringify(tool.content))),
    noHistoricalReplay: !future.tools.some(tool => tool.name === "memory_evidence"),
  };
  fs.writeFileSync(output, JSON.stringify({ model: "openai-codex/gpt-6.1-sol", thinking: "medium", checks, environmentRecord, schedule, globalFormat, rows,
    emptyAnswer: empty.answers, note: "Two authored fictional multi-turn scenarios, one future paraphrased task with 35 competing topics and an empty-memory control. Historical inspection is retired. Single run, not a reliability estimate." }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ checks })); if (Object.values(checks).some(value => !value)) process.exitCode = 1;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  if (previousDir === undefined) delete process.env.PI_MEMORY_DIR; else process.env.PI_MEMORY_DIR = previousDir;
  if (previousRole === undefined) delete process.env.PI_MEMORY_SUBAGENT_MODE; else process.env.PI_MEMORY_SUBAGENT_MODE = previousRole;
}
