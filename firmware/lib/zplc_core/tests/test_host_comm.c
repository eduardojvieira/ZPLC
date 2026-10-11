/**
 * @file test_host_comm.c
 * @brief The communication blocks in the simulation runtime, on real sockets (COM-006, COM-009, COM-018).
 *
 * The handlers of firmware/app run here exactly as the runtime links them (host_comm.c, the POSIX kernel shim,
 * the Modbus TCP client and the MQTT client of the host), behind the real dispatcher. The peers are the
 * loopback endpoints of loopback_endpoints.c on 127.0.0.1: a Modbus TCP server and an MQTT broker that speak
 * the protocol on a socket, and that this test makes stay silent, answer late, refuse and drop the connection.
 *
 * What it executes for each block: success, timeout, error and reset while busy; that a scan never waits for
 * the peer (the longest call of a block is bounded while the peer holds the answer for half a second); that one
 * rising EN is one request on the wire; and, for MQTT, the loss of the session, a request that was queued when
 * it was lost and is dropped (not replayed), and the reconnection.
 *
 * This is evidence about the blocks against protocol doubles. It is not evidence about a real device, a real
 * broker or a cloud service.
 *
 * SPDX-License-Identifier: MIT
 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#define _POSIX_C_SOURCE 200809L

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include <zplc_comm_dispatch.h>

#include "host_comm.h"
#include "loopback_endpoints.h"
#include "zplc_comm_fb_access.h"

#define STRING_ROOM ((uint16_t)(ZPLC_STRING_DATA_OFFSET + ZPLC_STRING_DEFAULT_SIZE + 1))

static int64_t now_ms(void) {
  struct timespec now;

  clock_gettime(CLOCK_MONOTONIC, &now);
  return (int64_t)now.tv_sec * 1000 + (int64_t)(now.tv_nsec / 1000000L);
}

static void sleep_ms(long ms) {
  struct timespec span = {.tv_sec = ms / 1000, .tv_nsec = (ms % 1000) * 1000000L};

  nanosleep(&span, NULL);
}

/* --- the blocks ---------------------------------------------------------------------------------------------- */

static int64_t longest_scan_ms;

static uint8_t *block(zplc_comm_fb_kind_t kind) {
  uint8_t *memory = calloc(1U, zplc_comm_fb_size((uint32_t)kind));

  assert(memory != NULL);
  return memory;
}

static void scan(zplc_comm_fb_kind_t kind, uint8_t *memory) {
  const int64_t started = now_ms();

  assert(zplc_comm_fb_exec(kind, memory, zplc_comm_fb_size((uint32_t)kind)) == 0);
  if (now_ms() - started > longest_scan_ms) {
    longest_scan_ms = now_ms() - started;
  }
}

static void reset(zplc_comm_fb_kind_t kind, uint8_t *memory) {
  assert(zplc_comm_fb_reset(kind, memory, zplc_comm_fb_size((uint32_t)kind)) == 0);
}

static uint32_t status_of(const uint8_t *memory) {
  return (uint32_t)memory[4] | ((uint32_t)memory[5] << 8) | ((uint32_t)memory[6] << 16) |
         ((uint32_t)memory[7] << 24);
}

#define BUSY(m) ((m)[1])
#define DONE(m) ((m)[2])
#define ERROR_OF(m) ((m)[3])

static void set_u16(uint8_t *memory, unsigned offset, uint16_t value) {
  memory[offset] = (uint8_t)value;
  memory[offset + 1U] = (uint8_t)(value >> 8);
}

static uint16_t get_u16(const uint8_t *memory, unsigned offset) {
  return (uint16_t)(memory[offset] | (memory[offset + 1U] << 8));
}

static void set_text(uint8_t *memory, zplc_comm_fb_kind_t kind, unsigned offset, const char *text) {
  assert(zplc_fb_string_set(memory, zplc_comm_fb_size((uint32_t)kind), (uint16_t)offset, STRING_ROOM,
                            (const uint8_t *)text, strlen(text)) == strlen(text));
}

