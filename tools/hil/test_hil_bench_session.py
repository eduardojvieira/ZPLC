"""The bench session script only prepares tmux (AGENTS.md rule 8): the owner types."""

import os
import subprocess
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "bench-session.sh"
FORBIDDEN = [
    "send-keys",
    "west flash",
    "esptool",
    "picotool",
    "openocd",
    "bench.py",
    "plant_io_bench.py",
    "minicom",
    "screen /dev",
]


class BenchSessionTest(unittest.TestCase):
    def print_lines(self):
        env = dict(os.environ, REPO="/work/repo", HOME="/home/owner")
        env.pop("TMPDIR", None)
        out = subprocess.run(
            ["sh", str(SCRIPT), "--print"], env=env, capture_output=True, text=True, check=True
        ).stdout
        return out.splitlines()

    def test_session_windows_start_dir_and_tmpdir(self):
        lines = self.print_lines()
        self.assertEqual(len(lines), 3)
        self.assertTrue(all(line.startswith("tmux ") for line in lines))
        self.assertRegex(lines[0], r"^tmux new-session -d -s bench -n esp32s3 ")
        self.assertRegex(lines[1], r"^tmux new-window -t bench -n pico ")
        self.assertRegex(lines[2], r"^tmux new-window -t bench -n record ")
        for line in lines:
            self.assertIn("-c /work/repo", line)
            self.assertRegex(line, r"-e TMPDIR=/home/owner/\.cache/zplc-tmp")

    def test_print_lists_only_the_session_and_its_windows(self):
        # The script runs exactly what --print lists (one run() helper), so this is what it does: create, never type or run.
        lines = self.print_lines()
        self.assertEqual(len(lines), 3)
        self.assertTrue(lines[0].startswith("tmux new-session -d -s bench "))
        for line in lines[1:]:
            self.assertTrue(line.startswith("tmux new-window -t bench "))
        for line in lines:
            self.assertNotIn("send-keys", line)
            for word in FORBIDDEN:
                self.assertNotIn(word, line)

if __name__ == "__main__":
    unittest.main()
