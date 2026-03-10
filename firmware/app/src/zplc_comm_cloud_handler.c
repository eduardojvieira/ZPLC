/**
 * ZPLC Cloud Communication FB Handler
 *
 * Bridges VM OP_COMM_EXEC opcodes for Phase 5 cloud wrapper FBs
 * (Azure C2D, DPS, Event Grid; AWS Fleet Provision; Sparkplug B Rebirth)
 * to the existing runtime services in zplc_azure_dps.c, zplc_aws_fleet.c,
 * and zplc_mqtt.c.
 *
 * All functions run in the VM scan thread and MUST NOT block.
 * Actual network work is done in background threads in the respective modules.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_comm_cloud_handler.h"

#include "zplc_config.h"
#include "zplc_mqtt.h"
#include <errno.h>
#include <string.h>
#include <zephyr/logging/log.h>
#include <zplc_comm_dispatch.h>

LOG_MODULE_REGISTER(zplc_comm_cloud, LOG_LEVEL_INF);

/* ============================================================================
 * FB Memory Layout — Common Header (matches all comm FBs)
 * ============================================================================
 * +0  EN     BOOL
 * +1  BUSY   BOOL
 * +2  DONE   BOOL
 * +3  ERROR  BOOL
 * +4  STATUS DINT (4 bytes, little-endian)
 */
#define FB_OFF_EN 0
#define FB_OFF_BUSY 1
#define FB_OFF_DONE 2
#define FB_OFF_ERROR 3
#define FB_OFF_STATUS 4

/* String layout: [LEN USINT][CAP USINT][DATA…] */
#define STR_OFF_LEN 0
#define STR_OFF_CAP 1
#define STR_OFF_DATA 2

/* ============================================================================
 * AZURE_C2D_RECV (0x0020)
 * +8  PAYLOAD STRING[83]  — written by the MQTT receive callback
 * +93 VALID   BOOL        — set true by the MQTT receive callback
 * ============================================================================
 */
#define C2D_OFF_PAYLOAD 8
#define C2D_OFF_VALID 93

/* ============================================================================
 * AZURE_DPS_PROV (0x0021)
 * +8  DEVICE_ID    STRING[63]
 * +73 ASSIGNED_HUB STRING[128]
 * ============================================================================
 */
#define DPS_OFF_DEVICE_ID 8
#define DPS_OFF_ASSIGNED_HUB 73

/* ============================================================================
 * AZURE_EG_PUB (0x0022)
 * +8   TOPIC      STRING[63]
 * +73  EVENT_TYPE STRING[63]
 * +138 PAYLOAD    STRING[127]
 * ============================================================================
 */
#define EG_OFF_TOPIC 8
#define EG_OFF_EVENT_TYPE 73
#define EG_OFF_PAYLOAD 138

/* ============================================================================
 * AWS_FLEET_PROV (0x0030)
 * +8  TEMPLATE_NAME STRING[63]
 * +73 THING_NAME    STRING[63]
 * ============================================================================
 */
#define AWS_OFF_TEMPLATE_NAME 8
#define AWS_OFF_THING_NAME 73

/* ============================================================================
 * Helpers
 * ============================================================================
 */

static void set_status(uint8_t *fb_mem, int32_t s) {
  fb_mem[FB_OFF_STATUS] = (uint8_t)(s & 0xFF);
  fb_mem[FB_OFF_STATUS + 1] = (uint8_t)((s >> 8) & 0xFF);
  fb_mem[FB_OFF_STATUS + 2] = (uint8_t)((s >> 16) & 0xFF);
  fb_mem[FB_OFF_STATUS + 3] = (uint8_t)((s >> 24) & 0xFF);
}

static void fb_reset_common(uint8_t *fb_mem) {
  fb_mem[FB_OFF_BUSY] = 0;
  fb_mem[FB_OFF_DONE] = 0;
  fb_mem[FB_OFF_ERROR] = 0;
  set_status(fb_mem, 0);
}

