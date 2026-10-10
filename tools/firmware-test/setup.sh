#!/usr/bin/env bash
# =============================================================================
# One-time (and repeatable) setup of the ZPLC firmware test workspace.
#
#   tools/firmware-test/setup.sh
#
# Creates or verifies, outside the repository:
#   $ZPLC_FW_WS/.venv          Python venv with west 1.5.0 and Zephyr's tools
#   $ZPLC_FW_WS/zplc           symlink to this checkout (the manifest repo)
#   $ZPLC_FW_WS/.west         west topdir configuration
#   $ZPLC_FW_WS/zephyr, modules/...   the Zephyr tree pinned by west.yml
#
# It installs nothing into the Zephyr SDK and nothing into the repository.
# Every step is safe to repeat: a finished step is verified, not redone.
# Zephyr sources are data: the only code taken from them is what west and
# CMake run for a documented build.
# =============================================================================
set -euo pipefail

# shellcheck source=env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/env.sh"

WEST_VERSION="1.5.0"

say() { printf '==> %s\n' "$*"; }
die() { printf 'setup: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- host tools
need() { command -v "$1" > /dev/null 2>&1 || die "missing host tool: $1 ($2)"; }
need git "install git"
need cmake "Zephyr needs cmake 3.20 or newer"
need ninja "install ninja"
need dtc "install the device tree compiler"
need gperf "install gperf"
need python3 "Zephyr needs Python 3.10 or newer"

python3 -I - <<'PY' || die "Python 3.10 or newer is required"
import sys
sys.exit(0 if sys.version_info >= (3, 10) else 1)
PY

# native_sim/native (32-bit) needs a 32-bit C runtime. Missing it is not fatal:
# the other modes work, and run.sh native32 will say what is missing.
if ! printf 'int main(void){return 0;}\n' | cc -m32 -x c - -o /dev/null 2> /dev/null; then
  say "warning: 'cc -m32' fails; native32 and host32 need the 32-bit libc"
  say "         (Arch: lib32-glibc lib32-gcc-libs, Debian/Ubuntu: gcc-multilib)"
fi

# ----------------------------------------------------------------- Zephyr SDK
[ -d "${ZEPHYR_SDK_INSTALL_DIR}/gnu/arm-zephyr-eabi" ] || die \
  "no arm-zephyr-eabi toolchain under ${ZEPHYR_SDK_INSTALL_DIR}.
  Point ZEPHYR_SDK_INSTALL_DIR at a Zephyr SDK 1.0.1, or install it with
    west sdk install --version 1.0.1 --install-dir <dir> \\
      --gnu-toolchains arm-zephyr-eabi xtensa-espressif_esp32s3_zephyr-elf
  (several hundred MB; this script does not run it)"
if [ ! -d "${ZEPHYR_SDK_INSTALL_DIR}/gnu/xtensa-espressif_esp32s3_zephyr-elf" ]; then
  say "warning: no xtensa-espressif_esp32s3_zephyr-elf toolchain: the esp32s3 size row cannot build"
fi
if [ ! -x "${ZEPHYR_SDK_INSTALL_DIR}/hosttools/sysroots/x86_64-pokysdk-linux/usr/bin/qemu-system-arm" ]; then
  say "warning: no SDK host tools (qemu-system-arm): the qemu-m3 and qemu-m0 modes cannot run"
fi

# ------------------------------------------------------------------ workspace
say "workspace ${ZPLC_FW_WS}"
case "${ZPLC_FW_WS}/" in
  "${ZPLC_FW_REPO}/"*) die "the workspace must be outside the repository (${ZPLC_FW_REPO})" ;;
esac
mkdir -p "${ZPLC_FW_WS}"

# The manifest repository must be a child of the workspace named like
# 'self.path' in west.yml ('zplc'). `west init -l` would resolve a symlink and
# put .west next to the real checkout, so the topdir is written by hand.
if [ -e "${ZPLC_FW_WS}/zplc" ] && [ ! -L "${ZPLC_FW_WS}/zplc" ]; then
  die "${ZPLC_FW_WS}/zplc exists and is not a symlink"
fi
ln -sfn "${ZPLC_FW_REPO}" "${ZPLC_FW_WS}/zplc"
mkdir -p "${ZPLC_FW_WS}/.west"
printf '[manifest]\npath = zplc\nfile = west.yml\n' > "${ZPLC_FW_WS}/.west/config"

# ----------------------------------------------------------------------- venv
if [ ! -x "${ZPLC_FW_WS}/.venv/bin/python3" ]; then
  say "creating the Python venv"
  python3 -m venv "${ZPLC_FW_WS}/.venv"
fi
if [[ "$("${ZPLC_FW_WS}/.venv/bin/west" --version 2> /dev/null || true)" != *"v${WEST_VERSION}" ]]; then
  say "installing west ${WEST_VERSION}"
  "${ZPLC_FW_WS}/.venv/bin/pip" install --quiet "west==${WEST_VERSION}"
fi

# --------------------------------------------------------------- west update
cd "${ZPLC_FW_WS}"
say "west update (shallow; a repeat run only verifies)"
# --narrow with depth 1 fetches the pinned revision of each project and no
# history. Set ZPLC_FW_FULL_CLONE=1 for full history.
if [ "${ZPLC_FW_FULL_CLONE:-0}" = "1" ]; then
  west update
else
  west update --narrow --fetch-opt=--depth=1
fi

PIN="$(west list -f '{revision}' zephyr)"
HEAD_SHA="$(git -C "${ZPLC_FW_WS}/zephyr" rev-parse HEAD)"
[ "${PIN}" = "${HEAD_SHA}" ] || die \
  "zephyr is at ${HEAD_SHA}, west.yml pins ${PIN}. Run 'west update' in ${ZPLC_FW_WS}."
say "zephyr ${HEAD_SHA} matches the west.yml pin"

# `west zephyr-export` writes the Zephyr package into ~/.cmake/packages, which
# every other CMake project of this user can then find. ZEPHYR_BASE is exported
# by env.sh, so the builds here do not need it. Opt in with ZPLC_FW_ZEPHYR_EXPORT=1.
if [ "${ZPLC_FW_ZEPHYR_EXPORT:-0}" = "1" ]; then
  say "west zephyr-export (writes ~/.cmake/packages)"
  west zephyr-export
fi

# ------------------------------------------------------------ Python packages
STAMP="${ZPLC_FW_WS}/.venv/.zplc-packages-${HEAD_SHA}"
if [ ! -f "${STAMP}" ]; then
  say "installing Zephyr's Python requirements (several minutes the first time)"
  west packages pip --install --ignore-venv-check
  : > "${STAMP}"
else
  say "Zephyr's Python requirements already installed for this pin"
fi

say "ready. Next:  tools/firmware-test/run.sh native"
