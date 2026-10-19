cmake_minimum_required(VERSION 3.20.0)
list(PREPEND ZEPHYR_EXTRA_MODULES "${CMAKE_CURRENT_SOURCE_DIR}/../..")
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(zplc_mqtt_broker_double)

# The MQTT client of the controller and the handlers of the communication blocks, compiled as they are on a board
# (the Sparkplug B protobuf files included), against a broker written for the test (COM-006).
set(ZPLC_APP_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../app)

list(APPEND CMAKE_MODULE_PATH ${ZEPHYR_BASE}/modules/nanopb)
include(nanopb)
set(NANOPB_GENERATE_CPP_STANDALONE OFF)
nanopb_generate_cpp(proto_srcs proto_hdrs RELPATH ${ZPLC_APP_DIR}
  ${ZPLC_APP_DIR}/proto/sparkplug_b.proto)
target_include_directories(app PUBLIC ${CMAKE_CURRENT_BINARY_DIR})
target_sources(app PRIVATE ${proto_srcs} ${proto_hdrs})
add_custom_target(zplc_mqtt_broker_double_proto DEPENDS ${proto_hdrs})
add_dependencies(nanopb_generated_headers zplc_mqtt_broker_double_proto)
add_dependencies(app nanopb_generated_headers)

target_sources(app PRIVATE
  src/main.c
  ${ZPLC_APP_DIR}/src/zplc_mqtt.c
  ${ZPLC_APP_DIR}/src/zplc_mqtt_command.c
  ${ZPLC_APP_DIR}/src/zplc_config.c
  ${ZPLC_APP_DIR}/src/zplc_comm_mqtt_handler.c
  ${ZPLC_APP_DIR}/src/zplc_comm_cloud_handler.c
)
target_include_directories(app PRIVATE
  ${ZPLC_APP_DIR}/src
  ${ZPLC_APP_DIR}/include
  ${CMAKE_CURRENT_SOURCE_DIR}/../../lib/zplc_core/include
)

if(COMMAND zplc_target_lto)
  zplc_target_lto(app)
endif()
