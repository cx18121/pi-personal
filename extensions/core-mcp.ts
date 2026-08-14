import { createMcpAdapter } from "pi-mcp-adapter";

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

export default createMcpAdapter({
	config: {
		mcpServers: {
			linear: {
				url: "https://mcp.linear.app/mcp/readonly",
				auth: "oauth",
				lifecycle: "lazy",
				directTools: false,
			},
			exa: {
				url: "https://mcp.exa.ai/mcp",
				lifecycle: "lazy",
				directTools: false,
			},
			betterstack: {
				url: "https://mcp.betterstack.com",
				auth: "oauth",
				oauth: {
					scope: "read",
				},
				lifecycle: "lazy",
				directTools: false,
				excludeTools: mutatingBetterStackTools,
			},
			ecotone: {
				url: "https://docs.ecotone.tech/~gitbook/mcp",
				lifecycle: "lazy",
				directTools: false,
			},
			context7: {
				url: "https://mcp.context7.com/mcp/oauth",
				auth: "oauth",
				lifecycle: "lazy",
				directTools: false,
			},
			slack: {
				url: "https://mcp.slack.com/mcp",
				auth: "oauth",
				oauth: {
					clientId: "9158050576082.11832346008660",
					clientSecret:
						"!security find-generic-password -s pi-slack-mcp-client-secret -w",
					redirectUri: "http://localhost:3118/callback",
					scope: slackScopes,
				},
				lifecycle: "lazy",
				directTools: false,
				excludeTools: mutatingSlackTools,
			},
		},
		settings: {
			hostConfigDiscovery: "off",
			mcpFooterStatus: "off",
			notifyOnStartupConnect: false,
			directTools: false,
			scriptMode: false,
			autoAuth: false,
			sampling: false,
			elicitation: false,
			outputGuard: true,
		},
	},
});
