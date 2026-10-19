#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / "specs/008-release-foundation/artifacts/release-evidence-matrix.md"
CLAIMS = ROOT / "specs/008-release-foundation/artifacts/release-claims.md"
RELEASE_WORKFLOW = ROOT / ".github/workflows/release.yml"
CI_WORKFLOW = ROOT / ".github/workflows/ci.yml"
IMMUTABLE_ACTION_SHA = re.compile(r"[0-9a-fA-F]{40}\Z")


def parse_rows(matrix: str | None = None) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in (MATRIX.read_text() if matrix is None else matrix).splitlines():
        if not line.startswith("|"):
            continue
        if "gate_id" in line or set(line.replace("|", "").strip()) == {"-"}:
            continue
        parts = [part.strip() for part in line.strip().strip("|").split("|")]
        if len(parts) != 10:
            continue
        rows.append(
            {
                "gate_id": parts[0],
                "gate_name": parts[1],
                "claim_scope": parts[2],
                "owner_type": parts[3],
                "owner": parts[4],
                "verification_method": parts[5],
                "required_evidence": parts[6],
                "status": parts[7],
                "artifact_links": parts[8],
                "notes": parts[9],
            }
        )
    return rows


def parse_claim_rows(claims: str | None = None) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in (CLAIMS.read_text() if claims is None else claims).splitlines():
        if not line.startswith("|"):
            continue
        if "claim_id" in line or set(line.replace("|", "").strip()) == {"-"}:
            continue
        parts = [part.strip() for part in line.strip().strip("|").split("|")]
        if len(parts) != 5:
            continue
        rows.append(
            {
                "claim_id": parts[0],
                "surface": parts[1],
                "statement": parts[2],
                "evidence_gate_ids": parts[3],
                "status": parts[4],
            }
        )
    return rows


def workflow_job(workflow: str, name: str) -> str | None:
    match = re.search(
        rf"(?ms)^  {re.escape(name)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
        workflow,
    )
    return match.group(1) if match else None


def normalize_whitespace(value: str) -> str:
    return " ".join(value.split())


def active_yaml(value: str) -> str:
    """Return the small YAML subset relevant to this structural validator.

    This deliberately does not parse YAML.  It only discards full-line comments
    and inline comments that begin outside quoted scalars, so a commented guard
    cannot satisfy a required workflow fragment.
    """
    active_lines: list[str] = []
    for line in value.splitlines():
        quote: str | None = None
        for index, char in enumerate(line):
            if char in {"'", '"'}:
                if quote == char:
                    quote = None
                elif quote is None:
                    quote = char
            elif char == "#" and quote is None and (index == 0 or line[index - 1].isspace()):
                line = line[:index].rstrip()
                break
        if line.strip():
            active_lines.append(line)
    return "\n".join(active_lines)


def job_field(job: str, name: str) -> str | None:
    lines = job.splitlines()
    field = re.compile(rf"^    {re.escape(name)}:[ \t]*(.*?)\s*$")
    for index, line in enumerate(lines):
        match = field.fullmatch(line)
        if match is None:
            continue
        value = match.group(1)
        if value not in {"|", "|-", ">", ">-"}:
            return value
        block: list[str] = []
        for child in lines[index + 1 :]:
            if child.strip() and len(child) - len(child.lstrip()) <= 4:
                break
            block.append(child.strip())
        return "\n".join(block)
    return None


def job_mapping_field(job: str, mapping: str, name: str) -> str | None:
    lines = job.splitlines()
    for index, line in enumerate(lines):
        if line == f"    {mapping}:":
            for child in lines[index + 1 :]:
                if child.strip() and len(child) - len(child.lstrip()) <= 4:
                    break
                match = re.fullmatch(rf"      {re.escape(name)}:[ \t]*(.*?)\s*", child)
                if match is not None:
                    return match.group(1)
            return None
    return None


def step_blocks(job: str) -> list[list[str]]:
    lines = job.splitlines()
    steps_index = next((index for index, line in enumerate(lines) if line == "    steps:"), None)
    if steps_index is None:
        return []
    steps: list[list[str]] = []
    current: list[str] | None = None
    for line in lines[steps_index + 1 :]:
        indent = len(line) - len(line.lstrip())
        if line.strip() and indent <= 4:
            break
        if line.startswith("      - "):
            current = [line]
            steps.append(current)
        elif current is not None:
            current.append(line)
    return steps