/* Scan until the block is no longer BUSY, a scan every 2 ms, for at most `limit_ms`. */
static bool settle(zplc_comm_fb_kind_t kind, uint8_t *memory, int64_t limit_ms) {
  const int64_t deadline = now_ms() + limit_ms;

  scan(kind, memory);
  while (BUSY(memory) != 0U) {
    if (now_ms() > deadline) {
      return false;
    }
    sleep_ms(2);
    scan(kind, memory);
  }
  return true;
}

/* Scan until `done` says the state is reached, for at most `limit_ms`. */
typedef bool (*state_fn)(const uint8_t *memory);
static bool until(zplc_comm_fb_kind_t kind, uint8_t *memory, state_fn done, int64_t limit_ms) {
  const int64_t deadline = now_ms() + limit_ms;

  for (;;) {
    scan(kind, memory);
    if (done(memory)) {
      return true;
    }
    if (now_ms() > deadline) {
      return false;
    }
    sleep_ms(2);
  }
}

/* --- the Modbus blocks ----------------------------------------------------------------------------------------- */

static zplc_loopback_modbus_t *server;
static uint16_t server_port;

/* A TCP request of the blocks of kind `kind`, to `port`: EN is not set. */
static void modbus_request(uint8_t *memory, zplc_comm_fb_kind_t kind, uint16_t port, uint16_t address) {
  memory[8] = 1U; /* PROTO: TCP */
  set_u16(memory, 9U, 1U); /* SLAVE_ID */
  set_u16(memory, 11U, address);
  set_u16(memory, 13U, 1U); /* COUNT */
  set_text(memory, kind, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET, "127.0.0.1");
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_PORT_OFFSET, port);
}

static void test_a_holding_register_is_read_and_a_held_enable_is_one_request(void) {
  uint8_t *b = block(ZPLC_COMM_FB_MB_READ_HREG);
  uint32_t before = zplc_loopback_modbus_requests(server);
  int i;

  printf("test_a_holding_register_is_read_and_a_held_enable_is_one_request...\n");
  zplc_loopback_modbus_set_register(server, 5U, 0x1234U);
  modbus_request(b, ZPLC_COMM_FB_MB_READ_HREG, server_port, 5U);
  b[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, b, 3000));
  assert(DONE(b) == 1U && ERROR_OF(b) == 0U && status_of(b) == ZPLC_COMM_OK);
  assert(get_u16(b, ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET) == 0x1234U);
  for (i = 0; i < 30; i++) {
    scan(ZPLC_COMM_FB_MB_READ_HREG, b);
    sleep_ms(1);
  }
  assert(DONE(b) == 1U && BUSY(b) == 0U);
  assert(zplc_loopback_modbus_requests(server) == before + 1U);

  /* EN falls and rises: one more request, and the new value */
  zplc_loopback_modbus_set_register(server, 5U, 0x4321U);
  b[0] = 0U;
  scan(ZPLC_COMM_FB_MB_READ_HREG, b);
  assert(DONE(b) == 0U);
  b[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, b, 3000));
  assert(get_u16(b, ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET) == 0x4321U);
  assert(zplc_loopback_modbus_requests(server) == before + 2U);
  free(b);
}

static void test_a_holding_register_is_written(void) {
  uint8_t *b = block(ZPLC_COMM_FB_MB_WRITE_HREG);

  printf("test_a_holding_register_is_written...\n");
  modbus_request(b, ZPLC_COMM_FB_MB_WRITE_HREG, server_port, 9U);
  set_u16(b, ZPLC_COMM_MB_WRITE_HREG_VALUE_OFFSET, 0xBEEFU);
  b[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_WRITE_HREG, b, 3000));
  assert(DONE(b) == 1U && status_of(b) == ZPLC_COMM_OK);
  assert(zplc_loopback_modbus_register(server, 9U) == 0xBEEFU);
  free(b);
}

