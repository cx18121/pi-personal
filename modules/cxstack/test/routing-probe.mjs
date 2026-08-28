import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kernel = readFileSync(join(root, "resources/kernel.md"), "utf8");
const cases = [
	{ id: "explain", prompt: "Explain the difference between createdAt and processedAt.", mode: "direct" },
	{ id: "recommend", prompt: "What papercut batch should we do next?", mode: "direct" },
	{ id: "confidence", prompt: "Are you sure this helper name is better?", mode: "direct" },
	{ id: "housekeeping", prompt: "Consolidate duplicate entries in a local Markdown checklist.", mode: "direct" },
	{ id: "small-fix", prompt: "Fix one typo in a local README.", mode: "direct" },
	{ id: "production-incident", prompt: "Read-only: investigate why production refunds are stuck across the database and queue.", mode: "route", route: "Investigation and Decision" },
	{ id: "migration-decision", prompt: "Decide how to migrate persistent customer data between schemas.", mode: "route", route: "Investigation and Decision" },
	{ id: "authentication", prompt: "Implement a material authentication behavior change.", mode: "route", route: "Feature" },
	{ id: "review", prompt: "Review this pull request for correctness.", mode: "route", route: "Review" },
	{ id: "delivery", prompt: "Push this branch and open a pull request.", mode: "route", route: "Delivery" },
];
const request = `Classify each case using the process policy in your system prompt. Do not execute the tasks. Return only a JSON array with objects {"id": string, "mode": "direct" | "route", "route"?: string}.\n\n${JSON.stringify(cases.map(({ id, prompt }) => ({ id, prompt })), null, 2)}`;
const provider = process.env.CX_ROUTING_PROVIDER ?? "openai-codex";
const model = process.env.CX_ROUTING_MODEL ?? "gpt-5.6-sol";
const result = spawnSync("pi", [
	"--provider", provider,
	"--model", model,
	"--thinking", "high",
	"--no-tools",
	"--no-extensions",
	"--no-skills",
	"--no-context-files",
	"--no-session",
	"--system-prompt", kernel,
	"-p",
	request,
], { cwd: root, encoding: "utf8", timeout: 120_000 });
assert.equal(result.status, 0, result.stderr);
const start = result.stdout.indexOf("[");
const end = result.stdout.lastIndexOf("]");
assert.notEqual(start, -1, result.stdout);
assert.notEqual(end, -1, result.stdout);
const actual = JSON.parse(result.stdout.slice(start, end + 1));
for (const expected of cases) {
	const found = actual.find((candidate) => candidate.id === expected.id);
	assert.ok(found, `Missing routing result for ${expected.id}`);
	assert.equal(found.mode, expected.mode, `${expected.id}: ${JSON.stringify(found)}`);
	if (expected.route) assert.equal(found.route, expected.route, `${expected.id}: ${JSON.stringify(found)}`);
}
console.log(`CX routing probe passed for ${provider}/${model}`);
