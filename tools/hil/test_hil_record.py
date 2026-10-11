#!/usr/bin/env python3
"""HIL-009: the record of a run is machine-readable, bound to the firmware it tested, and refused when it does not fit its schema."""
import copy
import json
import re
import tempfile
import unittest
from pathlib import Path

import hil_record
from hil_record import firmware_identity, new_record, serial_hash, summarize, validate, write_record

STEP = {"id": "handshake", "title": "Identity handshake", "kind": "automatic", "result": "pass"}


def record():
    value = new_record("chain", "hardware", {"id": "rpi_pico", "zephyr_board": "rpi_pico/rp2040"}, "A. Person")
    value["device"] = {"reported_board": "rpi_pico", "link": "serial"}
    value["steps"] = [dict(STEP)]
    value["result"] = "pass"
    return value


class SchemaTests(unittest.TestCase):
    def test_a_complete_record_is_valid(self):
        self.assertEqual(validate(record()), [])

    def test_firmware_fields_may_all_be_absent_until_the_image_reports_them(self):
        self.assertEqual(validate(record()), [])
        value = record()
        value["firmware"] = {"commit": None, "version": None, "image_sha256": None}
        self.assertEqual(validate(value), [])

    def test_a_missing_required_field_is_named(self):
        value = record()
        del value["operator"]
        self.assertIn("$: operator is required", validate(value))

    def test_a_field_the_schema_does_not_know_is_refused(self):
        value = record()
        value["pass"] = True
        self.assertTrue(any("pass is not a field" in problem for problem in validate(value)))

    def test_the_kinds_of_evidence_are_closed(self):
        value = record()
        value["evidence"] = "probably hardware"
        self.assertTrue(validate(value))

    def test_hashes_and_times_have_their_shape(self):
        value = record()
        value["firmware"]["image_sha256"] = "not-a-hash"
        value["started_at"] = "yesterday"
        problems = validate(value)
        self.assertTrue(any("image_sha256" in p for p in problems))
        self.assertTrue(any("started_at" in p for p in problems))

    def test_a_step_result_outside_the_list_is_refused(self):
        value = record()
        value["steps"][0]["result"] = "ok"
        self.assertTrue(validate(value))


TESTDATA = Path(__file__).resolve().parent / "testdata"
# What the generated formatter of scripts/release/zplc_fw_identity.h.in printed for a host runtime built from this
# tree: the JSON of `zplc sys build --json` (and the `build` of the host runtime's session.hello), and the text of
# `zplc version` and `zplc sys build`.
HOST_JSON = json.loads((TESTDATA / "identity-host-runtime.json").read_text())
HOST_TEXT = (TESTDATA / "identity-host-runtime.txt").read_text()