static void test_coils_are_read_and_written(void) {
  uint8_t *r = block(ZPLC_COMM_FB_MB_READ_COIL);
  uint8_t *w = block(ZPLC_COMM_FB_MB_WRITE_COIL);

  printf("test_coils_are_read_and_written...\n");
  zplc_loopback_modbus_set_coil(server, 3U, true);
  modbus_request(r, ZPLC_COMM_FB_MB_READ_COIL, server_port, 3U);
  r[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_COIL, r, 3000));
  assert(DONE(r) == 1U && r[ZPLC_COMM_MB_READ_COIL_VALUE_OFFSET] == 1U);

  modbus_request(w, ZPLC_COMM_FB_MB_WRITE_COIL, server_port, 4U);
  w[ZPLC_COMM_MB_WRITE_COIL_VALUE_OFFSET] = 1U;
  w[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_WRITE_COIL, w, 3000));
  assert(DONE(w) == 1U && zplc_loopback_modbus_coil(server, 4U));
  free(r);
  free(w);
}

static void test_a_server_that_does_not_answer_is_a_timeout_and_the_scan_does_not_wait(void) {
  uint8_t *b = block(ZPLC_COMM_FB_MB_READ_HREG);
  int64_t started;
  int64_t took;

  printf("test_a_server_that_does_not_answer_is_a_timeout_and_the_scan_does_not_wait...\n");
  zplc_loopback_modbus_set_mode(server, ZPLC_LOOPBACK_MODBUS_SILENT);
  modbus_request(b, ZPLC_COMM_FB_MB_READ_HREG, server_port, 1U);
  b[0] = 1U;
  longest_scan_ms = 0;
  started = now_ms();
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, b, 5000));
  took = now_ms() - started;
  assert(ERROR_OF(b) == 1U && DONE(b) == 0U && status_of(b) == ZPLC_COMM_TIMEOUT);
  assert(took >= 250 && took < 3000); /* the configured 300 ms, once */
  assert(longest_scan_ms < 50);       /* COM-003: no call of the block waited for the network */
  zplc_loopback_modbus_set_mode(server, ZPLC_LOOPBACK_MODBUS_GOOD);
  free(b);
}

static void test_a_slow_server_does_not_hold_the_scan(void) {
  uint8_t *b = block(ZPLC_COMM_FB_MB_READ_HREG);
  int scans = 0;

  printf("test_a_slow_server_does_not_hold_the_scan...\n");
  zplc_loopback_modbus_set_register(server, 7U, 0x0707U);
  zplc_loopback_modbus_set_mode(server, ZPLC_LOOPBACK_MODBUS_SLOW);
  zplc_loopback_modbus_set_delay_ms(server, 150U);
  modbus_request(b, ZPLC_COMM_FB_MB_READ_HREG, server_port, 7U);
  b[0] = 1U;
  longest_scan_ms = 0;
  scan(ZPLC_COMM_FB_MB_READ_HREG, b);
  scans++;
  assert(BUSY(b) == 1U);
  while (BUSY(b) != 0U && scans < 5000) {
    sleep_ms(1);
    scan(ZPLC_COMM_FB_MB_READ_HREG, b);
    scans++;
  }
  assert(DONE(b) == 1U && get_u16(b, ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET) == 0x0707U);
  assert(scans > 20);            /* the program went on scanning while the answer was awaited */
  assert(longest_scan_ms < 50);
  zplc_loopback_modbus_set_mode(server, ZPLC_LOOPBACK_MODBUS_GOOD);
  free(b);
}

