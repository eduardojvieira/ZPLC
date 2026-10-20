#!/usr/bin/env bash
# =============================================================================
# Build the firmware images of the emulated HIL bench.
#
#   tools/hil/emulator/build.sh pico      -> $ZPLC_FW_WS/out/emu-pico      (zephyr/zephyr.uf2, zephyr.elf)
#   tools/hil/emulator/build.sh esp32s3   -> $ZPLC_FW_WS/out/emu-esp32s3   (zephyr/zephyr.bin, zephyr.elf)
#
# The Pico image is the shipped profile, unchanged: the manifest's build command.
# The ESP32-S3 image is EMULATION ONLY and must never be flashed or published:
# esp32s3/qemu-only.overlay moves the console to UART0 and turns the ADC off,
# because Espressif QEMU models neither the USB-Serial/JTAG nor the SAR ADC, and
# AI0 is built as optional (its converter is off), from a copy of the board's
# entry in boards.json. Its I/O description hash therefore differs from the
# shipped profile's, and the chain says so.
# =============================================================================
set -euo pipefail
trap 'echo "build.sh: the build failed; the end of its log:" >&2; tail -n 20 "${dir}.log" >&2' ERR

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=../../firmware-test/env.sh
. "${HERE}/../../firmware-test/env.sh"

target="${1:-}"
dir=""
OUT="${ZPLC_FW_WS}/out"
mkdir -p "${OUT}"
if [ "$(readlink "${ZPLC_FW_WS}/zplc" 2> /dev/null || true)" != "${ZPLC_FW_REPO}" ] && [ ! "${ZPLC_FW_WS}/zplc" -ef "${ZPLC_FW_REPO}" ]; then
  echo "build.sh: ${ZPLC_FW_WS}/zplc is not this checkout (${ZPLC_FW_REPO}); make a workspace view for it" >&2
  exit 2
fi

case "${target}" in
  pico)
    dir="${OUT}/emu-pico"
    (cd "${ZPLC_FW_WS}" && west build -p always -b rpi_pico/rp2040 zplc/firmware/app -d "${dir}") > "${dir}.log" 2>&1
    ;;
  esp32s3)
    dir="${OUT}/emu-esp32s3"
    description="${OUT}/emu-esp32s3.io.json"
    python3 -B -I - "${ZPLC_FW_REPO}/firmware/app/boards/boards.json" "${description}" << 'EOF'
import json, sys
board = next(b for b in json.load(open(sys.argv[1])) if b["board_id"] == "esp32-s3-devkitc")
for channel in board["io"]["channels"]:
    if channel["kind"] == "analog":
        channel["optional"] = True  # emulation only: QEMU has no SAR ADC, so adc0 is off
json.dump(board, open(sys.argv[2], "w"), indent=2)
EOF
    (cd "${ZPLC_FW_WS}" && west blobs fetch hal_espressif) > "${dir}.blobs.log" 2>&1 || true
    (cd "${ZPLC_FW_WS}" && west build -p always -b esp32s3_devkitc/esp32s3/procpu zplc/firmware/app -d "${dir}" -- \
      -DEXTRA_DTC_OVERLAY_FILE="${HERE}/esp32s3/qemu-only.overlay" -DZPLC_IO_DESCRIPTION="${description}") \
      > "${dir}.log" 2>&1
    ;;
  *)
    echo "usage: build.sh pico|esp32s3" >&2
    exit 2
    ;;
esac
echo "built ${dir} (log ${dir}.log)"
