#!/usr/bin/env python3
"""Tests of generate_known_limits.py: a row exists while a case fails and goes away with the last one,
a requirement without a description fails the check, and the pages of the repository are fresh."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

MODULE_PATH = Path(__file__).with_name("generate_known_limits.py")
SPEC = importlib.util.spec_from_file_location("generate_known_limits", MODULE_PATH)
assert SPEC and SPEC.loader
gen = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gen)

LANGUAGE = gen.block_name("language")
LIBRARY = gen.block_name("library")
SUITE = "packages/zplc-ide/src/conformance/conformance.test.ts > conformance > "


def entry(requirement: str, title: str) -> dict:
    return {"test": f"{SUITE}{requirement} {title}", "requirement": requirement, "added": "2026-10-10", "reason": "x"}


MAPPING = {
    "CMP-003": {"page": "language", "en": "Unknown types take size 0.", "es": "Los tipos desconocidos toman tamaño 0."},
    "CMP-057": {
        "page": "library",
        "en": "Some blocks differ.",
        "es": "Algunos bloques difieren.",
        "cases": {
            "TON elapsed time stops": {"en": "TON.ET is not capped.", "es": "TON.ET no tiene tope."},
            "TP restarts": {"en": "TP restarts.", "es": "TP reinicia."},
        },
    },
}
FAILURES = [
    entry("CMP-003", "a declaration of type CHAR is rejected"),
    entry("CMP-003", "a declaration of type LTIME is rejected"),
    entry("CMP-057", "TON elapsed time stops"),
]


def page(name: str) -> str:
    return f"# Page\n\ntext before\n\n{gen.marker_begin(name)}\nOLD\n{gen.marker_end(name)}\n\ntext after\n"


def build(root: Path, failures=None, mapping=None) -> None:
    (root / "tools/ci").mkdir(parents=True, exist_ok=True)
    (root / "docs").mkdir(parents=True, exist_ok=True)
    (root / gen.FAILURES_REL).write_text(json.dumps(FAILURES if failures is None else failures))
    (root / gen.MAPPING_REL).write_text(json.dumps(MAPPING if mapping is None else mapping))
    for directory in (gen.EN_DIR, gen.ES_DIR):
        for key, relative in gen.PAGES.items():
            path = root / directory / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(page(gen.block_name(key)))


class KnownLimitsTests(unittest.TestCase):
    def outputs(self, failures=None, mapping=None) -> dict[str, str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            build(root, failures, mapping)
            return {str(path.relative_to(root)): text for path, text in gen.build_outputs(root).items()}

    def test_a_row_for_each_requirement_with_a_failing_case_on_its_page(self) -> None:
        out = self.outputs()
        language = out[f"{gen.EN_DIR}/{gen.PAGES['language']}"]
        library = out[f"{gen.EN_DIR}/{gen.PAGES['library']}"]
        self.assertIn("| CMP-003 | Unknown types take size 0. |", language)
        self.assertNotIn("CMP-057", language)
        self.assertIn("| CMP-057 | Some blocks differ. TON.ET is not capped. |", library)
        self.assertNotIn("CMP-003", library)

    def test_the_failing_case_titles_are_listed_without_the_requirement_prefix(self) -> None:
        language = self.outputs()[f"{gen.EN_DIR}/{gen.PAGES['language']}"]
        self.assertIn("`a declaration of type CHAR is rejected`<br />`a declaration of type LTIME is rejected`", language)
        self.assertNotIn("CMP-003 a declaration", language)

    def test_the_spanish_page_gets_the_spanish_text_and_the_same_cases(self) -> None:
        spanish = self.outputs()[f"{gen.ES_DIR}/{gen.PAGES['language']}"]
        self.assertIn("| Requisito | Qué ocurre hoy | Casos que fallan hoy |", spanish)
        self.assertIn("Los tipos desconocidos toman tamaño 0.", spanish)
        self.assertIn("`a declaration of type CHAR is rejected`", spanish)

    def test_a_row_disappears_with_its_last_failing_case(self) -> None:
        without_third = [e for e in FAILURES if e["requirement"] != "CMP-003"]
        out = self.outputs(failures=without_third)
        language = out[f"{gen.EN_DIR}/{gen.PAGES['language']}"]
        self.assertNotIn("CMP-003", language)
        self.assertIn(gen.EMPTY["en"], language)
        self.assertIn(gen.EMPTY["es"], out[f"{gen.ES_DIR}/{gen.PAGES['language']}"])

    def test_a_sentence_of_a_case_goes_away_with_that_case(self) -> None:
        only_tp = [entry("CMP-057", "TP restarts")]
        library = self.outputs(failures=only_tp)[f"{gen.EN_DIR}/{gen.PAGES['library']}"]
        self.assertIn("TP restarts.", library)
        self.assertNotIn("TON.ET is not capped.", library)

    def test_text_outside_the_markers_is_kept(self) -> None:
        language = self.outputs()[f"{gen.EN_DIR}/{gen.PAGES['language']}"]
        self.assertTrue(language.startswith("# Page\n\ntext before\n\n"))
        self.assertTrue(language.endswith("\n\ntext after\n"))
        self.assertNotIn("OLD", language)

    def test_a_requirement_without_a_description_is_an_error(self) -> None:
        failures = FAILURES + [entry("CMP-099", "something new fails")]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            build(root, failures)
            with self.assertRaises(ValueError) as caught:
                gen.build_outputs(root)
            self.assertIn("CMP-099", str(caught.exception))
            self.assertIn("no description", str(caught.exception))

    def test_a_description_without_a_spanish_text_is_an_error(self) -> None:
        mapping = json.loads(json.dumps(MAPPING))
        mapping["CMP-003"]["es"] = ""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            build(root, mapping=mapping)
            with self.assertRaises(ValueError):
                gen.build_outputs(root)

    def test_markup_outside_a_code_span_is_an_error(self) -> None:
        for text in ("a < b", "a { b", "a | b"):
            mapping = json.loads(json.dumps(MAPPING))
            mapping["CMP-003"]["en"] = text
            self.assertTrue(gen.mapping_errors(mapping, {"CMP-003": ["x"]}), text)
        mapping = json.loads(json.dumps(MAPPING))
        mapping["CMP-003"]["en"] = "inside a code span `a < b` is fine"
        self.assertEqual(gen.mapping_errors(mapping, {"CMP-003": ["x"]}), [])

    def test_a_pipe_in_a_title_does_not_end_the_cell(self) -> None:
        self.assertEqual(gen.code("a | b"), "`a \\| b`")

    def test_a_page_without_its_markers_is_an_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            build(root)
            (root / gen.EN_DIR / gen.PAGES["language"]).write_text("# no markers\n")
            with self.assertRaises(ValueError):
                gen.build_outputs(root)

    def test_check_reports_a_stale_page(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            build(root)
            outputs = gen.build_outputs(root)
            self.assertEqual(len(gen.check_outputs(outputs, root)), 4)  # the fixture pages hold OLD
            for path, text in outputs.items():
                path.write_text(text)
            self.assertEqual(gen.check_outputs(gen.build_outputs(root), root), [])

    def test_descriptions_of_requirements_that_pass_now_are_a_note_not_an_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            build(root, failures=[entry("CMP-003", "x")])
            gen.build_outputs(root)
            self.assertTrue(any("CMP-057" in note for note in gen.notes(root)))

    def test_every_requirement_of_the_repository_list_is_described_and_the_pages_are_fresh(self) -> None:
        outputs = gen.build_outputs(gen.ROOT)
        self.assertEqual(gen.check_outputs(outputs, gen.ROOT), [])
        for entry_ in json.loads((gen.ROOT / gen.FAILURES_REL).read_text()):
            self.assertIn(entry_["requirement"], json.loads((gen.ROOT / gen.MAPPING_REL).read_text()))


if __name__ == "__main__":
    unittest.main()
