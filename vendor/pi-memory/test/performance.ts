// Manual local benchmark. Synthetic records only, no provider or network calls.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveLocations, atomicWriteFile } from "../src/core.js";
import { fingerprint, pageUnits, tokenEstimate } from "../src/admission.js";
import { encodeLedger, ledgerPath, lookupRecords, readLedger, routingIndex, type Ledger } from "../src/ledger.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-perf-"));
const rows = [];
try {
  for (const count of [16, 128, 1024]) {
    const cwd = path.join(root, `project-${count}`); fs.mkdirSync(cwd); Bun.spawnSync(["git", "init", "-q"], { cwd });
    const environment = { PI_MEMORY_DIR: path.join(root, "store") };
    const dir = resolveLocations(cwd, environment).projectDir!;
    const now = new Date().toISOString();
    const ledger: Ledger = { version: 1, imports: [], history: [], records: Array.from({ length: count }, (_, i) => ({
      id: randomUUID(), revision: randomUUID(), topic: `workflow-${i % Math.ceil(Math.sqrt(count))}`, route: `Integration testing workflow ${i}`,
      content: `Record ${i}: Preserve opaque cursor tokens for page continuation. Unique retrieval identifier marker${i}. ${"Relevant fictional detail. ".repeat(8)}`,
      kind: "fact", always: false, evidence: { actor: "tool", reference: "synthetic-source", quote: "Preserve opaque cursor tokens.", observedAt: now }, updatedAt: now,
    })) };
    atomicWriteFile(ledgerPath(dir), encodeLedger(ledger));
    const routing: number[] = [], search: number[] = [], focusedRecall: number[] = [], continuation: number[] = [];
    for (let i = 0; i < 80; i++) {
      let start = performance.now();
      routingIndex(readLedger(dir));
      routing.push(performance.now() - start);
      start = performance.now();
      lookupRecords([{ scope: "global", dir }], `marker${count - 1}`);
      search.push(performance.now() - start);
      start = performance.now();
      const locations = resolveLocations(cwd, environment); routingIndex(readLedger(locations.projectDir!));
      focusedRecall.push(performance.now() - start);
      start = performance.now();
      const cues = lookupRecords([{ scope: "project", dir }], `marker${count - 1}`);
      pageUnits(cues, fingerprint(cues), 1200);
      continuation.push(performance.now() - start);
    }
    const metrics = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)] };
    };
    rows.push({ count, ledgerBytes: fs.statSync(ledgerPath(dir)).size, routingBytes: Buffer.byteLength(routingIndex(ledger)), routingTokens: tokenEstimate(routingIndex(ledger)), routing: metrics(routing), search: metrics(search), focusedRecall: metrics(focusedRecall), completeCuePage: metrics(continuation) });
  }
  console.log(JSON.stringify({ scope: "local routing/search plus real read-only Git focus resolution and complete-cue admission; no provider/network calls or tool round-trip timing", rows }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
