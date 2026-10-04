import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { isMetadataLine, metadataLine } from "./format.js";

const LOCK_WAIT_MS = 1_500;
const LOCK_RETRY_MS = 25;
const LOCK_STALE_MS = 30_000;
const CHECKBOX_REGEX = /^- \[([ xX])\] (.+)$/;
const PROJECT_ID_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,63})-[0-9a-f]{10}$/;
const PROJECT_ID_CONFIG_KEY = "pi.memory-id";

export type MemoryScope = "global" | "project";
export type AgentRole = "root" | "subagent";
export type ChecklistAction = "add" | "done" | "undo" | "clear_done" | "list";

export type MemoryEnvironment = NodeJS.ProcessEnv;

export interface ProjectIdentity {
  commonRoot: string;
  name: string;
  hash: string;
  id: string;
}

export interface MemoryLocations {
  baseDir: string;
  globalDir: string;
  project: ProjectIdentity | null;
  projectDir: string | null;
}

export interface ChecklistItem {
  done: boolean;
  text: string;
}

function sleepSync(milliseconds: number) {
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(waitBuffer, 0, 0, milliseconds);
}

function realpathIfPossible(filePath: string) {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

export function resolveMemoryDir(env: MemoryEnvironment = process.env) {
  if (env.PI_MEMORY_DIR?.trim()) return path.resolve(env.PI_MEMORY_DIR);
  const home = env.HOME
    ?? env.USERPROFILE
    ?? (env.HOMEDRIVE && env.HOMEPATH ? `${env.HOMEDRIVE}${env.HOMEPATH}` : undefined);
  if (!home) throw new Error("Cannot resolve memory directory because no home directory is configured.");
  return path.join(home, ".pi", "agent", "memory");
}

export function resolveAgentRole(
  env: MemoryEnvironment = process.env,
  currentSessionId?: string,
): AgentRole {
  const forced = env.PI_MEMORY_SUBAGENT_MODE?.trim().toLowerCase();
  if (forced === "root" || forced === "subagent") return forced;
  if (env.PI_SUBAGENT_CHILD?.trim() === "1") return "subagent";
  const parent = env.PI_SUBAGENT_PARENT_SESSION?.trim();
  const session = currentSessionId?.trim() ?? env.PI_SESSION_ID?.trim();
  return parent && parent !== session ? "subagent" : "root";
}

export function autoCaptureEnabled(env: MemoryEnvironment = process.env) {
  const value = env.PI_MEMORY_AUTO_CAPTURE?.trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(value ?? "");
}

export function sanitizeProjectName(name: string) {
  const sanitized = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return sanitized || "project";
}

function gitCommonDir(cwd: string) {
  try {
    const commonGitDir = execFileSync(
      "git",
      ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return commonGitDir ? realpathIfPossible(commonGitDir) : null;
  } catch {
    return null;
  }
}

class InvalidProjectIdentityError extends Error {}
function readConfiguredProjectId(cwd: string) {
  try {
    const values = execFileSync(
      "git",
      ["-C", cwd, "config", "--local", "--get-all", PROJECT_ID_CONFIG_KEY],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim().split("\n").filter(Boolean);
    if (values.length !== 1 || !PROJECT_ID_REGEX.test(values[0])) {
      throw new InvalidProjectIdentityError(
        `Git config ${PROJECT_ID_CONFIG_KEY} must contain one valid project ID.`,
      );
    }
    return values[0];
  } catch (error) {
    if ((error as { status?: number }).status === 1) return null;
    throw error;
  }
}

export function legacyProjectId(commonRoot: string) {
  const canonicalRoot = realpathIfPossible(commonRoot);
  const name = sanitizeProjectName(path.basename(canonicalRoot));
  const hash = createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 10);
  return `${name}-${hash}`;
}

export function resolveProjectIdentity(cwd: string): ProjectIdentity | null {
  const commonGitDir = gitCommonDir(cwd);
  if (!commonGitDir) return null;
  const commonRoot = commonGitDir.endsWith(`${path.sep}.git`)
    ? path.dirname(commonGitDir)
    : commonGitDir;
  const canonicalRoot = realpathIfPossible(commonRoot);
  const id = readConfiguredProjectId(cwd) ?? legacyProjectId(canonicalRoot);
  const hash = id.slice(-10);
  const name = id.slice(0, -11);
  return { commonRoot: canonicalRoot, name, hash, id };
}

function existingProjectDir(baseDir: string, project: ProjectIdentity) {
  const projectDir = path.join(baseDir, "projects", project.id);
  const legacyDir = path.join(baseDir, "projects", legacyProjectId(project.commonRoot));
  if (legacyDir === projectDir || !fs.existsSync(legacyDir)) return projectDir;
  if (fs.existsSync(projectDir)) {
    throw new Error(
      `Both stable and legacy project memory exist; refusing to hide or merge data: ${projectDir}, ${legacyDir}`,
    );
  }
  return legacyDir;
}

export function resolveLocations(
  cwd: string,
  env: MemoryEnvironment = process.env,
): MemoryLocations {
  const baseDir = resolveMemoryDir(env);
  const project = resolveProjectIdentity(cwd);
  return {
    baseDir,
    globalDir: path.join(baseDir, "global"),
    project,
    projectDir: project ? existingProjectDir(baseDir, project) : null,
  };
}

export function resolveScope(
  locations: MemoryLocations,
  requested?: MemoryScope,
): { scope: MemoryScope; dir: string } {
  const scope = requested ?? (locations.projectDir ? "project" : "global");
  if (scope === "project" && !locations.projectDir) {
    throw new Error("Project memory is unavailable outside a Git repository.");
  }
  return { scope, dir: scope === "project" ? locations.projectDir! : locations.globalDir };
}

export function assertSafePath(filePath: string) {
  let current = path.resolve(filePath);
  while (true) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) {
        const systemAlias = process.platform === "darwin" && ["/var", "/tmp", "/etc"].includes(current)
          && fs.realpathSync(current) === `/private${current}`;
        if (!systemAlias) throw new Error(`Memory path contains a symlink: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function ensurePrivateDir(dir: string) {
  assertSafePath(dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

function isPidAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

interface LockOwner {
  pid: number;
  token: string;
}

function readLockOwner(lockDir: string): LockOwner | null {
  assertSafePath(path.join(lockDir, "owner.json"));
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8")) as Partial<LockOwner>;
    if (
      !Number.isInteger(owner.pid) ||
      (owner.pid ?? 0) <= 0 ||
      typeof owner.token !== "string" ||
      !owner.token
    ) {
      return null;
    }
    return owner as LockOwner;
  } catch {
    return null;
  }
}

function staleLockToken(lockDir: string): string | null | undefined {
  const owner = readLockOwner(lockDir);
  if (owner) return isPidAlive(owner.pid) ? undefined : owner.token;
  try {
    return Date.now() - fs.statSync(lockDir).mtimeMs > LOCK_STALE_MS ? null : undefined;
  } catch {
    return undefined;
  }
}

function removeLockIfTokenMatches(lockDir: string, expectedToken: string | null) {
  const currentToken = readLockOwner(lockDir)?.token ?? null;
  if (currentToken !== expectedToken) return false;
  const quarantineDir = `${lockDir}.remove-${randomUUID()}`;
  try {
    fs.renameSync(lockDir, quarantineDir);
  } catch {
    return false;
  }
  fs.rmSync(quarantineDir, { recursive: true, force: true });
  return true;
}

function tryAcquireLock(lockDir: string, owner: LockOwner) {
  const candidateDir = `${lockDir}.candidate-${owner.token}`;
  fs.mkdirSync(candidateDir, { mode: 0o700 });
  fs.writeFileSync(path.join(candidateDir, "owner.json"), `${JSON.stringify(owner)}\n`, { mode: 0o600 });
  try {
    fs.renameSync(candidateDir, lockDir);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
    return false;
  } finally {
    fs.rmSync(candidateDir, { recursive: true, force: true });
  }
}

function gateParticipants(queueDir: string, ownTicket: string) {
  const participants: string[] = [];
  for (const name of fs.readdirSync(queueDir)) {
    if (name === ownTicket) continue;
    const pid = Number(name.split("-", 1)[0]);
    const participant = path.join(queueDir, name);
    assertSafePath(participant);
    if (Number.isInteger(pid) && pid > 0) {
      if (isPidAlive(pid)) participants.push(name);
      else fs.rmSync(participant, { recursive: true, force: true });
      continue;
    }
    try {
      if (Date.now() - fs.statSync(participant).mtimeMs > LOCK_STALE_MS) {
        fs.rmSync(participant, { recursive: true, force: true });
      } else {
        participants.push(name);
      }
    } catch {
      // The participant was removed concurrently.
    }
  }
  return participants;
}

function gateNumber(queueDir: string, ticket: string) {
  assertSafePath(path.join(queueDir, ticket, "number"));
  try {
    const number = Number(fs.readFileSync(path.join(queueDir, ticket, "number"), "utf8"));
    return Number.isSafeInteger(number) && number > 0 ? number : null;
  } catch {
    return null;
  }
}

function withLockGate<T>(lockDir: string, deadline: number, retryMs: number, operation: () => T) {
  const queueDir = `${lockDir}.queue`;
  ensurePrivateDir(queueDir);
  const ticket = `${process.pid}-${randomUUID()}`;
  const ticketDir = path.join(queueDir, ticket);
  fs.mkdirSync(ticketDir, { mode: 0o700 });

  try {
    const previousNumbers = gateParticipants(queueDir, ticket)
      .map((name) => gateNumber(queueDir, name))
      .filter((number): number is number => number !== null);
    const number = Math.max(0, ...previousNumbers) + 1;
    fs.writeFileSync(path.join(ticketDir, "number"), `${number}\n`, { flag: "wx", mode: 0o600 });

    while (true) {
      const waiting = gateParticipants(queueDir, ticket).some((name) => {
        const otherNumber = gateNumber(queueDir, name);
        return otherNumber === null
          || otherNumber < number
          || (otherNumber === number && name.localeCompare(ticket) < 0);
      });
      if (!waiting) return operation();
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for memory lock gate: ${lockDir}`);
      sleepSync(retryMs);
    }
  } finally {
    fs.rmSync(ticketDir, { recursive: true, force: true });
  }
}

