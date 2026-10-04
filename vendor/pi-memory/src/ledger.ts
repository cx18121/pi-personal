import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertSafePath, atomicWriteFile, readText, withFileLock } from "./core.js";
import { isMetadataLine } from "./format.js";
import { searchSources } from "./search.js";

export { assertSafePath } from "./core.js";

export const LEDGER_NAME = "MEMORY.ledger.md";
const MAGIC = "# Pi memory ledger v1\n";
const SEPARATOR = "\n<!-- memory-data -->\n";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
export type MemoryKind = "preference" | "decision" | "fact" | "legacy";
export interface SourceCitation {
  sessionId: string;
  file?: string;
  entryId: string;
  anchorId: string;
  fromEntryId?: string;
  hash: string;
}
export interface Evidence {
  actor: "user" | "tool" | "legacy";
  reference: string;
  quote: string;
  observedAt: string;
  source?: SourceCitation;
}
export interface MemoryRecord {
  id: string;
  revision: string;
  topic: string;
  route: string;
  kind: MemoryKind;
  content: string;
  always: boolean;
  evidence: Evidence;
  updatedAt: string;
  expiresAt?: string;
}
export interface BeforeImage {
  recoveryId: string;
  before: MemoryRecord;
  afterHash: string | null;
  restored: boolean;
  reason?: string;
}
export interface Ledger {
  version: 1;
  records: MemoryRecord[];
  history: BeforeImage[];
  imports: Array<{ path: string; hash: string; bytes: number }>;
}
const empty = (): Ledger => ({ version: 1, records: [], history: [], imports: [] });
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export const recordHash = (record: MemoryRecord) => digest(JSON.stringify({
  id: record.id, revision: record.revision, topic: record.topic, route: record.route, kind: record.kind, content: record.content,
  always: record.always, evidence: { actor: record.evidence.actor, reference: record.evidence.reference,
    quote: record.evidence.quote, observedAt: record.evidence.observedAt,
    ...(record.evidence.source ? { source: record.evidence.source } : {}) },
  updatedAt: record.updatedAt, expiresAt: record.expiresAt,
}));
export const ledgerPath = (dir: string) => path.join(dir, LEDGER_NAME);
function importedId(reference: string) {
  const hash = digest(reference);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);


function validateRecord(value: unknown): asserts value is MemoryRecord {
  if (!plain(value) || typeof value.id !== "string" || !ID.test(value.id) || typeof value.revision !== "string" || !ID.test(value.revision)
    || typeof value.topic !== "string" || !value.topic.trim() || /[\r\n]/.test(value.topic)
    || typeof value.route !== "string" || !value.route.trim() || /[\r\n]/.test(value.route)
    || typeof value.kind !== "string" || !["preference", "decision", "fact", "legacy"].includes(value.kind)
    || typeof value.content !== "string" || !value.content.length || (!value.content.trim() && value.kind !== "legacy")
    || typeof value.always !== "boolean" || !date(value.updatedAt)
    || (value.expiresAt !== undefined && !date(value.expiresAt))
    || !plain(value.evidence) || typeof value.evidence.actor !== "string" || !["user", "tool", "legacy"].includes(value.evidence.actor)
    || typeof value.evidence.reference !== "string" || !value.evidence.reference
    || typeof value.evidence.quote !== "string" || !value.evidence.quote
    || !date(value.evidence.observedAt)) throw new Error("Invalid memory record.");
  if (value.evidence.source !== undefined) {
    const source = value.evidence.source;
    if (!plain(source) || ![source.sessionId, source.entryId, source.anchorId].every(item => typeof item === "string" && item.length > 0)
      || typeof source.hash !== "string" || !HASH.test(source.hash)
      || (source.file !== undefined && (typeof source.file !== "string" || !path.isAbsolute(source.file)))
      || (source.fromEntryId !== undefined && (typeof source.fromEntryId !== "string" || !source.fromEntryId))) throw new Error("Invalid source citation.");
  }
  if (value.always && (value.kind !== "preference" || value.evidence.actor !== "user")) {
    throw new Error("Always-present defaults require an explicit user preference.");
  }
}

export function currentRecords(ledger: Ledger, now = Date.now()) {
  return ledger.records.filter((record) => !record.expiresAt || Date.parse(record.expiresAt) > now);
}

