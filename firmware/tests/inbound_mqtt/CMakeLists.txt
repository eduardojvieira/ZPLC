cmake_minimum_required(VERSION 3.20.0)
list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_inbound_mqtt)

# The MQTT client of the product, compiled as it is on a board (its own
# Sparkplug B protobuf files included) against a core that is not the real
# one: the symbols that would give a message authority over the runtime are
# traps that count a call (see src/main.c).
set(ZPLC_APP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../app)

list(APPEND CMAKE_MODULE_PATH ${ZEPHYR_BASE}/modules/nanopb)
include(nanopb)
set(NANOPB_GENERATE_CPP_STANDALONE OFF)
nanopb_generate_cpp(proto_srcs proto_hdrs RELPATH ${ZPLC_APP_DIR}
  ${ZPLC_APP_DIR}/proto/sparkplug_b.proto)
target_include_directories(app PUBLIC ${CMAKE_CURRENT_BINARY_DIR})
target_sources(app PRIVATE ${proto_srcs} ${proto_hdrs})
add_custom_target(zplc_inbound_mqtt_proto DEPENDS ${proto_hdrs})
add_dependencies(nanopb_generated_headers zplc_inbound_mqtt_proto)
add_dependencies(app nanopb_generated_headers)

target_sources(app PRIVATE
  src/main.c
  ${ZPLC_APP_DIR}/src/zplc_mqtt.c
  ${ZPLC_APP_DIR}/src/zplc_mqtt_command.c
  ${ZPLC_APP_DIR}/src/zplc_config.c
)
target_include_directories(app PRIVATE
  ${ZPLC_APP_DIR}/src
  ${ZPLC_APP_DIR}/include
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/include
)
