#!/usr/bin/env python3
"""HIL-011: a report from a user is recordable at the "community-reported" level, through the board report issue template.

A report is evidence of a lead and never of a qualification: it is listed beside the hardware records of a board, it names
the exact image it is about, and it never raises the support level of the board or turns its hardware watchdog on.
"""
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import community_report  # noqa: E402


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


boards = load("zplc_boards_under_test_community", ROOT / "firmware/zephyr/scripts/zplc_boards.py")
MANIFEST = json.loads((ROOT / "firmware/app/boards/boards.json").read_text())
PICO = next(board for board in MANIFEST if board["ide_id"] == "rpi_pico")

REPORT = {
    "board": "rpi_pico",
    "firmware_version": "2.0.0-rc.4",
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "image_sha256": "b" * 64,
    "result": "pass",
    "issue": "https://github.com/eduardojvieira/ZPLC/issues/123",
    "reported_by": "some-user",
    "reported_at": "2026-10-11",
}


class RecordTests(unittest.TestCase):
    def test_a_report_that_names_the_image_is_recorded_at_the_community_level(self) -> None:
        record = community_report.record_from_report(REPORT, MANIFEST)
        self.assertEqual(record["schema"], "zplc.community-report/1")
        self.assertEqual(record["level"], "community-reported")
        self.assertEqual(record["board_id"], PICO["board_id"], "the board is named as the manifest names it, not by its IDE id")
        found = boards.community_reports_from_records(PICO["board_id"], [("records/user.json", record)])
        self.assertEqual(
            found,
            [{"ref": "records/user.json", "level": "community-reported", "firmware_version": "2.0.0-rc.4", "commit": REPORT["commit"], "result": "pass", "issue": REPORT["issue"]}],
        )

    def test_a_report_never_raises_the_level_of_the_board(self) -> None:
        record = community_report.record_from_report(REPORT, MANIFEST)
        level = boards.support_level_from_records(PICO["board_id"], [("records/user.json", record)])
        self.assertEqual(level, {"level": "cross-build", "records": []})

    def test_a_report_never_turns_the_hardware_watchdog_on(self) -> None:
        record = community_report.record_from_report(REPORT, MANIFEST)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "records").mkdir()
            (root / "records/user.json").write_text(json.dumps(record))
            board = {**PICO, "evidence_refs": ["records/user.json"], "watchdog": {**PICO["watchdog"], "enabled": True}}
            errors = boards.validate_watchdog(board, root)
            self.assertTrue(any("no passing hardware record" in error for error in errors), errors)
            off = {**PICO, "evidence_refs": ["records/user.json"]}
            self.assertEqual(boards.validate_watchdog(off, root), [], "a board with only a report stays cross-build, watchdog off")

    def test_a_report_that_does_not_name_an_exact_image_is_refused(self) -> None:
        cases = {
            "no commit": {"commit": ""},
            "a short commit": {"commit": "0123456"},
            "no image hash": {"image_sha256": ""},
            "a hash of the wrong length": {"image_sha256": "b" * 63},
            "no firmware version": {"firmware_version": " "},
            "a result that is neither": {"result": "mostly"},
            "a board that is not in the manifest": {"board": "no_such_board"},
            "an issue that is not an issue of the project": {"issue": "https://example.com/issues/1"},
            "no reporter": {"reported_by": ""},
        }
        for name, change in cases.items():
            with self.subTest(name):
                with self.assertRaises(ValueError):
                    community_report.record_from_report({**REPORT, **change}, MANIFEST)

    def test_a_record_of_another_board_or_another_schema_is_not_a_report_of_this_board(self) -> None:
        record = community_report.record_from_report(REPORT, MANIFEST)
        other = next(board for board in MANIFEST if board["board_id"] != PICO["board_id"])
        self.assertEqual(boards.community_reports_from_records(other["board_id"], [("r.json", record)]), [])
        hardware = {**record, "schema": "zplc.hil-record/1"}
        self.assertEqual(boards.community_reports_from_records(PICO["board_id"], [("r.json", hardware)]), [])

    def test_a_report_that_claims_a_higher_level_is_not_one(self) -> None:
        record = {**community_report.record_from_report(REPORT, MANIFEST), "level": "human-hil"}
        self.assertEqual(boards.community_reports_from_records(PICO["board_id"], [("r.json", record)]), [])


