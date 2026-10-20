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


LEVELS_OF_EVIDENCE = {"hardware": ("hardware", "community-reported"), "emulated": ("emulated",), "host-runtime": (None,), "fake": (None,)}
"""The evidence levels a run of each kind may carry (HIL contract): only a hardware run is hardware evidence."""


def evidence_level_problems(record) -> list[str]:
    """What the schema cannot say: the level must follow what ran, and an emulated record names its emulator."""
    if not isinstance(record, dict) or record.get("evidence") not in LEVELS_OF_EVIDENCE or "evidence_level" not in record:
        return []
    level, evidence = record["evidence_level"], record["evidence"]
    problems = []
    if level not in LEVELS_OF_EVIDENCE[evidence]:
        problems.append(f"$.evidence_level: a run on {evidence} cannot be {level!r} evidence")
    if level == "emulated" and "emulator" not in record:
        problems.append("$: an emulated record names its emulator (name, version, patch_sha256)")
    if level != "emulated" and "emulator" in record:
        problems.append("$.emulator: only an emulated record names an emulator")
    return problems


def validate(value, schema: dict | None = None, path: str = "$") -> list[str]:
    """The ways `value` does not fit `schema` (default: the record schema, and the evidence-level pairing); an empty list is a valid record."""
    if schema is None:
        return validate(value, load_schema(), path) + evidence_level_problems(value)
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


# What an image reports about itself (REL-023): the JSON of `zplc sys build --json`, and the text of `zplc version` and
# `zplc sys build`, both written by scripts/release/zplc_fw_identity.h.in. A host runtime reports the same object as the
# `build` of its session.hello.
IDENTITY_KEYS = ("version", "commit", "dirty", "board", "abi_major", "abi_minor", "draft_counter", "options_hash", "options")
_TEXT_LABELS = {
    "Commit": "commit", "Dirty": "dirty", "Board": "board", "Bytecode ABI": "abi", "Contract draft": "draft_counter",
    "Options hash": "options_hash", "Options": "options",
}


