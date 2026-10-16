cmake_minimum_required(VERSION 3.20.0)
list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_verify_scratch)

# The firmware's own program store (app/src/program_store.c) next to the scheduler's validation, on the real Zephyr
# HAL: the two callers of the loader's verifier that share the one workspace of the image.
target_sources(app PRIVATE
  src/main.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/program_store.c
)
target_include_directories(app PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src
)

# The files of the runtime compiled into this application are optimized across files as the product's are
# (CONFIG_ZPLC_LTO), so that the suite exercises the code that ships.
if(COMMAND zplc_target_lto)
  zplc_target_lto(app)
endif()
