cmake_minimum_required(VERSION 3.20.0)

# The board description under test. The test C code is the same for both: it reads the table the build generated and
# checks the image and the pins against it, so a channel added to the description (the extended one) reaches the image
# and its pin without any change to the firmware sources (IO-002).
if(NOT DEFINED ZPLC_IO_VARIANT)
  set(ZPLC_IO_VARIANT base)
endif()
if(NOT DEFINED ZPLC_IO_DESCRIPTION)
  set(ZPLC_IO_DESCRIPTION ${CMAKE_CURRENT_SOURCE_DIR}/io_${ZPLC_IO_VARIANT}.json)
endif()

list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_io_table)

# What each description needs, so that the test code names no channel: the number of channels and input
# channels and the image bytes the highest address of each direction needs.
if(ZPLC_IO_VARIANT STREQUAL "extended")
  set(_expect 12 5 3 2)
else()
  set(_expect 8 4 1 1)
endif()
list(GET _expect 0 _channels)
list(GET _expect 1 _inputs)
list(GET _expect 2 _input_bytes)
list(GET _expect 3 _output_bytes)

target_sources(app PRIVATE src/main.c)
target_compile_definitions(app PRIVATE
  ZPLC_IO_VARIANT_STR="${ZPLC_IO_VARIANT}"
  EXPECT_CHANNEL_COUNT=${_channels}
  EXPECT_INPUT_CHANNELS=${_inputs}
  EXPECT_INPUT_BYTES=${_input_bytes}
  EXPECT_OUTPUT_BYTES=${_output_bytes}
)
target_include_directories(app PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/src/hal/zephyr
)
