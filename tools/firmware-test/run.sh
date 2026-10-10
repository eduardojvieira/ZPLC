#!/usr/bin/env bash
# =============================================================================
# Run the ZPLC firmware tests on this machine.
#
#   tools/firmware-test/run.sh <mode> [mode ...]
#
# Exit status is non-zero when any mode fails. One summary line per scenario or
# board is printed at the end. All output goes under $ZPLC_FW_WS/out, never
# into the repository. Run `run.sh --help` for the modes.
# =============================================================================
set -uo pipefail

# shellcheck source=env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/env.sh"

usage() {
  cat << 'EOF'
usage: tools/firmware-test/run.sh <mode> [mode ...]

modes (what each one proves: docs/docs/development/firmware-testing.md):
  host      core suites on the 64-bit host: CMake + ctest, ASan and UBSan
  host32    the same built with -m32
  native    Zephyr suites (firmware/tests) on native_sim/native/64
  native32  Zephyr suites on native_sim/native, the 32-bit variant
  qemu-m3   Zephyr suites on qemu_cortex_m3 (Cortex-M3 under QEMU)
  qemu-m0   the Cortex-M0 subset on qemu_cortex_m0 (16 KB of RAM)
  size      build firmware/app for every supported board, print flash and RAM
            next to size-budget.json, fail when a size is over its budget
            (board ids after "size" restrict it: run.sh size rpi-pico-rp2040)
  all       every mode above

Host, QEMU and size results are not hardware evidence.
EOF
}

MODES=()
SIZE_BOARDS=()
last_mode=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help | help) usage; exit 0 ;;
    host | host32 | native | native32 | qemu-m3 | qemu-m0 | size | all)
      MODES+=("$1")
      last_mode="$1"
      ;;
    *)
      if [ "${last_mode}" = "size" ]; then
        SIZE_BOARDS+=("$1")
      else
        echo "run.sh: unknown mode '$1' (try --help)" >&2
        exit 2
      fi
      ;;
  esac
  shift
