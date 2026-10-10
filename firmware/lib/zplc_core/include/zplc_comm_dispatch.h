#ifndef ZPLC_COMM_DISPATCH_H
#define ZPLC_COMM_DISPATCH_H

#include <stdbool.h>
#include <stdint.h>

/* >>> GENERATED (tools/contract/generate.py): comm-kinds. Do not edit. >>> */
/**
 * @brief Communication function block kind identifiers.
 *
 * Encoded as the lower 16 bits of the OP_COMM_EXEC operand.
 */
typedef enum {
  ZPLC_COMM_FB_NONE = 0x0000, /**< No kind; rejected */
  ZPLC_COMM_FB_MB_READ_HREG = 0x0001, /**< Modbus read holding registers */
  ZPLC_COMM_FB_MB_WRITE_HREG = 0x0002, /**< Modbus write holding registers */
  ZPLC_COMM_FB_MB_READ_COIL = 0x0003, /**< Modbus read coils */
  ZPLC_COMM_FB_MB_WRITE_COIL = 0x0004, /**< Modbus write coils */
  ZPLC_COMM_FB_MQTT_CONNECT = 0x000A, /**< MQTT connect */
  ZPLC_COMM_FB_MQTT_PUBLISH = 0x000B, /**< MQTT publish */
  ZPLC_COMM_FB_MQTT_SUBSCRIBE = 0x000C, /**< MQTT subscribe */
  ZPLC_COMM_FB_COMM_STATUS = 0x0014, /**< Status query; no function-block definition in the compiler */
  ZPLC_COMM_FB_AZURE_C2D_RECV = 0x0020, /**< Azure cloud-to-device receive */
  ZPLC_COMM_FB_AZURE_DPS_PROV = 0x0021, /**< Azure DPS provisioning */
  ZPLC_COMM_FB_AZURE_EG_PUB = 0x0022, /**< Azure Event Grid publish */
  ZPLC_COMM_FB_AWS_FLEET_PROV = 0x0030, /**< AWS fleet provisioning */
  ZPLC_COMM_FB_SPB_REBIRTH = 0x0040, /**< Sparkplug B rebirth request */
  /**
   * Sentinel: must be last. All valid kinds are < KIND_MAX.
   * Values at or above this are rejected by zplc_comm_register_handler().
   */
  ZPLC_COMM_FB_KIND_MAX = 0x00FF,
} zplc_comm_fb_kind_t;
/* <<< END GENERATED: comm-kinds <<< */

/* >>> GENERATED (tools/contract/generate.py): comm-status. Do not edit. >>> */
/** @brief Communication status codes written to FB.STATUS. */
typedef enum {
  ZPLC_COMM_OK = 0,
  ZPLC_COMM_BUSY = 1,
  ZPLC_COMM_TIMEOUT = 2,
  ZPLC_COMM_NO_HANDLER = 3,
  ZPLC_COMM_NOT_CONNECTED = 4,
  ZPLC_COMM_QUEUE_FULL = 5,
  ZPLC_COMM_INVALID_ADDR = 6,
  ZPLC_COMM_STRING_OVERFLOW = 7,
  ZPLC_COMM_PROTO_ERROR = 8,
  ZPLC_COMM_AUTH_FAILED = 9,
  ZPLC_COMM_UNKNOWN = 0xFF
} zplc_comm_status_t;
/* <<< END GENERATED: comm-status <<< */

/**
 * @brief Size in bytes of the handshake every communication block starts with
 *        (EN, BUSY, DONE, ERROR, STATUS).
 *
 * A block of a kind that has no layout in the table is exactly this long.
 */
#define ZPLC_COMM_FB_HANDSHAKE_SIZE 8U

/**
 * @brief Comm FB handler function type.
 *
 * @param kind   The function-block kind
 * @param fb_mem The block, fb_len bytes; the handler must not read or write
 *               outside it, and must validate every count or length it reads
 *               from the block against fb_len (COM-001)
 * @param fb_len Length of the block in bytes: the size of the kind from the
 *               table, or ZPLC_COMM_FB_HANDSHAKE_SIZE for a kind without layout
 * @param reset  true to reset the instance, false to execute it
 * @return 0 on success, negative on error
 */
typedef int (*zplc_comm_handler_t)(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                                   uint16_t fb_len, bool reset);

