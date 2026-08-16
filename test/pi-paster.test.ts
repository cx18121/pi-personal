import { describe, expect, test } from "bun:test";
import { AttachmentStore } from "../vendor/pi-paster/src/store.ts";

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
});
