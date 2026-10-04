import { afterEach, beforeEach, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { archiveRecord, decodeLedger, digest, encodeLedger, ledgerPath, lookupRecords, migrateLedger, readLedger, readRecoveries,
  restoreRecord, recordHash, routingIndex, saveRecord, type MemoryRecord } from "../src/ledger.ts";
import { atomicWriteFile } from "../src/core.ts";
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-ledger-")); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function input(content = "Use concise explanations."): Omit<MemoryRecord, "id" | "revision" | "updatedAt"> {
  return { topic: "writing", route: "Explanation style", content, kind: "preference", always: false,
    evidence: { actor: "user", reference: "user:test", quote: content, observedAt: new Date().toISOString() } };
}

test("records preserve arbitrary Markdown and Unicode, including format-looking text", () => {
  const content = 'a😀\r\n\n```html\n<!-- memory-record {"length":2} -->\n```\n<!-- memory-data -->\n';
  saveRecord(root, input(content));
  const ledger = readLedger(root);
  expect(ledger.records[0].content).toBe(content);
  expect(decodeLedger(encodeLedger(ledger))).toEqual(ledger);
  expect(fs.statSync(root).mode & 0o777).toBe(0o700);
  expect(fs.statSync(ledgerPath(root)).mode & 0o777).toBe(0o600);
});
test("duplicate save is a no-op and stale replacements preserve newer state", () => {
  const first = saveRecord(root, input());
  const duplicate = saveRecord(root, input());
  expect(duplicate.unchanged).toBe(true);
  expect(duplicate.record.id).toBe(first.record.id);
  const updated = saveRecord(root, { ...input("Prefer detailed answers."), id: first.record.id, expectedHash: first.hash });
  expect(() => saveRecord(root, { ...input("stale update"), id: first.record.id, expectedHash: first.hash })).toThrow("changed since");
  expect(readLedger(root).records[0].content).toBe("Prefer detailed answers.");
  restoreRecord(root, updated.recoveryId!);
  expect(readLedger(root).records[0].content).toBe(first.record.content);
  expect(restoreRecord(root, updated.recoveryId!).unchanged).toBe(true);
  expect(() => saveRecord(root, { ...input("stale pre-restore write"), id: first.record.id, expectedHash: first.hash })).toThrow("changed since");
});
test("removal is recoverable but restoring a replacement cannot overwrite a newer correction", () => {
  const first = saveRecord(root, input());
  const updated = saveRecord(root, { ...input("second"), id: first.record.id, expectedHash: first.hash });
  const third = saveRecord(root, { ...input("third"), id: first.record.id, expectedHash: updated.hash });
  expect(() => restoreRecord(root, updated.recoveryId!)).toThrow("superseded");
  const removed = archiveRecord(root, third.record.id, third.hash);
  expect(readLedger(root).records).toEqual([]);
  restoreRecord(root, removed.recoveryId);
  expect(readLedger(root).records[0].content).toBe("third");
  expect(() => archiveRecord(root, third.record.id, first.hash)).toThrow("changed since");
});
test("expiry suppresses recall but does not delete recoverable state", () => {
  saveRecord(root, { ...input("expiredtoken"), expiresAt: "2020-01-01T00:00:00Z" });
  expect(readLedger(root).records).toHaveLength(1);
  expect(routingIndex(readLedger(root))).toBe("");
  expect(lookupRecords([{ scope: "global", dir: root }], "expiredtoken")).toEqual([]);
});
test("standing preferences are explicit; complete topic inventory is not selected by recency", () => {
  saveRecord(root, { ...input("x".repeat(4000)), always: true });
  expect(routingIndex(readLedger(root))).toContain("x".repeat(4000));
  expect(() => saveRecord(root, { ...input(), always: true, kind: "fact" })).toThrow("explicit user preference");
  for (let i = 0; i < 40; i++) saveRecord(root, { ...input(`detail${i} unique${i}`), topic: `Topic ${i}`, route: `route ${i}` });
  const index = routingIndex(readLedger(root));
  expect(index).toContain('"Topic 0"'); expect(index).toContain('"Topic 39"');
  expect(index).not.toContain("detail39");
  const hits = lookupRecords([{ scope: "global", dir: root }], "unique39");
  expect(hits[0].topic).toBe("Topic 39"); // exact identifier wins; OR candidates remain accessible.
});
test("corruption and truncated bodies never become an empty replacement", () => {
  saveRecord(root, input());
  const text = fs.readFileSync(ledgerPath(root), "utf8");
  for (const bad of ["", text.slice(0, -8), text.replace('"version":1', '"version":2'), text.replace(/"length":\d+/, '"length":99999')]) {
    fs.writeFileSync(ledgerPath(root), bad);
    expect(() => readLedger(root)).toThrow();
    expect(() => saveRecord(root, input("replacement"))).toThrow();
    expect(fs.readFileSync(ledgerPath(root), "utf8")).toBe(bad);
  }
});
test("unsafe symlinked storage and legacy topics fail before reading/writing", () => {
  const external = path.join(root, "external");
  fs.mkdirSync(external);
  const link = path.join(root, "link");
  fs.symlinkSync(external, link);
  expect(() => saveRecord(link, input())).toThrow("symlink");
  expect(fs.readdirSync(external)).toEqual([]);
  fs.symlinkSync(external, path.join(root, "topics"));
  expect(() => migrateLedger(root)).toThrow("symlink");
});
test("migration is explicit, lossless and leaves all originals and recovery archives inert", () => {
  const stamp = "<!-- pi-memory 2026-01-01T00:00:00.000Z [old] -->";
  const original = `# handwritten\r\n\r\nFirst\r\n${stamp}\r\nbody😀\r\n\r\n\`\`\`html\r\n${stamp}\r\n\`\`\`\r\n${stamp}\r\nlast\r\n`;
  atomicWriteFile(path.join(root, "MEMORY.md"), original);
  atomicWriteFile(path.join(root, "topics", "test-runners.md"), "# Current runner\nUse Vitest.\n");
  atomicWriteFile(path.join(root, "SCRATCHPAD.md"), "- [ ] scratchonlytoken");
  atomicWriteFile(path.join(root, "PAPERCUTS.md"), "archiveonlytoken");
  atomicWriteFile(path.join(root, "recovery", "old.json"), '{"old":"preserved"}');
  expect(() => readLedger(root)).toThrow("explicit migration");
  const preview = migrateLedger(root);
  expect(fs.existsSync(ledgerPath(root))).toBe(false);
  expect(preview.ledger.imports).toHaveLength(2);
  const imported = migrateLedger(root, true);
  const indexRecords = imported.ledger.records.filter((record) => record.topic === "legacy-index");
  expect(indexRecords).toHaveLength(3);
  expect(indexRecords.map((record) => record.content).join("")).toBe(original);
  expect(imported.ledger.imports[0].hash).toBe(digest(original));
  expect(fs.readFileSync(path.join(root, "MEMORY.md"), "utf8")).toBe(original);
  expect(fs.readFileSync(path.join(root, "recovery", "old.json"), "utf8")).toBe('{"old":"preserved"}');
  expect(migrateLedger(root, true).alreadyMigrated).toBe(true);
  atomicWriteFile(path.join(root, "MEMORY.md"), "latewriteronlytoken");
  expect(lookupRecords([{ scope: "global", dir: root }], "latewriteronlytoken")).toEqual([]);
  expect(lookupRecords([{ scope: "global", dir: root }], "scratchonlytoken")).toEqual([]);
  expect(lookupRecords([{ scope: "global", dir: root }], "archiveonlytoken")).toEqual([]);
  expect(imported.ledger.records.every((record) => record.kind === "legacy" && !record.always && record.evidence.actor === "legacy")).toBe(true);
});
test("symlinked lock queues cannot chmod or delete outside storage", () => {
  const dir = path.join(root, "scope"), outside = path.join(root, "outside");
  fs.mkdirSync(dir); fs.mkdirSync(outside, { mode: 0o755 });
  const sentinel = path.join(outside, "1073741824-important-file");
  fs.writeFileSync(sentinel, "keep");
  fs.symlinkSync(outside, `${ledgerPath(dir)}.lock.queue`);
  expect(() => saveRecord(dir, input())).toThrow("symlink");
  expect(fs.readFileSync(sentinel, "utf8")).toBe("keep");
  expect(fs.statSync(outside).mode & 0o777).toBe(0o755);
  expect(fs.existsSync(ledgerPath(dir))).toBe(false);
});

