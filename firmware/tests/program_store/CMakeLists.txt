cmake_minimum_required(VERSION 3.20.0)
list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_program_store)

target_sources(app PRIVATE
  src/main.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/program_store.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/src/core/zplc_loader.c
)
target_include_directories(app PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/include
)
