cmake_minimum_required(VERSION 3.20.0)
list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_program_store)

target_sources(app PRIVATE
  src/main.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/program_store.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/src/core/zplc_loader.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/src/core/zplc_program_store.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/src/hal/zephyr/zplc_verify_scratch_zephyr.c
)
target_include_directories(app PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/include
)

# The store is as large as the code region (RT-028) and the suite's programs are a few hundred bytes: a small code
# region keeps the working buffers inside the 64 KB of qemu_cortex_m3.
target_compile_definitions(app PRIVATE CONFIG_ZPLC_CODE_SIZE_MAX=4096)

# The files of the runtime compiled into this application are optimized across files as the product's are
# (CONFIG_ZPLC_LTO), so that the suite exercises the code that ships.
if(COMMAND zplc_target_lto)
  zplc_target_lto(app)
endif()
