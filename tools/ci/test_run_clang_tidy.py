"""Tests of the pure parts of tools/ci/run_clang_tidy.py (VF-018): which files the host pass analyses, how a GCC
cross-compile command is turned into a clang one, how findings are read, and how the firmware/app baseline ratchets.

    python3 -B tools/ci/test_run_clang_tidy.py
"""
from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("run_clang_tidy", HERE / "run_clang_tidy.py")
tidy = importlib.util.module_from_spec(SPEC)
sys.modules["run_clang_tidy"] = tidy
SPEC.loader.exec_module(tidy)

ROOT = "/work/zplc"


class HostUnits(unittest.TestCase):
    def test_takes_the_core_the_posix_hal_and_the_host_application_once(self) -> None:
        database = [
            {"file": f"{ROOT}/firmware/lib/zplc_core/src/core/zplc_core.c"},
            {"file": f"{ROOT}/firmware/lib/zplc_core/src/core/zplc_core.c"},  # compiled again with test defines
            {"file": f"{ROOT}/firmware/lib/zplc_core/src/hal/posix/zplc_hal_posix.c"},
            {"file": f"{ROOT}/firmware/apps/posix_host/src/main.c"},
            {"file": f"{ROOT}/firmware/lib/zplc_core/tests/test_parse.c"},
        ]
        self.assertEqual(
            tidy.host_units(database),
            [
                f"{ROOT}/firmware/apps/posix_host/src/main.c",
                f"{ROOT}/firmware/lib/zplc_core/src/core/zplc_core.c",
                f"{ROOT}/firmware/lib/zplc_core/src/hal/posix/zplc_hal_posix.c",
                f"{ROOT}/firmware/lib/zplc_core/tests/test_parse.c",
            ],
        )

    def test_leaves_out_tests_and_the_zephyr_and_wasm_hals(self) -> None:
        database = [
            {"file": f"{ROOT}/firmware/lib/zplc_core/tests/test_vm_core.c"},
            {"file": f"{ROOT}/firmware/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c"},
            {"file": f"{ROOT}/firmware/lib/zplc_core/src/hal/wasm/zplc_hal_wasm.c"},
            {"file": f"{ROOT}/firmware/app/src/main.c"},
        ]
        self.assertEqual(tidy.host_units(database), [])


class RewriteForClang(unittest.TestCase):
    ENTRY = {
        "directory": "/build",
        "file": f"{ROOT}/firmware/app/src/main.c",
        "command": "/sdk/gnu/arm-zephyr-eabi/bin/arm-zephyr-eabi-gcc -DKERNEL -I/inc -mcpu=cortex-m7 -fno-defer-pop "
        "-fno-reorder-functions -mfp16-format=ieee -fno-printf-return-value --param=min-pagesize=0 -specs=picolibc.specs "
        "-Werror -Wall -c main.c",
    }

    def test_an_arm_zephyr_gcc_becomes_clang_for_arm_none_eabi_without_its_own_flags(self) -> None:
        converted = tidy.rewrite_for_clang(self.ENTRY)
        assert converted is not None
        arguments = converted["arguments"]
        self.assertEqual(arguments[:2], ["clang", "--target=arm-none-eabi"])
        for kept in ("-DKERNEL", "-I/inc", "-mcpu=cortex-m7", "-Wall"):
            self.assertIn(kept, arguments)
        for dropped in ("-fno-defer-pop", "-fno-reorder-functions", "-mfp16-format=ieee", "-fno-printf-return-value",
                        "--param=min-pagesize=0", "-specs=picolibc.specs", "-Werror"):
            self.assertNotIn(dropped, arguments)
        self.assertEqual((converted["file"], converted["directory"]), (self.ENTRY["file"], "/build"))

    def test_a_host_compiler_needs_no_target(self) -> None:
        converted = tidy.rewrite_for_clang({"directory": "/b", "file": "/x/a.c", "command": "/usr/bin/cc -m32 -c a.c"})
        assert converted is not None
        self.assertEqual(converted["arguments"][0], "clang")
        self.assertFalse(any(token.startswith("--target") for token in converted["arguments"]))
        self.assertIn("-m32", converted["arguments"])

    def test_a_debian_host_triplet_compiler_needs_no_target(self) -> None:
        converted = tidy.rewrite_for_clang({"directory": "/b", "file": "/x/a.c", "command": "/usr/bin/x86_64-linux-gnu-gcc-13 -c a.c"})
        assert converted is not None
        self.assertEqual(converted["arguments"][:2], ["clang", "-Qunused-arguments"])

    def test_a_toolchain_clang_cannot_target_is_skipped(self) -> None:
        xtensa = {"directory": "/b", "file": "/x/a.c", "command": "/sdk/xtensa-espressif_esp32s3_zephyr-elf-gcc -c a.c"}
        self.assertIsNone(tidy.rewrite_for_clang(xtensa))

    def test_reads_an_arguments_entry_as_well_as_a_command_string(self) -> None:
        converted = tidy.rewrite_for_clang({"directory": "/b", "file": "/x/a.c", "arguments": ["/usr/bin/gcc", "-O2", "-c", "a.c"]})
        assert converted is not None
        self.assertEqual(converted["arguments"][0], "clang")
        self.assertIn("-O2", converted["arguments"])


