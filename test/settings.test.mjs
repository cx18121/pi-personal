import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const homes = [];
const root = resolve(import.meta.dir, "..");
const setup = (...args) => {
  const home = mkdtempSync(join(tmpdir(), "pi-settings-"));
  homes.push(home);
  const file = join(home, ".pi/agent/settings.json");
  const run = (args = ["macos"]) => spawnSync(process.execPath, ["scripts/settings.mjs", ...args], {
    cwd: root, env: { ...process.env, HOME: home }, encoding: "utf8",
  });
  // Bun and Node both support these plain ECMAScript setup scripts.
  expect(run(args.length ? args : ["macos"]).status).toBe(0);
  return { home, file, run, read: () => JSON.parse(readFileSync(file, "utf8")) };
};
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });

test("first install seeds model settings; repeated setup preserves saved choices and custom runtime fields", () => {
  const h = setup();
  expect(h.read().cxModels.helpers).toEqual(["session"]);
  const settings = {
    ...h.read(), defaultProvider: "custom", defaultModel: "chosen", defaultThinkingLevel: "medium",
    enabledModels: ["custom/chosen"], modelThinkingLevels: { "custom/chosen": "low" },
    cxModels: { disabledProviders: ["anthropic"], helpers: ["session"] }, unknownExtension: { enabled: true },
  };
  writeFileSync(h.file, JSON.stringify(settings));
  expect(h.run(["--check", "macos"]).status).toBe(0);
  expect(h.run().status).toBe(0);
  expect(h.read()).toEqual(settings);
});

test("installation settings remain checked while malformed model policy is rejected without overwriting it", () => {
  const h = setup();
  writeFileSync(h.file, JSON.stringify({ ...h.read(), quietStartup: false }));
  expect(h.run(["--check", "macos"]).status).toBe(1);
  expect(h.run().status).toBe(0);
  expect(h.read().quietStartup).toBe(true);
  const invalid = JSON.stringify({ ...h.read(), cxModels: { helpers: [] } });
  writeFileSync(h.file, invalid);
  expect(h.run().status).toBe(1);
  expect(readFileSync(h.file, "utf8")).toBe(invalid);
});

test("linux setup uses the same policy and does not register remember-last-model", () => {
  const h = setup("linux");
  expect(h.read().cxModels.helpers).toEqual(["session"]);
  expect(readFileSync(join(root, "package.json"), "utf8")).not.toContain("remember-last-model");
  expect(JSON.stringify(h.read())).not.toContain("remember-last-model");
});

test("runtime compatibility checks a floor instead of an exact dev dependency version", () => {
  for (const [version, status] of [["0.85.1", 1], ["0.87.1", 1], ["0.98.9", 1], ["0.99.0", 0], ["0.99.1", 0], ["1.0.0", 0], ["garbage", 1]]) {
    expect(spawnSync(process.execPath, ["scripts/check-pi-version.mjs", version], { cwd: root }).status).toBe(status);
  }
});

test("maintenance runs explicit upgrades then checks; bootstrap contains no extension update", () => {
  const h = setup();
  const bin = join(h.home, "bin");
  mkdirSync(bin);
  const log = join(h.home, "commands");
  for (const command of ["pi", "npm"]) writeFileSync(join(bin, command), `#!/bin/sh\nif [ "$1" = "--version" ]; then echo 0.99.1; exit 0; fi\nprintf '%s\\n' '${command} '"$*" >> "$COMMAND_LOG"\n`, { mode: 0o755 });
  const result = spawnSync("bash", ["scripts/update", "macos"], {
    cwd: root, env: { ...process.env, HOME: h.home, PATH: `${bin}:${process.env.PATH}`, COMMAND_LOG: log }, encoding: "utf8",
  });
  expect(result.status).toBe(0);
  const calls = readFileSync(log, "utf8");
  expect(calls).toContain("update --extensions --approve");
  expect(calls).toContain("update --models");
  expect(calls).toContain("run typecheck");
  expect(readFileSync(join(root, "scripts/bootstrap"), "utf8")).not.toContain("pi update");
});
