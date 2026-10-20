#!/usr/bin/env python3
"""IO-008: tools/hil/check_storage_partitions.py, the partition check of every board build of firmware/app.

The checks run on devicetrees written the way Zephyr writes zephyr.dts (merged, with source comments, properties on
several lines and commas in property names), so a board build that `run.sh size` keeps is read as these are.
"""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("check_storage_partitions", HERE / "check_storage_partitions.py")
assert spec and spec.loader
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

BOARDS = json.loads(check.BOARDS_JSON.read_text())


def dts(internal_partitions: str, qspi_partitions: str = "", erase: str = "erase-block-size = < 0x1000 >;",
        code: str = "&slot0_partition") -> str:
    return f"""/dts-v1/;

/ {{
	#address-cells = < 0x1 >;
	#size-cells = < 0x1 >;

	/* node '/chosen' defined in zephyr/dts/common/skeleton.dtsi:13 */
	chosen {{
		zephyr,flash = &flash0;                  /* in a board file */
		zephyr,code-partition = {code};
	}};

	soc {{
		#address-cells = < 0x1 >;
		#size-cells = < 0x1 >;

		flash-controller@40022000 {{
			compatible = "st,stm32-flash-controller";
			#address-cells = < 0x1 >;
			#size-cells = < 0x1 >;
			clocks = < &rcc 0x1 0x2 >,
			         < &rcc 0x3 0x4 >;

			flash0: flash@8000000 {{
				compatible = "st,stm32-nv-flash", "soc-nv-flash";
				write-block-size = < 0x20 >;
				{erase}
				reg = < 0x8000000 0x200000 >;

				partitions {{
					compatible = "fixed-partitions";
					#address-cells = < 0x1 >;
					#size-cells = < 0x1 >;
{internal_partitions}
				}};
			}};
		}};

		quadspi@a0001000 {{
			qspi_flash: n25q128a1: qspi-nor-flash@0 {{
				compatible = "st,stm32-qspi-nor";
				reg = < 0x0 >;
				size = < 0x8000000 >;

				partitions {{
					compatible = "fixed-partitions";
					#address-cells = < 0x1 >;
					#size-cells = < 0x1 >;
{qspi_partitions}
				}};
			}};
		}};
	}};
}};
"""


def partition(label: str, offset: int, size: int) -> str:
    return (f"\t\t\t\t\t{label}: partition@{offset:x} {{\n\t\t\t\t\t\tlabel = \"{label}\";\n"
            f"\t\t\t\t\t\treg = < 0x{offset:x} 0x{size:x} >; /* in an overlay */\n\t\t\t\t\t}};")


SLOT0 = partition("slot0_partition", 0x0, 0x80000)


def config(*lines: str, load_size: str = "0x80000", target: str = "nucleo_h743zi/stm32h743xx") -> str:
    return "\n".join(["# comment", f'CONFIG_BOARD_TARGET="{target}"', "CONFIG_FLASH_LOAD_OFFSET=0",
                      f"CONFIG_FLASH_LOAD_SIZE={load_size}", *lines]) + "\n"


NVS_AND_LFS = ("CONFIG_NVS=y", "CONFIG_FILE_SYSTEM_LITTLEFS=y")


class ParseTest(unittest.TestCase):
    def test_the_merged_devicetree_is_read_with_labels_cells_and_comma_names(self) -> None:
        tree = check.parse_dts(dts(SLOT0 + partition("storage_partition", 0x1e0000, 0x20000)))
        nodes = {label: node for node in tree.walk() for label in node.labels}
        self.assertEqual(nodes["flash0"].cells("reg"), [0x8000000, 0x200000])
        self.assertEqual(nodes["flash0"].strings("compatible"), ["st,stm32-nv-flash", "soc-nv-flash"])
        self.assertIs(nodes["qspi_flash"], nodes["n25q128a1"])
        chosen = next(node for node in tree.children if node.name == "chosen")
        self.assertEqual(chosen.props["zephyr,flash"], ["&flash0"])
        controller = nodes["flash0"].parent
        assert controller is not None
        self.assertEqual(controller.cells("clocks"), [0x1, 0x2, 0x3, 0x4])
        self.assertEqual(check.Partition(nodes["storage_partition"]).offset, 0x1E0000)


