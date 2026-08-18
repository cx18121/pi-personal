import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "../extensions/inline-skills.ts";

const fixtureDir = mkdtempSync(join(tmpdir(), "inline-skills-"));
const skillPath = join(fixtureDir, "simplify.md");
writeFileSync(skillPath, "---\nname: simplify\n---\n\nsimplify skill");

const commands = [
	{
		name: "skill:simplify",
		source: "skill",
		sourceInfo: { path: skillPath, source: "local", scope: "user" },
	},
];

afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

const createHarness = async () => {
	const handlers = new Map();
	let autocompleteFactory;
	const pi = {
		appendEntry() {},
		getCommands: () => commands,
		on(event, handler) {
			handlers.set(event, handler);
		},
		registerCommand() {},
		registerMessageRenderer() {},
	};
	const ctx = {
		cwd: fixtureDir,
		sessionManager: { getBranch: () => [] },
		ui: {
			addAutocompleteProvider(factory) {
				autocompleteFactory = factory;
			},
			notify() {},
		},
	};

	extension(pi);
	await handlers.get("session_start")({}, ctx);

	const autocomplete = autocompleteFactory({
		getSuggestions: async () => ({
			items: [{ value: "skill:simplify", label: "skill:simplify" }],
			prefix: "/sim",
		}),
		applyCompletion() {
			throw new Error("native skill completion was used");
		},
	});

	return { autocomplete, ctx, handlers };
};

const completeSimplify = async (autocomplete, line) => {
	const suggestions = await autocomplete.getSuggestions(
		[line],
		0,
		line.length,
		{ signal: new AbortController().signal },
	);
	const shorthand = suggestions.items.find((item) => item.value === "/simplify");

	expect(shorthand).toBeDefined();
	expect(suggestions.items.some((item) => item.value === "skill:simplify")).toBe(false);

	return autocomplete.applyCompletion(
		[line],
		0,
		line.length,
		shorthand,
		suggestions.prefix,
	).lines[0];
};

describe("inline skills", () => {
	test("uses /simplify for repeated completion", async () => {
		const { autocomplete, ctx, handlers } = await createHarness();
		const first = await completeSimplify(autocomplete, "/sim");
		expect(first).toBe("/simplify ");

		const second = await completeSimplify(autocomplete, `${first}/sim`);
		expect(second).toBe("/simplify /simplify ");

		expect(
			await handlers.get("input")(
				{ source: "interactive", text: second },
				ctx,
			),
		).toEqual({ action: "transform", text: second });
		const injection = await handlers.get("before_agent_start")();
		expect(injection.message.details.names).toEqual(["simplify"]);
	});

	test("keeps a standalone skill in the short form", async () => {
		const { ctx, handlers } = await createHarness();

		expect(
			await handlers.get("input")(
				{ source: "interactive", text: "/simplify" },
				ctx,
			),
		).toEqual({ action: "transform", text: "/simplify" });
		const injection = await handlers.get("before_agent_start")();
		expect(injection.message.details.names).toEqual(["simplify"]);
	});
});
