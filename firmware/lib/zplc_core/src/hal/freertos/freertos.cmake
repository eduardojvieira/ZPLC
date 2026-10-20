# =============================================================================
# ZPLC core on FreeRTOS (the POSIX/GCC simulator build)
# =============================================================================
# SPDX-License-Identifier: MIT
#
# Included by firmware/lib/zplc_core/CMakeLists.txt when -DZPLC_PORT=freertos. It builds the portable core, the
# FreeRTOS HAL (src/hal/freertos) and the FreeRTOS POSIX/GCC kernel port into host executables, one for each C suite of
# the port conformance suite (IO-013, IO-016), and registers each with ctest.
#
#   cmake -S firmware/lib/zplc_core -B build -DZPLC_PORT=freertos
#   cmake --build build && ctest --test-dir build --output-on-failure
#
# FreeRTOS-Kernel (MIT) is fetched at the commit pinned below; nothing of it is vendored into the repository. Offline,
# point -DFETCHCONTENT_SOURCE_DIR_FREERTOS_KERNEL at a checkout of that commit.

include(FetchContent)
enable_testing()

# V11.3.2, 2026: `git ls-remote --tags` peels the tag to this commit.
set(ZPLC_FREERTOS_KERNEL_VERSION "V11.3.2")
set(ZPLC_FREERTOS_KERNEL_SHA "8a59a4b19bf72977819feddef87d41163ced7004")

set(ZPLC_FREERTOS_DIR ${CMAKE_CURRENT_LIST_DIR})
set(ZPLC_CORE_DIR ${CMAKE_CURRENT_SOURCE_DIR})

# The kernel is configured by an interface target, as the kernel's own CMakeLists asks.
add_library(freertos_config INTERFACE)
target_include_directories(freertos_config SYSTEM INTERFACE ${ZPLC_FREERTOS_DIR})
target_compile_definitions(freertos_config INTERFACE projCOVERAGE_TEST=0)

set(FREERTOS_PORT GCC_POSIX CACHE STRING "FreeRTOS port: the POSIX/GCC simulator" FORCE)
set(FREERTOS_HEAP 3 CACHE STRING "heap_3: the heap of the C library" FORCE)

FetchContent_Declare(freertos_kernel
    GIT_REPOSITORY https://github.com/FreeRTOS/FreeRTOS-Kernel.git
    GIT_TAG ${ZPLC_FREERTOS_KERNEL_SHA}
)
FetchContent_MakeAvailable(freertos_kernel)

# The kernel is third-party code: it is built with the GNU dialect its POSIX port is written in, and its warnings are
# not ours. The ZPLC sources keep C99 with no extensions.
foreach(kernel_target freertos_kernel freertos_kernel_port)
    if(TARGET ${kernel_target})
        set_target_properties(${kernel_target} PROPERTIES C_STANDARD 11 C_EXTENSIONS ON)
        target_compile_options(${kernel_target} PRIVATE -w)
    endif()
endforeach()
find_package(Threads REQUIRED)

# ---- the HAL, the storage and the scheduler adapter -----------------------------------------------------------------
add_library(zplc_hal_freertos STATIC
    ${ZPLC_FREERTOS_DIR}/zplc_hal_freertos.c
    ${ZPLC_FREERTOS_DIR}/zplc_persist_freertos.c
    ${ZPLC_FREERTOS_DIR}/zplc_scheduler_freertos.c
)
target_include_directories(zplc_hal_freertos PUBLIC
    ${ZPLC_CORE_DIR}/include
    ${ZPLC_FREERTOS_DIR}
    ${ZPLC_CORE_DIR}/tests/include
)
# The persistence hooks of the suites (power cut at every operation) are part of this build, as in the POSIX tests.
target_compile_definitions(zplc_hal_freertos PUBLIC ZPLC_HAL_PERSIST_TESTING _POSIX_C_SOURCE=200809L)
target_link_libraries(zplc_hal_freertos PUBLIC freertos_kernel Threads::Threads rt m)
target_compile_options(zplc_hal_freertos PRIVATE -Wall -Wextra -Werror)

# ---- the suites -----------------------------------------------------------------------------------------------------
# One executable for each C suite: the suite's own main() is renamed and called from a FreeRTOS task. The sources are
# those of the suite's CMake target on the POSIX host, with this HAL in place of src/hal/posix.
set(ZPLC_SRC ${ZPLC_CORE_DIR}/src/core)
set(ZPLC_TESTS ${ZPLC_CORE_DIR}/tests)
set(ZPLC_SESSION ${ZPLC_CORE_DIR}/../../apps/posix_host/src)
set(ZPLC_VM ${ZPLC_SRC}/zplc_core.c ${ZPLC_SRC}/zplc_loader.c ${ZPLC_SRC}/zplc_comm_dispatch.c)

# Every suite is registered here and in tools/ci/port-conformance.json, and a test holds the two lists to each other.
function(zplc_freertos_suite name file)
    cmake_parse_arguments(SUITE "" "WORKING_DIRECTORY" "SOURCES;DEFINES" ${ARGN})
    if(NOT IS_ABSOLUTE "${file}")
        set(file ${ZPLC_TESTS}/${file})
    endif()
    add_executable(${name} ${file} ${SUITE_SOURCES} ${ZPLC_FREERTOS_DIR}/zplc_freertos_suite_main.c)
    # Only the suite's main() is renamed, not the runner's.
    set_source_files_properties(${file} PROPERTIES COMPILE_DEFINITIONS main=zplc_suite_main)
    target_compile_definitions(${name} PRIVATE ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}" ${SUITE_DEFINES})
    target_include_directories(${name} PRIVATE
        ${ZPLC_CORE_DIR}/include ${ZPLC_TESTS}/include ${ZPLC_FW_IDENTITY_DIR} ${ZPLC_SESSION} ${ZPLC_TESTS}/fixtures)
    target_link_libraries(${name} PRIVATE zplc_hal_freertos)
    if(NOT SUITE_WORKING_DIRECTORY)
        set(SUITE_WORKING_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR})
    endif()
    add_test(NAME ${name} COMMAND ${name} WORKING_DIRECTORY ${SUITE_WORKING_DIRECTORY})
