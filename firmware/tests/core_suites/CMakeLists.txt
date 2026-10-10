# =============================================================================
# ZPLC core suites on Zephyr targets
# =============================================================================
# SPDX-License-Identifier: MIT
#
# Runs the plain C suites of firmware/lib/zplc_core/tests (the same source files
# the host CMake project runs under ctest) on any Zephyr target, so that the VM,
# the loader verifier and the dispatch table are exercised on a 32-bit CPU
# (VF-015) and not only on the 64-bit host.
#
# One build is one suite: testcase.yaml selects it with ZPLC_CORE_SUITE.
# CONFIG_ZPLC is deliberately off. The suites need the test-owned copy of the
# core (ZPLC_CORE_TESTING), which the product module must not export.
# =============================================================================
cmake_minimum_required(VERSION 3.20.0)

find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_core_suites)

set(ZPLC_CORE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core)
set(ZPLC_CORE_TESTS_DIR ${ZPLC_CORE_DIR}/tests)

set(ZPLC_CORE_SUITES isa vm_core vm_arith_edges comm_dispatch loader_verify)
if(NOT ZPLC_CORE_SUITE IN_LIST ZPLC_CORE_SUITES)
  message(FATAL_ERROR
    "ZPLC_CORE_SUITE must be one of: ${ZPLC_CORE_SUITES} (got '${ZPLC_CORE_SUITE}')")
endif()

set(ZPLC_SUITE_SOURCE ${ZPLC_CORE_TESTS_DIR}/test_${ZPLC_CORE_SUITE}.c)

file(READ ${CMAKE_CURRENT_SOURCE_DIR}/../../../package.json ZPLC_PACKAGE_JSON)
string(JSON ZPLC_CORE_VERSION_STR GET "${ZPLC_PACKAGE_JSON}" version)

# Memory profile of the VM under test, chosen per scenario in testcase.yaml so
# that every result names the sizes it was obtained with (RT-029 makes these
# product Kconfig options; until then the suites set the macros zplc_isa.h
# reads). The process images stay at their ISA-fixed 4 KB each in every profile.
#   default  ISA defaults: 8 KB work, 4 KB retentive, 44 KB code (64-bit host,
#            32-bit native_sim)
#   small    for 64 KB of RAM (qemu_cortex_m3)
#   tiny     for 16 KB of RAM (qemu_cortex_m0); also fewer tags and shallower stacks
set(ZPLC_SUITE_PROFILE default CACHE STRING "VM memory profile: default, small or tiny")
set(ZPLC_SUITE_PROFILE_DEFINITIONS)
if(ZPLC_SUITE_PROFILE STREQUAL "small")
  set(ZPLC_SUITE_PROFILE_DEFINITIONS
    CONFIG_ZPLC_WORK_MEMORY_SIZE=4096
    CONFIG_ZPLC_RETAIN_MEMORY_SIZE=2048
    CONFIG_ZPLC_CODE_SIZE_MAX=16384)
elseif(ZPLC_SUITE_PROFILE STREQUAL "tiny")
  set(ZPLC_SUITE_PROFILE_DEFINITIONS
    CONFIG_ZPLC_WORK_MEMORY_SIZE=256
    CONFIG_ZPLC_RETAIN_MEMORY_SIZE=64
    CONFIG_ZPLC_CODE_SIZE_MAX=512
    CONFIG_ZPLC_STACK_DEPTH=32
    CONFIG_ZPLC_CALL_STACK_DEPTH=8
    ZPLC_MAX_TAGS=4)
elseif(NOT ZPLC_SUITE_PROFILE STREQUAL "default")
  message(FATAL_ERROR "ZPLC_SUITE_PROFILE must be default, small or tiny")
endif()

target_sources(app PRIVATE src/main.c src/test_hal.c ${ZPLC_SUITE_SOURCE})
target_include_directories(app PRIVATE ${ZPLC_CORE_DIR}/include)

# The suite's own main() becomes the function src/main.c calls.
set_source_files_properties(${ZPLC_SUITE_SOURCE} PROPERTIES
  COMPILE_DEFINITIONS "main=zplc_core_suite_main")
target_compile_definitions(app PRIVATE
  ZPLC_CORE_SUITE_NAME="${ZPLC_CORE_SUITE}"
  ZPLC_TEST_NO_FILE_IO)

# The core and its suites build with the host project's warning level, as errors.
set_source_files_properties(${ZPLC_SUITE_SOURCE} PROPERTIES
  COMPILE_OPTIONS "-Wall;-Wextra;-Werror")

# The VM, the dispatch table and the loader, compiled as the host project does.
if(ZPLC_CORE_SUITE STREQUAL "vm_core" OR ZPLC_CORE_SUITE STREQUAL "vm_arith_edges"
   OR ZPLC_CORE_SUITE STREQUAL "loader_verify")
  target_sources(app PRIVATE ${ZPLC_CORE_DIR}/src/core/zplc_loader.c)
endif()
if(ZPLC_CORE_SUITE STREQUAL "vm_core" OR ZPLC_CORE_SUITE STREQUAL "vm_arith_edges")
  target_sources(app PRIVATE
    ${ZPLC_CORE_DIR}/src/core/zplc_core.c
    ${ZPLC_CORE_DIR}/src/core/zplc_comm_dispatch.c)
  set_source_files_properties(${ZPLC_CORE_DIR}/src/core/zplc_core.c PROPERTIES
    COMPILE_DEFINITIONS "ZPLC_CORE_TESTING;ZPLC_CORE_VERSION_STR=\"${ZPLC_CORE_VERSION_STR}\"")
elseif(ZPLC_CORE_SUITE STREQUAL "comm_dispatch")
  target_sources(app PRIVATE ${ZPLC_CORE_DIR}/src/core/zplc_comm_dispatch.c)
endif()

set_source_files_properties(
  ${ZPLC_CORE_DIR}/src/core/zplc_core.c
  ${ZPLC_CORE_DIR}/src/core/zplc_comm_dispatch.c
  ${ZPLC_CORE_DIR}/src/core/zplc_loader.c
  PROPERTIES COMPILE_OPTIONS "-Wall;-Wextra;-Werror")

# loader_verify reads its fixture from a file on the host. A Zephyr target has
# no file system here, so the same hex text is compiled in.
if(ZPLC_CORE_SUITE STREQUAL "loader_verify")
  file(READ ${ZPLC_CORE_TESTS_DIR}/fixtures/zplc-v1-code-task-tags.hex ZPLC_FIXTURE_HEX)
  string(STRIP "${ZPLC_FIXTURE_HEX}" ZPLC_FIXTURE_HEX)
  set_source_files_properties(${ZPLC_SUITE_SOURCE} PROPERTIES
    COMPILE_DEFINITIONS "main=zplc_core_suite_main;ZPLC_LOADER_FIXTURE_HEX=\"${ZPLC_FIXTURE_HEX}\"")
endif()

target_compile_definitions(app PRIVATE ${ZPLC_SUITE_PROFILE_DEFINITIONS})