class ReferenceTests(unittest.TestCase):
    def test_the_board_table_lists_a_report_beside_the_records_and_keeps_the_level(self) -> None:
        generator = load("generate_board_reference_under_test", ROOT / "tools/docs/generate_board_reference.py")
        record = community_report.record_from_report(REPORT, MANIFEST)
        reports = boards.community_reports_from_records(PICO["board_id"], [("records/user.json", record)])
        generator.community = lambda board: reports if board["board_id"] == PICO["board_id"] else []
        for spanish, label in ((False, "community-reported: pass on 2.0.0-rc.4"), (True, "reportado por la comunidad: pass en 2.0.0-rc.4")):
            with self.subTest("es" if spanish else "en"):
                row = next(line for line in generator.render_support_table(MANIFEST, spanish).splitlines() if f"`{PICO['ide_id']}`" in line)
                self.assertIn(label, row)
                self.assertIn("`cross-build`", row, "a report does not change the support level")
                self.assertNotIn("human-hil", row)


class CommandTests(unittest.TestCase):
    def test_the_command_writes_the_record_that_a_manifest_can_list(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            done = subprocess.run(
                [
                    sys.executable, "-B", str(HERE / "community_report.py"), "--board", "rpi_pico",
                    "--firmware-version", REPORT["firmware_version"], "--commit", REPORT["commit"],
                    "--image-sha256", REPORT["image_sha256"], "--result", "fail", "--issue", REPORT["issue"],
                    "--reported-by", REPORT["reported_by"], "--date", REPORT["reported_at"], "--out", directory,
                ],
                capture_output=True, text=True, cwd=ROOT,
            )
            self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
            (path,) = Path(directory).glob("*.json")
            self.assertEqual(path.name, "rpi-pico-rp2040-2026-10-11-issue-123.json")
            record = json.loads(path.read_text())
            reports = boards.community_reports_from_records(PICO["board_id"], [(path.name, record)])
            self.assertEqual([item["result"] for item in reports], ["fail"], "a failed report is recorded too: it is a lead as well")

    def test_the_command_refuses_a_report_it_cannot_bind_to_an_image(self) -> None:
        done = subprocess.run(
            [sys.executable, "-B", str(HERE / "community_report.py"), "--board", "rpi_pico", "--firmware-version", "2.0.0", "--commit", "abc",
             "--image-sha256", "def", "--result", "pass", "--issue", REPORT["issue"], "--reported-by", "x"],
            capture_output=True, text=True, cwd=ROOT,
        )
        self.assertEqual(done.returncode, 2, done.stdout + done.stderr)
        self.assertIn("commit", done.stderr)


class IssueTemplateTests(unittest.TestCase):
    TEMPLATE = (ROOT / ".github/ISSUE_TEMPLATE/board_report.yml").read_text()

    def test_the_form_asks_for_every_field_that_the_record_needs(self) -> None:
        ids = re.findall(r"^\s+id:\s*(\S+)\s*$", self.TEMPLATE, re.M)
        for needed in ("board", "firmware_version", "commit", "image_sha256", "result"):
            self.assertIn(needed, ids, f"the board report form has no field {needed!r}")

    def test_the_form_lists_the_boards_of_the_manifest_and_says_what_a_report_is(self) -> None:
        options = re.findall(r"^\s+- (.+)$", self.TEMPLATE.split("id: board\n", 1)[1].split("validations:", 1)[0], re.M)
        ide_ids = [re.search(r"\((\w+)\)$", option).group(1) for option in options if re.search(r"\((\w+)\)$", option)]
        for board in MANIFEST:
            self.assertIn(board["ide_id"], ide_ids, f"{board['display_name']} is not offered by the form")
        self.assertIn("community-reported", self.TEMPLATE)


if __name__ == "__main__":
    unittest.main()
