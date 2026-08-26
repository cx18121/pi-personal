import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createFauxCore,
	fauxAssistantMessage,
	type Api,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { runChildSession } from "../lib/session.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "pi-child-agent-"));
	temporaryRoots.push(root);
	const cwd = join(root, "repo");
	const agentDir = join(root, "agent");
	await Promise.all([mkdir(cwd), mkdir(agentDir)]);
	return { cwd, agentDir };
}

describe("runChildSession", () => {
	test("runs the selected model with transferred auth and normal coding tools", async () => {
		const { cwd, agentDir } = await fixture();
		const provider = "child-test";
		const modelId = "reviewer";
		const apiKey = "runtime-test-key";
		const faux = createFauxCore({ provider, models: [{ id: modelId }] });
		let receivedPrompt = "";
		let receivedTools: string[] = [];
		const receivedKeys: Array<string | undefined> = [];
		faux.setResponses([
			(context) => {
				const message = context.messages.at(-1);
				if (message?.role === "user") {
					receivedPrompt = typeof message.content === "string"
						? message.content
						: message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
				}
				receivedTools = (context.tools ?? []).map((tool) => tool.name);
				return fauxAssistantMessage("review complete");
			},
		]);

		const ownerRuntime = await ModelRuntime.create({
			authPath: join(agentDir, "auth.json"),
			modelsPath: join(agentDir, "models.json"),
			allowModelNetwork: false,
		});
		ownerRuntime.registerProvider(provider, {
			baseUrl: "https://offline.invalid",
			api: faux.api as Api,
			models: faux.models,
			streamSimple: (model, context, options?: SimpleStreamOptions) => {
				receivedKeys.push(options?.apiKey);
				return faux.streamSimple(model as never, context, options);
			},
		});
		await ownerRuntime.setRuntimeApiKey(provider, apiKey);

		const result = await runChildSession({
			task: "Review the target change.",
			model: `${provider}/${modelId}`,
			cwd,
			agentDir,
			parentRegistry: new ModelRegistry(ownerRuntime),
			signal: new AbortController().signal,
		});

		expect(result).toEqual({ output: "review complete", model: `${provider}/${modelId}` });
		expect(receivedPrompt).toBe("Review the target change.");
		expect(receivedTools).toEqual(["read", "bash", "edit", "write"]);
		expect(receivedKeys).toEqual([apiKey]);
	});
});
