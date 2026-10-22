#!/usr/bin/env python3
"""Run clang-tidy over the ZPLC firmware C code with warnings as errors (VF-018).

    python3 tools/ci/run_clang_tidy.py                      host pass
    python3 tools/ci/run_clang_tidy.py --zephyr-build DIR   host pass, then the Zephyr pass
    python3 tools/ci/run_clang_tidy.py --zephyr-build DIR --zephyr-only   the Zephyr pass alone (the Zephyr CI jobs)
    python3 tools/ci/run_clang_tidy.py --zephyr-build DIR --update-baseline

Host pass (always): CMake configures firmware/lib/zplc_core out of tree into a temporary directory with
CMAKE_EXPORT_COMPILE_COMMANDS=ON (nothing is built), and clang-tidy runs, with the checks of the repository's
.clang-tidy, over every translation unit under

    firmware/lib/zplc_core/src/core        the VM, loader, dispatcher and retain store
    firmware/lib/zplc_core/src/hal/posix   the POSIX HAL
    firmware/apps/posix_host/src           the host runtime application
    firmware/lib/zplc_core/tests/test_parse.c   the test of firmware/app/src/zplc_parse.h, which analyses that header

and, through HeaderFilterRegex, over the headers they include (firmware/lib/zplc_core/include among them).
Any finding is an error.

Zephyr pass (only with a west build tree, `--zephyr-build DIR` or $ZPLC_TIDY_ZEPHYR_BUILD): DIR is the directory of
`west build -b <board> firmware/app`, which holds compile_commands.json. The files that Zephyr compiles (the
firmware/app sources, the Zephyr HAL and scheduler, the core as built for the board) are analysed with the compile
commands of that build, rewritten for clang: GCC-only flags are dropped, -Werror is left to the tidy configuration, and
the arm-zephyr-eabi compiler becomes `clang --target=arm-none-eabi`. Targets clang does not know (Xtensa) are
skipped with a message. Without a build tree the pass is skipped and the host pass alone decides the exit status.

  - firmware/lib/zplc_core: no finding is allowed, as in the host pass.
  - firmware/app: the findings recorded for the board in tools/ci/clang-tidy-app-baseline.json are tolerated and
    counted per file and check; a new finding, or a count above its baseline, is an error, and a board with no entry
    tolerates none. The application sources belong to another workstream: --update-baseline rewrites the entry of
    the board (named by the build directory, or by --board) from this run once findings were fixed, so it only shrinks.

Exit status: 0 clean, 1 findings, 2 the tool could not run.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

# The findings of clang-tidy change between versions, so CI and a contributor run this one (the PyPI wheel, like clang-format).
CLANG_TIDY_VERSION = "23.1.3"
REPO = Path(__file__).resolve().parents[2]
CONFIG = REPO / ".clang-tidy"
BASELINE = REPO / "tools/ci/clang-tidy-app-baseline.json"

# test_parse.c includes firmware/app/src/zplc_parse.h, the portable header of the Zephyr shell and cloud clients, so
# that the header is analysed on the host as well.
HOST_UNITS = re.compile(
    r"(?:^|/)firmware/(?:lib/zplc_core/src/(?:core|hal/posix)/[^/]+|apps/posix_host/src/[^/]+|lib/zplc_core/tests/test_parse)\.c$"
)
ZEPHYR_UNITS = re.compile(r"(?:^|/)(firmware/(?:app/src|lib/zplc_core/src)/.+\.c)$")
APP_UNITS = re.compile(r"^firmware/app/")

# Flags of the GCC cross toolchains that clang does not know, or knows as an error. Optimisation flags only change
# code generation; the analysis does not need them.
GCC_ONLY_FLAGS = re.compile(
    r"^(?:-fno-defer-pop|-fno-printf-return-value|-fno-reorder-functions|-mfp16-format=.*|--param=.*|-specs=.*"
    r"|-fno-tree-.*|-fno-ipa-.*|-fno-gcse.*|-Werror(?:=.*)?)$"
)
# GCC cross compiler prefix -> clang triple. A prefix that is not here cannot be analysed with clang.
TRIPLES = {
    "arm-zephyr-eabi": "arm-none-eabi",
    "riscv64-zephyr-elf": "riscv64-unknown-elf",
}
FINDING = re.compile(r"^(?P<path>/\S.*?):(?P<line>\d+):(?P<column>\d+): (?:warning|error): (?P<message>.*) \[(?P<checks>[^\]]+)\]$")


@dataclass(frozen=True)
class Finding:
    path: str  # repository relative, from firmware/
    line: int
    column: int
    check: str
    message: str


def relative_to_firmware(path: str) -> str | None:
    """`.../firmware/app/src/main.c` -> `firmware/app/src/main.c`, whichever checkout the path is in."""
    match = re.search(r"(?:^|/)(firmware/.+)$", path.replace("\\", "/"))
    return match.group(1) if match else None


def host_units(database: list[dict]) -> list[str]:
    """Distinct source files of the host build that the host pass analyses, sorted."""
    return sorted({entry["file"] for entry in database if HOST_UNITS.search(entry["file"].replace("\\", "/"))})


def rewrite_for_clang(entry: dict) -> dict | None:
    """The compile command of a GCC cross build as a clang command, or None when clang has no such target."""
    tokens = shlex.split(entry["command"]) if "command" in entry else list(entry["arguments"])
    compiler = os.path.basename(tokens[0])
    target: list[str] = []
    prefix = re.sub(r"-(?:gcc|g\+\+|cc)(?:-[\d.]+)?$", "", compiler)
    if prefix != compiler and compiler not in {"gcc", "cc", "clang"} and not re.fullmatch(r"(?:x86_64|i[3-6]86)-[\w-]*linux-gnu", prefix):
        triple = TRIPLES.get(prefix)
        if triple is None:
            return None
        target = [f"--target={triple}"]
    rest = [token for token in tokens[1:] if not GCC_ONLY_FLAGS.match(token)]
    arguments = ["clang", *target, "-Qunused-arguments", "-Wno-unknown-warning-option", *rest]
    return {"directory": entry["directory"], "file": entry["file"], "arguments": arguments}


def parse_findings(output: str) -> list[Finding]:
    """Every distinct diagnostic of a clang-tidy run that lies in the firmware tree."""
    found: dict[tuple[str, int, int, str], Finding] = {}
    for line in output.splitlines():
        match = FINDING.match(line)
        if not match:
            continue
        path = relative_to_firmware(match["path"])
        if path is None:
            continue
        checks = [name for name in match["checks"].split(",") if name != "-warnings-as-errors"]
        check = checks[0] if checks else "unknown"
        finding = Finding(path, int(match["line"]), int(match["column"]), check, match["message"])
        found[(path, finding.line, finding.column, check)] = finding
    return sorted(found.values(), key=lambda f: (f.path, f.line, f.column, f.check))


def count_by_file_and_check(findings: Iterable[Finding]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {}
    for finding in findings:
        per_file = counts.setdefault(finding.path, {})
        per_file[finding.check] = per_file.get(finding.check, 0) + 1
    return {path: dict(sorted(checks.items())) for path, checks in sorted(counts.items())}


def compare_with_baseline(current: dict[str, dict[str, int]], baseline: dict[str, dict[str, int]]) -> tuple[list[tuple[str, str, int, int]], list[tuple[str, str, int, int]]]:
    """(errors, improvements) as (path, check, count, baseline): above the baseline is an error, below an improvement."""
    errors: list[tuple[str, str, int, int]] = []
    improvements: list[tuple[str, str, int, int]] = []
    for path, checks in current.items():
        for check, count in checks.items():
            allowed = baseline.get(path, {}).get(check, 0)
            if count > allowed:
                errors.append((path, check, count, allowed))
    for path, checks in baseline.items():
        for check, allowed in checks.items():
            count = current.get(path, {}).get(check, 0)
            if count < allowed:
                improvements.append((path, check, count, allowed))
    return errors, improvements


def run_tidy(tidy: str, database_dir: Path, files: list[str], jobs: int) -> tuple[list[Finding], list[str]]:
    """clang-tidy over each file; returns the findings and the raw output of runs that failed without a finding."""
    def one(path: str) -> tuple[int, str]:
        done = subprocess.run(
            [tidy, "-p", str(database_dir), f"--config-file={CONFIG}", "--quiet", path],
            capture_output=True, text=True, cwd=REPO, check=False,
        )
        return done.returncode, done.stdout + done.stderr

    findings: list[Finding] = []
    unexplained: list[str] = []
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        for path, (status, output) in zip(files, pool.map(one, files)):
            parsed = parse_findings(output)
            findings.extend(parsed)
            if status != 0 and not parsed:
                unexplained.append(f"{path}: clang-tidy exited {status}\n{output.strip()}")
    return sorted(set(findings), key=lambda f: (f.path, f.line, f.column, f.check)), unexplained


def report(findings: list[Finding]) -> None:
    for finding in findings:
        print(f"{finding.path}:{finding.line}:{finding.column}: {finding.check}: {finding.message}")


def host_pass(tidy: str, build_dir: Path | None, jobs: int) -> int:
    with tempfile.TemporaryDirectory(prefix="zplc-tidy-") as scratch:
        directory = build_dir or Path(scratch)
        configure = subprocess.run(
            ["cmake", "-S", str(REPO / "firmware/lib/zplc_core"), "-B", str(directory), "-DCMAKE_BUILD_TYPE=Debug",
             "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON"],
            capture_output=True, text=True, check=False,
        )
        if configure.returncode != 0:
            print(configure.stdout + configure.stderr, file=sys.stderr)
            print("clang-tidy: cmake could not configure firmware/lib/zplc_core", file=sys.stderr)
            return 2
        database = json.loads((directory / "compile_commands.json").read_text())
        files = host_units(database)
        if not files:
            print("clang-tidy: the host build lists no translation unit to analyse", file=sys.stderr)
            return 2
        print(f"clang-tidy: host pass, {len(files)} files of the core, the POSIX HAL and the host application")
        findings, unexplained = run_tidy(tidy, directory, files, jobs)
    report(findings)
    for text in unexplained:
        print(text, file=sys.stderr)
    if findings or unexplained:
        print(f"clang-tidy: host pass FAILED, {len(findings)} findings", file=sys.stderr)
        return 1
    print("clang-tidy: host pass clean")
    return 0


def zephyr_pass(tidy: str, build: Path, board: str, jobs: int, update_baseline: bool) -> int:
    source = build / "compile_commands.json"
    if not source.is_file():
        print(f"clang-tidy: no compile_commands.json in {build}; run `west build` for firmware/app first", file=sys.stderr)
        return 2
    rewritten: list[dict] = []
    skipped: list[str] = []
    for entry in json.loads(source.read_text()):
        relative = relative_to_firmware(entry["file"])
        if relative is None or not ZEPHYR_UNITS.search(entry["file"]):
            continue
        converted = rewrite_for_clang(entry)
        if converted is None:
            skipped.append(relative)
        else:
            rewritten.append(converted)
    if skipped:
        print(f"clang-tidy: Zephyr pass skips {len(skipped)} files built with a compiler that clang cannot target")
    if not rewritten:
        print("clang-tidy: the Zephyr build holds no ZPLC translation unit that clang can analyse; pass skipped")
        return 0
    with tempfile.TemporaryDirectory(prefix="zplc-tidy-zephyr-") as scratch:
        (Path(scratch) / "compile_commands.json").write_text(json.dumps(rewritten))
        files = sorted({entry["file"] for entry in rewritten})
        print(f"clang-tidy: Zephyr pass, {len(files)} files of the firmware application, the Zephyr HAL and the core ({build.name})")
        findings, unexplained = run_tidy(tidy, Path(scratch), files, jobs)
    for text in unexplained:
        print(text, file=sys.stderr)
    app = [f for f in findings if APP_UNITS.match(f.path)]
    strict = [f for f in findings if not APP_UNITS.match(f.path)]
    report(strict)
    status = 1 if strict or unexplained else 0
    if strict:
        print(f"clang-tidy: Zephyr pass FAILED, {len(strict)} findings in the core and the Zephyr HAL", file=sys.stderr)
    current = count_by_file_and_check(app)
    recorded = json.loads(BASELINE.read_text()) if BASELINE.is_file() else {"boards": {}}
    if update_baseline:
        recorded["boards"][board] = current
        recorded["boards"] = dict(sorted(recorded["boards"].items()))
        BASELINE.write_text(json.dumps(recorded, indent=2) + "\n")
        print(f"clang-tidy: baseline of firmware/app for {board} written ({sum(sum(c.values()) for c in current.values())} findings)")
        return status
    known = recorded["boards"].get(board, {})
    errors, improvements = compare_with_baseline(current, known)
    for path, check, count, allowed in errors:
        print(f"clang-tidy: firmware/app is above its baseline: {path} has {count} x {check}, the baseline allows {allowed}", file=sys.stderr)
        for finding in app:
            if finding.path == path and finding.check == check:
                print(f"    {finding.path}:{finding.line}:{finding.column}: {finding.message}", file=sys.stderr)
    for path, check, count, allowed in improvements:
        print(f"clang-tidy: firmware/app improved, lower the baseline with --update-baseline: {path} has {count} x {check}, the baseline lists {allowed}")
    tolerated = sum(sum(c.values()) for c in known.values())
    print(f"clang-tidy: firmware/app {sum(sum(c.values()) for c in current.values())} findings, {tolerated} in the baseline of {board}")
    return 1 if errors else status


def tidy_version(binary: str) -> str | None:
    """The `X.Y.Z` that `binary --version` prints, or None."""
    try:
        out = subprocess.run([binary, "--version"], capture_output=True, text=True, check=False).stdout
    except OSError:
        return None
    found = re.search(r"version (\d+\.\d+\.\d+)", out)
    return found.group(1) if found else None


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--clang-tidy", default=os.environ.get("CLANG_TIDY", "clang-tidy"))
    parser.add_argument("--zephyr-build", default=os.environ.get("ZPLC_TIDY_ZEPHYR_BUILD"), help="west build directory of firmware/app")
    parser.add_argument("--build-dir", type=Path, help="keep the host CMake configuration here instead of a temporary directory")
    parser.add_argument("--zephyr-only", action="store_true", help="skip the host pass (it runs in its own CI job)")
    parser.add_argument("--board", help="name of the board in the baseline (default: the name of the build directory)")
    parser.add_argument("--update-baseline", action="store_true", help="rewrite the firmware/app baseline of the board from this Zephyr pass")
    parser.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    args = parser.parse_args(argv)

    if shutil.which(args.clang_tidy) is None:
        print(f"clang-tidy: {args.clang_tidy} not found (pipx install clang-tidy=={CLANG_TIDY_VERSION})", file=sys.stderr)
        return 2
    found = tidy_version(args.clang_tidy)
    if found != CLANG_TIDY_VERSION:
        print(
            f"clang-tidy: {args.clang_tidy} is version {found}, this repository pins {CLANG_TIDY_VERSION} because the findings change "
            f"between versions (pipx install clang-tidy=={CLANG_TIDY_VERSION})",
            file=sys.stderr,
        )
        return 2
    if shutil.which("cmake") is None:
        print("clang-tidy: cmake not found", file=sys.stderr)
        return 2

    if args.zephyr_only and not args.zephyr_build:
        print("clang-tidy: --zephyr-only needs --zephyr-build", file=sys.stderr)
        return 2
    status = 0 if args.zephyr_only else host_pass(args.clang_tidy, args.build_dir, args.jobs)
    if not args.zephyr_build:
        print(
            "clang-tidy: Zephyr pass skipped, no west build tree. Pass --zephyr-build <dir of `west build -b <board> firmware/app`> "
            "(tools/firmware-test/run.sh size <board> makes one); the Zephyr HAL and firmware/app were not analysed in this run."
        )
        return status
    build = Path(args.zephyr_build)
    return max(status, zephyr_pass(args.clang_tidy, build, args.board or build.resolve().name, args.jobs, args.update_baseline))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
