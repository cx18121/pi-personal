import { markdownUnits, tokenEstimate } from "./admission.js";

export interface StructuralUnit {
  key: string;
  pointer: string;
  value?: unknown;
  shape?: { type: "object"; keys: string[] } | { type: "array"; length: number } | { type: "string"; parts: number };
  part?: number;
}
const escape = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

/** Expand only when a whole source/message cannot be admitted. JSON containers
 * and Markdown paragraphs/fences provide exact, reconstructable boundaries.
 * No sentence prefix, latest-N sampling or invented summary replaces evidence. */
export function structuralUnits(value: unknown, key: string, budget: number): StructuralUnit[] {
  const units: StructuralUnit[] = [];
  function visit(item: unknown, pointer: string) {
    const unit = { key: `${key}${pointer}`, pointer, value: item };
    if (tokenEstimate(unit) <= budget) { units.push(unit); return; }
    if (typeof item === "string") {
      const parts = markdownUnits(item);
      if (parts.length <= 1) throw new Error("A complete paragraph/code fence exceeds the available context. Make room or inspect its original artifact; no evidence was truncated or summarized.");
      units.push({ key: `${key}${pointer}:shape`, pointer, shape: { type: "string", parts: parts.length } });
      for (const [part, text] of parts.entries()) {
        const child = { key: `${key}${pointer}:part:${part}`, pointer, part, value: text };
        if (tokenEstimate(child) > budget) throw new Error("A complete paragraph/code fence exceeds the available context. Make room; no evidence was truncated.");
        units.push(child);
      }
    } else if (Array.isArray(item)) {
      units.push({ key: `${key}${pointer}:shape`, pointer, shape: { type: "array", length: item.length } });
      item.forEach((child, index) => visit(child, `${pointer}/${index}`));
    } else if (item && typeof item === "object") {
      const entries = Object.entries(item).filter(([, child]) => child !== undefined);
      units.push({ key: `${key}${pointer}:shape`, pointer, shape: { type: "object", keys: entries.map(([field]) => field) } });
      entries.forEach(([field, child]) => visit(child, `${pointer}/${escape(field)}`));
    } else throw new Error("A complete structural unit cannot fit the available context.");
  }
  visit(value, "");
  if (units.some(unit => tokenEstimate(unit) > budget)) throw new Error("Structural metadata cannot fit the available context. Make room.");
  return units;
}
