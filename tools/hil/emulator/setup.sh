#!/usr/bin/env bash
# =============================================================================
# Install the emulators of the emulated HIL bench, outside the repository.
#
#   bash tools/hil/emulator/setup.sh
#
# Into $ZPLC_EMU_DIR (default ~/zplc-emu):
#   rp2040js/   wokwi/rp2040js at a pinned commit (MIT), with the vendored patch
#               rp2040js-zplc-emu.patch applied and its npm dependencies
#               installed with `npm ci --ignore-scripts` (in that folder only)
#   qemu-esp/   the Espressif QEMU release (GPL-2.0), checked against its SHA-256
#
# Nothing is added to the repository's package.json or lockfile. A second run
# changes nothing. See tools/hil/emulator/README.md.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
EMU="${ZPLC_EMU_DIR:-${HOME}/zplc-emu}"

RP2040JS_URL="https://github.com/wokwi/rp2040js.git"
RP2040JS_COMMIT="5fbd20508a58b9859758c5cd70b207ba1e0b0150" # v1.4.1-3-g5fbd205
PATCH="${HERE}/rp2040js-zplc-emu.patch"

QEMU_VERSION="esp_develop_9.2.2_20260417"
QEMU_TARBALL="qemu-xtensa-softmmu-${QEMU_VERSION}-x86_64-linux-gnu.tar.xz"
QEMU_URL="https://github.com/espressif/qemu/releases/download/esp-develop-9.2.2-20260417/${QEMU_TARBALL}"
QEMU_SHA256="0eecb2a34a5586c0e59110f77b9343b7b336e82fdb0e1a30e1dc1bab8a547e35"

say() { printf '==> %s\n' "$*"; }

mkdir -p "${EMU}"

# ------------------------------------------------------------------ rp2040js
RP="${EMU}/rp2040js"
if [ ! -d "${RP}/.git" ]; then
  say "cloning rp2040js into ${RP}"
  git clone --quiet "${RP2040JS_URL}" "${RP}"
fi
if [ "$(git -C "${RP}" rev-parse HEAD)" != "${RP2040JS_COMMIT}" ]; then
  if [ -n "$(git -C "${RP}" status --porcelain --untracked-files=no)" ]; then
    echo "setup.sh: ${RP} has local changes and is not at ${RP2040JS_COMMIT}; move it aside and run again" >&2
    exit 1
  fi
  say "checking out rp2040js ${RP2040JS_COMMIT}"
  git -C "${RP}" fetch --quiet origin "${RP2040JS_COMMIT}" 2> /dev/null || git -C "${RP}" fetch --quiet origin
  git -C "${RP}" checkout --quiet --detach "${RP2040JS_COMMIT}"
fi
if git -C "${RP}" apply --reverse --check "${PATCH}" 2> /dev/null; then
  say "rp2040js patch already applied"
elif git -C "${RP}" apply --check "${PATCH}"; then
  say "applying ${PATCH##*/}"
  git -C "${RP}" apply "${PATCH}"
else
  echo "setup.sh: ${PATCH} applies neither forwards nor backwards to ${RP}; reset that clone (git -C ${RP} checkout .)" >&2
  exit 1
fi
if [ -f "${RP}/node_modules/.package-lock.json" ] && [ "${RP}/node_modules/.package-lock.json" -nt "${RP}/package-lock.json" ]; then
  say "rp2040js dependencies already installed"
else
  say "npm ci --ignore-scripts in ${RP}"
  (cd "${RP}" && npm ci --ignore-scripts --no-audit --no-fund --silent)
fi

# ---------------------------------------------------------------- Espressif QEMU
Q="${EMU}/qemu-esp"
QEMU_BIN="${Q}/qemu/bin/qemu-system-xtensa"
STAMP="${Q}/.installed-${QEMU_VERSION}"
if [ -x "${QEMU_BIN}" ] && [ -f "${STAMP}" ]; then
  say "Espressif QEMU ${QEMU_VERSION} already installed"
else
  mkdir -p "${Q}/dl"
  if [ ! -f "${Q}/dl/${QEMU_TARBALL}" ]; then
    say "downloading ${QEMU_TARBALL}"
    curl -fsSL -o "${Q}/dl/${QEMU_TARBALL}.part" "${QEMU_URL}"
    mv "${Q}/dl/${QEMU_TARBALL}.part" "${Q}/dl/${QEMU_TARBALL}"
  fi
  got="$(sha256sum "${Q}/dl/${QEMU_TARBALL}" | cut -d' ' -f1)"
  if [ "${got}" != "${QEMU_SHA256}" ]; then
    echo "setup.sh: ${QEMU_TARBALL} has SHA-256 ${got}, expected ${QEMU_SHA256}; deleted it" >&2
    rm -f "${Q}/dl/${QEMU_TARBALL}"
    exit 1
  fi
  say "extracting Espressif QEMU into ${Q}"
  tar -xJf "${Q}/dl/${QEMU_TARBALL}" -C "${Q}"
  touch "${STAMP}"
fi

say "ready: ZPLC_EMU_DIR=${EMU}"
say "  rp2040js ${RP2040JS_COMMIT:0:8} + patch $(sha256sum "${PATCH}" | cut -c1-12)"
say "  $("${QEMU_BIN}" --version | head -n 1)"