/* >>> GENERATED (tools/contract/generate.py): comm-blocks. Do not edit. >>> */
/**
 * @brief Function-block kinds that have a layout, as an X-macro.
 *
 * Each entry is X(NAME, kind, instance_size_bytes). The core takes the size
 * of a block from this table (RT-002); handlers take member offsets from
 * the ZPLC_COMM_<BLOCK>_<MEMBER>_OFFSET constants below.
 */
#define ZPLC_COMM_FB_TABLE(X) \
  X(MB_READ_HREG, 0x0001, 110) \
  X(MB_WRITE_HREG, 0x0002, 110) \
  X(MB_READ_COIL, 0x0003, 110) \
  X(MB_WRITE_COIL, 0x0004, 110) \
  X(MQTT_CONNECT, 0x000A, 12) \
  X(MQTT_PUBLISH, 0x000B, 190) \
  X(MQTT_SUBSCRIBE, 0x000C, 190) \
  X(AZURE_C2D_RECV, 0x0020, 94) \
  X(AZURE_DPS_PROV, 0x0021, 201) \
  X(AZURE_EG_PUB, 0x0022, 266) \
  X(AWS_FLEET_PROV, 0x0030, 137) \
  X(SPB_REBIRTH, 0x0040, 8)

/**
 * @brief Members of every function block, as an X-macro.
 *
 * Each entry is X(BLOCK, MEMBER, offset, bytes): the byte offset from the
 * instance base address and the bytes the compiler reserves for the member.
 */
