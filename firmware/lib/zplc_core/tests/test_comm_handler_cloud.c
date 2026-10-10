/**
 * @file test_comm_handler_cloud.c
 * @brief The cloud function-block handlers against crafted blocks (COM-001).
 *
 * The handler source of firmware/app is compiled here against stand-ins for
 * the cloud services, and called with blocks allocated at exactly the length
 * the core passes, so that a read or a write outside the block is trapped by
 * the address sanitizer. Host evidence about the handler logic; not target
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

#include "../../../app/src/zplc_comm_cloud_handler.c"

/* --- stand-ins for the cloud services -------------------------------------- */
static int publish_calls;
static char last_event_type[256];
static char last_topic[256];
static char last_data[256];

int zplc_azure_dps_provision(void) { return 0; }
int zplc_aws_fleet_provision(void) { return 0; }
void zplc_mqtt_request_backoff_reset(void) {}
int zplc_azure_event_grid_publish(const char *event_type, const char *source,
                                  const char *topic, const char *data) {
  (void)source;
  publish_calls++;
  snprintf(last_event_type, sizeof(last_event_type), "%s", event_type);
  snprintf(last_topic, sizeof(last_topic), "%s", topic);
  snprintf(last_data, sizeof(last_data), "%s", data);
  return 0;
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
  memcpy(&memory[offset + 4U], text, length);
}

/* Strings are where the contract puts them: [len u16][cap u16][data at 4]. */
static void test_event_grid_reads_the_contract_layout(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_EG_PUB_SIZE);
  printf("test_event_grid_reads_the_contract_layout...\n");

  memory[0] = 1; /* EN */
  set_string(memory, ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET, "topic-1");
  set_string(memory, ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET, "type-2");
  set_string(memory, ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET, "{\"a\":1}");
  publish_calls = 0;
  assert(zplc_comm_cloud_handler(ZPLC_COMM_FB_AZURE_EG_PUB, memory,
                                 ZPLC_COMM_AZURE_EG_PUB_SIZE, false) == 0);
  assert(publish_calls == 1);
  assert(strcmp(last_topic, "topic-1") == 0);
  assert(strcmp(last_event_type, "type-2") == 0);
  assert(strcmp(last_data, "{\"a\":1}") == 0);
  assert(STR_OFF_LEN == ZPLC_FB_STR_LEN && STR_OFF_CAP == ZPLC_FB_STR_CAP &&
         STR_OFF_DATA == ZPLC_FB_STR_DATA);
  free(memory);
}

/* PAYLOAD is the last member of the block; its length is far beyond both. */
static void test_event_grid_lengths_are_bounded(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_EG_PUB_SIZE);
  printf("test_event_grid_lengths_are_bounded...\n");

  memset(memory, 'x', ZPLC_COMM_AZURE_EG_PUB_SIZE);
  memory[0] = 1;
  memory[ZPLC_COMM_AZURE_EG_PUB_DONE_OFFSET] = 0;
  memory[ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET + 1U] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET + 1U] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET + 1U] = 0xFF;
  publish_calls = 0;
  assert(zplc_comm_cloud_handler(ZPLC_COMM_FB_AZURE_EG_PUB, memory,
                                 ZPLC_COMM_AZURE_EG_PUB_SIZE, false) == 0);
  assert(publish_calls == 1);
  assert(strlen(last_topic) == 63U);      /* its 64-byte buffer */
  assert(strlen(last_event_type) == 63U);
  /* payload: the 128-byte buffer would take 127, the member holds 80 */
  assert(strlen(last_data) == 80U);
  free(memory);
}

/* Clearing a received payload writes the member and nothing beyond it. */
static void test_c2d_clear_stays_in_the_member(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_C2D_RECV_SIZE);
  const unsigned end = ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET + FB_STRING_BYTES;
  unsigned i;
  printf("test_c2d_clear_stays_in_the_member...\n");

  memset(memory, 0xA5, ZPLC_COMM_AZURE_C2D_RECV_SIZE);
  memory[0] = 0; /* EN off: the handler clears the payload */
  assert(zplc_comm_cloud_handler(ZPLC_COMM_FB_AZURE_C2D_RECV, memory,
                                 ZPLC_COMM_AZURE_C2D_RECV_SIZE, false) == 0);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET] == 0);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET + 1] == 0);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET] == 0);
  /* the bytes between the end of the member and VALID are not the handler's */
  for (i = end; i < ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET; i++)
    assert(memory[i] == 0xA5);
  free(memory);
}

static void test_short_block_is_refused(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_EG_PUB_SIZE - 1U);
  printf("test_short_block_is_refused...\n");

  memory[0] = 1;
  publish_calls = 0;
  assert(zplc_comm_cloud_handler(ZPLC_COMM_FB_AZURE_EG_PUB, memory,
                                 ZPLC_COMM_AZURE_EG_PUB_SIZE - 1U, false) < 0);
  assert(zplc_comm_cloud_handler(ZPLC_COMM_FB_AZURE_EG_PUB, memory,
                                 ZPLC_COMM_AZURE_EG_PUB_SIZE - 1U, true) < 0);
  assert(publish_calls == 0);
  free(memory);
}

int main(void) {
  printf("Running cloud handler tests...\n");
  test_event_grid_reads_the_contract_layout();
  test_event_grid_lengths_are_bounded();
  test_c2d_clear_stays_in_the_member();
  test_short_block_is_refused();
  printf("All cloud handler tests passed.\n");
  return 0;
}
