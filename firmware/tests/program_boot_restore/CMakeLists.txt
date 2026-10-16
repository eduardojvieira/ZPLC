cmake_minimum_required(VERSION 3.20.0)
list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_program_boot_restore)

target_sources(app PRIVATE
  src/main.c
  src/private_header_check.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/program_boot_restore.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/program_admission.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/program_store.c
)
target_include_directories(app PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/tests/include
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/tests/include
)

# The files of the runtime compiled into this application are optimized across files as the product's are
# (CONFIG_ZPLC_LTO), so that the suite exercises the code that ships.
if(COMMAND zplc_target_lto)
  zplc_target_lto(app)
endif()
