/**
 * @file test_comm_handler_cloud.c
 * @brief The cloud function-block handlers, behind the real dispatcher
 *        (COM-001, COM-002, COM-003, COM-004, COM-005, COM-008, COM-018).
 *
 * The handler source of firmware/app is compiled here against stand-ins for
 * the cloud services and for the MQTT client, and driven through
 * zplc_comm_fb_exec(). The worker thread is not started: the test plays its
 * part. A service that waits for a broker is a stand-in that fails the test
 * when it is called from a scan, which is the bound of COM-003: nothing the
 * scan calls waits. Blocks are allocated at exactly the length the core
 * passes, so a read or a write outside is trapped by the address sanitizer.
 * Host evidence about the handler logic; not target evidence.
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

/* --- the clock and the queue the handler is given --------------------------- */
static uint32_t now_ms;
uint32_t k_uptime_get_32(void) { return now_ms; }

#define QUEUE_DEPTH 4
static struct cloud_req *queue_items[QUEUE_DEPTH];
static int queue_count;
int k_msgq_get(struct k_msgq *queue, void *data, int timeout) {
  (void)queue; (void)timeout;
  if (queue_count == 0) {
    return -1;
  }
  memcpy(data, &queue_items[0], sizeof(void *));
  memmove(&queue_items[0], &queue_items[1], (size_t)(queue_count - 1) * sizeof(void *));
  queue_count--;
  return 0;
}
int k_msgq_put(struct k_msgq *queue, const void *data, int timeout) {
  (void)queue; (void)timeout;
  if (queue_count >= QUEUE_DEPTH) {
    return -35;
  }
  memcpy(&queue_items[queue_count++], data, sizeof(void *));
  return 0;
}
void k_msgq_init(struct k_msgq *queue, char *buffer, size_t size, uint32_t count) {
  (void)queue; (void)buffer; (void)size; (void)count;
}
int k_thread_create(struct k_thread *thread, char *stack, size_t size,
                    k_thread_entry_t entry, void *a, void *b, void *c,
                    int priority, uint32_t options, int delay) {
  (void)thread; (void)stack; (void)size; (void)entry; (void)a; (void)b;
  (void)c; (void)priority; (void)options; (void)delay;
  return 0;
}
int k_thread_name_set(struct k_thread *thread, const char *name) {
  (void)thread; (void)name;
  return 0;
}

/* --- the services ----------------------------------------------------------- */
static int in_scan; /* a service called while this is set would wait inside the scan */
static struct {
  int dps_calls;
  int dps_rc;
  int fleet_calls;
  int fleet_rc;
  char registration_id[96];
  char template_name[96];
  char broker[96];
  char client_id[96];
  /* the MQTT client */
  zplc_mqtt_fb_session_t session;
  int eg_calls;
  int eg_result;
  char eg_type[128];
  char eg_topic[128];
  char eg_data[128];
  int rebirth_calls;
  int rebirth_result;
  int poll_calls;
  int poll_result;
  int abort_calls;
  int subscribe_calls;
  int subscribe_result;
  int subscribe_topic_null;
  int unsubscribe_calls;
  int message_length;
  uint8_t message[128];
} svc;

static void world(void) {
  size_t i;

  for (i = 0U; i < CLOUD_REQ_MAX; i++) {
    s_reqs[i].head.state = ZPLC_COMM_REQ_FREE;
    s_reqs[i].head.owner = NULL;
  }
  memset(&svc, 0, sizeof(svc));
  svc.session = ZPLC_MQTT_FB_UP;
  svc.message_length = -1;
  svc.eg_result = ZPLC_COMM_HANDLER_PENDING;
  svc.rebirth_result = ZPLC_COMM_HANDLER_PENDING;
  svc.poll_result = ZPLC_COMM_HANDLER_PENDING;
  queue_count = 0;
  in_scan = 0;
  now_ms = 1000U;
  assert(zplc_comm_cloud_handler_init() == 0);
}

