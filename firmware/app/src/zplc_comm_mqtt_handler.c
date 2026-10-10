/**
 * ZPLC MQTT FB Handler
 *
 * Bridges the synchronous VM communication blocks with the asynchronous Zephyr
 * MQTT client.
 */

#include "zplc_comm_fb_access.h"
#include "zplc_comm_mqtt_handler.h"
#include "zplc_config.h"
#include <errno.h>
#include <string.h>
#include <zephyr/logging/log.h>
#include <zplc_comm_dispatch.h>
#include <zplc_core.h>
#include <zplc_hal.h>

LOG_MODULE_REGISTER(zplc_comm_mqtt, LOG_LEVEL_INF);

extern bool zplc_mqtt_is_connected(void);
extern bool zplc_mqtt_is_subscribed(void);

/* ============================================================================
 * Internal FB Layout (Offsets)
 * ============================================================================
 */

/* Handshake header is always 8 bytes for Comm FBs */
#define FB_OFF_EN 0
#define FB_OFF_BUSY 1
#define FB_OFF_DONE 2
#define FB_OFF_ERROR 3
#define FB_OFF_STATUS 4 /* 32-bit (offset 4) */

/* MQTT CONNECT Layout: PROFILE (input) is at 8, CONNECTED (output) at 9 */
#define FB_CONNECT_OFF_CONNECTED 9

/* MQTT PUBLISH Layout */
#define FB_PUB_OFF_QOS 8
#define FB_PUB_OFF_RETAIN 9
#define FB_PUB_OFF_TOPIC 12   /* STRING header (4) + 81 chars */
#define FB_PUB_OFF_PAYLOAD 97 /* STRING header (4) + 81 chars */

/* MQTT SUBSCRIBE Layout */
#define FB_SUB_OFF_QOS 8
#define FB_SUB_OFF_VALID 9
#define FB_SUB_OFF_TOPIC 12   /* STRING header (4) + 81 chars */
#define FB_SUB_OFF_PAYLOAD 97 /* STRING header (4) + 81 chars */

/* String Layout */
#define STR_OFF_LEN 0
#define STR_OFF_CAPACITY 2
#define STR_OFF_DATA 4

/* Bytes the layout table reserves for each STRING member (header, up to 80
 * characters, terminator). Strings are read and written through
 * zplc_comm_fb_access.h, bounded by this and by the block (COM-001). */
#define FB_STRING_BYTES 85U

/* The shortest block of each kind the handler accepts: the table size. */
static bool block_ok(zplc_comm_fb_kind_t kind, const uint8_t *fb_mem,
                     uint16_t fb_len) {
  const uint16_t needed = zplc_comm_fb_size((uint32_t)kind);

  return fb_mem != NULL && needed != 0U && fb_len >= needed;
}

static inline void set_status(uint8_t *fb_mem, int32_t status) {
  fb_mem[FB_OFF_STATUS] = status & 0xFF;
  fb_mem[FB_OFF_STATUS + 1] = (status >> 8) & 0xFF;
  fb_mem[FB_OFF_STATUS + 2] = (status >> 16) & 0xFF;
  fb_mem[FB_OFF_STATUS + 3] = (status >> 24) & 0xFF;
}

/* ============================================================================
 * Exec Handlers
 * ============================================================================
 */

static int exec_mqtt_connect(uint8_t *fb_mem, uint16_t fb_len) {
  (void)fb_len; /* every offset used is inside the 12 bytes block_ok() found */
  bool en = fb_mem[FB_OFF_EN];
  bool is_connected = zplc_mqtt_is_connected();

  if (en) {
    fb_mem[FB_OFF_BUSY] = 0;
    fb_mem[FB_OFF_DONE] = 1;
    fb_mem[FB_OFF_ERROR] = 0;
    set_status(fb_mem, is_connected ? 0 : 1);
  } else {
    fb_mem[FB_OFF_BUSY] = 0;
    fb_mem[FB_OFF_DONE] = 0;
    fb_mem[FB_OFF_ERROR] = 0;
    set_status(fb_mem, 0);
  }

  fb_mem[FB_CONNECT_OFF_CONNECTED] = is_connected ? 1 : 0;
  return 0;
}

