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


class IdentityTests(unittest.TestCase):
    def test_the_commit_is_read_from_the_build_information_when_the_image_has_it(self):
        info = {"zplc_version": "2.0.0", "bytecode_abi_major": 1, "bytecode_abi_minor": 0, "draft_counter": 4,
                "build": {"commit": "a" * 40, "options": {"HIL_DEBUG": False}}}
        found = firmware_identity(info)
        self.assertEqual(found["commit"], "a" * 40)
        self.assertEqual(found["version"], "2.0.0")
        self.assertEqual(found["build_options"], {"HIL_DEBUG": False})
        self.assertEqual(found["draft_counter"], 4)

    def test_an_image_that_reports_no_commit_gives_none_not_a_guess(self):
        found = firmware_identity({"zplc_version": "2.0.0"})
        self.assertIsNone(found["commit"])
        self.assertIsNone(found["build_options"])

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