int zplc_azure_dps_provision(void) {
  assert(!in_scan);
  svc.dps_calls++;
  if (svc.dps_rc == 0) {
    snprintf(svc.broker, sizeof(svc.broker), "assigned-hub.azure-devices.net");
  }
  return svc.dps_rc;
}
int zplc_aws_fleet_provision(void) {
  assert(!in_scan);
  svc.fleet_calls++;
  if (svc.fleet_rc == 0) {
    snprintf(svc.client_id, sizeof(svc.client_id), "thing-0042");
  }
  return svc.fleet_rc;
}
void zplc_config_set_azure_dps_registration_id(const char *id) {
  snprintf(svc.registration_id, sizeof(svc.registration_id), "%s", id);
}
void zplc_config_set_aws_fleet_template_name(const char *name) {
  snprintf(svc.template_name, sizeof(svc.template_name), "%s", name);
}
void zplc_config_get_mqtt_broker(char *buf, size_t len) { snprintf(buf, len, "%s", svc.broker); }
void zplc_config_get_mqtt_client_id(char *buf, size_t len) { snprintf(buf, len, "%s", svc.client_id); }

zplc_mqtt_fb_session_t zplc_mqtt_fb_session(int *last_error) {
  if (last_error != NULL) {
    *last_error = 0;
  }
  return svc.session;
}
int zplc_mqtt_fb_event_grid(const void *owner, const char *event_type, const char *topic,
                            const char *data) {
  (void)owner;
  svc.eg_calls++;
  snprintf(svc.eg_type, sizeof(svc.eg_type), "%s", event_type);
  snprintf(svc.eg_topic, sizeof(svc.eg_topic), "%s", topic);
  snprintf(svc.eg_data, sizeof(svc.eg_data), "%s", data);
  return svc.eg_result;
}
int zplc_mqtt_fb_rebirth(const void *owner) {
  (void)owner;
  svc.rebirth_calls++;
  return svc.rebirth_result;
}
int zplc_mqtt_fb_poll(const void *owner) {
  (void)owner;
  svc.poll_calls++;
  return svc.poll_result;
}
void zplc_mqtt_fb_abort(const void *owner) {
  (void)owner;
  svc.abort_calls++;
}
int zplc_mqtt_fb_subscribe(const void *owner, const char *topic, uint8_t qos) {
  (void)owner; (void)qos;
  svc.subscribe_calls++;
  svc.subscribe_topic_null = topic == NULL;
  return svc.subscribe_result;
}
int zplc_mqtt_fb_take_message(const void *owner, uint8_t *payload, size_t capacity) {
  int length = svc.message_length;

  (void)owner;
  if (length >= 0) {
    assert((size_t)length <= capacity);
    memcpy(payload, svc.message, (size_t)length);
    svc.message_length = -1;
  }
  return length;
}
void zplc_mqtt_fb_unsubscribe(const void *owner) {
  (void)owner;
  svc.unsubscribe_calls++;
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
  return (uint32_t)memory[4] | ((uint32_t)memory[5] << 8) |
         ((uint32_t)memory[6] << 16) | ((uint32_t)memory[7] << 24);
}

/* BUSY, DONE, ERROR as one number: 100 busy, 10 done, 1 error. */
static int state_of(const uint8_t *memory) {
  return memory[1] * 100 + memory[2] * 10 + memory[3];
}

/* One scan of a block: the dispatcher runs in the scan, where nothing may wait. */
static void scan(zplc_comm_fb_kind_t kind, uint8_t *memory) {
  in_scan = 1;
  assert(zplc_comm_fb_exec(kind, memory, zplc_comm_fb_size((uint32_t)kind)) == 0);
  in_scan = 0;
}

static int worker_step(void) {
  struct cloud_req *req = NULL;

  if (k_msgq_get(NULL, &req, 0) != 0) {
    return 0;
  }
  cloud_process(req);
  return 1;
}

static size_t slots_in_use(void) {
  size_t i, n = 0U;

  for (i = 0U; i < CLOUD_REQ_MAX; i++) {
    if (s_reqs[i].head.state != ZPLC_COMM_REQ_FREE) {
      n++;
    }
  }
  return n;
}

/* COM-003 and COM-004: the service that waits for a broker is not called by the scan; one
 * trigger is one call; the assigned hub reaches ASSIGNED_HUB in the layout of the table. */