def parse_identity_text(text: str) -> dict:
    """The identity object from the text of `zplc version`; {} when the text is not one (an older image, or another command)."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    first = next((line for line in lines if line.startswith("ZPLC Runtime v")), None)
    if first is None:
        return {}
    found: dict = {"version": first[len("ZPLC Runtime v"):]}
    for line in lines:
        label, _, value = line.partition(":")
        key = _TEXT_LABELS.get(label.strip())
        if key is None:
            continue
        value = value.strip()
        if key == "abi":
            major, _, minor = value.partition(".")
            if major.isdigit() and minor.isdigit():
                found["abi_major"], found["abi_minor"] = int(major), int(minor)
        elif key == "draft_counter":
            if value.isdigit():
                found[key] = int(value)
        elif key == "dirty":
            found[key] = value == "yes"
        else:
            found[key] = value
    return found if set(found) == set(IDENTITY_KEYS) else {}


IO_IDENTITY_KEYS = ("schema", "board_id", "hash", "channels", "input_bytes", "output_bytes")
_IO_TEXT = re.compile(r"^I/O description: (?P<board_id>\S+), (?P<channels>\d+) channels, hash (?P<hash>[0-9a-f]{8}), (?P<input_bytes>\d+) B in, (?P<output_bytes>\d+) B out$")


def parse_io_identity(value) -> dict:
    """The identity of the I/O description from the object of `zplc sys io --json` (IO-004); {} when it is not one."""
    if not isinstance(value, dict) or set(value) != set(IO_IDENTITY_KEYS) or value.get("schema") != 1:
        return {}
    ok = (
        isinstance(value["board_id"], str) and value["board_id"] != ""
        and isinstance(value["hash"], str) and re.fullmatch(r"[0-9a-f]{8}", value["hash"]) is not None
        and all(isinstance(value[k], int) and not isinstance(value[k], bool) and value[k] >= 0 for k in ("channels", "input_bytes", "output_bytes"))
    )
    return {k: value[k] for k in IO_IDENTITY_KEYS if k != "schema"} if ok else {}


def parse_io_identity_text(text: str) -> dict:
    """The same from the line `zplc sys io` prints."""
    for line in text.splitlines():
        match = _IO_TEXT.match(line.strip())
        if match:
            found = match.groupdict()
            return {"board_id": found["board_id"], "hash": found["hash"], **{k: int(found[k]) for k in ("channels", "input_bytes", "output_bytes")}}
    return {}


def parse_options(options: str | None) -> dict | None:
    """`A=y,B=8192` as {"A": "y", "B": "8192"}; `none` as {}; None when there is no text to read."""
    if not isinstance(options, str):
        return None
    if options == "none":
        return {}
    pairs = [item.partition("=") for item in options.split(",") if item]
    return {name: value for name, _, value in pairs}


def firmware_identity(build: dict | None) -> dict:
    """The firmware fields of a record from the identity object of `zplc sys build --json`.

    What the image does not report stays out: an image with no identity gives {}. `hil_trace` is read from the
    options of a Zephyr image, which lists every CONFIG_ZPLC_* symbol that is on: its absence there is off. A host build
    lists no such symbols, so for it the record does not say.
    """
    if not isinstance(build, dict) or not build:
        return {}
    options = build.get("options") if isinstance(build.get("options"), str) else None
    parsed = parse_options(options)
    commit = build.get("commit")
    found = {
        "commit": commit if isinstance(commit, str) and commit != "unknown" else None,
        "version": build.get("version"),
        "dirty": build.get("dirty") if isinstance(build.get("dirty"), bool) else None,
        "board_target": build.get("board"),
        "abi_major": build.get("abi_major"),
        "abi_minor": build.get("abi_minor"),
        "draft_counter": build.get("draft_counter"),
        "options_hash": build.get("options_hash"),
        "options": options,
        "build_options": parsed,
        "hil_trace": None if not parsed or "y" not in parsed.values() else parsed.get("HIL_DEBUG") == "y",
    }
    return found


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


def new_record(kind: str, evidence: str, board: dict, operator: str, emulator: dict | None = None) -> dict:
    """A record of a run of `evidence` (hardware, emulated, host-runtime, fake); its evidence level follows from it."""
    extra = {"emulator": emulator} if evidence == "emulated" else {}
    return {
        "schema": SCHEMA_ID,
        "run_id": uuid.uuid4().hex,
        "kind": kind,
        "evidence": evidence,
        "evidence_level": evidence if evidence in ("hardware", "emulated") else None,
        **extra,
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


def record_stem(record: dict) -> str:
    """<board>-<date>-<run id>: the file name of a run record without its suffix."""
    return f"{record['board']['id']}-{record['started_at'][:10]}-{record['run_id'][:8]}"


def write_record(record: dict, directory: str | Path) -> Path:
    """Validate and write a record as <directory>/<board>-<date>-<run id>.json; an invalid record is refused, not written."""
    problems = validate(record)
    if problems:
        raise ValueError("the run record does not fit the schema:\n  " + "\n  ".join(problems))
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{record_stem(record)}.json"
    path.write_text(json.dumps(record, indent=2) + "\n")
    return path


EVIDENCE_SCHEMA = "zplc.hil-record/1"  # the flat record firmware/zephyr/scripts/zplc_boards.py derives a support level from


def evidence_summary(record: dict, run_record: str) -> tuple[dict | None, str]:
    """The flat evidence record of a run for the board manifest, or why there is none.

    Only a run on real hardware that ended in pass or fail, of an image that was built from a clean tree, reports a
    40-digit commit and is named by its hash, is evidence of a board. A run on an emulator bench gets the same flat
    record at the `emulated` level, naming its emulator, so that the manifest can list it as emulated: it never raises a
    support level. A person reads the run record and adds the file to the board's `evidence_refs`; nothing here edits
    the manifest.
    """
    firmware, board = record.get("firmware", {}), record.get("board", {})
    if record.get("evidence") not in ("hardware", "emulated"):
        return None, f"the run was on a stand-in ({record.get('evidence')}), which is not evidence of a board"
    if record.get("result") not in ("pass", "fail"):
        return None, f"the run is {record.get('result')}: nothing was proven either way"
    if not board.get("board_id"):
        return None, "the board has no board_id in boards.json"
    if not firmware.get("version"):
        return None, "the device reports no firmware version"
    commit = firmware.get("commit")
    if not (isinstance(commit, str) and re.fullmatch(r"[0-9a-f]{40}", commit)):
        return None, "the device reports no 40-digit commit"
    if firmware.get("dirty") is not False:
        return None, "the image was not shown to be built from a tree without uncommitted changes, so its commit does not name what ran"
    image = firmware.get("image_sha256")
    if not (isinstance(image, str) and re.fullmatch(r"[0-9a-f]{64}", image)):
        return None, "no --firmware-image was given, so the record cannot name the image that was flashed"
    emulated = record.get("evidence_level") == "emulated"
    return {
        "schema": EVIDENCE_SCHEMA,
        "board_id": board["board_id"],
        "firmware_version": firmware["version"],
        "commit": commit,
        "image_sha256": image,
        "result": record["result"],
        "evidence": record["evidence"],
        "evidence_level": record.get("evidence_level"),
        **({"emulator": record.get("emulator")} if emulated else {}),
        "hil_trace": firmware.get("hil_trace"),
        "options_hash": firmware.get("options_hash"),
        "run_id": record["run_id"],
        "run_record": run_record,
        "started_at": record["started_at"],
        "coverage": record.get("coverage"),
    }, ""


MANIFEST = ROOT / "firmware" / "app" / "boards" / "boards.json"


def _git(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, timeout=30)


def strict_ancestor(root: Path, image: str, added: str) -> bool | None:
    """Whether `image` is a strict ancestor of `added` in the history at `root`; None when the history cannot say."""
    if image == added:
        return False
    done = _git(root, "merge-base", "--is-ancestor", image, added)
    return {0: True, 1: False}.get(done.returncode)


def binding_problems(root: Path, refs) -> list[str]:
    """HIL-009: every committed record names the commit of the image it tested, and that commit is a strict ancestor
    of the commit that added the record (the latest commit that added the file), so a record is never committed in the
    commit its image was built from, nor bound to an image its history does not contain."""
    problems = []
    for ref in refs:
        added = _git(root, "log", "--diff-filter=A", "--format=%H", "-1", "--", ref).stdout.strip()
        if not added:
            problems.append(f"{ref}: not committed, so it is bound to no commit")
            continue
        try:
            commit = json.loads((root / ref).read_text()).get("commit")
        except (OSError, ValueError, AttributeError):
            commit = None
        if not (isinstance(commit, str) and re.fullmatch(r"[0-9a-f]{40}", commit)):
            problems.append(f"{ref}: names no 40-digit commit of the image it tested")
            continue
        ancestor = strict_ancestor(root, commit, added)
        if ancestor is None:
            problems.append(f"{ref}: the image commit {commit} is not in this history (a shallow clone cannot check it)")
        elif not ancestor:
            problems.append(f"{ref}: the image commit {commit} is not a strict ancestor of {added}, the commit that added the record")
    return problems


def manifest_record_refs(manifest: Path = MANIFEST) -> list[str]:
    """The `evidence_refs` of every board of the manifest."""
    return [ref for board in json.loads(manifest.read_text()) for ref in board.get("evidence_refs", [])]


if __name__ == "__main__":  # python3 tools/hil/hil_record.py <record.json>: check a record against the schema
    problems = validate(json.loads(Path(sys.argv[1]).read_text()))
    print("\n".join(problems) or "valid")
    sys.exit(1 if problems else 0)
