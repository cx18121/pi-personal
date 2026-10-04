import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { assertMemoryMutationPermission, resolveAgentRole, resolveLocations, resolveScope, resolveMemoryDir, type MemoryScope } from "./core.js";
import { SessionEvidence, SOURCE_ENTRY, nestedSupplement } from "./learning.js";
import { readLedger } from "./ledger.js";

export const FOCUS_ENTRY = "memory-focus-v1";
interface Focus { path: string; projectId: string }
export class MemorySession {
  readonly evidence = new SessionEvidence();
  private focus?: Focus;
  private focusError?: string;
  private initializedSession?: string;
  currentInput?: string;

  role(ctx: ExtensionContext) { return resolveAgentRole(process.env, ctx.sessionManager.getSessionId()); }
  private loadFocus(ctx: ExtensionContext) {
    const entry = ctx.sessionManager.getBranch().findLast(item => item.type === "custom" && item.customType === FOCUS_ENTRY);
    const data = entry?.type === "custom" ? entry.data as Partial<Focus> | undefined : undefined;
    if (entry && (!data || typeof data.path !== "string" || !path.isAbsolute(data.path) || typeof data.projectId !== "string")) {
      this.focus = undefined; this.focusError = "Malformed task-memory focus."; throw new Error(this.focusError);
    }
    this.focus = data ? { path: data.path!, projectId: data.projectId! } : undefined; this.focusError = undefined;
  }
  restore(ctx: ExtensionContext) {
    this.currentInput = undefined;
    this.initializedSession = ctx.sessionManager.getSessionId();
    this.loadFocus(ctx);
  }
  ensure(ctx: ExtensionContext) {
    if (this.initializedSession !== ctx.sessionManager.getSessionId()) this.restore(ctx);
  }
  runtime(ctx: ExtensionContext, projectPath?: string) {
    try { this.ensure(ctx); } catch (error) {
      if (!projectPath) throw new Error(`Task memory unavailable: ${String(error)}. Launch memory was not substituted.`);
    }
    // SDK-only reloads without UI bindings need not emit session_start. The
    // native branch, not the lifetime of this registration object, owns focus.
    if (!projectPath) { try { this.loadFocus(ctx); } catch { /* explicit error below */ } }
    const role = this.role(ctx);
    if (projectPath && role !== "root") throw new Error("Explicit project targeting is available only to the root agent.");
    if (!projectPath && this.focusError) throw new Error(`Task memory unavailable: ${this.focusError}. Select memory_focus; launch memory was not substituted.`);
    const target = projectPath ? path.resolve(ctx.cwd, projectPath) : this.focus?.path ?? ctx.cwd;
    const locations = resolveLocations(target);
    if (projectPath && !locations.project) throw new Error("Explicit task path is not inside a Git repository.");
    if (!projectPath && this.focus && (!fs.existsSync(target) || locations.project?.id !== this.focus.projectId)) {
      throw new Error("Saved task focus is unavailable or its project identity changed. Select the actual task repository with memory_focus; launch-project memory was not substituted.");
    }
    return { role, locations, taskPath: target };
  }
  scopes(ctx: ExtensionContext, projectPath?: string) {
    const { locations } = this.runtime(ctx, projectPath);
    return [{ scope: "global" as const, dir: locations.globalDir }, ...(locations.projectDir ? [{ scope: "project" as const, dir: locations.projectDir }] : [])];
  }
  readScopes(ctx: ExtensionContext, projectPath?: string) {
    if (projectPath && this.role(ctx) !== "root") throw new Error("Explicit project targeting is available only to the root agent.");
    const unavailable: Array<{ scope: MemoryScope; reason: string }> = [];
    let available: ReturnType<MemorySession["scopes"]>;
    try { available = this.scopes(ctx, projectPath); }
    catch (error) {
      unavailable.push({ scope: "project", reason: String(error) });
      available = [{ scope: "global", dir: path.join(resolveMemoryDir(), "global") }];
    }
    const stores: Array<(typeof available)[number] & { ledger: ReturnType<typeof readLedger> }> = [];
    for (const entry of available) {
      try { stores.push({ ...entry, ledger: readLedger(entry.dir) }); }
      catch (error) { unavailable.push({ scope: entry.scope, reason: String(error) }); }
    }
    return { stores, unavailable };
  }
  scope(ctx: ExtensionContext, requested?: MemoryScope, projectPath?: string) {
    // Global reads remain usable even when task focus is malformed.
    try { this.ensure(ctx); } catch (error) { if (requested !== "global") throw error; }
    if (requested === "global" && !projectPath) {
      const baseDir = resolveMemoryDir();
      return { role: this.role(ctx), taskPath: this.focus?.path ?? ctx.cwd,
        locations: { baseDir, globalDir: path.join(baseDir, "global"), projectDir: null, project: null },
        scope: "global" as const, dir: path.join(baseDir, "global") };
    }
    const state = this.runtime(ctx, projectPath);
    return { ...state, ...resolveScope(state.locations, requested) };
  }
  select(pi: ExtensionAPI, ctx: ExtensionContext, projectPath: string) {
    assertMemoryMutationPermission(this.role(ctx));
    const state = this.runtime(ctx, projectPath);
    this.focus = { path: state.taskPath, projectId: state.locations.project!.id }; this.focusError = undefined;
    pi.appendEntry(FOCUS_ENTRY, this.focus);
    return state;
  }
  register(pi: ExtensionAPI) {
    const restore = (_event: unknown, ctx: ExtensionContext) => {
      try { this.restore(ctx); } catch (error) { ctx.ui.notify(`Memory session state unavailable: ${String(error)}`, "warning"); }
    };
    pi.on("session_start", restore); pi.on("session_tree", restore);
    pi.on("input", (event, ctx) => {
      try { this.ensure(ctx); } catch { /* input evidence survives unavailable task focus */ }
      this.currentInput = undefined;
      if (event.source === "extension" || this.role(ctx) !== "root") return;
      // This is observed input at our registration position, not a fabricated
      // binding to a future transformed/queued native UserMessage.
      let originProject: string | null = null;
      try { originProject = resolveLocations(ctx.cwd).project?.id ?? null; } catch { /* provenance remains explicitly unknown */ }
      pi.appendEntry(SOURCE_ENTRY, { type: "input", origin: event.source, text: event.text, originProject });
      const entryId = ctx.sessionManager.getLeafId();
      if (entryId) this.currentInput = `${ctx.sessionManager.getSessionId()}:${entryId}`;
    });
    pi.on("tool_result", (event, ctx) => {
      if (this.role(ctx) !== "root") return;
      let originProject: string | null = null;
      try { originProject = resolveLocations(ctx.cwd).project?.id ?? null; } catch { /* unknown origin */ }
      const supplement = nestedSupplement(event, originProject);
      if (supplement) pi.appendEntry(SOURCE_ENTRY, supplement);
    });
  }
}
