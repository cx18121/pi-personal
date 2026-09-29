import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const mutatingBetterStackTools = [
	"create_*",
	"update_*",
	"remove_*",
	"delete_*",
	"add_*",
	"configure_*",
	"set_*",
	"move_*",
	"import_*",
	"invite_*",
	"change_*",
	"acknowledge_*",
	"escalate_*",
	"resolve_*",
	"reopen_*",
	"pause_*",
];

const slackScopes = [
	"search:read.public",
	"search:read.private",
	"search:read.mpim",
	"search:read.im",
	"search:read.files",
	"search:read.users",
	"files:read",
	"emoji:read",
	"channels:history",
	"groups:history",
	"mpim:history",
	"im:history",
	"canvases:read",
	"users:read",
	"users:read.email",
	"channels:read",
	"groups:read",
	"mpim:read",
].join(" ");

const mutatingSlackTools = [
	"send_*",
	"create_*",
	"update_*",
	"add_*",
	"remove_*",
	"delete_*",
	"archive_*",
];

export default function (pi: ExtensionAPI) {
	const servers = {
		linear: {
			url: "https://mcp.linear.app/mcp",
			exposure: "deferred",
		},
		exa: {
			url: "https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,web_search_advanced_exa,agent_run",
			headers: {
				"x-api-key": "!/usr/bin/security find-generic-password -a charliexue -s pi-web-access-exa -w",
			},
			timeout: 480,
			exposure: "hidden",
			toolExposure: {
				web_search_exa: "deferred",
				web_fetch_exa: "deferred",
				web_search_advanced_exa: "deferred",
				agent_run: "deferred",
			},
		},
		betterstack: {
			url: "https://mcp.betterstack.com",
			oauth: { scope: "read" },
			exposure: "deferred",
			toolExposure: Object.fromEntries(mutatingBetterStackTools.map((name) => [name, "hidden" as const])),
		},
		ecotone: {
			url: "https://docs.ecotone.tech/~gitbook/mcp",
			exposure: "deferred",
		},
		clickhouse: {
			command: "/usr/bin/python3",
			args: [
				"-I",
				fileURLToPath(new URL("../scripts/clickhouse-mcp.py", import.meta.url)),
				"/Users/charliexue/.local/share/mise/installs/ubi-astral-sh-uv/0.11.28/uv",
				"tool", "run", "--python", "3.12", "mcp-clickhouse==0.6.0",
			],
			env: {
				CLICKHOUSE_HOST: "pa2zn43s8j.eu-central-1.aws.clickhouse.cloud",
				CLICKHOUSE_PORT: "8443",
				CLICKHOUSE_USER: "pango_mcp_readonly",
				CLICKHOUSE_PASSWORD:
					"!/usr/bin/security find-generic-password -a pango_mcp_readonly -s pi-clickhouse-readonly -w",
				CLICKHOUSE_DATABASE: "pango-analytics",
				CLICKHOUSE_SECURE: "true",
				CLICKHOUSE_VERIFY: "true",
				CLICKHOUSE_ALLOW_WRITE_ACCESS: "false",
				CLICKHOUSE_MCP_SERVER_TRANSPORT: "stdio",
				CHDB_ENABLED: "false",
			},
			exposure: "deferred",
		},
		context7: {
			url: "https://mcp.context7.com/mcp/oauth",
			exposure: "deferred",
		},
		pencil: {
			command: "/Applications/Pen.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64",
			args: ["--app", "desktop"],
			exposure: "deferred",
		},
		slack: {
			url: "https://mcp.slack.com/mcp",
			oauth: {
				clientId: "9158050576082.11832346008660",
				clientSecret: "!security find-generic-password -s pi-slack-mcp-client-secret -w",
				callbackUrl: "http://localhost:3118/callback",
				scope: slackScopes,
			},
			exposure: "deferred",
			toolExposure: Object.fromEntries(mutatingSlackTools.flatMap((name) => [
				[name, "hidden" as const],
				[`slack_${name}`, "hidden" as const],
			])),
		},
	} satisfies Record<string, Parameters<ExtensionAPI["registerMcpServer"]>[1]>;

	for (const [name, config] of Object.entries(servers)) {
		pi.registerMcpServer(name, config);
	}
}
