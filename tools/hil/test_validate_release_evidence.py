#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).with_name("validate_release_evidence.py")
SPEC = importlib.util.spec_from_file_location("validate_release_evidence", MODULE_PATH)
assert SPEC and SPEC.loader
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class ReleaseWorkflowEvidenceTests(unittest.TestCase):
    def errors(self, contents: str) -> list[str]:
        errors: list[str] = []
        validator.validate_release_workflow(errors, contents)
        return errors

    def workflow(self) -> str:
        return validator.RELEASE_WORKFLOW.read_text()

    def test_repository_workflow_is_valid(self) -> None:
        self.assertEqual([], self.errors(self.workflow()))

    def test_comments_do_not_satisfy_sha_binding(self) -> None:
        contents = self.workflow().replace(
            '        run: test "$(git rev-parse HEAD)" = "${{ github.sha }}"',
            '        # run: test "$(git rev-parse HEAD)" = "${{ github.sha }}"',
        )
        self.assertIn(
            "prepare-release-evidence must bind the bundle to the checked-out github.sha",
            self.errors(contents),
        )

    def test_rejects_overbroad_or_missing_evidence_permissions(self) -> None:
        for patch in (
            ("      artifact-metadata: write", "      contents: write"),
            ("      id-token: write\n", ""),
        ):
            with self.subTest(patch=patch):
                self.assertIn(
                    "prepare-release-evidence must use only its minimum evidence permissions",
                    self.errors(self.workflow().replace(*patch)),
                )

    def test_requires_unpublished_spdx_controls(self) -> None:
        for field in ("upload-artifact: false", "upload-release-assets: false", "dependency-snapshot: false"):
            with self.subTest(field=field):
                self.assertIn(
                    "prepare-release-evidence must generate an unpublished SPDX SBOM from artifacts",
                    self.errors(self.workflow().replace(field, field.replace("false", "true"))),
                )

    def test_requires_both_installer_attestations(self) -> None:
        contents = self.workflow().replace(
            "          sbom-path: artifacts/ZPLC-${{ needs.validate-version.outputs.version }}.spdx.json",
            "          sbom-path: artifacts/other.spdx.json",
        )
        self.assertIn(
            "prepare-release-evidence must produce default provenance and SPDX SBOM attestations",
            self.errors(contents),
        )
        contents = self.workflow().replace("            release/*.rpm\n\n      - name: Attest installer SBOM", "\n\n      - name: Attest installer SBOM", 1)
        self.assertIn(
            "prepare-release-evidence must attest only the installer paths twice",
            self.errors(contents),
        )

    def test_upload_uses_only_prepared_bundle_and_respects_dry_run(self) -> None:
        contents = self.workflow().replace(
            "      - name: Download release bundle\n        uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0\n        with:\n          name: release-bundle",
            "      - name: Download release bundle\n        uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0\n        with:\n          name: all-artifacts",
        )
        self.assertIn(
            "upload-release must download release-bundle directly to release/",
            self.errors(contents),
        )
        contents = self.workflow().replace("inputs.upload_to_release != false", "inputs.upload_to_release == false")
        self.assertIn(
            "upload-release must require only the complete success conjunction",
            self.errors(contents),
        )
        contents = self.workflow().replace("            release/*.spdx.json\n", "")
        self.assertIn(
            "upload-release must publish the prepared SPDX SBOM",
            self.errors(contents),
        )
        contents = self.workflow().replace("      - name: Download release bundle", "      - uses: actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955 # v4.3.0\n\n      - name: Download release bundle")
        self.assertIn(
            "upload-release must publish the prepared bundle without checkout or setup",
            self.errors(contents),
        )


if __name__ == "__main__":
    unittest.main()