#define ZPLC_COMM_MEMBER_TABLE(X) \
  X(MB_READ_HREG, EN, 0, 1) \
  X(MB_READ_HREG, BUSY, 1, 1) \
  X(MB_READ_HREG, DONE, 2, 1) \
  X(MB_READ_HREG, ERROR, 3, 1) \
  X(MB_READ_HREG, STATUS, 4, 4) \
  X(MB_READ_HREG, PROTO, 8, 1) \
  X(MB_READ_HREG, SLAVE_ID, 9, 2) \
  X(MB_READ_HREG, ADDR, 11, 2) \
  X(MB_READ_HREG, COUNT, 13, 2) \
  X(MB_READ_HREG, VALUE, 15, 2) \
  X(MB_READ_HREG, HOST, 18, 85) \
  X(MB_READ_HREG, PORT, 103, 2) \
  X(MB_WRITE_HREG, EN, 0, 1) \
  X(MB_WRITE_HREG, BUSY, 1, 1) \
  X(MB_WRITE_HREG, DONE, 2, 1) \
  X(MB_WRITE_HREG, ERROR, 3, 1) \
  X(MB_WRITE_HREG, STATUS, 4, 4) \
  X(MB_WRITE_HREG, PROTO, 8, 1) \
  X(MB_WRITE_HREG, SLAVE_ID, 9, 2) \
  X(MB_WRITE_HREG, ADDR, 11, 2) \
  X(MB_WRITE_HREG, COUNT, 13, 2) \
  X(MB_WRITE_HREG, VALUE, 15, 2) \
  X(MB_WRITE_HREG, HOST, 18, 85) \
  X(MB_WRITE_HREG, PORT, 103, 2) \
  X(MB_READ_COIL, EN, 0, 1) \
  X(MB_READ_COIL, BUSY, 1, 1) \
  X(MB_READ_COIL, DONE, 2, 1) \
  X(MB_READ_COIL, ERROR, 3, 1) \
  X(MB_READ_COIL, STATUS, 4, 4) \
  X(MB_READ_COIL, PROTO, 8, 1) \
  X(MB_READ_COIL, SLAVE_ID, 9, 2) \
  X(MB_READ_COIL, ADDR, 11, 2) \
  X(MB_READ_COIL, COUNT, 13, 2) \
  X(MB_READ_COIL, VALUE, 15, 1) \
  X(MB_READ_COIL, HOST, 18, 85) \
  X(MB_READ_COIL, PORT, 103, 2) \
  X(MB_WRITE_COIL, EN, 0, 1) \
  X(MB_WRITE_COIL, BUSY, 1, 1) \
  X(MB_WRITE_COIL, DONE, 2, 1) \
  X(MB_WRITE_COIL, ERROR, 3, 1) \
  X(MB_WRITE_COIL, STATUS, 4, 4) \
  X(MB_WRITE_COIL, PROTO, 8, 1) \
  X(MB_WRITE_COIL, SLAVE_ID, 9, 2) \
  X(MB_WRITE_COIL, ADDR, 11, 2) \
  X(MB_WRITE_COIL, COUNT, 13, 2) \
  X(MB_WRITE_COIL, VALUE, 15, 1) \
  X(MB_WRITE_COIL, HOST, 18, 85) \
  X(MB_WRITE_COIL, PORT, 103, 2) \
  X(MQTT_CONNECT, EN, 0, 1) \
  X(MQTT_CONNECT, BUSY, 1, 1) \
  X(MQTT_CONNECT, DONE, 2, 1) \
  X(MQTT_CONNECT, ERROR, 3, 1) \
  X(MQTT_CONNECT, STATUS, 4, 4) \
  X(MQTT_CONNECT, PROFILE, 8, 1) \
  X(MQTT_CONNECT, CONNECTED, 9, 1) \
  X(MQTT_PUBLISH, EN, 0, 1) \
  X(MQTT_PUBLISH, BUSY, 1, 1) \
  X(MQTT_PUBLISH, DONE, 2, 1) \
  X(MQTT_PUBLISH, ERROR, 3, 1) \
  X(MQTT_PUBLISH, STATUS, 4, 4) \
  X(MQTT_PUBLISH, QOS, 8, 1) \
  X(MQTT_PUBLISH, RETAIN, 9, 1) \
  X(MQTT_PUBLISH, TOPIC, 12, 85) \
  X(MQTT_PUBLISH, PAYLOAD, 97, 85) \
  X(MQTT_SUBSCRIBE, EN, 0, 1) \
  X(MQTT_SUBSCRIBE, BUSY, 1, 1) \
  X(MQTT_SUBSCRIBE, DONE, 2, 1) \
  X(MQTT_SUBSCRIBE, ERROR, 3, 1) \
  X(MQTT_SUBSCRIBE, STATUS, 4, 4) \
  X(MQTT_SUBSCRIBE, QOS, 8, 1) \
  X(MQTT_SUBSCRIBE, VALID, 9, 1) \
  X(MQTT_SUBSCRIBE, TOPIC, 12, 85) \
  X(MQTT_SUBSCRIBE, PAYLOAD, 97, 85) \
  X(AZURE_C2D_RECV, EN, 0, 1) \
  X(AZURE_C2D_RECV, BUSY, 1, 1) \
  X(AZURE_C2D_RECV, DONE, 2, 1) \
  X(AZURE_C2D_RECV, ERROR, 3, 1) \
  X(AZURE_C2D_RECV, STATUS, 4, 4) \
  X(AZURE_C2D_RECV, PAYLOAD, 8, 85) \
  X(AZURE_C2D_RECV, VALID, 93, 1) \
  X(AZURE_DPS_PROV, EN, 0, 1) \
  X(AZURE_DPS_PROV, BUSY, 1, 1) \
  X(AZURE_DPS_PROV, DONE, 2, 1) \
  X(AZURE_DPS_PROV, ERROR, 3, 1) \
  X(AZURE_DPS_PROV, STATUS, 4, 4) \
  X(AZURE_DPS_PROV, DEVICE_ID, 8, 85) \
  X(AZURE_DPS_PROV, ASSIGNED_HUB, 73, 85) \
  X(AZURE_EG_PUB, EN, 0, 1) \
  X(AZURE_EG_PUB, BUSY, 1, 1) \
  X(AZURE_EG_PUB, DONE, 2, 1) \
  X(AZURE_EG_PUB, ERROR, 3, 1) \
  X(AZURE_EG_PUB, STATUS, 4, 4) \
  X(AZURE_EG_PUB, TOPIC, 8, 85) \
  X(AZURE_EG_PUB, EVENT_TYPE, 73, 85) \
  X(AZURE_EG_PUB, PAYLOAD, 138, 85) \
  X(AWS_FLEET_PROV, EN, 0, 1) \
  X(AWS_FLEET_PROV, BUSY, 1, 1) \
  X(AWS_FLEET_PROV, DONE, 2, 1) \
  X(AWS_FLEET_PROV, ERROR, 3, 1) \
  X(AWS_FLEET_PROV, STATUS, 4, 4) \
  X(AWS_FLEET_PROV, TEMPLATE_NAME, 8, 85) \
  X(AWS_FLEET_PROV, THING_NAME, 73, 85) \
  X(SPB_REBIRTH, EN, 0, 1) \
  X(SPB_REBIRTH, BUSY, 1, 1) \
  X(SPB_REBIRTH, DONE, 2, 1) \
  X(SPB_REBIRTH, ERROR, 3, 1) \
  X(SPB_REBIRTH, STATUS, 4, 4)