def step_field_index(step: list[str], name: str) -> tuple[str, int, int] | None:
    header = re.fullmatch(rf"      - {re.escape(name)}:[ \t]*(.*?)\s*", step[0])
    if header is not None:
        return header.group(1), 6, 0
    for index, line in enumerate(step[1:], start=1):
        match = re.fullmatch(rf"        {re.escape(name)}:[ \t]*(.*?)\s*", line)
        if match is not None:
            return match.group(1), 8, index
    return None


def step_field(step: list[str], name: str) -> tuple[str, int] | None:
    field = step_field_index(step, name)
    return None if field is None else field[:2]


def step_mapping_field(step: list[str], mapping: str, name: str) -> str | None:
    parent = step_field_index(step, mapping)
    if parent is None or parent[0]:
        return None
    child_indent = parent[1] + 2
    for line in step[parent[2] + 1 :]:
        indent = len(line) - len(line.lstrip())
        if line.strip() and indent <= parent[1]:
            break
        match = re.fullmatch(
            rf"{' ' * child_indent}{re.escape(name)}:[ \t]*(.*?)\s*", line
        )
        if match is not None:
            return match.group(1)
    return None


def run_commands(job: str) -> list[str]:
    commands: list[str] = []
    for step in step_blocks(job):
        run = step_field_index(step, "run")
        if run is None:
            continue
        value, indent, run_index = run
        if value in {"|", "|-", ">", ">-"}:
            for child in step[run_index + 1 :]:
                if child.strip() and len(child) - len(child.lstrip()) <= indent:
                    break
                if child.strip():
                    commands.append(child.strip())
            continue
        commands.append(value)
    return commands


def has_command(commands: list[str], command: str) -> bool:
    return any(normalize_whitespace(value) == command for value in commands)


def has_pinned_checkout_at_sha(job: str) -> tuple[bool, bool]:
    checkouts = [
        step
        for step in step_blocks(job)
        if (uses := step_field(step, "uses")) is not None
        and uses[0].startswith("actions/checkout@")
    ]
    if len(checkouts) != 1:
        return False, False
    uses = step_field(checkouts[0], "uses")
    assert uses is not None
    action = uses[0].removeprefix("actions/checkout@")
    if not IMMUTABLE_ACTION_SHA.fullmatch(action):
        return False, False
    return True, step_mapping_field(checkouts[0], "with", "ref") == "${{ github.sha }}"


def job_mapping(job: str, name: str) -> dict[str, str]:
    lines = job.splitlines()
    result: dict[str, str] = {}
    for index, line in enumerate(lines):
        if line == f"    {name}:":
            for child in lines[index + 1 :]:
                if child.strip() and len(child) - len(child.lstrip()) <= 4:
                    break
                match = re.fullmatch(r"      ([A-Za-z0-9_-]+):[ \t]*(.*?)\s*", child)
                if match is not None:
                    result[match.group(1)] = match.group(2)
            break
    return result


def has_needs(job: str, *required: str) -> bool:
    """Return whether an inline `needs: [...]` contains every required job."""
    value = job_field(job, "needs")
    if value is None or not value.startswith("[") or not value.endswith("]"):
        return False
    needs = {item.strip() for item in value[1:-1].split(",") if item.strip()}
    return set(required).issubset(needs)


def action_steps(job: str, action: str) -> list[list[str]]:
    return [
        step
        for step in step_blocks(job)
        if (uses := step_field(step, "uses")) is not None and uses[0] == action
    ]


PLATFORM_SUBJECTS = {
    "macos": ("release/*.dmg", "release/*.zip", "release/zplc-cli-*-mac-*", "release/zplc-mcp-*-mac-*"),
    "windows": ("release/*.exe",),
    "linux": ("release/*.AppImage", "release/*.deb", "release/*.rpm", "release/zplc-cli-*-linux-*", "release/zplc-mcp-*-linux-*"),
}


def has_subject_paths(step: list[str], subjects: tuple[str, ...]) -> bool:
    listed = "".join(f"            {re.escape(subject)}\n" for subject in subjects).removesuffix("\n")
    return bool(
        re.search(
            r"(?ms)^          subject-path: \|\n" + listed + r"(?:\n          sbom-path:|\Z)",
            "\n".join(step),
        )
    )


