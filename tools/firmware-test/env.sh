# shellcheck shell=bash
# =============================================================================
# ZPLC firmware test environment (source me; do not execute)
#
#   . tools/firmware-test/env.sh
#
# Exports what setup.sh, run.sh and the west/twister commands need. It changes
# nothing on disk. Override any of these before sourcing:
#   ZPLC_FW_WS               west workspace root (default ~/zplc-zephyr-ws)
#   ZEPHYR_SDK_INSTALL_DIR   Zephyr SDK 1.0.1 (default ~/zephyr-sdk-1.0.1)
#
# Host tests, QEMU runs and size reports from this environment are not
# hardware evidence. See docs/docs/development/firmware-testing.md.
# =============================================================================

if [ -n "${ZSH_VERSION:-}" ]; then
  _zplc_fw_here="${(%):-%x}"
else
  _zplc_fw_here="${BASH_SOURCE[0]}"
fi

ZPLC_FW_TOOLS="$(cd "$(dirname "${_zplc_fw_here}")" && pwd -P)"
ZPLC_FW_REPO="$(cd "${ZPLC_FW_TOOLS}/../.." && pwd -P)"
ZPLC_FW_WS="${ZPLC_FW_WS:-${HOME}/zplc-zephyr-ws}"
ZEPHYR_SDK_INSTALL_DIR="${ZEPHYR_SDK_INSTALL_DIR:-${HOME}/zephyr-sdk-1.0.1}"
unset _zplc_fw_here

export ZPLC_FW_TOOLS ZPLC_FW_REPO ZPLC_FW_WS ZEPHYR_SDK_INSTALL_DIR
export ZEPHYR_TOOLCHAIN_VARIANT=zephyr
export ZEPHYR_BASE="${ZPLC_FW_WS}/zephyr"

# The venv carries west and twister's Python dependencies. The SDK host tools
# carry qemu-system-arm, dtc and the other binaries Zephyr expects.
_zplc_fw_hosttools="${ZEPHYR_SDK_INSTALL_DIR}/hosttools/sysroots/x86_64-pokysdk-linux/usr/bin"
case ":${PATH}:" in
  *":${ZPLC_FW_WS}/.venv/bin:"*) ;;
  *) PATH="${ZPLC_FW_WS}/.venv/bin:${PATH}" ;;
esac
case ":${PATH}:" in
  *":${_zplc_fw_hosttools}:"*) ;;
  *) [ -d "${_zplc_fw_hosttools}" ] && PATH="${PATH}:${_zplc_fw_hosttools}" ;;
esac
unset _zplc_fw_hosttools
export PATH
