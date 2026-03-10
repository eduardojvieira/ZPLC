#ifndef ZPLC_COMM_DISPATCH_H
#define ZPLC_COMM_DISPATCH_H

#include <stdbool.h>
#include <stdint.h>

/**
 * @brief Communication function block kind identifiers.
 *
 * Encoded as the lower 16 bits of the OP_COMM_EXEC operand.
 */
typedef enum {
  ZPLC_COMM_FB_NONE = 0x0000,
  ZPLC_COMM_FB_MB_READ_HREG = 0x0001,
  ZPLC_COMM_FB_MB_WRITE_HREG = 0x0002,
  ZPLC_COMM_FB_MB_READ_COIL = 0x0003,
  ZPLC_COMM_FB_MB_WRITE_COIL = 0x0004,
  ZPLC_COMM_FB_MQTT_CONNECT = 0x000A,
  ZPLC_COMM_FB_MQTT_PUBLISH = 0x000B,
  ZPLC_COMM_FB_MQTT_SUBSCRIBE = 0x000C,
  ZPLC_COMM_FB_COMM_STATUS = 0x0014,
  ZPLC_COMM_FB_AZURE_C2D_RECV = 0x0020,
  ZPLC_COMM_FB_AZURE_DPS_PROV = 0x0021,
  ZPLC_COMM_FB_AZURE_EG_PUB = 0x0022,
  ZPLC_COMM_FB_AWS_FLEET_PROV = 0x0030,
  ZPLC_COMM_FB_SPB_REBIRTH = 0x0040,
  /**
   * Sentinel — must be last. All valid kinds are < KIND_MAX.
   * Values at or above this are rejected by zplc_comm_register_handler().
   */
  ZPLC_COMM_FB_KIND_MAX = 0x00FF,
} zplc_comm_fb_kind_t;

/**
 * @brief Communication status codes written to FB.STATUS.
 */
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
  ZPLC_COMM_UNKNOWN = 0xFF,
} zplc_comm_status_t;

/**
 * @brief Comm FB handler function type.
 */
typedef int (*zplc_comm_handler_t)(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                                   bool reset);

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
 */
int zplc_comm_fb_exec(zplc_comm_fb_kind_t kind, uint8_t *fb_mem);

/**
 * @brief Reset a communication FB instance (called by VM from OP_COMM_RESET).
 */
int zplc_comm_fb_reset(zplc_comm_fb_kind_t kind, uint8_t *fb_mem);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_COMM_DISPATCH_H */
