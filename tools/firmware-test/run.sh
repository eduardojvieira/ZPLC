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

# A build directory configured for another checkout (the workspace is reused across worktrees) makes cmake stop
# with "source does not match the source"; drop it so the next configure starts clean.
fresh_cmake_dir() { # build-dir source-dir
  local build="$1" source="$2" home=""
  if [ -f "${build}/CMakeCache.txt" ]; then
    home="$(awk -F= '/^CMAKE_HOME_DIRECTORY:/ {print $2; exit}' "${build}/CMakeCache.txt")"
    if [ -n "${home}" ] && [ "${home}" != "${source}" ]; then
      rm -rf "${build}"
    fi
  fi
}

# Library mode, for the tests of the helpers above: `ZPLC_FWTEST_LIBRARY=1 . run.sh` defines them and stops here.
if [ "${ZPLC_FWTEST_LIBRARY:-0}" = "1" ]; then
  return 0 2> /dev/null || exit 0
fi

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
  app       host test of firmware/app (Sparkplug encoder) against the nanopb
            output of a board build
  app-native  EMULATION ONLY: firmware/app on native_sim/native/64 with the
            Raspberry Pi Pico channel map on gpio_emul and adc_emul
            (firmware/tests/app_native_emulation), booted and driven through its
            `emu` shell command; also checks that the command cannot be built
            for a shipped board. Not part of `all`
  size      build firmware/app for every supported board, print flash and RAM
            next to size-budget.json, fail when a size is over its budget
            (board ids after "size" restrict it: run.sh size rpi-pico-rp2040)
  tidy      clang-tidy (warnings are errors, .clang-tidy) over the core, the POSIX HAL and the
            host application; also the Zephyr HAL and firmware/app when the Opta build of
            `size` or `app` is in $ZPLC_FW_WS/out. Needs clang-tidy; not part of `all`
  all       every mode above except tidy

Host, QEMU, size and static-analysis results are not hardware evidence.
EOF
}

MODES=()
SIZE_BOARDS=()
last_mode=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help | help) usage; exit 0 ;;
    host | host32 | native | native32 | qemu-m3 | qemu-m0 | app | app-native | size | tidy | all)
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
  fresh_cmake_dir "${build}" "${ZPLC_FW_REPO}/firmware/lib/zplc_core"
  {
    cmake -S "${ZPLC_FW_REPO}/firmware/lib/zplc_core" -B "${build}" -DCMAKE_BUILD_TYPE=Debug \
      -DCMAKE_C_FLAGS="${flags} -fsanitize=address,undefined,float-cast-overflow -fno-sanitize-recover=undefined,float-cast-overflow -fno-omit-frame-pointer" &&
      cmake --build "${build}" --parallel &&
      ASAN_OPTIONS="${asan_opts}" UBSAN_OPTIONS=halt_on_error=1 \
        ctest --test-dir "${build}" --output-on-failure
  } > "${OUT}/${mode}.log" 2>&1 || rc=$?
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
BOARDS_JSON="${ZPLC_FW_REPO}/firmware/app/boards/boards.json"

build_board() { # board-id zephyr-board; log in $OUT/size/<id>.log
  local id="$1" board="$2" logs="${OUT}/size"
  mkdir -p "${logs}"
  echo "==> building firmware/app for ${id} (${board})"
  if [ "${id}" = "esp32-s3-devkitc" ]; then
    (cd "${ZPLC_FW_WS}" && west blobs fetch hal_espressif) > "${logs}/${id}.blobs.log" 2>&1 || true
  fi
  (cd "${ZPLC_FW_WS}" && west build -p always -b "${board}" zplc/firmware/app -d "${logs}/${id}") \
    > "${logs}/${id}.log" 2>&1
}

