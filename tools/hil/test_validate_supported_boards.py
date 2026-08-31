#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("validate_supported_boards.py")
SPEC = importlib.util.spec_from_file_location("validate_supported_boards", MODULE_PATH)
assert SPEC and SPEC.loader
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


def workflow(include: str, extra: str = "") -> str:
    return f"""jobs:
  zephyr-cross-build:
    strategy:
      fail-fast: false
      matrix:
        include:
{include}
{extra}  docs-and-truth:
    runs-on: ubuntu-latest
"""


class CrossBuildMatrixTests(unittest.TestCase):
    def read(self, contents: str) -> list[str]:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ci.yml"
            path.write_text(contents)
            return validator.read_cross_build_boards(path)

    def test_valid_fixture_ignores_board_outside_include(self) -> None:
        boards = self.read(
            workflow(
                """          - id: first
            board: board/first
          - id: second
            board: board/second
""",
                """    env:
      board: board/second
""",
            )
        )
        self.assertEqual(["board/first", "board/second"], boards)

    def test_foreign_board_does_not_compensate_for_missing_include_board(self) -> None:
        boards = self.read(
            workflow(
                """          - id: first
            board: board/first
""",
                """    env:
      board: board/second
""",
            )
        )
        errors = validator.cross_build_board_errors(
            ["board/first", "board/second"], boards
        )
        self.assertIn("zephyr-cross-build missing boards: board/second", errors)

    def test_duplicate_and_missing_board_are_reported(self) -> None:
        errors = validator.cross_build_board_errors(
            ["board/first", "board/second"], ["board/first", "board/first"]
        )
        self.assertIn("zephyr-cross-build missing boards: board/second", errors)
        self.assertIn("zephyr-cross-build duplicate boards: board/first", errors)

    def test_malformed_include_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "only one board after id"):
            self.read(
                workflow(
                    """          - id: first
            unexpected: board/first
"""
                )
            )

    def test_id_with_yaml_syntax_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid id"):
            self.read(
                workflow(
                    """          - id: rpi-pico: invalid
            board: board/first
"""
                )
            )


if __name__ == "__main__":
    unittest.main()