static void test_provisioning_runs_on_the_worker_once_per_trigger(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_DPS_PROV_SIZE);
  int scan_no;
  printf("test_provisioning_runs_on_the_worker_once_per_trigger...\n");

  world();
  memory[0] = 1;
  set_string(memory, ZPLC_COMM_AZURE_DPS_PROV_DEVICE_ID_OFFSET, "device-0042");

  scan(ZPLC_COMM_FB_AZURE_DPS_PROV, memory); /* START: queued, not run */
  assert(svc.dps_calls == 0 && queue_count == 1);
  assert(state_of(memory) == 100 && status_of(memory) == ZPLC_COMM_BUSY);
  for (scan_no = 0; scan_no < 100; scan_no++) { /* the worker is busy for a long time: the scan is not */
    scan(ZPLC_COMM_FB_AZURE_DPS_PROV, memory);
    assert(state_of(memory) == 100);
    assert(svc.dps_calls == 0 && queue_count == 1);
  }

  assert(worker_step() == 1); /* the service runs on the worker */
  assert(svc.dps_calls == 1 && strcmp(svc.registration_id, "device-0042") == 0);
  scan(ZPLC_COMM_FB_AZURE_DPS_PROV, memory);
  assert(state_of(memory) == 10 && status_of(memory) == ZPLC_COMM_OK);
  assert(memory[ZPLC_COMM_AZURE_DPS_PROV_ASSIGNED_HUB_OFFSET] == 30U);
  assert(memcmp(&memory[ZPLC_COMM_AZURE_DPS_PROV_ASSIGNED_HUB_OFFSET + 4U],
                "assigned-hub.azure-devices.net", 31U) == 0);
  /* DEVICE_ID, which ends where ASSIGNED_HUB begins in the table, was not overwritten (COM-005) */
  assert(memory[ZPLC_COMM_AZURE_DPS_PROV_DEVICE_ID_OFFSET] == 11U);
  assert(memcmp(&memory[ZPLC_COMM_AZURE_DPS_PROV_DEVICE_ID_OFFSET + 4U], "device-0042", 12U) == 0);

  for (scan_no = 0; scan_no < 100; scan_no++) { /* EN stays: nothing is repeated */
    scan(ZPLC_COMM_FB_AZURE_DPS_PROV, memory);
    assert(state_of(memory) == 10);
  }
  assert(svc.dps_calls == 1 && queue_count == 0 && slots_in_use() == 0U);

  memory[0] = 0;
  scan(ZPLC_COMM_FB_AZURE_DPS_PROV, memory);
  memory[0] = 1;
  scan(ZPLC_COMM_FB_AZURE_DPS_PROV, memory);
  assert(worker_step() == 1);
  assert(svc.dps_calls == 2);
  free(memory);
}

static void test_a_provisioning_failure_reports_a_status(void) {
  static const struct { int rc; uint32_t status; } cases[] = {
      {-110 /* ETIMEDOUT */, ZPLC_COMM_TIMEOUT},
      {-16 /* EBUSY: a provisioning is already running */, ZPLC_COMM_QUEUE_FULL},
      {-22 /* EINVAL: not configured */, ZPLC_COMM_INVALID_ADDR},
      {-13 /* EACCES: the key was refused */, ZPLC_COMM_AUTH_FAILED},
      {-95 /* ENOTSUP: the service is off */, ZPLC_COMM_UNAVAILABLE},
  };
  size_t i;
  printf("test_a_provisioning_failure_reports_a_status...\n");

  for (i = 0U; i < sizeof(cases) / sizeof(cases[0]); i++) {
    uint8_t *memory = block(ZPLC_COMM_AWS_FLEET_PROV_SIZE);

    world();
    svc.fleet_rc = cases[i].rc;
    memory[0] = 1;
    set_string(memory, ZPLC_COMM_AWS_FLEET_PROV_TEMPLATE_NAME_OFFSET, "plant-template");
    scan(ZPLC_COMM_FB_AWS_FLEET_PROV, memory);
    assert(worker_step() == 1);
    scan(ZPLC_COMM_FB_AWS_FLEET_PROV, memory);
    assert(state_of(memory) == 1 && status_of(memory) == cases[i].status);
    assert(strcmp(svc.template_name, "plant-template") == 0);
    assert(memory[ZPLC_COMM_AWS_FLEET_PROV_THING_NAME_OFFSET] == 0U); /* no thing */
    free(memory);
  }
}

