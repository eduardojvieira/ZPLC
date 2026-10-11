#!/usr/bin/env python3
"""Fixture tests for validate_docs_pages.py (VF-019): one fixture per rule."""
import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("validate_docs_pages.py")
SPEC = importlib.util.spec_from_file_location("validate_docs_pages", MODULE_PATH)
assert SPEC and SPEC.loader
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)

SIDEBAR = "module.exports = { docsSidebar: ['guide/index', 'guide/second'] };\n"
GOOD = "# Title\n\nThis page is complete.\n"


def build(root: Path, en: dict[str, str], es: dict[str, str] | None = None, sidebar: str = SIDEBAR) -> None:
    (root / "docs").mkdir(parents=True, exist_ok=True)
    (root / "docs/sidebars.js").write_text(sidebar)
    for base, pages in ((validator.EN_DIR, en), (validator.ES_DIR, es or {})):
        for relative, text in pages.items():
            path = root / base / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)


class DocsPageValidatorTests(unittest.TestCase):
    def run_validator(self, en: dict[str, str], es: dict[str, str] | None = None, sidebar: str = SIDEBAR) -> list[str]:
        with tempfile.TemporaryDirectory() as directory:
            build(Path(directory), en, es, sidebar)
            return validator.validate(Path(directory))

    def test_clean_pair_passes(self) -> None:
        pages = {"guide/index.md": GOOD, "guide/second.md": GOOD}
        self.assertEqual(self.run_validator(pages, pages), [])

    # Rule 1: the last non-empty line must end the page.

    def test_page_that_stops_mid_sentence_fails(self) -> None:
        errors = self.run_validator({"guide/index.md": "# Title\n\nCurrent six profiles are\n", "guide/second.md": GOOD})
        self.assertEqual(len(errors), 1)
        self.assertIn("guide/index.md", errors[0])
        self.assertIn("mid-sentence", errors[0])

    def test_spanish_page_is_checked_too(self) -> None:
        pages = {"guide/index.md": GOOD, "guide/second.md": GOOD}
        errors = self.run_validator(pages, {**pages, "guide/second.md": "# Titulo\n\nLos seis perfiles actuales\n"})
        self.assertEqual(len(errors), 1)
        self.assertIn("es:guide/second.md", errors[0])

    def test_endings_the_spec_accepts(self) -> None:
        endings = {
            "sentence": "Done.",
            "question": "Ready?",
            "sentence in parentheses": "(See the page.)",
            "sentence in bold": "**Done.**",
            "sentence in quotes": "He said “done.”",
            "sentence ending in code": "Run `bun test`.",
            "table row": "| a | b |",
            "list item": "- [Next page](./next.md)",
            "numbered list item": "3. Press Run",
            "closing code fence": "```bash\nbun test\n```",
            "admonition end": ":::note\nRead this.\n:::",
            "image": "![The Build button](./build.png)",
            "image with a title": '![The Build button](./build.png "Build")',
        }
        for name, ending in endings.items():
            with self.subTest(name):
                self.assertEqual(self.run_validator({"guide/index.md": f"# Title\n\n{ending}\n", "guide/second.md": GOOD}), [])

    def test_endings_the_spec_rejects(self) -> None:
        endings = {
            "link without a full stop": "Read [AI and privacy](./ai-privacy.md)",
            "word": "before",
            "heading": "## Next steps",
            "thematic break": "---",
            "colon": "The steps are:",
            "open code fence": "```bash\nbun test",
            "header of a table with no row": "| Board | Flash |\n|---|---|",
            "image without a closing parenthesis": "![The Build button](./build.png",
        }
        for name, ending in endings.items():
            with self.subTest(name):
                errors = self.run_validator({"guide/index.md": f"# Title\n\nIntro.\n\n{ending}\n", "guide/second.md": GOOD})
                self.assertEqual(len(errors), 1, errors)

    def test_empty_page_fails(self) -> None:
        errors = self.run_validator({"guide/index.md": "\n\n", "guide/second.md": GOOD})
        self.assertEqual(len(errors), 1)
        self.assertIn("empty", errors[0])

    # Rule 2: every page is in the sidebar.

    def test_page_missing_from_sidebar_fails(self) -> None:
        errors = self.run_validator({"guide/index.md": GOOD, "guide/second.md": GOOD, "guide/orphan.md": GOOD})
        self.assertEqual(len(errors), 1)
        self.assertIn("guide/orphan", errors[0])
        self.assertIn("sidebar", errors[0])

    def test_page_that_only_a_comment_of_the_sidebar_names_fails(self) -> None:
        sidebar = "module.exports = { docsSidebar: [\n  'guide/index',\n  // 'guide/orphan',\n  /* 'guide/second' */\n] };\n"
        pages = {"guide/index.md": GOOD, "guide/second.md": GOOD, "guide/orphan.md": GOOD}
        errors = self.run_validator(pages, sidebar=sidebar)
        self.assertEqual(sorted(error.split(":")[0] for error in errors), ["guide/orphan.md", "guide/second.md"])

    def test_front_matter_id_names_the_sidebar_entry(self) -> None:
        pages = {"guide/index.md": GOOD, "guide/second.md": "---\nid: renamed\n---\n\nComplete.\n"}
        errors = self.run_validator(pages, sidebar="x = ['guide/index', 'guide/renamed'];")
        self.assertEqual(errors, [])

    def test_unlisted_page_is_exempt(self) -> None:
        pages = {"guide/index.md": GOOD, "guide/second.md": GOOD, "guide/old.md": "---\nunlisted: true\n---\n\nKept for old links.\n"}
        self.assertEqual(self.run_validator(pages), [])

    # Rule 3: English and Spanish pairs have the same shape.

    def test_heading_structure_difference_fails(self) -> None:
        en = {"guide/index.md": "# A\n\n## B\n\nText.\n\n## C\n\nText.\n", "guide/second.md": GOOD}
        es = {"guide/index.md": "# A\n\n## B\n\nTexto.\n\n### C\n\nTexto.\n", "guide/second.md": GOOD}
        errors = self.run_validator(en, es)
        self.assertEqual(len(errors), 1)
        self.assertIn("heading structure", errors[0])

    def test_headings_inside_code_blocks_do_not_count(self) -> None:
        en = {"guide/index.md": "# A\n\n```sh\n# a comment\n```\n", "guide/second.md": GOOD}
        es = {"guide/index.md": "# A\n\n```sh\n# un comentario\n# otro\n```\n", "guide/second.md": GOOD}
        self.assertEqual(self.run_validator(en, es), [])

    def test_code_block_count_difference_fails(self) -> None:
        en = {"guide/index.md": "# A\n\n```sh\nls\n```\n\nText.\n\n```sh\npwd\n```\n", "guide/second.md": GOOD}
        es = {"guide/index.md": "# A\n\n```sh\nls\n```\n\nTexto.\n", "guide/second.md": GOOD}
        errors = self.run_validator(en, es)
        self.assertEqual(len(errors), 1)
        self.assertIn("code blocks", errors[0])

    def test_front_matter_is_not_read_as_headings(self) -> None:
        en = {"guide/index.md": "---\ntitle: A\n# a yaml comment\n---\n\n# A\n\nText.\n", "guide/second.md": GOOD}
        es = {"guide/index.md": "---\ntitle: A\n---\n\n# A\n\nTexto.\n", "guide/second.md": GOOD}
        self.assertEqual(self.run_validator(en, es), [])

    def test_english_page_without_a_twin_is_not_a_pair(self) -> None:
        pages = {"guide/index.md": GOOD, "guide/second.md": GOOD}
        self.assertEqual(self.run_validator(pages, {"guide/index.md": GOOD}), [])


if __name__ == "__main__":
    unittest.main()
