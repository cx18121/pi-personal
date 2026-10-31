import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

const runSettings = (home, ...args) => spawnSync(
  "node",
  [path.join(root, "scripts", "settings.mjs"), ...args],
  { cwd: root, env: { ...process.env, HOME: home }, encoding: "utf8" },
);

test("merges the platform profile and local package overlay", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "pi-settings-"));
  roots.push(home);
  mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
  mkdirSync(path.join(home, ".config", "pi"), { recursive: true });
  writeFileSync(
    path.join(home, ".pi", "agent", "settings.json"),
    JSON.stringify({ lastChangelogVersion: "0.85.0" }),
  );
  writeFileSync(
    path.join(home, ".config", "pi", "settings.local.json"),
    JSON.stringify({ packagesAppend: ["local-package"], outputPad: 9 }),
  );

  expect(runSettings(home, "macos").status).toBe(0);
  const settings = JSON.parse(readFileSync(path.join(home, ".pi", "agent", "settings.json"), "utf8"));

  expect(settings.defaultProvider).toBe("anthropic");
  expect(settings.outputPad).toBe(9);
  expect(settings.packages.at(-1)).toBe("local-package");
  expect(settings.lastChangelogVersion).toBe("0.85.0");
  writeFileSync(
    path.join(home, ".pi", "agent", "settings.json"),
    JSON.stringify(settings),
  );
  expect(runSettings(home, "--check", "macos").status).toBe(0);
});

test("check fails when installed settings drift", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "pi-settings-"));
  roots.push(home);

  expect(runSettings(home, "linux").status).toBe(0);
  const output = path.join(home, ".pi", "agent", "settings.json");
  const settings = JSON.parse(readFileSync(output, "utf8"));
  settings.outputPad = 99;
  writeFileSync(output, JSON.stringify(settings));

  expect(runSettings(home, "--check", "linux").status).not.toBe(0);
});
