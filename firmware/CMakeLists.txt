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

  zephyr_library_named(zplc)

  zephyr_library_compile_definitions(ZPLC_CORE_VERSION_STR="${ZPLC_CORE_VERSION_STR}")

  # Core VM sources (platform-independent C99)
  zephyr_library_sources(
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_core.c
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_comm_dispatch.c
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
  )

endif()
