# =============================================================================
# ZPLC Firmware - Zephyr Module CMakeLists.txt
# =============================================================================
# SPDX-License-Identifier: MIT
#
# This file is invoked by Zephyr's build system when ZPLC is used as a module.
# It registers the ZPLC library with Zephyr.
#
# Usage:
#   cd firmware && west build -b rpi_pico app
#
# =============================================================================

if(CONFIG_ZPLC)

  file(READ "${CMAKE_CURRENT_LIST_DIR}/../package.json" ZPLC_PACKAGE_JSON)
  string(JSON ZPLC_CORE_VERSION_STR ERROR_VARIABLE ZPLC_VERSION_ERROR GET "${ZPLC_PACKAGE_JSON}" version)
  set(ZPLC_SEMVER_PATTERN "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$")
  if(NOT ZPLC_VERSION_ERROR STREQUAL "NOTFOUND" OR NOT ZPLC_CORE_VERSION_STR MATCHES "${ZPLC_SEMVER_PATTERN}")
    message(FATAL_ERROR "package.json must contain a valid ZPLC product semver version")
  endif()

  # What this image is: version, commit, board, ABI and the CONFIG_ZPLC_* options, as a generated header that the
  # shell reports (REL-023). The generator is shared with the host runtime build.
  include(${CMAKE_CURRENT_LIST_DIR}/../scripts/release/zplc_fw_identity.cmake)
  zplc_generate_fw_identity(
    OUT_DIR ${CMAKE_CURRENT_BINARY_DIR}/zplc_generated
    REPO_ROOT ${CMAKE_CURRENT_LIST_DIR}/..
    VERSION ${ZPLC_CORE_VERSION_STR}
    BOARD "${BOARD}"
  )

  zephyr_library_named(zplc)

  # VF-018: a warning in the ZPLC library is an error, as it is for the application (firmware/app/CMakeLists.txt) and
  # for every host target of the core (firmware/lib/zplc_core/CMakeLists.txt). The twister and board builds of the
  # pinned Zephyr revision print no compiler warning from these sources.
  zephyr_library_compile_options(-Werror)

  zephyr_library_compile_definitions(ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}")

  # Core VM sources (platform-independent C99)
  zephyr_library_sources(
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_core.c
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_comm_dispatch.c
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_program_store.c
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_exchange.c
  )

  # Zephyr HAL implementation
  zephyr_library_sources(
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/hal/zephyr/zplc_hal_zephyr.c
  )

  # Scheduler (optional - enabled via CONFIG_ZPLC_SCHEDULER)
  zephyr_library_sources_ifdef(CONFIG_ZPLC_SCHEDULER
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c
  )

  # HIL Debug support (optional - enabled via CONFIG_ZPLC_HIL_DEBUG)
  zephyr_library_sources_ifdef(CONFIG_ZPLC_HIL_DEBUG
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_debug.c
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/hal/zephyr/zplc_hil_debug_zephyr.c
  )

  # RETAIN persistence (optional - enabled via CONFIG_ZPLC_RETAIN_PERSIST)
  zephyr_library_sources_ifdef(CONFIG_ZPLC_RETAIN_PERSIST
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_retain.c
  )

  # ZPLC Loader (always included if ZPLC is enabled)
  zephyr_library_sources(
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_loader.c
  )

  # Include paths for library compilation
  zephyr_library_include_directories(
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/include
  )

  # Make headers available to applications
  zephyr_include_directories(
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/include
    ${ZPLC_FW_IDENTITY_DIR}
  )

endif()
