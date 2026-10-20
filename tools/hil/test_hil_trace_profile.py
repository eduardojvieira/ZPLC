#!/usr/bin/env python3
"""HIL-013: a shipped board profile does not turn the HIL trace on; the trace comes from the HIL overlay."""
# ---- HIL-013: no shipped board profile turns the HIL trace on; it comes from the HIL overlay ----
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import validate_hil_trace_profile as validator


def tree(profiles: dict[str, str], overlay: str | None = "CONFIG_ZPLC_HIL_DEBUG=y\n"):
    root = tempfile.TemporaryDirectory()
    base = Path(root.name)
    (base / "boards").mkdir()
    manifest = []
    for name, text in profiles.items():
        (base / "boards" / name).write_text(text)
        manifest.append({"ide_id": name.split(".")[0], "support_assets": [f"boards/{name}"]})
    if overlay is not None:
        (base / "hil_debug.conf").write_text(overlay)
    return root, base, manifest


class ProfileTests(unittest.TestCase):
    def test_a_profile_that_sets_the_option_is_named(self):
        root, base, manifest = tree({"a.conf": "CONFIG_FOO=y\nCONFIG_ZPLC_HIL_DEBUG=y\n", "b.conf": "CONFIG_FOO=y\n"})
        with root:
            self.assertEqual(validator.problems(manifest, base, base / "hil_debug.conf"), ["boards/a.conf:2 sets CONFIG_ZPLC_HIL_DEBUG=y: release firmware carries no HIL trace (HIL-013); use the overlay"])

    def test_a_comment_and_an_explicit_off_are_not_the_option_on(self):
        root, base, manifest = tree({"a.conf": "# CONFIG_ZPLC_HIL_DEBUG=y is off here\nCONFIG_ZPLC_HIL_DEBUG=n\n"})
        with root:
            self.assertEqual(validator.problems(manifest, base, base / "hil_debug.conf"), [])

    def test_the_overlay_must_turn_the_option_on_or_a_hil_build_has_no_trace(self):
        root, base, manifest = tree({"a.conf": "CONFIG_FOO=y\n"}, overlay="CONFIG_FOO=y\n")
        with root:
            self.assertEqual(len(validator.problems(manifest, base, base / "hil_debug.conf")), 1)
        root, base, manifest = tree({"a.conf": "CONFIG_FOO=y\n"}, overlay=None)
        with root:
            self.assertEqual(len(validator.problems(manifest, base, base / "hil_debug.conf")), 1)

    def test_a_profile_the_manifest_does_not_list_is_checked_too(self):
        root, base, manifest = tree({"a.conf": "CONFIG_FOO=y\n", "unlisted.conf": "CONFIG_ZPLC_HIL_DEBUG=y\n"})
        with root:
            manifest = [m for m in manifest if m["ide_id"] == "a"]
            self.assertEqual(validator.problems(manifest, base, base / "hil_debug.conf"), [])
            self.assertEqual(
                validator.problems(manifest, base, base / "hil_debug.conf", profile_dir=base / "boards"),
                ["boards/unlisted.conf:1 sets CONFIG_ZPLC_HIL_DEBUG=y: release firmware carries no HIL trace (HIL-013); use the overlay"],
            )

    def test_the_files_zephyr_applies_for_a_board_name_are_checked_even_when_the_manifest_does_not_list_them(self):
        root, base, _ = tree({})
        with root:
            app = base / "app"
            (app / "boards").mkdir(parents=True)
            (app / "boards" / "vendor_board.conf").write_text("CONFIG_ZPLC_HIL_DEBUG=y\n")
            (app / "boards" / "vendor_board_soc_cpu.conf").write_text("CONFIG_ZPLC_HIL_DEBUG=y\n")
            (app / "boards" / "other_board.conf").write_text("CONFIG_FOO=y\n")
            manifest = [{"ide_id": "x", "zephyr_board": "vendor_board/soc/cpu", "support_assets": []}]
            found = validator.problems(manifest, base, base / "hil_debug.conf", app_dir=app)
            self.assertEqual(len(found), 2)
            self.assertTrue(all("vendor_board" in line for line in found), found)

    def test_the_base_configuration_of_the_application_is_checked(self):
        root, base, manifest = tree({"a.conf": "CONFIG_FOO=y\n"})
        with root:
            app = base / "app"
            app.mkdir()
            (app / "prj.conf").write_text("CONFIG_ZPLC_HIL_DEBUG=y\n")
            found = validator.problems(manifest, base, base / "hil_debug.conf", app_dir=app)
            self.assertEqual(found, ["app/prj.conf:1 sets CONFIG_ZPLC_HIL_DEBUG=y: release firmware carries no HIL trace (HIL-013); use the overlay"])

    def test_every_profile_of_the_single_manifest_is_covered(self):
        root = Path(__file__).resolve().parents[2]
        manifest = json.loads((root / "firmware/app/boards/boards.json").read_text())
        checked = set(validator.checked_assets(manifest, root, root / "firmware/app"))
        on_disk = {p.relative_to(root).as_posix() for p in (root / "firmware/app/boards").glob("*.conf")}
        self.assertEqual(on_disk - checked, set(), "a profile conf that the validator does not look at")
        self.assertIn("firmware/app/prj.conf", checked)
        for board in manifest:
            mine = {a for a in checked if Path(a).stem.startswith(board["zephyr_board"].split("/")[0])}
            self.assertTrue(mine, f"no conf of {board['zephyr_board']} is checked")

    def test_main_exits_1_on_a_problem_and_0_without(self):
        root, base, manifest = tree({"a.conf": "CONFIG_ZPLC_HIL_DEBUG=y\n"})
        with root:
            (base / "m.json").write_text(json.dumps(manifest))
            with redirect_stdout(io.StringIO()):
                self.assertEqual(validator.main(["--manifest", str(base / "m.json"), "--root", str(base), "--overlay", str(base / "hil_debug.conf")]), 1)
            (base / "boards" / "a.conf").write_text("CONFIG_FOO=y\n")
            with redirect_stdout(io.StringIO()):
                self.assertEqual(validator.main(["--manifest", str(base / "m.json"), "--root", str(base), "--overlay", str(base / "hil_debug.conf")]), 0)


if __name__ == "__main__":
    unittest.main()