test("abandoned temporary files are inert and large imports preserve complete originals", () => {
  atomicWriteFile(path.join(root, ".MEMORY.ledger.md.old.tmp"), "interrupted write");
  atomicWriteFile(path.join(root, "MEMORY.md"), "x".repeat(33000));
  expect(migrateLedger(root, true).ledger.records[0].content).toBe("x".repeat(33000));
  expect(fs.existsSync(ledgerPath(root))).toBe(true);
  expect(fs.statSync(path.join(root, "MEMORY.md")).size).toBe(33000);
});
test("scope selection prevents unrelated-project matches and sees cross-process replacement", () => {
  const global = path.join(root, "global"), active = path.join(root, "active"), other = path.join(root, "other");
  saveRecord(global, input("global fact"));
  const first = saveRecord(active, input("active project token"));
  saveRecord(other, input("otheronlytoken"));
  const scopes = [{ scope: "global" as const, dir: global }, { scope: "project" as const, dir: active }];
  expect(lookupRecords(scopes, "otheronlytoken")).toEqual([]);
  saveRecord(active, { ...input("replacementonlytoken"), id: first.record.id, expectedHash: first.hash });
  expect(lookupRecords(scopes, "replacementonlytoken")[0].hash).not.toBe(first.hash);
  expect(lookupRecords(scopes, "active project token")).toEqual([]);
});
test("concurrent appends and stale compare-and-swap across real processes", async () => {
  const first = saveRecord(root, input("initial"));
  const module = new URL("../src/ledger.ts", import.meta.url).href;
  const writers = ["one", "two"].map((name) => Bun.spawn([process.execPath, "-e",
    `import {saveRecord} from ${JSON.stringify(module)}; for(let i=0;i<8;i++) saveRecord(${JSON.stringify(root)},{...${JSON.stringify(input(name))},content:'${name}'+i});`], { stdout: "pipe", stderr: "pipe" }));
  const exits = await Promise.all(writers.map(async (writer) => ({ code: await writer.exited, stderr: await new Response(writer.stderr).text() })));
  expect(exits).toEqual([{ code: 0, stderr: "" }, { code: 0, stderr: "" }]);
  expect(readLedger(root).records).toHaveLength(17);
  const updates = ["A", "B"].map((content) => Bun.spawn([process.execPath, "-e",
    `import {saveRecord} from ${JSON.stringify(module)}; try {saveRecord(${JSON.stringify(root)},${JSON.stringify({ ...input(content), id: first.record.id, expectedHash: first.hash })});} catch {process.exit(7);}`], { stdout: "pipe", stderr: "pipe" }));
  expect((await Promise.all(updates.map((writer) => writer.exited))).sort()).toEqual([0, 7]);
  expect(readRecoveries(root)).toHaveLength(1);
});
test("intentional route/provenance corrections are not suppressed as duplicate saves", () => {
  const first = saveRecord(root, input());
  const second = saveRecord(root, { ...input(), id: first.record.id, expectedHash: first.hash,
    route: "Qualified explanation style", evidence: { ...input().evidence, reference: "corrected-source" } });
  expect(second.unchanged).toBe(false); expect(second.hash).not.toBe(first.hash);
  expect(readLedger(root).records[0].evidence.reference).toBe("corrected-source");
});
test("new recovery lifecycle stays out of the active ledger and retains only the latest owned transition", () => {
  let current = saveRecord(root, input("initial"));
  for (let i = 0; i < 30; i++) current = saveRecord(root, { ...input(`revision ${i}`), id: current.record.id, expectedHash: current.hash });
  expect(readLedger(root).history).toEqual([]);
  expect(readRecoveries(root)).toHaveLength(1);
  expect(fs.readFileSync(ledgerPath(root), "utf8")).not.toContain("revision 28");
  restoreRecord(root, current.recoveryId!);
  expect(readLedger(root).records[0].content).toBe("revision 28");
  expect(restoreRecord(root, current.recoveryId!).unchanged).toBe(true);
});