static void test_fleet_provisioning_gives_the_thing_name(void) {
  uint8_t *memory = block(ZPLC_COMM_AWS_FLEET_PROV_SIZE);
  printf("test_fleet_provisioning_gives_the_thing_name...\n");

  world();
  memory[0] = 1;
  set_string(memory, ZPLC_COMM_AWS_FLEET_PROV_TEMPLATE_NAME_OFFSET, "plant-template");
  scan(ZPLC_COMM_FB_AWS_FLEET_PROV, memory);
  assert(worker_step() == 1);
  scan(ZPLC_COMM_FB_AWS_FLEET_PROV, memory);
  assert(state_of(memory) == 10);
  assert(memory[ZPLC_COMM_AWS_FLEET_PROV_THING_NAME_OFFSET] == 10U);
  assert(memcmp(&memory[ZPLC_COMM_AWS_FLEET_PROV_THING_NAME_OFFSET + 4U], "thing-0042", 11U) == 0);
  /* the last byte of the block is the dispatcher's EN of the call; the handler did not touch it */
  assert(memory[ZPLC_COMM_AWS_FLEET_PROV_SIZE - 1U] == 1U);
  free(memory);
}

/* COM-018: a service that has not answered in its time is TIMEOUT, and a late answer is dropped. */
static void test_a_provisioning_older_than_its_timeout_is_dropped(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_DPS_PROV_SIZE);
  printf("test_a_provisioning_older_than_its_timeout_is_dropped...\n");

  world();
  memory[0] = 1;
  scan(ZPLC_COMM_FB_AZURE_DPS_PROV, memory);
  now_ms += CLOUD_REQ_TIMEOUT_MS;
  scan(ZPLC_COMM_FB_AZURE_DPS_PROV, memory);
  assert(state_of(memory) == 100);
  now_ms += 1U;
  scan(ZPLC_COMM_FB_AZURE_DPS_PROV, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_TIMEOUT);

  assert(worker_step() == 1); /* the worker gets to it late: the service is not even called */
  assert(svc.dps_calls == 0 && slots_in_use() == 0U);
  free(memory);
}

/* COM-008: reset while queued or running; the pool is as full as the worker's holds say. */
static void test_reset_lets_go_of_the_request_and_a_full_pool_is_an_error(void) {
  uint8_t *blocks[CLOUD_REQ_MAX + 1U];
  size_t i;
  printf("test_reset_lets_go_of_the_request_and_a_full_pool_is_an_error...\n");

  world();
  for (i = 0U; i <= CLOUD_REQ_MAX; i++) {
    blocks[i] = block(ZPLC_COMM_AZURE_DPS_PROV_SIZE);
    blocks[i][0] = 1;
    scan(ZPLC_COMM_FB_AZURE_DPS_PROV, blocks[i]);
  }
  /* the fifth block found the pool full: ERROR with its code, nothing queued for it */
  assert(state_of(blocks[CLOUD_REQ_MAX]) == 1);
  assert(status_of(blocks[CLOUD_REQ_MAX]) == ZPLC_COMM_QUEUE_FULL);
  assert(queue_count == (int)CLOUD_REQ_MAX);

  /* the first is reset while it waits in the queue: the service is not called for it */
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_DPS_PROV, blocks[0], ZPLC_COMM_AZURE_DPS_PROV_SIZE) == 0);
  assert(state_of(blocks[0]) == 0);
  assert(worker_step() == 1);
  assert(svc.dps_calls == 0);
  assert(worker_step() == 1);
  assert(svc.dps_calls == 1);

  for (i = 0U; i <= CLOUD_REQ_MAX; i++) {
    free(blocks[i]);
  }
}

