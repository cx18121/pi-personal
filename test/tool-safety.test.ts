import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import registerToolSafety from "../extensions/tool-safety.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

function createHarness() {
	const tools = new Map<string, any>();
	const handlers = new Map<string, Array<(event: any, context: any) => unknown>>();
	const pi = {
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		on(event: string, handler: (event: any, context: any) => unknown) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
	};
	registerToolSafety(pi as any);
	return { tools, handlers };
}

async function temporaryDirectory() {
	const path = await mkdtemp(join(tmpdir(), "pi-tool-safety-"));
	temporaryDirectories.push(path);
	return path;
}

function context(cwd: string) {
	return {
		cwd,
		model: undefined,
		thinkingLevel: "off",
		sessionManager: {
			getSessionId: () => "test-session",
			getSessionFile: () => undefined,
		},
	};
}

describe("tool safety", () => {
	test("runs bash commands from the requested cwd", async () => {
		const root = await temporaryDirectory();
		const nested = join(root, "nested directory");
		await mkdir(nested);
		const { tools } = createHarness();

		const result = await tools.get("bash").execute(
			"cwd-test",
			{ command: "pwd", cwd: nested },
			undefined,
			undefined,
			context(root),
		);

		expect(result.content[0].text.trim()).toBe(await realpath(nested));
	});

	test("does not run any command when the requested cwd is missing", async () => {
		const root = await temporaryDirectory();
		const marker = join(root, "wrong-directory-marker");
		const { tools } = createHarness();

		await expect(
			tools.get("bash").execute(
				"missing-cwd",
				{ command: `printf first\nprintf x > '${marker}'`, cwd: join(root, "missing") },
				undefined,
				undefined,
				context(root),
			),
		).rejects.toThrow();
		await expect(readFile(marker, "utf8")).rejects.toThrow();
	});

	test("blocks a third consecutive identical failed bash command", async () => {
		const root = await temporaryDirectory();
		const marker = join(root, "attempts");
		const command = `printf x >> '${marker}'; false`;
		const { tools, handlers } = createHarness();
		const bash = tools.get("bash");
		const executionContext = context(root);
		for (const handler of handlers.get("agent_start") ?? []) await handler({}, executionContext);

		await expect(bash.execute("failure-1", { command }, undefined, undefined, executionContext)).rejects.toThrow();
		await expect(bash.execute("failure-2", { command }, undefined, undefined, executionContext)).rejects.toThrow();
		await expect(bash.execute("failure-3", { command }, undefined, undefined, executionContext)).rejects.toThrow(
			"Blocked a third consecutive identical failed bash command",
		);
		expect(await readFile(marker, "utf8")).toBe("xx");
	});

	test("allows the same bash check after another tool changes the method", async () => {
		const root = await temporaryDirectory();
		const marker = join(root, "attempts");
		const command = `printf x >> '${marker}'; false`;
		const { tools, handlers } = createHarness();
		const bash = tools.get("bash");
		const executionContext = context(root);

		await expect(bash.execute("failure-1", { command }, undefined, undefined, executionContext)).rejects.toThrow();
		await expect(bash.execute("failure-2", { command }, undefined, undefined, executionContext)).rejects.toThrow();
		await handlers.get("tool_call")?.[0]({ toolName: "edit", input: {} }, executionContext);
		await expect(bash.execute("failure-3", { command }, undefined, undefined, executionContext)).rejects.toThrow();
		expect(await readFile(marker, "utf8")).toBe("xxx");
	});

	test("counts command output that contains the abort message as a failure", async () => {
		const root = await temporaryDirectory();
		const command = "printf 'Command aborted'; false";
		const { tools } = createHarness();
		const bash = tools.get("bash");
		const executionContext = context(root);

		await expect(bash.execute("failure-1", { command }, undefined, undefined, executionContext)).rejects.toThrow();
		await expect(bash.execute("failure-2", { command }, undefined, undefined, executionContext)).rejects.toThrow();
		await expect(bash.execute("failure-3", { command }, undefined, undefined, executionContext)).rejects.toThrow(
			"Blocked a third consecutive identical failed bash command",
		);
	});

	test("refuses to write through a symbolic link", async () => {
		const root = await temporaryDirectory();
		const target = join(root, "target.txt");
		const link = join(root, "link.txt");
		await writeFile(target, "original");
		await symlink(target, link);
		const { handlers } = createHarness();
		const handler = handlers.get("tool_call")?.[0];

		const result = await handler?.({ toolName: "write", input: { path: link, content: "replacement" } }, { cwd: root });

		expect(result).toEqual({
			block: true,
			reason: `Refusing to write through symbolic link: ${link}. Remove or replace the link explicitly first.`,
		});
		expect(await readFile(target, "utf8")).toBe("original");
	});

	test("refuses file URLs that resolve to a symbolic link", async () => {
		const root = await temporaryDirectory();
		const target = join(root, "target.txt");
		const link = join(root, "link.txt");
		await writeFile(target, "original");
		await symlink(target, link);
		const { handlers } = createHarness();
		const inputPath = pathToFileURL(link).href;

		const result = await handlers.get("tool_call")?.[0](
			{ toolName: "write", input: { path: inputPath, content: "replacement" } },
			{ cwd: root },
		);

		expect(result?.block).toBeTrue();
		expect(await readFile(target, "utf8")).toBe("original");
	});
});
