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

# What this build is: version, commit, board, ABI and options, as a generated header (REL-023). The runtime reports
# it in its handshake; the host test of the formatter reads it.
include(${CMAKE_CURRENT_LIST_DIR}/../../../scripts/release/zplc_fw_identity.cmake)
zplc_generate_fw_identity(
    OUT_DIR ${CMAKE_CURRENT_BINARY_DIR}/generated
    REPO_ROOT ${CMAKE_CURRENT_LIST_DIR}/../../..
    VERSION ${ZPLC_CORE_VERSION_STR}
    BOARD posix
    OPTIONS "build_type=${CMAKE_BUILD_TYPE}"
)

# =============================================================================
# Compiler Configuration
# =============================================================================

# Enforce ANSI C99 - No extensions, no GCC-isms, no shortcuts.
set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

# 32-bit x86: gcc defaults to x87 arithmetic, which rounds a double-precision result twice. The VM computes its
# double-precision results in integer arithmetic and does not depend on this; the host `double` that the test
# models take as the reference does. Zephyr's 32-bit native_sim sets the same flags.
if(NOT MSVC AND CMAKE_SIZEOF_VOID_P EQUAL 4 AND CMAKE_SYSTEM_PROCESSOR MATCHES "^(x86_64|AMD64|i[3-6]86|x86)$")
    add_compile_options(-msse2 -mfpmath=sse)
endif()

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
    src/core/zplc_retain.c
    src/core/zplc_program_store.c
    src/core/zplc_exchange.c
    src/core/zplc_sched_core.c
    src/core/zplc_single_task.c
    src/core/zplc_failsafe.c
)

target_compile_definitions(zplc_core PUBLIC ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}")