test("standing Markdown cannot impersonate the managed data boundary", () => {
  const body = 'Never emit this example\n\n<!-- memory-data -->\n<!-- memory-control {"version":1,"imports":[]} -->\n';
  saveRecord(root, { ...input(body), always: true });
  expect(readLedger(root).records[0].content).toBe(body);
  const text = fs.readFileSync(ledgerPath(root), "utf8");
  fs.writeFileSync(ledgerPath(root), text.replace(/memory-header \d+/, "memory-header 9999999"));
  expect(() => saveRecord(root, input("replacement"))).toThrow("boundary");
});
test("old inline recovery imports losslessly and becomes detached without altering the current record", () => {
  const first = saveRecord(root, input("old"));
  const next = { ...first.record, content: "current" };
  const recoveryId = crypto.randomUUID();
  atomicWriteFile(ledgerPath(root), encodeLedger({ version: 1, imports: [], records: [next], history: [{ recoveryId, before: first.record, afterHash: recordHash(next), restored: false }] }).replace(/<!-- memory-header \d+ -->\n/, "\n"));
  const current = saveRecord(root, { ...input("newer"), id: next.id, expectedHash: recordHash(next) });
  expect(readLedger(root).history).toEqual([]);
  expect(readRecoveries(root)).toHaveLength(2);
  expect(readRecoveries(root).some(entry => entry.recoveryId === recoveryId && entry.before.content === "old")).toBe(true);
  expect(() => restoreRecord(root, recoveryId)).toThrow("newer change");
  expect(readLedger(root).records[0].content).toBe("newer");
  expect(current.recoveryId).toBeDefined();
});


