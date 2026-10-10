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
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import crc_cross  # noqa: E402
import depth_cross  # noqa: E402
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
        self.assertEqual(CONTRACT["abi"]["draftCounter"], macros["ZPLC_DRAFT_COUNTER"])
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
                [(m["name"], m["type"], m["offset"], m["size"], m["dir"]) for m in b["members"]],
                [(m["name"], m["type"], m["offset"], m["size"], m["direction"]) for m in golden["members"]], b["name"])
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
        self.assertEqual(zc.ZPLC_DRAFT_COUNTER, macros["ZPLC_DRAFT_COUNTER"])
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
            self.assertEqual([(m["name"], m["type"], m["offset"], m["size"], m["direction"]) for m in block["members"]],
                             [(m["name"], m["type"], m["offset"], m["size"], m["direction"]) for m in golden[name]["members"]], name)
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


class DocumentationTablesAreGenerated(unittest.TestCase):
    """The runtime reference pages carry the tables generated from contract.json, in English and Spanish."""

    PAGES = {
        "en": ROOT / "docs/docs/reference/runtime-api.md",
        "es": ROOT / "docs/i18n/es/docusaurus-plugin-content-docs/current/reference/runtime-api.md",
    }

    @staticmethod
    def normal(text: str) -> str:
        return "\n".join(line.rstrip() for line in text.splitlines())

    def test_each_page_contains_the_rendered_tables(self):
        for lang, path in self.PAGES.items():
            self.assertIn(self.normal(generate.render_docs(CONTRACT, lang)).strip(), self.normal(path.read_text()), lang)

    def test_every_opcode_and_function_block_has_a_row(self):
        english = self.normal(generate.render_docs(CONTRACT, "en"))
        for o in CONTRACT["opcodes"]:
            self.assertRegex(english, rf"\| `0x{NUM(o['code']):02X}` \| `{o['name']}` \|", o["name"])
        for b in CONTRACT["comm"]["blocks"]:
            self.assertRegex(english, rf"\| `{b['name']}` \| `0x[0-9A-F]{{4}}` \| {b['size']} \|", b["name"])

    def test_spanish_has_the_same_tables_as_english(self):
        rows = lambda text: [line for line in text.splitlines() if line.startswith("|")]
        self.assertEqual(len(rows(generate.render_docs(CONTRACT, "es"))), len(rows(generate.render_docs(CONTRACT, "en"))))


class TypeScriptConsumersMatchGolden(unittest.TestCase):
    """What the compiler and the IDE hold, read by running them, is what the hand-written tables held."""

    @classmethod
    def setUpClass(cls):
        cls.view = snapshot.ts_view()

    def test_compiler_tables_equal_the_frozen_snapshot(self):
        for key, value in GOLDEN["compiler"].items():
            self.assertEqual(self.view["compiler"][key], value, key)

    def test_ide_tables_equal_the_frozen_snapshot(self):
        for key, value in GOLDEN["ide"].items():
            self.assertEqual(self.view["ide"][key], value, key)


class PythonToolsMatchGolden(unittest.TestCase):
    """The assembler and the HIL tester hold every opcode of the VM, under the number the VM decodes (HIL-008)."""

    @classmethod
    def setUpClass(cls):
        cls.view = snapshot.py_views()
        cls.opcodes = {name.removeprefix("OP_"): value for name, value in golden_c_enum("zplc_opcode_t").items()}

    def test_assembler_has_every_opcode_of_the_header(self):
        missing = sorted(set(self.opcodes) - set(self.view["asm"]["opcodes"]))
        self.assertEqual(missing, [], f"{len(missing)} opcodes missing from tools/zplc_asm.py")
        self.assertEqual(self.view["asm"]["opcodes"], self.opcodes)

    def test_assembler_decodes_every_byte_as_the_vm_does(self):
        expected = {str(b): GOLDEN["c"]["operand"][str(b)]["operand"] for b in range(256)}
        self.assertEqual(self.view["asm"]["operandSizes"], expected)

    def test_assembler_writes_the_header_the_loader_reads(self):
        macros = GOLDEN["c"]["macros"]
        asm = self.view["asm"]
        self.assertEqual((asm["magic"], asm["versionMajor"], asm["versionMinor"], asm["draftCounter"]),
                         (macros["ZPLC_MAGIC"], macros["ZPLC_VERSION_MAJOR"], macros["ZPLC_VERSION_MINOR"], macros["ZPLC_DRAFT_COUNTER"]))

    def test_hil_tester_has_every_opcode_of_the_header(self):
        missing = sorted(set(self.opcodes) - set(self.view["tester"]["opcodes"]))
        self.assertEqual(missing, [], f"{len(missing)} opcodes missing from tools/hil/zplc_tester.py")
        self.assertEqual(self.view["tester"]["opcodes"], self.opcodes)


