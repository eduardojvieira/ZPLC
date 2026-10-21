/**
 * @file test_comm_handler_mqtt.c
 * @brief The MQTT function-block handler, behind the real dispatcher
 *        (COM-001, COM-002, COM-004, COM-005, COM-018).
 *
 * The handler source of firmware/app is compiled here against a stand-in for
 * the MQTT client (zplc_mqtt_fb.h) and driven through zplc_comm_fb_exec(), so
 * the handshake the PLC program sees is the real one. Host evidence about the
 * handler logic; not target evidence.
 *
 * SPDX-License-Identifier: MIT
 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../../../app/src/zplc_comm_mqtt_handler.c"

/* --- the MQTT client: the calls the handler makes, and what it answers --------- */
static struct {
  zplc_mqtt_fb_session_t session;
  int last_error;
  int publish_calls;
  int publish_result;
  int poll_calls;
  int poll_result;
  int abort_calls;
  char topic[256];
  uint8_t payload[256];
  size_t length;
  uint8_t qos;
  bool retain;
  const void *owner;
  int subscribe_calls;
  int subscribe_result;
  char sub_topic[256];
  uint8_t sub_qos;
  int unsubscribe_calls;
  int message_length; /* -1: none */
  uint8_t message[128];
} mqtt;

static void world(void) {
  memset(&mqtt, 0, sizeof(mqtt));
  mqtt.session = ZPLC_MQTT_FB_UP;
  mqtt.message_length = -1;
  mqtt.publish_result = ZPLC_COMM_HANDLER_PENDING;
  mqtt.poll_result = ZPLC_COMM_HANDLER_PENDING;
  assert(zplc_comm_mqtt_handler_init() == 0);
}

zplc_mqtt_fb_session_t zplc_mqtt_fb_session(int *last_error) {
  if (last_error != NULL) {
    *last_error = mqtt.last_error;
  }
  return mqtt.session;
}
int zplc_mqtt_fb_publish(const void *owner, const char *topic, const uint8_t *payload, size_t length, uint8_t qos, bool retain) {
  mqtt.publish_calls++;
  mqtt.owner = owner;
  snprintf(mqtt.topic, sizeof(mqtt.topic), "%s", topic);
  assert(length <= sizeof(mqtt.payload));
  memcpy(mqtt.payload, payload, length);
  mqtt.length = length;
  mqtt.qos = qos;
  mqtt.retain = retain;
  return mqtt.publish_result;
}
int zplc_mqtt_fb_poll(const void *owner) {
  (void)owner;
  mqtt.poll_calls++;
  return mqtt.poll_result;
}
void zplc_mqtt_fb_abort(const void *owner) {
  (void)owner;
  mqtt.abort_calls++;
}
int zplc_mqtt_fb_subscribe(const void *owner, const char *topic, uint8_t qos) {
  (void)owner;
  mqtt.subscribe_calls++;
  snprintf(mqtt.sub_topic, sizeof(mqtt.sub_topic), "%s", topic != NULL ? topic : "(c2d)");
  mqtt.sub_qos = qos;
  return mqtt.subscribe_result;
}
int zplc_mqtt_fb_take_message(const void *owner, uint8_t *payload, size_t capacity) {
  int length = mqtt.message_length;

  (void)owner;
  if (length >= 0) {
    assert((size_t)length <= capacity);
    memcpy(payload, mqtt.message, (size_t)length);
    mqtt.message_length = -1;
  }
  return length;
}
void zplc_mqtt_fb_unsubscribe(const void *owner) {
  (void)owner;
  mqtt.unsubscribe_calls++;
}

/* --- helpers ------------------------------------------------------------- */
static uint8_t *block(uint16_t length) {
  uint8_t *memory = (uint8_t *)malloc(length);
  assert(memory != NULL);
  memset(memory, 0, length);
  return memory;
}

static void set_string(uint8_t *memory, unsigned offset, const char *text) {
  const size_t length = strlen(text);
  memory[offset] = (uint8_t)length;
  memory[offset + 1U] = (uint8_t)(length >> 8);
  memcpy(&memory[offset + 4U], text, length + 1U);
}

static uint32_t status_of(const uint8_t *memory) {
  return (uint32_t)memory[4] | ((uint32_t)memory[5] << 8) | ((uint32_t)memory[6] << 16) | ((uint32_t)memory[7] << 24);
}

/* BUSY, DONE, ERROR as one number: 100 busy, 10 done, 1 error. */
static int state_of(const uint8_t *memory) { return memory[1] * 100 + memory[2] * 10 + memory[3]; }

static void scan(zplc_comm_fb_kind_t kind, uint8_t *memory) {
  assert(zplc_comm_fb_exec(kind, memory, zplc_comm_fb_size((uint32_t)kind)) == 0);
}

