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

  zephyr_library_named(zplc)

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

  # Include paths for library compilation
  zephyr_library_include_directories(
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/include
  )

  # Make headers available to applications
  zephyr_include_directories(
    ${CMAKE_CURRENT_LIST_DIR}/lib/zplc_core/include
  )

endif()
