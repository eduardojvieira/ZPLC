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
            "prepare-release-evidence-macos must bind the bundle to the checked-out github.sha",
            self.errors(contents),
        )

    def test_requires_exact_sha_full_ci_reproducibility_and_build_gates(self) -> None:
        cases = (
            (
                "build-macos",
                '          ref: ${{ github.sha }}',
                '          ref: ${{ github.ref }}',
                "build-macos must checkout the validated github.sha",
            ),
            (
                "build-macos",
                "needs: [validate-version, verify-release-candidate, assemble-firmware]",
                "needs: [validate-version, assemble-firmware]",
                "build-macos must depend on validate-version and full CI",
            ),
            (
                "prepare-release-evidence-linux",
                "needs: [validate-version, build-linux]",
                "needs: [validate-version]",
                "prepare-release-evidence-linux must require validation, its own build",
            ),
            (
                "prepare-release-evidence-linux",
                "needs: [validate-version, build-linux]",
                "needs: [validate-version, build-linux, verify-linux-x64-payload-reproducibility]",
                "prepare-release-evidence-linux must not wait for the Linux payload reproducibility check (REL-032)",
            ),
            (
                "verify-linux-x64-payload-reproducibility",
                "    continue-on-error: true\n",
                "",
                "Linux payload reproducibility must be continue-on-error: it never blocks a release run (REL-032)",
            ),
            (
                "build-firmware",
                "needs: [validate-version, verify-release-candidate]",
                "needs: [validate-version]",
                "build-firmware must depend on validate-version and full CI",
            ),
            (
                "assemble-firmware",
                "needs: [validate-version, build-firmware]",
                "needs: [validate-version]",
                "assemble-firmware must require validation and the firmware builds",
            ),
            (
                "upload-release-firmware",
                "needs: [validate-version, create-draft-release, prepare-release-evidence-firmware]",
                "needs: [validate-version, prepare-release-evidence-firmware]",
                "upload-release-firmware must require validation, the draft release and its own evidence",
            ),
            (
                "prepare-release-evidence-firmware",
                "      - name: Attest firmware provenance\n        if: ${{ needs.validate-version.outputs.publishing == 'true' }}\n",
                "      - name: Attest firmware provenance\n",
                "prepare-release-evidence-firmware must attest only when publishing",
            ),
            (
                "prepare-release-evidence-macos",
                "needs: [validate-version, build-macos]",
                "needs: [validate-version]",
                "prepare-release-evidence-macos must require validation, its own build",
            ),
            (
                "prepare-release-evidence-macos",
                "needs: [validate-version, build-macos]",
                "needs: [validate-version, build-macos, build-windows]",
                "prepare-release-evidence-macos must not wait for the windows build",
            ),
            (
                "upload-release-windows",
                "needs: [validate-version, create-draft-release, prepare-release-evidence-windows]",
                "needs: [validate-version, create-draft-release, prepare-release-evidence-windows, prepare-release-evidence-macos]",
                "upload-release-windows must require validation, the draft release and its own platform's evidence",
            ),
        )
        for job, old, new, expected in cases:
            with self.subTest(expected=expected):
                self.assertIn(expected, self.errors(self.replace_in_job(self.workflow(), job, old, new)))

    def test_rejects_overbroad_or_missing_evidence_permissions(self) -> None:
        for patch in (
            ("      artifact-metadata: write", "      contents: write"),
            ("      id-token: write\n", ""),
        ):
            with self.subTest(patch=patch):
                self.assertIn(
                    "prepare-release-evidence-linux must use only its minimum evidence permissions",
                    self.errors(self.workflow().replace(*patch)),
                )

    def test_bill_of_materials_comes_from_the_lockfile_and_not_from_the_installers(self) -> None:
        contents = self.replace_in_job(
            self.workflow(),
            "prepare-release-evidence-windows",
            "bun scripts/release/sbom.ts --out artifacts/",
            "bun scripts/release/sbom.ts --check --out artifacts/other-",
        )
        self.assertIn(
            "prepare-release-evidence-windows must generate the bill of materials from the lockfile with scripts/release/sbom.ts",
            self.errors(contents),
        )
        contents = self.replace_in_job(
            self.workflow(),
            "prepare-release-evidence-macos",
            "      - name: Generate the bill of materials\n",
            "      - name: Scan the installers\n        uses: anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610 # v0.24.0\n        with:\n          path: artifacts\n\n      - name: Generate the bill of materials\n",
        )
        self.assertIn(
            "prepare-release-evidence-macos must generate the bill of materials from the lockfile with scripts/release/sbom.ts",
            self.errors(contents),
        )

    def test_requires_both_installer_attestations(self) -> None:
        contents = self.replace_in_job(
            self.workflow(),
            "prepare-release-evidence-macos",
            "          sbom-path: artifacts/ZPLC-${{ needs.validate-version.outputs.version }}-macos.cdx.json",
            "          sbom-path: artifacts/other.cdx.json",
        )
        self.assertIn(
            "prepare-release-evidence-macos must produce default provenance and SBOM attestations",
            self.errors(contents),
        )
        contents = self.replace_in_job(
            self.workflow(),
            "prepare-release-evidence-linux",
            "            release/*.rpm\n            release/zplc-cli-*-linux-*\n            release/zplc-mcp-*-linux-*\n\n      - name: Attest installer SBOM",
            "\n\n      - name: Attest installer SBOM",
        )
        self.assertIn(
            "prepare-release-evidence-linux must attest only its installer paths twice",
            self.errors(contents),
        )

    def test_a_rehearsal_makes_no_attestation(self) -> None:
        contents = self.replace_in_job(
            self.workflow(),
            "prepare-release-evidence-windows",
            "      - name: Attest installer provenance\n        if: ${{ needs.validate-version.outputs.publishing == 'true' }}\n",
            "      - name: Attest installer provenance\n",
        )
        self.assertIn("prepare-release-evidence-windows must attest only when publishing", self.errors(contents))

    def test_what_a_run_publishes_is_decided_by_the_resolve_release_script(self) -> None:
        contents = self.replace_in_job(self.workflow(), "validate-version", "bun scripts/release/resolve-release.ts", "echo skip")
        self.assertIn(
            "validate-version job must resolve and compare canonical version: missing scripts/release/resolve-release.ts",
            self.errors(contents),
        )

    def test_keeps_each_platform_checksum_and_evidence_file_distinct(self) -> None:
        contents = self.replace_in_job(
            self.workflow(),
            "prepare-release-evidence-windows",
            "mv release/SHA256SUMS release/SHA256SUMS-windows",
            "mv release/SHA256SUMS release/SHA256SUMS",
        )
        self.assertIn(
            "prepare-release-evidence-windows must give its checksum and evidence files a platform-specific name",
            self.errors(contents),
        )

    def test_release_is_created_only_as_a_draft(self) -> None:
        contents = self.workflow().replace("gh release create \"$RELEASE_TAG\" --draft --verify-tag", "gh release create \"$RELEASE_TAG\" --verify-tag")
        self.assertIn("create-draft-release must create the release as a draft from the existing tag", self.errors(contents))
        self.assertIn("create-draft-release must only create or edit draft releases", self.errors(contents))
        contents = self.replace_in_job(self.workflow(), "create-draft-release", "gh release edit \"$RELEASE_TAG\" --draft ", "gh release edit \"$RELEASE_TAG\" ")
        self.assertIn("create-draft-release must only create or edit draft releases", self.errors(contents))
        contents = self.replace_in_job(
            self.workflow(),
            "create-draft-release",
            "if: ${{ needs.validate-version.outputs.publishing == 'true' }}",
            "if: ${{ always() }}",
        )
        self.assertIn("create-draft-release must run only when publishing", self.errors(contents))

    def test_upload_uses_only_prepared_bundle_and_respects_dry_run(self) -> None:
        self.assertIn(
            "prepare-release-evidence-macos must upload release/ as a publishable-or-preview bundle",
            self.errors(
                self.replace_in_job(
                    self.workflow(),
                    "prepare-release-evidence-macos",
                    "release-bundle-macos-${{ needs.validate-version.outputs.publishing == 'true' && 'publishable' || 'preview' }}",
                    "release-bundle-macos-signed",
                )
            ),
        )
        contents = self.workflow().replace(
            "          name: release-bundle-linux-publishable",
            "          name: all-artifacts",
        )
        self.assertIn(
            "upload-release-linux must download release-bundle-linux-publishable directly to release/",
            self.errors(contents),
        )
        contents = self.replace_in_job(
            self.workflow(),
            "upload-release-macos",
            "needs.validate-version.outputs.publishing == 'true'",
            "needs.validate-version.outputs.publishing != 'true'",
        )
        self.assertIn(
            "upload-release-macos must run only when publishing",
            self.errors(contents),
        )
        contents = self.replace_in_job(self.workflow(), "upload-release-windows", "      contents: write", "      contents: read")
        self.assertIn("upload-release-windows must use only contents: write", self.errors(contents))
        contents = self.replace_in_job(self.workflow(), "upload-release-linux", "--json isDraft --jq .isDraft)\" = true", "--json url --jq .url)\" = true")
        self.assertIn("upload-release-linux must refuse a release that is not a draft", self.errors(contents))
        contents = self.workflow().replace("      - name: Download release bundle", "      - uses: actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955 # v4.3.0\n\n      - name: Download release bundle")
        self.assertIn(
            "upload-release-macos must publish the prepared bundle without checkout or setup",
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
