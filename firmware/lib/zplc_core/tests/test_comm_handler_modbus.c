/**
 * @file test_comm_handler_modbus.c
 * @brief The Modbus function-block handler, behind the real dispatcher
 *        (COM-001, COM-002, COM-003, COM-004, COM-008, COM-018).
 *
 * The handler source of firmware/app is compiled here against a stand-in for
 * the few Zephyr calls it makes and driven through zplc_comm_fb_exec(), so the
 * handshake the PLC program sees is the real one. The worker thread is not
 * started: the test plays its part, one queued request at a time, against a
 * Modbus client that answers what the test says. Blocks are allocated at
 * exactly the length the core passes, so a read or a write outside the block is
 * trapped by the address sanitizer.
 *
 * This is host evidence about the handler logic. It is not target evidence:
 * the Zephyr build, the scheduler interplay and the Modbus link are not run
 * (firmware/tests/comm_modbus_fb runs the worker thread on native_sim).
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

#include "../../../app/src/zplc_comm_modbus_handler.c"

/* --- the clock and the queue the handler is given --------------------------- */
static uint32_t now_ms;
uint32_t k_uptime_get_32(void) { return now_ms; }
uint32_t zplc_config_get_modbus_tcp_client_timeout_ms(void) { return 500U; }

#define QUEUE_DEPTH 8
static struct modbus_req *queue_items[QUEUE_DEPTH];
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
    return -35; /* ENOMSG: the queue is full */
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

/* --- the Modbus client: what the worker calls, and what it answers ---------- */
static struct {
  int calls;
  int rc;          /* the answer: 0 or a negative errno */
  uint16_t reg;    /* what a read of holding registers gives */
  uint8_t coil;    /* what a read of coils gives */
  int last_rtu;    /* the last call was RTU */
  char host[96];
  uint16_t port;
  uint8_t unit;
  uint16_t addr;
  uint16_t value;
  bool coil_value;
} client;

static void client_reset(void) {
  memset(&client, 0, sizeof(client));
}

static int note_tcp(const char *h, uint16_t p, uint8_t u, uint16_t a) {
  client.calls++;
  client.last_rtu = 0;
  snprintf(client.host, sizeof(client.host), "%s", h);
  client.port = p;
  client.unit = u;
  client.addr = a;
  return client.rc;
}
static int note_rtu(uint8_t u, uint16_t a) {
  client.calls++;
  client.last_rtu = 1;
  client.host[0] = '\0';
  client.unit = u;
  client.addr = a;
  return client.rc;
}
int zplc_modbus_rtu_client_read_holding(uint8_t s, uint16_t r, uint16_t c, uint16_t *o) {
  int rc = note_rtu(s, r);
  (void)c;
  if (rc == 0) { o[0] = client.reg; }
  return rc;
}
int zplc_modbus_rtu_client_write_register(uint8_t s, uint16_t r, uint16_t v) {
  client.value = v;
  return note_rtu(s, r);
}
int zplc_modbus_rtu_client_write_multiple(uint8_t s, uint16_t r, uint16_t c, const uint16_t *v) {
  (void)c; (void)v;
  return note_rtu(s, r);
}
int zplc_modbus_rtu_client_read_coils(uint8_t s, uint16_t a, uint16_t c, uint8_t *o) {
  int rc = note_rtu(s, a);
  (void)c;
  if (rc == 0) { o[0] = client.coil; }
  return rc;
}
int zplc_modbus_rtu_client_write_coil(uint8_t s, uint16_t a, bool v) {
  client.coil_value = v;
  return note_rtu(s, a);
}
int zplc_modbus_tcp_client_read_holding(const char *h, uint16_t p, uint8_t u, uint16_t r, uint16_t c, uint16_t *o) {
  int rc = note_tcp(h, p, u, r);
  (void)c;
  if (rc == 0) { o[0] = client.reg; }
  return rc;
}
int zplc_modbus_tcp_client_write_register(const char *h, uint16_t p, uint8_t u, uint16_t r, uint16_t v) {
  client.value = v;
  return note_tcp(h, p, u, r);
}
int zplc_modbus_tcp_client_write_multiple(const char *h, uint16_t p, uint8_t u, uint16_t r, uint16_t c, const uint16_t *v) {
  (void)c; (void)v;
  return note_tcp(h, p, u, r);
}
int zplc_modbus_tcp_client_read_coils(const char *h, uint16_t p, uint8_t u, uint16_t a, uint16_t c, uint8_t *o) {
  int rc = note_tcp(h, p, u, a);
  (void)c;
  if (rc == 0) { o[0] = client.coil; }
  return rc;
}
int zplc_modbus_tcp_client_write_coil(const char *h, uint16_t p, uint8_t u, uint16_t a, bool v) {
  client.coil_value = v;
  return note_tcp(h, p, u, a);
}