static void test_event_grid_publishes_once_and_reports_the_client(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_EG_PUB_SIZE);
  int scan_no;
  printf("test_event_grid_publishes_once_and_reports_the_client...\n");

  world();
  memory[0] = 1;
  set_string(memory, ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET, "topic-1");
  set_string(memory, ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET, "type-2");
  set_string(memory, ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET, "{\"a\":1}");

  scan(ZPLC_COMM_FB_AZURE_EG_PUB, memory);
  assert(svc.eg_calls == 1);
  assert(strcmp(svc.eg_topic, "topic-1") == 0 && strcmp(svc.eg_type, "type-2") == 0 &&
         strcmp(svc.eg_data, "{\"a\":1}") == 0);
  assert(state_of(memory) == 100);

  svc.poll_result = ZPLC_COMM_HANDLER_DONE;
  for (scan_no = 0; scan_no < 20; scan_no++) {
    scan(ZPLC_COMM_FB_AZURE_EG_PUB, memory);
    assert(state_of(memory) == 10);
  }
  assert(svc.eg_calls == 1);

  /* the three strings end where the next begins: none is cut or overwritten (COM-005) */
  assert(memory[ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET] == 7U);
  assert(memory[ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET] == 6U);
  assert(memory[ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET] == 7U);

  /* a client that is down: the failure is reported now */
  memory[0] = 0;
  scan(ZPLC_COMM_FB_AZURE_EG_PUB, memory);
  memory[0] = 1;
  svc.eg_result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NOT_CONNECTED);
  scan(ZPLC_COMM_FB_AZURE_EG_PUB, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_NOT_CONNECTED);

  /* reset while pending */
  memory[0] = 0;
  scan(ZPLC_COMM_FB_AZURE_EG_PUB, memory);
  memory[0] = 1;
  svc.eg_result = ZPLC_COMM_HANDLER_PENDING;
  svc.poll_result = ZPLC_COMM_HANDLER_PENDING;
  scan(ZPLC_COMM_FB_AZURE_EG_PUB, memory);
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_EG_PUB, memory, ZPLC_COMM_AZURE_EG_PUB_SIZE) == 0);
  assert(svc.abort_calls == 1 && state_of(memory) == 0);
  free(memory);
}

static void test_rebirth_acts_once_per_request(void) {
  uint8_t *memory = block(ZPLC_COMM_SPB_REBIRTH_SIZE);
  int scan_no;
  printf("test_rebirth_acts_once_per_request...\n");

  world();
  memory[0] = 1;
  scan(ZPLC_COMM_FB_SPB_REBIRTH, memory);
  assert(svc.rebirth_calls == 1 && state_of(memory) == 100);
  svc.poll_result = ZPLC_COMM_HANDLER_DONE;
  for (scan_no = 0; scan_no < 20; scan_no++) {
    scan(ZPLC_COMM_FB_SPB_REBIRTH, memory);
  }
  assert(svc.rebirth_calls == 1 && state_of(memory) == 10);

  /* the profile is not Sparkplug B */
  memory[0] = 0;
  scan(ZPLC_COMM_FB_SPB_REBIRTH, memory);
  memory[0] = 1;
  svc.rebirth_result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNAVAILABLE);
  scan(ZPLC_COMM_FB_SPB_REBIRTH, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_UNAVAILABLE);
  free(memory);
}

static void test_c2d_reports_the_session_and_pulses_valid_for_each_message(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_C2D_RECV_SIZE);
  printf("test_c2d_reports_the_session_and_pulses_valid_for_each_message...\n");

  world();
  memory[0] = 1;
  svc.subscribe_result = ZPLC_COMM_HANDLER_DONE;
  scan(ZPLC_COMM_FB_AZURE_C2D_RECV, memory);
  assert(state_of(memory) == 10 && svc.subscribe_topic_null);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET] == 0U);

  memcpy(svc.message, "reboot", 6U);
  svc.message_length = 6;
  scan(ZPLC_COMM_FB_AZURE_C2D_RECV, memory);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET] == 1U);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET] == 6U);
  assert(memcmp(&memory[ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET + 4U], "reboot", 7U) == 0);
  scan(ZPLC_COMM_FB_AZURE_C2D_RECV, memory);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET] == 0U); /* one scan */
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET] == 6U);

  /* COM-018: the session is down; this runtime has no C2D (profile) */
  svc.subscribe_result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NOT_CONNECTED);
  scan(ZPLC_COMM_FB_AZURE_C2D_RECV, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_NOT_CONNECTED);
  svc.subscribe_result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNAVAILABLE);
  scan(ZPLC_COMM_FB_AZURE_C2D_RECV, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_UNAVAILABLE);

  /* disabling clears the payload and drops the subscription */
  memory[0] = 0;
  scan(ZPLC_COMM_FB_AZURE_C2D_RECV, memory);
  assert(svc.unsubscribe_calls == 1);
  assert(state_of(memory) == 0 && memory[ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET] == 0U);
  free(memory);
}

