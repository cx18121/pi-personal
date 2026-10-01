"""Manual offline Enter-key probe. Run: python3 test/subagent-idle-tui-probe.py"""
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time

root = Path(__file__).resolve().parents[1]
provider = root / "test/fixtures/subagent-idle-provider.ts"
policy = root / "extensions/subagent-idle.ts"
extension = Path.home() / ".pi/agent/npm/node_modules/@ogulcancelik/pi-codex-subagents/index.ts"

with tempfile.TemporaryDirectory(prefix="pi-wait-tui-") as tmp:
    directory = Path(tmp)
    agent = directory / "agent"
    (agent / "pi-codex-subagents").mkdir(parents=True)
    (agent / "settings.json").write_text(json.dumps({
        "quietStartup": True, "compaction": {"enabled": False}, "retry": {"enabled": False},
    }))
    (agent / "pi-codex-subagents/config.json").write_text(json.dumps({
        "retentionDays": 0, "defaults": {"extensions": [str(provider)]},
    }))
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
    env = {**os.environ, "TERM": "xterm-256color", "PI_CODING_AGENT_DIR": str(agent),
           "PI_SUBAGENT_TEMP_DIR": str(directory / "sockets"), "PI_WAIT_PROBE_DIR": tmp, "PI_OFFLINE": "1"}
    proc = subprocess.Popen([
        "pi", "--offline", "--no-session", "-ne", "-nc", "-ns", "-np",
        "--provider", "wait-probe", "--model", "fixture", "--thinking", "off",
        "-e", str(provider), "-e", str(extension), "-e", str(policy),
    ], cwd=tmp, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    output = bytearray()

    def records(filename):
        path = directory / filename
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def drain():
        if select.select([master], [], [], 0.01)[0]:
            try:
                data = os.read(master, 65536)
            except OSError:
                return
            output.extend(data)
            # Answer terminal queries only. Never send Escape as a user action.
            if b"\x1b[6n" in data:
                os.write(master, b"\x1b[1;1R")

    def until(predicate, seconds=10):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            drain()
            if predicate():
                return
            if proc.poll() is not None:
                break
        raise AssertionError(output.decode(errors="replace")[-5000:])

    def plain_output():
        return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", output.decode(errors="replace"))

    try:
        # session_start occurs after Pi enables its real editor submit handler.
        until(lambda: (directory / "tui-ready").exists())
        os.write(master, b"START_ONE\r")
        until(lambda: any(r["pid"] == proc.pid for r in records("settled.jsonl"))
              and "BACKGROUND_TASK_PENDING" in plain_output())
        assert not any(r["pid"] == proc.pid and r["name"].startswith("wait_") for r in records("tools.jsonl"))
        print("PASS TUI: parent settled before user input while the child remained running.")
        started = time.monotonic()
        os.write(master, b"QUESTION_TUI\r")
        until(lambda: "REPLIED_TO_QUESTION_TUI" in plain_output(), seconds=3)
        infos = [json.loads(path.read_text()) for path in (agent / "pi-codex-subagents/runs").glob("*/*.info.json")]
        assert len(infos) == 1 and infos[0]["status"] == "running", infos
        os.kill(infos[0]["childProcess"]["pid"], 0)
        requests = [r for r in records("requests.jsonl") if r["pid"] == proc.pid]
        before = requests[-2]["messages"]
        assert requests[-1]["messages"][:len(before)] == before, "Existing transcript prefix changed"
        print(f"PASS TUI Enter: normal idle input answered in {round((time.monotonic() - started) * 1000)}ms; child still running; prefix unchanged.")
        (directory / "CHILD_A.release").touch()
        until(lambda: "CHILD_RESULT_DELIVERED" in plain_output())
        print("PASS TUI: child result arrived after answering the new message.")
    finally:
        if proc.poll() is None:
            os.write(master, b"\x04")
            deadline = time.monotonic() + 3
            while proc.poll() is None and time.monotonic() < deadline:
                drain()
            if proc.poll() is None:
                proc.send_signal(signal.SIGTERM)
                deadline = time.monotonic() + 3
                while proc.poll() is None and time.monotonic() < deadline:
                    drain()
            if proc.poll() is None:
                proc.kill()
            proc.wait(timeout=3)
        os.close(master)
