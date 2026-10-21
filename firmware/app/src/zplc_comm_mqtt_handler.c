/**
 * ZPLC MQTT FB Handler
 *
 * Bridges the communication blocks of the scan with the MQTT client, which runs
 * in its own thread (zplc_mqtt_fb.h). A handler call never waits for the broker
 * (COM-003). The handshake is the one of zplc_comm_dispatch.h: MQTT_PUBLISH is
 * a request block, one message for each rising EN (COM-004); MQTT_CONNECT and
 * MQTT_SUBSCRIBE are service blocks that report the state of the session and
 * of one subscription on every scan, and report ERROR with a status code when
 * the session is down (COM-018).
 */

#include "zplc_comm_fb_access.h"
#include "zplc_comm_mqtt_handler.h"
#include "zplc_config.h"
#include "zplc_mqtt_fb.h"
#include <errno.h>
#include <string.h>
#include <zephyr/logging/log.h>
#include <zplc_comm_dispatch.h>
#include <zplc_comm_req.h>

LOG_MODULE_REGISTER(zplc_comm_mqtt, LOG_LEVEL_INF);

/* Bytes the layout table reserves for each STRING member (header, up to 80
 * characters, terminator), from the string layout of the contract. Strings are
 * read and written through zplc_comm_fb_access.h, bounded by this and by the
 * block (COM-001, COM-005). */
#define FB_STRING_BYTES ((uint16_t)(ZPLC_STRING_DATA_OFFSET + ZPLC_STRING_DEFAULT_SIZE + 1))

/* The shortest block of each kind the handler accepts: the table size. */
static bool block_ok(zplc_comm_fb_kind_t kind, const uint8_t *fb_mem, uint16_t fb_len) {
  const uint16_t needed = zplc_comm_fb_size((uint32_t)kind);

  return fb_mem != NULL && needed != 0U && fb_len >= needed;
}

/* Where the session stands, as the result a service block reports. */
static int session_result(void) {
  int last_error = 0;

  switch (zplc_mqtt_fb_session(&last_error)) {
  case ZPLC_MQTT_FB_UP:
    return ZPLC_COMM_HANDLER_DONE;
  case ZPLC_MQTT_FB_CONNECTING:
    return ZPLC_COMM_HANDLER_PENDING;
  case ZPLC_MQTT_FB_DOWN:
  default: {
    /* The reason the session is down, when the client knows it, else "not connected". */
    const int status = zplc_comm_status_from_errno(last_error);

    return ZPLC_COMM_HANDLER_FAIL(status == ZPLC_COMM_UNKNOWN || status == ZPLC_COMM_OK ? ZPLC_COMM_NOT_CONNECTED : status);
  }
  }
}

/* MQTT_CONNECT: reports the session; the session itself is opened by the client from the configuration. */
static int mqtt_connect_poll(uint8_t *fb_mem) {
  const int result = session_result();

  fb_mem[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] = result == ZPLC_COMM_HANDLER_DONE ? 1U : 0U;
  return result;
}

static int mqtt_publish_start(uint8_t *fb_mem, uint16_t fb_len) {
  char topic[ZPLC_STRING_DEFAULT_SIZE + 1];
  uint8_t payload[ZPLC_STRING_DEFAULT_SIZE + 1];
  uint16_t payload_len;
  const uint8_t qos = fb_mem[ZPLC_COMM_MQTT_PUBLISH_QOS_OFFSET];
  const bool retain = fb_mem[ZPLC_COMM_MQTT_PUBLISH_RETAIN_OFFSET] != 0U;

  if (qos > 2U) {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_INVALID_ADDR);
  }
  (void)zplc_fb_string_copy(topic, sizeof(topic), fb_mem, fb_len, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, FB_STRING_BYTES);
  if (topic[0] == '\0') {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_INVALID_ADDR);
  }
  /* at most the characters of the member, and what the block holds */
  payload_len = zplc_fb_string_chars(fb_mem, fb_len, ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET, FB_STRING_BYTES);
  if (payload_len != 0U) {
    memcpy(payload, &fb_mem[ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET + ZPLC_FB_STR_DATA], payload_len);
  }
  return zplc_mqtt_fb_publish(fb_mem, topic, payload, payload_len, qos, retain);
}

/* MQTT_SUBSCRIBE: the subscription of this block, and the newest message that arrived on it. */
static int mqtt_subscribe_poll(uint8_t *fb_mem, uint16_t fb_len) {
  char topic[ZPLC_STRING_DEFAULT_SIZE + 1];
  uint8_t message[ZPLC_STRING_DEFAULT_SIZE + 1];
  const uint8_t qos = fb_mem[ZPLC_COMM_MQTT_SUBSCRIBE_QOS_OFFSET];
  int result;
  int length;

  fb_mem[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] = 0U;
  (void)zplc_fb_string_copy(topic, sizeof(topic), fb_mem, fb_len, ZPLC_COMM_MQTT_SUBSCRIBE_TOPIC_OFFSET, FB_STRING_BYTES);
  if (topic[0] == '\0' || qos > 2U) {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_INVALID_ADDR);
  }

  result = zplc_mqtt_fb_subscribe(fb_mem, topic, qos);
  length = zplc_mqtt_fb_take_message(fb_mem, message, ZPLC_STRING_DEFAULT_SIZE);
  if (length >= 0) {
    /* VALID is TRUE for the one scan the message is new in; PAYLOAD keeps the last one. */
    (void)zplc_fb_string_set(fb_mem, fb_len, ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET, FB_STRING_BYTES, message, (size_t)length);
    fb_mem[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] = 1U;
  }
  return result;
}

/* ============================================================================
 * Core Dispatch Callbacks
 * ============================================================================
 */

static int zplc_comm_mqtt_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len, zplc_comm_call_t call) {
  if (!block_ok(kind, fb_mem, fb_len)) {
    return -EINVAL;
  }

  if (call == ZPLC_COMM_CALL_RESET) {
    switch (kind) {
    case ZPLC_COMM_FB_MQTT_CONNECT:
      fb_mem[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] = 0U;
      break;
    case ZPLC_COMM_FB_MQTT_PUBLISH:
      zplc_mqtt_fb_abort(fb_mem);
      break;
    case ZPLC_COMM_FB_MQTT_SUBSCRIBE:
      zplc_mqtt_fb_unsubscribe(fb_mem);
      fb_mem[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] = 0U;
      (void)zplc_fb_string_set(fb_mem, fb_len, ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET, FB_STRING_BYTES, (const uint8_t *)"", 0U);
      break;
    default:
      break;
    }
    return ZPLC_COMM_HANDLER_DONE;
  }

  switch (kind) {
  case ZPLC_COMM_FB_MQTT_CONNECT:
    return mqtt_connect_poll(fb_mem);
  case ZPLC_COMM_FB_MQTT_PUBLISH:
    return call == ZPLC_COMM_CALL_START ? mqtt_publish_start(fb_mem, fb_len) : zplc_mqtt_fb_poll(fb_mem);
  case ZPLC_COMM_FB_MQTT_SUBSCRIBE:
    return mqtt_subscribe_poll(fb_mem, fb_len);
  default:
    return -EINVAL;
  }
}

int zplc_comm_mqtt_handler_init(void) {
  int rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_CONNECT, zplc_comm_mqtt_handler);
  if (rc != 0)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_PUBLISH, zplc_comm_mqtt_handler);
  if (rc != 0)
    return rc;

  rc = zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_SUBSCRIBE, zplc_comm_mqtt_handler);
  if (rc != 0)
    return rc;

  LOG_INF("MQTT VM Handler registered");
  return 0;
}
