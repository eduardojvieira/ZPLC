#!/usr/bin/env python3
"""Tests of the size gate and the Twister summary in fwtest.py (VF-025).

Run: python3 tools/firmware-test/test_fwtest.py

The size gate is proven with a budget set one byte under the measured size:
a gate that cannot fail would also pass a build that grew.
"""

import contextlib
import io
import json
import sys
import tempfile
import pathlib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fwtest  # noqa: E402

BUILD_LOG = """\
[246/246] Linking C executable zephyr/zephyr.elf
Memory region         Used Size  Region Size  %age Used
      BOOT_FLASH:         256 B        256 B    100.00%
           FLASH:      141900 B    2096896 B      6.77%
             RAM:      164720 B       264 KB     62.00%
            DTCM:          16 KB        64 KB     25.00%
        IDT_LIST:           0 B        32 KB      0.00%
Generating files from zephyr.elf for board: rpi_pico/rp2040
"""

POLICY = {"percent": 5, "round_to_bytes": 256}


def budget_file(directory: Path, flash_limit: int, ram_limit: int, regions: dict | None = None) -> Path:
    path = directory / "size-budget.json"
    path.write_text(
        json.dumps(
            {
                "margin_policy": POLICY,
                "boards": {
                    "pico": {
                        "zephyr_board": "rpi_pico/rp2040",
                        "regions": regions or {"flash": ["BOOT_FLASH", "FLASH"], "ram": ["RAM", "DTCM"]},
                        "measured": {"flash": 0, "ram": 0},
                        "budget": {"flash": flash_limit, "ram": ram_limit},
                    }
                },
            }
        )
    )
    return path


def run_size(budget: Path, logs: Path, **kwargs) -> tuple[int, str]:
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        rc = fwtest.size_report(budget, logs, kwargs.get("boards", []), kwargs.get("rebaseline", False))
    return rc, out.getvalue()


class ParseRegions(unittest.TestCase):
    def test_reads_bytes_and_kilobytes(self) -> None:
        regions = fwtest.parse_regions(BUILD_LOG)
        self.assertEqual(regions["FLASH"], 141900)
        self.assertEqual(regions["BOOT_FLASH"], 256)
        self.assertEqual(regions["DTCM"], 16 * 1024)
        self.assertEqual(regions["IDT_LIST"], 0)

    def test_ignores_text_outside_the_table(self) -> None:
        self.assertEqual(fwtest.parse_regions("FLASH: 1 B 2 B 3%\nnothing here\n"), {})


