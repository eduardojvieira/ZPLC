/**
 * ZPLC MQTT FB Handler
 *
 * Bridges the synchronous VM communication blocks with the asynchronous Zephyr
 * MQTT client.
 */

#include "zplc_comm_mqtt_handler.h"
#include "zplc_config.h"
#include <string.h>
#include <zephyr/logging/log.h>
#include <zplc_comm_dispatch.h>
#include <zplc_core.h>
#include <zplc_hal.h>

LOG_MODULE_REGISTER(zplc_comm_mqtt, LOG_LEVEL_INF);

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

/* MQTT CONNECT Layout */
#define FB_CONNECT_OFF_CONNECTED 8

/* MQTT PUBLISH Layout */
#define FB_PUB_OFF_QOS 8
#define FB_PUB_OFF_RETAIN 9
#define FB_PUB_OFF_TOPIC 10   /* 85 bytes (1+1+83) */
#define FB_PUB_OFF_PAYLOAD 95 /* 85 bytes (1+1+83) */

/* MQTT SUBSCRIBE Layout */
#define FB_SUB_OFF_QOS 8
#define FB_SUB_OFF_TOPIC 10     /* 85 bytes */
#define FB_SUB_OFF_PAYLOAD 95   /* 85 bytes */
#define FB_SUB_OFF_RECEIVED 180 /* 1 byte */

/* String Layout */
#define STR_OFF_LEN 0
#define STR_OFF_CAPACITY 1
#define STR_OFF_DATA 2

/* ============================================================================
 * String Helper
 * ============================================================================
 */

static void copy_string(char *dest, size_t dest_size, const uint8_t *fb_str) {
  uint8_t len = fb_str[STR_OFF_LEN];
  if (len >= dest_size) {
    len = dest_size - 1;
  }
  memcpy(dest, &fb_str[STR_OFF_DATA], len);
  dest[len] = '\0';
}

static void set_string(uint8_t *fb_str, const char *src, size_t len) {
  uint8_t capacity = fb_str[STR_OFF_CAPACITY];
  if (len > capacity) {
    len = capacity;
  }
  memcpy(&fb_str[STR_OFF_DATA], src, len);
  fb_str[STR_OFF_LEN] = (uint8_t)len;
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

static int exec_mqtt_connect(uint8_t *fb_mem) {
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

static int exec_mqtt_publish(uint8_t *fb_mem) {
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

    copy_string(topic, sizeof(topic), &fb_mem[FB_PUB_OFF_TOPIC]);

    uint8_t payload_len = fb_mem[FB_PUB_OFF_PAYLOAD + STR_OFF_LEN];
    if (payload_len > 83) {
      payload_len = 83; /* Max capacity */
    }
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

static int exec_mqtt_subscribe(uint8_t *fb_mem) {
  /* Dynamic subscriptions from FB not fully supported in Phase 1.5.1
   * We just set them idle or return an unsupported status if EN goes high.
   * Proper implementation requires dynamic subscription handling in
   * zplc_mqtt.c.
   */
  bool en = fb_mem[FB_OFF_EN];

  if (!en) {
    fb_mem[FB_OFF_BUSY] = 0;
    fb_mem[FB_OFF_DONE] = 0;
    fb_mem[FB_OFF_ERROR] = 0;
    set_status(fb_mem, 0);
    fb_mem[FB_SUB_OFF_RECEIVED] = 0;
    return 0;
  }

  /* Feature not implemented natively in VM yet */
  fb_mem[FB_OFF_BUSY] = 0;
  fb_mem[FB_OFF_DONE] = 0;
  fb_mem[FB_OFF_ERROR] = 1;
  set_status(fb_mem, -ENOTSUP);

  return 0;
}

/* ============================================================================
 * Core Dispatch Callbacks
 * ============================================================================
 */

static int zplc_comm_mqtt_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                                  bool reset) {
  if (reset) {
    fb_mem[FB_OFF_BUSY] = 0;
    fb_mem[FB_OFF_DONE] = 0;
    fb_mem[FB_OFF_ERROR] = 0;
    set_status(fb_mem, 0);

    if (kind == ZPLC_COMM_FB_MQTT_CONNECT) {
      fb_mem[FB_CONNECT_OFF_CONNECTED] = 0;
    } else if (kind == ZPLC_COMM_FB_MQTT_SUBSCRIBE) {
      fb_mem[FB_SUB_OFF_RECEIVED] = 0;
    }
    return 0;
  }

  switch (kind) {
  case ZPLC_COMM_FB_MQTT_CONNECT:
    return exec_mqtt_connect(fb_mem);
  case ZPLC_COMM_FB_MQTT_PUBLISH:
    return exec_mqtt_publish(fb_mem);
  case ZPLC_COMM_FB_MQTT_SUBSCRIBE:
    return exec_mqtt_subscribe(fb_mem);
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
