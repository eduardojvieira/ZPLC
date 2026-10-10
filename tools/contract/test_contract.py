#!/usr/bin/env python3
"""Tests for the generated binary contract (WP-11, VF-012, HIL-008).

The golden snapshot in golden/contract.golden.json holds the numbers the
repository had in its hand-written definitions before they were generated.
These tests assert that contract.json and every generated output still say the
same, so a generated table cannot move a number unnoticed.

Run: python3 tools/contract/test_contract.py
"""
from __future__ import annotations

import copy
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import generate  # noqa: E402
import snapshot  # noqa: E402
import zplc_contract as zc  # noqa: E402

GOLDEN = json.loads((HERE / "golden/contract.golden.json").read_text())
CONTRACT = json.loads((HERE / "contract.json").read_text())
NUM = generate.num


def golden_c_enum(typedef: str) -> dict[str, int]:
    return GOLDEN["c"]["enums"][typedef]


class SourceMatchesGolden(unittest.TestCase):
    """contract.json says what the hand-written C header said before generation."""

    def test_every_opcode_of_the_header_is_in_the_table_with_the_same_number(self):
        expected = {name.removeprefix("OP_"): value for name, value in golden_c_enum("zplc_opcode_t").items()}
        actual = {o["name"]: NUM(o["code"]) for o in CONTRACT["opcodes"]}
        self.assertEqual(actual, expected)

    def test_operand_size_validity_and_instruction_size_of_all_256_bytes(self):
        valid = {NUM(o["code"]) for o in CONTRACT["opcodes"]}
        for byte in range(256):
            row = GOLDEN["c"]["operand"][str(byte)]
            self.assertEqual(generate.operand_for(CONTRACT, byte), row["operand"], f"operand of 0x{byte:02X}")
            self.assertEqual(1 + row["operand"], row["instruction"], f"instruction of 0x{byte:02X}")
            self.assertEqual(int(byte in valid), row["valid"], f"validity of 0x{byte:02X}")

    def test_declared_operand_of_each_opcode_is_what_the_vm_decodes(self):
        for o in CONTRACT["opcodes"]:
            self.assertEqual(o["operand"], GOLDEN["c"]["operand"][str(NUM(o["code"]))]["operand"], o["name"])

    def test_enums_of_the_container_the_vm_and_the_comm_layer(self):
        groups = [
            ("zplc_data_type_t", CONTRACT["types"]),
            ("zplc_vm_error_t", CONTRACT["vm"]["errors"]),
            ("zplc_comm_fb_kind_t", CONTRACT["comm"]["kinds"]),
            ("zplc_comm_status_t", CONTRACT["comm"]["statuses"]),
        ] + [(e["typedef"], e) for e in CONTRACT["container"]["enums"]] + [("zplc_vm_flags_t", CONTRACT["vm"]["flags"])]
        for typedef, group in groups:
            actual = {}
            for m in group["members"]:
                value = (1 << NUM(m["value"])) if group.get("bits") else NUM(m["value"])
                actual[group["prefix"] + m["name"]] = value
            expected = dict(GOLDEN["c"]["enums"][typedef])
            if typedef == "zplc_comm_fb_kind_t":
                actual[group["prefix"] + "KIND_MAX"] = NUM(CONTRACT["comm"]["kindMax"]["value"])
            self.assertEqual(actual, expected, typedef)

    def test_memory_regions_limits_and_system_registers(self):
        macros = GOLDEN["c"]["macros"]
        for r in CONTRACT["memory"]["regions"]:
            self.assertEqual(NUM(r["base"]), macros[f"ZPLC_MEM_{r['name']}_BASE"], r["name"])
            self.assertEqual(NUM(r["size"]), macros[f"ZPLC_MEM_{r['name']}_SIZE"], r["name"])
        for lim in CONTRACT["memory"]["limits"]:
            self.assertEqual(lim["value"], macros[lim["macro"]], lim["macro"])
        self.assertEqual(NUM(CONTRACT["memory"]["systemRegisterOffset"]["value"]), macros["ZPLC_SYS_REG_OFFSET"])
        ipi = NUM(CONTRACT["memory"]["regions"][0]["base"])
        for reg in CONTRACT["memory"]["systemRegisters"]:
            self.assertEqual(ipi + NUM(reg["offset"]), macros[reg["macro"]], reg["macro"])
        for flag in CONTRACT["memory"]["systemFlags"]:
            self.assertEqual(NUM(flag["value"]), macros[flag["macro"]], flag["macro"])

    def test_container_constants_struct_sizes_and_field_offsets(self):
        macros = GOLDEN["c"]["macros"]
        self.assertEqual(NUM(CONTRACT["container"]["magic"]["value"]), macros["ZPLC_MAGIC"])
        self.assertEqual(CONTRACT["abi"]["versionMajor"], macros["ZPLC_VERSION_MAJOR"])
        self.assertEqual(CONTRACT["abi"]["versionMinor"], macros["ZPLC_VERSION_MINOR"])
        self.assertEqual(CONTRACT["container"]["maxTasks"]["value"], macros["ZPLC_LOADER_MAX_TASKS"])
        for s in CONTRACT["container"]["structs"]:
            self.assertEqual(s["size"], macros[s["sizeMacro"]], s["sizeMacro"])
            golden = GOLDEN["c"]["structs"][s["typedef"]]
            self.assertEqual(s["size"], golden["size"], s["typedef"])
            offsets = {field["name"]: offset for field, offset, _ in generate.struct_layout(s)}
            self.assertEqual(offsets, golden["offsets"], s["typedef"])

    def test_string_layout_and_loader_error_codes(self):
        macros = GOLDEN["c"]["macros"]
        s = CONTRACT["string"]
        self.assertEqual(
            [s["lenOffset"], s["capOffset"], s["dataOffset"], s["defaultSize"], s["maxSize"]],
            [macros[f"ZPLC_STRING_{k}"] for k in ("LEN_OFFSET", "CAP_OFFSET", "DATA_OFFSET", "DEFAULT_SIZE", "MAX_SIZE")])
        for e in CONTRACT["loader"]["errors"]:
            self.assertEqual(e["value"], macros[e["macro"]], e["macro"])
        golden_loader = {k for k in macros if k.startswith("ZPLC_LOADER_ERR_") or k == "ZPLC_LOADER_OK"}
        self.assertEqual({e["macro"] for e in CONTRACT["loader"]["errors"]}, golden_loader)

    def test_the_compiler_view_of_ids_types_and_blocks(self):
        compiler = GOLDEN["compiler"]
        self.assertEqual({m["name"]: NUM(m["value"]) for m in CONTRACT["types"]["members"] if m["name"] in compiler["typeIds"]},
                         compiler["typeIds"])
        tag_enum = next(e for e in CONTRACT["container"]["enums"] if e["name"] == "tagIds")
        self.assertEqual({m["name"].lower(): NUM(m["value"]) for m in tag_enum["members"] if m["name"] != "NONE"}, compiler["tagIds"])
        blocks = generate.comm_blocks(CONTRACT)
        self.assertEqual({b["kindName"]: b["kind"] for b in blocks}, compiler["commKinds"])
        for b in blocks:
            golden = compiler["commBlocks"][b["name"]]
            self.assertEqual(b["size"], golden["size"], b["name"])
            self.assertEqual(
                [(m["name"], m["type"], m["offset"], m["dir"]) for m in b["members"]],
                [(m["name"], m["type"], m["offset"], m["direction"]) for m in golden["members"]], b["name"])
        self.assertEqual(sorted(b["name"] for b in blocks), sorted(compiler["commBlocks"]))


