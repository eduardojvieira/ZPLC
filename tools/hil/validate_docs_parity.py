#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
MANIFEST_EN = ROOT / "docs/docs/reference/v1-5-canonical-docs-manifest.md"
MANIFEST_ES = (
    ROOT
    / "docs/i18n/es/docusaurus-plugin-content-docs/current/reference/v1-5-canonical-docs-manifest.md"
)
BOARD_MANIFEST = ROOT / "firmware/app/boards/supported-boards.v1.5.0.json"
REFERENCE_INDEX_EN = ROOT / "docs/docs/reference/index.md"
REFERENCE_INDEX_ES = (
    ROOT / "docs/i18n/es/docusaurus-plugin-content-docs/current/reference/index.md"
)
RUNTIME_REFERENCE_EN = ROOT / "docs/docs/reference/runtime-api.md"
RUNTIME_REFERENCE_ES = (
    ROOT
    / "docs/i18n/es/docusaurus-plugin-content-docs/current/reference/runtime-api.md"
)
OPERATIONS_EN = ROOT / "docs/docs/operations/index.md"
OPERATIONS_ES = (
    ROOT / "docs/i18n/es/docusaurus-plugin-content-docs/current/operations/index.md"
)
RELEASE_NOTES_EN = ROOT / "docs/docs/release-notes/index.md"
RELEASE_NOTES_ES = (
    ROOT / "docs/i18n/es/docusaurus-plugin-content-docs/current/release-notes/index.md"
)
GENERATORS = [
    ROOT / "tools/docs/generate_runtime_reference.py",
    ROOT / "tools/docs/generate_board_reference.py",
]


