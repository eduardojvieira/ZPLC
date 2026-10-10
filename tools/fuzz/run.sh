#!/usr/bin/env bash
# Build the two libFuzzer targets with Clang and the address and undefined-behaviour sanitizers, and run them
# (VF-014). Exits non-zero when a target finds anything and leaves the reproducer files in the artifact directory.
#
#   tools/fuzz/run.sh [seconds] [loader|run|both]
#
#   seconds   time per target, default 60 (the pull-request gate; the nightly run passes 1800 or more)
#   target    loader: zplc_loader_verify on mutated containers (the CRC is repaired so mutations reach the verifier)
#             run:    load accepted artifacts, run them for a few scans under the sanitizers and check the
#                     invariants listed in firmware/lib/zplc_core/tests/fuzz_run_program.c
#             both:   the two, in parallel (default)
#
# Environment (all optional):
#   ZPLC_FUZZ_WORK        build and corpus directory (default: a fresh temporary directory)
#   ZPLC_FUZZ_ARTIFACTS   where reproducers are saved (default: $ZPLC_FUZZ_WORK/artifacts)
#   ZPLC_FUZZ_JOBS        fuzzing processes per target; above 1 libFuzzer runs in fork mode and keeps going after
#                         a finding, so one run lists every distinct finding (default 1)
#   ZPLC_FUZZ_SEED        libFuzzer seed, for a repeatable run (default: random)
#   ZPLC_FUZZ_SKIP_COMM   1: the run target skips programs that use the communication opcodes (known gap, RT-001,
#                         COM-001), so that a long run can look for other findings
#   CC                    Clang to use (default clang)
#
# The seed corpus is tools/fuzz/seed-corpus.json (artifacts of the repository compiler for every example project
# and conformance case; regenerate with `bun tools/fuzz/seed-corpus.ts`) plus the loader test fixture. The
# dictionary is generated from tools/contract/contract.json by tools/fuzz/make_dict.py.
set -euo pipefail

seconds="${1:-60}"
targets="${2:-both}"
case "$targets" in loader | run | both) ;; *) echo "usage: $0 [seconds] [loader|run|both]" >&2; exit 2 ;; esac
case "$seconds" in '' | *[!0-9]*) echo "seconds must be a whole number" >&2; exit 2 ;; esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="${ZPLC_FUZZ_WORK:-$(mktemp -d "${TMPDIR:-/tmp}/zplc-fuzz.XXXXXX")}"
artifacts="${ZPLC_FUZZ_ARTIFACTS:-$work/artifacts}"
jobs="${ZPLC_FUZZ_JOBS:-1}"
cc="${CC:-clang}"
mkdir -p "$work" "$artifacts"

command -v "$cc" > /dev/null || { echo "run.sh: $cc not found (the fuzz targets need Clang with libFuzzer)" >&2; exit 2; }
command -v cmake > /dev/null || { echo "run.sh: cmake not found" >&2; exit 2; }
command -v python3 > /dev/null || { echo "run.sh: python3 not found" >&2; exit 2; }

generator=()
command -v ninja > /dev/null && generator=(-G Ninja)
cmake -S "$root/firmware/lib/zplc_core" -B "$work/build" ${generator[@]+"${generator[@]}"} -DCMAKE_C_COMPILER="$cc" \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo -DZPLC_BUILD_FUZZER=ON > "$work/configure.log" 2>&1 \
  || { cat "$work/configure.log" >&2; exit 2; }
cmake --build "$work/build" --target fuzz_loader_verify fuzz_run_program --parallel > "$work/build.log" 2>&1 \
  || { cat "$work/build.log" >&2; exit 2; }

# Seed corpus: one directory both targets read (a target only adds what reaches new coverage to it).
corpus="$work/corpus"
rm -rf "$corpus"
mkdir -p "$corpus"
python3 - "$root" "$corpus" << 'PY'
import json, sys
from pathlib import Path

root, corpus = Path(sys.argv[1]), Path(sys.argv[2])
pack = json.loads((root / "tools/fuzz/seed-corpus.json").read_text())
assert pack["schema"] == 1
for name, hexed in pack["artifacts"].items():
    (corpus / name).write_bytes(bytes.fromhex(hexed))
