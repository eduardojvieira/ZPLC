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

  set(ZPLC_GIT_VERSION "unknown")
  execute_process(
    COMMAND git -C ${CMAKE_CURRENT_LIST_DIR}/.. describe --tags --always --dirty
    OUTPUT_VARIABLE ZPLC_GIT_VERSION
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
  )
  if(ZPLC_GIT_VERSION STREQUAL "")
    set(ZPLC_GIT_VERSION "unknown")
  endif()
  string(REGEX REPLACE "^v" "" ZPLC_GIT_VERSION "${ZPLC_GIT_VERSION}")

  zephyr_library_named(zplc)

  zephyr_library_compile_definitions(ZPLC_CORE_VERSION_STR="${ZPLC_GIT_VERSION}")

  # Core VM sources (platform-independent C99)
  zephyr_library_sources(
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/src/core/zplc_core.c
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