/* --- helpers ------------------------------------------------------------- */
#define SIZE ZPLC_COMM_MB_READ_HREG_SIZE

static uint8_t *block(void) {
  uint8_t *memory = (uint8_t *)malloc(SIZE);
  assert(memory != NULL);
  memset(memory, 0, SIZE);
  return memory;
}

static void set_u16(uint8_t *memory, unsigned offset, uint16_t value) {
  memory[offset] = (uint8_t)value;
  memory[offset + 1U] = (uint8_t)(value >> 8);
}

static void set_host(uint8_t *memory, const char *text) {
  const size_t length = strlen(text);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET, (uint16_t)length);
  memcpy(&memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET + 4U], text, length + 1U);
}

/* A TCP request for `count` items at address 5 of unit 3, port 1502. */
static void request(uint8_t *memory, uint16_t count) {
  memory[0] = 1; /* EN */
  memory[ZPLC_COMM_MB_READ_HREG_PROTO_OFFSET] = 1;
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_SLAVE_ID_OFFSET, 3U);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_ADDR_OFFSET, 5U);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_COUNT_OFFSET, count);
  set_host(memory, "10.0.0.7");
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_PORT_OFFSET, 1502U);
}

static void reset_world(void) {
  size_t i;

  for (i = 0U; i < MAX_ASYNC_TX; i++) {
    s_tx_pool[i].head.state = ZPLC_COMM_REQ_FREE;
    s_tx_pool[i].head.owner = NULL;
  }
  queue_count = 0;
  now_ms = 1000U;
  client_reset();
  assert(zplc_comm_modbus_handler_init() == 0);
}

static uint32_t status_of(const uint8_t *memory) {
  return (uint32_t)memory[4] | ((uint32_t)memory[5] << 8) |
         ((uint32_t)memory[6] << 16) | ((uint32_t)memory[7] << 24);
}

/* BUSY, DONE, ERROR as one number: 100 busy, 10 done, 1 error. */
static int state_of(const uint8_t *memory) {
  return memory[1] * 100 + memory[2] * 10 + memory[3];
}

static void scan(zplc_comm_fb_kind_t kind, uint8_t *memory) {
  assert(zplc_comm_fb_exec(kind, memory, zplc_comm_fb_size((uint32_t)kind)) == 0);
}

/* The worker takes the oldest queued request and runs it. Returns 0 when the queue was empty. */
static int worker_step(void) {
  struct modbus_req *tx = NULL;

  if (k_msgq_get(NULL, &tx, 0) != 0) {
    return 0;
  }
  modbus_process(tx);
  return 1;
}

static size_t slots_in_use(void) {
  size_t i, n = 0U;

  for (i = 0U; i < MAX_ASYNC_TX; i++) {
    if (s_tx_pool[i].head.state != ZPLC_COMM_REQ_FREE) {
      n++;
    }
  }
  return n;
}

/* A count the VALUE member cannot hold is refused with a defined status and
 * nothing is queued; a count it can hold is accepted (COM-001). */
