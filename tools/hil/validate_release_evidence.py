#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / "specs/008-release-foundation/artifacts/release-evidence-matrix.md"
CLAIMS = ROOT / "specs/008-release-foundation/artifacts/release-claims.md"
RELEASE_WORKFLOW = ROOT / ".github/workflows/release.yml"
IMMUTABLE_ACTION_SHA = re.compile(r"[0-9a-fA-F]{40}\Z")


def parse_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in MATRIX.read_text().splitlines():
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


def parse_claim_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in CLAIMS.read_text().splitlines():
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


def action_steps(job: str, action: str) -> list[list[str]]:
    return [
        step
        for step in step_blocks(job)
        if (uses := step_field(step, "uses")) is not None and uses[0] == action
    ]


def has_subject_paths(step: list[str]) -> bool:
    return bool(
        re.search(
            r"(?ms)^          subject-path: \|\n"
            r"            release/\*\.dmg\n"
            r"            release/\*\.zip\n"
            r"            release/\*-Setup\.exe\n"
            r"            release/\*-Portable\.exe\n"
            r"            release/\*\.AppImage\n"
            r"            release/\*\.deb\n"
            r"            release/\*\.rpm(?:\n          sbom-path:|\Z)",
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
        requirements = {
            "bun run check:versions": has_command(commands, "bun run check:versions"),
            "package.json": any(
                command
                == 'canonical_version="$(bun -e \'console.log(JSON.parse(require("fs").readFileSync("package.json", "utf8")).version)\')"'
                for command in commands
            ),
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
        manual_upload_guard = (
            'if [ "$EVENT_NAME" = "workflow_dispatch" ] && '
            '[ "$UPLOAD_TO_RELEASE" = "true" ] && '
            '[ "$EVENT_REF" != "refs/tags/v$canonical_version" ]; then'
        )
        if not has_command(commands, manual_upload_guard):
            errors.append("validate-version must include the exact manual upload tag guard")
        canonical_version_guard = 'if [ "$requested" != "$canonical_version" ]; then'
        if not has_command(commands, canonical_version_guard):
            errors.append("validate-version must include the exact canonical version comparison")

    if any(
        re.search(r"\b(?:bun|node|tsx)\b.*\brelease-version\.ts\b", command)
        for job_name in ("validate-version", "build-macos", "build-windows", "build-linux", "prepare-release-evidence", "upload-release")
        if (job := workflow_job(workflow, job_name)) is not None
        for command in run_commands(job)
    ):
        errors.append("release workflow must not mutate manifests with release-version.ts")

    for build_name in ("build-macos", "build-windows", "build-linux"):
        build = workflow_job(workflow, build_name)
        if build is None:
            errors.append(f"release workflow must define {build_name}")
            continue
        if job_field(build, "needs") != "validate-version":
            errors.append(f"{build_name} must depend on validate-version")
        checkout_pinned, checkout_at_sha = has_pinned_checkout_at_sha(build)
        if not checkout_pinned:
            errors.append(
                f"{build_name} must use exactly one actions/checkout pinned to a 40-character SHA"
            )
        elif not checkout_at_sha:
            errors.append(f"{build_name} must checkout the validated github.sha")

    prepare = workflow_job(workflow, "prepare-release-evidence")
    if prepare is None:
        errors.append("release workflow must define prepare-release-evidence")
    else:
        if job_field(prepare, "needs") != "[validate-version, build-macos, build-windows, build-linux]":
            errors.append("prepare-release-evidence must require validate-version and all platform builds")
        if job_field(prepare, "runs-on") != "ubuntu-latest":
            errors.append("prepare-release-evidence must run on ubuntu-latest")
        if job_mapping(prepare, "permissions") != {
            "contents": "read",
            "id-token": "write",
            "attestations": "write",
            "artifact-metadata": "write",
        }:
            errors.append("prepare-release-evidence must use only its minimum evidence permissions")
        checkout_pinned, checkout_at_sha = has_pinned_checkout_at_sha(prepare)
        if not checkout_pinned:
            errors.append("prepare-release-evidence must use exactly one actions/checkout pinned to a 40-character SHA")
        elif not checkout_at_sha:
            errors.append("prepare-release-evidence must checkout the validated github.sha")
        commands = run_commands(prepare)
        if not has_command(commands, 'test "$(git rev-parse HEAD)" = "${{ github.sha }}"'):
            errors.append("prepare-release-evidence must bind the bundle to the checked-out github.sha")
        download = action_steps(prepare, "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093")
        if len(download) != 1 or step_mapping_field(download[0], "with", "path") != "artifacts":
            errors.append("prepare-release-evidence must download all build artifacts to artifacts")
        sbom = action_steps(prepare, "anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610")
        expected_spdx = "artifacts/ZPLC-${{ needs.validate-version.outputs.version }}.spdx.json"
        if len(sbom) != 1 or any(
            step_mapping_field(sbom[0], "with", key) != value
            for key, value in {
                "path": "artifacts",
                "format": "spdx-json",
                "output-file": expected_spdx,
                "upload-artifact": "false",
                "upload-release-assets": "false",
                "dependency-snapshot": "false",
            }.items()
        ):
            errors.append("prepare-release-evidence must generate an unpublished SPDX SBOM from artifacts")
        attestations = action_steps(prepare, "actions/attest@508db95dd578ae2727ebd6217d5ba78e4fbda05d")
        if len(attestations) != 2 or not all(has_subject_paths(step) for step in attestations):
            errors.append("prepare-release-evidence must attest only the installer paths twice")
        elif step_mapping_field(attestations[0], "with", "sbom-path") is not None or step_mapping_field(attestations[1], "with", "sbom-path") != expected_spdx:
            errors.append("prepare-release-evidence must produce default provenance and SPDX SBOM attestations")
        bundle = action_steps(prepare, "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02")
        if len(bundle) != 1 or step_mapping_field(bundle[0], "with", "name") != "release-bundle" or step_mapping_field(bundle[0], "with", "path") != "release/":
            errors.append("prepare-release-evidence must upload release/ as release-bundle")

    upload = workflow_job(workflow, "upload-release")
    if upload is None:
        errors.append("release workflow must define upload-release")
        return
    if job_field(upload, "needs") != "[validate-version, prepare-release-evidence]":
        errors.append("upload-release must require validate-version and prepare-release-evidence")
    expected_condition = (
        "${{ always() && (github.event_name == 'push' || inputs.upload_to_release != false) "
        "&& needs.validate-version.result == 'success' "
        "&& needs.prepare-release-evidence.result == 'success' }}"
    )
    if normalize_whitespace(job_field(upload, "if") or "") != expected_condition:
        errors.append("upload-release must require only the complete success conjunction")
    if action_steps(upload, "actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955") or action_steps(upload, "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"):
        errors.append("upload-release must publish the prepared bundle without checkout or setup")
    download = action_steps(upload, "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093")
    if len(download) != 1 or step_mapping_field(download[0], "with", "name") != "release-bundle" or step_mapping_field(download[0], "with", "path") != "release/":
        errors.append("upload-release must download release-bundle directly to release/")
    if any("release-artifacts.mjs" in command for command in run_commands(upload)):
        errors.append("upload-release must not rebuild the prepared release bundle")
    if not re.search(r"(?m)^            release/\*\.spdx\.json$", upload):
        errors.append("upload-release must publish the prepared SPDX SBOM")


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