class PythonModuleMatchesGolden(unittest.TestCase):
    """tools/contract/zplc_contract.py, which the assembler and the HIL tools import."""

    def test_opcode_numbers_and_the_operand_size_of_every_byte(self):
        self.assertEqual({op.name: int(op) for op in zc.Opcode},
                         {name.removeprefix("OP_"): value for name, value in golden_c_enum("zplc_opcode_t").items()})
        for byte in range(256):
            self.assertEqual(zc.get_operand_size(byte), GOLDEN["c"]["operand"][str(byte)]["operand"], f"0x{byte:02X}")

    def test_container_constants(self):
        macros = GOLDEN["c"]["macros"]
        self.assertEqual(
            (zc.ZPLC_MAGIC, zc.ZPLC_VERSION_MAJOR, zc.ZPLC_VERSION_MINOR, zc.HEADER_SIZE, zc.SEGMENT_ENTRY_SIZE,
             zc.TASK_DEF_SIZE, zc.IOMAP_ENTRY_SIZE, zc.TAG_ENTRY_SIZE, zc.MAX_TASKS),
            tuple(macros[k] for k in ("ZPLC_MAGIC", "ZPLC_VERSION_MAJOR", "ZPLC_VERSION_MINOR", "ZPLC_FILE_HEADER_SIZE",
                                      "ZPLC_SEGMENT_ENTRY_SIZE", "ZPLC_TASK_DEF_SIZE", "ZPLC_IOMAP_ENTRY_SIZE",
                                      "ZPLC_TAG_ENTRY_SIZE", "ZPLC_LOADER_MAX_TASKS")))
        self.assertEqual(zc.SEGMENT_TYPE, {k.removeprefix("ZPLC_SEG_"): v for k, v in golden_c_enum("zplc_segment_type_t").items()})
        self.assertEqual(zc.TAG_ID, {k.removeprefix("ZPLC_TAG_"): v for k, v in golden_c_enum("zplc_tag_id_t").items()})
        self.assertEqual(zc.DATA_TYPE_ID, {k.removeprefix("ZPLC_TYPE_"): v for k, v in golden_c_enum("zplc_data_type_t").items()})

    def test_memory_regions_and_error_codes(self):
        macros = GOLDEN["c"]["macros"]
        for name, region in zc.MEMORY_REGION.items():
            self.assertEqual(region["base"], macros[f"ZPLC_MEM_{name}_BASE"], name)
            self.assertEqual(region["size"], macros[f"ZPLC_MEM_{name}_SIZE"], name)
        self.assertEqual({e.name: int(e) for e in zc.VmError},
                         {k.removeprefix("ZPLC_VM_"): v for k, v in golden_c_enum("zplc_vm_error_t").items()})
        self.assertEqual({"ZPLC_LOADER_" + e.name: int(e) for e in zc.LoaderError},
                         {k: v for k, v in macros.items() if k.startswith("ZPLC_LOADER_ERR_") or k == "ZPLC_LOADER_OK"})

    def test_function_block_kinds_sizes_and_member_offsets(self):
        golden = GOLDEN["compiler"]["commBlocks"]
        self.assertEqual(sorted(zc.COMM_BLOCKS), sorted(golden))
        for name, block in zc.COMM_BLOCKS.items():
            self.assertEqual(block["size"], golden[name]["size"], name)
            self.assertEqual(block["kind"], GOLDEN["compiler"]["commKinds"][name], name)
            self.assertEqual([(m["name"], m["type"], m["offset"], m["direction"]) for m in block["members"]],
                             [(m["name"], m["type"], m["offset"], m["direction"]) for m in golden[name]["members"]], name)
        self.assertEqual(zc.COMM_KIND_MAX, GOLDEN["c"]["enums"]["zplc_comm_fb_kind_t"]["ZPLC_COMM_FB_KIND_MAX"])
        self.assertEqual({k.name: int(k) for k in zc.CommKind},
                         {k.removeprefix("ZPLC_COMM_FB_"): v for k, v in golden_c_enum("zplc_comm_fb_kind_t").items() if not k.endswith("KIND_MAX")})


