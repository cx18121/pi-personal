import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	applyCxCommand,
	CX_ACTIVE_MESSAGE,
	CX_INACTIVE_MESSAGE,
	CX_MARKER,
	CX_STATE_ENTRY,
	decideCxCommand,
	emptyCxState,
	latestCxDirective,
	refreshPendingDirective,
	renderCxKernel,
	restoreCxState,
	restoreCxStateFile,
	takeBeforeAgentDirective,
} from "../lib/cx.ts";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(moduleRoot, "../..");
const stateEntry = (active: boolean) => ({
	type: "custom",
	customType: CX_STATE_ENTRY,
	data: { active },
});
const directiveEntry = (directive: "active" | "inactive") => ({
	type: "custom_message",
	customType: directive === "active" ? CX_ACTIVE_MESSAGE : CX_INACTIVE_MESSAGE,
});
const compactionDirective = (
	state: { active: boolean; hasState: boolean },
	entries: ReturnType<typeof directiveEntry>[],
) => refreshPendingDirective(state, entries).pending;

describe("CX commands", () => {
	test("rejects every command while Pi is busy", () => {
		const active = { active: true, hasState: true };
		expect(decideCxCommand(active, "", false)).toEqual({ kind: "busy" });
		expect(decideCxCommand(active, "off", false)).toEqual({ kind: "busy" });
		expect(decideCxCommand(active, "ship it", false)).toEqual({ kind: "busy" });
	});

	test("reserves only the exact trimmed off argument", () => {
		const active = { active: true, hasState: true };
		expect(decideCxCommand(active, " off ", true)).toEqual({ kind: "deactivate" });
		expect(decideCxCommand(active, "off now", true)).toEqual({ kind: "task", task: "off now" });
	});

	test("preserves the activation task exactly once", () => {
		const task = "  fix the real surface  ";
		const decision = decideCxCommand(emptyCxState(), task, true);
		expect(decision).toEqual({ kind: "activate-task", task });
		expect(applyCxCommand(emptyCxState(), decision)).toEqual({
			active: true,
			hasState: true,
			pending: "active",
		});
	});

	test("keeps repeated activation and deactivation idempotent", () => {
		expect(decideCxCommand({ active: true, hasState: true }, "", true)).toEqual({
			kind: "noop-active",
		});
		expect(decideCxCommand(emptyCxState(), "off", true)).toEqual({
			kind: "noop-inactive",
		});
	});
});

describe("CX session state", () => {
	test("uses the latest state across the whole session", () => {
		expect(restoreCxState([stateEntry(true), stateEntry(false)])).toEqual({
			active: false,
			hasState: true,
		});
		expect(restoreCxState([stateEntry(false), stateEntry(true)])).toEqual({
			active: true,
			hasState: true,
		});
	});

	test("restores fork state from the source session file", () => {
		const content = [
			JSON.stringify({ type: "session", id: "source" }),
			JSON.stringify(stateEntry(true)),
			JSON.stringify(stateEntry(false)),
		].join("\n");
		expect(restoreCxStateFile(content)).toEqual({ active: false, hasState: true });
	});

	test("marks a directive pending when the selected branch lacks current state", () => {
		expect(refreshPendingDirective({ active: true, hasState: true }, [])).toEqual({
			active: true,
			hasState: true,
			pending: "active",
		});
		expect(
			refreshPendingDirective({ active: false, hasState: true }, [directiveEntry("active")]),
		).toEqual({ active: false, hasState: true, pending: "inactive" });
	});

	test("injects a pending directive before using the marker", () => {
		const first = takeBeforeAgentDirective({ active: true, hasState: true, pending: "active" });
		expect(first.directive).toBe("active");
		expect(first.marker).toBe(false);
		expect(takeBeforeAgentDirective(first.state)).toEqual({
			state: { active: true, hasState: true, pending: undefined },
			directive: undefined,
			marker: true,
		});
	});
});

describe("CX compaction", () => {
	test("adds nothing when the rebuilt context already has the right directive", () => {
		expect(compactionDirective({ active: true, hasState: true }, [directiveEntry("active")])).toBeUndefined();
		expect(compactionDirective({ active: false, hasState: true }, [directiveEntry("inactive")])).toBeUndefined();
	});

	test("repairs a missing or stale directive", () => {
		expect(compactionDirective({ active: true, hasState: true }, [])).toBe("active");
		expect(compactionDirective({ active: false, hasState: true }, [directiveEntry("active")])).toBe("inactive");
		expect(compactionDirective(emptyCxState(), [])).toBeUndefined();
	});

	test("uses the newest explicit directive", () => {
		expect(latestCxDirective([directiveEntry("active"), directiveEntry("inactive")])).toBe(
			"inactive",
		);
	});
});

describe("CX package resources", () => {
	test("keeps the reviewed kernel and marker compact", () => {
		const kernel = readFileSync(join(moduleRoot, "resources/kernel.md"), "utf8").trim();
		expect(kernel.split(/\s+/).filter((word) => word !== "-")).toHaveLength(244);
		expect(CX_MARKER.split(/\s+/)).toHaveLength(18);
	});

	test("resolves every kernel reference from the installed resource root", () => {
		const resourceRoot = join(moduleRoot, "resources");
		const kernel = renderCxKernel(
			readFileSync(join(resourceRoot, "kernel.md"), "utf8"),
			resourceRoot,
		);
		const references = [...kernel.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
		expect(references).toHaveLength(8);
		expect(references.every((reference) => existsSync(reference))).toBe(true);
	});

	test("routes Reflect through exact current complementary models", () => {
		const reflect = readFileSync(join(moduleRoot, "resources/reflect.md"), "utf8");
		expect(reflect).toContain("pi --list-models anthropic");
		expect(reflect).toContain("anthropic/claude-fable-5");
		expect(reflect).toContain("openai-codex/gpt-5.6-sol");
		expect(reflect).toContain("Never guess, shorten, or translate a model id.");
	});

	test("registers extension commands without public skill bypasses", () => {
		const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
		expect(manifest.pi.skills).toBeUndefined();
		expect(manifest.pi.prompts).toBeUndefined();
		expect(manifest.pi.extensions).toContain("./modules/cxstack/extensions/cx.ts");
		expect(manifest.pi.extensions).toContain("./modules/cxstack/extensions/reflect.ts");
		expect(existsSync(join(packageRoot, "skills/cx/SKILL.md"))).toBe(false);
	});
});