class SizeGate(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        (self.dir / "pico.log").write_text(BUILD_LOG)
        self.flash = 141900 + 256
        self.ram = 164720 + 16 * 1024

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_exactly_at_budget_passes(self) -> None:
        rc, out = run_size(budget_file(self.dir, self.flash, self.ram), self.dir)
        self.assertEqual(rc, 0, out)

    def test_one_byte_over_budget_fails_and_says_which(self) -> None:
        rc, out = run_size(budget_file(self.dir, self.flash - 1, self.ram), self.dir)
        self.assertEqual(rc, 1, out)
        self.assertIn("flash", out)
        self.assertIn("+1", out)

    def test_ram_over_budget_fails(self) -> None:
        rc, out = run_size(budget_file(self.dir, self.flash, self.ram - 1), self.dir)
        self.assertEqual(rc, 1, out)
        self.assertIn("ram", out)

    def test_region_missing_from_the_build_fails(self) -> None:
        budget = budget_file(self.dir, self.flash, self.ram, {"flash": ["FLASH"], "ram": ["NOPE"]})
        rc, out = run_size(budget, self.dir)
        self.assertEqual(rc, 1, out)
        self.assertIn("not in the build output", out)

    def test_missing_build_log_fails(self) -> None:
        (self.dir / "pico.log").unlink()
        rc, out = run_size(budget_file(self.dir, self.flash, self.ram), self.dir)
        self.assertEqual(rc, 1, out)

    def test_board_without_a_budget_fails(self) -> None:
        rc, out = run_size(budget_file(self.dir, self.flash, self.ram), self.dir, boards=["unknown"])
        self.assertEqual(rc, 1, out)
        self.assertIn("no budget recorded", out)

    def test_single_log_is_found_by_zephyr_board(self) -> None:
        budget = budget_file(self.dir, self.flash - 1, self.ram)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = fwtest.size_report(budget, None, [], False, self.dir / "pico.log", "rpi_pico/rp2040")
        self.assertEqual(rc, 1, out.getvalue())

    def test_rebaseline_applies_the_margin_policy(self) -> None:
        budget = budget_file(self.dir, 1, 1)
        rc, out = run_size(budget, self.dir, rebaseline=True)
        self.assertEqual(rc, 0, out)
        board = json.loads(budget.read_text())["boards"]["pico"]
        self.assertEqual(board["measured"], {"flash": self.flash, "ram": self.ram})
        self.assertEqual(board["budget"]["flash"], fwtest.margin_budget(self.flash, POLICY))
        self.assertGreaterEqual(board["budget"]["flash"], self.flash * 105 // 100)
        self.assertEqual(board["budget"]["flash"] % 256, 0)


class TwisterSummary(unittest.TestCase):
    def report(self, suites: list[dict]) -> Path:
        directory = Path(tempfile.mkdtemp())
        path = directory / "twister.json"
        path.write_text(json.dumps({"testsuites": suites}))
        return path

    def run_summary(self, suites: list[dict]) -> tuple[int, str]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = fwtest.twister_summary("qemu-m3", self.report(suites))
        return rc, out.getvalue()

    @staticmethod
    def suite(name: str, status: str, cases: int = 3, reason: str = "") -> dict:
        return {"name": name, "status": status, "reason": reason, "testcases": [{"status": status}] * cases}

    def test_all_passed(self) -> None:
        rc, out = self.run_summary([self.suite("a", "passed"), self.suite("b", "passed")])
        self.assertEqual(rc, 0, out)

    def test_a_failed_scenario_fails(self) -> None:
        rc, out = self.run_summary([self.suite("a", "passed"), self.suite("b", "failed", reason="Timeout")])
        self.assertEqual(rc, 1, out)
        self.assertIn("FAIL qemu-m3", out)

    def test_a_skipped_scenario_is_not_a_pass(self) -> None:
        rc, out = self.run_summary([self.suite("a", "passed"), self.suite("b", "skipped", reason="RAM overflow")])
        self.assertEqual(rc, 1, out)
        self.assertIn("RAM overflow", out)

    def test_filtered_scenarios_are_not_counted(self) -> None:
        rc, out = self.run_summary([self.suite("a", "passed"), self.suite("b", "filtered")])
        self.assertEqual(rc, 0, out)
        self.assertIn("1 filtered out", out)

    def test_nothing_ran_is_a_failure(self) -> None:
        rc, out = self.run_summary([self.suite("a", "filtered")])
        self.assertEqual(rc, 1, out)


class StaleBuildDirectory(unittest.TestCase):
    """The workspace is reused across worktrees: a build dir of another checkout must not stop cmake (found on a
    second checkout where host, host32 and app all failed with "source does not match the source")."""

    def run_helper(self, home_in_cache: str | None, source: str) -> bool:
        import subprocess, tempfile
        with tempfile.TemporaryDirectory() as tmp:
            build = pathlib.Path(tmp) / "build"
            build.mkdir()
            if home_in_cache is not None:
                (build / "CMakeCache.txt").write_text(f"CMAKE_HOME_DIRECTORY:INTERNAL={home_in_cache}\n")
            (build / "marker").write_text("x")
            # run.sh in library mode defines its helpers and returns; the helper under test is called, not sliced out.
            script = pathlib.Path(__file__).parent / "run.sh"
            subprocess.run(
                ["bash", "-c", 'ZPLC_FWTEST_LIBRARY=1 . "$0" && fresh_cmake_dir "$1" "$2"', str(script), str(build), source],
                check=True,
            )
            return (build / "marker").exists()

    def test_a_build_dir_of_another_checkout_is_dropped(self) -> None:
        self.assertFalse(self.run_helper("/old/checkout/firmware/lib/zplc_core", "/new/checkout/firmware/lib/zplc_core"))

    def test_a_build_dir_of_this_checkout_is_kept(self) -> None:
        self.assertTrue(self.run_helper("/same/firmware/lib/zplc_core", "/same/firmware/lib/zplc_core"))

    def test_a_dir_without_a_cache_is_kept(self) -> None:
        self.assertTrue(self.run_helper(None, "/any"))


class RunScriptModes(unittest.TestCase):
    """The mode list of run.sh: a mode that is listed must be accepted, and an unknown one refused before any work."""

    SCRIPT = pathlib.Path(__file__).parent / "run.sh"

    def run_script(self, *args: str):
        import subprocess
        return subprocess.run(["bash", str(self.SCRIPT), *args], capture_output=True, text=True, check=False)

    def test_help_lists_the_tidy_mode_and_says_it_is_not_part_of_all(self) -> None:
        done = self.run_script("--help")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertRegex(done.stdout, r"(?m)^  tidy +clang-tidy")
        self.assertIn("every mode above except tidy", done.stdout)

    def run_tidy(self, status: int, extra: str = ""):
        """run.sh tidy with a python3 that stands in for tools/ci/run_clang_tidy.py: the mode must call it and report
        what it said, whatever clang-tidy is on this machine."""
        import os, subprocess, tempfile
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "ws" / "zephyr").mkdir(parents=True)
            (root / "ws" / "zephyr" / "VERSION").write_text("VERSION_MAJOR = 4\n")
            (root / "bin").mkdir()
            fake = root / "bin" / "python3"
            fake.write_text(f'#!/usr/bin/env bash\necho "clang-tidy: host pass clean"\n{extra}\nexit {status}\n')
            fake.chmod(0o755)
            env = dict(os.environ, ZPLC_FW_WS=str(root / "ws"), PATH=f"{root / 'bin'}:{os.environ['PATH']}")
            return subprocess.run(["bash", str(self.SCRIPT), "tidy"], capture_output=True, text=True, check=False, env=env)

    def test_tidy_passes_when_the_analysis_is_clean_and_says_when_the_zephyr_pass_was_skipped(self) -> None:
        done = self.run_tidy(0, 'echo "clang-tidy: Zephyr pass skipped, no west build tree."')
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertRegex(done.stdout, r"PASS tidy .*Zephyr pass skipped")

    def test_tidy_fails_on_a_finding_and_says_so_apart_from_a_tool_that_could_not_run(self) -> None:
        found = self.run_tidy(1)
        self.assertEqual(found.returncode, 1)
        self.assertRegex(found.stdout, r"FAIL tidy clang-tidy reported findings")
        missing = self.run_tidy(2)
        self.assertEqual(missing.returncode, 1)
        self.assertRegex(missing.stdout, r"FAIL tidy clang-tidy could not run")

    def test_an_unknown_mode_is_refused(self) -> None:
        done = self.run_script("lint")
        self.assertEqual(done.returncode, 2)
        self.assertIn("unknown mode 'lint'", done.stderr)


if __name__ == "__main__":
    unittest.main()
