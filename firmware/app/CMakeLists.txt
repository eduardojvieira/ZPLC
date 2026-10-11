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

# COM-022: the raw memory command of the Zephyr shell is built only into the
# diagnostic image (firmware/app/diagnostic.conf).
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/zplc_shell_rules.cmake)
zplc_check_shell_rules("${CONFIG_DEVMEM_SHELL}" "${CONFIG_ZPLC_SHELL_RAW_MEMORY}")

# COM-016: TLS never runs on a random generator that is not cryptographic.
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/zplc_tls_rng_rule.cmake)
if(CONFIG_MQTT_LIB_TLS OR CONFIG_NET_SOCKETS_SOCKOPT_TLS)
  set(_zplc_tls ON)
else()
  set(_zplc_tls OFF)
endif()
zplc_check_tls_random("${_zplc_tls}" "${CONFIG_TEST_RANDOM_GENERATOR}" "${CONFIG_CSPRNG_ENABLED}")

# RT-028, RT-029: the sizes a board profile advertises to the IDE (boards.json) are the sizes the
# build was configured with. The largest artifact the program store accepts is CONFIG_ZPLC_CODE_SIZE_MAX, and a
# manifest that says another number would make the IDE offer a program the board refuses, or refuse one it holds.
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/boards/boards.json" ZPLC_BOARD_MANIFEST)
string(JSON ZPLC_BOARD_COUNT LENGTH "${ZPLC_BOARD_MANIFEST}")
if(ZPLC_BOARD_COUNT GREATER 0)
  math(EXPR ZPLC_BOARD_LAST "${ZPLC_BOARD_COUNT} - 1")
  foreach(ZPLC_BOARD_INDEX RANGE ${ZPLC_BOARD_LAST})
    string(JSON ZPLC_BOARD_ENTRY GET "${ZPLC_BOARD_MANIFEST}" ${ZPLC_BOARD_INDEX})
    string(JSON ZPLC_BOARD_TARGET GET "${ZPLC_BOARD_ENTRY}" zephyr_board)
    if(ZPLC_BOARD_TARGET STREQUAL "${BOARD}${BOARD_QUALIFIERS}")
      string(JSON ZPLC_BOARD_ID GET "${ZPLC_BOARD_ENTRY}" board_id)
      string(JSON ZPLC_BOARD_MEMORY GET "${ZPLC_BOARD_ENTRY}" memory)
      string(JSON ZPLC_BOARD_CODE GET "${ZPLC_BOARD_MEMORY}" code_size_max)
      string(JSON ZPLC_BOARD_WORK GET "${ZPLC_BOARD_MEMORY}" work_size)
      string(JSON ZPLC_BOARD_RETAIN GET "${ZPLC_BOARD_MEMORY}" retain_size)
      foreach(ZPLC_PAIR
              "code_size_max;${ZPLC_BOARD_CODE};${CONFIG_ZPLC_CODE_SIZE_MAX};CONFIG_ZPLC_CODE_SIZE_MAX"
              "work_size;${ZPLC_BOARD_WORK};${CONFIG_ZPLC_WORK_MEMORY_SIZE};CONFIG_ZPLC_WORK_MEMORY_SIZE"
              "retain_size;${ZPLC_BOARD_RETAIN};${CONFIG_ZPLC_RETAIN_MEMORY_SIZE};CONFIG_ZPLC_RETAIN_MEMORY_SIZE")
        list(GET ZPLC_PAIR 0 ZPLC_KEY)
        list(GET ZPLC_PAIR 1 ZPLC_ADVERTISED)
        list(GET ZPLC_PAIR 2 ZPLC_CONFIGURED)
        list(GET ZPLC_PAIR 3 ZPLC_SYMBOL)
        if(NOT ZPLC_ADVERTISED EQUAL ZPLC_CONFIGURED)
          message(FATAL_ERROR
            "boards/boards.json advertises ${ZPLC_KEY}=${ZPLC_ADVERTISED} for ${ZPLC_BOARD_ID} "
            "but the build is configured with ${ZPLC_SYMBOL}=${ZPLC_CONFIGURED}: the IDE would offer a program "
            "size the board does not accept. Make the two agree.")
        endif()
      endforeach()

      # RT-020: the hardware watchdog of a profile is what its manifest entry says. It is on in a profile that has a
      # hardware record and off in every other (the manifest validator checks that rule); the build is configured
      # the same way, with the same timeouts and the same policy for STOP, a pause and a latched fault.
      string(JSON ZPLC_WDT GET "${ZPLC_BOARD_ENTRY}" watchdog)
      string(JSON ZPLC_WDT_ENABLED GET "${ZPLC_WDT}" enabled)
      string(JSON ZPLC_WDT_TIMEOUT GET "${ZPLC_WDT}" timeout_ms)
      string(JSON ZPLC_WDT_MAX GET "${ZPLC_WDT}" max_timeout_ms)
      string(JSON ZPLC_WDT_STOP GET "${ZPLC_WDT}" stop)
      string(JSON ZPLC_WDT_PAUSE GET "${ZPLC_WDT}" pause)
      string(JSON ZPLC_WDT_FAULT GET "${ZPLC_WDT}" fault)
      if(ZPLC_WDT_ENABLED)
        if(NOT CONFIG_ZPLC_HARDWARE_WATCHDOG)
          message(FATAL_ERROR
            "boards/boards.json enables the hardware watchdog of ${ZPLC_BOARD_ID} (it has a hardware record) "
            "but the build has CONFIG_ZPLC_HARDWARE_WATCHDOG off: set it in the board configuration (RT-020).")
        endif()
        foreach(ZPLC_PAIR
                "timeout_ms;${ZPLC_WDT_TIMEOUT};${CONFIG_ZPLC_HARDWARE_WATCHDOG_TIMEOUT_MS};CONFIG_ZPLC_HARDWARE_WATCHDOG_TIMEOUT_MS"
                "max_timeout_ms;${ZPLC_WDT_MAX};${CONFIG_ZPLC_HARDWARE_WATCHDOG_TIMEOUT_MAX_MS};CONFIG_ZPLC_HARDWARE_WATCHDOG_TIMEOUT_MAX_MS")
          list(GET ZPLC_PAIR 0 ZPLC_KEY)
          list(GET ZPLC_PAIR 1 ZPLC_ADVERTISED)
          list(GET ZPLC_PAIR 2 ZPLC_CONFIGURED)
          list(GET ZPLC_PAIR 3 ZPLC_SYMBOL)
          if(NOT ZPLC_ADVERTISED EQUAL ZPLC_CONFIGURED)
            message(FATAL_ERROR
              "boards/boards.json says watchdog.${ZPLC_KEY}=${ZPLC_ADVERTISED} for ${ZPLC_BOARD_ID} "
              "but the build is configured with ${ZPLC_SYMBOL}=${ZPLC_CONFIGURED}. Make the two agree.")
          endif()
        endforeach()
        if((ZPLC_WDT_STOP STREQUAL "feed") AND NOT CONFIG_ZPLC_WATCHDOG_STOP_FEED)
          message(FATAL_ERROR "boards/boards.json: ${ZPLC_BOARD_ID} feeds its watchdog in STOP; set CONFIG_ZPLC_WATCHDOG_STOP_FEED=y.")
        endif()
        if((ZPLC_WDT_STOP STREQUAL "disarm") AND CONFIG_ZPLC_WATCHDOG_STOP_FEED)
          message(FATAL_ERROR "boards/boards.json: ${ZPLC_BOARD_ID} disarms its watchdog in STOP; unset CONFIG_ZPLC_WATCHDOG_STOP_FEED.")
        endif()
        if((ZPLC_WDT_PAUSE STREQUAL "disarm") AND NOT CONFIG_ZPLC_WATCHDOG_PAUSE_DISARM)
          message(FATAL_ERROR "boards/boards.json: ${ZPLC_BOARD_ID} disarms its watchdog in a pause; set CONFIG_ZPLC_WATCHDOG_PAUSE_DISARM=y.")
        endif()
        if((ZPLC_WDT_PAUSE STREQUAL "feed") AND CONFIG_ZPLC_WATCHDOG_PAUSE_DISARM)
          message(FATAL_ERROR "boards/boards.json: ${ZPLC_BOARD_ID} feeds its watchdog in a pause; unset CONFIG_ZPLC_WATCHDOG_PAUSE_DISARM.")
        endif()
        if((ZPLC_WDT_FAULT STREQUAL "disarm") AND NOT CONFIG_ZPLC_WATCHDOG_FAULT_DISARM)
          message(FATAL_ERROR "boards/boards.json: ${ZPLC_BOARD_ID} disarms its watchdog in a fault; set CONFIG_ZPLC_WATCHDOG_FAULT_DISARM=y.")
        endif()
        if((ZPLC_WDT_FAULT STREQUAL "expire") AND CONFIG_ZPLC_WATCHDOG_FAULT_DISARM)
          message(FATAL_ERROR "boards/boards.json: ${ZPLC_BOARD_ID} lets its watchdog expire in a fault; unset CONFIG_ZPLC_WATCHDOG_FAULT_DISARM.")
        endif()
      elseif(CONFIG_ZPLC_HARDWARE_WATCHDOG)
        message(FATAL_ERROR
          "boards/boards.json keeps the hardware watchdog of ${ZPLC_BOARD_ID} off (no hardware record: RT-020, "
          "HIL-010) but the build enables CONFIG_ZPLC_HARDWARE_WATCHDOG. A watchdog enabled before its reset "
          "timing and safe outputs are recorded could reset a board in the field.")
      endif()
    endif()
  endforeach()
