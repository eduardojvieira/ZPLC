#!/bin/bash
# =============================================================================
# ZPLC Board Support Package Validation Script
# =============================================================================
# SPDX-License-Identifier: MIT
#
# This script validates that ZPLC compiles successfully for all supported
# target boards. It does NOT flash or run the firmware - just compile tests.
#
# Usage:
#   ./validate_bsp.sh           # Run all boards
#   ./validate_bsp.sh qemu      # Just QEMU (fast)
#   ./validate_bsp.sh nucleo    # Just Nucleo H743ZI
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZEPHYR_WORKSPACE="${HOME}/zephyrproject"
ZPLC_APP="${SCRIPT_DIR}/apps/zephyr_app"

# Board definitions: name|board_id|description
declare -a BOARDS=(
    "qemu|mps2/an385|QEMU Cortex-M3 Emulator"
    "nucleo|nucleo_h743zi|ST Nucleo H743ZI (STM32H7)"
    "giga|arduino_giga_r1/stm32h747xx/m7|Arduino GIGA R1 (STM32H747)"
    "pico|rpi_pico/rp2040|Raspberry Pi Pico (RP2040)"
    "esp32s3|esp32s3_devkitc/esp32s3/procpu|ESP32-S3 DevKitC"
)

# Stats
PASS=0
FAIL=0
SKIP=0

# -----------------------------------------------------------------------------
# Functions
# -----------------------------------------------------------------------------

print_header() {
    echo -e "${BLUE}"
    echo "============================================================================="
    echo "  ZPLC BSP Validation"
    echo "============================================================================="
    echo -e "${NC}"
}

print_board() {
    local name=$1
    local board_id=$2
    local desc=$3
    echo -e "${YELLOW}[BUILD]${NC} ${name}: ${desc}"
    echo -e "        Board ID: ${board_id}"
}

build_board() {
    local name=$1
    local board_id=$2
    local desc=$3
    local build_dir="${ZEPHYR_WORKSPACE}/build_${name}"
    
    print_board "$name" "$board_id" "$desc"
    
    # Clean previous build
    rm -rf "$build_dir"
    
    # Build
    if west build -b "$board_id" "$ZPLC_APP" -d "$build_dir" 2>&1 | tee /tmp/zplc_build_${name}.log; then
        echo -e "${GREEN}[PASS]${NC} ${name} compiled successfully"
        ((PASS++))
        return 0
    else
        echo -e "${RED}[FAIL]${NC} ${name} build failed! See /tmp/zplc_build_${name}.log"
        ((FAIL++))
        return 1
    fi
}

check_environment() {
    if [[ ! -d "$ZEPHYR_WORKSPACE" ]]; then
        echo -e "${RED}ERROR: Zephyr workspace not found at $ZEPHYR_WORKSPACE${NC}"
        exit 1
    fi
    
    if [[ ! -f "$ZEPHYR_WORKSPACE/activate.sh" ]]; then
        echo -e "${RED}ERROR: activate.sh not found in $ZEPHYR_WORKSPACE${NC}"
        exit 1
    fi
    
    # Activate environment
    source "$ZEPHYR_WORKSPACE/activate.sh"
    
    # Verify west is available
    if ! command -v west &> /dev/null; then
        echo -e "${RED}ERROR: 'west' command not found${NC}"
        exit 1
    fi
}

filter_boards() {
    local filter=$1
    local filtered=()
    
    if [[ -z "$filter" ]]; then
        echo "${BOARDS[@]}"
        return
    fi
    
    for board in "${BOARDS[@]}"; do
        local name=$(echo "$board" | cut -d'|' -f1)
        if [[ "$name" == "$filter" ]]; then
            echo "$board"
            return
        fi
    done
    
    echo -e "${RED}ERROR: Unknown board filter: $filter${NC}"
    echo "Available boards: qemu, nucleo, giga, pico, esp32s3"
    exit 1
}

print_summary() {
    echo ""
    echo -e "${BLUE}=============================================================================${NC}"
    echo -e "  Summary: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $SKIP skipped"
    echo -e "${BLUE}=============================================================================${NC}"
    
    if [[ $FAIL -gt 0 ]]; then
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

print_header
check_environment

# Get boards to build
FILTER="${1:-}"
readarray -t TARGET_BOARDS < <(filter_boards "$FILTER")

echo "Building ${#TARGET_BOARDS[@]} board(s)..."
echo ""

# Change to Zephyr workspace
cd "$ZEPHYR_WORKSPACE"

# Build each board
for board in "${TARGET_BOARDS[@]}"; do
    name=$(echo "$board" | cut -d'|' -f1)
    board_id=$(echo "$board" | cut -d'|' -f2)
    desc=$(echo "$board" | cut -d'|' -f3)
    
    echo "-----------------------------------------------------------------------------"
    build_board "$name" "$board_id" "$desc" || true
    echo ""
done

print_summary
