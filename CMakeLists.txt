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
#    cd firmware/lib/zplc_core
#    mkdir build_wasm && cd build_wasm
#    emcmake cmake .. -DWASM_BUILD=ON
#    emmake make
#
# =============================================================================

cmake_minimum_required(VERSION 3.20)

project(zplc_workspace
    VERSION 1.4.3
    DESCRIPTION "ZPLC Workspace - Zephyr PLC Runtime"
    LANGUAGES C
)

# =============================================================================
# Build Mode Detection
# =============================================================================

option(WASM_BUILD "Build for WebAssembly (requires Emscripten)" OFF)

if(EMSCRIPTEN OR WASM_BUILD)
    # =========================================================================
    # WASM BUILD - Delegate to firmware/lib/zplc_core
    # =========================================================================
    message(STATUS "==============================================")
    message(STATUS "ZPLC: WebAssembly build mode")
    message(STATUS "==============================================")

    set(CMAKE_C_STANDARD 99)
    set(CMAKE_C_STANDARD_REQUIRED ON)
    set(CMAKE_C_EXTENSIONS OFF)

    set(ZPLC_CORE_DIR ${CMAKE_SOURCE_DIR}/firmware/lib/zplc_core)

    add_executable(zplc_sim
        ${ZPLC_CORE_DIR}/src/core/zplc_core.c
        ${ZPLC_CORE_DIR}/src/hal/wasm/zplc_hal_wasm.c
    )

    target_include_directories(zplc_sim PRIVATE
        ${ZPLC_CORE_DIR}/include
    )

    set_target_properties(zplc_sim PROPERTIES
        SUFFIX ".js"
        LINK_FLAGS "\
            -s WASM=1 \
            -s MODULARIZE=1 \
            -s EXPORT_NAME='ZPLCModule' \
            -s EXPORTED_FUNCTIONS='[ \
                \"_zplc_core_init\", \
                \"_zplc_core_shutdown\", \
                \"_zplc_core_load_raw\", \
                \"_zplc_core_step\", \
                \"_zplc_core_run\", \
                \"_zplc_core_run_cycle\", \
                \"_zplc_core_get_state\", \
                \"_zplc_core_get_sp\", \
                \"_zplc_core_get_pc\", \
                \"_zplc_core_get_stack\", \
                \"_zplc_core_get_error\", \
                \"_zplc_core_is_halted\", \
                \"_zplc_core_set_ipi\", \
                \"_zplc_core_get_opi\", \
                \"_zplc_hal_init\", \
                \"_zplc_hal_shutdown\", \
                \"_zplc_hal_tick\", \
                \"_zplc_wasm_set_input\", \
                \"_zplc_wasm_get_output\", \
                \"_malloc\", \
                \"_free\" \
            ]' \
            -s EXPORTED_RUNTIME_METHODS='[\"ccall\", \"cwrap\", \"getValue\", \"setValue\", \"UTF8ToString\", \"stringToUTF8\", \"HEAPU8\"]' \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s INITIAL_MEMORY=1048576 \
            -s STACK_SIZE=65536 \
            -s NO_EXIT_RUNTIME=1 \
            -s ASSERTIONS=1 \
            --no-entry \
        "
    )

    message(STATUS "  Output: zplc_sim.js + zplc_sim.wasm")

else()
    # =========================================================================
    # DEFAULT: Provide instructions
    # =========================================================================
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
    message(STATUS "For WASM build (browser):")
    message(STATUS "  mkdir build_wasm && cd build_wasm")
    message(STATUS "  emcmake cmake .. -DWASM_BUILD=ON && emmake make")
    message(STATUS "==============================================")

endif()
