#!/usr/bin/env python3
"""Tests of check_inbound_authority.py (COM-017).

Run: python3 tools/firmware-test/test_check_inbound_authority.py

The check fails for an inbound object that references run control, forces or load, and it must not pass a tree
in which it found nothing to look at.
"""

import subprocess
import tempfile
import unittest
from pathlib import Path

CHECK = Path(__file__).resolve().parent / "check_inbound_authority.py"


class InboundAuthority(unittest.TestCase):
    """COM-017: the link-level check fails for an inbound object that references run control, forces or load.

    The object files are fixtures: each one holds the list of symbols the fake `nm` reports as undefined.
    """

    def build_tree(self, objects: dict[str, list[str]]) -> tuple[Path, Path]:
        directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(directory, ignore_errors=True))
        nm = directory / "fake-nm"
        nm.write_text('#!/bin/sh\nfor s in $(cat "$3"); do echo "$s U"; done\n')
        nm.chmod(0o755)
        build = directory / "board"
        (build / "CMakeFiles" / "app.dir" / "src").mkdir(parents=True)
        for name, symbols in objects.items():
            (build / "CMakeFiles" / "app.dir" / "src" / name).write_text("\n".join(symbols) + "\n")
        return build, nm

    def run_check(self, objects: dict[str, list[str]]) -> subprocess.CompletedProcess:
        build, nm = self.build_tree(objects)
        return subprocess.run(
            ["python3", "-B", str(CHECK), f"--nm={nm}", str(build)], capture_output=True, text=True, check=False
        )

    def test_the_data_path_of_the_tags_passes(self):
        result = self.run_check(
            {"zplc_mqtt.c.obj": ["zplc_force_write_bytes", "zplc_mem_get_region", "zplc_pi_lock", "mqtt_publish"]}
        )
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("PASS inbound-authority", result.stdout)

    def test_every_entry_point_of_run_control_forces_and_load_fails(self):
        for symbol in (
            "zplc_sched_start", "zplc_sched_stop", "zplc_sched_pause", "zplc_sched_load",
            "zplc_force_set_bytes", "zplc_force_clear", "zplc_force_clear_all",
            "zplc_core_load", "zplc_vm_resume", "zplc_program_store_commit", "sys_reboot",
        ):
            with self.subTest(symbol=symbol):
                result = self.run_check({"zplc_modbus.c.obj": ["zplc_mem_get_region", symbol]})
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(f"zplc_modbus.c.obj references {symbol}", result.stdout)

    def test_the_local_operator_shell_is_not_inbound(self):
        result = self.run_check({"shell_cmds.c.obj": ["zplc_sched_start"], "zplc_mqtt.c.obj": ["zplc_pi_lock"]})
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_a_tree_with_no_inbound_object_does_not_pass(self):
        result = self.run_check({"shell_cmds.c.obj": ["zplc_pi_lock"]})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no inbound object file found", result.stdout)


if __name__ == "__main__":
    unittest.main()
