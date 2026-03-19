#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
MATRIX = ROOT / "specs/008-release-foundation/artifacts/release-evidence-matrix.md"
CLAIMS = ROOT / "specs/008-release-foundation/artifacts/release-claims.md"


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