run_size() {
  local logs="${OUT}/size" rc=0 listed id board wanted b
  mkdir -p "${logs}"
  listed="$(python3 -B -I -c '
import json, sys
for board in json.load(open(sys.argv[1])):
    print(board["board_id"], board["zephyr_board"])
' "${BOARDS_JSON}")"

  while read -r id board; do
    if [ ${#SIZE_BOARDS[@]} -gt 0 ]; then
      wanted=0
      for b in "${SIZE_BOARDS[@]}"; do [ "${b}" = "${id}" ] && wanted=1; done
      [ "${wanted}" -eq 1 ] || continue
    fi
    build_board "${id}" "${board}" || {
      record "FAIL size ${id}: west build failed (see ${logs}/${id}.log)"
      rc=1
    }
  done <<< "${listed}"

  local board_args=()
  for b in ${SIZE_BOARDS[@]+"${SIZE_BOARDS[@]}"}; do board_args+=(--board "${b}"); done
  record_report size --budget "${ZPLC_FW_TOOLS}/size-budget.json" --logs "${logs}" \
    ${board_args[@]+"${board_args[@]}"} || rc=1

  # COM-017: the inbound handlers of every image that was built do not
  # reference the entry points that start, stop, force or load.
  local built=() text line
  while read -r id board; do
    if [ ${#SIZE_BOARDS[@]} -gt 0 ]; then
      wanted=0
      for b in "${SIZE_BOARDS[@]}"; do [ "${b}" = "${id}" ] && wanted=1; done
      [ "${wanted}" -eq 1 ] || continue
    fi
    [ -d "${logs}/${id}" ] && built+=("${logs}/${id}")
  done <<< "${listed}"
  if [ ${#built[@]} -gt 0 ]; then
    text="$(python3 -B -I "${ZPLC_FW_TOOLS}/check_inbound_authority.py" "${built[@]}")" || rc=1
    while IFS= read -r line; do
      [ -n "${line}" ] && record "${line}"
    done <<< "${text}"
  fi
  return "${rc}"
}

# ----------------------------------------------------------------------- app
# firmware/app/tests is a plain CMake project that needs the nanopb sources and
# the protobuf files a Zephyr build generates. A board that enables MQTT has
# them; the Arduino Opta build is the one used here.
run_app() {
  local id="arduino-opta-wifi-m7" board="arduino_opta/stm32h747xx/m7" rc=0
  local proto="${OUT}/size/${id}/proto" build="${OUT}/app-build"
  if [ ! -f "${proto}/sparkplug_b.pb.h" ]; then
    build_board "${id}" "${board}" || {
      record "FAIL app: the ${id} build that generates the protobuf files failed (see ${OUT}/size/${id}.log)"
      return 1
    }
  fi
  echo "==> app: cmake + ctest of firmware/app/tests"
  fresh_cmake_dir "${build}" "${ZPLC_FW_REPO}/firmware/app/tests"
  {
    cmake -S "${ZPLC_FW_REPO}/firmware/app/tests" -B "${build}" \
      -DNANOPB_DIR="${ZPLC_FW_WS}/modules/lib/nanopb" -DPROTO_BUILD_DIR="${proto}" &&
      cmake --build "${build}" --parallel &&
      ctest --test-dir "${build}" --output-on-failure
  } > "${OUT}/app.log" 2>&1 || rc=$?
  if [ "${rc}" -eq 0 ]; then
    record "PASS app  ctest test_encode_sparkplug_payload (host, against the ${id} nanopb output)"
  else
    record "FAIL app  ctest failed (see ${OUT}/app.log)"
  fi
  return "${rc}"
}

# ---------------------------------------------------------------- app-native
# HIL-015 and the emulated bench: firmware/app on native_sim with the Pico's I/O description and an `emu` shell command
# that stands in for the bench wiring. The command lives in an out-of-tree module that only this mode adds, and its
# build stops for any other board: the second build below proves it on rpi_pico/rp2040.
run_app_native() {
  local emu="${ZPLC_FW_REPO}/firmware/tests/app_native_emulation" dir="${OUT}/app-native" rc=0
  local description="${OUT}/app-native.io.json" guard_conf="${OUT}/app-native-guard.conf"
  python3 -B -I -c '
import json, sys
board = next(b for b in json.load(open(sys.argv[1])) if b["board_id"] == "rpi-pico-rp2040")
json.dump(board, open(sys.argv[2], "w"), indent=2)
' "${BOARDS_JSON}" "${description}"
  echo "==> app-native: firmware/app on native_sim/native/64 with the Pico channel map (emulation only)"
  fresh_cmake_dir "${dir}" "${ZPLC_FW_REPO}/firmware/app"
  if ! (cd "${ZPLC_FW_WS}" && west build -p always -b native_sim/native/64 zplc/firmware/app -d "${dir}" --     -DEXTRA_DTC_OVERLAY_FILE="${emu}/native_sim.overlay" -DEXTRA_CONF_FILE="${emu}/emulation.conf"     -DEXTRA_ZEPHYR_MODULES="${emu}/module" -DZPLC_IO_DESCRIPTION="${description}") > "${OUT}/app-native.log" 2>&1; then
    record "FAIL app-native west build failed (see ${OUT}/app-native.log)"
    return 1
  fi
  if python3 -B "${ZPLC_FW_REPO}/tools/hil/emulator/native_sim.py" --check "${dir}/zephyr/zephyr.exe" >> "${OUT}/app-native.log" 2>&1; then
    record "PASS app-native native_sim boots with the Pico channel map; emu drives GP15 and ADC0 and reads the outputs"
  else
    record "FAIL app-native the native_sim image did not pass its boot check (see ${OUT}/app-native.log)"
    rc=1
  fi
  printf 'CONFIG_ZPLC_EMU_SHELL=y
' > "${guard_conf}"
  if (cd "${ZPLC_FW_WS}" && west build -p always -b rpi_pico/rp2040 zplc/firmware/app -d "${OUT}/app-native-guard"     --cmake-only -- -DEXTRA_ZEPHYR_MODULES="${emu}/module" -DEXTRA_CONF_FILE="${guard_conf}") > "${OUT}/app-native-guard.log" 2>&1; then
    record "FAIL app-native the emu command configured for rpi_pico/rp2040: its guard did not stop the build"
    rc=1
  elif [[ "$(< "${OUT}/app-native-guard.log")" == *"CONFIG_ZPLC_EMU_SHELL is for native_sim only"* ]]; then
    record "PASS app-native guard: enabling the emu command for rpi_pico/rp2040 stops the build"
  else
    record "FAIL app-native the guard build failed for another reason (see ${OUT}/app-native-guard.log)"
    rc=1
  fi
  return "${rc}"
}

# ---------------------------------------------------------------------- tidy
# VF-018: the host pass always runs. The Zephyr pass needs the compile database of a west build, so it runs only when
# the Opta build of `size` or `app` (the board that has MQTT, Modbus and the shell) is already in the output directory.
run_tidy() {
  local tree="${OUT}/size/arduino-opta-wifi-m7" rc=0 zephyr=() text
  if [ -f "${tree}/compile_commands.json" ]; then zephyr=(--zephyr-build "${tree}"); fi
  echo "==> tidy: clang-tidy over the core, the POSIX HAL and the host application${zephyr[0]:+, and the Zephyr build ${tree}}"
  python3 -B "${ZPLC_FW_REPO}/tools/ci/run_clang_tidy.py" ${zephyr[@]+"${zephyr[@]}"} > "${OUT}/tidy.log" 2>&1 || rc=$?
  text="$(tail -n 4 "${OUT}/tidy.log")"
  if [ "${rc}" -eq 0 ]; then
    if [[ "${text}" == *"Zephyr pass skipped"* ]]; then
      record "PASS tidy clang-tidy clean on the core, the POSIX HAL and the host application; Zephyr pass skipped, no west build tree"
    else
      record "PASS tidy clang-tidy clean on the core, the POSIX HAL, the host application and the Zephyr build"
    fi
  elif [ "${rc}" -eq 2 ]; then
    record "FAIL tidy clang-tidy could not run (see ${OUT}/tidy.log)"
  else
    record "FAIL tidy clang-tidy reported findings (see ${OUT}/tidy.log)"
  fi
  return "${rc}"
}

# ---------------------------------------------------------------------- main
expand_modes() {
  local m
  for m in "${MODES[@]}"; do
    if [ "${m}" = "all" ]; then
      printf '%s\n' host host32 native native32 qemu-m3 qemu-m0 size app
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
    app) run_app || rc=$? ;;
    app-native) run_app_native || rc=$? ;;
    size) run_size || rc=$? ;;
    tidy) run_tidy || rc=$? ;;
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