static void test_count_is_validated_against_the_result_member(void) {
  static const zplc_comm_fb_kind_t kinds[4] = {
      ZPLC_COMM_FB_MB_READ_HREG, ZPLC_COMM_FB_MB_WRITE_HREG,
      ZPLC_COMM_FB_MB_READ_COIL, ZPLC_COMM_FB_MB_WRITE_COIL};
  static const uint16_t counts[] = {0U, 2U, 3U, 47U, 48U, 110U, 123U, 124U, 250U, 2000U, 2001U, 0xFFFFU};
  size_t kind, index;
  printf("test_count_is_validated_against_the_result_member...\n");

  for (kind = 0U; kind < 4U; kind++) {
    for (index = 0U; index < sizeof(counts) / sizeof(counts[0]); index++) {
      uint8_t *memory = block();
      reset_world();
      request(memory, counts[index]);
      scan(kinds[kind], memory);
      assert(state_of(memory) == 1);
      assert(status_of(memory) == ZPLC_COMM_INVALID_ADDR);
      assert(queue_count == 0 && slots_in_use() == 0U);
      free(memory);
    }
    {
      uint8_t *memory = block();
      reset_world();
      request(memory, 1U);
      scan(kinds[kind], memory);
      assert(state_of(memory) == 100 && status_of(memory) == ZPLC_COMM_BUSY);
      assert(queue_count == 1);
      free(memory);
    }
  }
}

/* The limits are what VALUE holds: the result ends before HOST begins. */
static void test_result_buffer_does_not_overlap_the_parameters(void) {
  printf("test_result_buffer_does_not_overlap_the_parameters...\n");
  assert(ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET + 2U * MAX_MODBUS_REG_COUNT <=
         ZPLC_COMM_MB_READ_HREG_HOST_OFFSET);
  assert(ZPLC_COMM_MB_READ_COIL_VALUE_OFFSET + MAX_MODBUS_COIL_COUNT <=
         ZPLC_COMM_MB_READ_COIL_HOST_OFFSET);
}

/* COM-002: BUSY sticks across scans while the worker has not finished, and the
 * completed read lands in VALUE and nowhere else (COM-001). */
static void test_busy_sticks_until_the_worker_finishes_and_the_result_stays_in_value(void) {
  uint8_t *memory = block();
  uint8_t before[SIZE];
  int scan_no;
  printf("test_busy_sticks_until_the_worker_finishes_and_the_result_stays_in_value...\n");

  reset_world();
  request(memory, 1U);
  memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET - 1U] = 0x77; /* padding byte */
  client.reg = 0xBEEFU;

  scan(ZPLC_COMM_FB_MB_READ_HREG, memory); /* START */
  assert(state_of(memory) == 100 && queue_count == 1);
  for (scan_no = 0; scan_no < 5; scan_no++) {
    scan(ZPLC_COMM_FB_MB_READ_HREG, memory); /* POLL: the worker has not run */
    assert(state_of(memory) == 100 && status_of(memory) == ZPLC_COMM_BUSY);
    assert(queue_count == 1); /* no second request */
  }
  memcpy(before, memory, SIZE);

  assert(worker_step() == 1);
  assert(client.calls == 1 && client.unit == 3U && client.addr == 5U);
  assert(strcmp(client.host, "10.0.0.7") == 0 && client.port == 1502U && !client.last_rtu);

  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 10 && status_of(memory) == ZPLC_COMM_OK);
  assert(memory[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET] == 0xEF);
  assert(memory[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET + 1] == 0xBE);
  assert(memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET - 1U] == 0x77); /* padding */
  /* nothing but the handshake and VALUE changed */
  {
    size_t i;
    for (i = 8U; i < SIZE; i++) {
      if (i == ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET ||
          i == ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET + 1U) {
        continue;
      }
      assert(memory[i] == before[i]);
    }
  }
  assert(slots_in_use() == 0U);
  free(memory);
}