static void test_an_exception_a_refusal_and_a_closed_connection_have_their_status(void) {
  uint8_t *b = block(ZPLC_COMM_FB_MB_READ_HREG);
  zplc_loopback_modbus_t *gone;
  uint16_t gone_port = 0U;

  printf("test_an_exception_a_refusal_and_a_closed_connection_have_their_status...\n");
  /* an address the server does not have: exception 2 */
  modbus_request(b, ZPLC_COMM_FB_MB_READ_HREG, server_port, 5000U);
  b[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, b, 3000));
  assert(ERROR_OF(b) == 1U && status_of(b) == ZPLC_COMM_PROTO_ERROR);

  /* the server is busy: exception 6 */
  zplc_loopback_modbus_set_mode(server, ZPLC_LOOPBACK_MODBUS_EXCEPTION);
  b[0] = 0U;
  scan(ZPLC_COMM_FB_MB_READ_HREG, b);
  modbus_request(b, ZPLC_COMM_FB_MB_READ_HREG, server_port, 1U);
  b[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, b, 3000));
  assert(ERROR_OF(b) == 1U && status_of(b) == ZPLC_COMM_PROTO_ERROR);

  /* the connection is closed before the answer */
  zplc_loopback_modbus_set_mode(server, ZPLC_LOOPBACK_MODBUS_CLOSE);
  b[0] = 0U;
  scan(ZPLC_COMM_FB_MB_READ_HREG, b);
  b[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, b, 3000));
  assert(ERROR_OF(b) == 1U && status_of(b) == ZPLC_COMM_NOT_CONNECTED);
  zplc_loopback_modbus_set_mode(server, ZPLC_LOOPBACK_MODBUS_GOOD);

  /* nobody listens on the port */
  gone = zplc_loopback_modbus_start(0U, &gone_port);
  assert(gone != NULL);
  zplc_loopback_modbus_stop(gone);
  b[0] = 0U;
  scan(ZPLC_COMM_FB_MB_READ_HREG, b);
  modbus_request(b, ZPLC_COMM_FB_MB_READ_HREG, gone_port, 1U);
  b[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, b, 3000));
  assert(ERROR_OF(b) == 1U && status_of(b) == ZPLC_COMM_NOT_CONNECTED);
  free(b);
}

static void test_a_reset_while_busy_lets_go_and_the_late_answer_is_not_delivered(void) {
  uint8_t *b = block(ZPLC_COMM_FB_MB_READ_HREG);

  printf("test_a_reset_while_busy_lets_go_and_the_late_answer_is_not_delivered...\n");
  zplc_loopback_modbus_set_register(server, 11U, 0x1111U);
  zplc_loopback_modbus_set_register(server, 12U, 0x2222U);
  zplc_loopback_modbus_set_mode(server, ZPLC_LOOPBACK_MODBUS_SLOW);
  zplc_loopback_modbus_set_delay_ms(server, 300U);
  modbus_request(b, ZPLC_COMM_FB_MB_READ_HREG, server_port, 11U);
  b[0] = 1U;
  scan(ZPLC_COMM_FB_MB_READ_HREG, b);
  assert(BUSY(b) == 1U);
  sleep_ms(30);
  reset(ZPLC_COMM_FB_MB_READ_HREG, b);
  assert(BUSY(b) == 0U && DONE(b) == 0U && ERROR_OF(b) == 0U && b[0] == 0U);

  /* a new request, to another register, while the first answer is still on its way */
  zplc_loopback_modbus_set_mode(server, ZPLC_LOOPBACK_MODBUS_GOOD);
  modbus_request(b, ZPLC_COMM_FB_MB_READ_HREG, server_port, 12U);
  b[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, b, 3000));
  assert(DONE(b) == 1U && get_u16(b, ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET) == 0x2222U);
  sleep_ms(450);
  scan(ZPLC_COMM_FB_MB_READ_HREG, b);
  assert(get_u16(b, ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET) == 0x2222U);
  free(b);
}

