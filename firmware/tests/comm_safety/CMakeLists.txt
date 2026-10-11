cmake_minimum_required(VERSION 3.20.0)
list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_comm_safety)

# COM-022: the application's own guard, applied to this build too: the raw
# memory command of the Zephyr shell is built only together with the
# diagnostic switch.
include(${CMAKE_CURRENT_SOURCE_DIR}/../../app/cmake/zplc_shell_rules.cmake)
zplc_check_shell_rules("${CONFIG_DEVMEM_SHELL}" "${CONFIG_ZPLC_SHELL_RAW_MEMORY}")

target_sources(app PRIVATE
  src/main.c
  src/runtime_stubs.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/shell_cmds.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/zplc_config.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/zplc_time.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/program_store.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/program_boot_restore.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/program_admission.c
)
target_include_directories(app PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/include
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/tests/include
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/include
)

# The files of the runtime compiled into this application are optimized across files as the product's are
# (CONFIG_ZPLC_LTO), so that the suite exercises the code that ships.
if(COMMAND zplc_target_lto)
  zplc_target_lto(app)
endif()