/* COM-004: one rising EN is one request, whatever EN does afterwards. */
static void test_one_trigger_is_one_request_and_a_new_rise_is_another(void) {
  uint8_t *memory = block();
  int scan_no;
  printf("test_one_trigger_is_one_request_and_a_new_rise_is_another...\n");

  reset_world();
  request(memory, 1U);
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(worker_step() == 1);
  for (scan_no = 0; scan_no < 50; scan_no++) {
    scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
    assert(state_of(memory) == 10); /* DONE, held */
  }
  assert(client.calls == 1 && queue_count == 0);

  /* EN falls: the result goes, and the next rise is a second request, not the first one's result */
  memory[0] = 0;
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 0);
  memory[0] = 1;
  client.reg = 7U;
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 100 && queue_count == 1);
  assert(worker_step() == 1);
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 10 && memory[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET] == 7U);
  assert(client.calls == 2);
  free(memory);
}

/* The status of a failed request is a documented code, whatever the client's errno (COM-006, COM-018). */
static void test_a_failed_request_reports_a_documented_status(void) {
  static const struct { int rc; uint32_t status; } cases[] = {
      {-110 /* ETIMEDOUT */, ZPLC_COMM_TIMEOUT},
      {-111 /* ECONNREFUSED */, ZPLC_COMM_NOT_CONNECTED},
      {-104 /* ECONNRESET */, ZPLC_COMM_NOT_CONNECTED},
      {-5 /* EIO */, ZPLC_COMM_PROTO_ERROR},
      {-95 /* ENOTSUP */, ZPLC_COMM_UNAVAILABLE},
      {-9999, ZPLC_COMM_UNKNOWN},
  };
  size_t i;
  printf("test_a_failed_request_reports_a_documented_status...\n");

  for (i = 0U; i < sizeof(cases) / sizeof(cases[0]); i++) {
    uint8_t *memory = block();

    reset_world();
    request(memory, 1U);
    client.rc = cases[i].rc;
    scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
    assert(worker_step() == 1);
    scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
    assert(state_of(memory) == 1 && status_of(memory) == cases[i].status);
    assert(slots_in_use() == 0U);
    free(memory);
  }
}

/* COM-018: a request that the worker does not finish in its time is reported
 * TIMEOUT, and the late result is dropped, not delivered to the block that asks next. */
static void test_a_request_older_than_its_timeout_is_dropped_not_replayed(void) {
  uint8_t *memory = block();
  printf("test_a_request_older_than_its_timeout_is_dropped_not_replayed...\n");

  reset_world();
  request(memory, 1U);
  client.reg = 0x1111U;
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 100);

  now_ms += modbus_request_timeout_ms();
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 100); /* at the limit, not over it */
  now_ms += 1U;
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_TIMEOUT);

  /* the worker gets to it late: the request was let go of, so nothing is sent and the slot is free */
  assert(worker_step() == 1);
  assert(client.calls == 0);
  assert(slots_in_use() == 0U);
  assert(memory[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET] == 0U);
  free(memory);
}

/* COM-008: a block reset while its request is queued or running does not give
 * the slot back to another block until the worker is through with it. */