/**
 * Copy a C string into a ZPLC STRING field (LEN + CAP + DATA layout).
 * Returns ZPLC_COMM_STRING_OVERFLOW if truncated.
 */
static int copy_to_fb_str(uint8_t *fb_str, const char *src) {
  uint8_t cap = fb_str[STR_OFF_CAP];
  size_t src_len = strnlen(src, cap + 1);
  int rc = 0;

  if (src_len > cap) {
    src_len = cap;
    rc = ZPLC_COMM_STRING_OVERFLOW;
  }
  memcpy(&fb_str[STR_OFF_DATA], src, src_len);
  fb_str[STR_OFF_LEN] = (uint8_t)src_len;
  return rc;
}

/**
 * Read a ZPLC STRING field into a C string buffer.
 */
static void read_fb_str(const uint8_t *fb_str, char *dest, size_t dest_size) {
  uint8_t len = fb_str[STR_OFF_LEN];
  if (len >= (uint8_t)dest_size) {
    len = (uint8_t)(dest_size - 1);
  }
  memcpy(dest, &fb_str[STR_OFF_DATA], len);
  dest[len] = '\0';
}

/* ============================================================================
 * Per-FB exec handlers
 * ============================================================================
 */

static int exec_azure_c2d_recv(uint8_t *fb_mem) {
  /* Read-only FB: the MQTT receive callback populates PAYLOAD and VALID.
   * On each scan with EN=1 we just report the current state. */
  bool en = fb_mem[FB_OFF_EN] != 0;

  if (!en) {
    fb_reset_common(fb_mem);
    fb_mem[C2D_OFF_PAYLOAD + STR_OFF_LEN] = 0;
    fb_mem[C2D_OFF_VALID] = 0;
    return 0;
  }

  /* Nothing to do synchronously — data is filled by the MQTT thread via
   * the Azure C2D callback. Mark DONE for this scan to signal "ready". */
  fb_mem[FB_OFF_BUSY] = 0;
  fb_mem[FB_OFF_DONE] = fb_mem[C2D_OFF_VALID]; /* 1 only when new msg */
  fb_mem[FB_OFF_ERROR] = 0;
  set_status(fb_mem, 0);
  return 0;
}

static int exec_azure_dps_prov(uint8_t *fb_mem) {
  bool en = fb_mem[FB_OFF_EN] != 0;
  bool busy = fb_mem[FB_OFF_BUSY] != 0;
  bool done = fb_mem[FB_OFF_DONE] != 0;

  if (!en) {
    fb_reset_common(fb_mem);
    return 0;
  }
  if (done)
    return 0; /* Already finished this edge */

  if (!busy) {
    char device_id[64];
    read_fb_str(&fb_mem[DPS_OFF_DEVICE_ID], device_id, sizeof(device_id));

    /* Trigger provisioning — non-blocking; result comes via callback */
    int rc = zplc_azure_dps_provision();
    if (rc == 0) {
      fb_mem[FB_OFF_DONE] = 1;
      fb_mem[FB_OFF_ERROR] = 0;
      set_status(fb_mem, 0);
    } else {
      fb_mem[FB_OFF_DONE] = 0;
      fb_mem[FB_OFF_ERROR] = 1;
      set_status(fb_mem, rc);
    }
    fb_mem[FB_OFF_BUSY] = 0;
  }
  return 0;
}

