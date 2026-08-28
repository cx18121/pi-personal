import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxToolCall,
	type Provider,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import registerChildAgent from "../extensions/child-agent.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error("Timed out waiting for child result.");
		await new Promise<void>((resolve) => setTimeout(resolve, 10));
	}
}

function textContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part): part is { type: "text"; text: string } => (
			part && typeof part === "object" && part.type === "text" && typeof part.text === "string"
		))
		.map((part) => part.text)
		.join("\n");
}

test("runs a real background child through a Pi parent session", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-child-agent-live-"));
	temporaryRoots.push(root);
	const cwd = join(root, "repo");
	const agentDir = join(root, "agent");
	const sessionsDir = join(root, "sessions");
	await Promise.all([mkdir(cwd), mkdir(agentDir), mkdir(sessionsDir)]);
	await writeFile(join(cwd, "README.md"), "child live fixture\n");

	const driverProviderId = "openai-codex";
	const reviewerProviderId = "anthropic";
	const driverModel = "driver";
	const reviewerFableModel = "claude-fable-reviewer";
	const reviewerOpusModel = "claude-opus-reviewer";
	const driver = createFauxCore({ provider: driverProviderId, models: [{ id: driverModel }] });
	const reviewer = createFauxCore({
		provider: reviewerProviderId,
		models: [{ id: reviewerFableModel }, { id: reviewerOpusModel }],
	});
	driver.setResponses([
		fauxAssistantMessage(fauxToolCall("child_run", {
			task: "Read README.md, then return exactly CHILD_LIVE_OK.",
			model: "fable",
		}, { id: "start-child" })),
		fauxAssistantMessage("MAIN_AVAILABLE"),
		fauxAssistantMessage("MAIN_RECEIVED_CHILD"),
	]);
	reviewer.setResponses([
		fauxAssistantMessage(fauxToolCall("read", { path: "README.md" }, { id: "read-fixture" })),
		fauxAssistantMessage("CHILD_LIVE_OK"),
	]);

	const runtime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: join(agentDir, "models.json"),
		allowModelNetwork: false,
	});
	const provider = (
		id: string,
		name: string,
		core: typeof driver,
	): Provider => ({
		id,
		name,
		auth: {
			apiKey: {
				name: `${name} API key`,
				resolve: async ({ credential }) => credential?.key
					? { auth: { apiKey: credential.key } }
					: undefined,
			},
		},
		getModels: () => core.models,
		stream: (model, context, options) => core.stream(model as never, context, options),
		streamSimple: (model, context, options?: SimpleStreamOptions) => (
			core.streamSimple(model as never, context, options)
		),
	});
	runtime.registerNativeProvider(provider(driverProviderId, "Driver", driver));
	runtime.registerNativeProvider(provider(reviewerProviderId, "Reviewer", reviewer));
	await runtime.setRuntimeApiKey(driverProviderId, "driver-runtime-test-key");
	await runtime.setRuntimeApiKey(reviewerProviderId, "reviewer-runtime-test-key");
	const loader = new DefaultResourceLoader({
		cwd,
		agentDir,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		extensionFactories: [{ name: "child-agent", factory: registerChildAgent }],
	});
	await loader.reload();
	const sessionManager = SessionManager.create(cwd, sessionsDir);
	const selectedDriver = runtime.getModel(driverProviderId, driverModel)!;
	const selectedFable = runtime.getModel(reviewerProviderId, reviewerFableModel)!;
	const selectedOpus = runtime.getModel(reviewerProviderId, reviewerOpusModel)!;
	const parent = await createAgentSession({
		cwd,
		agentDir,
		modelRuntime: runtime,
		model: selectedDriver,
		scopedModels: [{ model: selectedDriver }, { model: selectedFable }, { model: selectedOpus }],
		tools: ["child_run", "child_status", "child_stop"],
		resourceLoader: loader,
		sessionManager,
	});

	try {
		await parent.session.prompt("Start the read-only child.");
		const mainOutput = [...parent.session.messages]
			.reverse()
			.find((message) => message.role === "assistant");
		expect(textContent(mainOutput?.content)).toBe("MAIN_AVAILABLE");

		await waitFor(() => parent.session.messages.some((message) => (
			message.role === "custom" && textContent(message.content).includes("CHILD_LIVE_OK")
		)));
		const childResult = parent.session.messages.find((message) => (
			message.role === "custom" && textContent(message.content).includes("CHILD_LIVE_OK")
		));
		expect(textContent(childResult?.content)).toContain("Child completed");
	} finally {
		parent.session.dispose();
	}
});