HANDLERS = ROOT / "firmware/app/src"


def c_defines(path: Path) -> dict[str, int]:
    text = path.read_text()
    return {m.group(1): int(m.group(2), 0)
            for m in re.finditer(r"^#define\s+(\w+)\s+(0x[0-9A-Fa-f]+|\d+)U?\b", text, flags=re.M)}


class HandlersAgreeWithTheBlockTable(unittest.TestCase):
    """What the Zephyr handlers assume of a function-block layout against the generated table (RT-002).

    The handlers were not edited by WP-11. Every disagreement is a finding; the KNOWN lists hold them,
    so a new one fails here and a fixed one has to be removed from the list (WP-18, WP-86). WP-18 fixed
    the Modbus counts (a result no longer runs over HOST, PORT and the block), the cloud STRING layout
    and the MQTT CONNECTED offset; what is left is the nominal STRING sizes of the layout table, which
    are a layout (contract) change.
    """

    KNOWN_FINDINGS: list[str] = []

    KNOWN_LAYOUT_FINDINGS = [
        "AWS_FLEET_PROV.TEMPLATE_NAME: 85 reserved bytes at 8 reach 93, past THING_NAME at 73",
        "AWS_FLEET_PROV.THING_NAME: 85 reserved bytes at 73 reach 158, past the instance size 137",
        "AZURE_DPS_PROV.DEVICE_ID: 85 reserved bytes at 8 reach 93, past ASSIGNED_HUB at 73",
        "AZURE_EG_PUB.EVENT_TYPE: 85 reserved bytes at 73 reach 158, past PAYLOAD at 138",
        "AZURE_EG_PUB.TOPIC: 85 reserved bytes at 8 reach 93, past EVENT_TYPE at 73",
    ]

    @classmethod
    def setUpClass(cls):
        cls.blocks = {b["name"]: b for b in generate.comm_blocks(CONTRACT)}

    def offset(self, block: str, member: str) -> int:
        return next(m["offset"] for m in self.blocks[block]["members"] if m["name"] == member)

    KNOWN_OFFSET_FINDINGS: list[str] = []

    def test_members_the_handlers_name_sit_where_the_table_puts_them(self):
        header = {"FB_OFF_EN": "EN", "FB_OFF_BUSY": "BUSY", "FB_OFF_DONE": "DONE", "FB_OFF_ERROR": "ERROR", "FB_OFF_STATUS": "STATUS"}
        named = {
            "zplc_comm_mqtt_handler.c": {
                "FB_CONNECT_OFF_CONNECTED": ("MQTT_CONNECT", "CONNECTED"),
                "FB_PUB_OFF_QOS": ("MQTT_PUBLISH", "QOS"), "FB_PUB_OFF_RETAIN": ("MQTT_PUBLISH", "RETAIN"),
                "FB_PUB_OFF_TOPIC": ("MQTT_PUBLISH", "TOPIC"), "FB_PUB_OFF_PAYLOAD": ("MQTT_PUBLISH", "PAYLOAD"),
                "FB_SUB_OFF_QOS": ("MQTT_SUBSCRIBE", "QOS"), "FB_SUB_OFF_VALID": ("MQTT_SUBSCRIBE", "VALID"),
                "FB_SUB_OFF_TOPIC": ("MQTT_SUBSCRIBE", "TOPIC"), "FB_SUB_OFF_PAYLOAD": ("MQTT_SUBSCRIBE", "PAYLOAD"),
            },
            "zplc_comm_cloud_handler.c": {
                "C2D_OFF_PAYLOAD": ("AZURE_C2D_RECV", "PAYLOAD"), "C2D_OFF_VALID": ("AZURE_C2D_RECV", "VALID"),
                "DPS_OFF_DEVICE_ID": ("AZURE_DPS_PROV", "DEVICE_ID"), "DPS_OFF_ASSIGNED_HUB": ("AZURE_DPS_PROV", "ASSIGNED_HUB"),
                "EG_OFF_TOPIC": ("AZURE_EG_PUB", "TOPIC"), "EG_OFF_EVENT_TYPE": ("AZURE_EG_PUB", "EVENT_TYPE"),
                "EG_OFF_PAYLOAD": ("AZURE_EG_PUB", "PAYLOAD"),
                "AWS_OFF_TEMPLATE_NAME": ("AWS_FLEET_PROV", "TEMPLATE_NAME"), "AWS_OFF_THING_NAME": ("AWS_FLEET_PROV", "THING_NAME"),
            },
        }
        findings = []
        for filename, mapping in named.items():
            defines = c_defines(HANDLERS / filename)
            for name, (block, member) in mapping.items():
                self.assertIn(name, defines, f"{filename} no longer defines {name}")
                expected = self.offset(block, member)
                if defines[name] != expected:
                    findings.append(f"{filename}: {name} is {defines[name]}, {block}.{member} is at {expected}"
                                    + (" (PROFILE is at 8)" if (block, member) == ("MQTT_CONNECT", "CONNECTED") else ""))
            for name, member in header.items():
                self.assertEqual(defines[name], self.offset("MQTT_CONNECT", member), f"{filename}: {name}")
        self.assertEqual(sorted(findings), sorted(self.KNOWN_OFFSET_FINDINGS))

    def test_modbus_handler_layout_comment_matches_the_four_modbus_blocks(self):
        text = (HANDLERS / "zplc_comm_modbus_handler.c").read_text()
        comment = text[text.index("// Memory layout offsets:"):text.index("if (is_reset)")]
        offsets = {name: int(off) for off, name in re.findall(r"\+(\d+):\s*([A-Z_]+)", comment)}
        self.assertEqual(sorted(offsets), sorted(["EN", "BUSY", "DONE", "ERROR", "PROTO", "SLAVE_ID", "ADDR", "COUNT", "VALUE", "HOST", "PORT"]))
        for block in ("MB_READ_HREG", "MB_WRITE_HREG", "MB_READ_COIL", "MB_WRITE_COIL"):
            for member, offset in offsets.items():
                self.assertEqual(offset, self.offset(block, member), f"{block}.{member}")

    def test_the_findings_are_exactly_the_known_ones(self):
        findings = []
        string = CONTRACT["string"]
        mqtt = c_defines(HANDLERS / "zplc_comm_mqtt_handler.c")
        cloud = c_defines(HANDLERS / "zplc_comm_cloud_handler.c")
        isa = (string["lenOffset"], string["capOffset"], string["dataOffset"])
        layouts = {
            "mqtt": (mqtt["STR_OFF_LEN"], mqtt["STR_OFF_CAPACITY"], mqtt["STR_OFF_DATA"]),
            "cloud": (cloud["STR_OFF_LEN"], cloud["STR_OFF_CAP"], cloud["STR_OFF_DATA"]),
        }
        self.assertEqual(layouts["mqtt"], isa)
        if layouts["cloud"] != isa:
            findings.append("cloud handler STRING layout is [len u8][cap u8][data at 2]; the contract and the MQTT and Modbus handlers use [len u16][cap u16][data at 4]")
        modbus = (HANDLERS / "zplc_comm_modbus_handler.c").read_text()
        reg_limit = int(re.search(r"#define MAX_MODBUS_REG_COUNT (\d+)", modbus).group(1))
        coil_limit = int(re.search(r"#define MAX_MODBUS_COIL_COUNT (\d+)", modbus).group(1))
        value = self.offset("MB_READ_HREG", "VALUE")
        for block, extent, verb, unit in (
            ("MB_READ_HREG", value + 2 * reg_limit, "writes", f"{value} + 2 * {reg_limit} registers"),
            ("MB_WRITE_HREG", value + 2 * reg_limit, "reads", f"{value} + 2 * {reg_limit} registers"),
            ("MB_READ_COIL", value + coil_limit, "writes", f"{value} + {coil_limit} coils"),
        ):
            size = self.blocks[block]["size"]
            # COM-001: inside the block, and a result buffer does not overlap the block's own parameters
            following = min((m["offset"] for m in self.blocks[block]["members"] if m["offset"] > value), default=size)
            if extent > size:
                findings.append(f"{block}: handler {verb} up to offset {extent} ({unit}), instance size is {size}")
            elif extent > following:
                findings.append(f"{block}: handler {verb} up to offset {extent} ({unit}), over the member at {following}")
        self.assertEqual(sorted(findings), sorted(self.KNOWN_FINDINGS))

    def test_nominal_string_members_against_the_layout_offsets(self):
        findings = []
        for name, block in self.blocks.items():
            ordered = sorted(block["members"], key=lambda m: m["offset"])
            for i, m in enumerate(ordered):
                if m["type"] != "STRING":
                    continue
                end = m["offset"] + m["size"]
                following = ordered[i + 1] if i + 1 < len(ordered) else None
                if following is not None and end > following["offset"]:
                    findings.append(f"{name}.{m['name']}: {m['size']} reserved bytes at {m['offset']} reach {end}, past {following['name']} at {following['offset']}")
                elif following is None and end > block["size"]:
                    findings.append(f"{name}.{m['name']}: {m['size']} reserved bytes at {m['offset']} reach {end}, past the instance size {block['size']}")
        self.assertEqual(sorted(findings), sorted(self.KNOWN_LAYOUT_FINDINGS))