done
if [ ${#MODES[@]} -eq 0 ]; then usage; exit 2; fi

OUT="${ZPLC_FW_WS}/out"
SUMMARY_FILE="${OUT}/summary.txt"
FAILED=0
RESULTS=()

if [ ! -f "${ZEPHYR_BASE}/VERSION" ]; then
  echo "run.sh: no Zephyr tree at ${ZEPHYR_BASE}. Run tools/firmware-test/setup.sh first." >&2
  exit 2
fi

# The manifest repository of the workspace must be this checkout. A workspace
# set up from another checkout of the repository is re-pointed (a symlink
# change, not a download). In CI the checkout itself is ${ZPLC_FW_WS}/zplc.
if [ -L "${ZPLC_FW_WS}/zplc" ] || [ ! -e "${ZPLC_FW_WS}/zplc" ]; then
  if [ "$(readlink "${ZPLC_FW_WS}/zplc" 2> /dev/null || true)" != "${ZPLC_FW_REPO}" ]; then
    echo "==> pointing ${ZPLC_FW_WS}/zplc at ${ZPLC_FW_REPO}"
    ln -sfn "${ZPLC_FW_REPO}" "${ZPLC_FW_WS}/zplc"
  fi
elif [ ! "${ZPLC_FW_WS}/zplc" -ef "${ZPLC_FW_REPO}" ]; then
  echo "run.sh: ${ZPLC_FW_WS}/zplc is a directory that is not this checkout (${ZPLC_FW_REPO})" >&2
  exit 2
fi
mkdir -p "${OUT}"
: > "${SUMMARY_FILE}"

record() {
  RESULTS+=("$1")
  printf '%s\n' "$1" >> "${SUMMARY_FILE}"
}

fwtest() { python3 -B -I "${ZPLC_FW_TOOLS}/fwtest.py" "$@"; }

# Print and record every line of a fwtest report; return its exit status.
record_report() {
  local text rc=0 line
  text="$(fwtest "$@")" || rc=$?
  while IFS= read -r line; do
    [ -n "${line}" ] && record "${line}"
  done <<< "${text}"
  return "${rc}"
}

# ------------------------------------------------------------------- twister
run_twister() { # mode platform
  local mode="$1" platform="$2" dir="${OUT}/twister-$1" rc=0
  echo "==> ${mode}: west twister on ${platform}"
  (cd "${ZPLC_FW_WS}" && west twister -T zplc/firmware/tests -p "${platform}" \
    --inline-logs --clobber-output --outdir "${dir}") > "${OUT}/${mode}.log" 2>&1 || rc=$?
  if [ -f "${dir}/twister.json" ]; then
    record_report twister "${mode}" "${dir}/twister.json" || rc=1
  else
    record "FAIL ${mode} twister produced no report (see ${OUT}/${mode}.log)"
    rc=1
  fi
  return "${rc}"
}

# ---------------------------------------------------------------------- host
run_host() { # mode extra-flags
  local mode="$1" flags="$2" build="${OUT}/$1-build" rc=0
  local asan_opts="detect_leaks=1"
  # LeakSanitizer does not exist for i386.
  [ "${mode}" = "host32" ] && asan_opts="detect_leaks=0"
  echo "==> ${mode}: cmake + ctest of firmware/lib/zplc_core"
  (
    set -e
    cmake -S "${ZPLC_FW_REPO}/firmware/lib/zplc_core" -B "${build}" -DCMAKE_BUILD_TYPE=Debug \
      -DCMAKE_C_FLAGS="${flags} -fsanitize=address,undefined,float-cast-overflow -fno-sanitize-recover=undefined,float-cast-overflow -fno-omit-frame-pointer"
    cmake --build "${build}" --parallel
    ASAN_OPTIONS="${asan_opts}" UBSAN_OPTIONS=halt_on_error=1 \
      ctest --test-dir "${build}" --output-on-failure
  ) > "${OUT}/${mode}.log" 2>&1 || rc=$?
  local summary
  summary="$(tail -n 12 "${OUT}/${mode}.log" | tr '\n' ' ')"
  if [ "${rc}" -eq 0 ]; then
    local total=""
    if [[ "${summary}" =~ out\ of\ ([0-9]+) ]]; then total="${BASH_REMATCH[1]}"; fi
    record "PASS ${mode} ctest ${total:-?}/${total:-?} suites, sanitized (core, loader, dispatch, host runtime)"
  else
    record "FAIL ${mode} ctest failed (see ${OUT}/${mode}.log)"
  fi
  return "${rc}"
}

# ---------------------------------------------------------------------- size
run_size() {
  local boards_json="${ZPLC_FW_REPO}/firmware/app/boards/supported-boards.v1.5.0.json"
  local logs="${OUT}/size" rc=0 listed id board wanted b
  mkdir -p "${logs}"
  listed="$(python3 -B -I -c '
import json, sys
for board in json.load(open(sys.argv[1])):
    print(board["board_id"], board["zephyr_board"])
' "${boards_json}")"

  while read -r id board; do
    if [ ${#SIZE_BOARDS[@]} -gt 0 ]; then
      wanted=0
      for b in "${SIZE_BOARDS[@]}"; do [ "${b}" = "${id}" ] && wanted=1; done
      [ "${wanted}" -eq 1 ] || continue
    fi
    echo "==> size: building firmware/app for ${id} (${board})"
    if [ "${id}" = "esp32-s3-devkitc" ]; then
      (cd "${ZPLC_FW_WS}" && west blobs fetch hal_espressif) > "${logs}/${id}.blobs.log" 2>&1 || true
    fi
    (cd "${ZPLC_FW_WS}" && west build -p always -b "${board}" zplc/firmware/app -d "${logs}/${id}") \
      > "${logs}/${id}.log" 2>&1 || {
      record "FAIL size ${id}: west build failed (see ${logs}/${id}.log)"
      rc=1
    }
  done <<< "${listed}"

  local board_args=()
  for b in ${SIZE_BOARDS[@]+"${SIZE_BOARDS[@]}"}; do board_args+=(--board "${b}"); done
  record_report size --budget "${ZPLC_FW_TOOLS}/size-budget.json" --logs "${logs}" \
    ${board_args[@]+"${board_args[@]}"} || rc=1
  return "${rc}"
}

# ---------------------------------------------------------------------- main
expand_modes() {
  local m
  for m in "${MODES[@]}"; do
    if [ "${m}" = "all" ]; then
      printf '%s\n' host host32 native native32 qemu-m3 qemu-m0 size
    else
      printf '%s\n' "${m}"
    fi
  done
}

START_ALL="$(date +%s)"
while IFS= read -r mode; do
  start="$(date +%s)"
  rc=0
  case "${mode}" in
    host) run_host host "" || rc=$? ;;
    host32) run_host host32 "-m32" || rc=$? ;;
    native) run_twister native native_sim/native/64 || rc=$? ;;
    native32) run_twister native32 native_sim/native || rc=$? ;;
    qemu-m3) run_twister qemu-m3 qemu_cortex_m3 || rc=$? ;;
    qemu-m0) run_twister qemu-m0 qemu_cortex_m0 || rc=$? ;;
    size) run_size || rc=$? ;;
  esac
  [ "${rc}" -eq 0 ] || FAILED=1
  echo "==> ${mode}: exit ${rc}, $(($(date +%s) - start)) s"
done < <(expand_modes)

echo
echo "=============================== summary ================================"
if [ ${#RESULTS[@]} -gt 0 ]; then printf '%s\n' "${RESULTS[@]}"; fi
echo "------------------------------------------------------------------------"
echo "total $(($(date +%s) - START_ALL)) s: $([ "${FAILED}" -eq 0 ] && echo PASS || echo FAIL); output in ${OUT}"
exit "${FAILED}"