class CheckTest(unittest.TestCase):
    def failures(self, tree: str, cfg: str) -> dict[str, list[str]]:
        return check.check_build(tree, cfg)[1]

    def test_io_008_a_the_nvs_store_and_littlefs_on_one_partition_fail(self) -> None:
        found = self.failures(dts(SLOT0, partition("storage_partition", 0x700000, 0x700000)), config(*NVS_AND_LFS))
        self.assertEqual(found["a"], ["LittleFS and NVS store share storage_partition"])
        self.assertEqual(found["b"] + found["c"], [])

    def test_io_008_the_records_take_zplc_nvs_partition_and_littlefs_storage_partition_as_the_firmware_does(self) -> None:
        tree = dts(SLOT0, partition("storage_partition", 0x600000, 0x100000) + "\n"
                   + partition("zplc_nvs_partition", 0x700000, 0x700000))
        lines, found = check.check_build(tree, config(*NVS_AND_LFS))
        self.assertEqual(found, {"a": [], "b": [], "c": []})
        self.assertEqual(lines[:2], [
            "NVS store zplc_nvs_partition 7168 KB at 0x700000 of qspi_flash, 112 x 64 KB assumed",
            "LittleFS storage_partition 1024 KB at 0x600000 of qspi_flash, 16 x 64 KB assumed",
        ])

    def test_io_008_a_b_c_pass_with_a_partition_per_user_outside_the_slot(self) -> None:
        tree = dts(SLOT0, partition("zplc_nvs_partition", 0x700000, 0x100000) + "\n"
                   + partition("storage_partition", 0x800000, 0x600000))
        lines, found = check.check_build(tree, config(*NVS_AND_LFS))
        self.assertEqual(found, {"a": [], "b": [], "c": []})
        self.assertEqual(lines[-1], "image slot 0x0-0x80000 of flash0")

    def test_io_008_a_overlapping_user_partitions_and_foreign_partitions_fail(self) -> None:
        tree = dts(SLOT0, partition("zplc_nvs_partition", 0x700000, 0x100000) + "\n"
                   + partition("storage_partition", 0x7f0000, 0x7a0000) + "\n"
                   + partition("airoc_firmware", 0xf80000, 0x80000))
        found = self.failures(tree, config(*NVS_AND_LFS))
        self.assertIn("NVS store (zplc_nvs_partition) overlaps partition storage_partition", found["a"])
        self.assertIn("LittleFS (storage_partition) overlaps NVS store (zplc_nvs_partition)", found["a"])
        self.assertIn("LittleFS (storage_partition) overlaps partition airoc_firmware", found["a"])

    def test_io_008_a_a_missing_partition_fails(self) -> None:
        found = self.failures(dts(SLOT0), config("CONFIG_NVS=y"))
        self.assertEqual(found["a"], ["NVS store: no partition labelled storage_partition"])

    def test_io_008_b_nvs_cannot_mount_on_one_sector_of_128_kb(self) -> None:
        tree = dts(SLOT0 + "\n" + partition("storage_partition", 0x1e0000, 0x20000), erase="erase-block-size = < 0x20000 >;")
        found = self.failures(tree, config("CONFIG_NVS=y"))
        self.assertEqual(found["b"], [
            "NVS store (storage_partition) holds 1 erase block of 128 KB, it needs at least 2",
            "NVS store (storage_partition): the erase block of 128 KB is above the 64 KB it can mount",
        ])

    def test_io_008_b_zms_mounts_on_three_sectors_of_128_kb(self) -> None:
        tree = dts(SLOT0 + "\n" + partition("storage_partition", 0x1a0000, 0x60000), erase="erase-block-size = < 0x20000 >;")
        lines, found = check.check_build(tree, config("CONFIG_NVS=y", "CONFIG_ZMS=y"))
        self.assertEqual(found, {"a": [], "b": [], "c": []})
        self.assertEqual(lines[0], "ZMS store storage_partition 384 KB at 0x1a0000 of flash0, 3 x 128 KB")

    def test_io_008_b_a_partition_that_is_not_whole_erase_blocks_fails(self) -> None:
        tree = dts(SLOT0 + "\n" + partition("storage_partition", 0x1f0800, 0x2000))
        found = self.failures(tree, config("CONFIG_NVS=y"))
        self.assertEqual(found["b"], ["NVS store (storage_partition) is not whole erase blocks of 4 KB"])

    def test_io_008_b_a_serial_nor_is_taken_at_64_kb_erase_blocks(self) -> None:
        found = self.failures(dts(SLOT0, partition("storage_partition", 0x0, 0x10000)), config("CONFIG_NVS=y"))
        self.assertEqual(found["b"], ["NVS store (storage_partition) holds 1 erase block of 64 KB assumed, it needs at least 2"])

    def test_io_008_b_an_unknown_erase_block_fails(self) -> None:
        found = self.failures(dts(SLOT0 + "\n" + partition("storage_partition", 0x1e0000, 0x20000), erase=""),
                              config("CONFIG_NVS=y"))
        self.assertEqual(found["b"], ["NVS store (storage_partition): the erase block of flash0 is not known"])

    def test_io_008_c_an_unbounded_image_slot_reaches_the_storage_on_the_same_flash(self) -> None:
        tree = dts(SLOT0 + "\n" + partition("storage_partition", 0x1e0000, 0x20000))
        found = self.failures(tree, config("CONFIG_NVS=y", load_size="0"))
        self.assertEqual(found["c"], ["NVS store (storage_partition) overlaps the image slot 0x0-0x200000 of flash0"])
        self.assertEqual(self.failures(tree, config("CONFIG_NVS=y"))["c"], [])

    def test_io_008_c_a_code_partition_over_the_storage_is_a_slot_overlap(self) -> None:
        tree = dts(partition("code_partition", 0x100, 0x1fff00) + "\n" + partition("storage_partition", 0x1f0000, 0x10000),
                   code="&code_partition")
        found = self.failures(tree, config("CONFIG_NVS=y", load_size="0x1fff00").replace("OFFSET=0", "OFFSET=0x100"))
        self.assertEqual(found["a"], [])
        self.assertEqual(found["c"], ["NVS store (storage_partition) overlaps the image slot 0x100-0x200000 of flash0"])


