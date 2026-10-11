#!/usr/bin/env python3
"""HIL-017: tools/test_crc32_cross.py compares the C implementation with the TypeScript one and fails when they differ."""
import importlib.util
import io
import shutil
import subprocess
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "tools" / "test_crc32_cross.py"
spec = importlib.util.spec_from_file_location("test_crc32_cross", SCRIPT)
script = importlib.util.module_from_spec(spec)
spec.loader.exec_module(script)

AGREE = {
    "vectors": ["", "00", "313233343536"],
    "c": ["00000000", "d202ef8d", "cbf43926"],
    "ts": ["00000000", "d202ef8d", "cbf43926"],
    "zlib": ["00000000", "d202ef8d", "cbf43926"],
    "loader_verdicts": {"typescript_artifact": 0, "python_artifact": 0, "tampered_artifact": -5, "other_draft_artifact": -9, "no_counter_artifact": -9},
}


def run_main(result):
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        return script.main(runner=lambda: result)


class CrcCrossTests(unittest.TestCase):
    def test_agreement_is_success(self):
        self.assertEqual(run_main(AGREE), 0)

    def test_a_c_value_that_differs_from_the_typescript_one_is_a_failure(self):
        differing = {**AGREE, "c": ["00000000", "d202ef8d", "deadbeef"]}
        self.assertEqual(run_main(differing), 1)

    def test_a_loader_that_accepts_a_tampered_artifact_is_a_failure(self):
        tampered = {**AGREE, "loader_verdicts": {**AGREE["loader_verdicts"], "tampered_artifact": 0}}
        self.assertEqual(run_main(tampered), 1)

    def test_a_loader_that_refuses_a_good_artifact_is_a_failure(self):
        refused = {**AGREE, "loader_verdicts": {**AGREE["loader_verdicts"], "python_artifact": -3}}
        self.assertEqual(run_main(refused), 1)

    def test_a_comparison_of_nothing_is_a_failure(self):
        self.assertEqual(run_main({**AGREE, "vectors": [], "c": [], "ts": [], "zlib": []}), 1)

    @unittest.skipUnless(shutil.which("bun") and (shutil.which("cc") or shutil.which("gcc") or shutil.which("clang")), "needs bun and a C compiler")
    def test_the_real_comparison_agrees(self):
        done = subprocess.run([sys.executable, "-B", str(SCRIPT)], capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(done.returncode, 0, done.stdout[-600:] + done.stderr[-600:])
        self.assertIn("agree", done.stdout)


if __name__ == "__main__":
    unittest.main()
