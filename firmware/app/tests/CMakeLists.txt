# =============================================================================
# ZPLC App Tests - CMakeLists.txt
# =============================================================================
# SPDX-License-Identifier: MIT
#
# Host-side (POSIX) tests for firmware/app modules that depend on nanopb.
# Requires the Zephyr build to have been run at least once so that the
# proto-generated files exist in a Zephyr build directory (build_giga/build_disco).
#
# Usage:
#   mkdir build && cd build
#   cmake ..
#   make
#   ctest --output-on-failure
#
# =============================================================================

cmake_minimum_required(VERSION 3.20)

project(zplc_app_tests
    VERSION 1.0.0
    DESCRIPTION "ZPLC App-Layer Unit Tests (host)"
    LANGUAGES C
)

# =============================================================================
# Compiler Configuration — match the core library flags exactly
# =============================================================================

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

add_compile_options(
    -Wall
    -Wextra
    -Werror
    -pedantic
)

# =============================================================================
# Paths
# =============================================================================

set(NANOPB_DIR   "/Users/eduardo/zephyrproject/modules/lib/nanopb"
    CACHE PATH   "Path to nanopb source directory")

set(PROTO_BUILD_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../build_giga/proto"
    CACHE PATH   "Path to Zephyr-generated protobuf output directory")

if(NOT EXISTS "${PROTO_BUILD_DIR}/sparkplug_b.pb.h")
    set(PROTO_BUILD_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../build_disco/proto")
endif()

set(ZPLC_CORE_INC "${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/include"
    CACHE PATH   "Path to zplc_core include directory")

# =============================================================================
# Validate that build artifacts exist
# =============================================================================

if(NOT EXISTS "${PROTO_BUILD_DIR}/sparkplug_b.pb.h")
    message(FATAL_ERROR
        "Proto-generated header not found at ${PROTO_BUILD_DIR}/sparkplug_b.pb.h\n"
        "Run a Zephyr build first, e.g.:\n"
        "  west build -b arduino_giga_r1/stm32h747xx/m7 firmware/app -d firmware/app/build_giga\n"
    )
endif()

# =============================================================================
# nanopb static library
# =============================================================================

add_library(nanopb STATIC
    "${NANOPB_DIR}/pb_encode.c"
    "${NANOPB_DIR}/pb_decode.c"
    "${NANOPB_DIR}/pb_common.c"
)

# nanopb uses _Static_assert which requires C11 — exempt from C99 pedantic rule
set_target_properties(nanopb PROPERTIES C_STANDARD 11 C_EXTENSIONS OFF)
target_compile_options(nanopb PRIVATE -Wno-error)

target_include_directories(nanopb PUBLIC "${NANOPB_DIR}")

# =============================================================================
# sparkplug_b_pb static library (generated protobuf)
# =============================================================================

add_library(sparkplug_b_pb STATIC
    "${PROTO_BUILD_DIR}/sparkplug_b.pb.c"
)

# The generated .pb.c includes "proto/sparkplug_b.pb.h" with the proto/ prefix
# (Zephyr's nanopb generates paths relative to the build root, not the proto dir).
# Add both the proto dir itself AND its parent so both include styles work.
target_include_directories(sparkplug_b_pb PUBLIC
    "${PROTO_BUILD_DIR}"         # direct: #include "sparkplug_b.pb.h"
    "${PROTO_BUILD_DIR}/.."      # prefixed: #include "proto/sparkplug_b.pb.h"
)
set_target_properties(sparkplug_b_pb PROPERTIES C_STANDARD 11 C_EXTENSIONS OFF)
target_compile_options(sparkplug_b_pb PRIVATE -Wno-error)
target_link_libraries(sparkplug_b_pb PUBLIC nanopb)

# =============================================================================
# Test: encode_sparkplug_payload()
# =============================================================================

enable_testing()

add_executable(test_encode_sparkplug_payload
    test_encode_sparkplug_payload.c
)

# The test includes nanopb headers which use _Static_assert (C11). Use C11 here.
# Our ZPLC firmware code is C99; the test harness is allowed to be C11.
set_target_properties(test_encode_sparkplug_payload PROPERTIES C_STANDARD 11 C_EXTENSIONS OFF)

target_include_directories(test_encode_sparkplug_payload PRIVATE
    "${PROTO_BUILD_DIR}"   # sparkplug_b.pb.h
    "${NANOPB_DIR}"        # pb.h, pb_encode.h
    "${ZPLC_CORE_INC}"     # zplc_isa.h (for MEM_* constants — included via stubs)
)

target_link_libraries(test_encode_sparkplug_payload PRIVATE
    sparkplug_b_pb
    nanopb
    m   # -lm for fabsf
)

if(NOT APPLE)
    target_link_libraries(test_encode_sparkplug_payload PRIVATE rt)
endif()

add_test(NAME test_encode_sparkplug_payload COMMAND test_encode_sparkplug_payload)

# =============================================================================
# Custom target: make check
# =============================================================================

add_custom_target(check
    COMMAND ${CMAKE_CTEST_COMMAND} --output-on-failure
    DEPENDS test_encode_sparkplug_payload
    COMMENT "Running ZPLC app tests..."
)

# =============================================================================
# Build info
# =============================================================================

message(STATUS "==============================================")
message(STATUS "ZPLC App Tests Build Configuration")
message(STATUS "==============================================")
message(STATUS "  nanopb:     ${NANOPB_DIR}")
message(STATUS "  proto out:  ${PROTO_BUILD_DIR}")
message(STATUS "  C Standard: C${CMAKE_C_STANDARD}")
message(STATUS "==============================================")