def parse_rows(path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in path.read_text().splitlines():
        if not line.startswith("|"):
            continue
        if "slug" in line or set(line.replace("|", "").strip()) == {"-"}:
            continue
        parts = [part.strip() for part in line.strip().strip("|").split("|")]
        if len(parts) != 7:
            continue
        rows.append(
            {
                "slug": parts[0],
                "english_path": parts[1],
                "spanish_path": parts[2],
                "area": parts[3],
                "release_blocking": parts[4],
                "owner": parts[5],
                "status": parts[6],
            }
        )
    return rows


def parse_frontmatter(path: Path) -> dict[str, str]:
    lines = path.read_text().splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    data: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def run_generator_checks(errors: list[str]) -> None:
    for generator in GENERATORS:
        result = subprocess.run(
            [sys.executable, str(generator), "--check"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            output = (result.stdout + result.stderr).strip()
            errors.append(
                output
                or f"generator freshness check failed: {generator.relative_to(ROOT)}"
            )


def network_summary(entry: dict[str, object], spanish: bool) -> str:
    network_class = str(entry["network_class"])
    interface = str(entry["network_interface"])
    if network_class == "serial-focused":
        return "Enfoque serial" if spanish else "Serial-focused"
    if interface == "wifi":
        return "Capacidad de red (Wi-Fi)" if spanish else "Network-capable (Wi-Fi)"
    if interface == "ethernet":
        return (
            "Capacidad de red (Ethernet)" if spanish else "Network-capable (Ethernet)"
        )
    return "Capacidad de red" if spanish else "Network-capable"


def parse_section_table(path: Path, heading: str) -> list[list[str]]:
    lines = path.read_text().splitlines()
    in_section = False
    rows: list[list[str]] = []
    for line in lines:
        if line.strip() == heading:
            in_section = True
            continue
        if in_section and line.startswith("## "):
            break
        if in_section and line.startswith("|"):
            if set(line.replace("|", "").strip()) == {"-"}:
                continue
            parts = [part.strip() for part in line.strip().strip("|").split("|")]
            if parts and parts[0].lower() in {"board", "placa"}:
                continue
            rows.append(parts)
    return rows


def validate_reference_index(errors: list[str]) -> None:
    boards = json.loads(BOARD_MANIFEST.read_text())
    expected_en = [
        [
            str(entry["display_name"]),
            f"`{entry['ide_id']}`",
            f"`{entry['zephyr_board']}`",
            network_summary(entry, False),
            str(entry["validation_level"]),
        ]
        for entry in boards
    ]
    expected_es = [
        [
            str(entry["display_name"]),
            f"`{entry['ide_id']}`",
            f"`{entry['zephyr_board']}`",
            network_summary(entry, True),
            str(entry["validation_level"]),
        ]
        for entry in boards
    ]
    actual_en = parse_section_table(REFERENCE_INDEX_EN, "## Supported Boards")
    actual_es = parse_section_table(REFERENCE_INDEX_ES, "## Placas Soportadas")
    if actual_en != expected_en:
        errors.append(
            "docs/docs/reference/index.md board summary drifts from firmware/app/boards/supported-boards.v1.5.0.json"
        )
    if actual_es != expected_es:
        errors.append(
            "docs/i18n/es/.../reference/index.md board summary drifts from firmware/app/boards/supported-boards.v1.5.0.json"
        )


def count_sections(path: Path) -> int:
    return sum(1 for line in path.read_text().splitlines() if line.startswith("## "))


def count_bullets(path: Path) -> int:
    return sum(
        1 for line in path.read_text().splitlines() if re.match(r"^\s*[-*] ", line)
    )


def validate_runtime_reference_semantics(errors: list[str]) -> None:
    suspicious_tokens = ["#### `regions`", "#### `API`", "#### `writers`", "| `*/` |"]
    for path in [RUNTIME_REFERENCE_EN, RUNTIME_REFERENCE_ES]:
        content = path.read_text()
        for token in suspicious_tokens:
            if token in content:
                errors.append(
                    f"semantic corruption detected in generated runtime reference: {path.relative_to(ROOT)} contains {token}"
                )
        if "@brief" in content or "*/ int " in content:
            errors.append(
                f"semantic corruption detected in generated runtime reference: {path.relative_to(ROOT)} leaked header comment text into published signatures"
            )


def validate_release_blocking_depth(errors: list[str]) -> None:
    expectations = [
        (OPERATIONS_EN, 4, 8, "operations guidance is too shallow"),
        (OPERATIONS_ES, 4, 8, "operations guidance is too shallow"),
        (RELEASE_NOTES_EN, 4, 8, "release notes are too shallow"),
        (RELEASE_NOTES_ES, 4, 8, "release notes are too shallow"),
    ]
    for path, min_sections, min_bullets, label in expectations:
        if count_sections(path) < min_sections or count_bullets(path) < min_bullets:
            errors.append(f"{label}: {path.relative_to(ROOT)}")


def main() -> int:
    rows_en = parse_rows(MANIFEST_EN)
    rows_es = parse_rows(MANIFEST_ES)
    errors: list[str] = []
    if not rows_en:
        errors.append("canonical English docs manifest has no rows")
    if not rows_es:
        errors.append("canonical Spanish docs manifest has no rows")
    if rows_en != rows_es:
        errors.append(
            "English and Spanish canonical docs manifests are not structurally aligned"
        )

    for row in rows_en:
        if row["release_blocking"] != "yes":
            continue
        english = ROOT / row["english_path"]
        spanish = ROOT / row["spanish_path"]
        if not english.exists():
            errors.append(
                f"missing English page for {row['slug']}: {row['english_path']}"
            )
            continue
        if not spanish.exists():
            errors.append(
                f"missing Spanish page for {row['slug']}: {row['spanish_path']}"
            )
            continue
        en_slug = parse_frontmatter(english).get("slug", "")
        es_slug = parse_frontmatter(spanish).get("slug", "")
        if en_slug != es_slug:
            errors.append(
                f"frontmatter slug mismatch for {row['slug']}: EN='{en_slug}' ES='{es_slug}'"
            )

    run_generator_checks(errors)
    validate_reference_index(errors)
    validate_runtime_reference_semantics(errors)
    validate_release_blocking_depth(errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(
        "Validated manifest coverage, EN/ES slug parity, generated freshness, and board/reference drift for "
        f"{len(rows_en)} canonical docs rows"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