endfunction()

set(ZPLC_REPO_ROOT ${ZPLC_CORE_DIR}/../../..)
set(TESTING ZPLC_CORE_TESTING)

# opcodes
zplc_freertos_suite(test_isa test_isa.c)
zplc_freertos_suite(test_vm_core test_vm_core.c SOURCES ${ZPLC_VM} DEFINES ${TESTING} WORKING_DIRECTORY ${ZPLC_REPO_ROOT})
zplc_freertos_suite(test_vm_arith_edges test_vm_arith_edges.c SOURCES ${ZPLC_VM} DEFINES ${TESTING})
zplc_freertos_suite(test_opcode_coverage test_opcode_coverage.c SOURCES ${ZPLC_VM} DEFINES ${TESTING})
# loader
zplc_freertos_suite(test_loader_verify test_loader_verify.c SOURCES ${ZPLC_SRC}/zplc_loader.c
    DEFINES ZPLC_LOADER_FIXTURE_PATH="${ZPLC_TESTS}/fixtures/zplc-v1-code-task-tags.hex")
zplc_freertos_suite(test_sandbox test_sandbox.c SOURCES ${ZPLC_VM} DEFINES ${TESTING})
zplc_freertos_suite(test_sandbox_regions test_sandbox.c SOURCES ${ZPLC_VM}
    DEFINES ${TESTING} CONFIG_ZPLC_WORK_MEMORY_SIZE=0x3000U CONFIG_ZPLC_RETAIN_MEMORY_SIZE=0x2000U)
# scheduler
zplc_freertos_suite(test_sched_core test_sched_core.c SOURCES ${ZPLC_SRC}/zplc_sched_core.c ${ZPLC_VM} DEFINES ${TESTING})
zplc_freertos_suite(test_sched_equivalence test_sched_equivalence.c
    SOURCES ${ZPLC_SESSION}/native_runtime_session.c ${ZPLC_SESSION}/native_program_store.c ${ZPLC_VM}
        ${ZPLC_SRC}/zplc_retain.c ${ZPLC_SRC}/zplc_program_store.c ${ZPLC_SRC}/zplc_sched_core.c ${ZPLC_SRC}/zplc_exchange.c
        ${ZPLC_SRC}/zplc_failsafe.c ${ZPLC_SRC}/zplc_io_trace.c)
zplc_freertos_suite(test_single_task test_single_task.c
    SOURCES ${ZPLC_SRC}/zplc_single_task.c ${ZPLC_SRC}/zplc_sched_core.c ${ZPLC_SRC}/zplc_exchange.c ${ZPLC_VM} DEFINES ${TESTING})
zplc_freertos_suite(test_failsafe test_failsafe.c SOURCES ${ZPLC_SRC}/zplc_failsafe.c ${ZPLC_SRC}/zplc_sched_core.c ${ZPLC_VM})
zplc_freertos_suite(test_native_runtime_session test_native_runtime_session.c
    SOURCES ${ZPLC_SESSION}/native_runtime_session.c ${ZPLC_SESSION}/native_program_store.c ${ZPLC_SRC}/zplc_core.c
    DEFINES ZPLC_EXPECTED_PRODUCT_VERSION="${ZPLC_CORE_VERSION_STR}")
target_link_libraries(test_native_runtime_session PRIVATE zplc_core)
# timing
zplc_freertos_suite(test_port_timing test_port_timing.c DEFINES ZPLC_TEST_PORT_NAME="FreeRTOS")
# io-table
zplc_freertos_suite(test_io_table test_io_table.c)
# storage
zplc_freertos_suite(test_program_store test_program_store.c SOURCES ${ZPLC_SRC}/zplc_program_store.c)
zplc_freertos_suite(test_retain test_retain.c SOURCES ${ZPLC_SRC}/zplc_retain.c)

# ---- suites of the FreeRTOS port itself --------------------------------------------------------------------------------
# They test what only this port has: the adapter of the scheduler core on the kernel's timers and tasks, the simulated
# board behind the I/O table, the clock, the locks and the storage of the HAL, and the runner.
set(ZPLC_FR_TESTS ${ZPLC_FREERTOS_DIR}/tests)
zplc_freertos_suite(test_freertos_scheduler ${ZPLC_FR_TESTS}/test_freertos_scheduler.c
    SOURCES ${ZPLC_SRC}/zplc_sched_core.c ${ZPLC_VM})
zplc_freertos_suite(test_hal_freertos ${ZPLC_FR_TESTS}/test_hal_freertos.c)
zplc_freertos_suite(test_hal_freertos_io_table ${ZPLC_FR_TESTS}/test_hal_freertos_io_table.c SOURCES ${ZPLC_SRC}/zplc_sched_core.c ${ZPLC_VM})
# The runner passes a failing suite's result on: this one fails on purpose, and the run is green only if it does.
zplc_freertos_suite(test_runner_exit_code ${ZPLC_FR_TESTS}/test_runner_exit_code.c)
set_tests_properties(test_runner_exit_code PROPERTIES WILL_FAIL TRUE)