def validate_release_workflow(errors: list[str], workflow: str | None = None) -> None:
    workflow = active_yaml(RELEASE_WORKFLOW.read_text() if workflow is None else workflow)
    version_gate = workflow_job(workflow, "validate-version")
    if version_gate is None:
        errors.append("release workflow must define a validate-version job")
    else:
        commands = run_commands(version_gate)
        # What a run may publish is decided by scripts/release/resolve-release.ts, which has tests of its own
        # (scripts/release/resolve-release.test.ts); the job has to run it and to expose its version.
        requirements = {
            "bun run check:versions": has_command(commands, "bun run check:versions"),
            "scripts/release/resolve-release.ts": has_command(commands, "bun scripts/release/resolve-release.ts"),
            "steps.version.outputs.version": job_mapping_field(
                version_gate, "outputs", "version"
            ) == "${{ steps.version.outputs.version }}",
        }
        for required, present in requirements.items():
            if not present:
                errors.append(
                    f"validate-version job must resolve and compare canonical version: missing {required}"
                )
        checkout_pinned, checkout_at_sha = has_pinned_checkout_at_sha(version_gate)
        if not checkout_pinned:
            errors.append(
                "validate-version must use exactly one actions/checkout pinned to a 40-character SHA"
            )
        elif not checkout_at_sha:
            errors.append("validate-version must checkout the validated github.sha")

    if any(
        re.search(r"\b(?:bun|node|tsx)\b.*\brelease-version\.ts\b", command)
        for job_name in (
            "validate-version", "build-macos", "build-windows", "build-linux", "create-draft-release",
            *(f"{stage}-{platform}" for stage in ("prepare-release-evidence", "upload-release") for platform in PLATFORM_SUBJECTS),
        )
        if (job := workflow_job(workflow, job_name)) is not None
        for command in run_commands(job)
    ):
        errors.append("release workflow must not mutate manifests with release-version.ts")

    candidate = workflow_job(workflow, "verify-release-candidate")
    if candidate is None:
        errors.append("release workflow must define a verify-release-candidate full-CI gate")
    elif job_field(candidate, "needs") != "validate-version" or job_field(candidate, "uses") != "./.github/workflows/ci.yml":
        errors.append("verify-release-candidate must run the reusable full CI workflow after validate-version")

    reproducibility = workflow_job(workflow, "verify-linux-x64-payload-reproducibility")
    if reproducibility is None:
        errors.append("release workflow must define a Linux payload reproducibility check")
    else:
        if not has_needs(reproducibility, "validate-version", "verify-release-candidate"):
            errors.append("Linux payload reproducibility must require validate-version and full CI")
        # REL-032: the check is kept and never blocks a release run: it does not fail the run, only the notes (which run
        # whatever happens) read its verdict, and no other job waits for it
        if normalize_whitespace(job_field(reproducibility, "continue-on-error") or "") != "true":
            errors.append("Linux payload reproducibility must be continue-on-error: it never blocks a release run (REL-032)")
        for other in re.findall(r"(?m)^  ([A-Za-z0-9_-]+):\n", workflow):
            job = workflow_job(workflow, other)
            if other not in ("verify-linux-x64-payload-reproducibility", "render-release-notes") and job is not None and has_needs(job, "verify-linux-x64-payload-reproducibility"):
                errors.append(f"{other} must not wait for the Linux payload reproducibility check (REL-032)")

    for build_name in ("build-macos", "build-windows", "build-linux"):
        build = workflow_job(workflow, build_name)
        if build is None:
            errors.append(f"release workflow must define {build_name}")
            continue
        if not has_needs(build, "validate-version", "verify-release-candidate"):
            errors.append(f"{build_name} must depend on validate-version and full CI")
        checkout_pinned, checkout_at_sha = has_pinned_checkout_at_sha(build)
        if not checkout_pinned:
            errors.append(
                f"{build_name} must use exactly one actions/checkout pinned to a 40-character SHA"
            )
        elif not checkout_at_sha:
            errors.append(f"{build_name} must checkout the validated github.sha")

    publishing_only = "${{ needs.validate-version.outputs.publishing == 'true' }}"
    create = workflow_job(workflow, "create-draft-release")
    if create is None:
        errors.append("release workflow must define create-draft-release")
    else:
        if not has_needs(create, "validate-version", "verify-release-candidate"):
            errors.append("create-draft-release must require validation and full CI")
        # REL-036: the draft is created once every platform build, which installs or mounts and launches each format, has finished
        if not has_needs(create, "build-macos", "build-windows", "build-linux"):
            errors.append("create-draft-release must wait for the builds of every platform (REL-036)")
        condition = normalize_whitespace(job_field(create, "if") or "")
        if "needs.validate-version.outputs.publishing == 'true'" not in condition or "!cancelled()" not in condition:
            errors.append("create-draft-release must run only when publishing")
        elif not all(f"needs.build-{platform}.result == 'success'" in condition for platform in ("macos", "windows", "linux")) or " || " not in condition:
            errors.append("create-draft-release must run when any platform build succeeded, not only when all did (REL-015)")
        if job_mapping(create, "permissions") != {"contents": "write"}:
            errors.append("create-draft-release must use only contents: write")
        # the draft is created with the tag and a placeholder body: it reads nothing from the repository, so it has no
        # checkout (the notes are written by publish-release-notes, once the platform jobs have finished)
        if action_steps(create, "actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955"):
            errors.append("create-draft-release must not check out the repository")
        commands = run_commands(create)
        releases = [command for command in commands if re.search(r"\bgh release (?:create|edit)\b", command)]
        if not any("gh release create" in command and "--draft" in command and "--verify-tag" in command for command in releases):
            errors.append("create-draft-release must create the release as a draft from the existing tag")
        if any("--draft" not in command for command in releases):
            errors.append("create-draft-release must only create or edit draft releases")

    for platform, subjects in PLATFORM_SUBJECTS.items():
        build_name = f"build-{platform}"
        prepare_name = f"prepare-release-evidence-{platform}"
        prepare = workflow_job(workflow, prepare_name)
        if prepare is None:
            errors.append(f"release workflow must define {prepare_name}")
        else:
            if not has_needs(prepare, "validate-version", build_name):
                errors.append(f"{prepare_name} must require validation, its own build")
            for other in (*PLATFORM_SUBJECTS, "firmware"):
                if other != platform and has_needs(prepare, f"build-{other}"):
                    errors.append(f"{prepare_name} must not wait for the {other} build")
            if job_field(prepare, "runs-on") != "ubuntu-latest":
                errors.append(f"{prepare_name} must run on ubuntu-latest")
            if job_mapping(prepare, "permissions") != {
                "contents": "read",
                "id-token": "write",
                "attestations": "write",
                "artifact-metadata": "write",
            }:
                errors.append(f"{prepare_name} must use only its minimum evidence permissions")
            checkout_pinned, checkout_at_sha = has_pinned_checkout_at_sha(prepare)
            if not checkout_pinned:
                errors.append(f"{prepare_name} must use exactly one actions/checkout pinned to a 40-character SHA")
            elif not checkout_at_sha:
                errors.append(f"{prepare_name} must checkout the validated github.sha")
            commands = run_commands(prepare)
            if not has_command(commands, 'test "$(git rev-parse HEAD)" = "${{ github.sha }}"'):
                errors.append(f"{prepare_name} must bind the bundle to the checked-out github.sha")
            download = action_steps(prepare, "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093")
            if len(download) != 1 or step_mapping_field(download[0], "with", "path") != "artifacts" or step_mapping_field(download[0], "with", "pattern") != f"{platform}-*":
                errors.append(f"{prepare_name} must download only its own platform's build artifacts to artifacts")
            # REL-018: the bill of materials is written from the lockfile and the manifests, never from a scan of the installers
            sbom_file = f"artifacts/ZPLC-${{{{ needs.validate-version.outputs.version }}}}-{platform}.cdx.json"
            if not has_command(commands, f"bun scripts/release/sbom.ts --out {sbom_file}") or action_steps(prepare, "anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610"):
                errors.append(f"{prepare_name} must generate the bill of materials from the lockfile with scripts/release/sbom.ts")
            if not has_command(commands, f"mv release/SHA256SUMS release/SHA256SUMS-{platform}") or not has_command(
                commands, f"mv release/release-evidence.json release/release-evidence-{platform}.json"
            ):
                errors.append(f"{prepare_name} must give its checksum and evidence files a platform-specific name")
            attestations = action_steps(prepare, "actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d")
            if len(attestations) != 2 or not all(has_subject_paths(step, subjects) for step in attestations):
                errors.append(f"{prepare_name} must attest only its installer paths twice")
            elif step_mapping_field(attestations[0], "with", "sbom-path") is not None or step_mapping_field(attestations[1], "with", "sbom-path") != sbom_file:
                errors.append(f"{prepare_name} must produce default provenance and SBOM attestations")
            elif any(normalize_whitespace(step_field(step, "if")[0] if step_field(step, "if") else "") != publishing_only for step in attestations):
                # an attestation is a permanent public record: a rehearsal makes none (REL-030)
                errors.append(f"{prepare_name} must attest only when publishing")
            bundle = action_steps(prepare, "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02")
            expected_bundle = f"release-bundle-{platform}-${{{{ needs.validate-version.outputs.publishing == 'true' && 'publishable' || 'preview' }}}}"
            if len(bundle) != 1 or step_mapping_field(bundle[0], "with", "name") != expected_bundle or step_mapping_field(bundle[0], "with", "path") != "release/":
                errors.append(f"{prepare_name} must upload release/ as a publishable-or-preview bundle")

        upload_name = f"upload-release-{platform}"
        upload = workflow_job(workflow, upload_name)
        if upload is None:
            errors.append(f"release workflow must define {upload_name}")
            continue
        if job_field(upload, "needs") != f"[validate-version, create-draft-release, {prepare_name}]":
            errors.append(f"{upload_name} must require validation, the draft release and its own platform's evidence")
        if normalize_whitespace(job_field(upload, "if") or "") != publishing_only:
            errors.append(f"{upload_name} must run only when publishing")
        if job_mapping(upload, "permissions") != {"contents": "write"}:
            errors.append(f"{upload_name} must use only contents: write")
        if action_steps(upload, "actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955") or action_steps(upload, "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"):
            errors.append(f"{upload_name} must publish the prepared bundle without checkout or setup")
        download = action_steps(upload, "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093")
        if len(download) != 1 or step_mapping_field(download[0], "with", "name") != f"release-bundle-{platform}-publishable" or step_mapping_field(download[0], "with", "path") != "release/":
            errors.append(f"{upload_name} must download release-bundle-{platform}-publishable directly to release/")
        commands = run_commands(upload)
        if any("release-artifacts.mjs" in command for command in commands):
            errors.append(f"{upload_name} must not rebuild the prepared release bundle")
        if not any("gh release view" in command and "--json isDraft" in command and "= true" in command for command in commands):
            errors.append(f"{upload_name} must refuse a release that is not a draft")
        if not has_command(commands, 'gh release upload "$RELEASE_TAG" release/* --clobber'):
            errors.append(f"{upload_name} must upload the prepared bundle to the draft release")

    validate_firmware_chain(errors, workflow)


