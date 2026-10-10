"""The run record of a hardware run (HIL-009): build it, check it against run-record.schema.json, write it.

The schema is the one packages/zplc-hil/src/record.ts reads too, and test_hil_record.py checks that a record
this module writes is one that file accepts. The validator covers the keywords the schema uses and nothing
more, so that it needs no dependency.
"""
from __future__ import annotations

import hashlib
import json
import platform
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_FILE = Path(__file__).with_name("run-record.schema.json")
SCHEMA_ID = "zplc.hil.run-record/1"
HARNESS_VERSION = "1"
ROOT = Path(__file__).resolve().parents[2]


def load_schema() -> dict:
    return json.loads(SCHEMA_FILE.read_text())


def _is(value, name: str) -> bool:
    return {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
        "null": value is None,
    }[name]


def validate(value, schema: dict | None = None, path: str = "$") -> list[str]:
    """The ways `value` does not fit `schema` (default: the record schema); an empty list is a valid record."""
    schema = load_schema() if schema is None else schema
    errors: list[str] = []
    if "const" in schema and value != schema["const"]:
        return [f"{path}: must be {schema['const']!r}"]
    if "enum" in schema and value not in schema["enum"]:
        return [f"{path}: must be one of {schema['enum']}"]
    if "type" in schema:
        names = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_is(value, name) for name in names):
            return [f"{path}: must be {' or '.join(names)}"]
    if isinstance(value, str):
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{path}: does not match {schema['pattern']}")
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{path}: must not be shorter than {schema['minLength']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool) and "minimum" in schema and value < schema["minimum"]:
        errors.append(f"{path}: must be at least {schema['minimum']}")
    if isinstance(value, dict):
        for name in schema.get("required", []):
            if name not in value:
                errors.append(f"{path}: {name} is required")
        properties = schema.get("properties", {})
        for name, item in value.items():
            if name in properties:
                errors += validate(item, properties[name], f"{path}.{name}")
            elif schema.get("additionalProperties") is False:
                errors.append(f"{path}: {name} is not a field of the record")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{path}: must hold at least {schema['minItems']} items")
        if "items" in schema:
            for position, item in enumerate(value):
                errors += validate(item, schema["items"], f"{path}[{position}]")
    return errors


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def sha256_hex(data: bytes | str) -> str:
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode()).hexdigest()


def serial_hash(vid: int | None, pid: int | None, serial_number: str | None) -> str | None:
    """A name for one USB unit that does not publish its serial number."""
    if serial_number is None:
        return None
    return sha256_hex(f"{vid or 0:04x}:{pid or 0:04x}:{serial_number}")


# The names a firmware image may report its build under. The build information of REL-023 is not on the device
# yet: when it is, these are the one place that learns its field names.
_COMMIT_KEYS = ("commit", "git_commit", "build_commit", "zplc_commit")
_VERSION_KEYS = ("zplc_version", "version", "build_version")


def firmware_identity(info: dict) -> dict:
    """The firmware fields of a record from the JSON of `zplc sys info`; what the image does not report stays null."""
    build = info.get("build") if isinstance(info.get("build"), dict) else {}
    pool = {**info, **build}
    commit = next((str(pool[k]) for k in _COMMIT_KEYS if pool.get(k)), None)
    options = build.get("options") or info.get("build_options")
    return {
        "commit": commit,
        "version": next((str(pool[k]) for k in _VERSION_KEYS if pool.get(k)), None),
        "abi_major": info.get("bytecode_abi_major"),
        "abi_minor": info.get("bytecode_abi_minor"),
        "draft_counter": info.get("draft_counter"),
        "build_options": options if isinstance(options, dict) else None,
    }


def repository_state() -> dict:
    def git(*args: str) -> str | None:
        try:
            done = subprocess.run(["git", *args], capture_output=True, text=True, cwd=ROOT, timeout=10)
        except (OSError, subprocess.SubprocessError):
            return None
        return done.stdout.strip() if done.returncode == 0 else None

    commit, status = git("rev-parse", "HEAD"), git("status", "--porcelain")
    return {"commit": commit, "dirty": None if status is None else bool(status)}


def tool_versions(compiler_draft_counter: int | None = None) -> dict:
    bun = None
    try:
        done = subprocess.run(["bun", "--version"], capture_output=True, text=True, timeout=10)
        bun = done.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        pass
    return {
        "harness": HARNESS_VERSION,
        "platform": f"{platform.system()} {platform.release()} {platform.machine()}",
        "python": platform.python_version(),
        "bun": bun,
        "compiler_draft_counter": compiler_draft_counter,
    }


def new_record(kind: str, evidence: str, board: dict, operator: str) -> dict:
    return {
        "schema": SCHEMA_ID,
        "run_id": uuid.uuid4().hex,
        "kind": kind,
        "evidence": evidence,
        "result": "incomplete",
        "started_at": now(),
        "ended_at": now(),
        "board": board,
        "device": {"reported_board": "unknown"},
        "firmware": {},
        "tools": tool_versions(),
        "operator": {"name": operator},
        "steps": [],
        "tests": [],
        "logs": [],
    }


def summarize(record: dict) -> str:
    """fail on any failed or errored step or test; pass when something ran and nothing failed; incomplete when nothing ran.

    A step that is `pending` was not run (the chain lists the HIL-010 items it cannot do yet this way) and does not turn a pass into a fail.
    """
    steps = record["steps"]
    if any(step["result"] in ("fail", "error") for step in steps) or any(t["result"] == "fail" for t in record["tests"]):
        return "fail"
    return "pass" if any(step["result"] == "pass" for step in steps) else "incomplete"


def write_record(record: dict, directory: str | Path) -> Path:
    """Validate and write a record as <directory>/<board>-<date>-<run id>.json; an invalid record is refused, not written."""
    problems = validate(record)
    if problems:
        raise ValueError("the run record does not fit the schema:\n  " + "\n  ".join(problems))
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    stamp = record["started_at"][:10]
    path = folder / f"{record['board']['id']}-{stamp}-{record['run_id'][:8]}.json"
    path.write_text(json.dumps(record, indent=2) + "\n")
    return path


if __name__ == "__main__":  # python3 tools/hil/hil_record.py <record.json>: check a record against the schema
    problems = validate(json.loads(Path(sys.argv[1]).read_text()))
    print("\n".join(problems) or "valid")
    sys.exit(1 if problems else 0)