/**
 * @brief Instance size in bytes of a function block of the given kind.
 *
 * @param kind A zplc_comm_fb_kind_t value (any width, so that an operand read from
 *             the code segment can be passed unchecked).
 * @return The size from the generated table, or 0 for a kind with no layout.
 */
static inline uint16_t zplc_comm_fb_size(uint32_t kind) {
  switch (kind) {
  case ZPLC_COMM_FB_MB_READ_HREG:
    return 110U;
  case ZPLC_COMM_FB_MB_WRITE_HREG:
    return 110U;
  case ZPLC_COMM_FB_MB_READ_COIL:
    return 110U;
  case ZPLC_COMM_FB_MB_WRITE_COIL:
    return 110U;
  case ZPLC_COMM_FB_MQTT_CONNECT:
    return 12U;
  case ZPLC_COMM_FB_MQTT_PUBLISH:
    return 190U;
  case ZPLC_COMM_FB_MQTT_SUBSCRIBE:
    return 190U;
  case ZPLC_COMM_FB_AZURE_C2D_RECV:
    return 94U;
  case ZPLC_COMM_FB_AZURE_DPS_PROV:
    return 201U;
  case ZPLC_COMM_FB_AZURE_EG_PUB:
    return 266U;
  case ZPLC_COMM_FB_AWS_FLEET_PROV:
    return 137U;
  case ZPLC_COMM_FB_SPB_REBIRTH:
    return 8U;
  default:
    return 0U;
  }
}

/* Instance sizes and member offsets of every function block, from the contract.
 * ZPLC_COMM_<BLOCK>_SIZE is the instance size; ZPLC_COMM_<BLOCK>_<MEMBER>_OFFSET
 * is the byte offset of a member from the instance base address. */
