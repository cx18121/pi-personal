import { afterEach, describe, expect, test } from "bun:test";
import registerIntercomToggle from "../extensions/intercom-toggle.ts";

const enabledEnv = "PI_INTERCOM_SESSION_ENABLED";
const originalEnabled = process.env[enabledEnv];

afterEach(() => {
	if (originalEnabled === undefined) {
		delete process.env[enabledEnv];
	} else {
		process.env[enabledEnv] = originalEnabled;
	}
});

function createHarness() {
	const commands = new Map();
	const handlers = new Map();
	const notifications = [];
	let reloads = 0;
	const pi = {
		registerCommand(name, command) {
			commands.set(name, command);
		},
		on(event, handler) {
			handlers.set(event, handler);
		},
	};
	const context = {
		ui: {
			notify(message, level) {
				notifications.push({ message, level });
			},
		},
		async reload() {
			reloads += 1;
		},
	};
	return {
		pi,
		commands,
		handlers,
		notifications,
		context,
		reloads: () => reloads,
	};
}

describe("intercom session toggle", () => {
	test("normal sessions expose only the explicit toggle commands", () => {
		delete process.env[enabledEnv];
		const harness = createHarness();
		let intercomRegistrations = 0;

		registerIntercomToggle(harness.pi, {
			registerIntercom() {
				intercomRegistrations += 1;
			},
		});

		expect(intercomRegistrations).toBe(0);
		expect([...harness.commands.keys()]).toEqual(["intercom-on", "intercom-off"]);
		expect(harness.handlers.has("resources_discover")).toBeFalse();
	});

	test("intercom-on enables this process and reloads once", async () => {
		delete process.env[enabledEnv];
		const harness = createHarness();
		registerIntercomToggle(harness.pi, { registerIntercom() {} });

		await harness.commands.get("intercom-on").handler("", harness.context);

		expect(process.env[enabledEnv]).toBe("1");
		expect(harness.reloads()).toBe(1);
	});

	test("enabled sessions load intercom and its skill until intercom-off", async () => {
		process.env[enabledEnv] = "1";
		const harness = createHarness();
		let intercomRegistrations = 0;
		registerIntercomToggle(harness.pi, {
			registerIntercom() {
				intercomRegistrations += 1;
			},
		});

		expect(intercomRegistrations).toBe(1);
		expect(harness.handlers.get("resources_discover")().skillPaths[0]).toEndWith(
			"node_modules/pi-intercom/skills",
		);

		await harness.commands.get("intercom-off").handler("", harness.context);

		expect(process.env[enabledEnv]).toBeUndefined();
		expect(harness.reloads()).toBe(1);
	});

	test("reload preserves the toggle while a new session resets it", () => {
		process.env[enabledEnv] = "1";
		const harness = createHarness();
		registerIntercomToggle(harness.pi, { registerIntercom() {} });

		harness.handlers.get("session_shutdown")({ reason: "reload" });
		expect(process.env[enabledEnv]).toBe("1");

		harness.handlers.get("session_shutdown")({ reason: "new" });
		expect(process.env[enabledEnv]).toBeUndefined();
	});
});
