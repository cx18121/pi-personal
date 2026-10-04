import { estimateTokens, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";

export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const tokenEstimate = (value: unknown) => estimateTokens({ role: "user", content: typeof value === "string" ? value : JSON.stringify(value), timestamp: 0 });

/** Resource admission, not relevance selection. Never shorten a semantic unit. */
export function responseBudget(ctx: ExtensionContext) {
  const usage = ctx.getContextUsage();
  const window = usage?.contextWindow ?? ctx.model?.contextWindow;
  if (!window) return Infinity;
  const used = usage?.tokens ?? ctx.sessionManager.buildSessionProjection().messages.reduce((sum, message) => sum + estimateTokens(message), 0);
  return Math.max(0, window - used - (ctx.model?.maxTokens ?? 0));
}

export function pageUnits<T>(items: T[], snapshot: string, budget: number, cursor?: string, limit?: number, metadata: Record<string, unknown> = {}, continuation: Record<string, unknown> = {}) {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) throw new Error("Limit must be a positive integer.");
  let offset = 0;
  if (cursor) {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!value || value.snapshot !== snapshot) throw new Error("Results changed. Start a new lookup rather than continuing a stale snapshot.");
    if (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > items.length) throw new Error("Invalid lookup cursor.");
    offset = value.offset;
  }
  const selected: T[] = [];
  const envelope = (next: number) => ({ ...metadata, items: selected, total: items.length, complete: next === items.length,
    nextCursor: next < items.length ? Buffer.from(JSON.stringify({ ...continuation, snapshot, offset: next })).toString("base64url") : null, snapshot });
  const end = Math.min(items.length, offset + (limit ?? items.length));
  selected.push(...items.slice(offset, end));
  if (tokenEstimate(envelope(end)) <= budget) return envelope(end);
  selected.length = 0;
  for (let i = offset; i < end; i++) {
    selected.push(items[i]);
    if (tokenEstimate(envelope(i + 1)) > budget) { selected.pop(); break; }
  }
  if (!selected.length && offset < items.length) throw new Error("A complete result unit does not fit the available model context. Make room or request a smaller structural unit; no content was truncated.");
  const page = envelope(offset + selected.length);
  if (tokenEstimate(page) > budget) throw new Error("Lookup metadata cannot fit the available model context. Make context space; no content was truncated.");
  return page;
}

/** Paragraph/code-fence units preserve exact text and expose an honest incomplete read. */
export function markdownUnits(text: string) {
  const units: string[] = [];
  let current = "", fence: { marker: string; length: number } | undefined;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    current += line;
    const marker = line.replace(/\r?\n$/, "").match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { marker: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
    }
    if (!fence && !line.trim()) { units.push(current); current = ""; }
  }
  if (current) units.push(current);
  return units;
}
