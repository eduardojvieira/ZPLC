cmake_minimum_required(VERSION 3.20.0)
list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_inbound_authority)

# The inbound side of the device (the Modbus server) is compiled here against a
# core that is not the real one: the only symbols it can resolve are the ones
# main.c defines, and the ones that would give a message authority over the
# runtime (RUN/STOP, forces, program download) are traps that count a call.
# A source that started calling one would link and be caught by the count; the
# application image is checked at link level too, for every board
# (tools/firmware-test/check_inbound_authority.py).
target_sources(app PRIVATE
  src/main.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/zplc_modbus.c
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src/zplc_modbus_tcp.c
)
target_include_directories(app PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/src
  ${CMAKE_CURRENT_SOURCE_DIR}/../../app/include
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/include
)

# The files of the runtime compiled into this application are optimized across files as the product's are
# (CONFIG_ZPLC_LTO), so that the suite exercises the code that ships.
if(COMMAND zplc_target_lto)
  zplc_target_lto(app)
endif()
