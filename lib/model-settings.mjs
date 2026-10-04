import { readFileSync } from "node:fs";

/** @typedef {{ disabledProviders?: string[], helpers?: string[], overrides?: Partial<Record<'corrections' | 'memory' | 'answer' | 'review' | 'implementation', string[]>> }} ModelPolicy */

export const modelSettingKeys = [
  "defaultProvider", "defaultModel", "defaultThinkingLevel", "modelThinkingLevels", "enabledModels", "cxModels",
];
const tasks = new Set(["corrections", "memory", "answer", "review", "implementation"]);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** @param {unknown} value @returns {ModelPolicy} */
export function parseModelPolicy(value) {
  if (value === undefined) return {};
  if (!object(value)) throw new Error("cxModels must be an object.");
  for (const key of Object.keys(value)) {
    if (!["disabledProviders", "helpers", "overrides"].includes(key)) throw new Error(`Unknown cxModels setting: ${key}`);
  }
  const list = (items, label, models) => {
    if (!Array.isArray(items) || (models && items.length === 0) || items.some((item) =>
      typeof item !== "string" || !item.trim()
      || (models && item !== "session" && !/^[^/\s]+\/[^\s]+$/.test(item))
      || (!models && /[\s/]/.test(item)))) {
      throw new Error(`${label} must be ${models ? "a nonempty ordered list of session or provider/model IDs" : "a list of provider names"}.`);
    }
    return [...new Set(items)];
  };
  const result = {};
  if (value.disabledProviders !== undefined) result.disabledProviders = list(value.disabledProviders, "cxModels.disabledProviders", false);
  if (value.helpers !== undefined) result.helpers = list(value.helpers, "cxModels.helpers", true);
  if (value.overrides !== undefined) {
    if (!object(value.overrides)) throw new Error("cxModels.overrides must be an object.");
    result.overrides = {};
    for (const [task, items] of Object.entries(value.overrides)) {
      if (!tasks.has(task)) throw new Error(`Unknown cxModels override: ${task}`);
      result.overrides[task] = list(items, `cxModels.overrides.${task}`, true);
    }
  }
  return result;
}

/** @param {string} file @returns {ModelPolicy} */
export function readModelPolicy(file) {
  let text;
  try { text = readFileSync(file, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  return parseModelPolicy(JSON.parse(text).cxModels);
}
