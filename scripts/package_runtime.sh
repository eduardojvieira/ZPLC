#!/bin/bash
# =============================================================================
# ZPLC Runtime Packaging Script
# =============================================================================
# Creates a self-contained source package for building ZPLC on embedded boards.
#
# Usage:
#   ./scripts/package_runtime.sh [version]
#
# Examples:
#   ./scripts/package_runtime.sh 1.4.0
#   ./scripts/package_runtime.sh  # Uses version from packages/zplc-ide/package.json
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Get version from argument or package.json
if [[ $# -ge 1 ]]; then
    VERSION="$1"
else
    VERSION=$(grep '"version"' "$ROOT_DIR/packages/zplc-ide/package.json" | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
fi

PACKAGE_NAME="zplc-runtime-${VERSION}"
OUTPUT_DIR="${ROOT_DIR}/dist"

echo "=============================================="
echo "ZPLC Runtime Packager"
echo "=============================================="
echo "  Version: ${VERSION}"
echo "  Output:  ${OUTPUT_DIR}/${PACKAGE_NAME}"
echo "=============================================="

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Clean previous package
rm -rf "${OUTPUT_DIR:?}/${PACKAGE_NAME}"
rm -f "${OUTPUT_DIR:?}/${PACKAGE_NAME}.tar.gz"
rm -f "${OUTPUT_DIR:?}/${PACKAGE_NAME}.zip"

# Create package directory
PACKAGE_DIR="${OUTPUT_DIR}/${PACKAGE_NAME}"
mkdir -p "${PACKAGE_DIR}"

echo ""
echo "Copying source files..."

# Copy runtime source files
cp -r "${ROOT_DIR}/include" "${PACKAGE_DIR}/"
cp -r "${ROOT_DIR}/src" "${PACKAGE_DIR}/"
cp -r "${ROOT_DIR}/zephyr" "${PACKAGE_DIR}/"
cp -r "${ROOT_DIR}/apps" "${PACKAGE_DIR}/"
cp -r "${ROOT_DIR}/examples" "${PACKAGE_DIR}/"
cp -r "${ROOT_DIR}/tools" "${PACKAGE_DIR}/"
cp -r "${ROOT_DIR}/scripts" "${PACKAGE_DIR}/"
cp -r "${ROOT_DIR}/tests" "${PACKAGE_DIR}/"
cp "${ROOT_DIR}/CMakeLists.txt" "${PACKAGE_DIR}/"
cp "${ROOT_DIR}/Makefile" "${PACKAGE_DIR}/"
cp "${ROOT_DIR}/README.md" "${PACKAGE_DIR}/"
cp "${ROOT_DIR}/TECHNICAL_SPEC.md" "${PACKAGE_DIR}/"
cp "${ROOT_DIR}/AGENTS.md" "${PACKAGE_DIR}/"

# Don't copy .git, node_modules, build directories
find "${PACKAGE_DIR}" -name ".git" -type d -exec rm -rf {} + 2>/dev/null || true
find "${PACKAGE_DIR}" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
find "${PACKAGE_DIR}" -name "build*" -type d -exec rm -rf {} + 2>/dev/null || true
find "${PACKAGE_DIR}" -name "dist*" -type d -exec rm -rf {} + 2>/dev/null || true
find "${PACKAGE_DIR}" -name ".DS_Store" -delete 2>/dev/null || true

# Create BUILD.md with instructions
cat > "${PACKAGE_DIR}/BUILD.md" << 'EOF'
# ZPLC Runtime Build Instructions

## Overview

This package contains the ZPLC runtime source code ready for building on:
- POSIX systems (Linux, macOS, BSD)
- Zephyr RTOS (500+ supported boards)
- WebAssembly (for browser simulation)

## Directory Structure

```
zplc-runtime/
├── include/          # Public C headers
│   ├── zplc_core.h   # VM Core API
│   ├── zplc_hal.h    # Hardware Abstraction Layer
│   ├── zplc_isa.h    # Instruction Set Architecture
│   └── zplc_scheduler.h  # Multitask Scheduler
├── src/
│   ├── core/         # VM implementation (C99)
│   └── hal/          # HAL implementations
│       ├── posix/    # Linux/macOS/BSD
│       ├── zephyr/   # Zephyr RTOS
│       └── wasm/     # WebAssembly
├── apps/
│   ├── posix_host/   # Desktop development runtime
│   └── zephyr_app/   # Zephyr application with shell
├── zephyr/           # Zephyr module configuration
├── examples/         # Example .zplc and .asm programs
├── tests/            # C unit tests
└── tools/            # Assembler and utilities
```

## POSIX Build (Development)

Quick build for development and testing:

```bash
mkdir build && cd build
cmake .. -DZEPHYR_BUILD=OFF
make

# Run tests (105+ assertions)
ctest --output-on-failure

# Run demo runtime
./zplc_runtime
```

## Zephyr Build (Production)

### Prerequisites

1. Install Zephyr SDK: https://docs.zephyrproject.org/latest/getting_started/
2. Initialize workspace:
   ```bash
   west init ~/zephyrproject
   cd ~/zephyrproject
   west update
   ```
3. Add ZPLC as a module (choose one):
   - Copy this directory to `~/zephyrproject/modules/lib/zplc`
   - Or add to `west.yml` manifest

### Build for Specific Boards

```bash
cd ~/zephyrproject

# Raspberry Pi Pico (RP2040)
west build -b rpi_pico modules/lib/zplc/apps/zephyr_app --pristine
# Flash: cp build/zephyr/zephyr.uf2 /Volumes/RPI-RP2/

# STM32 Nucleo-H743ZI
west build -b nucleo_h743zi modules/lib/zplc/apps/zephyr_app
west flash

# Arduino Giga R1 (STM32H747)
west build -b arduino_giga_r1/stm32h747xx/m7 modules/lib/zplc/apps/zephyr_app
west flash

# ESP32-S3 DevKit
west build -b esp32s3_devkitc modules/lib/zplc/apps/zephyr_app
west flash

# QEMU (for testing without hardware)
west build -b mps2/an385 modules/lib/zplc/apps/zephyr_app
west build -t run
```

### Board Overlays

Pre-configured overlays are available in `apps/zephyr_app/boards/`:
- `rpi_pico_rp2040.overlay` - Pi Pico with USB serial and NVS
- `nucleo_h743zi.overlay` - STM32H743 with UART and NVS
- `arduino_giga_r1_stm32h747xx_m7.overlay` - Arduino Giga R1
- `esp32s3_devkitc_esp32s3_procpu.overlay` - ESP32-S3

## WebAssembly Build

For browser-based simulation:

```bash
# Install Emscripten: https://emscripten.org/docs/getting_started/
source ~/emsdk/emsdk_env.sh

mkdir build_wasm && cd build_wasm
emcmake cmake .. -DWASM_BUILD=ON
emmake make

# Output: zplc_sim.js + zplc_sim.wasm
```

## Serial Commands (Zephyr Shell)

Once running on hardware, connect via serial (115200 baud):

```bash
zplc load <size>      # Prepare to receive bytecode
zplc data <hex>       # Send hex-encoded chunk (64 chars max)
zplc start            # Start execution (auto-saves to Flash)
zplc stop             # Stop execution
zplc status           # Show VM state
zplc reset            # Reset VM to initial state
zplc persist info     # Show saved program
zplc persist clear    # Erase saved program
zplc dbg info         # Detailed debugging info
zplc dbg pause        # Pause execution
zplc dbg resume       # Resume execution
zplc dbg step         # Single step
```

## Memory Map

| Region | Base Address | Size | Purpose |
|--------|--------------|------|---------|
| IPI | 0x0000 | 4 KB | Input Process Image |
| OPI | 0x1000 | 4 KB | Output Process Image |
| Work | 0x2000 | 8 KB | Temporary variables |
| Retain | 0x4000 | 4 KB | Persisted memory |
| Code | 0x5000 | 44 KB | Bytecode storage |

## Configuration (Kconfig)

Key options in `prj.conf`:

```ini
CONFIG_ZPLC=y                              # Enable ZPLC module
CONFIG_ZPLC_SCHEDULER=y                    # Enable multitask scheduler
CONFIG_ZPLC_MAX_TASKS=4                    # Max concurrent tasks
CONFIG_ZPLC_WORK_MEMORY_SIZE=8192          # Work memory size
CONFIG_ZPLC_RETAIN_MEMORY_SIZE=4096        # Retentive memory size
CONFIG_ZPLC_CODE_SIZE_MAX=45056            # Max bytecode size
```

## Documentation

- Full documentation: https://eduardojvieira.github.io/ZPLC/
- Technical spec: See TECHNICAL_SPEC.md
- Agent context: See AGENTS.md

EOF

echo "Creating archives..."

# Create tarball
cd "${OUTPUT_DIR}"
tar -czvf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}"

# Create zip
zip -r "${PACKAGE_NAME}.zip" "${PACKAGE_NAME}"

# Show results
echo ""
echo "=============================================="
echo "Package created successfully!"
echo "=============================================="
echo ""
echo "Tarball: ${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
ls -lh "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz"
echo ""
echo "ZIP: ${OUTPUT_DIR}/${PACKAGE_NAME}.zip"
ls -lh "${OUTPUT_DIR}/${PACKAGE_NAME}.zip"
echo ""
echo "Contents preview:"
tar -tvf "${OUTPUT_DIR}/${PACKAGE_NAME}.tar.gz" | head -30
echo "... (truncated)"
