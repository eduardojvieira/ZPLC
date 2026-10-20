#!/usr/bin/env bash
# Builds the FreeRTOS port of the core and runs the port conformance suites on it (IO-016).
#
#   bash tools/freertos/test.sh [build-dir]
#
# The build directory defaults to build/freertos. FreeRTOS-Kernel is fetched there at the commit pinned in
# firmware/lib/zplc_core/src/hal/freertos/freertos.cmake (MIT; nothing of it is kept in the repository). To build
# offline, export FETCHCONTENT_SOURCE_DIR_FREERTOS_KERNEL=<a checkout of that commit>. The suites run on the FreeRTOS
# POSIX/GCC simulator: they need a Linux host, a C compiler, CMake 3.20 and git.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
build="${1:-$root/build/freertos}"
jobs="$(nproc 2>/dev/null || echo 2)"

extra=()
if [ -n "${FETCHCONTENT_SOURCE_DIR_FREERTOS_KERNEL:-}" ]; then
  extra+=("-DFETCHCONTENT_SOURCE_DIR_FREERTOS_KERNEL=$FETCHCONTENT_SOURCE_DIR_FREERTOS_KERNEL")
fi

cmake -S "$root/firmware/lib/zplc_core" -B "$build" -DZPLC_PORT=freertos -DCMAKE_BUILD_TYPE="${CMAKE_BUILD_TYPE:-Debug}" "${extra[@]}"
cmake --build "$build" --parallel "$jobs"
ctest --test-dir "$build" --output-on-failure --parallel 4
