import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import paster from "../vendor/pi-paster/src/index.ts";
import { PASTE_END, PASTE_START } from "../vendor/pi-paster/src/editor.ts";
import { AttachmentStore } from "../vendor/pi-paster/src/store.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("pi-paster image feedback", () => {
	test("reserves the visible image placeholder before clipboard loading finishes", () => {
		const store = new AttachmentStore();
		const reservation = store.reserve();

		expect(reservation.placeholder).toBe("[#Image 1]");
		expect(store.get(reservation.placeholder)).toBeUndefined();

		const attachment = store.add(
			{
				originalPath: "clipboard.png",
				mimeType: "image/png",
				data: "image-data",
			},
			reservation,
		);
		expect(attachment.placeholder).toBe(reservation.placeholder);
		expect(store.get(reservation.placeholder)).toBe(attachment);
		expect(store.reserve().placeholder).toBe("[#Image 2]");
	});

	test("keeps queued image context and previews with the image-bearing user message", async () => {
		type Handler = (event: any, context: any) => any;
		const handlers = new Map<string, Handler[]>();
		const customMessages: unknown[] = [];
		const entries: Array<{ customType: string; data: unknown }> = [];
		let terminalInput: ((data: string) => { consume?: boolean; data?: string } | undefined) | undefined;

		const pi = {
			registerCommand() {},
			registerMessageRenderer() {},
			registerEntryRenderer() {},
			appendEntry(customType: string, data: unknown) {
				entries.push({ customType, data });
			},
			sendMessage(message: unknown) {
				customMessages.push(message);
			},
			on(event: string, handler: Handler) {
				handlers.set(event, [...(handlers.get(event) ?? []), handler]);
			},
		} as unknown as ExtensionAPI;

		paster(pi, {
			imageCompression: { enabled: false },
			customEditor: { enabled: false },
		});

		const directory = mkdtempSync(join(tmpdir(), "pi-paster-test-"));
		temporaryDirectories.push(directory);
		const imagePath = join(directory, "queued.png");
		writeFileSync(
			imagePath,
			Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
				"base64",
			),
		);

		const ui = {
			setWidget() {},
			onTerminalInput(handler: typeof terminalInput) {
				terminalInput = handler;
				return () => {};
			},
		};
		await handlers.get("session_start")?.[0]?.({}, { cwd: directory, hasUI: true, ui });

		const paste = terminalInput?.(`${PASTE_START}${imagePath}${PASTE_END}`);
		expect(paste?.data).toBe("[#Image 1]");

		const input = await handlers.get("input")?.[0]?.(
			{
				text: paste?.data,
				images: undefined,
				source: "interactive",
				streamingBehavior: "followUp",
			},
			{ hasUI: true, isIdle: () => false },
		);

		expect(input.action).toBe("transform");
		expect(input.text).toBe(
			`[#Image 1]\n\nAttached image paths:\n- \`[#Image 1]\`: \`${imagePath}\``,
		);
		expect(input.images).toHaveLength(1);
		expect(customMessages).toEqual([]);

		await handlers.get("message_end")?.[0]?.(
			{
				message: {
					role: "user",
					content: [{ type: "text", text: input.text }, ...input.images],
				},
			},
			{},
		);
		expect(entries).toEqual([
			{
				customType: "paster-preview",
				data: { placeholders: ["[#Image 1]"] },
			},
		]);
	});
});