/* A STRING whose length field is far beyond its member and the block: PAYLOAD is the last member. */
static void test_string_lengths_are_bounded(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_EG_PUB_SIZE);
  printf("test_string_lengths_are_bounded...\n");

  world();
  memset(memory, 'x', ZPLC_COMM_AZURE_EG_PUB_SIZE);
  memory[0] = 1;
  memory[1] = memory[2] = memory[3] = 0;
  memory[ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_TOPIC_OFFSET + 1U] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_EVENT_TYPE_OFFSET + 1U] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET] = 0xFF;
  memory[ZPLC_COMM_AZURE_EG_PUB_PAYLOAD_OFFSET + 1U] = 0xFF;
  scan(ZPLC_COMM_FB_AZURE_EG_PUB, memory);
  assert(svc.eg_calls == 1);
  assert(strlen(svc.eg_topic) == 80U && strlen(svc.eg_type) == 80U && strlen(svc.eg_data) == 80U);
  free(memory);
}

/* Clearing a received payload writes the member and nothing beyond it. */
static void test_c2d_clear_stays_in_the_member(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_C2D_RECV_SIZE);
  const unsigned end = ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET + FB_STRING_BYTES;
  unsigned i;
  printf("test_c2d_clear_stays_in_the_member...\n");

  world();
  memset(memory, 0xA5, ZPLC_COMM_AZURE_C2D_RECV_SIZE);
  memory[0] = 1;
  memory[1] = 0;
  memory[2] = 0;
  memory[3] = 0;
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_C2D_RECV, memory, ZPLC_COMM_AZURE_C2D_RECV_SIZE) == 0);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET] == 0);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_PAYLOAD_OFFSET + 1] == 0);
  assert(memory[ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET] == 0);
  /* the bytes between the end of the member and VALID are not the handler's */
  for (i = end; i < ZPLC_COMM_AZURE_C2D_RECV_VALID_OFFSET; i++) {
    assert(memory[i] == 0xA5);
  }
  free(memory);
}

static void test_short_block_is_refused(void) {
  uint8_t *memory = block(ZPLC_COMM_AZURE_EG_PUB_SIZE - 1U);
  printf("test_short_block_is_refused...\n");

  world();
  memory[0] = 1;
  assert(zplc_comm_fb_exec(ZPLC_COMM_FB_AZURE_EG_PUB, memory, ZPLC_COMM_AZURE_EG_PUB_SIZE - 1U) == -1);
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_AZURE_EG_PUB, memory, ZPLC_COMM_AZURE_EG_PUB_SIZE - 1U) == -1);
  assert(svc.eg_calls == 0);
  free(memory);
}

int main(void) {
  printf("Running cloud handler tests...\n");
  test_provisioning_runs_on_the_worker_once_per_trigger();
  test_a_provisioning_failure_reports_a_status();
  test_fleet_provisioning_gives_the_thing_name();
  test_a_provisioning_older_than_its_timeout_is_dropped();
  test_reset_lets_go_of_the_request_and_a_full_pool_is_an_error();
  test_event_grid_publishes_once_and_reports_the_client();
  test_rebirth_acts_once_per_request();
  test_c2d_reports_the_session_and_pulses_valid_for_each_message();
  test_string_lengths_are_bounded();
  test_c2d_clear_stays_in_the_member();
  test_short_block_is_refused();
  printf("All cloud handler tests passed.\n");
  return 0;
}