static void test_reset_while_in_flight_keeps_the_slot_until_the_worker_is_through(void) {
  uint8_t *a = block();
  uint8_t *others[MAX_ASYNC_TX];
  size_t i;
  struct modbus_req *running;
  printf("test_reset_while_in_flight_keeps_the_slot_until_the_worker_is_through...\n");

  reset_world();
  request(a, 1U);
  scan(ZPLC_COMM_FB_MB_READ_HREG, a);
  assert(queue_count == 1);
  running = queue_items[0];
  /* the worker has taken it and is in the client */
  assert(zplc_comm_req_begin(&s_pool, &running->head) == 1);
  queue_count = 0;

  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_MB_READ_HREG, a, SIZE) == 0);
  assert(state_of(a) == 0 && status_of(a) == 0 && a[0] == 0);
  assert(running->head.state == ZPLC_COMM_REQ_ABANDONED);

  /* seven more blocks fill every other slot; the eighth finds the pool full while the worker holds the first */
  for (i = 0U; i < MAX_ASYNC_TX; i++) {
    others[i] = block();
    request(others[i], 1U);
    scan(ZPLC_COMM_FB_MB_READ_HREG, others[i]);
  }
  assert(state_of(others[MAX_ASYNC_TX - 1U]) == 1);
  assert(status_of(others[MAX_ASYNC_TX - 1U]) == ZPLC_COMM_QUEUE_FULL); /* COM-008 */
  assert(running->host[0] != '\0'); /* the worker's buffers are intact */
  assert(strcmp(running->host, "10.0.0.7") == 0);

  /* the worker finishes: the abandoned result is dropped and the slot is free */
  zplc_comm_req_finish(&s_pool, &running->head, ZPLC_COMM_HANDLER_DONE);
  assert(running->head.state == ZPLC_COMM_REQ_FREE);
  scan(ZPLC_COMM_FB_MB_READ_HREG, a);
  assert(state_of(a) == 0 || state_of(a) == 100); /* EN is 0 again after reset: idle */

  for (i = 0U; i < MAX_ASYNC_TX; i++) {
    free(others[i]);
  }
  free(a);
}

/* A reset while the request still waits in the queue: nothing is sent. */
static void test_reset_while_queued_sends_nothing(void) {
  uint8_t *memory = block();
  printf("test_reset_while_queued_sends_nothing...\n");

  reset_world();
  request(memory, 1U);
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(zplc_comm_fb_reset(ZPLC_COMM_FB_MB_READ_HREG, memory, SIZE) == 0);
  assert(worker_step() == 1);
  assert(client.calls == 0);
  assert(slots_in_use() == 0U);
  free(memory);
}

/* The value a write block holds, and the transport it asks for, reach the client. */
static void test_write_values_and_the_rtu_transport_reach_the_client(void) {
  uint8_t *memory = block();
  printf("test_write_values_and_the_rtu_transport_reach_the_client...\n");

  reset_world();
  request(memory, 1U);
  set_u16(memory, ZPLC_COMM_MB_WRITE_HREG_VALUE_OFFSET, 0xA55AU);
  scan(ZPLC_COMM_FB_MB_WRITE_HREG, memory);
  assert(worker_step() == 1);
  assert(client.value == 0xA55AU && client.unit == 3U && client.addr == 5U);
  scan(ZPLC_COMM_FB_MB_WRITE_HREG, memory);
  assert(state_of(memory) == 10);
  free(memory);

  memory = block();
  reset_world();
  request(memory, 1U);
  memory[ZPLC_COMM_MB_WRITE_COIL_PROTO_OFFSET] = 0; /* RTU: no host, no port needed */
  set_host(memory, "");
  set_u16(memory, ZPLC_COMM_MB_WRITE_COIL_PORT_OFFSET, 0U);
  memory[ZPLC_COMM_MB_WRITE_COIL_VALUE_OFFSET] = 1U;
  scan(ZPLC_COMM_FB_MB_WRITE_COIL, memory);
  assert(worker_step() == 1);
  assert(client.last_rtu && client.coil_value && client.unit == 3U);
  scan(ZPLC_COMM_FB_MB_WRITE_COIL, memory);
  assert(state_of(memory) == 10);
  free(memory);

  memory = block();
  reset_world();
  request(memory, 1U);
  client.coil = 1U;
  scan(ZPLC_COMM_FB_MB_READ_COIL, memory);
  assert(worker_step() == 1);
  scan(ZPLC_COMM_FB_MB_READ_COIL, memory);
  assert(state_of(memory) == 10 && memory[ZPLC_COMM_MB_READ_COIL_VALUE_OFFSET] == 1U);
  free(memory);
}