export function withFileLock<T>(
  filePath: string,
  operation: () => T,
  options: { waitMs?: number; retryMs?: number } = {},
): T {
  assertSafePath(filePath);
  assertSafePath(`${filePath}.lock`);
  ensurePrivateDir(path.dirname(filePath));
  const lockDir = `${filePath}.lock`;
  const owner: LockOwner = { pid: process.pid, token: randomUUID() };
  const retryMs = options.retryMs ?? LOCK_RETRY_MS;
  const waitMs = options.waitMs ?? LOCK_WAIT_MS;
  const deadline = Date.now() + waitMs;
  while (true) {
    const acquired = withLockGate(lockDir, deadline, retryMs, () => {
      if (tryAcquireLock(lockDir, owner)) return true;
      const staleToken = staleLockToken(lockDir);
      if (staleToken !== undefined) removeLockIfTokenMatches(lockDir, staleToken);
      return false;
    });
    if (acquired) break;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for memory lock: ${filePath}`);
    sleepSync(retryMs);
  }

  try {
    return operation();
  } finally {
    withLockGate(lockDir, Date.now() + waitMs, retryMs, () => removeLockIfTokenMatches(lockDir, owner.token));
  }
}

export function atomicWriteFile(filePath: string, content: string) {
  assertSafePath(filePath);
  ensurePrivateDir(path.dirname(filePath));
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    const fd = fs.openSync(tempPath, "wx", 0o600);
    try { fs.writeFileSync(fd, content, "utf8"); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(tempPath, filePath);
    // The private temporary inode retains its permissions across rename.
    const directory = fs.openSync(path.dirname(filePath), "r");
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export function readText(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath);
    const text = raw.toString("utf8");
    if (!Buffer.from(text).equals(raw)) throw new Error(`Memory file is not valid UTF-8: ${filePath}`);
    return text;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export function mutateText(
  filePath: string,
  mutate: (existing: string) => string,
  lockOptions?: { waitMs?: number; retryMs?: number },
) {
  return withFileLock(
    filePath,
    () => {
      const next = mutate(readText(filePath));
      atomicWriteFile(filePath, next);
      return next;
    },
    lockOptions,
  );
}

export function scratchpadFilePath(dir: string) {
  return path.join(dir, "SCRATCHPAD.md");
}

export function normalizeForDuplicate(value: string, preserveCase = false) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return preserveCase ? normalized : normalized.toLocaleLowerCase();
}

export function parseChecklist(content: string): ChecklistItem[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.match(CHECKBOX_REGEX))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ done: match[1].toLowerCase() === "x", text: match[2] }));
}

function appendChecklistItem(content: string, text: string, sessionId: string | undefined) {
  const heading = content.trim() ? content.trimEnd() : "# Scratchpad";
  return `${heading}\n${metadataLine(sessionId)}\n- [ ] ${text.trim()}\n`;
}

function matchingChecklistIndex(
  lines: string[],
  needle: string,
  eligible: (match: RegExpMatchArray) => boolean,
  label: string,
) {
  const wanted = normalizeForDuplicate(needle);
  const candidates = lines.flatMap((line, index) => {
    const match = line.match(CHECKBOX_REGEX);
    return match && eligible(match) ? [{ index, text: normalizeForDuplicate(match[2]) }] : [];
  });
  const exact = candidates.filter((candidate) => candidate.text === wanted);
  const matches = exact.length > 0 ? exact : candidates.filter((candidate) => candidate.text.includes(wanted));
  const description = label ? `${label} ` : "";
  if (matches.length === 0) throw new Error(`No matching ${description}item found.`);
  if (matches.length > 1) throw new Error(`Multiple matching ${description}items found. Use the exact unique item text.`);
  return matches[0].index;
}

function toggleChecklist(content: string, needle: string, done: boolean) {
  const lines = content.split("\n");
  const label = done ? "open" : "done";
  const index = matchingChecklistIndex(
    lines,
    needle,
    (match) => (match[1].toLowerCase() === "x") !== done,
    label,
  );
  const match = lines[index].match(CHECKBOX_REGEX)!;
  lines[index] = `- [${done ? "x" : " "}] ${match[2]}`;
  return lines.join("\n");
}

function clearDoneChecklist(content: string) {
  const lines = content.split("\n");
  const output: string[] = [];
  for (const line of lines) {
    const match = line.match(CHECKBOX_REGEX);
    if (match?.[1].toLowerCase() === "x") {
      if (isMetadataLine(output.at(-1) ?? "")) output.pop();
      continue;
    }
    output.push(line);
  }
  return output.join("\n");
}

export function mutateChecklist(options: {
  filePath: string;
  action: ChecklistAction;
  text?: string;
  sessionId?: string;
}) {
  if (options.action === "list") return readText(options.filePath);
  if (options.action === "add") {
    if (!options.text?.trim()) throw new Error("Text is required for add.");
    return mutateText(options.filePath, (existing) =>
      appendChecklistItem(existing, options.text!, options.sessionId),
    );
  }
  if (options.action === "clear_done") {
    return mutateText(options.filePath, clearDoneChecklist);
  }
  if (!options.text?.trim()) throw new Error(`Text is required for ${options.action}.`);
  return mutateText(options.filePath, (existing) =>
    toggleChecklist(existing, options.text!, options.action === "done"),
  );
}

export function assertScratchpadPermission(role: AgentRole, action: ChecklistAction) {
  if (role === "subagent" && action !== "list") {
    throw new Error("Subagents may read scratchpads but cannot mutate them.");
  }
}

export function assertMemoryMutationPermission(role: AgentRole) {
  if (role === "subagent") throw new Error("Subagents cannot mutate durable memory.");
}
