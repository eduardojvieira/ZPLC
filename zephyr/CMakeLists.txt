# =============================================================================
# ZPLC Zephyr Module CMakeLists.txt
# =============================================================================
# SPDX-License-Identifier: MIT
#
# This file is invoked by Zephyr's build system when ZPLC is used as a module.
# It registers the ZPLC library with Zephyr.
# =============================================================================

if(CONFIG_ZPLC)

  zephyr_library_named(zplc)

  # Core VM sources (platform-independent)
  zephyr_library_sources(
    ${ZEPHYR_CURRENT_MODULE_DIR}/src/core/zplc_core.c
  )

  # Zephyr HAL implementation
  zephyr_library_sources(
    ${ZEPHYR_CURRENT_MODULE_DIR}/src/hal/zephyr/zplc_hal_zephyr.c
  )

  # Include paths
  zephyr_library_include_directories(
    ${ZEPHYR_CURRENT_MODULE_DIR}/include
  )

  # Make headers available to applications
  zephyr_include_directories(
    ${ZEPHYR_CURRENT_MODULE_DIR}/include
  )

endif()