export function routingIndex(ledger: Ledger, now = Date.now()) {
  const records = currentRecords(ledger, now);
  const defaults = records.filter((record) => record.always).map((record) => `- ${record.content}`).join("\n");
  const topics = new Map<string, number>();
  for (const record of records.filter(record => !record.always)) topics.set(record.topic, (topics.get(record.topic) ?? 0) + 1);
  const rows = [...topics].sort(([left], [right]) => left.localeCompare(right)).map(([topic, count]) => `- ${JSON.stringify(topic)} (${count} record${count === 1 ? "" : "s"})`);
  return [defaults && `## Standing preferences\n${defaults}`, rows.length && `## Topics\n${rows.join("\n")}\nUse a task-specific memory_search query for recall. Exact topic names can be browsed with memory_read when search is insufficient.`].filter(Boolean).join("\n\n");
}

function json(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

export function encodeLedger(ledger: Ledger) {
  const seen = new Set<string>();
  for (const record of ledger.records) {
    validateRecord(record);
    if (seen.has(record.id)) throw new Error("Duplicate active memory ID.");
    seen.add(record.id);
  }
  if (new Set(ledger.history.map(entry => entry.recoveryId)).size !== ledger.history.length) throw new Error("Duplicate recovery ID.");
  const header = routingIndex(ledger);
  const entries = [
    ...ledger.records.map((record) => ({ record, recovery: null as Omit<BeforeImage, "before"> | null })),
    ...ledger.history.map(({ before: record, ...recovery }) => ({ record, recovery })),
  ].map(({ record, recovery }) => {
    validateRecord(record);
    const { content, ...metadata } = record;
    return `<!-- memory-record ${json({ ...metadata, length: content.length, recovery })} -->\n${content}\n`;
  }).join("");
  return `${MAGIC}<!-- memory-header ${header.length} -->\n${header}${SEPARATOR}<!-- memory-control ${json({ version: 1, imports: ledger.imports })} -->\n${entries}`;
}

export function decodeLedger(text: string): Ledger {
  if (!text.startsWith(MAGIC)) throw new Error("Invalid memory ledger.");
  const headerEnd = text.indexOf("\n", MAGIC.length);
  const header = text.slice(MAGIC.length, headerEnd).match(/^<!-- memory-header (\d+) -->$/);
  const length = header ? Number(header[1]) : undefined;
  if (length !== undefined && (!Number.isSafeInteger(length) || length < 0)) throw new Error("Invalid memory header length.");
  const boundary = length === undefined ? text.indexOf(SEPARATOR) : headerEnd + 1 + length;
  if (boundary < 0 || !text.startsWith(SEPARATOR, boundary)) throw new Error("Memory ledger data boundary is missing or changed.");
  let cursor = boundary + SEPARATOR.length;
  const controlEnd = text.indexOf("\n", cursor);
  const controlLine = text.slice(cursor, controlEnd);
  const controlMatch = controlLine.match(/^<!-- memory-control (.+) -->$/);
  if (!controlMatch) throw new Error("Invalid memory control record.");
  const control: unknown = JSON.parse(controlMatch[1]);
  if (!plain(control) || control.version !== 1 || !Array.isArray(control.imports)
    || control.imports.some((item) => !plain(item) || typeof item.path !== "string" || typeof item.hash !== "string" || !HASH.test(item.hash)
      || !Number.isSafeInteger(item.bytes) || Number(item.bytes) < 0)) throw new Error("Invalid import manifest.");
  const ledger: Ledger = { ...empty(), imports: control.imports as Ledger["imports"] };
  cursor = controlEnd + 1;
  while (cursor < text.length) {
    const end = text.indexOf("\n", cursor);
    const match = text.slice(cursor, end).match(/^<!-- memory-record (.+) -->$/);
    if (!match) throw new Error("Invalid memory entry boundary.");
    const metadata = JSON.parse(match[1]);
    const { length, recovery, ...fields } = metadata;
    if (!Number.isSafeInteger(length) || length <= 0 || end < cursor || end + 1 + length >= text.length) throw new Error("Invalid memory entry length.");
    const content = text.slice(end + 1, end + 1 + length);
    cursor = end + 1 + length;
    if (text[cursor++] !== "\n") throw new Error("Truncated memory entry.");
    const record = { ...fields, content };
    validateRecord(record);
    if (recovery === null) ledger.records.push(record);
    else {
      if (!plain(recovery) || typeof recovery.recoveryId !== "string" || !ID.test(recovery.recoveryId)
        || (recovery.afterHash !== null && (typeof recovery.afterHash !== "string" || !HASH.test(recovery.afterHash)))
        || typeof recovery.restored !== "boolean" || (recovery.reason !== undefined && typeof recovery.reason !== "string")) throw new Error("Invalid recovery entry.");
      ledger.history.push({ ...recovery, before: record } as BeforeImage);
    }
  }
  if (new Set(ledger.records.map((record) => record.id)).size !== ledger.records.length
    || new Set(ledger.history.map((entry) => entry.recoveryId)).size !== ledger.history.length) throw new Error("Duplicate memory ID.");
  routingIndex(ledger);
  return ledger;
}

export function legacyFiles(dir: string) {
  assertSafePath(dir);
  const files = [path.join(dir, "MEMORY.md")];
  const topicsDir = path.join(dir, "topics");
  assertSafePath(topicsDir);
  if (fs.existsSync(topicsDir)) files.push(...fs.readdirSync(topicsDir).filter((name) => name.endsWith(".md")).sort().map((name) => path.join(topicsDir, name)));
  return files.filter((file) => { assertSafePath(file); return fs.existsSync(file) && fs.statSync(file).size > 0; });
}

export function readLedger(dir: string): Ledger {
  const file = ledgerPath(dir);
  assertSafePath(file);
  const text = readText(file);
  if (text) return decodeLedger(text);
  if (fs.existsSync(file)) throw new Error("Memory ledger is empty or corrupt; refusing to replace it.");
  if (legacyFiles(dir).length) throw new Error("Legacy memory awaits explicit migration. Run /memory-migrate to preview, then /memory-migrate apply.");
  return empty();
}

const recoveryDir = (dir: string) => path.join(dir, "recovery", "ledger-v1");
const recoveryName = (entry: BeforeImage, imported = false) => `${entry.before.id}.${entry.recoveryId}${imported ? ".imported" : ""}.md`;
const ownedRecovery = new RegExp(`^(${ID.source.slice(1, -1)})\\.(${ID.source.slice(1, -1)})(\\.imported)?\\.md$`);

/** Detached recovery is never part of recall or active-write admission. */
export function readRecoveries(dir: string): BeforeImage[] {
  const location = recoveryDir(dir);
  assertSafePath(location);
  const result = readLedger(dir).history;
  if (!fs.existsSync(location)) return result;
  for (const name of fs.readdirSync(location).sort()) {
    if (!ownedRecovery.test(name)) continue;
    const file = path.join(location, name);
    assertSafePath(file);
    const ledger = decodeLedger(readText(file));
    if (ledger.records.length || ledger.history.length !== 1 || recoveryName(ledger.history[0], name.endsWith(".imported.md")) !== name) {
      throw new Error("Invalid owned recovery file.");
    }
    result.push(ledger.history[0]);
  }
  const unique = new Map<string, BeforeImage>();
  for (const entry of result) {
    const previous = unique.get(entry.recoveryId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) throw new Error("Conflicting recovery copies.");
    unique.set(entry.recoveryId, entry);
  }
  return [...unique.values()];
}

function transaction<T>(dir: string, mutate: (ledger: Ledger) => T, recover = false): T {
  const file = ledgerPath(dir);
  assertSafePath(file);
  return withFileLock(file, () => {
    const ledger = readLedger(dir);
    const original = encodeLedger(ledger);
    const inline = new Set(ledger.history.map(entry => entry.recoveryId));
    if (recover) ledger.history = readRecoveries(dir);
    const imported = new Set(ledger.history.filter(entry => inline.has(entry.recoveryId)
      || fs.existsSync(path.join(recoveryDir(dir), recoveryName(entry, true)))).map(entry => entry.recoveryId));
    const prior = new Map(ledger.history.map(entry => [entry.recoveryId, JSON.stringify(entry)]));
    const result = mutate(ledger);
    // Validate the entire new state before any persistence.
    encodeLedger(ledger);
    const changed = ledger.history.filter(entry => prior.get(entry.recoveryId) !== JSON.stringify(entry));
    const detached = [...ledger.history];
    ledger.history = [];
    const encoded = encodeLedger(ledger);
    if (encoded === original && !changed.length && !inline.size) return result;
    // Before-images must reach durable storage before the active replacement.
    const persist = (entry: BeforeImage) => atomicWriteFile(path.join(recoveryDir(dir), recoveryName(entry, imported.has(entry.recoveryId))), encodeLedger({ ...empty(), history: [entry] }));
    for (const entry of detached.filter(entry => inline.has(entry.recoveryId))) persist(JSON.parse(prior.get(entry.recoveryId)!));
    for (const entry of changed.filter(entry => !entry.restored && !inline.has(entry.recoveryId))) persist(entry);
    atomicWriteFile(file, encoded);
    // Completion receipts are written after commit, never before it.
    for (const entry of changed.filter(entry => entry.restored)) persist(entry);
    // Only the latest newly-owned transition per changed record is promised.
    // Imported recovery is never pruned. An interrupted pre-commit transition is
    // inert: restore still compares its afterHash with the active record.
    for (const entry of changed.filter(item => !item.restored)) {
      for (const name of fs.readdirSync(recoveryDir(dir))) {
        if (ownedRecovery.test(name) && name.startsWith(`${entry.before.id}.`) && !name.endsWith(".imported.md") && name !== recoveryName(entry)) {
          const stale = path.join(recoveryDir(dir), name);
          assertSafePath(stale);
          fs.unlinkSync(stale);
        }
      }
    }
    return result;
  });
}

export function saveRecord(dir: string, input: Omit<MemoryRecord, "id" | "revision" | "updatedAt"> & { id?: string; expectedHash?: string }) {
  return transaction(dir, (ledger) => {
    const { id, expectedHash, ...fields } = input;
    const previous = id ? ledger.records.find((record) => record.id === id) : undefined;
    if (id && (!previous || recordHash(previous) !== expectedHash)) throw new Error("Memory changed since it was read. Read it again before replacing.");
    if (!id && expectedHash) throw new Error("expectedHash requires an existing ID.");
    const duplicate = ledger.records.find((record) => record.content === input.content
      && record.topic === input.topic && record.always === input.always && record.kind === input.kind && record.expiresAt === input.expiresAt
      && record.route === input.route && (id ? JSON.stringify(record.evidence) === JSON.stringify(input.evidence) : true));
    if (duplicate && (!id || duplicate.id === id)) return { record: duplicate, hash: recordHash(duplicate), unchanged: true };
    if (duplicate) throw new Error("Replacement duplicates a different record; archive the redundant record instead.");
    const record: MemoryRecord = { ...fields, id: id ?? randomUUID(), revision: randomUUID(), updatedAt: new Date().toISOString() };
    validateRecord(record);
    let recoveryId: string | undefined;
    if (previous) {
      recoveryId = randomUUID();
      ledger.history.push({ recoveryId, before: previous, afterHash: recordHash(record), restored: false });
      ledger.records[ledger.records.indexOf(previous)] = record;
    } else ledger.records.push(record);
    return { record, hash: recordHash(record), unchanged: false, recoveryId };
  });
}

export function archiveRecord(dir: string, id: string, expectedHash: string, reason = "Explicit removal") {
  if (!reason.trim()) throw new Error("Removal reason must be nonempty.");
  return transaction(dir, (ledger) => {
    const record = ledger.records.find((item) => item.id === id);
    if (!record || recordHash(record) !== expectedHash) throw new Error("Memory changed since it was read. Read it again before removing.");
    const recoveryId = randomUUID();
    ledger.history.push({ recoveryId, before: record, afterHash: null, restored: false, reason });
    ledger.records = ledger.records.filter((item) => item.id !== id);
    return { recoveryId };
  });
}

export function restoreRecord(dir: string, recoveryId: string) {
  return transaction(dir, (ledger) => {
    const entry = ledger.history.find((item) => item.recoveryId === recoveryId);
    if (!entry) throw new Error("Recovery not found or superseded by a newer transition. Pre-migration recovery remains preserved separately.");
    if (entry.restored) return { unchanged: true };
    const active = ledger.records.find((item) => item.id === entry.before.id);
    if ((active ? recordHash(active) : null) !== entry.afterHash) throw new Error("Recovery would overwrite a newer change. Resolve the conflict explicitly.");
    const restored = { ...entry.before, revision: randomUUID(), updatedAt: new Date().toISOString() };
    ledger.records = ledger.records.filter((item) => item.id !== entry.before.id);
    ledger.records.push(restored);
    entry.restored = true;
    return { unchanged: false };
  }, true);
}

function legacySegments(text: string) {
  const boundaries = [0];
  let offset = 0;
  let fence: { marker: string; length: number } | undefined;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const marker = line.replace(/\r?\n$/, "").match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    } else if (!fence && offset > 0 && isMetadataLine(line.replace(/\r?\n$/, ""))) boundaries.push(offset);
    offset += line.length;
  }
  return boundaries.map((start, index) => ({ start, content: text.slice(start, boundaries[index + 1] ?? text.length) }));
}

