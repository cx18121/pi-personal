#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const check = args[0] === "--check";
if (check) args.shift();
const profile = args[0];
if (!new Set(["macos", "linux"]).has(profile)) {
  throw new Error("Usage: settings.mjs [--check] {macos|linux}");
}

const output = path.join(os.homedir(), ".pi", "agent", "settings.json");
const localOverlay = path.join(os.homedir(), ".config", "pi", "settings.local.json");

const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const merge = (target, source) => {
  const result = structuredClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (key === "packagesAppend") continue;
    result[key] = isObject(value) && isObject(result[key])
      ? merge(result[key], value)
      : structuredClone(value);
  }
  if (source.packagesAppend) {
    if (!Array.isArray(source.packagesAppend)) {
      throw new Error("packagesAppend must be an array.");
    }
    result.packages = [...(result.packages ?? []), ...structuredClone(source.packagesAppend)];
  }
  return result;
};

let settings = merge(
  await readJson(path.join(root, "config", "settings.base.json")),
  await readJson(path.join(root, "config", `settings.${profile}.json`)),
);
if (existsSync(localOverlay)) {
  settings = merge(settings, await readJson(localOverlay));
}

if (existsSync(output)) {
  const current = await readJson(output);
  if (current.lastChangelogVersion) {
    settings.lastChangelogVersion = current.lastChangelogVersion;
  }
}

const serialized = `${JSON.stringify(settings, null, 2)}\n`;
if (check) {
  if (!existsSync(output) || !isDeepStrictEqual(await readJson(output), settings)) {
    throw new Error(`Pi settings do not match the ${profile} profile.`);
  }
  console.log(`Pi settings match the ${profile} profile.`);
} else {
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, serialized, "utf8");
  await rename(temporary, output);
  console.log(`Installed ${profile} Pi settings.`);
}