class CrcAgreesBetweenCAndTypeScript(unittest.TestCase):
    """HIL-017: the C loader, the TypeScript assembler and zlib compute the same CRC32."""

    @classmethod
    def setUpClass(cls):
        cls.result = crc_cross.run()

    def test_the_two_implementations_give_the_same_value_on_every_vector(self):
        self.assertEqual(self.result["c"], self.result["ts"])

    def test_both_equal_the_standard_crc32(self):
        self.assertEqual(self.result["ts"], self.result["zlib"])
        self.assertIn("cbf43926", self.result["c"])  # the check value of "123456789"

    def test_the_c_loader_accepts_artifacts_written_by_typescript_and_python_and_refuses_a_flipped_byte(self):
        verdicts = self.result["loader_verdicts"]
        self.assertEqual(verdicts["typescript_artifact"], 0)
        self.assertEqual(verdicts["python_artifact"], 0)
        self.assertEqual(verdicts["tampered_artifact"], GOLDEN["c"]["macros"]["ZPLC_LOADER_ERR_CRC32"])

    def test_the_c_loader_accepts_the_artifact_of_the_hil_script_and_every_committed_example(self):
        verdicts = self.result["loader_verdicts"]
        self.assertEqual(verdicts["hil_modbus_artifact"], 0)
        examples = {name: verdict for name, verdict in verdicts.items() if name.startswith("examples/")}
        self.assertEqual(sorted(examples), sorted(f"examples/{p.name}" for p in (ROOT / "examples").glob("*.zplc")))
        self.assertTrue(examples)
        self.assertEqual({name: verdict for name, verdict in examples.items() if verdict != 0}, {})

    def test_the_c_loader_refuses_another_draft_and_an_artifact_without_a_counter_by_name(self):
        verdicts = self.result["loader_verdicts"]
        draft = GOLDEN["c"]["macros"]["ZPLC_LOADER_ERR_DRAFT"]
        self.assertEqual(verdicts["other_draft_artifact"], draft)
        self.assertEqual(verdicts["no_counter_artifact"], draft)


