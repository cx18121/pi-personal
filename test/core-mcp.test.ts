import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, McpServerConfig } from "@earendil-works/pi-coding-agent";
import { getMcpToolExposure, validateMcpServerConfig } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/mcp-servers.js";
import registerMcp from "../extensions/core-mcp.ts";

function registrations() {
	const servers = new Map<string, McpServerConfig>();
	registerMcp({ registerMcpServer: (name, config) => servers.set(name, config) } as ExtensionAPI);
	return servers;
}

describe("native MCP configuration", () => {
	test("registers all eight servers with valid native configurations", () => {
		const servers = registrations();
		expect([...servers.keys()]).toEqual([
			"linear", "exa", "betterstack", "ecotone", "clickhouse", "context7", "pencil", "slack",
		]);
		for (const [name, config] of servers) {
			expect(validateMcpServerConfig(name, config)).not.toBeString();
			expect(config.exposure).toBe(name === "exa" ? "hidden" : "deferred");
		}
	});

	test("hides every previously excluded mutation and keeps reads discoverable", () => {
		const servers = registrations();
		const blocked = {
			betterstack: ["create", "update", "remove", "delete", "add", "configure", "set", "move", "import", "invite", "change", "acknowledge", "escalate", "resolve", "reopen", "pause"],
			slack: ["send", "create", "update", "add", "remove", "delete", "archive"],
		};
		for (const [name, verbs] of Object.entries(blocked)) {
			const config = servers.get(name)!;
			for (const verb of verbs) {
				expect(getMcpToolExposure(config, `${verb}_example`)).toBe("hidden");
				if (name === "slack") expect(getMcpToolExposure(config, `slack_${verb}_example`)).toBe("hidden");
			}
			expect(getMcpToolExposure(config, "get_example")).toBe("deferred");
		}
		expect(getMcpToolExposure(servers.get("slack")!, "slack_read_thread")).toBe("deferred");
	});

	test("preserves the Exa allowlist and timeout units", () => {
		const config = registrations().get("exa")!;
		for (const tool of ["web_search_exa", "web_fetch_exa", "web_search_advanced_exa", "agent_run"]) {
			expect(getMcpToolExposure(config, tool)).toBe("deferred");
		}
		expect(getMcpToolExposure(config, "new_unapproved_tool")).toBe("hidden");
		expect(config.timeout).toBe(480);
	});

	test("preserves OAuth scope and the registered Slack callback", () => {
		const servers = registrations();
		const betterstack = servers.get("betterstack")!;
		const slack = servers.get("slack")!;
		if (!("url" in betterstack) || !("url" in slack)) throw new Error("Expected HTTP servers");
		expect(betterstack.oauth?.scope).toBe("read");
		expect(slack.oauth?.callbackUrl).toBe("http://localhost:3118/callback");
		expect(slack.oauth?.scope?.split(" ")).toHaveLength(18);
		expect(slack.oauth?.scope).not.toContain("write");
		expect(slack.oauth?.clientSecret).toStartWith("!");
	});

	test("the ClickHouse child receives only allowed environment variables", () => {
		const config = registrations().get("clickhouse")!;
		if (!("command" in config)) throw new Error("Expected stdio server");
		expect(config.command).toBe("/usr/bin/python3");
		expect(config.args?.[0]).toBe("-I");
		expect(config.args?.[2]).toEndWith("/uv");
		expect(config.args).toContain("mcp-clickhouse==0.6.0");
		expect(config.env?.CLICKHOUSE_ALLOW_WRITE_ACCESS).toBe("false");
		expect(config.env?.CHDB_ENABLED).toBe("false");
		const launcher = fileURLToPath(new URL("../scripts/clickhouse-mcp.py", import.meta.url));
		const child = spawnSync("/usr/bin/python3", ["-I", launcher, "/usr/bin/python3", "-I", "-c", "import json, os; print(json.dumps(dict(os.environ)))"], {
			encoding: "utf8",
			env: {
				HOME: "/tmp",
				PATH: "/untrusted/project/bin",
				AWS_SECRET_ACCESS_KEY: "synthetic-unrelated-secret",
				CLICKHOUSE_UNKNOWN_SETTING: "do-not-inherit",
				PYTHONPATH: "/untrusted/project",
				...Object.fromEntries(Object.entries(config.env!).map(([key, value]) => [key, value.startsWith("!") ? "synthetic-password" : value])),
			},
		});
		expect(child.status).toBe(0);
		const env = JSON.parse(child.stdout);
		expect(env.PATH).toBe("/usr/bin:/bin");
		expect(env.CLICKHOUSE_PASSWORD).toBe("synthetic-password");
		expect(env.CLICKHOUSE_USER).toBe("pango_mcp_readonly");
		for (const key of ["AWS_SECRET_ACCESS_KEY", "CLICKHOUSE_UNKNOWN_SETTING", "PYTHONPATH"]) expect(env[key]).toBeUndefined();
	});
});
