"""Uploading a project twice leaves one task, not two (the scheduler replaces the tasks of the first upload).

The project pico_blinky is compiled as a workspace by the repository compiler and uploaded through the scheduler
commands; the tasks the device reports after each upload must be exactly one. Exits non-zero when they are not (HIL-004).
"""
import re

from zplc_tester import ZPLCTester, cli

PROJECT = "packages/zplc-ide/projects/pico_blinky"


def upload_sched_bytecode(tester, bytecode):
    """Replace the program through `zplc sched load` and `zplc sched data`; the answers of the device are the result."""
    tester.send("zplc stop")
    reply = tester.send(f"zplc sched load {len(bytecode)}", wait_for="OK:", timeout=10.0)
    if "OK:" not in reply:
        return f"sched load failed: {reply.strip()}"
    hex_data = bytes(bytecode).hex()
    for at in range(0, len(hex_data), 32):
        reply = tester.send(f"zplc sched data {hex_data[at : at + 32]}", wait_for="OK:", timeout=5.0)
        if "OK:" not in reply:
            return f"sched data failed at byte {at // 2}: {reply.strip()}"
    return None


def active_tasks(tester):
    match = re.search(r'"active_tasks"\s*:\s*(\d+)', tester.send("zplc status --json"))
    return int(match.group(1)) if match else None


def run_test(tester=None):
    tester = tester or ZPLCTester()
    bytecode = tester.compile_project(PROJECT)
    for attempt in ("first", "second"):
        problem = upload_sched_bytecode(tester, bytecode)
        tester.check(f"the {attempt} upload is accepted", problem is None, problem or "")
        tester.settle(0.2)
        tester.check_eq(f"one active task after the {attempt} upload", active_tasks(tester), 1)
    tester.close()
    return tester.finish()


if __name__ == "__main__":
    cli(run_test)