static void test_connect_reports_the_session(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_CONNECT_SIZE);
  printf("test_connect_reports_the_session...\n");

  world();
  memory[0] = 1;
  scan(ZPLC_COMM_FB_MQTT_CONNECT, memory);
  assert(state_of(memory) == 10 && status_of(memory) == ZPLC_COMM_OK);
  assert(memory[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] == 1U);

  mqtt.session = ZPLC_MQTT_FB_CONNECTING;
  scan(ZPLC_COMM_FB_MQTT_CONNECT, memory);
  assert(state_of(memory) == 100 && status_of(memory) == ZPLC_COMM_BUSY);
  assert(memory[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] == 0U);

  /* COM-018: the session went down; the block says so, with the reason, on the next scan */
  mqtt.session = ZPLC_MQTT_FB_DOWN;
  mqtt.last_error = -111; /* ECONNREFUSED */
  scan(ZPLC_COMM_FB_MQTT_CONNECT, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_NOT_CONNECTED);
  mqtt.last_error = -110; /* ETIMEDOUT: no CONNACK */
  scan(ZPLC_COMM_FB_MQTT_CONNECT, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_TIMEOUT);
  mqtt.last_error = 0; /* no reason known */
  scan(ZPLC_COMM_FB_MQTT_CONNECT, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_NOT_CONNECTED);
  mqtt.last_error = -95; /* MQTT is off in the configuration */
  scan(ZPLC_COMM_FB_MQTT_CONNECT, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_UNAVAILABLE);

  /* ... and when it is back, DONE */
  mqtt.session = ZPLC_MQTT_FB_UP;
  scan(ZPLC_COMM_FB_MQTT_CONNECT, memory);
  assert(state_of(memory) == 10 && memory[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] == 1U);

  memory[0] = 0;
  scan(ZPLC_COMM_FB_MQTT_CONNECT, memory);
  assert(state_of(memory) == 0 && memory[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] == 0U);
  free(memory);
}

/* COM-004: one message for one trigger; the strings are read in the layout of the table (COM-005). */
static void test_publish_sends_one_message_for_one_trigger(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_PUBLISH_SIZE);
  int scan_no;
  printf("test_publish_sends_one_message_for_one_trigger...\n");

  world();
  memory[0] = 1;
  memory[ZPLC_COMM_MQTT_PUBLISH_QOS_OFFSET] = 1U;
  memory[ZPLC_COMM_MQTT_PUBLISH_RETAIN_OFFSET] = 1U;
  set_string(memory, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "plant/line-1/temp");
  set_string(memory, ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET, "{\"t\":21.5}");

  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory); /* START */
  assert(mqtt.publish_calls == 1);
  assert(mqtt.owner == memory);
  assert(strcmp(mqtt.topic, "plant/line-1/temp") == 0);
  assert(mqtt.length == 10U && memcmp(mqtt.payload, "{\"t\":21.5}", 10U) == 0);
  assert(mqtt.qos == 1U && mqtt.retain);
  assert(state_of(memory) == 100);

  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory); /* POLL: still queued */
  assert(state_of(memory) == 100 && mqtt.poll_calls == 1);
  mqtt.poll_result = ZPLC_COMM_HANDLER_DONE; /* the client published it */
  for (scan_no = 0; scan_no < 30; scan_no++) {
    scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
    assert(state_of(memory) == 10 && status_of(memory) == ZPLC_COMM_OK);
  }
  assert(mqtt.publish_calls == 1); /* held EN: still one message */

  memory[0] = 0;
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  assert(state_of(memory) == 0);
  memory[0] = 1;
  mqtt.poll_result = ZPLC_COMM_HANDLER_PENDING;
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  assert(mqtt.publish_calls == 2 && state_of(memory) == 100);
  free(memory);
}

static void test_publish_failures_and_invalid_requests(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_PUBLISH_SIZE);
  printf("test_publish_failures_and_invalid_requests...\n");

  world();
  memory[0] = 1;
  set_string(memory, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "a/b");
  set_string(memory, ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET, "x");

  /* the session is down: ERROR with a status now, nothing kept for later */
  mqtt.publish_result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NOT_CONNECTED);
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_NOT_CONNECTED);
  assert(mqtt.publish_calls == 1);
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  assert(mqtt.publish_calls == 1); /* held: not retried every scan */

  /* the client failed it after queueing it */
  memory[0] = 0;
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  memory[0] = 1;
  mqtt.publish_result = ZPLC_COMM_HANDLER_PENDING;
  mqtt.poll_result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_TIMEOUT);
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_TIMEOUT);

  /* a request that cannot be sent is refused without asking the client */
  memory[0] = 0;
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  memory[0] = 1;
  mqtt.publish_calls = 0;
  memory[ZPLC_COMM_MQTT_PUBLISH_QOS_OFFSET] = 3U;
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_INVALID_ADDR);
  memory[0] = 0;
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  memory[0] = 1;
  memory[ZPLC_COMM_MQTT_PUBLISH_QOS_OFFSET] = 0U;
  set_string(memory, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "");
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_INVALID_ADDR);
  assert(mqtt.publish_calls == 0);
  free(memory);
}