/* A request that can never be served is refused before it takes a slot. */
static void test_requests_that_cannot_be_served_are_refused(void) {
  uint8_t *memory = block();
  printf("test_requests_that_cannot_be_served_are_refused...\n");

  reset_world();
  request(memory, 1U);
  memory[ZPLC_COMM_MB_READ_HREG_PROTO_OFFSET] = 2U; /* neither RTU nor TCP */
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_INVALID_ADDR);

  memory[0] = 0;
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  request(memory, 1U);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_SLAVE_ID_OFFSET, 300U); /* no unit has that identifier */
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_INVALID_ADDR);

  memory[0] = 0;
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  request(memory, 1U);
  set_host(memory, ""); /* TCP with no host */
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_INVALID_ADDR);

  memory[0] = 0;
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  request(memory, 1U);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_PORT_OFFSET, 0U); /* TCP port 0 */
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(state_of(memory) == 1 && status_of(memory) == ZPLC_COMM_INVALID_ADDR);
  assert(queue_count == 0 && slots_in_use() == 0U);
  free(memory);
}

/* HOST claims a length far beyond its member and the block. */
static void test_host_length_is_bounded(void) {
  uint8_t *memory = block();
  printf("test_host_length_is_bounded...\n");

  reset_world();
  request(memory, 1U);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET, 0xFFFFU);
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET + 2U, 0xFFFFU);
  memset(&memory[ZPLC_COMM_MB_READ_HREG_HOST_OFFSET + 4U], 'h',
         ZPLC_COMM_MB_READ_HREG_PORT_OFFSET - ZPLC_COMM_MB_READ_HREG_HOST_OFFSET - 4U);
  scan(ZPLC_COMM_FB_MB_READ_HREG, memory);
  assert(queue_count == 1);
  assert(strlen(queue_items[0]->host) == sizeof(queue_items[0]->host) - 1U);
  free(memory);
}

/* A block shorter than its kind is refused before anything is read. */
static void test_short_block_is_refused(void) {
  uint8_t *memory = (uint8_t *)malloc(SIZE - 1U);
  printf("test_short_block_is_refused...\n");

  assert(memory != NULL);
  memset(memory, 0, SIZE - 1U);
  memory[0] = 1;
  reset_world();
  assert(zplc_comm_modbus_handler(ZPLC_COMM_FB_MB_READ_HREG, memory, SIZE - 1U,
                                  ZPLC_COMM_CALL_START) < 0);
  assert(zplc_comm_modbus_handler(ZPLC_COMM_FB_MB_READ_HREG, memory, SIZE - 1U,
                                  ZPLC_COMM_CALL_RESET) < 0);
  assert(zplc_comm_modbus_handler(ZPLC_COMM_FB_MQTT_CONNECT, memory, 12U,
                                  ZPLC_COMM_CALL_START) < 0);
  assert(queue_count == 0 && memory[1] == 0);
  free(memory);
}

int main(void) {
  printf("Running Modbus handler tests...\n");
  test_count_is_validated_against_the_result_member();
  test_result_buffer_does_not_overlap_the_parameters();
  test_busy_sticks_until_the_worker_finishes_and_the_result_stays_in_value();
  test_one_trigger_is_one_request_and_a_new_rise_is_another();
  test_a_failed_request_reports_a_documented_status();
  test_a_request_older_than_its_timeout_is_dropped_not_replayed();
  test_reset_while_in_flight_keeps_the_slot_until_the_worker_is_through();
  test_reset_while_queued_sends_nothing();
  test_write_values_and_the_rtu_transport_reach_the_client();
  test_requests_that_cannot_be_served_are_refused();
  test_host_length_is_bounded();
  test_short_block_is_refused();
  printf("All Modbus handler tests passed.\n");
  return 0;
}