class CHeadersMatchGolden(unittest.TestCase):
    """The C headers, compiled, give the numbers the hand-written ones gave."""

    @classmethod
    def setUpClass(cls):
        cls.view = snapshot.c_view()

    def test_every_macro_of_the_contract_keeps_its_value(self):
        for name, value in GOLDEN["c"]["macros"].items():
            self.assertIn(name, self.view["macros"], name)
            self.assertEqual(self.view["macros"][name], value, name)

    def test_every_enum_member_keeps_its_value(self):
        for typedef, members in GOLDEN["c"]["enums"].items():
            self.assertIn(typedef, self.view["enums"], typedef)
            for name, value in members.items():
                self.assertEqual(self.view["enums"][typedef].get(name), value, f"{typedef}.{name}")

    def test_packed_structs_keep_their_size_and_field_offsets(self):
        for typedef, golden in GOLDEN["c"]["structs"].items():
            self.assertEqual(self.view["structs"][typedef], golden, typedef)

    def test_operand_size_instruction_size_and_validity_of_every_byte(self):
        self.assertEqual(self.view["operand"], GOLDEN["c"]["operand"])


class ValidationRejectsADriftedSource(unittest.TestCase):
    """The generator refuses a contract.json that contradicts itself."""

    def mutate(self, edit):
        contract = copy.deepcopy(CONTRACT)
        edit(contract)
        return contract

    def test_a_duplicate_opcode_number_is_refused(self):
        def edit(c):
            c["opcodes"][1]["code"] = c["opcodes"][0]["code"]
        with self.assertRaises(generate.ContractError):
            generate.validate(self.mutate(edit))

    def test_an_operand_size_that_disagrees_with_the_encoding_is_refused(self):
        def edit(c):
            next(o for o in c["opcodes"] if o["name"] == "PUSH8")["operand"] = 2
        with self.assertRaisesRegex(generate.ContractError, "disagrees with the encoding rule"):
            generate.validate(self.mutate(edit))

    def test_a_stack_effect_that_disagrees_with_pops_and_pushes_is_refused(self):
        def edit(c):
            next(o for o in c["opcodes"] if o["name"] == "ADD")["pushes"] = 2
        with self.assertRaisesRegex(generate.ContractError, "effect"):
            generate.validate(self.mutate(edit))

    def test_a_struct_whose_fields_do_not_add_up_to_its_size_is_refused(self):
        def edit(c):
            c["container"]["structs"][0]["size"] = 36
        with self.assertRaisesRegex(generate.ContractError, "bytes"):
            generate.validate(self.mutate(edit))

    def test_a_block_that_does_not_start_with_the_handshake_is_refused(self):
        def edit(c):
            c["comm"]["blocks"][4]["members"] = [{"name": "EN", "dir": "in", "type": "BOOL", "offset": 0}]
        with self.assertRaisesRegex(generate.ContractError, "handshake"):
            generate.validate(self.mutate(edit))

    def test_a_kind_at_or_above_the_limit_is_refused(self):
        def edit(c):
            c["comm"]["kinds"]["members"][1]["value"] = "0x0100"
        with self.assertRaisesRegex(generate.ContractError, "kindMax"):
            generate.validate(self.mutate(edit))


class GeneratedFilesAreFresh(unittest.TestCase):
    """--check is what CI runs: it must pass on the tree and fail on a stale file."""

    def test_the_committed_files_equal_a_fresh_generation(self):
        result = subprocess.run([sys.executable, "-B", str(HERE / "generate.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_a_stale_generated_file_makes_check_fail_and_name_the_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            stale = Path(tmp) / "zplc_contract.py"
            stale.write_text(generate.PY_OUT.read_text().replace("MAX_TASKS = 16", "MAX_TASKS = 17"))
            script = ("import sys; sys.path.insert(0, %r); import generate; from pathlib import Path; "
                      "generate.PY_OUT = Path(%r); sys.exit(generate.main(['--check']))" % (str(HERE), str(stale)))
            result = subprocess.run([sys.executable, "-B", "-c", script], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("stale", result.stderr)
        self.assertIn("MAX_TASKS", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