endif()

if(CONFIG_MQTT_LIB_WEBSOCKET)
  if(NOT TARGET subsys__net__lib__mqtt)
    message(FATAL_ERROR "Zephyr MQTT target subsys__net__lib__mqtt is required for the WebSocket net_log workaround")
  endif()
  target_compile_options(subsys__net__lib__mqtt PRIVATE "SHELL:-include zephyr/net/net_log.h")
endif()

target_sources(app PRIVATE
    src/main.c
    src/program_boot_restore.c
    src/program_admission.c
    src/program_store.c
    src/runtime_boot.c
    src/zplc_config.c
    src/zplc_time.c
)

if(CONFIG_MODBUS)
  target_sources(app PRIVATE
      src/zplc_modbus.c
      src/zplc_modbus_tcp.c
      src/zplc_modbus_client.c
      src/zplc_comm_modbus_handler.c
  )
endif()

if(CONFIG_MQTT_LIB)
  target_sources(app PRIVATE
      src/zplc_comm_mqtt_handler.c
      src/zplc_comm_cloud_handler.c
      src/zplc_mqtt.c
      src/zplc_mqtt_command.c
      src/zplc_tls_credentials.c
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

target_compile_options(app PRIVATE -Werror)

# Sparkplug protobuf sources must always be generated from canonical proto inputs.
if(CONFIG_NANOPB)
  list(APPEND CMAKE_MODULE_PATH ${ZEPHYR_BASE}/modules/nanopb)
  include(nanopb)
  zephyr_nanopb_sources(app proto/sparkplug_b.proto)
endif()
