# =============================================================================
# ZPLC - Zephyr PLC Runtime
# Root CMake Configuration
# =============================================================================
# SPDX-License-Identifier: MIT
#
# This CMakeLists.txt supports two build modes:
#
# 1. POSIX Build (default):
#    mkdir build_posix && cd build_posix
#    cmake .. -DZEPHYR_BUILD=OFF
#    make
#
# 2. Zephyr Build (when used as a Zephyr module):
#    The Zephyr build system invokes zephyr/CMakeLists.txt directly.
#    See apps/zephyr_app/ for an example Zephyr application.
#
# =============================================================================

cmake_minimum_required(VERSION 3.20)

# =============================================================================
# Build Mode Detection
# =============================================================================
# If ZEPHYR_BASE is defined, we're being included in a Zephyr build.
# Otherwise, this is a standalone POSIX build.

option(ZEPHYR_BUILD "Build as Zephyr module (requires Zephyr SDK)" OFF)

if(DEFINED ENV{ZEPHYR_BASE} OR ZEPHYR_BUILD)
    # =========================================================================
    # ZEPHYR BUILD PATH
    # =========================================================================
    # When building with Zephyr, the actual build is handled by
    # zephyr/CMakeLists.txt which registers sources with zephyr_library().
    # This file is not directly used in Zephyr builds.
    message(STATUS "==============================================")
    message(STATUS "ZPLC: Zephyr build mode detected")
    message(STATUS "==============================================")
    message(STATUS "Use 'west build' from apps/zephyr_app/")
    message(STATUS "Or add ZPLC as a Zephyr module in your project")
    message(STATUS "==============================================")
    
    # For IDE support, still define the project
    project(zplc VERSION 0.2.0 LANGUAGES C)
    
else()
    # =========================================================================
    # POSIX BUILD PATH
    # =========================================================================
    message(STATUS "==============================================")
    message(STATUS "ZPLC: POSIX build mode")
    message(STATUS "==============================================")

    project(zplc
        VERSION 0.2.0
        DESCRIPTION "Portable IEC 61131-3 PLC Runtime"
        LANGUAGES C
    )

    # =========================================================================
    # Global Compiler Configuration
    # =========================================================================

    # Enforce ANSI C99 - No extensions, no GCC-isms, no shortcuts.
    # This is industrial code. It compiles everywhere or it doesn't ship.
    set(CMAKE_C_STANDARD 99)
    set(CMAKE_C_STANDARD_REQUIRED ON)
    set(CMAKE_C_EXTENSIONS OFF)

    # Compiler flags: We treat warnings as errors because sloppy code kills.
    # -Wall -Wextra: All reasonable warnings
    # -Werror: Warnings are errors. Fix them or go home.
    # -pedantic: Strict ISO C compliance
    add_compile_options(
        -Wall
        -Wextra
        -Werror
        -pedantic
    )

    # Store root for subdirectories
    set(ZPLC_ROOT ${CMAKE_SOURCE_DIR})

    # =========================================================================
    # Include Paths
    # =========================================================================

    # Public headers accessible to all targets
    include_directories(${CMAKE_SOURCE_DIR}/include)

    # =========================================================================
    # Target: zplc_core (Static Library)
    # =========================================================================
    # The platform-independent VM and logic.
    # This is the heart of the runtime - pure C99, no OS dependencies.
    # All platform specifics go through the HAL interface.

    add_library(zplc_core STATIC
        src/core/zplc_core.c
    )

    target_include_directories(zplc_core PUBLIC
        ${CMAKE_SOURCE_DIR}/include
    )

    # =========================================================================
    # Target: zplc_runtime (POSIX Executable)
    # =========================================================================
    # The host-based runtime for POSIX systems (Linux, macOS, BSD).
    # Links the core library with the POSIX HAL implementation.

    add_executable(zplc_runtime
        apps/posix_host/src/main.c
        src/hal/posix/zplc_hal_posix.c
    )

    target_include_directories(zplc_runtime PRIVATE
        ${CMAKE_SOURCE_DIR}/include
    )

    target_link_libraries(zplc_runtime PRIVATE
        zplc_core
    )

    # POSIX-specific: We need librt for clock_gettime on some systems
    # macOS has it in libc, Linux may need -lrt
    if(NOT APPLE)
        target_link_libraries(zplc_runtime PRIVATE rt)
    endif()

    # =========================================================================
    # Testing
    # =========================================================================

    enable_testing()

    # Test: ISA Header Verification
    # Verifies struct sizes, opcode uniqueness, and helper functions
    add_executable(test_isa
        tests/test_isa.c
    )

    target_include_directories(test_isa PRIVATE
        ${CMAKE_SOURCE_DIR}/include
    )

    # Register with CTest
    add_test(NAME test_isa COMMAND test_isa)

    # Test: VM Core Execution
    # Tests the VM interpreter by constructing bytecode and verifying results
    # NOTE: We include the POSIX HAL because the VM now calls zplc_hal_tick()
    #       for the GET_TICKS opcode. This is intentional coupling for tests.
    add_executable(test_vm_core
        tests/test_vm_core.c
        src/core/zplc_core.c
        src/hal/posix/zplc_hal_posix.c
    )

    target_include_directories(test_vm_core PRIVATE
        ${CMAKE_SOURCE_DIR}/include
    )

    target_link_libraries(test_vm_core PRIVATE
        zplc_core
    )

    # POSIX-specific: Link rt for clock_gettime on Linux
    if(NOT APPLE)
        target_link_libraries(test_vm_core PRIVATE rt)
    endif()

    # Register with CTest
    add_test(NAME test_vm_core COMMAND test_vm_core)

    # Custom target to run all tests with verbose output
    add_custom_target(check
        COMMAND ${CMAKE_CTEST_COMMAND} --output-on-failure
        DEPENDS test_isa test_vm_core
        COMMENT "Running all tests..."
    )

    # =========================================================================
    # Build Info
    # =========================================================================

    message(STATUS "==============================================")
    message(STATUS "ZPLC Build Configuration")
    message(STATUS "==============================================")
    message(STATUS "  Version:    ${PROJECT_VERSION}")
    message(STATUS "  C Standard: C${CMAKE_C_STANDARD}")
    message(STATUS "  Platform:   ${CMAKE_SYSTEM_NAME}")
    message(STATUS "  Compiler:   ${CMAKE_C_COMPILER_ID} ${CMAKE_C_COMPILER_VERSION}")
    message(STATUS "  Build Type: POSIX Host")
    message(STATUS "==============================================")

endif()

# =============================================================================
# Installation (Both build modes)
# =============================================================================

# Install headers for use by other projects
install(DIRECTORY include/ DESTINATION include/zplc)

# Install Zephyr module files
install(DIRECTORY zephyr/ DESTINATION share/zplc/zephyr)
install(DIRECTORY dts/ DESTINATION share/zplc/dts)
