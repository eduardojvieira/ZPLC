cmake_minimum_required(VERSION 3.20.0)

# On native_sim the board is the description and the devicetree of the I/O table test (four outputs on pins 0 to 3,
# four inputs on pins 8 to 11, all on the GPIO emulator), so the pins of the hold and of the bound inputs are
# observable. qemu_cortex_m3 has no emulator: the cases that need a pin skip there.
if(BOARD MATCHES "native_sim")
  set(ZPLC_IO_DESCRIPTION ${CMAKE_CURRENT_SOURCE_DIR}/../io_table/io_base.json)
  set(DTC_OVERLAY_FILE ${CMAKE_CURRENT_SOURCE_DIR}/../io_table/boards/native_sim_native_64.overlay)
endif()

list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_plant_io)

target_sources(app PRIVATE src/main.c)
target_include_directories(app PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/src/hal/zephyr
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/tests/include
)