static void test_what_a_simulation_does_not_have_is_not_available(void) {
  uint8_t *rtu = block(ZPLC_COMM_FB_MB_READ_HREG);
  uint8_t *dps = block(ZPLC_COMM_FB_AZURE_DPS_PROV);
  uint8_t *bad = block(ZPLC_COMM_FB_MB_READ_HREG);

  printf("test_what_a_simulation_does_not_have_is_not_available...\n");
  /* RTU: no serial device */
  modbus_request(rtu, ZPLC_COMM_FB_MB_READ_HREG, 0U, 1U);
  rtu[8] = 0U;
  rtu[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, rtu, 3000));
  assert(ERROR_OF(rtu) == 1U && status_of(rtu) == ZPLC_COMM_UNAVAILABLE);

  /* a cloud service: nothing to talk to */
  dps[0] = 1U;
  assert(settle(ZPLC_COMM_FB_AZURE_DPS_PROV, dps, 3000));
  assert(ERROR_OF(dps) == 1U && status_of(dps) == ZPLC_COMM_UNAVAILABLE);

  /* a request that cannot be made: no host */
  modbus_request(bad, ZPLC_COMM_FB_MB_READ_HREG, server_port, 1U);
  set_text(bad, ZPLC_COMM_FB_MB_READ_HREG, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET, "");
  bad[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, bad, 3000));
  assert(ERROR_OF(bad) == 1U && status_of(bad) == ZPLC_COMM_INVALID_ADDR);
  free(rtu);
  free(dps);
  free(bad);
}

/* --- the MQTT blocks -------------------------------------------------------------------------------------------- */

static zplc_loopback_mqtt_t *broker;
static uint16_t broker_port;

static bool connect_is_done(const uint8_t *m) { return DONE(m) == 1U; }
static bool connect_is_error(const uint8_t *m) { return ERROR_OF(m) == 1U; }
static bool message_is_new(const uint8_t *m) { return m[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] == 1U; }

static void test_mqtt_without_a_broker_is_not_available(void) {
  uint8_t *pub = block(ZPLC_COMM_FB_MQTT_PUBLISH);
  uint8_t *con = block(ZPLC_COMM_FB_MQTT_CONNECT);

  printf("test_mqtt_without_a_broker_is_not_available...\n");
  set_text(pub, ZPLC_COMM_FB_MQTT_PUBLISH, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "plant/a");
  pub[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MQTT_PUBLISH, pub, 3000));
  assert(ERROR_OF(pub) == 1U && status_of(pub) == ZPLC_COMM_UNAVAILABLE);
  con[0] = 1U;
  scan(ZPLC_COMM_FB_MQTT_CONNECT, con);
  assert(ERROR_OF(con) == 1U && status_of(con) == ZPLC_COMM_UNAVAILABLE);
  free(pub);
  free(con);
}

static void start_broker_and_client(void) {
  zplc_host_mqtt_config_t config;

  broker = zplc_loopback_mqtt_start(0U, &broker_port);
  assert(broker != NULL);
  memset(&config, 0, sizeof(config));
  config.host = "127.0.0.1";
  config.port = broker_port;
  config.client_id = "zplc-test";
  config.keepalive_s = 2U;
  config.connect_timeout_ms = 1000U;
  config.reconnect_initial_ms = 100U;
  config.reconnect_max_ms = 200U;
  assert(zplc_host_mqtt_start(&config) == 0);
}