static int exec_azure_eg_pub(uint8_t *fb_mem) {
  bool en = fb_mem[FB_OFF_EN] != 0;
  bool done = fb_mem[FB_OFF_DONE] != 0;

  if (!en) {
    fb_reset_common(fb_mem);
    return 0;
  }
  if (done)
    return 0;

  char topic[64], event_type[64], payload[128];
  read_fb_str(&fb_mem[EG_OFF_TOPIC], topic, sizeof(topic));
  read_fb_str(&fb_mem[EG_OFF_EVENT_TYPE], event_type, sizeof(event_type));
  read_fb_str(&fb_mem[EG_OFF_PAYLOAD], payload, sizeof(payload));

  int rc = zplc_azure_event_grid_publish(event_type, NULL, topic, payload);
  fb_mem[FB_OFF_BUSY] = 0;
  fb_mem[FB_OFF_DONE] = (rc == 0) ? 1 : 0;
  fb_mem[FB_OFF_ERROR] = (rc != 0) ? 1 : 0;
  set_status(fb_mem, rc);
  return 0;
}

static int exec_aws_fleet_prov(uint8_t *fb_mem) {
  bool en = fb_mem[FB_OFF_EN] != 0;
  bool done = fb_mem[FB_OFF_DONE] != 0;

  if (!en) {
    fb_reset_common(fb_mem);
    return 0;
  }
  if (done)
    return 0;

  /* Trigger provisioning — wraps zplc_aws_fleet_provision() */
  int rc = zplc_aws_fleet_provision();
  fb_mem[FB_OFF_BUSY] = 0;
  fb_mem[FB_OFF_DONE] = (rc == 0) ? 1 : 0;
  fb_mem[FB_OFF_ERROR] = (rc != 0) ? 1 : 0;
  set_status(fb_mem, rc);
  return 0;
}

static int exec_spb_rebirth(uint8_t *fb_mem) {
  bool en = fb_mem[FB_OFF_EN] != 0;
  bool done = fb_mem[FB_OFF_DONE] != 0;

  if (!en) {
    fb_reset_common(fb_mem);
    return 0;
  }
  if (done)
    return 0;

  /* Request a Sparkplug B REBIRTH by publishing an NBIRTH/DBIRTH sequence.
   * zplc_mqtt_request_backoff_reset forces the MQTT thread to reconnect and
   * re-publish birth certificates on next cycle. */
  zplc_mqtt_request_backoff_reset();

  fb_mem[FB_OFF_BUSY] = 0;
  fb_mem[FB_OFF_DONE] = 1;
  fb_mem[FB_OFF_ERROR] = 0;
  set_status(fb_mem, 0);
  return 0;
}

/* ============================================================================
 * Main dispatch handler
 * ============================================================================
 */

static int zplc_comm_cloud_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem,
                                   bool reset) {
  if (reset) {
    fb_reset_common(fb_mem);
    return 0;
  }

  switch (kind) {
  case ZPLC_COMM_FB_AZURE_C2D_RECV:
    return exec_azure_c2d_recv(fb_mem);
  case ZPLC_COMM_FB_AZURE_DPS_PROV:
    return exec_azure_dps_prov(fb_mem);
  case ZPLC_COMM_FB_AZURE_EG_PUB:
    return exec_azure_eg_pub(fb_mem);
  case ZPLC_COMM_FB_AWS_FLEET_PROV:
    return exec_aws_fleet_prov(fb_mem);
  case ZPLC_COMM_FB_SPB_REBIRTH:
    return exec_spb_rebirth(fb_mem);
  default:
    return -EINVAL;
  }
}

/* ============================================================================
 * Public API
 * ============================================================================
 */

int zplc_comm_cloud_handler_init(void) {
  int rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_AZURE_C2D_RECV,
                                  zplc_comm_cloud_handler);
  if (rc)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_AZURE_DPS_PROV,
                                  zplc_comm_cloud_handler);
  if (rc)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_AZURE_EG_PUB,
                                  zplc_comm_cloud_handler);
  if (rc)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_AWS_FLEET_PROV,
                                  zplc_comm_cloud_handler);
  if (rc)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_SPB_REBIRTH,
                                  zplc_comm_cloud_handler);
  if (rc)
    return rc;

  LOG_INF("Cloud VM handlers registered (Azure C2D/DPS/EG, AWS, SPB)");
  return 0;
}