static int exec_mqtt_publish(uint8_t *fb_mem, uint16_t fb_len) {
  bool en = fb_mem[FB_OFF_EN];
  bool busy = fb_mem[FB_OFF_BUSY];
  bool done = fb_mem[FB_OFF_DONE];

  if (!en) {
    fb_mem[FB_OFF_BUSY] = 0;
    fb_mem[FB_OFF_DONE] = 0;
    fb_mem[FB_OFF_ERROR] = 0;
    set_status(fb_mem, 0);
    return 0;
  }

  if (done) {
    return 0; // Already finished for this EN edge
  }

  if (!busy && !done) {
    /* Rising edge: Enqueue */
    char topic[85];
    uint8_t payload[85];

    (void)zplc_fb_string_copy(topic, sizeof(topic), fb_mem, fb_len,
                              FB_PUB_OFF_TOPIC, FB_STRING_BYTES);

    /* at most the 80 characters of the member, and what the block holds */
    uint8_t payload_len = (uint8_t)zplc_fb_string_chars(
        fb_mem, fb_len, FB_PUB_OFF_PAYLOAD, FB_STRING_BYTES);
    memcpy(payload, &fb_mem[FB_PUB_OFF_PAYLOAD + STR_OFF_DATA], payload_len);

    uint8_t qos = fb_mem[FB_PUB_OFF_QOS];
    bool retain = fb_mem[FB_PUB_OFF_RETAIN] != 0;

    int rc =
        zplc_mqtt_enqueue_publish(topic, payload, payload_len, qos, retain);
    if (rc == 0) {
      /* Instant complete for fire-and-forget MQTT */
      fb_mem[FB_OFF_DONE] = 1;
      fb_mem[FB_OFF_ERROR] = 0;
      set_status(fb_mem, 0);
    } else {
      fb_mem[FB_OFF_DONE] = 0;
      fb_mem[FB_OFF_ERROR] = 1;
      set_status(fb_mem, rc);
    }
  }

  return 0;
}

static int exec_mqtt_subscribe(uint8_t *fb_mem, uint16_t fb_len) {
  bool en = fb_mem[FB_OFF_EN];
  bool is_connected = zplc_mqtt_is_connected();
  bool is_subscribed = zplc_mqtt_is_subscribed();
  uint8_t payload_len = (uint8_t)zplc_fb_string_chars(
      fb_mem, fb_len, FB_SUB_OFF_PAYLOAD, FB_STRING_BYTES);

  if (!en) {
    fb_mem[FB_OFF_BUSY] = 0;
    fb_mem[FB_OFF_DONE] = 0;
    fb_mem[FB_OFF_ERROR] = 0;
    set_status(fb_mem, 0);
    fb_mem[FB_SUB_OFF_VALID] = 0;
    (void)zplc_fb_string_set(fb_mem, fb_len, FB_SUB_OFF_PAYLOAD,
                             FB_STRING_BYTES, (const uint8_t *)"", 0U);
    return 0;
  }

  fb_mem[FB_OFF_BUSY] = 0;
  fb_mem[FB_SUB_OFF_VALID] = payload_len > 0U ? 1U : 0U;

  if (!is_connected) {
    fb_mem[FB_OFF_DONE] = 0;
    fb_mem[FB_OFF_ERROR] = 1;
    fb_mem[FB_SUB_OFF_VALID] = 0;
    set_status(fb_mem, ZPLC_COMM_NOT_CONNECTED);
    return 0;
  }

  if (!is_subscribed) {
    fb_mem[FB_OFF_DONE] = 0;
    fb_mem[FB_OFF_ERROR] = 0;
    fb_mem[FB_SUB_OFF_VALID] = 0;
    set_status(fb_mem, ZPLC_COMM_BUSY);
    return 0;
  }

  fb_mem[FB_OFF_DONE] = 1;
  fb_mem[FB_OFF_ERROR] = 0;
  set_status(fb_mem, ZPLC_COMM_OK);

  return 0;
}

/* ============================================================================
 * Core Dispatch Callbacks
 * ============================================================================
 */

static int zplc_comm_mqtt_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                                  uint16_t fb_len, bool reset) {
  if (!block_ok(kind, fb_mem, fb_len)) {
    return -EINVAL;
  }

  if (reset) {
    fb_mem[FB_OFF_BUSY] = 0;
    fb_mem[FB_OFF_DONE] = 0;
    fb_mem[FB_OFF_ERROR] = 0;
    set_status(fb_mem, 0);

    if (kind == ZPLC_COMM_FB_MQTT_CONNECT) {
      fb_mem[FB_CONNECT_OFF_CONNECTED] = 0;
    } else if (kind == ZPLC_COMM_FB_MQTT_SUBSCRIBE) {
      fb_mem[FB_SUB_OFF_VALID] = 0;
      (void)zplc_fb_string_set(fb_mem, fb_len, FB_SUB_OFF_PAYLOAD,
                               FB_STRING_BYTES, (const uint8_t *)"", 0U);
    }
    return 0;
  }

  switch (kind) {
  case ZPLC_COMM_FB_MQTT_CONNECT:
    return exec_mqtt_connect(fb_mem, fb_len);
  case ZPLC_COMM_FB_MQTT_PUBLISH:
    return exec_mqtt_publish(fb_mem, fb_len);
  case ZPLC_COMM_FB_MQTT_SUBSCRIBE:
    return exec_mqtt_subscribe(fb_mem, fb_len);
  default:
    return -EINVAL;
  }
}

int zplc_comm_mqtt_handler_init(void) {
  int rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_CONNECT,
                                  zplc_comm_mqtt_handler);
  if (rc != 0)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_PUBLISH,
                                  zplc_comm_mqtt_handler);
  if (rc != 0)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_SUBSCRIBE,
                                  zplc_comm_mqtt_handler);
  if (rc != 0)
    return rc;

  LOG_INF("MQTT VM Handler registered");
  return 0;
}