/* COM-008: a reset while the request is queued lets go of it; the block is idle. */
static void test_publish_reset_aborts_the_request(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_PUBLISH_SIZE);
  printf("test_publish_reset_aborts_the_request...\n");

  world();
  memory[0] = 1;
  set_string(memory, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "a");
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  assert(state_of(memory) == 100);
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_MQTT_PUBLISH, memory, ZPLC_COMM_MQTT_PUBLISH_SIZE) == 0);
  assert(mqtt.abort_calls == 1);
  assert(state_of(memory) == 0 && memory[0] == 0);
  free(memory);
}

/* The block subscribes on every scan while enabled and keeps the last message; VALID is one scan. */
static void test_subscribe_delivers_a_message_for_one_scan(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_SUBSCRIBE_SIZE);
  printf("test_subscribe_delivers_a_message_for_one_scan...\n");

  world();
  memory[0] = 1;
  memory[ZPLC_COMM_MQTT_SUBSCRIBE_QOS_OFFSET] = 1U;
  set_string(memory, ZPLC_COMM_MQTT_SUBSCRIBE_TOPIC_OFFSET, "plant/cmd/#");

  mqtt.subscribe_result = ZPLC_COMM_HANDLER_PENDING; /* the broker has not acknowledged */
  scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, memory);
  assert(state_of(memory) == 100 && status_of(memory) == ZPLC_COMM_BUSY);
  assert(strcmp(mqtt.sub_topic, "plant/cmd/#") == 0 && mqtt.sub_qos == 1U);

  mqtt.subscribe_result = ZPLC_COMM_HANDLER_DONE;
  scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, memory);
  assert(state_of(memory) == 10 && memory[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] == 0U);

  memcpy(mqtt.message, "start", 5U);
  mqtt.message_length = 5;
  scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, memory);
  assert(state_of(memory) == 10 && memory[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] == 1U);
  assert(memory[ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET] == 5U);
  assert(memcmp(&memory[ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET + 4U], "start", 6U) == 0);
  /* the capacity is written, so the program can copy the value on */
  assert(memory[ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET + 2U] == 80U);

  scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, memory); /* no new message: VALID is down, PAYLOAD stays */
  assert(memory[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] == 0U);
  assert(memory[ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET] == 5U);

  /* COM-018: the session is down */
  mqtt.subscribe_result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NOT_CONNECTED);
  scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_NOT_CONNECTED);

  memory[0] = 0;
  scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, memory);
  assert(state_of(memory) == 0 && mqtt.unsubscribe_calls == 1);
  assert(memory[ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET] == 0U); /* cleared with the block */

  /* no topic: nothing to subscribe to */
  memory[0] = 1;
  set_string(memory, ZPLC_COMM_MQTT_SUBSCRIBE_TOPIC_OFFSET, "");
  mqtt.subscribe_calls = 0;
  scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_INVALID_ADDR);
  assert(mqtt.subscribe_calls == 0);
  free(memory);
}

/* A STRING whose length field is far beyond its member and the block. */
static void test_string_lengths_are_bounded(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_PUBLISH_SIZE);
  printf("test_string_lengths_are_bounded...\n");

  world();
  memset(memory, 'x', ZPLC_COMM_MQTT_PUBLISH_SIZE);
  memory[0] = 1;
  memory[1] = memory[2] = memory[3] = 0;
  memory[ZPLC_COMM_MQTT_PUBLISH_QOS_OFFSET] = 0;
  memory[ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET] = 0xFF;
  memory[ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET + 1U] = 0xFF;
  memory[ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET] = 0xFF;
  memory[ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET + 1U] = 0xFF;
  scan(ZPLC_COMM_FB_MQTT_PUBLISH, memory);
  assert(mqtt.publish_calls == 1);
  assert(strlen(mqtt.topic) == 80U); /* the member holds 80 characters */
  assert(mqtt.length == 80U);
  free(memory);
}

/* A block shorter than its kind is refused before anything is read. */
static void test_short_block_is_refused(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_PUBLISH_SIZE - 1U);
  printf("test_short_block_is_refused...\n");

  world();
  memory[0] = 1;
  assert(zplc_comm_mqtt_handler_init() == 0);
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_MQTT_PUBLISH, memory, ZPLC_COMM_MQTT_PUBLISH_SIZE - 1U) == -1);
  assert(mqtt.publish_calls == 0 && memory[1] == 0);
  free(memory);
}

int main(void) {
  printf("Running MQTT handler tests...\n");
  test_connect_reports_the_session();
  test_publish_sends_one_message_for_one_trigger();
  test_publish_failures_and_invalid_requests();
  test_publish_reset_aborts_the_request();
  test_subscribe_delivers_a_message_for_one_scan();
  test_string_lengths_are_bounded();
  test_short_block_is_refused();
  printf("All MQTT handler tests passed.\n");
  return 0;
}
