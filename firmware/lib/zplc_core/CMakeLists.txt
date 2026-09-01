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

file(READ "${CMAKE_CURRENT_LIST_DIR}/../../../package.json" ZPLC_PACKAGE_JSON)
string(JSON ZPLC_CORE_VERSION_STR ERROR_VARIABLE ZPLC_VERSION_ERROR GET "${ZPLC_PACKAGE_JSON}" version)
set(ZPLC_SEMVER_PATTERN "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$")
if(NOT ZPLC_VERSION_ERROR STREQUAL "NOTFOUND" OR NOT ZPLC_CORE_VERSION_STR MATCHES "${ZPLC_SEMVER_PATTERN}")
    message(FATAL_ERROR "package.json must contain a valid ZPLC product semver version")
endif()
string(REGEX MATCH "^([0-9]+)\\.([0-9]+)\\.([0-9]+)" ZPLC_PROJECT_VERSION_MATCH "${ZPLC_CORE_VERSION_STR}")
set(ZPLC_PROJECT_VERSION "${CMAKE_MATCH_1}.${CMAKE_MATCH_2}.${CMAKE_MATCH_3}")

project(zplc_core
    VERSION ${ZPLC_PROJECT_VERSION}
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
if(MSVC)
    add_compile_definitions(
        _CRT_SECURE_NO_WARNINGS
    )
    add_compile_options(
        /W4
        /WX
    )
else()
    add_compile_options(
        -Wall
        -Wextra
        -Werror
        -pedantic
    )
endif()

# =============================================================================
# Target: zplc_core (Static Library)
# =============================================================================

add_library(zplc_core STATIC
    src/core/zplc_core.c
    src/core/zplc_comm_dispatch.c
    src/core/zplc_loader.c
)

target_compile_definitions(zplc_core PUBLIC ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}")

target_include_directories(zplc_core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# =============================================================================
# Target: zplc_runtime (POSIX Executable)
# =============================================================================

add_executable(zplc_runtime
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/main.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/host_stdio.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/native_runtime_session.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/native_program_store.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(zplc_runtime PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(zplc_runtime PRIVATE zplc_core)

# POSIX-specific: librt for clock_gettime on Linux
if(UNIX AND NOT APPLE)
    target_link_libraries(zplc_runtime PRIVATE rt)
endif()

# =============================================================================
# Testing
# =============================================================================

option(ZPLC_BUILD_FUZZER "Build the libFuzzer loader verification target" OFF)

if(ZPLC_BUILD_FUZZER)
    if(NOT CMAKE_C_COMPILER_ID MATCHES "Clang")
        message(FATAL_ERROR "ZPLC_BUILD_FUZZER requires Clang")
    endif()

    add_executable(fuzz_loader_verify
        tests/fuzz_loader_verify.c
        src/core/zplc_loader.c
    )

    target_include_directories(fuzz_loader_verify PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    )

    target_compile_options(fuzz_loader_verify PRIVATE
        -fsanitize=fuzzer,address,undefined
        -fno-omit-frame-pointer
    )
    target_link_options(fuzz_loader_verify PRIVATE
        -fsanitize=fuzzer,address,undefined
        -fno-omit-frame-pointer
    )
endif()

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

target_compile_definitions(test_vm_core PRIVATE ZPLC_CORE_TESTING)

target_link_libraries(test_vm_core PRIVATE zplc_core)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_vm_core PRIVATE rt)
endif()

add_test(NAME test_vm_core COMMAND test_vm_core)

# Test: Native Runtime Session Protocol
add_executable(test_native_runtime_session
    tests/test_native_runtime_session.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/native_runtime_session.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/native_program_store.c
    src/core/zplc_core.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_native_runtime_session PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures
)

target_compile_definitions(test_native_runtime_session PRIVATE
    ZPLC_EXPECTED_PRODUCT_VERSION="${ZPLC_CORE_VERSION_STR}"
    ZPLC_HAL_PERSIST_TESTING
)

target_link_libraries(test_native_runtime_session PRIVATE zplc_core)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_native_runtime_session PRIVATE rt)
endif()

add_test(NAME test_native_runtime_session COMMAND test_native_runtime_session)

# Test: POSIX host stdio polling behavior
add_executable(test_host_stdio
    tests/test_host_stdio.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/host_stdio.c
)

target_include_directories(test_host_stdio PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src
)

add_test(NAME test_host_stdio COMMAND test_host_stdio)

# Test: POSIX HAL persistence behavior
add_executable(test_hal_posix_persist
    tests/test_hal_posix_persist.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_hal_posix_persist PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_compile_definitions(test_hal_posix_persist PRIVATE ZPLC_HAL_PERSIST_TESTING)

add_test(NAME test_hal_posix_persist COMMAND test_hal_posix_persist)

# Test: POSIX HAL mutex behavior
add_executable(test_hal_posix_mutex
    tests/test_hal_posix_mutex.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_hal_posix_mutex PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_test(NAME test_hal_posix_mutex COMMAND test_hal_posix_mutex)

# Test: Communication Dispatch
add_executable(test_comm_dispatch
    tests/test_comm_dispatch.c
    src/core/zplc_comm_dispatch.c
)

target_include_directories(test_comm_dispatch PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(test_comm_dispatch PRIVATE zplc_core)

add_test(NAME test_comm_dispatch COMMAND test_comm_dispatch)

add_executable(test_loader_verify
    tests/test_loader_verify.c
)

target_include_directories(test_loader_verify PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_loader_verify PRIVATE
    ZPLC_LOADER_FIXTURE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/zplc-v1-code-task-tags.hex"
)

target_link_libraries(test_loader_verify PRIVATE zplc_core)

add_test(NAME test_loader_verify COMMAND test_loader_verify)

# Custom target to run all tests
add_custom_target(check
    COMMAND ${CMAKE_CTEST_COMMAND} --output-on-failure
    DEPENDS test_isa test_vm_core test_comm_dispatch test_loader_verify test_native_runtime_session test_host_stdio test_hal_posix_persist test_hal_posix_mutex
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