class DeclaredDepthIsTheLoadersMeasure(unittest.TestCase):
    """CMP-050: the stack and call depth the compiler records in a task are exactly what the C loader measures."""

    @classmethod
    def setUpClass(cls):
        cls.result = depth_cross.run()

    def test_a_good_number_of_conformance_artifacts_are_looked_at(self):
        self.assertGreater(self.result["artifacts"], 300)
        self.assertGreater(self.result["lowered"], 300)

    def test_the_loader_accepts_each_artifact_and_refuses_it_with_a_depth_one_lower(self):
        self.assertEqual(self.result["wrong"], [])


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

    def test_a_member_size_that_disagrees_with_the_string_layout_is_refused(self):
        def edit(c):
            c["comm"]["memberSizes"]["STRING"] = 84
        with self.assertRaisesRegex(generate.ContractError, "STRING"):
            generate.validate(self.mutate(edit))

    def test_a_kind_at_or_above_the_limit_is_refused(self):
        def edit(c):
            c["comm"]["kinds"]["members"][1]["value"] = "0x0100"
        with self.assertRaisesRegex(generate.ContractError, "kindMax"):
            generate.validate(self.mutate(edit))


class DraftCounterRule(unittest.TestCase):
    """CMP-052: until the freeze, every contract change increments the draft counter.

    golden/draft-ledger.json holds, for each counter value, the fingerprint of the binary
    contract (opcodes, layouts, sizes, codes; no prose) and the reason that value exists.
    The table fails here when the contract no longer matches the fingerprint of its own
    counter, so a change cannot be made, snapshotted and committed under the old number.
    """

    LEDGER = generate.load_ledger()

    def problems(self, contract=None, ledger=None):
        return generate.draft_problems(contract or CONTRACT, ledger or self.LEDGER)

    def test_the_committed_contract_follows_the_rule(self):
        self.assertEqual(self.problems(), [])

    def test_the_counter_is_a_positive_integer_and_the_golden_records_it(self):
        counter = CONTRACT["abi"]["draftCounter"]
        self.assertIsInstance(counter, int)
        self.assertGreaterEqual(counter, 1)
        self.assertEqual(GOLDEN["c"]["macros"]["ZPLC_DRAFT_COUNTER"], counter)
        self.assertEqual(GOLDEN["compiler"]["constants"]["DRAFT_COUNTER"], counter)
        self.assertEqual(GOLDEN["asm"]["draftCounter"], counter)

    def test_a_changed_opcode_under_the_same_counter_is_refused(self):
        changed = copy.deepcopy(CONTRACT)
        changed["opcodes"].pop()
        problems = self.problems(changed)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("did not increase", problems[0])

    def test_a_changed_layout_size_or_error_code_under_the_same_counter_is_refused(self):
        def header_field(c):
            c["container"]["structs"][0]["fields"][-1]["type"] = "uint16_t"

        def string_offset(c):
            c["string"]["dataOffset"] = 8

        def loader_code(c):
            next(e for e in c["loader"]["errors"] if e["macro"] == "ZPLC_LOADER_ERR_TAGS")["value"] = -99

        def block_size(c):
            c["comm"]["blocks"][0]["size"] += 1

        for edit in (header_field, string_offset, loader_code, block_size):
            changed = copy.deepcopy(CONTRACT)
            edit(changed)
            self.assertTrue(any("did not increase" in p for p in self.problems(changed)), edit.__name__)

    def test_prose_does_not_need_a_new_counter(self):
        reworded = copy.deepcopy(CONTRACT)
        reworded["opcodes"][0]["doc"] = "No operation, reworded"
        reworded["container"]["structs"][0]["doc"] = "Reworded"
        reworded["groups"][0]["title"] = "Reworded"
        self.assertEqual(self.problems(reworded), [])

    def test_a_bump_without_a_ledger_entry_is_refused(self):
        bumped = copy.deepcopy(CONTRACT)
        bumped["abi"]["draftCounter"] += 1
        self.assertTrue(any("no entry" in p for p in self.problems(bumped)))

    def test_a_bump_with_a_new_ledger_entry_and_a_changed_contract_passes(self):
        changed = copy.deepcopy(CONTRACT)
        changed["abi"]["draftCounter"] += 1
        changed["opcodes"].pop()
        ledger = copy.deepcopy(self.LEDGER)
        ledger["entries"].append({"counter": changed["abi"]["draftCounter"],
                                  "fingerprint": generate.contract_fingerprint(changed), "reason": "test"})
        self.assertEqual(self.problems(changed, ledger), [])

    def test_a_bump_that_changes_nothing_is_refused(self):
        bumped = copy.deepcopy(CONTRACT)
        bumped["abi"]["draftCounter"] += 1
        ledger = copy.deepcopy(self.LEDGER)
        ledger["entries"].append({"counter": bumped["abi"]["draftCounter"],
                                  "fingerprint": generate.contract_fingerprint(bumped), "reason": "nothing changed"})
        self.assertTrue(any("same fingerprint" in p for p in self.problems(bumped, ledger)))

    def test_an_entry_without_a_reason_or_out_of_order_is_refused(self):
        ledger = copy.deepcopy(self.LEDGER)
        ledger["entries"][0]["reason"] = ""
        self.assertTrue(any("reason" in p for p in self.problems(ledger=ledger)))
        ledger = copy.deepcopy(self.LEDGER)
        ledger["entries"][0]["counter"] = 5
        self.assertTrue(any("counters must be 1, 2, 3" in p for p in self.problems(ledger=ledger)))

    def test_generate_check_runs_the_rule(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "contract.json"
            changed = copy.deepcopy(CONTRACT)
            changed["opcodes"].pop()
            source.write_text(json.dumps(changed))
            script = ("import sys; sys.path.insert(0, %r); import generate; from pathlib import Path; "
                      "generate.SOURCE = Path(%r); sys.exit(generate.main(['--check']))" % (str(HERE), str(source)))
            result = subprocess.run([sys.executable, "-B", "-c", script], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("did not increase", result.stderr)


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


class RestampArtifacts(unittest.TestCase):
    """tools/contract/restamp_artifacts.py moves every committed artifact to the current draft counter (CMP-052)."""

    @staticmethod
    def container(counter: int, code: bytes = b"\x40\x01\x01", crc_ok: bool = True) -> bytes:
        import struct
        import zlib
        segments = struct.pack("<HHI", 1, 0, len(code))
        header = bytearray(struct.pack("<4sHHIIIIHHI", b"ZPLC", 1, 0, 0, 0, len(code), 0, 0, 1, counter))
        body = bytes(header) + segments + code
        crc = zlib.crc32(body[:12] + body[16:]) & 0xFFFFFFFF
        out = bytearray(body)
        struct.pack_into("<I", out, 12, crc if crc_ok else crc ^ 1)
        return bytes(out)

    def make_tree(self, root: Path, counter: int = 3) -> dict[str, bytes]:
        (root / "tools/contract/golden").mkdir(parents=True)
        (root / "tools/contract/contract.json").write_text(json.dumps({"abi": {"draftCounter": counter}}))
        (root / "tools/contract/golden/draft-ledger.json").write_text(
            json.dumps({"entries": [{"counter": n} for n in range(1, counter + 1)]}))
        stale, legacy, damaged, current = (self.container(2), self.container(0), self.container(2, crc_ok=False),
                                           self.container(counter))
        (root / "examples").mkdir()
        (root / "examples/stale.zplc").write_bytes(stale)
        (root / "examples/legacy.zplc").write_bytes(legacy)
        (root / "examples/damaged.zplc").write_bytes(damaged)
        (root / "examples/current.zplc").write_bytes(current)
        (root / "fixture.hex").write_text(stale.hex().upper() + "\n")
        array = ",\n    ".join("0x%02x" % b for b in stale)
        (root / "fixture.h").write_text("static const uint8_t program[] = {\n    " + array + " /* end */\n};\n"
                                        "static const uint8_t legacy[] = { " + ", ".join("0x%02X" % b for b in legacy) + " };\n")
        (root / "corpus.json").write_text(json.dumps({"artifacts": {"a.zplc": stale.hex(), "b.zplc": legacy.hex()}}))
        (root / "notes.md").write_text("The header starts 5a504c430100000000000000 and goes on\n")
        (root / "short.h").write_text("static const uint8_t m[] = { 0x5a, 0x50, 0x4c, 0x43 };\n")
        return {"stale": stale, "legacy": legacy, "damaged": damaged}

    def run_tool(self, root: Path, *flags: str):
        return subprocess.run([sys.executable, "-B", str(HERE / "restamp_artifacts.py"), "--root", str(root), *flags],
                              capture_output=True, text=True)

    def test_check_names_every_stale_artifact_and_a_restamp_fixes_exactly_those(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            made = self.make_tree(root)
            before = {p.name: p.read_bytes() for p in root.rglob("*") if p.is_file()}
            checked = self.run_tool(root, "--check")
            self.assertEqual(checked.returncode, 1, checked.stdout + checked.stderr)
            for name in ("examples/stale.zplc", "fixture.hex", "fixture.h", "corpus.json"):
                self.assertIn(f"stale: {name}", checked.stderr)
            for name in ("legacy.zplc", "damaged.zplc", "current.zplc", "notes.md", "short.h"):
                self.assertNotIn(f"stale: examples/{name}", checked.stderr)
                self.assertNotIn(f"stale: {name}", checked.stderr)
            self.assertEqual({p.name: p.read_bytes() for p in root.rglob("*") if p.is_file()}, before,
                             "--check must change nothing")

            fixed = self.run_tool(root)
            self.assertEqual(fixed.returncode, 0, fixed.stderr)
            self.assertEqual(self.run_tool(root, "--check").returncode, 0)
            import struct
            import zlib
            expected = self.container(3)
            self.assertEqual((root / "examples/stale.zplc").read_bytes(), expected)
            self.assertEqual((root / "fixture.hex").read_text(), expected.hex().upper() + "\n")
            text = (root / "fixture.h").read_text()
            self.assertIn("/* end */", text)
            self.assertEqual(bytes(int(m, 16) for m in re.findall(r"0x([0-9a-f]{2})", text.split("legacy")[0])), expected)
            self.assertEqual(json.loads((root / "corpus.json").read_text())["artifacts"],
                             {"a.zplc": expected.hex(), "b.zplc": made["legacy"].hex()})
            # a deliberate negative case is never touched: before the counter, and a damaged CRC
            self.assertEqual((root / "examples/legacy.zplc").read_bytes(), made["legacy"])
            self.assertEqual((root / "examples/damaged.zplc").read_bytes(), made["damaged"])
            self.assertEqual((root / "notes.md").read_text(), (before["notes.md"]).decode())
            data = (root / "examples/stale.zplc").read_bytes()
            self.assertEqual(struct.unpack_from("<I", data, 28)[0], 3)
            self.assertEqual(struct.unpack_from("<I", data, 12)[0], zlib.crc32(data[:12] + data[16:]) & 0xFFFFFFFF)

    def test_every_committed_artifact_carries_the_current_counter(self):
        result = subprocess.run([sys.executable, "-B", str(HERE / "restamp_artifacts.py"), "--check"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
