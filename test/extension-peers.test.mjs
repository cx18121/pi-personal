import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const script = new URL("../scripts/patch-extension-peers.mjs", import.meta.url);

test("patch installed upstream manifests without changing other dependencies", () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "pi-peer-test-"));
  try {
    const modules = path.join(home, ".pi/agent/npm/node_modules");
    const files = [
      ["@juicesharp/rpiv-todo", "typebox"],
      ["pi-slopchop", "@earendil-works/pi-tui"],
    ].map(([name, dependency]) => {
      const filename = path.join(modules, name, "package.json");
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, JSON.stringify({
        name,
        dependencies: { [dependency]: "^1.0.0", retained: "2.0.0" },
        peerDependencies: { existing: "*" },
      }, null, "\t") + "\n");
      return [filename, dependency];
    });
    const run = () => execFileSync(process.execPath, [script.pathname], {
      env: { ...process.env, HOME: home }, encoding: "utf8",
    });
    assert.match(run(), /Patched pi-slopchop/);
    for (const [filename, dependency] of files) {
      const manifest = JSON.parse(readFileSync(filename, "utf8"));
      assert.deepEqual(manifest.dependencies, { retained: "2.0.0" });
      assert.deepEqual(manifest.peerDependencies, { existing: "*", [dependency]: "*" });
    }
    assert.equal(run(), "");
    rmSync(modules, { recursive: true });
    assert.equal(run(), "");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
