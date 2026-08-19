import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sessionDir = mkdtempSync(join(tmpdir(), "cxstack-overflow-sessions-"));
const countDir = mkdtempSync(join(tmpdir(), "cxstack-overflow-count-"));
const countPath = join(countDir, "calls.txt");
const child = spawn(
	"pi",
	[
		"--mode",
		"rpc",
		"--no-extensions",
		"-e",
		join(root, "extensions/cx.ts"),
		"-e",
		join(root, "test/fixtures/cx-overflow-provider.ts"),
		"--provider",
		"cxstack-overflow",
		"--model",
		"cxstack-overflow-model",
		"--session-dir",
		sessionDir,
	],
	{
		cwd: root,
		env: { ...process.env, CXSTACK_OVERFLOW_COUNT_PATH: countPath },
		stdio: ["pipe", "pipe", "pipe"],
	},
);

let output = "";
let errors = "";
const rows = [];
const iterator = child.stdout[Symbol.asyncIterator]();
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
	errors += chunk;
});
const timeout = setTimeout(() => child.kill("SIGKILL"), 120000);

const send = (payload) => {
	child.stdin.write(`${JSON.stringify(payload)}\n`);
};

const nextRow = async () => {
	while (!output.includes("\n")) {
		const chunk = await iterator.next();
		if (chunk.done) throw new Error(`Pi closed before the probe finished.\n${errors}`);
		output += chunk.value.toString("utf8");
	}
	const newline = output.indexOf("\n");
	const line = output.slice(0, newline);
	output = output.slice(newline + 1);
	const row = JSON.parse(line);
	rows.push(row);
	return row;
};

const waitFor = async (predicate) => {
	while (true) {
		const row = await nextRow();
		if (predicate(row)) return row;
	}
};

const prompt = async (id, message) => {
	send({ id, type: "prompt", message });
	await waitFor((row) => row.id === id && row.type === "response");
	await waitFor((row) => row.type === "agent_settled");
};

send({ id: "activate", type: "prompt", message: "/cx" });
await waitFor((row) => row.id === "activate" && row.type === "response");
for (let index = 1; index <= 15; index += 1) {
	await prompt(`seed-${index}`, `seed ${index} ${"x ".repeat(3000)}`);
}
await prompt("overflow", "trigger the synthetic overflow");
send({ id: "messages", type: "get_messages" });
const messagesResponse = await waitFor((row) => row.id === "messages" && row.type === "response");
send({ id: "state", type: "get_state" });
const stateResponse = await waitFor((row) => row.id === "state" && row.type === "response");
child.stdin.end();
const exitCode = await new Promise((resolveExit) => child.once("close", resolveExit));
clearTimeout(timeout);
assert.equal(exitCode, 0, errors);
assert.equal(readFileSync(countPath, "utf8"), "18");
assert.ok(
	rows.some(
		(row) =>
			row.type === "compaction_end" &&
			row.reason === "overflow" &&
			row.willRetry === true &&
			row.aborted === false &&
			!row.errorMessage,
	),
);
const messages = messagesResponse.data.messages;
const messageText = (message) => {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
};
assert.ok(messages.some((message) => messageText(message).includes("RECOVERED_AFTER_CXSTACK_OVERFLOW")));
assert.ok(!messages.some((message) => message.role === "assistant" && message.stopReason === "error"));
const sessionFile = stateResponse.data.sessionFile;
const entries = readFileSync(sessionFile, "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line));
const compactionIndex = entries.findLastIndex((entry) => entry.type === "compaction");
assert.notEqual(compactionIndex, -1);
assert.ok(
	entries
		.slice(compactionIndex + 1)
		.some((entry) => entry.type === "custom_message" && entry.customType === "cx-active"),
);
rmSync(sessionDir, { recursive: true, force: true });
rmSync(countDir, { recursive: true, force: true });
console.log("CX overflow runtime probe passed");
