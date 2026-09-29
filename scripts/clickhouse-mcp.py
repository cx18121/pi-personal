"""Start the ClickHouse MCP server without inheriting project credentials or settings."""

import os
import sys

keys = (
    "HOME",
    "TMPDIR",
    "CLICKHOUSE_HOST",
    "CLICKHOUSE_PORT",
    "CLICKHOUSE_USER",
    "CLICKHOUSE_PASSWORD",
    "CLICKHOUSE_DATABASE",
    "CLICKHOUSE_SECURE",
    "CLICKHOUSE_VERIFY",
    "CLICKHOUSE_ALLOW_WRITE_ACCESS",
    "CLICKHOUSE_MCP_SERVER_TRANSPORT",
    "CHDB_ENABLED",
)
env = {key: os.environ[key] for key in keys if key in os.environ}
env["PATH"] = "/usr/bin:/bin"
os.execve(sys.argv[1], sys.argv[1:], env)
