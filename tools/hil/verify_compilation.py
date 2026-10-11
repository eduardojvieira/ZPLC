"""Compile every language fixture and every reference project source with the repository compiler (a host check, no device).

The artifacts go to a temporary directory that is removed when the run ends. Exits 1 when any source does not compile (HIL-004, HIL-006).
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

from zplc_tester import CLI, ROOT

HIL = os.path.dirname(os.path.abspath(__file__))


def sources():
    """Every fixture of fixtures.json, then the program sources of the reference projects."""
    with open(os.path.join(HIL, "fixtures.json")) as handle:
        listed = [os.path.join(HIL, fixture["source"]) for fixture in json.load(handle)["fixtures"]]
    return listed + sorted(glob.glob(os.path.join(ROOT, "packages/zplc-ide/projects/*/src/main.*")))


def compile_file(bun, source, workdir):
    out = os.path.join(workdir, os.path.basename(source) + ".zplc")
    done = subprocess.run([bun, str(CLI), "compile", source, "-o", out], capture_output=True, text=True, cwd=str(ROOT))
    return done.returncode == 0, (done.stderr or done.stdout).strip()


def main():
    bun = shutil.which("bun")
    if bun is None:
        print("error: bun is not on PATH", file=sys.stderr)
        return 2
    passed = failed = 0
    with tempfile.TemporaryDirectory(prefix="zplc-hil-verify-") as workdir:
        for source in sources():
            ok, message = compile_file(bun, source, workdir)
            print(f"{'OK  ' if ok else 'FAIL'} {os.path.relpath(source, ROOT)}" + ("" if ok else f"\n     {message}"))
            passed, failed = passed + ok, failed + (not ok)
    print(f"Summary: {passed} compiled, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