fixture = root / "firmware/lib/zplc_core/tests/fixtures/zplc-v1-code-task-tags.hex"
(corpus / "fixture-code-task-tags.zplc").write_bytes(bytes.fromhex(fixture.read_text()))
# Reproducers of findings are regression seeds: a fixed defect that comes back fails the next run at once.
regressions = sorted((root / "tools/fuzz/findings").glob("*.zplc"))
for path in regressions:
    (corpus / ("finding-" + path.name)).write_bytes(path.read_bytes())
print("seed corpus: %d compiler artifacts, 1 fixture, %d finding reproducers" % (len(pack["artifacts"]), len(regressions)))
PY
python3 "$root/tools/fuzz/make_dict.py" > "$work/zplc.dict"

export ASAN_OPTIONS="${ASAN_OPTIONS:-detect_leaks=1:abort_on_error=0:symbolize=1}"
export UBSAN_OPTIONS="${UBSAN_OPTIONS:-halt_on_error=1:print_stacktrace=1}"

fork_flags=()
if [ "$jobs" -gt 1 ]; then
  fork_flags=("-fork=$jobs" -ignore_crashes=1 -ignore_timeouts=1 -ignore_ooms=1)
fi
seed_flags=()
[ -n "${ZPLC_FUZZ_SEED:-}" ] && seed_flags=("-seed=$ZPLC_FUZZ_SEED")

pids=()
names=()
launch() { # name, binary, max_len
  local name="$1" binary="$2" max_len="$3"
  # A private copy of the corpus per target: they both add to it.
  cp -R "$corpus" "$work/corpus-$name"
  (cd "$work" && exec "$binary" "$work/corpus-$name" -dict="$work/zplc.dict" -max_len="$max_len" -timeout=5 -rss_limit_mb=2048 \
    -max_total_time="$seconds" -artifact_prefix="$artifacts/$name-" -print_final_stats=1 \
    ${fork_flags[@]+"${fork_flags[@]}"} ${seed_flags[@]+"${seed_flags[@]}"}) > "$work/$name.log" 2>&1 &
  pids+=("$!")
  names+=("$name")
}

[ "$targets" = loader ] || [ "$targets" = both ] && launch loader "$work/build/fuzz_loader_verify" 65536
[ "$targets" = run ] || [ "$targets" = both ] && launch run "$work/build/fuzz_run_program" 6144

status=0
for index in "${!pids[@]}"; do
  if ! wait "${pids[$index]}"; then
    status=1
  fi
done

# libFuzzer reports in its own log: print what each target covered and executed.
for name in "${names[@]}"; do
  echo "== $name: $(grep -E 'cov: [0-9]+ ft: [0-9]+' "$work/$name.log" | tail -1)"
  grep -E '^stat::(number_of_executed_units|average_exec_per_sec|new_units_added)' "$work/$name.log" | sed 's/^/   /' || true
  grep -E '^fuzz_run_program:' "$work/$name.log" | tail -1 || true
done

findings=$(find "$artifacts" -maxdepth 1 -type f \( -name '*-crash-*' -o -name '*-leak-*' -o -name '*-timeout-*' -o -name '*-oom-*' \) | wc -l)
if [ "$findings" -gt 0 ]; then
  status=1
fi
if [ "$status" -ne 0 ]; then
  echo "run.sh: FINDINGS ($findings reproducer files in $artifacts); logs in $work" >&2
  for name in "${names[@]}"; do
    grep -E 'INVARIANT VIOLATED|ERROR: (AddressSanitizer|LeakSanitizer)|runtime error|SUMMARY' "$work/$name.log" | sort | uniq -c | head -10 >&2 || true
  done
  # The reproducers are small: print the first few as base64 so that a CI log alone is enough to replay them
  # (base64 -d > file; fuzz_run_program file).
  count=0
  for file in "$artifacts"/*; do
    [ -f "$file" ] || continue
    count=$((count + 1))
    [ "$count" -le 5 ] || break
    echo "--- reproducer $(basename "$file") ($(wc -c < "$file") bytes)" >&2
    base64 "$file" >&2
  done
  exit 1
fi
echo "run.sh: no findings in ${seconds}s per target (work directory $work)"
