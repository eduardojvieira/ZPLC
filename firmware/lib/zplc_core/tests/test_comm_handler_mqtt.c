/**
 * @file test_comm_handler_mqtt.c
 * @brief The MQTT function-block handler against crafted blocks (COM-001).
 *
 * The handler source of firmware/app is compiled here against stand-ins for
 * the MQTT client, and called with blocks allocated at exactly the length the
 * core passes, so that a read or a write outside the block is trapped by the
 * address sanitizer. Host evidence about the handler logic; not target
 * evidence.
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

/* --- stand-ins for the MQTT client ---------------------------------------- */
static bool mqtt_connected;
static bool mqtt_subscribed;
static int enqueue_calls;
static char last_topic[256];
static size_t last_payload_len;
static uint8_t last_payload[256];

bool zplc_mqtt_is_connected(void) { return mqtt_connected; }
bool zplc_mqtt_is_subscribed(void) { return mqtt_subscribed; }
int zplc_mqtt_enqueue_publish(const char *topic, const uint8_t *payload,
                              size_t len, uint8_t qos, bool retain) {
  (void)qos;
  (void)retain;
  enqueue_calls++;
  strncpy(last_topic, topic, sizeof(last_topic) - 1U);
  last_topic[sizeof(last_topic) - 1U] = '\0';
  last_payload_len = len;
  memcpy(last_payload, payload, len < sizeof(last_payload) ? len : sizeof(last_payload));
  return 0;
}

/* --- helpers ------------------------------------------------------------- */
static uint8_t *block(uint16_t length) {
  uint8_t *memory = (uint8_t *)malloc(length);
  assert(memory != NULL);
  memset(memory, 0, length);
  return memory;
}

static void set_u16(uint8_t *memory, unsigned offset, uint16_t value) {
  memory[offset] = (uint8_t)value;
  memory[offset + 1U] = (uint8_t)(value >> 8);
}

/* MQTT_CONNECT: PROFILE (input) at 8 is not an output; CONNECTED is at 9. */
static void test_connect_writes_connected_at_its_member(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_CONNECT_SIZE);
  printf("test_connect_writes_connected_at_its_member...\n");

  memory[ZPLC_COMM_MQTT_CONNECT_EN_OFFSET] = 1;
  memory[ZPLC_COMM_MQTT_CONNECT_PROFILE_OFFSET] = 0x42;
  mqtt_connected = true;
  assert(zplc_comm_mqtt_handler(ZPLC_COMM_FB_MQTT_CONNECT, memory,
                                ZPLC_COMM_MQTT_CONNECT_SIZE, false) == 0);
  assert(memory[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] == 1);
  assert(memory[ZPLC_COMM_MQTT_CONNECT_PROFILE_OFFSET] == 0x42);
  assert(FB_CONNECT_OFF_CONNECTED == ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET);
  free(memory);
}

/* TOPIC and PAYLOAD claim a length far beyond their members and the block. */
static void test_publish_lengths_are_bounded(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_PUBLISH_SIZE);
  printf("test_publish_lengths_are_bounded...\n");

  memset(memory, 'x', ZPLC_COMM_MQTT_PUBLISH_SIZE);
  memory[ZPLC_COMM_MQTT_PUBLISH_EN_OFFSET] = 1;
  memory[ZPLC_COMM_MQTT_PUBLISH_BUSY_OFFSET] = 0;
  memory[ZPLC_COMM_MQTT_PUBLISH_DONE_OFFSET] = 0;
  set_u16(memory, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, 0xFFFFU);
  set_u16(memory, ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET, 0xFFFFU);
  enqueue_calls = 0;
  assert(zplc_comm_mqtt_handler(ZPLC_COMM_FB_MQTT_PUBLISH, memory,
                                ZPLC_COMM_MQTT_PUBLISH_SIZE, false) == 0);
  assert(enqueue_calls == 1);
  assert(strlen(last_topic) == 80U);     /* the 80 characters of the member */
  assert(last_payload_len == 80U);
  free(memory);
}

/* A publish with the strings where the contract puts them. */
static void test_publish_reads_the_contract_layout(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_PUBLISH_SIZE);
  printf("test_publish_reads_the_contract_layout...\n");

  memory[ZPLC_COMM_MQTT_PUBLISH_EN_OFFSET] = 1;
  set_u16(memory, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, 5U);
  memcpy(&memory[ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET + 4U], "a/b/c", 5U);
  set_u16(memory, ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET, 3U);
  memcpy(&memory[ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET + 4U], "123", 3U);
  enqueue_calls = 0;
  assert(zplc_comm_mqtt_handler(ZPLC_COMM_FB_MQTT_PUBLISH, memory,
                                ZPLC_COMM_MQTT_PUBLISH_SIZE, false) == 0);
  assert(enqueue_calls == 1);
  assert(strcmp(last_topic, "a/b/c") == 0);
  assert(last_payload_len == 3U && memcmp(last_payload, "123", 3U) == 0);
  free(memory);
}

/* Clearing the received payload writes the member and nothing beyond it, and
 * does not take the capacity from the block. */
static void test_subscribe_clear_stays_in_the_member(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_SUBSCRIBE_SIZE);
  const unsigned end =
      ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET + FB_STRING_BYTES;
  unsigned i;
  printf("test_subscribe_clear_stays_in_the_member...\n");

  memset(memory, 0xA5, ZPLC_COMM_MQTT_SUBSCRIBE_SIZE);
  memory[ZPLC_COMM_MQTT_SUBSCRIBE_EN_OFFSET] = 0;
  set_u16(memory, ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET, 0xFFFFU);
  set_u16(memory, ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET + 2U, 0xFFFFU);
  assert(zplc_comm_mqtt_handler(ZPLC_COMM_FB_MQTT_SUBSCRIBE, memory,
                                ZPLC_COMM_MQTT_SUBSCRIBE_SIZE, false) == 0);
  assert(memory[ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET] == 0);
  assert(memory[ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET + 1] == 0);
  for (i = end; i < ZPLC_COMM_MQTT_SUBSCRIBE_SIZE; i++)
    assert(memory[i] == 0xA5);
  free(memory);
}

/* A block shorter than its kind, or of a kind this handler does not serve. */
static void test_short_block_is_refused(void) {
  uint8_t *memory = block(ZPLC_COMM_MQTT_PUBLISH_SIZE - 1U);
  printf("test_short_block_is_refused...\n");

  memory[0] = 1;
  enqueue_calls = 0;
  assert(zplc_comm_mqtt_handler(ZPLC_COMM_FB_MQTT_PUBLISH, memory,
                                ZPLC_COMM_MQTT_PUBLISH_SIZE - 1U, false) < 0);
  assert(zplc_comm_mqtt_handler(ZPLC_COMM_FB_MQTT_PUBLISH, memory,
                                ZPLC_COMM_MQTT_PUBLISH_SIZE - 1U, true) < 0);
  assert(zplc_comm_mqtt_handler(ZPLC_COMM_FB_MQTT_PUBLISH, NULL,
                                ZPLC_COMM_MQTT_PUBLISH_SIZE, false) < 0);
  assert(enqueue_calls == 0);
  free(memory);
}

int main(void) {
  printf("Running MQTT handler tests...\n");
  test_connect_writes_connected_at_its_member();
  test_publish_lengths_are_bounded();
  test_publish_reads_the_contract_layout();
  test_subscribe_clear_stays_in_the_member();
  test_short_block_is_refused();
  printf("All MQTT handler tests passed.\n");
  return 0;
}
