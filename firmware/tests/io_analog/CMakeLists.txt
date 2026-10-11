cmake_minimum_required(VERSION 3.20.0)

# `ok`: two analog inputs on the ADC emulator. `missing`: a required analog input on a converter channel the
# emulator does not have, so the peripheral cannot be configured and the HAL must fail at initialization.
if(NOT DEFINED ZPLC_IO_VARIANT)
  set(ZPLC_IO_VARIANT ok)
endif()
set(ZPLC_IO_DESCRIPTION ${CMAKE_CURRENT_SOURCE_DIR}/io_${ZPLC_IO_VARIANT}.json)

list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_io_analog)

target_sources(app PRIVATE src/main.c)
target_compile_definitions(app PRIVATE ZPLC_IO_VARIANT_STR="${ZPLC_IO_VARIANT}")
if(ZPLC_IO_VARIANT STREQUAL "missing")
  target_compile_definitions(app PRIVATE ZPLC_IO_ANALOG_MISSING=1)
endif()
