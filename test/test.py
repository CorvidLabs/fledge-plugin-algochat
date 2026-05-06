#!/usr/bin/env python3
"""Tests for fledge-plugin-algochat that don't require localnet.

Covers contact CRUD, keygen, mainnet guard, state persistence, and
concurrent-write protection. Send/read round-trip tests are integration
and live in test/integration.py (requires localnet).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

PLUGIN_DIR = Path(__file__).resolve().parent.parent
BIN = PLUGIN_DIR / "bin" / "fledge-algochat"


class Runner:
    def __init__(self, work: Path, env: dict | None = None):
        self.work = work
        self.env = env or {}
        self._store_dir = work / ".fledge" / "_test_store"
        self._store_dir.mkdir(parents=True, exist_ok=True)

    def run(self, args: list[str]) -> str:
        captured: list[str] = []
        env = {**os.environ, **self.env}
        proc = subprocess.Popen(
            [str(BIN)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1, env=env,
        )
        assert proc.stdin and proc.stdout
        init = {
            "type": "init", "version": "fledge-v1",
            "project": {"root": str(self.work), "name": "t"},
            "plugin": {"dir": str(PLUGIN_DIR), "name": "fledge-plugin-algochat"},
            "command": "algochat", "args": args,
        }
        proc.stdin.write(json.dumps(init) + "\n"); proc.stdin.flush()
        for line in proc.stdout:
            line = line.rstrip("\n")
            if not line: continue
            try: msg = json.loads(line)
            except json.JSONDecodeError:
                captured.append(f"[malformed] {line}"); continue
            mtype = msg.get("type")
            if mtype == "output":
                captured.append(msg.get("text", ""))
            elif mtype == "log":
                captured.append(f"[{msg.get('level','log')}] {msg.get('message','')}")
            elif mtype == "exec":
                cmd = msg["command"]; cwd = msg.get("cwd") or str(self.work)
                r = subprocess.run(["bash", "-c", cmd], cwd=cwd,
                                   capture_output=True, text=True)
                resp = {"type": "response", "id": msg["id"],
                        "value": {"code": r.returncode,
                                  "stdout": r.stdout, "stderr": r.stderr}}
                proc.stdin.write(json.dumps(resp) + "\n"); proc.stdin.flush()
            elif mtype == "load":
                key = msg["key"]; f = self._store_dir / key
                val = f.read_text() if f.exists() else None
                resp = {"type": "response", "id": msg["id"], "value": val}
                proc.stdin.write(json.dumps(resp) + "\n"); proc.stdin.flush()
            elif mtype == "store":
                (self._store_dir / msg["key"]).write_text(msg.get("value", ""))
            elif mtype == "prompt":
                resp = {"type": "response", "id": msg["id"],
                        "value": msg.get("default", "")}
                proc.stdin.write(json.dumps(resp) + "\n"); proc.stdin.flush()
            elif mtype == "confirm":
                resp = {"type": "response", "id": msg["id"], "value": True}
                proc.stdin.write(json.dumps(resp) + "\n"); proc.stdin.flush()
        proc.wait(timeout=10)
        return "\n".join(captured)


passed = 0
failed = 0


def assert_in(name, output, needle):
    global passed, failed
    if needle in output:
        print(f"  ok {name}"); passed += 1
    else:
        print(f"  FAIL {name}")
        print(f"       expected: {needle!r}")
        for ln in output.splitlines(): print(f"         {ln}")
        failed += 1


def assert_not_in(name, output, needle):
    global passed, failed
    if needle not in output:
        print(f"  ok {name}"); passed += 1
    else:
        print(f"  FAIL {name} (unexpected {needle!r})"); failed += 1


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="fledge-algochat-test."))
    try:
        (work / ".fledge").mkdir()
        r = Runner(work)
        REAL_ADDR = "R3FSNPX7MWCX2HLDKA4MKW4CAXUDKC756AZVSBLYDK2S6OG7UFQ7RDUV6M"
        PSK = "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQT0="

        # --- Mainnet guard ---
        mainnet_runner = Runner(work, env={"ALGOD_URL": "https://mainnet-api.algonode.cloud"})
        out = mainnet_runner.run(["keygen", "--json"])
        assert_in("mainnet refused without override", out, "Refusing to run against mainnet")

        override_runner = Runner(work, env={
            "ALGOD_URL": "https://mainnet-api.algonode.cloud",
            "FLEDGE_ALGOCHAT_ALLOW_MAINNET": "1",
        })
        out = override_runner.run(["keygen", "--json"])
        assert_in("mainnet allowed with override", out, '"publicKey":')

        # --- Keygen ---
        out = r.run(["keygen", "--json"])
        assert_in("keygen returns publicKey", out, '"publicKey":')

        # --- Contact CRUD ---
        out = r.run(["contacts", "add", "alice", REAL_ADDR, PSK, "--json"])
        assert_in("contacts add", out, '"action":"add"')

        out = r.run(["contacts", "list", "--json"])
        assert_in("contacts list", out, '"name":"alice"')

        # --- Bad address rejected ---
        out = r.run(["contacts", "add", "bad", "not-a-real-address", PSK])
        assert_in("bad address rejected", out, "Invalid Algorand address")

        # PSK length validation: the plugin currently accepts any string;
        # the lib derives the same-length key regardless. The send/read
        # round trip is what would catch a mismatched length.

        # --- Concurrent contact-add: stress the lock + re-read ---
        # Each thread runs in its own subprocess with its own runner;
        # they all target the same state file via the lock.
        def add_one(i: int) -> str:
            return r.run(["contacts", "add", f"agent{i}", REAL_ADDR, PSK, "--json"])

        with ThreadPoolExecutor(max_workers=8) as ex:
            list(ex.map(add_one, range(8)))

        out = r.run(["contacts", "list", "--json"])
        for i in range(8):
            assert_in(f"concurrent add: agent{i} present", out, f'"name":"agent{i}"')

        # --- State file mode ---
        global passed, failed
        state_file = work / ".fledge" / "algochat-state.json"
        if state_file.exists():
            mode = oct(state_file.stat().st_mode)[-3:]
            if mode == "600":
                print("  ok state file mode is 0600"); passed += 1
            else:
                print(f"  FAIL state file mode is 0{mode}, expected 0600"); failed += 1
        else:
            print("  FAIL state file missing"); failed += 1

        # --- Remove contact ---
        out = r.run(["contacts", "remove", "alice", "--json"])
        assert_in("contacts remove ok", out, '"action":"remove"')
        out = r.run(["contacts", "list", "--json"])
        assert_not_in("contacts remove: alice gone", out, '"name":"alice"')

    finally:
        shutil.rmtree(work, ignore_errors=True)

    print()
    print(f"tests: {passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