static void test_the_session_is_reported_and_a_message_is_published_once(void) {
  uint8_t *con = block(ZPLC_COMM_FB_MQTT_CONNECT);
  uint8_t *pub = block(ZPLC_COMM_FB_MQTT_PUBLISH);
  char topic[128];
  uint8_t payload[128];
  size_t length = 0U;
  uint8_t qos = 9U;
  bool retain = true;
  int i;

  printf("test_the_session_is_reported_and_a_message_is_published_once...\n");
  con[0] = 1U;
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_done, 4000));
  assert(con[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] == 1U && status_of(con) == ZPLC_COMM_OK);
  assert(zplc_loopback_mqtt_clients(broker) == 1U);

  set_text(pub, ZPLC_COMM_FB_MQTT_PUBLISH, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "plant/a");
  set_text(pub, ZPLC_COMM_FB_MQTT_PUBLISH, ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET, "hello");
  pub[ZPLC_COMM_MQTT_PUBLISH_QOS_OFFSET] = 1U;
  pub[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MQTT_PUBLISH, pub, 3000));
  assert(DONE(pub) == 1U && status_of(pub) == ZPLC_COMM_OK);
  for (i = 0; i < 100 && zplc_loopback_mqtt_publishes(broker) == 0U; i++) {
    sleep_ms(5);
  }
  assert(zplc_loopback_mqtt_publishes(broker) == 1U);
  assert(zplc_loopback_mqtt_last_publish(broker, topic, sizeof(topic), payload, sizeof(payload), &length, &qos,
                                         &retain));
  assert(strcmp(topic, "plant/a") == 0 && length == 5U && memcmp(payload, "hello", 5U) == 0);
  assert(qos == 1U && !retain);

  /* EN held: still the one message */
  for (i = 0; i < 30; i++) {
    scan(ZPLC_COMM_FB_MQTT_PUBLISH, pub);
    sleep_ms(2);
  }
  assert(zplc_loopback_mqtt_publishes(broker) == 1U);
  free(con);
  free(pub);
}

static void test_a_subscription_delivers_a_message_for_one_scan(void) {
  uint8_t *sub = block(ZPLC_COMM_FB_MQTT_SUBSCRIBE);
  const uint8_t go[] = {'g', 'o'};

  printf("test_a_subscription_delivers_a_message_for_one_scan...\n");
  set_text(sub, ZPLC_COMM_FB_MQTT_SUBSCRIBE, ZPLC_COMM_MQTT_SUBSCRIBE_TOPIC_OFFSET, "plant/+/cmd");
  sub[0] = 1U;
  assert(until(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub, connect_is_done, 4000));
  assert(zplc_loopback_mqtt_subscriptions(broker) >= 1U);

  zplc_loopback_mqtt_inject(broker, "plant/x/cmd", go, sizeof(go));
  assert(until(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub, message_is_new, 3000));
  assert(get_u16(sub, ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET) == 2U);
  assert(memcmp(&sub[ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET + 4U], "go", 2U) == 0);
  scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub);
  assert(sub[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] == 0U); /* VALID is one scan */
  assert(get_u16(sub, ZPLC_COMM_MQTT_SUBSCRIBE_PAYLOAD_OFFSET) == 2U); /* PAYLOAD keeps the last message */

  /* another topic: nothing */
  zplc_loopback_mqtt_inject(broker, "plant/x/other", go, sizeof(go));
  sleep_ms(100);
  scan(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub);
  assert(sub[ZPLC_COMM_MQTT_SUBSCRIBE_VALID_OFFSET] == 0U);
  free(sub);
}

static void test_a_lost_session_is_an_error_and_the_client_reconnects_and_resubscribes(void) {
  uint8_t *con = block(ZPLC_COMM_FB_MQTT_CONNECT);
  uint8_t *sub = block(ZPLC_COMM_FB_MQTT_SUBSCRIBE);
  const uint8_t again[] = {'a', 'g', 'a', 'i', 'n'};

  printf("test_a_lost_session_is_an_error_and_the_client_reconnects_and_resubscribes...\n");
  con[0] = 1U;
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_done, 4000));
  set_text(sub, ZPLC_COMM_FB_MQTT_SUBSCRIBE, ZPLC_COMM_MQTT_SUBSCRIBE_TOPIC_OFFSET, "plant/+/cmd");
  sub[0] = 1U;
  assert(until(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub, connect_is_done, 4000));

  zplc_loopback_mqtt_drop_clients(broker);
  /* the next scans see the loss: an error with a status, not a hang */
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_error, 3000));
  assert(status_of(con) == ZPLC_COMM_NOT_CONNECTED);
  /* and then the session is back, with the subscription made again */
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_done, 5000));
  assert(until(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub, connect_is_done, 5000));
  zplc_loopback_mqtt_inject(broker, "plant/y/cmd", again, sizeof(again));
  assert(until(ZPLC_COMM_FB_MQTT_SUBSCRIBE, sub, message_is_new, 3000));
  free(con);
  free(sub);
}

