cmake_minimum_required(VERSION 3.20.0)
list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_port_timing)

# The timing self-test of the port conformance suite (IO-013): the same header that the POSIX host runs, over the clock
# of the Zephyr HAL that the product links.
target_sources(app PRIVATE src/main.c)
target_include_directories(app PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/tests/include
)