export function migrateLedger(dir: string, apply = false) {
  const file = ledgerPath(dir);
  assertSafePath(file);
  const build = () => {
    if (fs.existsSync(file)) return { ledger: readLedger(dir), alreadyMigrated: true };
    const ledger = empty();
    for (const source of legacyFiles(dir)) {
      const raw = fs.readFileSync(source);
      const text = raw.toString("utf8");
      const fileUpdatedAt = fs.statSync(source).mtime.toISOString();
      if (!Buffer.from(text).equals(raw)) throw new Error(`Legacy file is not valid UTF-8: ${source}`);
      const relative = path.relative(dir, source);
      const hash = digest(text);
      ledger.imports.push({ path: relative, hash, bytes: raw.length });
      const segments = legacySegments(text);
      for (const { start, content } of segments) {
        const topic = relative === "MEMORY.md" ? "legacy-index" : path.basename(source, ".md");
        const firstLine = content.split(/\r?\n/, 1)[0];
        const updatedAt = isMetadataLine(firstLine) ? firstLine.trim().split(" ")[2] : fileUpdatedAt;
        const route = content.split(/\r?\n/).find((line) => line.trim() && !isMetadataLine(line))?.trim() ?? "Imported memory";
        ledger.records.push({ id: importedId(`${relative}#${hash}@${start}`), revision: importedId(`revision:${relative}#${hash}@${start}`), topic, route, content,
          kind: "legacy", always: false, updatedAt,
          evidence: { actor: "legacy", reference: `${relative}#${hash}@${start}`, quote: content, observedAt: new Date().toISOString() } });
      }
      if (segments.map((segment) => segment.content).join("") !== text) throw new Error("Lossless import failed.");
    }
    encodeLedger(ledger);
    return { ledger, alreadyMigrated: false };
  };
  if (!apply) return build();
  return withFileLock(file, () => {
    const result = build();
    if (!result.alreadyMigrated) atomicWriteFile(file, encodeLedger(result.ledger));
    return result;
  });
}

export function recordCue(record: MemoryRecord) {
  return { id: record.id, hash: recordHash(record), topic: record.topic, route: record.route, kind: record.kind };
}
export function lookupRecords(scopes: Array<{ scope: "global" | "project"; dir: string }>, query: string, limit?: number) {
  return lookupLedgers(scopes.map(({ scope, dir }) => ({ scope, ledger: readLedger(dir) })), query, limit);
}
export function lookupLedgers(scopes: Array<{ scope: "global" | "project"; ledger: Ledger }>, query: string, limit?: number) {
  const records = scopes.flatMap(({ scope, ledger }) => currentRecords(ledger).map((record) => ({ scope, record })));
  const sources = records.map(({ scope, record }) => ({ unit: "record" as const, path: `${scope}/${record.id}`, content: `${record.topic} ${record.route}\n${record.content}` }));
  const byPath = new Map(records.map(found => [`${found.scope}/${found.record.id}`, found]));
  return searchSources(sources, query, limit).map(hit => {
    const found = byPath.get(hit.path)!;
    return { scope: found.scope, ...recordCue(found.record), score: hit.score, matchingWords: hit.matchingWords, exactPhrase: hit.exactPhrase };
  });
}