static void test_a_publish_while_the_session_is_down_fails_and_is_not_replayed(void) {
  uint8_t *con = block(ZPLC_COMM_FB_MQTT_CONNECT);
  uint8_t *pub = block(ZPLC_COMM_FB_MQTT_PUBLISH);
  const uint32_t before = zplc_loopback_mqtt_publishes(broker);
  uint32_t seen;
  int i;

  printf("test_a_publish_while_the_session_is_down_fails_and_is_not_replayed...\n");
  con[0] = 1U;
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_done, 4000));

  /* the broker goes away for good: the session is lost and cannot come back */
  zplc_loopback_mqtt_stop(broker);
  broker = NULL;
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_error, 5000));
  assert(status_of(con) == ZPLC_COMM_NOT_CONNECTED || status_of(con) == ZPLC_COMM_TIMEOUT);

  set_text(pub, ZPLC_COMM_FB_MQTT_PUBLISH, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "plant/late");
  pub[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MQTT_PUBLISH, pub, 3000));
  assert(ERROR_OF(pub) == 1U && DONE(pub) == 0U && status_of(pub) == ZPLC_COMM_NOT_CONNECTED);

  /* the broker is back on the same port: the failed message is not sent on the new session */
  {
    uint16_t port = broker_port;

    broker = zplc_loopback_mqtt_start(port, &port);
    assert(broker != NULL);
  }
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_done, 8000));
  for (i = 0; i < 100; i++) {
    sleep_ms(5);
  }
  seen = zplc_loopback_mqtt_publishes(broker);
  assert(seen == 0U);
  (void)before;
  free(con);
  free(pub);
}

static void test_a_silent_loss_is_noticed_within_the_keep_alive_interval(void) {
  uint8_t *con = block(ZPLC_COMM_FB_MQTT_CONNECT);
  int64_t started;

  printf("test_a_silent_loss_is_noticed_within_the_keep_alive_interval...\n");
  con[0] = 1U;
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_done, 4000));
  zplc_loopback_mqtt_set_silent(broker, true);
  started = now_ms();
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_error, 6000));
  assert(now_ms() - started < 3500); /* keep-alive of 2 s, and a margin */
  assert(status_of(con) == ZPLC_COMM_TIMEOUT);
  zplc_loopback_mqtt_set_silent(broker, false);
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_done, 8000));
  free(con);
}

int main(void) {
  uint16_t port = 0U;

  zplc_host_modbus_set_timeout_ms(300U);
  assert(zplc_host_comm_register() == 0);

  server = zplc_loopback_modbus_start(0U, &port);
  assert(server != NULL);
  server_port = port;

  test_a_holding_register_is_read_and_a_held_enable_is_one_request();
  test_a_holding_register_is_written();
  test_coils_are_read_and_written();
  test_a_server_that_does_not_answer_is_a_timeout_and_the_scan_does_not_wait();
  test_a_slow_server_does_not_hold_the_scan();
  test_an_exception_a_refusal_and_a_closed_connection_have_their_status();
  test_a_reset_while_busy_lets_go_and_the_late_answer_is_not_delivered();
  test_what_a_simulation_does_not_have_is_not_available();

  test_mqtt_without_a_broker_is_not_available();
  start_broker_and_client();
  test_the_session_is_reported_and_a_message_is_published_once();
  test_a_subscription_delivers_a_message_for_one_scan();
  test_a_lost_session_is_an_error_and_the_client_reconnects_and_resubscribes();
  test_a_publish_while_the_session_is_down_fails_and_is_not_replayed();
  test_a_silent_loss_is_noticed_within_the_keep_alive_interval();

  zplc_loopback_modbus_stop(server);
  zplc_loopback_mqtt_stop(broker);
  printf("test_host_comm: all passed\n");
  return 0;
}
