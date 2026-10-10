#!/usr/bin/env python3
"""IO-007: every HAL function has an implementation on every shipped port and a caller.

tools/ci/check_hal_contract.py reads firmware/lib/zplc_core/include/zplc_hal.h, the three port sources and the
callers, and compares them with the ledger of tools/ci/hal-contract.json. These tests pin the rules on a synthetic tree
and then run the real one.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("check_hal_contract", ROOT / "tools/ci/check_hal_contract.py")
assert spec and spec.loader
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

HEADER = """
typedef enum { ZPLC_HAL_OK = 0 } zplc_hal_result_t;
/** doc */
uint32_t zplc_hal_tick(void);
zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value);
/* zplc_hal_commented_out(void); */
const zplc_io_table_t *zplc_io_table(void);
"""


def tree(directory: Path, *, posix: str, zephyr: str, wasm: str, user: str, ledger: dict | None = None) -> Path:
    core = directory / "firmware/lib/zplc_core"
    for relative, text in {
        "include/zplc_hal.h": HEADER,
        "src/hal/posix/zplc_hal_posix.c": posix,
        "src/hal/zephyr/zplc_hal_zephyr.c": zephyr,
        "src/hal/wasm/zplc_hal_wasm.c": wasm,
        "src/core/user.c": user,
    }.items():
        path = core / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    generator = directory / "firmware/zephyr/scripts/gen_io_table.py"
    generator.parent.mkdir(parents=True, exist_ok=True)
    generator.write_text('out.append("const zplc_io_table_t *zplc_io_table(void) { return &io_description; }")\n')
    (directory / "tools/ci").mkdir(parents=True, exist_ok=True)
    (directory / "tools/ci/hal-contract.json").write_text(json.dumps(ledger if ledger is not None else {"no_caller": {}}))
    return directory


FULL = "uint32_t zplc_hal_tick(void) { return 0; }\nzplc_hal_result_t zplc_hal_gpio_read(uint8_t c, uint8_t *v) { return 0; }\nconst zplc_io_table_t *zplc_io_table(void) { return 0; }\n"
USER = "void f(void) { zplc_hal_tick(); zplc_hal_gpio_read(0, 0); zplc_io_table(); }\n"


class CheckerTests(unittest.TestCase):
    def check(self, **kwargs: object) -> list[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = tree(Path(directory), **kwargs)  # type: ignore[arg-type]
            return checker.check(root)

    def test_a_complete_contract_has_no_findings(self) -> None:
        self.assertEqual([], self.check(posix=FULL, zephyr=FULL, wasm=FULL, user=USER))

    def test_a_declaration_inside_a_comment_is_not_a_function(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = tree(Path(directory), posix=FULL, zephyr=FULL, wasm=FULL, user=USER)
            names = checker.declared_functions((root / "firmware/lib/zplc_core/include/zplc_hal.h").read_text())
            self.assertEqual(["zplc_hal_tick", "zplc_hal_gpio_read", "zplc_io_table"], names)

    def test_a_port_without_an_implementation_is_reported_with_its_name(self) -> None:
        wasm = FULL.replace("zplc_hal_result_t zplc_hal_gpio_read(uint8_t c, uint8_t *v) { return 0; }\n", "")
        findings = self.check(posix=FULL, zephyr=FULL, wasm=wasm, user=USER)
        self.assertEqual(["zplc_hal_gpio_read has no implementation on the wasm port"], findings)

    def test_a_function_without_a_caller_that_the_ledger_does_not_list_is_reported(self) -> None:
        findings = self.check(posix=FULL, zephyr=FULL, wasm=FULL, user="void f(void) { zplc_hal_tick(); zplc_io_table(); }\n")
        self.assertEqual(["zplc_hal_gpio_read has no caller and is not in the ledger of tools/ci/hal-contract.json"], findings)

    def test_a_ledger_entry_for_a_function_that_has_a_caller_is_stale(self) -> None:
        findings = self.check(posix=FULL, zephyr=FULL, wasm=FULL, user=USER,
                              ledger={"no_caller": {"zplc_hal_tick": "waiting for a decision"}})
        self.assertEqual(["zplc_hal_tick is in the ledger as having no caller but is called: remove the entry"], findings)

    def test_a_ledger_entry_for_a_function_the_header_no_longer_declares_is_stale(self) -> None:
        findings = self.check(posix=FULL, zephyr=FULL, wasm=FULL, user=USER,
                              ledger={"no_caller": {"zplc_hal_gone": "was declared"}})
        self.assertEqual(["zplc_hal_gone is in the ledger but zplc_hal.h does not declare it: remove the entry"], findings)

    def test_a_listed_function_without_a_caller_is_accepted(self) -> None:
        findings = self.check(posix=FULL, zephyr=FULL, wasm=FULL, user="void f(void) { zplc_hal_tick(); zplc_io_table(); }\n",
                              ledger={"no_caller": {"zplc_hal_gpio_read": "decision D-06 pending"}})
        self.assertEqual([], findings)

    def test_the_generated_zephyr_table_defines_the_io_table(self) -> None:
        zephyr = FULL.replace("const zplc_io_table_t *zplc_io_table(void) { return 0; }\n", "")
        self.assertEqual([], self.check(posix=FULL, zephyr=zephyr, wasm=FULL, user=USER))


class RepositoryTests(unittest.TestCase):
    def test_the_repository_contract_has_no_findings(self) -> None:
        self.assertEqual([], checker.check(ROOT))


if __name__ == "__main__":
    unittest.main()