test("duplicate saves preserve significant literal whitespace and ID replacements", () => {
  const first = saveRecord(root, input('Golden payload is `"a  b"`.'));
  const distinct = saveRecord(root, input('Golden payload is `"a b"`.'));
  expect(distinct.unchanged).toBe(false);
  expect(readLedger(root).records.map(record => record.content)).toEqual(['Golden payload is `"a  b"`.', 'Golden payload is `"a b"`.']);
  const fenced = saveRecord(root, input("```python\n    literal = 'a  b'\n```"));
  const replacement = saveRecord(root, { ...input("```python\n    literal = 'a b'\n```"), evidence: fenced.record.evidence,
    id: fenced.record.id, expectedHash: fenced.hash });
  expect(replacement.unchanged).toBe(false);
  expect(replacement.record.content).toContain("'a b'");
  expect(saveRecord(root, { ...input(replacement.record.content), evidence: replacement.record.evidence,
    id: replacement.record.id, expectedHash: replacement.hash }).unchanged).toBe(true);
});
test("invalid UTF-8 active and recovery bytes fail explicitly without being rewritten", () => {
  const first = saveRecord(root, input("unique-ascii-body"));
  const file = ledgerPath(root), valid = fs.readFileSync(file), invalid = Buffer.from(valid);
  invalid[invalid.lastIndexOf(Buffer.from("unique-ascii-body"))] = 0xff;
  fs.writeFileSync(file, invalid);
  expect(() => readLedger(root)).toThrow("UTF-8");
  expect(() => saveRecord(root, input("unrelated save"))).toThrow("UTF-8");
  expect(fs.readFileSync(file)).toEqual(invalid);
  fs.writeFileSync(file, valid);
  const next = saveRecord(root, { ...input("next"), id: first.record.id, expectedHash: first.hash });
  const recoveryDir = path.join(root, "recovery", "ledger-v1"), recovery = path.join(recoveryDir, fs.readdirSync(recoveryDir)[0]);
  const broken = fs.readFileSync(recovery); broken[broken.lastIndexOf(Buffer.from("unique-ascii-body"))] = 0xff;
  fs.writeFileSync(recovery, broken);
  const active = fs.readFileSync(file);
  expect(() => readRecoveries(root)).toThrow("UTF-8");
  expect(() => restoreRecord(root, next.recoveryId!)).toThrow("UTF-8");
  expect(fs.readFileSync(file)).toEqual(active); expect(fs.readFileSync(recovery)).toEqual(broken);
});
