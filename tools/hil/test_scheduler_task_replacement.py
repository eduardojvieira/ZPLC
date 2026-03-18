import json
import os
import re
import subprocess
import sys
import tempfile
import time

from zplc_tester import ZPLCTester


def compile_project_zplc(project_dir: str) -> bytes:
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    script = """
import { readFileSync, writeFileSync } from 'node:fs';
import { compileMultiTaskProject } from './packages/zplc-ide/src/compiler/index.ts';

const projectDir = process.env.ZPLC_PROJECT_DIR;
const outFile = process.env.ZPLC_OUT_FILE;
const projectConfig = JSON.parse(readFileSync(`${projectDir}/zplc.json`, 'utf8'));
const programSources = [
  {
    name: 'main.st',
    language: 'ST',
    content: readFileSync(`${projectDir}/src/main.st`, 'utf8'),
  },
];
const result = compileMultiTaskProject(projectConfig, programSources);
writeFileSync(outFile, result.zplcFile);
"""

    with tempfile.NamedTemporaryFile(suffix=".zplc", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        subprocess.run(
            ["bun", "-e", script],
            cwd=root_dir,
            check=True,
            env={
                **os.environ,
                "ZPLC_PROJECT_DIR": project_dir,
                "ZPLC_OUT_FILE": tmp_path,
            },
        )
        with open(tmp_path, "rb") as handle:
            return handle.read()
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def upload_sched_bytecode(tester: ZPLCTester, bytecode: bytes) -> None:
    tester.send("zplc stop")

    resp = tester.send(f"zplc sched load {len(bytecode)}", wait_for="OK:", timeout=10.0)
    if "OK:" not in resp:
        raise AssertionError(f"sched load failed: {resp}")

    hex_data = bytecode.hex()
    chunk_size = 32
    for i in range(0, len(hex_data), chunk_size):
        chunk = hex_data[i : i + chunk_size]
        resp = tester.send(f"zplc sched data {chunk}", wait_for="OK:", timeout=5.0)
        if "OK:" not in resp:
            raise AssertionError(
                f"sched data failed at chunk {i // chunk_size}: {resp}"
            )


def get_active_tasks(tester: ZPLCTester) -> int:
    resp = tester.send("zplc status --json", wait_for="zplc:~$", timeout=5.0)
    match = re.search(r'"active_tasks"\s*:\s*(\d+)', resp)
    if match:
        return int(match.group(1))
    raise AssertionError(f"Could not parse active_tasks from response: {resp}")


def run_test() -> None:
    tester = ZPLCTester()
    try:
        project_dir = os.path.join(
            os.path.dirname(__file__),
            "../../packages/zplc-ide/projects/pico_blinky",
        )
        bytecode = compile_project_zplc(os.path.abspath(project_dir))

        print("Uploading project (first pass)...")
        upload_sched_bytecode(tester, bytecode)
        time.sleep(0.2)
        active_tasks = get_active_tasks(tester)
        print(f"Active tasks after first upload: {active_tasks}")
        if active_tasks != 1:
            raise AssertionError(
                f"Expected 1 active task after first upload, got {active_tasks}"
            )

        print("Uploading project again (replacement semantics)...")
        upload_sched_bytecode(tester, bytecode)
        time.sleep(0.2)
        active_tasks = get_active_tasks(tester)
        print(f"Active tasks after second upload: {active_tasks}")
        if active_tasks != 1:
            raise AssertionError(
                f"Expected 1 active task after second upload, got {active_tasks}"
            )

        print("RESULT: scheduler upload correctly replaces stale tasks")
    finally:
        tester.close()


if __name__ == "__main__":
    try:
        run_test()
    except Exception as exc:
        print(f"FAIL: {exc}")
        sys.exit(1)
