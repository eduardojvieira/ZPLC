#!/usr/bin/env python3
"""Tests of the footprint report (WS-42): what it reads from a GNU ld map and what it prints.

Run: python3 tools/firmware-test/test_footprint_report.py

The map below is a trimmed copy of the shapes a Zephyr link produces: names that wrap to a second line, a merged
string block whose first input carries the size of the whole block, an initialised data section that lives in
flash and is copied to RAM, and non-loaded debug sections at address 0 that must not count. A report that adds
those wrongly would show a footprint that the linker's own memory usage table does not.
"""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import footprint_report  # noqa: E402

MAP = """\
Discarded input sections

 .text          0x0000000000000000        0x40 app/libapp.a(unused.c.obj)

Memory Configuration

Name             Origin             Length             Attributes
FLASH            0x10000000         0x00200000         xr
RAM              0x20000000         0x00040000         xw
*default*        0x00000000         0xffffffff

Linker script and memory map

                0x10000040                        vfprintf = __l_vfprintf
.text           0x10000000     0x1000
 *(.text*)
 .text.main     0x10000000      0x200 app/libapp.a(main.c.obj)
 .text.a_very_long_function_name_that_wraps_the_line
                0x10000200      0x100 app/libapp.a(shell_cmds.c.obj)
 *fill*         0x10000300        0x4
.rodata         0x10001000      0x300
 .rodata.boot.str1.1
                0x10001000      0x2c0 app/libapp.a(main.c.obj)
                                 0x20 (size before relaxing)
 .rodata.str1.1
                0x100012c0       0x90 app/libapp.a(shell_cmds.c.obj)
 .rodata.table  0x10001300       0x40 app/libapp.a(shell_cmds.c.obj)
datas           0x20000000       0x80 load address 0x10002000
 .data.counter  0x20000000       0x80 app/libapp.a(main.c.obj)
bss             0x20000080     0x4000
 .bss.workspace
                0x20000080     0x3000 app/libapp.a(program_store.c.obj)
 .bss.small     0x20003080      0x100 app/libapp.a(main.c.obj)
noinit          0x20003180      0x400
 .noinit.stack  0x20003180      0x400 libkernel.a(init.c.obj)
.comment        0x00000000       0x1f
 .comment       0x00000000       0x1f app/libapp.a(main.c.obj)
.debug_info     0x00000000     0x9999
 .debug_info    0x00000000     0x9999 app/libapp.a(main.c.obj)
"""

LOG = """\
[10/10] Linking C executable zephyr/zephyr.elf
Memory region         Used Size  Region Size  %age Used
           FLASH:       12640 B         2 MB      0.60%
             RAM:       13696 B       256 KB      5.00%
        IDT_LIST:           0 B        32 KB      0.00%
Generating files from zephyr.elf for board: test
"""


class MapParsing(unittest.TestCase):
    def setUp(self) -> None:
        self.regions, self.sections = footprint_report.parse_map(MAP)
        self.by_name = {(s.name, footprint_report.object_of(s.owner)): s for s in self.sections}

    def test_regions_are_the_memory_configuration(self) -> None:
        names = [name for name, _origin, _length in self.regions]
        self.assertEqual(names, ["FLASH", "RAM"])
        self.assertEqual(self.regions[1], ("RAM", 0x20000000, 0x40000))

    def test_wrapped_names_are_joined_to_their_size_line(self) -> None:
        long_name = ".text.a_very_long_function_name_that_wraps_the_line"
        self.assertEqual(self.by_name[(long_name, "shell_cmds.c.obj")].size, 0x100)

    def test_debug_and_comment_sections_do_not_count(self) -> None:
        self.assertFalse([s for s in self.sections if s.name.startswith((".debug", ".comment"))])

    def test_discarded_sections_before_the_memory_map_do_not_count(self) -> None:
        self.assertNotIn(("unused.c.obj"), [footprint_report.object_of(s.owner) for s in self.sections])

    def test_the_first_string_input_carries_the_whole_merged_block(self) -> None:
        carrier = self.by_name[(".rodata.boot.str1.1", "main.c.obj")]
        member = self.by_name[(".rodata.str1.1", "shell_cmds.c.obj")]
        self.assertEqual((carrier.merge, carrier.size, carrier.before), ("pool", 0x2C0, 0x20))
        self.assertEqual(member.merge, "member")

    def test_strings_are_attributed_per_object_before_merging(self) -> None:
        self.assertEqual(footprint_report.strings_by_object(self.sections), {"main.c.obj": 0x20, "shell_cmds.c.obj": 0x90})