enum {
  ZPLC_COMM_MB_READ_HREG_SIZE = 110,
  ZPLC_COMM_MB_READ_HREG_EN_OFFSET = 0,
  ZPLC_COMM_MB_READ_HREG_BUSY_OFFSET = 1,
  ZPLC_COMM_MB_READ_HREG_DONE_OFFSET = 2,
  ZPLC_COMM_MB_READ_HREG_ERROR_OFFSET = 3,
  ZPLC_COMM_MB_READ_HREG_STATUS_OFFSET = 4,
  ZPLC_COMM_MB_READ_HREG_PROTO_OFFSET = 8,
  ZPLC_COMM_MB_READ_HREG_SLAVE_ID_OFFSET = 9,
  ZPLC_COMM_MB_READ_HREG_ADDR_OFFSET = 11,
  ZPLC_COMM_MB_READ_HREG_COUNT_OFFSET = 13,
  ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET = 15,
  ZPLC_COMM_MB_READ_HREG_HOST_OFFSET = 18,
  ZPLC_COMM_MB_READ_HREG_PORT_OFFSET = 103,
  ZPLC_COMM_MB_WRITE_HREG_SIZE = 110,
  ZPLC_COMM_MB_WRITE_HREG_EN_OFFSET = 0,
  ZPLC_COMM_MB_WRITE_HREG_BUSY_OFFSET = 1,
  ZPLC_COMM_MB_WRITE_HREG_DONE_OFFSET = 2,
  ZPLC_COMM_MB_WRITE_HREG_ERROR_OFFSET = 3,
  ZPLC_COMM_MB_WRITE_HREG_STATUS_OFFSET = 4,
  ZPLC_COMM_MB_WRITE_HREG_PROTO_OFFSET = 8,
  ZPLC_COMM_MB_WRITE_HREG_SLAVE_ID_OFFSET = 9,
  ZPLC_COMM_MB_WRITE_HREG_ADDR_OFFSET = 11,
  ZPLC_COMM_MB_WRITE_HREG_COUNT_OFFSET = 13,
  ZPLC_COMM_MB_WRITE_HREG_VALUE_OFFSET = 15,
  ZPLC_COMM_MB_WRITE_HREG_HOST_OFFSET = 18,
  ZPLC_COMM_MB_WRITE_HREG_PORT_OFFSET = 103,
  ZPLC_COMM_MB_READ_COIL_SIZE = 110,
  ZPLC_COMM_MB_READ_COIL_EN_OFFSET = 0,
  ZPLC_COMM_MB_READ_COIL_BUSY_OFFSET = 1,
  ZPLC_COMM_MB_READ_COIL_DONE_OFFSET = 2,
  ZPLC_COMM_MB_READ_COIL_ERROR_OFFSET = 3,
  ZPLC_COMM_MB_READ_COIL_STATUS_OFFSET = 4,
  ZPLC_COMM_MB_READ_COIL_PROTO_OFFSET = 8,
  ZPLC_COMM_MB_READ_COIL_SLAVE_ID_OFFSET = 9,
  ZPLC_COMM_MB_READ_COIL_ADDR_OFFSET = 11,
  ZPLC_COMM_MB_READ_COIL_COUNT_OFFSET = 13,
  ZPLC_COMM_MB_READ_COIL_VALUE_OFFSET = 15,
  ZPLC_COMM_MB_READ_COIL_HOST_OFFSET = 18,
  ZPLC_COMM_MB_READ_COIL_PORT_OFFSET = 103,
  ZPLC_COMM_MB_WRITE_COIL_SIZE = 110,
  ZPLC_COMM_MB_WRITE_COIL_EN_OFFSET = 0,
  ZPLC_COMM_MB_WRITE_COIL_BUSY_OFFSET = 1,
  ZPLC_COMM_MB_WRITE_COIL_DONE_OFFSET = 2,
  ZPLC_COMM_MB_WRITE_COIL_ERROR_OFFSET = 3,
  ZPLC_COMM_MB_WRITE_COIL_STATUS_OFFSET = 4,
  ZPLC_COMM_MB_WRITE_COIL_PROTO_OFFSET = 8,
  ZPLC_COMM_MB_WRITE_COIL_SLAVE_ID_OFFSET = 9,
  ZPLC_COMM_MB_WRITE_COIL_ADDR_OFFSET = 11,
  ZPLC_COMM_MB_WRITE_COIL_COUNT_OFFSET = 13,
  ZPLC_COMM_MB_WRITE_COIL_VALUE_OFFSET = 15,
  ZPLC_COMM_MB_WRITE_COIL_HOST_OFFSET = 18,
  ZPLC_COMM_MB_WRITE_COIL_PORT_OFFSET = 103,
  ZPLC_COMM_MQTT_CONNECT_SIZE = 12,
  ZPLC_COMM_MQTT_CONNECT_EN_OFFSET = 0,
  ZPLC_COMM_MQTT_CONNECT_BUSY_OFFSET = 1,
  ZPLC_COMM_MQTT_CONNECT_DONE_OFFSET = 2,
  ZPLC_COMM_MQTT_CONNECT_ERROR_OFFSET = 3,
  ZPLC_COMM_MQTT_CONNECT_STATUS_OFFSET = 4,
  ZPLC_COMM_MQTT_CONNECT_PROFILE_OFFSET = 8,
  ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET = 9,
  ZPLC_COMM_MQTT_PUBLISH_SIZE = 190,
  ZPLC_COMM_MQTT_PUBLISH_EN_OFFSET = 0,
  ZPLC_COMM_MQTT_PUBLISH_BUSY_OFFSET = 1,
  ZPLC_COMM_MQTT_PUBLISH_DONE_OFFSET = 2,
  ZPLC_COMM_MQTT_PUBLISH_ERROR_OFFSET = 3,
  ZPLC_COMM_MQTT_PUBLISH_STATUS_OFFSET = 4,
  ZPLC_COMM_MQTT_PUBLISH_QOS_OFFSET = 8,
  ZPLC_COMM_MQTT_PUBLISH_RETAIN_OFFSET = 9,
  ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET = 12,
  ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET = 97,
  ZPLC_COMM_MQTT_SUBSCRIBE_SIZE = 190,
  ZPLC_COMM_MQTT_SUBSCRIBE_EN_OFFSET = 0,
  ZPLC_COMM_MQTT_SUBSCRIBE_BUSY_OFFSET = 1,
  ZPLC_COMM_MQTT_SUBSCRIBE_DONE_OFFSET = 2,
  ZPLC_COMM_MQTT_SUBSCRIBE_ERROR_OFFSET = 3,
  ZPLC_COMM_MQTT_SUBSCRIBE_STATUS_OFFSET = 4,
  ZPLC_COMM_MQTT_SUBSCRIBE_QOS_OFFSET = 8,
  ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET = 9,
  ZPLC_COMM_MQTT_SUBSCRIBE_TOPIC_OFFSET = 12,
  ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET = 97,
  ZPLC_COMM_AZURE_C2D_RECV_SIZE = 94,
  ZPLC_COMM_AZURE_C2D_RECV_EN_OFFSET = 0,
  ZPLC_COMM_AZURE_C2D_RECV_BUSY_OFFSET = 1,
  ZPLC_COMM_AZURE_C2D_RECV_DONE_OFFSET = 2,
  ZPLC_COMM_AZURE_C2D_RECV_ERROR_OFFSET = 3,
  ZPLC_COMM_AZURE_C2D_RECV_STATUS_OFFSET = 4,
  ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET = 8,
  ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET = 93,
  ZPLC_COMM_AZURE_DPS_PROV_SIZE = 201,
  ZPLC_COMM_AZURE_DPS_PROV_EN_OFFSET = 0,
  ZPLC_COMM_AZURE_DPS_PROV_BUSY_OFFSET = 1,
  ZPLC_COMM_AZURE_DPS_PROV_DONE_OFFSET = 2,
  ZPLC_COMM_AZURE_DPS_PROV_ERROR_OFFSET = 3,
  ZPLC_COMM_AZURE_DPS_PROV_STATUS_OFFSET = 4,
  ZPLC_COMM_AZURE_DPS_PROV_DEVICE_ID_OFFSET = 8,
  ZPLC_COMM_AZURE_DPS_PROV_ASSIGNED_HUB_OFFSET = 73,
  ZPLC_COMM_AZURE_EG_PUB_SIZE = 266,
  ZPLC_COMM_AZURE_EG_PUB_EN_OFFSET = 0,
  ZPLC_COMM_AZURE_EG_PUB_BUSY_OFFSET = 1,
  ZPLC_COMM_AZURE_EG_PUB_DONE_OFFSET = 2,
  ZPLC_COMM_AZURE_EG_PUB_ERROR_OFFSET = 3,
  ZPLC_COMM_AZURE_EG_PUB_STATUS_OFFSET = 4,
  ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET = 8,
  ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET = 73,
  ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET = 138,
  ZPLC_COMM_AWS_FLEET_PROV_SIZE = 137,
  ZPLC_COMM_AWS_FLEET_PROV_EN_OFFSET = 0,
  ZPLC_COMM_AWS_FLEET_PROV_BUSY_OFFSET = 1,
  ZPLC_COMM_AWS_FLEET_PROV_DONE_OFFSET = 2,
  ZPLC_COMM_AWS_FLEET_PROV_ERROR_OFFSET = 3,
  ZPLC_COMM_AWS_FLEET_PROV_STATUS_OFFSET = 4,
  ZPLC_COMM_AWS_FLEET_PROV_TEMPLATE_NAME_OFFSET = 8,
  ZPLC_COMM_AWS_FLEET_PROV_THING_NAME_OFFSET = 73,
  ZPLC_COMM_SPB_REBIRTH_SIZE = 8,
  ZPLC_COMM_SPB_REBIRTH_EN_OFFSET = 0,
  ZPLC_COMM_SPB_REBIRTH_BUSY_OFFSET = 1,
  ZPLC_COMM_SPB_REBIRTH_DONE_OFFSET = 2,
  ZPLC_COMM_SPB_REBIRTH_ERROR_OFFSET = 3,
  ZPLC_COMM_SPB_REBIRTH_STATUS_OFFSET = 4
};
/* <<< END GENERATED: comm-blocks <<< */

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Register a handler for a communication FB kind.
 */
int zplc_comm_register_handler(zplc_comm_fb_kind_t kind,
                               zplc_comm_handler_t fn);

/**
 * @brief Execute a communication FB instance (called by VM from OP_COMM_EXEC).
 *
 * @param kind   The function-block kind
 * @param fb_mem The block; the caller has placed all of it in PLC memory
 * @param fb_len Length of the block; refused (-1) when it is shorter than the
 *               handshake or than the size of the kind in the table
 * @return 0, or -1 when the block is refused
 */
int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                      uint16_t fb_len);

/**
 * @brief Reset a communication FB instance (called by VM from OP_COMM_RESET).
 *
 * @param kind   The function-block kind
 * @param fb_mem The block; the caller has placed all of it in PLC memory
 * @param fb_len Length of the block; refused (-1) as for zplc_comm_fb_exec()
 * @return 0, or -1 when the block is refused
 */
int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                       uint16_t fb_len);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_COMM_DISPATCH_H */
