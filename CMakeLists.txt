# =============================================================================
# ZPLC - Zephyr PLC Runtime
# Root CMake Configuration (Workspace Wrapper)
# =============================================================================
# SPDX-License-Identifier: MIT
#
# This is the root CMakeLists.txt for the ZPLC workspace.
# It delegates to the appropriate subdirectory based on build mode.
#
# Build Options:
#
# 1. POSIX Build (development/testing):
#    cd firmware/lib/zplc_core
#    mkdir build && cd build
#    cmake ..
#    make && ctest --output-on-failure
#
# 2. Zephyr Build (embedded targets):
#    source ~/zephyrproject/activate.sh
#    cd ~/zephyrproject
#    west build -b rpi_pico $ZPLC_PATH/firmware/app --pristine
#
# 3. WebAssembly Build (browser simulation):
#    bun tools/wasm-core/build.ts --out build/zplc-runtime.wasm
#    (clang and wasm-ld, no Emscripten; the IDE build runs it)
#
# =============================================================================

cmake_minimum_required(VERSION 3.20)

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/package.json" ZPLC_PACKAGE_JSON)
string(JSON ZPLC_CORE_VERSION_STR ERROR_VARIABLE ZPLC_VERSION_ERROR GET "${ZPLC_PACKAGE_JSON}" version)
set(ZPLC_SEMVER_PATTERN "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$")
if(NOT ZPLC_VERSION_ERROR STREQUAL "NOTFOUND" OR NOT ZPLC_CORE_VERSION_STR MATCHES "${ZPLC_SEMVER_PATTERN}")
    message(FATAL_ERROR "package.json must contain a valid ZPLC product semver version")
endif()
string(REGEX MATCH "^([0-9]+)\\.([0-9]+)\\.([0-9]+)" ZPLC_PROJECT_VERSION_MATCH "${ZPLC_CORE_VERSION_STR}")
set(ZPLC_PROJECT_VERSION "${CMAKE_MATCH_1}.${CMAKE_MATCH_2}.${CMAKE_MATCH_3}")

project(zplc_workspace
    VERSION ${ZPLC_PROJECT_VERSION}
    DESCRIPTION "ZPLC Workspace - Zephyr PLC Runtime"
    LANGUAGES C
)

message(STATUS "ZPLC product version: ${ZPLC_CORE_VERSION_STR}")

# =============================================================================
# Build modes
# =============================================================================
# This file only points at the build of each target; nothing is built from here.

message(STATUS "==============================================")
message(STATUS "ZPLC Workspace")
message(STATUS "==============================================")
message(STATUS "")
message(STATUS "For POSIX build (development/testing):")
message(STATUS "  cd firmware/lib/zplc_core")
message(STATUS "  mkdir build && cd build")
message(STATUS "  cmake .. && make && ctest")
message(STATUS "")
message(STATUS "For Zephyr build (embedded):")
message(STATUS "  source ~/zephyrproject/activate.sh")
message(STATUS "  west build -b rpi_pico firmware/app")
message(STATUS "")
message(STATUS "For WebAssembly (the browser runtime of the IDE; clang and wasm-ld, no Emscripten):")
message(STATUS "  bun tools/wasm-core/build.ts --out build/zplc-runtime.wasm")
message(STATUS "==============================================")
