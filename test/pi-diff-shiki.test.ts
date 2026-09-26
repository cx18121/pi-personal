import assert from "node:assert/strict";
import test from "node:test";
import { codeToANSI } from "../vendor/pi-diff/src/shiki.ts";

test("pi-diff Shiki shim colors TypeScript tokens", async () => {
	const out = await codeToANSI('const total: number = "x".length;', "typescript", "github-dark");
	assert.match(out, /\x1b\[38;2;249;117;131mconst\x1b\[39m/);
	assert.ok(out.endsWith("\n"));
});

test("pi-diff Shiki shim falls back to github-dark for unknown themes", async () => {
	const dark = await codeToANSI("let a = 1", "typescript", "github-dark");
	assert.equal(await codeToANSI("let a = 1", "typescript", "not-a-theme"), dark);
});