class IdentityTests(unittest.TestCase):
    def test_the_real_keys_of_zplc_sys_build_give_the_firmware_fields(self):
        found = firmware_identity(HOST_JSON)
        self.assertEqual(found["commit"], HOST_JSON["commit"])
        self.assertRegex(found["commit"], r"^[0-9a-f]{40}$")
        self.assertEqual(found["version"], HOST_JSON["version"])
        self.assertEqual(found["dirty"], HOST_JSON["dirty"])
        self.assertEqual(found["board_target"], HOST_JSON["board"])
        self.assertEqual((found["abi_major"], found["abi_minor"], found["draft_counter"]), (HOST_JSON["abi_major"], HOST_JSON["abi_minor"], HOST_JSON["draft_counter"]))
        self.assertEqual(found["options_hash"], HOST_JSON["options_hash"])
        self.assertEqual(found["options"], HOST_JSON["options"])
        self.assertEqual(found["build_options"], {"build_type": "Release"})
        self.assertEqual(validate({**record(), "firmware": found}), [])

    def test_the_text_of_zplc_version_and_zplc_sys_build_is_the_same_identity(self):
        self.assertEqual(hil_record.parse_identity_text(HOST_TEXT), HOST_JSON)

    def test_the_text_of_an_image_that_prints_something_else_is_no_identity(self):
        self.assertEqual(hil_record.parse_identity_text("ZPLC Runtime v1.5.0\nBuilt: Oct 10 2026 12:00:00\n"), {})
        self.assertEqual(hil_record.parse_identity_text(""), {})

    def test_a_zephyr_image_says_in_its_options_whether_it_carries_the_hil_trace(self):
        # the identity of the Pico image built without and with tools/hil/hil_debug.conf, as the generated header of each build printed it
        release = json.loads((TESTDATA / "identity-rpi-pico-release.json").read_text())
        traced = json.loads((TESTDATA / "identity-rpi-pico-hil-trace.json").read_text())
        self.assertNotIn("HIL_DEBUG", release["options"])
        self.assertIn("HIL_DEBUG=y", traced["options"])
        self.assertNotEqual(release["options_hash"], traced["options_hash"], "the overlay makes another image, and its hash says so")
        off, on = firmware_identity(release), firmware_identity(traced)
        self.assertIs(off["hil_trace"], False)
        self.assertIs(on["hil_trace"], True)
        self.assertEqual(on["build_options"]["HIL_DEBUG"], "y")
        self.assertEqual(on["board_target"], "rpi_pico/rp2040")
        self.assertEqual(validate({**record(), "firmware": on}), [])
        self.assertEqual(hil_record.parse_identity_text((TESTDATA / "identity-rpi-pico-hil-trace.txt").read_text()), traced)
        self.assertIsNone(firmware_identity(HOST_JSON)["hil_trace"], "a host build has no such option, so the record does not say")

    def test_a_build_of_a_tree_without_git_names_no_commit(self):
        self.assertIsNone(firmware_identity({**HOST_JSON, "commit": "unknown"})["commit"])

    def test_an_image_that_reports_no_identity_gives_an_empty_firmware_record_not_a_guess(self):
        self.assertEqual(firmware_identity({}), {})
        self.assertEqual(firmware_identity(None), {})

    def test_the_unit_is_named_by_a_hash_that_hides_its_serial_number(self):
        named = serial_hash(0x2E8A, 0x000A, "E6614103E7123456")
        self.assertRegex(named, r"^[0-9a-f]{64}$")
        self.assertNotIn("E6614103", named)
        self.assertIsNone(serial_hash(0x2E8A, 0x000A, None))


class ResultTests(unittest.TestCase):
    def test_one_failed_step_fails_the_run_whatever_else_passed(self):
        value = record()
        value["steps"].append({**STEP, "id": "run", "result": "fail"})
        self.assertEqual(summarize(value), "fail")

    def test_pending_steps_do_not_fail_a_run_and_do_not_pass_it_alone(self):
        value = record()
        value["steps"] = [{**STEP, "result": "pending"}]
        self.assertEqual(summarize(value), "incomplete")
        value["steps"].append(dict(STEP))
        self.assertEqual(summarize(value), "pass")


class WriteTests(unittest.TestCase):
    def test_a_valid_record_is_written_under_its_board_and_date_and_reads_back(self):
        with tempfile.TemporaryDirectory() as directory:
            value = record()
            path = write_record(value, directory)
            self.assertRegex(path.name, r"^rpi_pico-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.json$")
            self.assertEqual(json.loads(path.read_text()), value)

    def test_an_invalid_record_is_refused_and_nothing_is_written(self):
        with tempfile.TemporaryDirectory() as directory:
            value = copy.deepcopy(record())
            value["evidence"] = "hope"
            with self.assertRaises(ValueError):
                write_record(value, directory)
            self.assertEqual(list(Path(directory).iterdir()), [])


class SchemaFileTests(unittest.TestCase):
    def test_the_python_and_typescript_readers_share_one_schema_file(self):
        self.assertEqual(hil_record.SCHEMA_FILE.name, "run-record.schema.json")
        schema = hil_record.load_schema()
        self.assertEqual(schema["properties"]["schema"]["const"], hil_record.SCHEMA_ID)
        self.assertTrue(re.match(schema["properties"]["run_id"]["pattern"], record()["run_id"]))


if __name__ == "__main__":
    unittest.main()