def validate_firmware_chain(errors: list[str], workflow: str) -> None:
    """The runtime firmware of every board (REL-022): built per board from the exact SHA, assembled, attested and uploaded."""
    publishing_only = "${{ needs.validate-version.outputs.publishing == 'true' }}"
    names = ("build-firmware", "assemble-firmware", "prepare-release-evidence-firmware", "upload-release-firmware")
    jobs = {name: workflow_job(workflow, name) for name in names}
    for name, job in jobs.items():
        if job is None:
            errors.append(f"release workflow must define {name}")
    build, assemble, prepare, upload = (jobs[name] for name in names)
    if build is not None:
        if not has_needs(build, "validate-version", "verify-release-candidate"):
            errors.append("build-firmware must depend on validate-version and full CI")
        checkout_pinned, checkout_at_sha = has_pinned_checkout_at_sha(build)
        if not checkout_pinned:
            errors.append("build-firmware must use exactly one actions/checkout pinned to a 40-character SHA")
        elif not checkout_at_sha:
            errors.append("build-firmware must checkout the validated github.sha")
        commands = run_commands(build)
        if not (any("firmware-images.ts collect" in command for command in commands) and any('--commit "${{ github.sha }}"' in command for command in commands)):
            errors.append("build-firmware must collect each board with the checks of firmware-images.ts and the commit of the run")
    if assemble is not None:
        if not has_needs(assemble, "validate-version", "build-firmware"):
            errors.append("assemble-firmware must require validation and the firmware builds")
        if not any("firmware-images.ts assemble" in command for command in run_commands(assemble)):
            errors.append("assemble-firmware must assemble the boards with firmware-images.ts")
    if prepare is not None:
        if not has_needs(prepare, "validate-version", "assemble-firmware"):
            errors.append("prepare-release-evidence-firmware must require validation and the assembled set")
        for platform in PLATFORM_SUBJECTS:
            if has_needs(prepare, f"build-{platform}"):
                errors.append(f"prepare-release-evidence-firmware must not wait for the {platform} build")
        if job_mapping(prepare, "permissions") != {"contents": "read", "id-token": "write", "attestations": "write", "artifact-metadata": "write"}:
            errors.append("prepare-release-evidence-firmware must use only its minimum evidence permissions")
        checkout_pinned, checkout_at_sha = has_pinned_checkout_at_sha(prepare)
        if not checkout_pinned or not checkout_at_sha:
            errors.append("prepare-release-evidence-firmware must use exactly one pinned actions/checkout of the validated github.sha")
        commands = run_commands(prepare)
        if not has_command(commands, 'test "$(git rev-parse HEAD)" = "${{ github.sha }}"'):
            errors.append("prepare-release-evidence-firmware must bind the bundle to the checked-out github.sha")
        sbom_file = "artifacts/ZPLC-${{ needs.validate-version.outputs.version }}-firmware.cdx.json"
        if not has_command(commands, f"bun scripts/release/sbom.ts --out {sbom_file}"):
            errors.append("prepare-release-evidence-firmware must generate the bill of materials from the lockfile with scripts/release/sbom.ts")
        if not has_command(commands, "mv release/SHA256SUMS release/SHA256SUMS-firmware") or not has_command(commands, "mv release/release-evidence.json release/release-evidence-firmware.json"):
            errors.append("prepare-release-evidence-firmware must give its checksum and evidence files a platform-specific name")
        attestations = action_steps(prepare, "actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d")
        if len(attestations) != 2 or not all(has_subject_paths(step, ("release/zplc-runtime-*",)) for step in attestations):
            errors.append("prepare-release-evidence-firmware must attest only its firmware files twice")
        elif any(normalize_whitespace(step_field(step, "if")[0] if step_field(step, "if") else "") != publishing_only for step in attestations):
            errors.append("prepare-release-evidence-firmware must attest only when publishing")
        bundle = action_steps(prepare, "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02")
        expected_bundle = "release-bundle-firmware-${{ needs.validate-version.outputs.publishing == 'true' && 'publishable' || 'preview' }}"
        if len(bundle) != 1 or step_mapping_field(bundle[0], "with", "name") != expected_bundle or step_mapping_field(bundle[0], "with", "path") != "release/":
            errors.append("prepare-release-evidence-firmware must upload release/ as a publishable-or-preview bundle")
    if upload is not None:
        if job_field(upload, "needs") != "[validate-version, create-draft-release, prepare-release-evidence-firmware]":
            errors.append("upload-release-firmware must require validation, the draft release and its own evidence")
        if normalize_whitespace(job_field(upload, "if") or "") != publishing_only:
            errors.append("upload-release-firmware must run only when publishing")
        if job_mapping(upload, "permissions") != {"contents": "write"}:
            errors.append("upload-release-firmware must use only contents: write")
        download = action_steps(upload, "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093")
        if len(download) != 1 or step_mapping_field(download[0], "with", "name") != "release-bundle-firmware-publishable":
            errors.append("upload-release-firmware must download release-bundle-firmware-publishable")
        commands = run_commands(upload)
        if not any("gh release view" in command and "--json isDraft" in command and "= true" in command for command in commands):
            errors.append("upload-release-firmware must refuse a release that is not a draft")
        if not has_command(commands, 'gh release upload "$RELEASE_TAG" release/* --clobber'):
            errors.append("upload-release-firmware must upload the prepared bundle to the draft release")


