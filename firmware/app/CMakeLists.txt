# =============================================================================
# ZPLC Zephyr Verification Application
# =============================================================================
# SPDX-License-Identifier: MIT
#
# Minimal Zephyr application to test the ZPLC module build.
# =============================================================================

cmake_minimum_required(VERSION 3.20.0)

# Tell Zephyr where the ZPLC module lives so its Kconfig and CMakeLists.txt
# are always found, regardless of whether the workspace symlink exists.
# ZEPHYR_EXTRA_MODULES must be set BEFORE find_package(Zephyr).
get_filename_component(_ZPLC_FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/.." ABSOLUTE)
list(APPEND ZEPHYR_EXTRA_MODULES "${_ZPLC_FIRMWARE_DIR}")

# Find Zephyr - this sets up the entire Zephyr build system
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})

project(zplc_zephyr_app)

target_sources(app PRIVATE
    src/main.c
    src/zplc_config.c
    src/zplc_modbus.c
    src/zplc_modbus_client.c
    src/zplc_comm_modbus_handler.c
    src/zplc_time.c
)

if(CONFIG_MQTT_LIB)
  target_sources(app PRIVATE
      src/zplc_comm_mqtt_handler.c
      src/zplc_comm_cloud_handler.c
      src/zplc_mqtt.c
      src/zplc_azure_sas.c
      src/zplc_azure_dps.c
      src/zplc_aws_fleet.c
  )
endif()

if(CONFIG_SHELL)
  target_sources(app PRIVATE src/shell_cmds.c)
endif()

target_include_directories(app PRIVATE
    include
)

# Sparkplug protobuf sources must always be generated from canonical proto inputs.
if(CONFIG_NANOPB)
  list(APPEND CMAKE_MODULE_PATH ${ZEPHYR_BASE}/modules/nanopb)
  include(nanopb)
  zephyr_nanopb_sources(app proto/sparkplug_b.proto)
endif()
