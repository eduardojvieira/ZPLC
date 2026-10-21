/**
 * @file test_host_loopback.c
 * @brief The loopback endpoints that a Studio session starts for its runtime (COM-009).
 *
 * The runtime of a session started with ZPLC_NATIVE_COMM=1 and ZPLC_NATIVE_LOOPBACK=1 (the environment Studio gives
 * it) starts a Modbus TCP server and an MQTT broker of its own on 127.0.0.1, in its own process, so they end with
 * the session. This test runs that start from the environment, as main() does, and shows what a program meets:
 * every Modbus TCP request reaches the simulated server whatever address the program names, the MQTT blocks work
 * against the broker without a broker address, and the blocks of a cloud service answer "unavailable in
 * simulation". With an argument "busy" it shows the other side: when an endpoint cannot start, no block reports
 * success, every one of the twelve answers "unavailable", and the state says so.
 *
 * Evidence about the simulation against protocol doubles; not about a real device, broker or cloud service.
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

static uint32_t status_of(const uint8_t *memory) {
  return (uint32_t)memory[4] | ((uint32_t)memory[5] << 8) | ((uint32_t)memory[6] << 16) | ((uint32_t)memory[7] << 24);
}

#define BUSY(m) ((m)[1])
#define DONE(m) ((m)[2])
#define ERROR_OF(m) ((m)[3])

static void set_u16(uint8_t *memory, unsigned offset, uint16_t value) {
  memory[offset] = (uint8_t)value;
  memory[offset + 1U] = (uint8_t)(value >> 8);
}

static uint16_t get_u16(const uint8_t *memory, unsigned offset) { return (uint16_t)(memory[offset] | (memory[offset + 1U] << 8)); }

static void set_text(uint8_t *memory, zplc_comm_fb_kind_t kind, unsigned offset, const char *text) {
  assert(zplc_fb_string_set(memory, zplc_comm_fb_size((uint32_t)kind), (uint16_t)offset, STRING_ROOM, (const uint8_t *)text,
                            strlen(text)) == strlen(text));
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

/* --- Modbus helpers ---*/
/* A TCP request of the blocks of kind `kind`, to `port`: EN is not set. */
static void modbus_request(uint8_t *memory, zplc_comm_fb_kind_t kind, uint16_t port, uint16_t address) {
  memory[8] = 1U;          /* PROTO: TCP */
  set_u16(memory, 9U, 1U); /* SLAVE_ID */
  set_u16(memory, 11U, address);
  set_u16(memory, 13U, 1U); /* COUNT */
  set_text(memory, kind, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET, "127.0.0.1");
  set_u16(memory, ZPLC_COMM_MB_READ_HREG_PORT_OFFSET, port);
}

static void modbus_to_somewhere_else(uint8_t *memory, zplc_comm_fb_kind_t kind, uint16_t address) {
  modbus_request(memory, kind, 502U, address);
  set_text(memory, kind, ZPLC_COMM_MB_READ_HREG_HOST_OFFSET, "plc.factory.example");
}

static bool connect_is_done(const uint8_t *m) { return DONE(m) == 1U; }