def validate_ci_checkouts(errors: list[str], workflow: str | None = None) -> None:
    workflow = active_yaml(CI_WORKFLOW.read_text() if workflow is None else workflow)
    checkouts = [
        step
        for job_name in ("typescript", "host-core", "host-core-sanitized", "zephyr-twister", "zephyr-cross-build", "docs-and-truth")
        if (job := workflow_job(workflow, job_name)) is not None
        for step in step_blocks(job)
        if (uses := step_field(step, "uses")) is not None and uses[0].startswith("actions/checkout@")
    ]
    if len(checkouts) != 6:
        errors.append("CI must contain exactly six pinned checkout steps")
        return
    for checkout in checkouts:
        if step_mapping_field(checkout, "with", "ref") != "${{ github.sha }}":
            errors.append("every CI checkout must use the exact github.sha")
            break
    for job_name in ("zephyr-twister", "zephyr-cross-build"):
        job = workflow_job(workflow, job_name)
        if job is None or not any(step_mapping_field(step, "with", "path") == "zplc" for step in step_blocks(job)):
            errors.append(f"{job_name} must retain checkout path zplc")


def validate_rc3_records(errors: list[str], matrix: str | None = None, claims: str | None = None) -> None:
    matrix = MATRIX.read_text() if matrix is None else matrix
    claims = CLAIMS.read_text() if claims is None else claims
    if not matrix.startswith("# ZPLC 2.0 RC3 Release Evidence Matrix"):
        errors.append("release evidence matrix must have the ZPLC 2.0 RC3 heading")
    if not claims.startswith("# ZPLC 2.0 RC3 Release Claim Inventory"):
        errors.append("release claims must have the ZPLC 2.0 RC3 heading")
    rows = parse_rows(matrix)
    expected = {"REL-001", "REL-002", "REL-003", "REL-004", "REL-005", "REL-006", "REL-007"}
    if {row["gate_id"] for row in rows} != expected:
        errors.append("RC3 evidence matrix must define the seven canonical release gates")
    for row in rows:
        if row["gate_id"] == "REL-007":
            if row["status"] == "passed":
                serial = ROOT / "specs/008-release-foundation/artifacts/evidence-board-serial.md"
                network = ROOT / "specs/008-release-foundation/artifacts/evidence-board-network.md"
                if "Pending" in row["required_evidence"] or any("Status: Passed human execution." not in path.read_text() for path in (serial, network)):
                    errors.append("HIL cannot pass while its evidence remains pending")
            continue
        if row["status"] != "passed":
            errors.append(f"RC3 non-HIL gate {row['gate_id']} must be passed")
        for link in (part.strip() for part in row["artifact_links"].split(";") if part.strip()):
            link_path = link.split("#", 1)[0]
            if link_path and not link_path.startswith(("http://", "https://")) and not (ROOT / link_path).exists():
                errors.append(f"{row['gate_id']} references missing local evidence {link_path}")
    if re.search(r"(?:signed|notarized|notarisation) (?:installer|artifact|release) (?:has been |was )?(?:verified|created|executed)", claims, re.IGNORECASE):
        errors.append("release claims must not assert that hosted signing or notarization already executed")


