import { join } from "node:path";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	type ModelRegistry,
	type ProviderConfig,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";

const childInstructions = `You are a child of another Pi session.

Follow the authority in the supplied task exactly. Review, investigation, and judgment tasks are read only unless the task explicitly authorizes changes. Use the normal coding tools when they help, including Git and focused verification commands. Treat project instructions and current source as authoritative. Name unresolved facts instead of guessing.`;

export type ChildInput = {
	task: string;
	model: string;
	cwd: string;
	agentDir: string;
	parentRegistry: ModelRegistry;
	signal: AbortSignal;
};

export type ChildResult = {
	output: string;
	model?: string;
};

function parseModel(reference: string): { provider: string; modelId: string } {
	const separator = reference.indexOf("/");
	if (separator <= 0 || separator === reference.length - 1) {
		throw new Error(`Child model must use provider/model format: ${reference}`);
	}
	return { provider: reference.slice(0, separator), modelId: reference.slice(separator + 1) };
}

function snapshotProviderConfig(
	providerId: string,
	config: ProviderConfig,
	ownerModels: Model<Api>[],
): ProviderConfig {
	if (!config.refreshModels) return config;
	return {
		...config,
		refreshModels: undefined,
		models: ownerModels.filter((model) => model.provider === providerId),
	};
}

function isCredentialSynchronizationError(
	error: unknown,
): error is Error & { providerId: string; cause?: unknown } {
	return error instanceof Error
		&& error.name === "CredentialSynchronizationError"
		&& typeof (error as { providerId?: unknown }).providerId === "string";
}

async function transferRuntimeApiKey(
	providerId: string,
	ownerRegistry: ModelRegistry,
	childRuntime: ModelRuntime,
	signal: AbortSignal,
): Promise<void> {
	const apiKey = await ownerRegistry.getApiKeyForProvider(providerId);
	if (!apiKey) {
		throw new Error(`Child model provider has no transferable authentication: ${providerId}`);
	}
	try {
		await childRuntime.setRuntimeApiKey(providerId, apiKey, { signal });
	} catch (error) {
		if (!isCredentialSynchronizationError(error)) throw error;
		const cause = error.cause instanceof Error
			? error.cause.message
			: error.cause ? String(error.cause) : undefined;
		throw new Error(
			`Child authentication synchronization failed for ${error.providerId}${cause ? `: ${cause}` : ""}`,
			{ cause: error },
		);
	}
}

async function createChildRuntime(
	providerId: string,
	ownerRegistry: ModelRegistry,
	agentDir: string,
	signal: AbortSignal,
): Promise<ModelRuntime> {
	const childRuntime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: join(agentDir, "models.json"),
		allowModelNetwork: false,
		signal,
	});
	const ownerModels = ownerRegistry.getAll();

	for (const registeredProviderId of ownerRegistry.getRegisteredProviderIds()) {
		const nativeProvider = ownerRegistry.getRegisteredNativeProvider(registeredProviderId);
		if (nativeProvider) {
			childRuntime.registerNativeProvider(nativeProvider);
			continue;
		}

		const config = ownerRegistry.getRegisteredProviderConfig(registeredProviderId);
		if (config) {
			childRuntime.registerProvider(
				registeredProviderId,
				snapshotProviderConfig(registeredProviderId, config, ownerModels),
			);
		}
	}

	const ownerAuth = ownerRegistry.getProviderAuthStatus(providerId);
	if (ownerAuth.configured && ownerAuth.source === "runtime") {
		await transferRuntimeApiKey(providerId, ownerRegistry, childRuntime, signal);
	}
	if (ownerAuth.configured && !await childRuntime.checkAuth(providerId, { signal })) {
		await transferRuntimeApiKey(providerId, ownerRegistry, childRuntime, signal);
	}

	return childRuntime;
}

function finalAssistant(messages: readonly unknown[]): AssistantMessage | undefined {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message && typeof message === "object" && "role" in message && message.role === "assistant") {
			return message as AssistantMessage;
		}
	}
	return undefined;
}

function assistantText(message: AssistantMessage | undefined): string {
	if (!message) return "(no output)";
	const text = message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
	return text || "(no output)";
}

export async function runChildSession(input: ChildInput): Promise<ChildResult> {
	input.signal.throwIfAborted();
	const selected = parseModel(input.model);
	const modelRuntime = await createChildRuntime(
		selected.provider,
		input.parentRegistry,
		input.agentDir,
		input.signal,
	);
	const model = modelRuntime.getModel(selected.provider, selected.modelId);
	if (!model) throw new Error(`Child model is unavailable: ${input.model}`);

	const resourceLoader = new DefaultResourceLoader({
		cwd: input.cwd,
		agentDir: input.agentDir,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		appendSystemPrompt: [childInstructions],
	});
	await resourceLoader.reload();
	input.signal.throwIfAborted();

	const created = await createAgentSession({
		cwd: input.cwd,
		agentDir: input.agentDir,
		modelRuntime,
		model,
		thinkingLevel: "high",
		resourceLoader,
		sessionManager: SessionManager.inMemory(input.cwd),
		settingsManager: SettingsManager.inMemory({ compaction: { enabled: true } }),
	});
	const session = created.session;
	const abort = () => void session.abort();
	input.signal.addEventListener("abort", abort, { once: true });

	try {
		if (input.signal.aborted) await session.abort();
		input.signal.throwIfAborted();
		await session.prompt(input.task);
		input.signal.throwIfAborted();
		const final = finalAssistant(session.messages);
		if (final?.stopReason === "error") {
			throw new Error(final.errorMessage ?? assistantText(final));
		}
		if (final?.stopReason === "aborted") throw new Error("Child was aborted.");
		return {
			output: assistantText(final),
			model: final ? `${final.provider}/${final.model}` : input.model,
		};
	} finally {
		input.signal.removeEventListener("abort", abort);
		session.dispose();
	}
}