class ReportTest(unittest.TestCase):
    SHARED = dts(SLOT0, partition("storage_partition", 0x700000, 0x700000))
    SPLIT = dts(SLOT0, partition("zplc_nvs_partition", 0x700000, 0x100000) + "\n" + partition("storage_partition", 0x800000, 0x600000))

    def run_report(self, tree: str, known_open: dict) -> tuple[list[str], int]:
        with tempfile.TemporaryDirectory() as tmp:
            build = Path(tmp) / "zplc-nucleo"
            (build / "zephyr").mkdir(parents=True)
            (build / "zephyr/zephyr.dts").write_text(tree)
            (build / "zephyr/.config").write_text(config(*NVS_AND_LFS))
            return check.report([build], BOARDS, known_open)

    def test_io_008_a_failing_board_fails_the_run_named_by_its_board_id(self) -> None:
        lines, status = self.run_report(self.SHARED, {})
        self.assertEqual(status, 1)
        self.assertTrue(lines[0].startswith("FAIL io-008 nucleo-h743zi: (a) LittleFS and NVS store share storage_partition"))

    def test_io_008_a_listed_open_check_is_reported_and_does_not_fail(self) -> None:
        lines, status = self.run_report(self.SHARED, {"nucleo-h743zi": {"checks": ["a"], "reason": "owned elsewhere"}})
        self.assertEqual(status, 0)
        self.assertTrue(lines[0].startswith("OPEN io-008 nucleo-h743zi: (a) "))
        self.assertIn("(listed: owned elsewhere)", lines[0])

    def test_io_008_a_listed_check_that_passes_fails_until_it_is_removed(self) -> None:
        lines, status = self.run_report(self.SPLIT, {"nucleo-h743zi": {"checks": ["a"], "reason": "owned elsewhere"}})
        self.assertEqual(status, 1)
        self.assertIn("(a) passes but is listed as open in storage-partitions-open.json: remove it", lines[0])

    def test_io_008_a_passing_board_passes(self) -> None:
        lines, status = self.run_report(self.SPLIT, {})
        self.assertEqual(status, 0)
        self.assertTrue(lines[0].startswith("PASS io-008 nucleo-h743zi: NVS store zplc_nvs_partition 1024 KB"))

    def test_io_008_a_build_without_its_devicetree_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lines, status = check.report([Path(tmp)], BOARDS, {})
        self.assertEqual(status, 1)
        self.assertIn("no zephyr/zephyr.dts and zephyr/.config", lines[0])

    def test_io_008_the_open_list_names_boards_of_the_manifest_with_checks_and_a_reason(self) -> None:
        known_open = json.loads(check.OPEN_JSON.read_text())
        ids = {board["board_id"] for board in BOARDS}
        for board, entry in known_open.items():
            self.assertIn(board, ids)
            self.assertTrue(entry["checks"] and set(entry["checks"]) <= {"a", "b", "c"}, board)
            self.assertTrue(entry["reason"].strip(), board)


if __name__ == "__main__":
    unittest.main()
