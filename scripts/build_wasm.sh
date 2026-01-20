#!/bin/bash
#
# ZPLC WASM Build Script
# 
# Builds the WASM module for browser simulation.
# Requires Emscripten SDK to be installed at ~/emsdk
#
# Usage: ./scripts/build_wasm.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build_wasm"
IDE_PUBLIC="$PROJECT_ROOT/packages/zplc-ide/public"
EMSDK_DIR="${EMSDK:-$HOME/emsdk}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}ZPLC WASM Build${NC}"
echo -e "${GREEN}========================================${NC}"

# Check for Emscripten
if [ ! -f "$EMSDK_DIR/emsdk_env.sh" ]; then
    echo -e "${RED}Error: Emscripten SDK not found at $EMSDK_DIR${NC}"
    echo ""
    echo "Install Emscripten:"
    echo "  cd ~"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk"
    echo "  ./emsdk install latest"
    echo "  ./emsdk activate latest"
    exit 1
fi

# Source Emscripten environment
echo -e "${YELLOW}Loading Emscripten environment...${NC}"
source "$EMSDK_DIR/emsdk_env.sh" 2>/dev/null

# Check emcc is available
if ! command -v emcc &> /dev/null; then
    echo -e "${RED}Error: emcc not found after sourcing emsdk_env.sh${NC}"
    exit 1
fi

echo "Emscripten version: $(emcc --version | head -1)"

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Configure with CMake
echo -e "${YELLOW}Configuring with CMake...${NC}"
emcmake cmake "$PROJECT_ROOT" -DWASM_BUILD=ON

# Build
echo -e "${YELLOW}Building WASM module...${NC}"
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Copy to IDE
echo -e "${YELLOW}Copying to IDE public folder...${NC}"
mkdir -p "$IDE_PUBLIC"
cp zplc_sim.js zplc_sim.wasm "$IDE_PUBLIC/"

# Verify
if [ -f "$IDE_PUBLIC/zplc_sim.js" ] && [ -f "$IDE_PUBLIC/zplc_sim.wasm" ]; then
    JS_SIZE=$(du -h "$IDE_PUBLIC/zplc_sim.js" | cut -f1)
    WASM_SIZE=$(du -h "$IDE_PUBLIC/zplc_sim.wasm" | cut -f1)
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Build successful!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo "  zplc_sim.js:   $JS_SIZE"
    echo "  zplc_sim.wasm: $WASM_SIZE"
    echo ""
    echo "Files copied to: $IDE_PUBLIC/"
else
    echo -e "${RED}Error: Build artifacts not found${NC}"
    exit 1
fi
