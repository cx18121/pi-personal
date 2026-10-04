#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Remove these patches when the upstream releases correct their manifests.
const patches = [
  ["@juicesharp/rpiv-todo", "typebox"],
  ["pi-slopchop", "@earendil-works/pi-tui"],
];
const modules = path.join(os.homedir(), ".pi/agent/npm/node_modules");
for (const [name, dependency] of patches) {
  const filename = path.join(modules, name, "package.json");
  if (!existsSync(filename)) continue;
  const original = readFileSync(filename, "utf8");
  const manifest = JSON.parse(original);
  if (!Object.hasOwn(manifest.dependencies ?? {}, dependency)) continue;
  delete manifest.dependencies[dependency];
  manifest.peerDependencies ??= {};
  manifest.peerDependencies[dependency] = "*";
  const indent = original.match(/\n([\t ]+)"/)?.[1] ?? "  ";
  writeFileSync(filename, `${JSON.stringify(manifest, null, indent)}\n`);
  console.log(`Patched ${name}: ${dependency} is host-provided.`);
}
