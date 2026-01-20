# =============================================================================
# ZPLC Core Library - CMakeLists.txt
# =============================================================================
# SPDX-License-Identifier: MIT
#
# This CMakeLists.txt supports standalone POSIX builds for development/testing.
# For Zephyr builds, the parent firmware/CMakeLists.txt is used instead.
#
# Usage (POSIX):
#   mkdir build && cd build
#   cmake .. -DZEPHYR_BUILD=OFF
#   make
#   ctest --output-on-failure
#
# =============================================================================

cmake_minimum_required(VERSION 3.20)

project(zplc_core
    VERSION 1.4.3
    DESCRIPTION "ZPLC Core Runtime Library"
    LANGUAGES C
)

# =============================================================================
# Compiler Configuration
# =============================================================================

# Enforce ANSI C99 - No extensions, no GCC-isms, no shortcuts.
set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

# Compiler flags: Warnings as errors
add_compile_options(
    -Wall
    -Wextra
    -Werror
    -pedantic
)

# =============================================================================
# Target: zplc_core (Static Library)
# =============================================================================

add_library(zplc_core STATIC
    src/core/zplc_core.c
)

target_include_directories(zplc_core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# =============================================================================
# Target: zplc_runtime (POSIX Executable)
# =============================================================================

add_executable(zplc_runtime
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/main.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(zplc_runtime PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(zplc_runtime PRIVATE zplc_core)

# POSIX-specific: librt for clock_gettime on Linux
if(NOT APPLE)
    target_link_libraries(zplc_runtime PRIVATE rt)
endif()

# =============================================================================
# Testing
# =============================================================================

enable_testing()

# Test: ISA Header Verification
add_executable(test_isa
    tests/test_isa.c
)

target_include_directories(test_isa PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_test(NAME test_isa COMMAND test_isa)

# Test: VM Core Execution
add_executable(test_vm_core
    tests/test_vm_core.c
    src/core/zplc_core.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_vm_core PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(test_vm_core PRIVATE zplc_core)

if(NOT APPLE)
    target_link_libraries(test_vm_core PRIVATE rt)
endif()

add_test(NAME test_vm_core COMMAND test_vm_core)

# Custom target to run all tests
add_custom_target(check
    COMMAND ${CMAKE_CTEST_COMMAND} --output-on-failure
    DEPENDS test_isa test_vm_core
    COMMENT "Running all tests..."
)

# =============================================================================
# Build Info
# =============================================================================

message(STATUS "==============================================")
message(STATUS "ZPLC Core Build Configuration")
message(STATUS "==============================================")
message(STATUS "  Version:    ${PROJECT_VERSION}")
message(STATUS "  C Standard: C${CMAKE_C_STANDARD}")
message(STATUS "  Platform:   ${CMAKE_SYSTEM_NAME}")
message(STATUS "  Compiler:   ${CMAKE_C_COMPILER_ID} ${CMAKE_C_COMPILER_VERSION}")
message(STATUS "==============================================")