target_include_directories(zplc_core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# RT-029: the core compiles without a Zephyr header. Every file of src/core is compiled here, in a build whose
# include path is include/ and nothing else, with the one Kconfig symbol that adds code to the core switched on
# (CONFIG_ZPLC_HIL_DEBUG). A Zephyr header or a Zephyr type in src/core stops this target, which is part of the
# default build, so it stops every host build and every ctest run. The glob means a new core file is covered
# without an edit here.
file(GLOB ZPLC_CORE_PORTABLE_SOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/src/core/*.c)
add_library(zplc_core_portable OBJECT ${ZPLC_CORE_PORTABLE_SOURCES})
target_include_directories(zplc_core_portable PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_compile_definitions(zplc_core_portable PRIVATE
    ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}"
    CONFIG_ZPLC_HIL_DEBUG=1
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
    ${ZPLC_FW_IDENTITY_DIR}
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

    # Address and undefined-behaviour sanitizers, with undefined behaviour and out-of-range
    # float-to-integer conversions fatal: a finding must stop the run and save its input.
    set(ZPLC_FUZZ_FLAGS
        -fsanitize=fuzzer,address,undefined,float-cast-overflow
        -fno-sanitize-recover=undefined,float-cast-overflow
        -fno-omit-frame-pointer
    )

    # VF-014: the verifier alone, with a mutator that keeps the CRC valid.
    add_executable(fuzz_loader_verify
        tests/fuzz_loader_verify.c
        src/core/zplc_loader.c
    )

    target_include_directories(fuzz_loader_verify PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    )

    target_compile_options(fuzz_loader_verify PRIVATE ${ZPLC_FUZZ_FLAGS})
    target_link_options(fuzz_loader_verify PRIVATE ${ZPLC_FUZZ_FLAGS})

    # VF-014: load accepted artifacts and run them. The scan budget is the documented override
    # of ZPLC_VM_CYCLE_INSTRUCTION_BUDGET, so that a loop costs microseconds, not milliseconds.
    add_executable(fuzz_run_program
        tests/fuzz_run_program.c
        src/core/zplc_core.c
        src/core/zplc_loader.c
        src/core/zplc_comm_dispatch.c
        src/hal/posix/zplc_hal_posix.c
    )

    target_include_directories(fuzz_run_program PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    )

    target_compile_definitions(fuzz_run_program PRIVATE
        ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}"
        ZPLC_VM_CYCLE_INSTRUCTION_BUDGET=4096U
    )

    target_compile_options(fuzz_run_program PRIVATE ${ZPLC_FUZZ_FLAGS})
    target_link_options(fuzz_run_program PRIVATE ${ZPLC_FUZZ_FLAGS})

    if(UNIX AND NOT APPLE)
        target_link_libraries(fuzz_run_program PRIVATE rt)
    endif()
endif()

enable_testing()

# The test-only entry points (RT-033) are declared in tests/include/zplc_test_hooks.h, never in include/.
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/tests/include)

# Test: ISA Header Verification
add_executable(test_isa
    tests/test_isa.c
)

target_include_directories(test_isa PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_test(NAME test_isa COMMAND test_isa)

# Test: generated binary contract tables
add_executable(test_contract
    tests/test_contract.c
)

target_include_directories(test_contract PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_test(NAME test_contract COMMAND test_contract)

# Test: no public header declares a test-only entry point (RT-033). It only has to compile.
add_executable(test_public_headers
    tests/test_public_headers.c
)

target_include_directories(test_public_headers PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/include
)

add_test(NAME test_public_headers COMMAND test_public_headers)

# Test: the one CRC-32 and the little-endian byte helpers of the runtime (RT-032)
add_executable(test_bytes_crc
    tests/test_bytes_crc.c
)

target_include_directories(test_bytes_crc PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_test(NAME test_bytes_crc COMMAND test_bytes_crc)

# Test: the HIL debug formatter runs on the host with a line sink (RT-029)
add_executable(test_hil_debug
    tests/test_hil_debug.c
    src/core/zplc_debug.c
)

target_include_directories(test_hil_debug PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_hil_debug PRIVATE CONFIG_ZPLC_HIL_DEBUG=1)

add_test(NAME test_hil_debug COMMAND test_hil_debug)

# RT-029: the rules of src/core/zplc_config_check.h. Each rule is built once with a value that breaks it and the
# build must stop with the name of the rule; the same rules built with every value at its limit must pass.
function(zplc_config_rule_must_fail rule)
    set(target zplc_cfg_${rule})
    add_library(${target} OBJECT EXCLUDE_FROM_ALL tests/config_check_probe.c)
    target_include_directories(${target} PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
        ${CMAKE_CURRENT_SOURCE_DIR}/src/core
    )
    target_compile_definitions(${target} PRIVATE ${ARGN})
    add_test(NAME config_rule_${rule}
             COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target ${target})
    set_tests_properties(config_rule_${rule} PROPERTIES
        PASS_REGULAR_EXPRESSION "zplc_config_rule_${rule}")
endfunction()

set(ZPLC_SCHED_OK CONFIG_ZPLC_SCHEDULER=1 CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ=1
    CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY=2 CONFIG_ZPLC_SCHED_WORKQ_PRIORITY=5)

zplc_config_rule_must_fail(code_region_ends_inside_the_16_bit_address_space CONFIG_ZPLC_CODE_SIZE_MAX=0xB001U)
zplc_config_rule_must_fail(code_region_holds_a_container_header_and_a_program CONFIG_ZPLC_CODE_SIZE_MAX=32U)
zplc_config_rule_must_fail(work_region_has_at_least_16_bytes CONFIG_ZPLC_WORK_MEMORY_SIZE=8U)
zplc_config_rule_must_fail(retain_region_has_at_least_16_bytes CONFIG_ZPLC_RETAIN_MEMORY_SIZE=8U)
zplc_config_rule_must_fail(evaluation_stack_depth_is_between_4_and_65535 CONFIG_ZPLC_STACK_DEPTH=65536)
zplc_config_rule_must_fail(call_stack_depth_is_between_1_and_255 CONFIG_ZPLC_CALL_STACK_DEPTH=256)
zplc_config_rule_must_fail(breakpoint_count_is_between_1_and_255 CONFIG_ZPLC_MAX_BREAKPOINTS=256)
zplc_config_rule_must_fail(tag_count_is_between_1_and_65535 ZPLC_MAX_TAGS=0)
zplc_config_rule_must_fail(task_slots_do_not_exceed_what_the_loader_admits CONFIG_ZPLC_MAX_TASKS=17)
zplc_config_rule_must_fail(high_priority_queue_outranks_the_normal_queue
    CONFIG_ZPLC_SCHEDULER=1 CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ=1
    CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY=6 CONFIG_ZPLC_SCHED_WORKQ_PRIORITY=5)
zplc_config_rule_must_fail(scan_coordinator_outranks_every_communication_thread
    ${ZPLC_SCHED_OK} CONFIG_ZPLC_COMM_THREAD_PRIORITY=2)
zplc_config_rule_must_fail(scan_coordinator_outranks_the_shell_thread
    ${ZPLC_SCHED_OK} CONFIG_SHELL_THREAD_PRIORITY_OVERRIDE=1 CONFIG_SHELL_THREAD_PRIORITY=1)
zplc_config_rule_must_fail(scan_coordinator_outranks_the_log_thread
    ${ZPLC_SCHED_OK} CONFIG_LOG_PROCESS_THREAD_CUSTOM_PRIORITY=1 CONFIG_LOG_PROCESS_THREAD_PRIORITY=0)

# Every value at its limit, and a scheduler build with the priorities in order: part of the default build.
add_library(zplc_cfg_limits OBJECT tests/config_check_probe.c)
target_include_directories(zplc_cfg_limits PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/src/core
)
target_compile_definitions(zplc_cfg_limits PRIVATE
    CONFIG_ZPLC_CODE_SIZE_MAX=0xB000U CONFIG_ZPLC_STACK_DEPTH=65535 CONFIG_ZPLC_CALL_STACK_DEPTH=255
    CONFIG_ZPLC_MAX_BREAKPOINTS=255 ZPLC_MAX_TAGS=65535 CONFIG_ZPLC_MAX_TASKS=16
    ${ZPLC_SCHED_OK} CONFIG_ZPLC_COMM_THREAD_PRIORITY=3
    CONFIG_SHELL_THREAD_PRIORITY_OVERRIDE=1 CONFIG_SHELL_THREAD_PRIORITY=3
    CONFIG_LOG_PROCESS_THREAD_CUSTOM_PRIORITY=1 CONFIG_LOG_PROCESS_THREAD_PRIORITY=14
)

# Test: a failure to create or take the process-image lock is reported (RT-030). The test supplies its own HAL.
add_executable(test_core_lock
    tests/test_core_lock.c
    src/core/zplc_core.c
    src/core/zplc_loader.c
    src/core/zplc_comm_dispatch.c
)

target_include_directories(test_core_lock PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_core_lock PRIVATE ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}")

add_test(NAME test_core_lock COMMAND test_core_lock)

# Test: the durable program store: the largest artifact, chunked payloads, a power cut at every operation and a
# torn write at every save (RT-028, RT-031, RT-032). Also run under the sanitizers.
add_executable(test_program_store
    tests/test_program_store.c
    src/core/zplc_program_store.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_program_store PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_compile_definitions(test_program_store PRIVATE ZPLC_HAL_PERSIST_TESTING)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_program_store PRIVATE rt)
endif()

add_test(NAME test_program_store COMMAND test_program_store)

# Test: cold and warm start are defined in the core and a program load is a cold start (RT-016)
add_executable(test_core_start
    tests/test_core_start.c
    src/core/zplc_core.c
    src/core/zplc_loader.c
    src/core/zplc_comm_dispatch.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_core_start PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_core_start PRIVATE ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}")

if(UNIX AND NOT APPLE)
    target_link_libraries(test_core_start PRIVATE rt)
endif()

add_test(NAME test_core_start COMMAND test_core_start)

# Test: the portable scheduler core: admission, order, the phases of a scan, deadlines, the fault latch and the safe
# state, through a fake port (RT-008, RT-014, RT-018). Also run under the sanitizers.
add_executable(test_sched_core
    tests/test_sched_core.c
    src/core/zplc_sched_core.c
    src/core/zplc_core.c
    src/core/zplc_loader.c
    src/core/zplc_comm_dispatch.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_sched_core PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_sched_core PRIVATE
    ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}"
    ZPLC_CORE_TESTING
)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_sched_core PRIVATE rt)
endif()

add_test(NAME test_sched_core COMMAND test_sched_core)

# Test: time is latched once per scan, and the instruction budget charges the bytes a string opcode processes
# (RT-006). Also run under the sanitizers.
add_executable(test_vm_scan
    tests/test_vm_scan.c
    src/core/zplc_core.c
    src/core/zplc_loader.c
    src/core/zplc_comm_dispatch.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_vm_scan PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/include
)

target_compile_definitions(test_vm_scan PRIVATE
    ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}"
    ZPLC_CORE_TESTING
)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_vm_scan PRIVATE rt)
endif()

add_test(NAME test_vm_scan COMMAND test_vm_scan)

# Test: the fail-safe decisions: the reset cause, the record of a fault, the start policy and the watchdog policy
# of a profile (RT-019 to RT-022). Also run under the sanitizers.
add_executable(test_failsafe
    tests/test_failsafe.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_failsafe PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(test_failsafe PRIVATE zplc_core)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_failsafe PRIVATE rt)
endif()

add_test(NAME test_failsafe COMMAND test_failsafe)

# Test: the single-task configuration runs on the scheduler core and decides like the multitask runtimes (RT-018).
# Also run under the sanitizers.
add_executable(test_single_task
    tests/test_single_task.c
    src/core/zplc_single_task.c
    src/core/zplc_sched_core.c
    src/core/zplc_exchange.c
    src/core/zplc_core.c
    src/core/zplc_loader.c
    src/core/zplc_comm_dispatch.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_single_task PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/include
)

target_compile_definitions(test_single_task PRIVATE
    ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}"
    ZPLC_CORE_TESTING
)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_single_task PRIVATE rt)
endif()

add_test(NAME test_single_task COMMAND test_single_task)

# Test: the safe value a project declares for an output decides the level of its pin (RT-023). It brings its own
# board (an I/O table and a recording pin driver) and no HAL: the core's HAL needs are a mutex and a tick.
# Also run under the sanitizers.
add_executable(test_safe_state
    tests/test_safe_state.c
    src/core/zplc_sched_core.c
    src/core/zplc_exchange.c
    src/core/zplc_core.c
    src/core/zplc_loader.c
    src/core/zplc_comm_dispatch.c
)

target_include_directories(test_safe_state PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/include
)

target_compile_definitions(test_safe_state PRIVATE
    ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}"
)

add_test(NAME test_safe_state COMMAND test_safe_state)

# Test: the exchange between the scan and the threads outside it: write queue, force-aware latch, published
# snapshot, and a scanner with readers and writers on threads (RT-010, RT-011, RT-012). Also run under the sanitizers.
add_executable(test_exchange
    tests/test_exchange.c
    src/core/zplc_exchange.c
    src/core/zplc_core.c
    src/core/zplc_loader.c
    src/core/zplc_comm_dispatch.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_exchange PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_exchange PRIVATE ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}")

find_package(Threads REQUIRED)
target_link_libraries(test_exchange PRIVATE Threads::Threads)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_exchange PRIVATE rt)
endif()

add_test(NAME test_exchange COMMAND test_exchange)

# Test: the identity a firmware image or the runtime reports (REL-023)
add_executable(test_fw_identity
    tests/test_fw_identity.c
)

target_include_directories(test_fw_identity PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${ZPLC_FW_IDENTITY_DIR}
)

target_compile_definitions(test_fw_identity PRIVATE
    ZPLC_EXPECTED_PRODUCT_VERSION="${ZPLC_CORE_VERSION_STR}"
    ZPLC_EXPECTED_COMMIT="${ZPLC_FW_IDENTITY_COMMIT}"
)

add_test(NAME test_fw_identity COMMAND test_fw_identity)

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

# The integration tests load examples/*.zplc by a path relative to the repository root.
add_test(NAME test_vm_core COMMAND test_vm_core
         WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../../..)

# Test: VM arithmetic edge cases (RT-005); also run under the sanitizers
add_executable(test_vm_arith_edges
    tests/test_vm_arith_edges.c
    src/core/zplc_core.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_vm_arith_edges PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_vm_arith_edges PRIVATE ZPLC_CORE_TESTING)

target_link_libraries(test_vm_arith_edges PRIVATE zplc_core)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_vm_arith_edges PRIVATE rt)
endif()

add_test(NAME test_vm_arith_edges COMMAND test_vm_arith_edges)

# Test: every opcode of the generated table is executed and checked against a
# reference model (VF-013); a new opcode without a case fails this test. Also
# run under the sanitizers.
add_executable(test_opcode_coverage
    tests/test_opcode_coverage.c
    src/core/zplc_core.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_opcode_coverage PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_opcode_coverage PRIVATE ZPLC_CORE_TESTING)

target_link_libraries(test_opcode_coverage PRIVATE zplc_core)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_opcode_coverage PRIVATE rt)
endif()

add_test(NAME test_opcode_coverage COMMAND test_opcode_coverage)

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
    ${ZPLC_FW_IDENTITY_DIR}
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

# Test: the host session decides what the firmware decides: the same scenario and the same golden trace as
# firmware/tests/scheduler_equivalence (RT-008). Also run under the sanitizers.
add_executable(test_sched_equivalence
    tests/test_sched_equivalence.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/native_runtime_session.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/native_program_store.c
    src/core/zplc_core.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_sched_equivalence PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${ZPLC_FW_IDENTITY_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/include
)

target_link_libraries(test_sched_equivalence PRIVATE zplc_core)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_sched_equivalence PRIVATE rt)
endif()

add_test(NAME test_sched_equivalence COMMAND test_sched_equivalence)

# Test: POSIX host stdio polling behavior
add_executable(test_host_stdio
    tests/test_host_stdio.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../apps/posix_host/src/host_stdio.c
)

target_include_directories(test_host_stdio PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
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

# Test: RETAIN persistence module (RT-025, RT-026, RT-027): record format, two
# alternating slots, identity and layout checks, power cut sweep. Also run under
# the sanitizers.
add_executable(test_retain
    tests/test_retain.c
    src/core/zplc_retain.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_retain PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_compile_definitions(test_retain PRIVATE ZPLC_HAL_PERSIST_TESTING)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_retain PRIVATE rt)
endif()

add_test(NAME test_retain COMMAND test_retain)

# Test: POSIX HAL mutex behavior
add_executable(test_hal_posix_mutex
    tests/test_hal_posix_mutex.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_hal_posix_mutex PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_test(NAME test_hal_posix_mutex COMMAND test_hal_posix_mutex)

# Test: the I/O table accessors every port shares (IO-001, IO-002, IO-007)
add_executable(test_io_table
    tests/test_io_table.c
)

target_include_directories(test_io_table PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

add_test(NAME test_io_table COMMAND test_io_table)

# Test: the POSIX port's I/O table is empty and reachable through them
add_executable(test_hal_posix_io_table
    tests/test_hal_posix_io_table.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_hal_posix_io_table PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_hal_posix_io_table PRIVATE rt)
endif()

add_test(NAME test_hal_posix_io_table COMMAND test_hal_posix_io_table)

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

# Test: sandbox closure of the VM and the loader (RT-001, RT-002, RT-003);
# also run under the sanitizers: they are the oracle for "never outside PLC memory"
add_executable(test_sandbox
    tests/test_sandbox.c
    src/core/zplc_core.c
    src/core/zplc_loader.c
    src/core/zplc_comm_dispatch.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_sandbox PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_sandbox PRIVATE ZPLC_CORE_TESTING)

target_link_libraries(test_sandbox PRIVATE zplc_core)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_sandbox PRIVATE rt)
endif()

add_test(NAME test_sandbox COMMAND test_sandbox)

# The same suite on a build whose WORK and RETAIN memory are larger than their
# windows of the address space (a legal Kconfig value: nothing bounds it). A
# region ends where the next one begins, however large its storage is
# (RT-001), so every row of the suite must come out as on the default build.
add_executable(test_sandbox_regions
    tests/test_sandbox.c
    src/core/zplc_core.c
    src/core/zplc_loader.c
    src/core/zplc_comm_dispatch.c
    src/hal/posix/zplc_hal_posix.c
)

target_include_directories(test_sandbox_regions PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_definitions(test_sandbox_regions PRIVATE
    ZPLC_CORE_TESTING
    ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}"
    CONFIG_ZPLC_WORK_MEMORY_SIZE=0x3000U
    CONFIG_ZPLC_RETAIN_MEMORY_SIZE=0x2000U
)

if(UNIX AND NOT APPLE)
    target_link_libraries(test_sandbox_regions PRIVATE rt)
endif()

add_test(NAME test_sandbox_regions COMMAND test_sandbox_regions)

# Test: the communication handlers of firmware/app against crafted blocks
# (COM-001). The handler sources are compiled on the host against a stand-in
# for the few Zephyr calls they make; no Zephyr, no target.
set(ZPLC_APP_SRC ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src)

add_executable(test_comm_fb_access
    tests/test_comm_fb_access.c
)
target_include_directories(test_comm_fb_access PRIVATE ${ZPLC_APP_SRC})
add_test(NAME test_comm_fb_access COMMAND test_comm_fb_access)

# Strict parsing of operator and cloud input: the header the Zephyr shell and the cloud clients use
add_executable(test_parse
    tests/test_parse.c
)
target_include_directories(test_parse PRIVATE
    ${ZPLC_APP_SRC}
)
add_test(NAME test_parse COMMAND test_parse)

add_executable(test_comm_handler_modbus
    tests/test_comm_handler_modbus.c
)
target_include_directories(test_comm_handler_modbus PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/stubs
    ${ZPLC_APP_SRC}
    ${CMAKE_CURRENT_SOURCE_DIR}/../../app/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_link_libraries(test_comm_handler_modbus PRIVATE zplc_core)
add_test(NAME test_comm_handler_modbus COMMAND test_comm_handler_modbus)

add_executable(test_comm_handler_mqtt
    tests/test_comm_handler_mqtt.c
)
target_include_directories(test_comm_handler_mqtt PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/stubs
    ${ZPLC_APP_SRC}
    ${CMAKE_CURRENT_SOURCE_DIR}/../../app/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_link_libraries(test_comm_handler_mqtt PRIVATE zplc_core)
add_test(NAME test_comm_handler_mqtt COMMAND test_comm_handler_mqtt)

add_executable(test_comm_handler_cloud
    tests/test_comm_handler_cloud.c
)
target_include_directories(test_comm_handler_cloud PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/stubs
    ${ZPLC_APP_SRC}
    ${CMAKE_CURRENT_SOURCE_DIR}/../../app/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_link_libraries(test_comm_handler_cloud PRIVATE zplc_core)
add_test(NAME test_comm_handler_cloud COMMAND test_comm_handler_cloud)

# Custom target to run all tests
add_custom_target(check
    COMMAND ${CMAKE_CTEST_COMMAND} --output-on-failure
    DEPENDS test_isa test_contract test_vm_core test_vm_arith_edges test_opcode_coverage test_comm_dispatch test_loader_verify test_native_runtime_session test_host_stdio test_hal_posix_persist test_hal_posix_mutex
    COMMENT "Running all tests..."
)

# The tests above join the check target without touching its list
add_dependencies(check test_sandbox test_sandbox_regions test_comm_fb_access test_comm_handler_modbus
                 test_comm_handler_mqtt test_comm_handler_cloud test_retain test_parse
                 test_io_table test_hal_posix_io_table)

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