class Accounting(unittest.TestCase):
    def setUp(self) -> None:
        self.regions, self.sections = footprint_report.parse_map(MAP)
        self.placed = footprint_report.account(self.regions, self.sections)

    def test_flash_is_code_constants_and_the_image_of_initialised_data(self) -> None:
        # .text 0x200 + 0x100 + fill 4, the merged block 0x2c0 once (its member adds nothing), .rodata.table 0x40,
        # and the 0x80 bytes of .data that are kept in flash. The load address is what puts them there.
        expected = 0x200 + 0x100 + 4 + 0x2C0 + 0x40 + 0x80
        self.assertEqual(footprint_report.region_total(self.placed, ["FLASH"]), expected)

    def test_ram_is_data_bss_and_noinit_without_an_image(self) -> None:
        expected = 0x80 + 0x3000 + 0x100 + 0x400
        self.assertEqual(footprint_report.region_total(self.placed, ["RAM"]), expected)

    def test_noinit_and_bss_have_no_image_in_flash(self) -> None:
        names = [s.name for s in self.placed["FLASH"]]
        self.assertFalse([name for name in names if "bss" in name or "noinit" in name])

    def test_largest_first(self) -> None:
        ranked = footprint_report.top(self.placed["RAM"], 2)
        self.assertEqual([s.name for s in ranked], [".bss.workspace", ".noinit.stack"])


class Report(unittest.TestCase):
    def test_the_link_table_sets_the_totals_and_the_budget_the_headroom(self) -> None:
        regions, sections = footprint_report.parse_map(MAP)
        table = footprint_report.parse_link_table(LOG, ["FLASH"], ["RAM"])
        self.assertEqual(table["__flash__"], 12640)
        self.assertEqual(table["__ram__"], 13696)
        text = "\n".join(
            footprint_report.render_board("test", regions, sections, ["FLASH"], ["RAM"], 3, {"flash": 13000, "ram": 20000}, table)
        )
        self.assertIn("flash: 12640 of 13000 B budget, headroom 360 B", text)
        self.assertIn("ram: 13696 of 20000 B budget, headroom 6304 B", text)
        self.assertIn("1 merged block(s)", text)
        self.assertIn(".bss.workspace", text)

    def test_logs_mode_reads_one_tree_per_board_and_the_budget_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            logs = Path(directory)
            (logs / "board" / "zephyr").mkdir(parents=True)
            (logs / "board" / "zephyr" / "zephyr.map").write_text(MAP)
            (logs / "board.log").write_text(LOG)
            budget = logs / "budget.json"
            budget.write_text(
                json.dumps(
                    {
                        "boards": {
                            "board": {
                                "zephyr_board": "test/board",
                                "regions": {"flash": ["FLASH"], "ram": ["RAM"]},
                                "budget": {"flash": 13000, "ram": 20000},
                            }
                        }
                    }
                )
            )
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = footprint_report.main(["--logs", str(logs), "--budget", str(budget), "--top", "3"])
            self.assertEqual(rc, 0)
            self.assertIn("## board (test/board)", out.getvalue())
            self.assertIn("headroom 360 B", out.getvalue())

    def test_a_board_without_a_map_is_an_error_not_a_silent_skip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            budget = Path(directory) / "budget.json"
            budget.write_text(json.dumps({"boards": {"gone": {"zephyr_board": "x/y", "regions": {"flash": [], "ram": []}, "budget": {}}}}))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                rc = footprint_report.main(["--logs", directory, "--budget", str(budget)])
            self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
