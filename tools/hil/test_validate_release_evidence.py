#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import re
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

    def replace_in_job(self, contents: str, job_name: str, old: str, new: str) -> str:
        header = f"  {job_name}:\n"
        start = contents.index(header)
        next_job = re.search(r"(?m)^  [A-Za-z0-9_-]+:\n", contents[start + len(header) :])
        end = start + len(header) + next_job.start() if next_job else len(contents)
        return contents[:start] + contents[start:end].replace(old, new, 1) + contents[end:]

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

    def test_requires_exact_sha_full_ci_reproducibility_and_build_gates(self) -> None:
        cases = (
            (
                '          ref: ${{ github.sha }}',
                '          ref: ${{ github.ref }}',
                "build-macos must checkout the validated github.sha",
            ),
            (
                "needs: [validate-version, verify-release-candidate]",
                "needs: [validate-version]",
                "build-macos must depend on validate-version and full CI",
            ),
            (
                "verify-linux-x64-payload-reproducibility, build-macos",
                "build-macos",
                "prepare-release-evidence must require validation, reproducibility, and all platform builds",
            ),
            (
                "build-windows, build-linux]",
                "build-windows]",
                "prepare-release-evidence must require validation, reproducibility, and all platform builds",
            ),
        )
        for old, new, expected in cases:
            with self.subTest(expected=expected):
                job = "build-macos" if expected.startswith("build-macos") else "prepare-release-evidence"
                self.assertIn(expected, self.errors(self.replace_in_job(self.workflow(), job, old, new)))

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
        self.assertIn(
            "prepare-release-evidence must upload release/ as a publishable-or-preview bundle",
            self.errors(
                self.replace_in_job(
                    self.workflow(),
                    "prepare-release-evidence",
                    "release-bundle-${{ needs.validate-version.outputs.publishing == 'true' && 'publishable' || 'preview' }}",
                    "release-bundle-signed",
                )
            ),
        )
        contents = self.workflow().replace(
            "          name: release-bundle-publishable",
            "          name: all-artifacts",
        )
        self.assertIn(
            "upload-release must download release-bundle-publishable directly to release/",
            self.errors(contents),
        )
        contents = self.replace_in_job(
            self.workflow(),
            "upload-release",
            "needs.validate-version.outputs.publishing == 'true'",
            "needs.validate-version.outputs.publishing != 'true'",
        )
        self.assertIn(
            "upload-release must require publishing and the complete success conjunction",
            self.errors(contents),
        )
        self.assertIn(
            "upload-release must use the protected release-signing environment",
            self.errors(self.replace_in_job(self.workflow(), "upload-release", "environment: release-signing", "environment: preview")),
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

    def test_rejects_stale_rc3_records_and_ci_checkout_drift(self) -> None:
        matrix = validator.MATRIX.read_text()
        claims = validator.CLAIMS.read_text()
        for candidate, expected in (
            (matrix.replace("# ZPLC 2.0 RC3", "# v1.5.0", 1), "release evidence matrix must have the ZPLC 2.0 RC3 heading"),
            (matrix.replace("| passed |", "| pending |", 1), "RC3 non-HIL gate REL-001 must be passed"),
            (matrix.replace("| pending |", "| passed |", 1), "HIL cannot pass while its evidence remains pending"),
        ):
            errors: list[str] = []
            validator.validate_rc3_records(errors, candidate, claims)
            self.assertIn(expected, errors)
        errors = []
        validator.validate_rc3_records(errors, matrix, claims + "\nA signed installer has been verified.\n")
        self.assertIn("release claims must not assert that hosted signing or notarization already executed", errors)
        errors = []
        validator.validate_ci_checkouts(errors, validator.CI_WORKFLOW.read_text().replace("ref: ${{ github.sha }}", "ref: ${{ github.ref }}", 1))
        self.assertIn("every CI checkout must use the exact github.sha", errors)


if __name__ == "__main__":
    unittest.main()
