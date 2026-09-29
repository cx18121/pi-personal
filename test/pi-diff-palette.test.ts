import assert from "node:assert/strict";
import test from "node:test";
import { parseDiff } from "../vendor/pi-diff/src/core/diff.ts";
import { renderUnified, renderSplit, resolveDiffColors } from "../vendor/pi-diff/src/review/hunk-preview.ts";

const theme = {
	fg: (_name: string, text: string) => text,
	bg: (name: string, text: string) => name + text,
	getFgAnsi: (name: string) => name === "toolDiffRemoved" ? "\x1b[38;2;255;120;135m" : "\x1b[38;2;110;210;130m",
	getBgAnsi: () => "\x1b[48;2;52;56;57m",
};

test("diff rendering uses a dark neutral surface, saturated changes, and undimmed context", async () => {
	const colors = resolveDiffColors(theme);
	const diff = parseDiff("const stable = 1;\nconst value = 2;\n", "const stable = 1;\nconst value = 3;\n");
	for (const render of [renderUnified, renderSplit]) {
		const output = await render(diff, "typescript", 100, colors, 100);
		assert.ok(output.includes("\x1b[48;2;23;25;26m"), "dark neutral card");
		assert.ok(output.includes("\x1b[48;2;18;59;37m"), "green line");
		assert.ok(output.includes("\x1b[48;2;70;27;35m"), "red line");
		for (const row of output.split("\n").filter(row => row.includes("stable"))) {
			assert.ok(!row.includes("\x1b[2m"), "context retains full syntax color");
		}
	}
});

test("a light theme keeps its light card background", async () => {
	const colors = resolveDiffColors({ ...theme, bg: (_name: string, text: string) => "light" + text, getBgAnsi: () => "\x1b[48;2;245;245;245m" });
	const output = await renderUnified(parseDiff("before\n", "after\n"), undefined, 100, colors, 100);
	assert.ok(output.includes("\x1b[48;2;245;245;245m"));
});