class ParseFindings(unittest.TestCase):
    OUTPUT = "\n".join([
        "/ci/checkout/firmware/app/src/shell_cmds.c:2261:11: error: 'atoi' used to convert a string [bugprone-unchecked-string-to-number-conversion,cert-err34-c,-warnings-as-errors]",
        "     2261 |   int id = atoi(argv[1]);",
        "/ci/checkout/firmware/app/src/shell_cmds.c:2261:11: error: 'atoi' used to convert a string [bugprone-unchecked-string-to-number-conversion,cert-err34-c,-warnings-as-errors]",
        "/ci/checkout/firmware/lib/zplc_core/include/zplc_core.h:10:3: warning: a header finding [misc-unused-parameters]",
        "/ci/zephyr/include/zephyr/kernel.h:1:1: error: not ours [misc-header-include-cycle,-warnings-as-errors]",
        "Suppressed 13894 warnings (13894 in non-user code).",
    ])

    def test_keeps_one_finding_per_position_with_its_first_check_and_a_firmware_relative_path(self) -> None:
        findings = tidy.parse_findings(self.OUTPUT)
        self.assertEqual(
            [(f.path, f.line, f.column, f.check) for f in findings],
            [
                ("firmware/app/src/shell_cmds.c", 2261, 11, "bugprone-unchecked-string-to-number-conversion"),
                ("firmware/lib/zplc_core/include/zplc_core.h", 10, 3, "misc-unused-parameters"),
            ],
        )

    def test_counts_by_file_and_check(self) -> None:
        counts = tidy.count_by_file_and_check(tidy.parse_findings(self.OUTPUT))
        self.assertEqual(counts["firmware/app/src/shell_cmds.c"], {"bugprone-unchecked-string-to-number-conversion": 1})


class Ratchet(unittest.TestCase):
    BASELINE = {"firmware/app/src/shell_cmds.c": {"cert-err34-c": 3}}

    def test_a_run_at_the_baseline_is_clean(self) -> None:
        self.assertEqual(tidy.compare_with_baseline(self.BASELINE, self.BASELINE), ([], []))

    def test_a_new_finding_in_a_listed_file_or_in_a_new_file_is_an_error(self) -> None:
        current = {"firmware/app/src/shell_cmds.c": {"cert-err34-c": 4}, "firmware/app/src/new.c": {"cert-err33-c": 1}}
        errors, improvements = tidy.compare_with_baseline(current, self.BASELINE)
        self.assertEqual(errors, [("firmware/app/src/shell_cmds.c", "cert-err34-c", 4, 3), ("firmware/app/src/new.c", "cert-err33-c", 1, 0)])
        self.assertEqual(improvements, [])

    def test_a_fixed_finding_is_an_improvement_to_record_not_an_error(self) -> None:
        errors, improvements = tidy.compare_with_baseline({"firmware/app/src/shell_cmds.c": {"cert-err34-c": 1}}, self.BASELINE)
        self.assertEqual(errors, [])
        self.assertEqual(improvements, [("firmware/app/src/shell_cmds.c", "cert-err34-c", 1, 3)])

    def test_the_committed_baseline_is_well_formed(self) -> None:
        import json

        recorded = json.loads((HERE / "clang-tidy-app-baseline.json").read_text())
        self.assertTrue(recorded["boards"])
        for board, findings in recorded["boards"].items():
            for path, checks in findings.items():
                self.assertTrue(path.startswith("firmware/app/"), f"{board} {path}")
                for check, count in checks.items():
                    self.assertGreater(count, 0, f"{board} {path} {check}")


class Configuration(unittest.TestCase):
    def test_every_enabled_check_is_an_error(self) -> None:
        text = (HERE.parent.parent / ".clang-tidy").read_text()
        self.assertIn("WarningsAsErrors: '*'", text)

    def test_the_configuration_is_accepted_by_clang_tidy(self) -> None:
        # `clang-tidy --list-checks` fails on a malformed file or a config that enables nothing.
        try:
            done = subprocess.run(
                ["clang-tidy", f"--config-file={HERE.parent.parent / '.clang-tidy'}", "--list-checks"],
                capture_output=True, text=True, check=False,
            )
        except FileNotFoundError:
            self.skipTest("clang-tidy is not installed")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("cert-err33-c", done.stdout)
        self.assertNotIn("misc-include-cleaner", done.stdout)


class Pinning(unittest.TestCase):
    def fake(self, directory: str, version: str) -> str:
        path = Path(directory) / "clang-tidy"
        path.write_text(f"#!/bin/sh\necho 'LLVM version {version}'\n")
        path.chmod(0o755)
        return str(path)

    def test_reads_the_version_of_the_binary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(tidy.tidy_version(self.fake(directory, "18.1.3")), "18.1.3")

    def test_refuses_another_version_than_the_pinned_one(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            binary = self.fake(directory, "18.1.3")
            self.assertEqual(tidy.main(["--clang-tidy", binary]), 2)

    def test_the_workflow_installs_the_pinned_version(self) -> None:
        workflow = (HERE.parent.parent / ".github/workflows/ci.yml").read_text()
        self.assertIn(f"pipx install clang-tidy=={tidy.CLANG_TIDY_VERSION}", workflow)
        self.assertNotIn("install --yes --no-install-recommends clang-tidy", workflow)


if __name__ == "__main__":
    unittest.main()