def main() -> int:
    rows = parse_rows()
    claims = parse_claim_rows()
    errors: list[str] = []
    if not rows:
        errors.append("release evidence matrix has no gate rows")

    gate_ids = {row["gate_id"] for row in rows}

    for row in rows:
        if row["owner_type"] not in {"AI", "Human", "Shared"}:
            errors.append(
                f"{row['gate_id']} has invalid owner_type {row['owner_type']}"
            )
        if row["status"] not in {"pending", "blocked", "passed", "failed", "rescoped"}:
            errors.append(f"{row['gate_id']} has invalid status {row['status']}")
        if not row["owner"]:
            errors.append(f"{row['gate_id']} must have an owner")
        if row["owner_type"] in {"Human", "Shared"} and not row["artifact_links"]:
            errors.append(
                f"{row['gate_id']} must declare artifact links for {row['owner_type']} validation"
            )

    if not claims:
        errors.append("release claims inventory has no claim rows")

    for claim in claims:
        if claim["status"] not in {"draft", "verified", "experimental", "removed"}:
            errors.append(f"{claim['claim_id']} has invalid status {claim['status']}")
        for gate_id in [
            value.strip()
            for value in claim["evidence_gate_ids"].split(",")
            if value.strip()
        ]:
            if gate_id not in gate_ids:
                errors.append(f"{claim['claim_id']} references unknown gate {gate_id}")

    validate_release_workflow(errors)
    validate_ci_checkouts(errors)
    validate_rc3_records(errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(
        f"Validated {len(rows)} release evidence gates from {MATRIX.relative_to(ROOT)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
