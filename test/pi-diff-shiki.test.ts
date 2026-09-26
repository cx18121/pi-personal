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

test("pi-diff wraps at word boundaries with a hanging indent", async () => {
	const { wrapAnsiWords } = await import("../vendor/pi-diff/src/wrap.ts");
	const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
	const rows = wrapAnsiWords("  \x1b[31malpha beta gamma delta\x1b[39m epsilon", 16, 40, "", "\x1b[0m", "›").map(strip);
	assert.deepEqual(rows, ["  alpha beta    ", "  gamma delta   ", "  epsilon       "]);
	assert.ok(rows.every((row) => row.length === 16));
});

test("pi-diff hard-breaks words longer than a row", async () => {
	const { wrapAnsiWords } = await import("../vendor/pi-diff/src/wrap.ts");
	const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
	assert.deepEqual(wrapAnsiWords("abcdefghij", 4, 40, "", "", "›").map(strip), ["abcd", "efgh", "ij  "]);
});
