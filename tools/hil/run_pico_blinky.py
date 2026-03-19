from zplc_tester import ZPLCTester
import time
import os
import subprocess
import tempfile

def compile_pico_blinky():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    project_dir = os.path.join(root_dir, "packages/zplc-ide/projects/pico_blinky")
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
        bytecode = handle.read()
    os.unlink(tmp_path)
    return bytecode

print("Compiling pico_blinky...")
bytecode = compile_pico_blinky()

print("Opening port and resetting...")
t = ZPLCTester()

try:
    print("Uploading bytecode to scheduler...")
    t.send("zplc stop")
    t.send(f"zplc sched load {len(bytecode)}")
    
    hex_data = bytecode.hex()
    chunk_size = 64
    for i in range(0, len(hex_data), chunk_size):
        chunk = hex_data[i : i + chunk_size]
        t.send(f"zplc sched data {chunk}", wait_for="OK:")

    print("Starting PLC...")
    print(t.send("zplc start"))

    print("Checking status...")
    print(t.send("zplc status"))
    
    print("Monitoring OPI for 5 seconds...")
    for _ in range(5):
        print(t.send("zplc dbg peek 0x1000 2"))
        time.sleep(1)

finally:
    pass