static void test_the_endpoints_run_and_a_program_reaches_them(void) {
  zplc_host_endpoints_t endpoints;
  uint8_t *w = block(ZPLC_COMM_FB_MB_WRITE_HREG);
  uint8_t *r = block(ZPLC_COMM_FB_MB_READ_HREG);
  uint8_t *con = block(ZPLC_COMM_FB_MQTT_CONNECT);
  uint8_t *pub = block(ZPLC_COMM_FB_MQTT_PUBLISH);
  uint8_t *dps = block(ZPLC_COMM_FB_AZURE_DPS_PROV);
  char topic[128];
  uint8_t payload[64];
  size_t length = 0U;
  uint8_t qos = 0U;
  bool retain = false;

  printf("test_the_endpoints_run_and_a_program_reaches_them...\n");
  zplc_host_comm_endpoints(&endpoints);
  assert(endpoints.state == ZPLC_HOST_ENDPOINTS_RUNNING && endpoints.modbus_port != 0U && endpoints.mqtt_port != 0U);

  /* a program written for a plant address: the simulation answers it from its own server */
  modbus_to_somewhere_else(w, ZPLC_COMM_FB_MB_WRITE_HREG, 8U);
  set_u16(w, ZPLC_COMM_MB_WRITE_HREG_VALUE_OFFSET, 0xCAFEU);
  w[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_WRITE_HREG, w, 3000));
  assert(DONE(w) == 1U && status_of(w) == ZPLC_COMM_OK);
  assert(zplc_loopback_modbus_register(zplc_host_comm_loopback_modbus(), 8U) == 0xCAFEU);
  modbus_to_somewhere_else(r, ZPLC_COMM_FB_MB_READ_HREG, 8U);
  r[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MB_READ_HREG, r, 3000));
  assert(DONE(r) == 1U && get_u16(r, ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET) == 0xCAFEU);

  /* MQTT: no broker address anywhere in the program */
  con[0] = 1U;
  assert(until(ZPLC_COMM_FB_MQTT_CONNECT, con, connect_is_done, 6000));
  set_text(pub, ZPLC_COMM_FB_MQTT_PUBLISH, ZPLC_COMM_MQTT_PUBLISH_TOPIC_OFFSET, "sim/out");
  set_text(pub, ZPLC_COMM_FB_MQTT_PUBLISH, ZPLC_COMM_MQTT_PUBLISH_PAYLOAD_OFFSET, "ping");
  pub[0] = 1U;
  assert(settle(ZPLC_COMM_FB_MQTT_PUBLISH, pub, 6000));
  assert(DONE(pub) == 1U && status_of(pub) == ZPLC_COMM_OK);
  assert(zplc_loopback_mqtt_last_publish(zplc_host_comm_loopback_mqtt(), topic, sizeof(topic), payload, sizeof(payload), &length, &qos,
                                         &retain));
  assert(strcmp(topic, "sim/out") == 0 && length == 4U && memcmp(payload, "ping", 4U) == 0);

  /* a cloud service is not simulated: a status of its own, never success */
  dps[0] = 1U;
  assert(settle(ZPLC_COMM_FB_AZURE_DPS_PROV, dps, 3000));
  assert(ERROR_OF(dps) == 1U && DONE(dps) == 0U && status_of(dps) == ZPLC_COMM_UNAVAILABLE);
  free(w);
  free(r);
  free(con);
  free(pub);
  free(dps);
}

static void test_an_endpoint_that_cannot_start_leaves_every_block_unavailable(void) {
  static const zplc_comm_fb_kind_t all[] = {
      ZPLC_COMM_FB_MB_READ_HREG,   ZPLC_COMM_FB_MB_WRITE_HREG, ZPLC_COMM_FB_MB_READ_COIL,   ZPLC_COMM_FB_MB_WRITE_COIL,
      ZPLC_COMM_FB_MQTT_CONNECT,   ZPLC_COMM_FB_MQTT_PUBLISH,  ZPLC_COMM_FB_MQTT_SUBSCRIBE, ZPLC_COMM_FB_AZURE_C2D_RECV,
      ZPLC_COMM_FB_AZURE_DPS_PROV, ZPLC_COMM_FB_AZURE_EG_PUB,  ZPLC_COMM_FB_AWS_FLEET_PROV, ZPLC_COMM_FB_SPB_REBIRTH,
  };
  zplc_host_endpoints_t endpoints;
  uint16_t taken = 0U;
  zplc_loopback_modbus_t *squatter = zplc_loopback_modbus_start(0U, &taken);
  size_t i;

  printf("test_an_endpoint_that_cannot_start_leaves_every_block_unavailable...\n");
  assert(squatter != NULL);
  assert(zplc_host_comm_start_loopback(taken, 0U) != 0);
  zplc_host_comm_endpoints(&endpoints);
  assert(endpoints.state == ZPLC_HOST_ENDPOINTS_FAILED);
  for (i = 0U; i < sizeof(all) / sizeof(all[0]); i++) {
    uint8_t *b = block(all[i]);

    if (all[i] == ZPLC_COMM_FB_MB_READ_HREG || all[i] == ZPLC_COMM_FB_MB_WRITE_HREG || all[i] == ZPLC_COMM_FB_MB_READ_COIL ||
        all[i] == ZPLC_COMM_FB_MB_WRITE_COIL) {
      modbus_request(b, all[i], taken, 1U);
    }
    b[0] = 1U;
    assert(settle(all[i], b, 3000));
    assert(ERROR_OF(b) == 1U && DONE(b) == 0U && status_of(b) == ZPLC_COMM_UNAVAILABLE);
    free(b);
  }
  zplc_loopback_modbus_stop(squatter);
}

int main(int argc, char **argv) {
  if (argc > 1 && strcmp(argv[1], "busy") == 0) {
    test_an_endpoint_that_cannot_start_leaves_every_block_unavailable();
  } else {
    assert(setenv("ZPLC_NATIVE_COMM", "1", 1) == 0);
    assert(setenv("ZPLC_NATIVE_LOOPBACK", "1", 1) == 0);
    assert(zplc_host_comm_init_from_environment() == 0);
    test_the_endpoints_run_and_a_program_reaches_them();
  }
  printf("test_host_loopback: all passed\n");
  return 0;
}
