/**
 * @file test_proto_session.c
 * @brief The device side of the device link protocol: sessions, authenticated frames, atomic writes, events,
 *        program transfer (COM-020, COM-021, COM-023, COM-024, COM-025, COM-028).
 *
 * SPDX-License-Identifier: MIT
 *
 * The engine runs over a fake port (memory, forces, run state, a program store, a key store, a clock) and over
 * the real exchange of the core for the scan-boundary tests. Frames are built and read by a small client in
 * this file that follows the rules of protocol.json, so a rule that the engine does not keep shows here as a
 * frame that was answered when it had to be dropped, or the other way round.
 */

#define _POSIX_C_SOURCE 200809L

#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <string.h>

#include <zplc_bytes.h>
#include <zplc_core.h>
#include <zplc_crc32.h>
#include <zplc_exchange.h>
#include <zplc_hal.h>
#include <zplc_proto.h>
#include <zplc_proto_dev.h>
#include <zplc_sha256.h>

#include "zplc_proto_vectors.h"

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                       \
  do {                                                                         \
    test_count++;                                                              \
    if (!(cond)) {                                                             \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                  \
      fail_count++;                                                            \
    }                                                                          \
  } while (0)

/* ------------------------------------------------------------------------------------------------------------- */
/* The fake port                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------- */

#define MEM_SIZE 0x5000U
#define FORCE_SLOTS 8U
#define PROGRAM_MAX 4096U

typedef struct {
  uint16_t address;
  uint16_t size;
  uint8_t data[ZPLC_FORCE_MAX_BYTES];
  uint8_t used;
} fake_force_t;

typedef struct {
  uint32_t now;
  uint8_t memory[MEM_SIZE];
  fake_force_t forces[FORCE_SLOTS];
  uint8_t state;
  uint8_t fault;
  uint8_t program_loaded;
  uint32_t cycles;
  uint32_t generation;
  uint8_t break_hit;
  uint16_t break_pc;
  uint8_t key[32];
  uint8_t key_set;
  uint32_t random_state;
  uint8_t staged[PROGRAM_MAX];
  uint32_t staged_size;
  uint32_t staged_expected;
  uint8_t stored[PROGRAM_MAX];
  uint32_t stored_size;
  uint16_t breakpoints[8];
  size_t breakpoint_count;
  /* calls the engine made, to show that a refused request reached nothing */
  unsigned calls_mem_write;
  unsigned calls_force_set;
  unsigned calls_run;
  unsigned calls_stop;
  unsigned calls_program_begin;
  unsigned calls_program_chunk;
  unsigned calls_config;
  unsigned calls_cred;
  unsigned calls_key;
  unsigned program_aborts;
  int refuse_program_commit;
  int corrupt_readback;
  /* credential upload */
  uint8_t cred_kind;
  uint16_t cred_bytes;
  /* exchange binding */
  int use_exchange;
  char config_key[32];
} fake_t;

static fake_t fake;

static uint32_t port_now(void *c) { (void)c; return fake.now; }

static int port_random(void *c, uint8_t *out, size_t n) {
  size_t i;

  (void)c;
  for (i = 0U; i < n; i++) {
    fake.random_state ^= fake.random_state << 13;
    fake.random_state ^= fake.random_state >> 17;
    fake.random_state ^= fake.random_state << 5;
    out[i] = (uint8_t)(fake.random_state >> 11);
  }
  return 0;
}

static int port_key_load(void *c, uint8_t key[32]) {
  (void)c;
  if (!fake.key_set) {
    return 1;
  }
  memcpy(key, fake.key, 32U);
  return 0;
}

static int port_key_store(void *c, const uint8_t key[32]) {
  (void)c;
  fake.calls_key++;
  memcpy(fake.key, key, 32U);
  fake.key_set = 1;
  return 0;
}

static int port_key_erase(void *c) {
  (void)c;
  fake.calls_key++;
  memset(fake.key, 0, 32U);
  fake.key_set = 0;
  return 0;
}

static unsigned forces_in_use(void) {
  unsigned n = 0U;
  unsigned i;

  for (i = 0U; i < FORCE_SLOTS; i++) {
    n += fake.forces[i].used;
  }
  return n;
}

static int port_status(void *c, zplc_proto_status_t *s) {
  (void)c;
  memset(s, 0, sizeof(*s));
  s->state = fake.state;
  s->fault = fake.fault;
  s->program_loaded = fake.program_loaded;
  s->forces = (uint8_t)forces_in_use();
  s->cycles = fake.cycles;
  s->program_size = fake.stored_size;
  s->program_generation = fake.generation;
  s->uptime_ms = fake.now;
  s->break_hit = fake.break_hit;
  s->break_pc = fake.break_pc;
  return 0;
}

static int port_identity(void *c, zplc_proto_identity_t *id) {
  (void)c;
  id->abi_major = 1U;
  id->abi_minor = 0U;
  id->draft_counter = 4U;
  id->io_hash = 0xA1B2C3D4U;
  id->io_input_bytes = 8U;
  id->io_output_bytes = 4U;
  id->io_channels = 12U;
  id->code_size_max = ZPLC_MEM_CODE_SIZE;
  id->work_size = ZPLC_MEM_WORK_SIZE;
  id->retain_size = ZPLC_MEM_RETAIN_SIZE;
  id->ipi_size = ZPLC_MEM_IPI_SIZE;
  id->opi_size = ZPLC_MEM_OPI_SIZE;
  id->product_version = "2.0.0-test";
  id->board = "fake_board";
  id->board_profile = "fake/profile";
  id->io_board_id = "fake-io";
  return 0;
}

static int port_mem_read(void *c, uint16_t address, uint8_t *out, uint16_t length) {
  (void)c;
  if (fake.use_exchange) {
    return zplc_exchange_read(address, out, length) == 0 ? 0 : ZPLC_PROTO_ERR_RANGE;
  }
  memcpy(out, fake.memory + address, length);
  return 0;
}

static int port_mem_write(void *c, uint16_t address, const uint8_t *data, uint16_t length) {
  (void)c;
  fake.calls_mem_write++;
  if (fake.use_exchange) {
    const int r = zplc_exchange_write(address, data, length);

    return r == 0 ? 0 : (r == ZPLC_EXCHANGE_ERR_FULL ? (int)ZPLC_PROTO_ERR_FULL : (int)ZPLC_PROTO_ERR_RANGE);
  }
  memcpy(fake.memory + address, data, length);
  return 0;
}

static int port_force_set(void *c, uint16_t address, const uint8_t *data, uint16_t length) {
  unsigned i;

  (void)c;
  fake.calls_force_set++;
  for (i = 0U; i < FORCE_SLOTS; i++) {
    if (fake.forces[i].used && fake.forces[i].address == address) {
      break;
    }
  }
  if (i == FORCE_SLOTS) {
    for (i = 0U; i < FORCE_SLOTS && fake.forces[i].used; i++) {
    }
  }
  if (i == FORCE_SLOTS) {
    return (int)ZPLC_PROTO_ERR_FULL;
  }
  fake.forces[i].used = 1U;
  fake.forces[i].address = address;
  fake.forces[i].size = length;
  memcpy(fake.forces[i].data, data, length);
  return 0;
}

static int port_force_clear(void *c, uint16_t address) {
  unsigned i;

  (void)c;
  for (i = 0U; i < FORCE_SLOTS; i++) {
    if (fake.forces[i].used && fake.forces[i].address == address) {
      fake.forces[i].used = 0U;
      return 0;
    }
  }
  return (int)ZPLC_PROTO_ERR_RANGE;
}

static int port_force_clear_all(void *c) {
  (void)c;
  memset(fake.forces, 0, sizeof(fake.forces));
  return 0;
}

static int port_force_get(void *c, uint8_t index, uint16_t *address, uint16_t *size, uint8_t *data) {
  unsigned i;
  unsigned seen = 0U;

  (void)c;
  for (i = 0U; i < FORCE_SLOTS; i++) {
    if (fake.forces[i].used) {
      if (seen == index) {
        *address = fake.forces[i].address;
        *size = fake.forces[i].size;
        memcpy(data, fake.forces[i].data, fake.forces[i].size);
        return 0;
      }
      seen++;
    }
  }
  return 1;
}

static int port_run(void *c) {
  (void)c;
  fake.calls_run++;
  if (!fake.program_loaded) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  fake.state = ZPLC_PROTO_RUN_STATE_RUNNING;
  return 0;
}

static int port_stop(void *c) {
  (void)c;
  fake.calls_stop++;
  fake.state = ZPLC_PROTO_RUN_STATE_STOPPED;
  return 0;
}

static int port_bp_add(void *c, uint16_t pc) {
  (void)c;
  if (fake.breakpoint_count >= 8U) {
    return (int)ZPLC_PROTO_ERR_FULL;
  }
  fake.breakpoints[fake.breakpoint_count++] = pc;
  return 0;
}

static int port_bp_remove(void *c, uint16_t pc) {
  size_t i;

  (void)c;
  for (i = 0U; i < fake.breakpoint_count; i++) {
    if (fake.breakpoints[i] == pc) {
      fake.breakpoints[i] = fake.breakpoints[--fake.breakpoint_count];
      return 0;
    }
  }
  return (int)ZPLC_PROTO_ERR_RANGE;
}

static int port_bp_clear(void *c) {
  (void)c;
  fake.breakpoint_count = 0U;
  return 0;
}

static int port_bp_list(void *c, uint16_t *pcs, size_t capacity, size_t *count) {
  size_t i;

  (void)c;
  for (i = 0U; i < fake.breakpoint_count && i < capacity; i++) {
    pcs[i] = fake.breakpoints[i];
  }
  *count = fake.breakpoint_count;
  return 0;
}

static int port_program_begin(void *c, uint32_t size) {
  (void)c;
  fake.calls_program_begin++;
  if (fake.state != ZPLC_PROTO_RUN_STATE_STOPPED) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  if (size > PROGRAM_MAX) {
    return (int)ZPLC_PROTO_ERR_TOO_LARGE;
  }
  fake.staged_size = 0U;
  fake.staged_expected = size;
  return 0;
}

static int port_program_chunk(void *c, uint32_t offset, const uint8_t *data, uint16_t length) {
  (void)c;
  fake.calls_program_chunk++;
  memcpy(fake.staged + offset, data, length);
  fake.staged_size = offset + length;
  return 0;
}

static int port_program_commit(void *c, zplc_proto_program_info_t *info) {
  (void)c;
  if (fake.refuse_program_commit) {
    return (int)ZPLC_PROTO_ERR_PROGRAM_INVALID;
  }
  memcpy(fake.stored, fake.staged, fake.staged_size);
  fake.stored_size = fake.staged_size;
  fake.generation++;
  fake.program_loaded = 1U;
  info->loaded = 1U;
  info->size = fake.stored_size;
  info->crc32 = zplc_crc32(fake.stored, fake.stored_size) ^ (fake.corrupt_readback ? 1U : 0U);
  info->generation = fake.generation;
  return 0;
}

static void port_program_abort(void *c) {
  (void)c;
  fake.program_aborts++;
  fake.staged_size = 0U;
}

static int port_program_info(void *c, zplc_proto_program_info_t *info) {
  (void)c;
  info->loaded = fake.program_loaded;
  info->size = fake.stored_size;
  info->crc32 = zplc_crc32(fake.stored, fake.stored_size);
  info->generation = fake.generation;
  return 0;
}

static int port_config_set(void *c, const char *key, const uint8_t *value, uint16_t length) {
  (void)c;
  (void)value;
  (void)length;
  fake.calls_config++;
  strncpy(fake.config_key, key, sizeof(fake.config_key) - 1U);
  return 0;
}

static int port_config_save(void *c) { (void)c; fake.calls_config++; return 0; }
static int port_config_reset(void *c) { (void)c; fake.calls_config++; return 0; }

static int port_cred_begin(void *c, uint8_t kind, uint16_t size) {
  (void)c;
  fake.calls_cred++;
  fake.cred_kind = kind;
  fake.cred_bytes = 0U;
  (void)size;
  return 0;
}

static int port_cred_chunk(void *c, const uint8_t *data, uint16_t length) {
  (void)c;
  (void)data;
  fake.calls_cred++;
  fake.cred_bytes = (uint16_t)(fake.cred_bytes + length);
  return 0;
}

static int port_cred_commit(void *c) { (void)c; fake.calls_cred++; return 0; }
static int port_cred_erase(void *c, uint8_t kind) { (void)c; (void)kind; fake.calls_cred++; return 0; }
static void port_cred_abort(void *c) { (void)c; }

static zplc_proto_ops_t full_ops(void) {
  zplc_proto_ops_t ops;

  memset(&ops, 0, sizeof(ops));
  ops.now_ms = port_now;
  ops.random = port_random;
  ops.key_load = port_key_load;
  ops.key_store = port_key_store;
  ops.key_erase = port_key_erase;
  ops.status = port_status;
  ops.identity = port_identity;
  ops.mem_read = port_mem_read;
  ops.mem_write = port_mem_write;
  ops.force_set = port_force_set;
  ops.force_clear = port_force_clear;
  ops.force_clear_all = port_force_clear_all;
  ops.force_get = port_force_get;
  ops.run = port_run;
  ops.stop = port_stop;
  ops.bp_add = port_bp_add;
  ops.bp_remove = port_bp_remove;
  ops.bp_clear = port_bp_clear;
  ops.bp_list = port_bp_list;
  ops.program_begin = port_program_begin;
  ops.program_chunk = port_program_chunk;
  ops.program_commit = port_program_commit;
  ops.program_abort = port_program_abort;
  ops.program_info = port_program_info;
  ops.config_set = port_config_set;
  ops.config_save = port_config_save;
  ops.config_reset = port_config_reset;
  ops.cred_begin = port_cred_begin;
  ops.cred_chunk = port_cred_chunk;
  ops.cred_commit = port_cred_commit;
  ops.cred_erase = port_cred_erase;
  ops.cred_abort = port_cred_abort;
  return ops;
}

/* ------------------------------------------------------------------------------------------------------------- */
/* The client: one link, its output, and frames built by the rules of the definition                             */
/* ------------------------------------------------------------------------------------------------------------- */

#define MAX_FRAMES 64U

typedef struct {
  uint8_t kind;
  uint8_t message;
  uint32_t sequence;
  uint8_t auth;
  uint8_t mac_ok; /* the code verified under the session key the client holds */
  uint8_t payload[ZPLC_PROTO_PAYLOAD_MAX];
  size_t length;
} seen_t;

typedef struct {
  zplc_proto_link_t link;
  seen_t seen[MAX_FRAMES];
  size_t seen_count;
  uint8_t session_key[32]; /* what the client derived; all zero when none */
  int has_session_key;
  uint32_t next_sequence;
  uint8_t all_output[16384];
  size_t all_output_len;
  uint8_t last_sent[ZPLC_PROTO_FRAME_MAX];
  size_t last_sent_len;
} client_t;

static zplc_proto_dev_t dev;
static zplc_proto_ops_t ops;

static int client_write(void *context, const uint8_t *frame, size_t length) {
  client_t *c = (client_t *)context;
  zplc_proto_frame_t f;

  if (c->all_output_len + length <= sizeof(c->all_output)) {
    memcpy(c->all_output + c->all_output_len, frame, length);
    c->all_output_len += length;
  }
  if (zplc_proto_parse(frame, length, ZPLC_PROTO_PAYLOAD_MAX, &f) == 0 && c->seen_count < MAX_FRAMES) {
    seen_t *s = &c->seen[c->seen_count++];

    s->kind = f.kind;
    s->message = f.message;
    s->sequence = f.sequence;
    s->auth = f.authenticated;
    s->length = f.length;
    memcpy(s->payload, f.payload, f.length);
    s->mac_ok = 0U;
    if (f.authenticated && c->has_session_key) {
      uint8_t mac[32];

      zplc_hmac_sha256(c->session_key, 32U, f.covered, f.covered_length, mac);
      s->mac_ok = (uint8_t)zplc_ct_equal(mac, f.mac, 32U);
    }
  }
  return 0;
}

static void client_init(client_t *c, uint8_t transport) {
  memset(c, 0, sizeof(*c));
  zplc_proto_link_init(&c->link, &dev, transport, client_write, c);
  c->next_sequence = 1U;
}

static void client_forget(client_t *c) {
  c->seen_count = 0U;
}

/* Build and deliver a request; `key` signs it (NULL: no code). Returns the sequence number used. */
static uint32_t send_with(client_t *c, uint8_t message, const uint8_t *payload, size_t length, const uint8_t *key,
                          uint32_t sequence) {
  uint8_t frame[ZPLC_PROTO_FRAME_MAX];
  size_t used = zplc_proto_begin(frame, sizeof(frame), ZPLC_PROTO_KIND_REQUEST, message, sequence, payload,
                                 (uint16_t)length, key != NULL);
  size_t total;

  if (key != NULL) {
    uint8_t mac[32];

    zplc_hmac_sha256(key, 32U, frame, used, mac);
    total = zplc_proto_finish(frame, used, mac);
  } else {
    total = zplc_proto_finish(frame, used, NULL);
  }
  memcpy(c->last_sent, frame, total);
  c->last_sent_len = total;
  zplc_proto_link_feed(&c->link, frame, total);
  return sequence;
}

static uint32_t send_plain(client_t *c, uint8_t message, const uint8_t *payload, size_t length) {
  return send_with(c, message, payload, length, NULL, c->next_sequence++);
}

/* In a session with a key: the next sequence number, signed with the session key. */
static uint32_t send_session(client_t *c, uint8_t message, const uint8_t *payload, size_t length) {
  return send_with(c, message, payload, length, c->has_session_key ? c->session_key : NULL, c->next_sequence++);
}

static const seen_t *last_seen(const client_t *c) {
  return c->seen_count == 0U ? NULL : &c->seen[c->seen_count - 1U];
}

static int last_status(const client_t *c) {
  const seen_t *s = last_seen(c);

  return (s == NULL || s->kind != ZPLC_PROTO_KIND_RESPONSE || s->length == 0U) ? -1 : (int)s->payload[0];
}

/* The response to the last request: status, or -1 when there was none (the frame was dropped). */
static int ask(client_t *c, uint8_t message, const uint8_t *payload, size_t length) {
  client_forget(c);
  (void)send_session(c, message, payload, length);
  return last_status(c);
}

static void open_serial_session(client_t *c, uint8_t flags) {
  uint8_t payload[ZPLC_PROTO_SESSION_OPEN_REQ_FIXED];

  memset(payload, 0, sizeof(payload));
  payload[ZPLC_PROTO_SESSION_OPEN_REQ_FLAGS_OFF] = flags;
  memcpy(payload + ZPLC_PROTO_SESSION_OPEN_REQ_NAME_OFF, "test", 4U);
  client_forget(c);
  (void)send_plain(c, ZPLC_PROTO_MSG_SESSION_OPEN, payload, sizeof(payload));
}

static const uint8_t TEST_KEY[32] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                                     17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32};

/* Network session: challenge, open under the device key, derive the session key as the definition says. */
static int open_network_session(client_t *c, const uint8_t *device_key, int tamper_nonce) {
  uint8_t challenge[ZPLC_PROTO_NONCE_BYTES];
  uint8_t client_nonce[ZPLC_PROTO_NONCE_BYTES];
  uint8_t payload[ZPLC_PROTO_SESSION_OPEN_REQ_FIXED];
  zplc_hmac_sha256_t h;
  size_t i;

  client_forget(c);
  (void)send_plain(c, ZPLC_PROTO_MSG_CHALLENGE, NULL, 0U);
  if (last_status(c) != 0) {
    return last_status(c);
  }
  memcpy(challenge, last_seen(c)->payload + 1U, sizeof(challenge));
  for (i = 0U; i < sizeof(client_nonce); i++) {
    client_nonce[i] = (uint8_t)(0xC0U + i);
  }
  if (tamper_nonce) {
    challenge[0] ^= 0xFFU;
  }
  memset(payload, 0, sizeof(payload));
  memcpy(payload + ZPLC_PROTO_SESSION_OPEN_REQ_CLIENT_NONCE_OFF, client_nonce, sizeof(client_nonce));
  memcpy(payload + ZPLC_PROTO_SESSION_OPEN_REQ_DEVICE_NONCE_OFF, challenge, sizeof(challenge));
  memcpy(payload + ZPLC_PROTO_SESSION_OPEN_REQ_NAME_OFF, "studio", 6U);
  zplc_hmac_sha256_init(&h, device_key, 32U);
  zplc_hmac_sha256_update(&h, (const uint8_t *)"ZPLC-LINK-SK1", 13U);
  zplc_hmac_sha256_update(&h, challenge, sizeof(challenge));
  zplc_hmac_sha256_update(&h, client_nonce, sizeof(client_nonce));
  zplc_hmac_sha256_final(&h, c->session_key);
  c->has_session_key = 0; /* the response is signed under the new key: set it before we send */
  c->has_session_key = 1;
  client_forget(c);
  c->next_sequence = 100U;
  (void)send_with(c, ZPLC_PROTO_MSG_SESSION_OPEN, payload, sizeof(payload), device_key, c->next_sequence++);
  return last_status(c);
}

static void reset_world(zplc_proto_ops_t *the_ops) {
  memset(&fake, 0, sizeof(fake));
  fake.random_state = 0x2545F491U;
  fake.now = 1000U;
  fake.program_loaded = 1U;
  *the_ops = full_ops();
  CHECK(zplc_proto_dev_init(&dev, the_ops, 30U) == 0, "the engine starts over a port");
}

static uint32_t u32_at(const uint8_t *p) { return zplc_get_u32_le(p); }

/* ------------------------------------------------------------------------------------------------------------- */
/* Tests                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------- */

static void test_open_messages_and_the_shape_of_a_response(void) {
  client_t c;
  const uint8_t hello[3] = {1U, 0x00U, 0x02U}; /* version 1, max payload 512 */
  const seen_t *s;

  reset_world(&ops);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  client_forget(&c);
  (void)send_plain(&c, ZPLC_PROTO_MSG_HELLO, hello, sizeof(hello));
  s = last_seen(&c);
  CHECK(s != NULL && s->kind == ZPLC_PROTO_KIND_RESPONSE && s->message == ZPLC_PROTO_MSG_HELLO && s->sequence == 1U,
        "a hello is answered with a response of its message and its sequence");
  CHECK(s != NULL && s->payload[0] == ZPLC_PROTO_ERR_OK && s->length == ZPLC_PROTO_HELLO_RSP_FIXED,
        "and its fields");
  CHECK(s != NULL && s->payload[ZPLC_PROTO_HELLO_RSP_VERSION_OFF] == ZPLC_PROTO_VERSION &&
            s->payload[ZPLC_PROTO_HELLO_RSP_TRANSPORT_OFF] == ZPLC_PROTO_TRANSPORT_SERIAL,
        "the version and the kind of link");
  CHECK(s != NULL && (u32_at(s->payload + ZPLC_PROTO_HELLO_RSP_CAPABILITIES_OFF) & ZPLC_PROTO_CAP_SESSION) != 0U &&
            (u32_at(s->payload + ZPLC_PROTO_HELLO_RSP_CAPABILITIES_OFF) & ZPLC_PROTO_CAP_AUTH) != 0U &&
            (u32_at(s->payload + ZPLC_PROTO_HELLO_RSP_CAPABILITIES_OFF) & ZPLC_PROTO_CAP_SIGNATURE) == 0U,
        "the capabilities are the ones the port has");

  client_forget(&c);
  (void)send_plain(&c, ZPLC_PROTO_MSG_IDENTITY, NULL, 0U);
  s = last_seen(&c);
  CHECK(s != NULL && s->payload[0] == 0U && memcmp(s->payload + ZPLC_PROTO_IDENTITY_RSP_BOARD_OFF, "fake_board", 10U) == 0,
        "the identity names the board");
  CHECK(s != NULL && u32_at(s->payload + ZPLC_PROTO_IDENTITY_RSP_IO_HASH_OFF) == 0xA1B2C3D4U,
        "and the hash of its I/O description");

  client_forget(&c);
  (void)send_plain(&c, 0x7EU, NULL, 0U);
  CHECK(last_status(&c) == ZPLC_PROTO_ERR_UNKNOWN_MESSAGE, "a message number the device does not know");
  client_forget(&c);
  (void)send_plain(&c, ZPLC_PROTO_MSG_MEM_READ, hello, 1U);
  CHECK(last_status(&c) == ZPLC_PROTO_ERR_BAD_REQUEST, "a payload that is not the layout of the message");
}

static void test_the_access_table_is_the_same_as_the_adapters(void) {
  client_t c;
  size_t i;
  unsigned wrong = 0U;

  reset_world(&ops);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  open_serial_session(&c, 0U);
  CHECK(last_status(&c) == 0, "a session is open");
  for (i = 0U; i < ZPLC_PROTO_ACCESS_CASE_COUNT; i++) {
    const zplc_proto_access_case_t *a = &zplc_proto_access_cases[i];
    uint8_t request[4U + 8U];
    uint8_t big[2U + ZPLC_FORCE_MAX_BYTES];
    const seen_t *s;
    int status;

    client_forget(&c);
    if (a->kind == 0U) {
      zplc_put_u16_le(request, a->address);
      zplc_put_u16_le(request + 2U, a->length);
      (void)send_plain(&c, ZPLC_PROTO_MSG_MEM_READ, request, 4U);
    } else {
      /* a write or a force of a.length bytes; a length of 0 cannot be built as a frame with a tail of none */
      memset(big, 0xA5, sizeof(big));
      zplc_put_u16_le(big, a->address);
      (void)send_plain(&c, a->kind == 1U ? ZPLC_PROTO_MSG_MEM_WRITE : ZPLC_PROTO_MSG_FORCE_SET, big,
                       2U + (size_t)a->length);
    }
    s = last_seen(&c);
    status = last_status(&c);
    if (a->ok) {
      /* the address rule accepts it; a read longer than one frame is a limit of the transport, TOO_LARGE */
      if (status != ZPLC_PROTO_ERR_OK && !(a->kind == 0U && status == ZPLC_PROTO_ERR_TOO_LARGE)) {
        fprintf(stderr, "  case '%s': expected OK, got %d\n", a->name, status);
        wrong++;
      }
    } else {
      if (status != ZPLC_PROTO_ERR_RANGE || s->length != 1U + ZPLC_PROTO_RANGE_DETAIL_BYTES ||
          zplc_get_u16_le(s->payload + 1U) != a->address || zplc_get_u16_le(s->payload + 3U) != a->length ||
          zplc_get_u16_le(s->payload + 5U) != a->start || zplc_get_u16_le(s->payload + 7U) != a->end) {
        fprintf(stderr, "  case '%s': expected RANGE with the region, got %d\n", a->name, status);
        wrong++;
      }
    }
    (void)port_force_clear_all(NULL);
  }
  CHECK(wrong == 0U, "every access case of the definition is accepted or refused as the adapters have it");
}

static void test_state_changing_messages_need_a_session(void) {
  client_t c;
  const uint8_t addr_data[3] = {0x00U, 0x20U, 0xAAU};
  const uint8_t begin[8] = {16U, 0U, 0U, 0U, 0U, 0U, 0U, 0U};
  const uint8_t config[ZPLC_PROTO_CONFIG_SET_REQ_FIXED + 1U] = {'a'};
  const uint8_t cred[3] = {0U, 4U, 0U};
  const uint8_t key[32] = {0};
  struct {
    uint8_t message;
    const uint8_t *payload;
    size_t length;
    const char *name;
  } cases[] = {
      {ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U, "a memory write"},
      {ZPLC_PROTO_MSG_FORCE_SET, addr_data, 3U, "a force"},
      {ZPLC_PROTO_MSG_FORCE_CLEAR, addr_data, 2U, "a force clear"},
      {ZPLC_PROTO_MSG_FORCE_CLEAR_ALL, NULL, 0U, "a clear of every force"},
      {ZPLC_PROTO_MSG_RUN, NULL, 0U, "RUN"},
      {ZPLC_PROTO_MSG_STOP, NULL, 0U, "STOP"},
      {ZPLC_PROTO_MSG_PAUSE, NULL, 0U, "PAUSE"},
      {ZPLC_PROTO_MSG_RESUME, NULL, 0U, "RESUME"},
      {ZPLC_PROTO_MSG_STEP, NULL, 0U, "STEP"},
      {ZPLC_PROTO_MSG_RESET, NULL, 0U, "RESET"},
      {ZPLC_PROTO_MSG_BP_ADD, addr_data, 2U, "a breakpoint"},
      {ZPLC_PROTO_MSG_PROGRAM_BEGIN, begin, 8U, "the start of a download"},
      {ZPLC_PROTO_MSG_PROGRAM_CHUNK, begin, 5U, "a chunk of a download"},
      {ZPLC_PROTO_MSG_PROGRAM_COMMIT, NULL, 0U, "the end of a download"},
      {ZPLC_PROTO_MSG_CONFIG_SET, config, sizeof(config), "a configuration change"},
      {ZPLC_PROTO_MSG_CONFIG_SAVE, NULL, 0U, "a configuration save"},
      {ZPLC_PROTO_MSG_CRED_BEGIN, cred, 3U, "the start of a credential upload"},
      {ZPLC_PROTO_MSG_CRED_ERASE, cred, 1U, "a credential erase"},
      {ZPLC_PROTO_MSG_KEY_SET, key, 32U, "a key"},
  };
  size_t i;

  reset_world(&ops);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  for (i = 0U; i < sizeof(cases) / sizeof(cases[0]); i++) {
    client_forget(&c);
    (void)send_plain(&c, cases[i].message, cases[i].payload, cases[i].length);
    CHECK(last_status(&c) == ZPLC_PROTO_ERR_NO_SESSION, cases[i].name);
  }
  CHECK(fake.calls_mem_write == 0U && fake.calls_force_set == 0U && fake.calls_run == 0U && fake.calls_stop == 0U &&
            fake.calls_program_begin == 0U && fake.calls_config == 0U && fake.calls_cred == 0U && fake.calls_key == 0U &&
            fake.breakpoint_count == 0U,
        "and none of them reached the port");

  /* the reads of a serial link need no session */
  client_forget(&c);
  (void)send_plain(&c, ZPLC_PROTO_MSG_STATUS, NULL, 0U);
  CHECK(last_status(&c) == ZPLC_PROTO_ERR_OK, "a read of the runtime on the serial link needs no session");

  /* with a session the same requests reach the port */
  open_serial_session(&c, 0U);
  CHECK(last_status(&c) == ZPLC_PROTO_ERR_OK, "a session opens");
  CHECK(ask(&c, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U) == ZPLC_PROTO_ERR_OK && fake.calls_mem_write == 1U,
        "a write in a session reaches the port");
  CHECK(ask(&c, ZPLC_PROTO_MSG_RUN, NULL, 0U) == ZPLC_PROTO_ERR_OK && fake.calls_run == 1U &&
            fake.state == ZPLC_PROTO_RUN_STATE_RUNNING,
        "RUN in a session");
  CHECK(ask(&c, ZPLC_PROTO_MSG_STOP, NULL, 0U) == ZPLC_PROTO_ERR_OK && fake.state == ZPLC_PROTO_RUN_STATE_STOPPED,
        "STOP in a session");
}

static void test_one_session_at_a_time_and_how_it_ends(void) {
  client_t a;
  client_t b;
  const uint8_t addr_data[3] = {0x00U, 0x20U, 0xAAU};
  zplc_proto_link_t *links[2];

  reset_world(&ops);
  client_init(&a, ZPLC_PROTO_TRANSPORT_SERIAL);
  client_init(&b, ZPLC_PROTO_TRANSPORT_SERIAL);
  links[0] = &a.link;
  links[1] = &b.link;

  open_serial_session(&a, 0U);
  CHECK(last_status(&a) == 0, "the first link opens a session");
  open_serial_session(&b, 0U);
  CHECK(last_status(&b) == ZPLC_PROTO_ERR_SESSION_BUSY, "a second one is refused while it is open");
  CHECK(ask(&b, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U) == ZPLC_PROTO_ERR_NO_SESSION,
        "and the second link cannot write");
  {
    client_t n;
    uint8_t p[ZPLC_PROTO_SESSION_OPEN_REQ_FIXED];

    memset(p, 0, sizeof(p));
    p[0] = 1U;
    client_init(&n, ZPLC_PROTO_TRANSPORT_NETWORK);
    client_forget(&n);
    (void)send_plain(&n, ZPLC_PROTO_MSG_SESSION_OPEN, p, sizeof(p));
    CHECK(last_status(&n) == ZPLC_PROTO_ERR_AUTH_REQUIRED, "a network link cannot open a session without a code");
  }

  /* forces set by the session end with it: through a takeover by a person at the serial link */
  CHECK(ask(&a, ZPLC_PROTO_MSG_FORCE_SET, addr_data, 3U) == ZPLC_PROTO_ERR_OK && forces_in_use() == 1U,
        "the session sets a force");
  open_serial_session(&b, 1U);
  CHECK(last_status(&b) == ZPLC_PROTO_ERR_OK, "a takeover from the serial link opens a session");
  CHECK(forces_in_use() == 0U, "the forces of the session that was taken over are released");
  {
    int found = 0;
    size_t i;

    for (i = 0U; i < a.seen_count; i++) {
      found |= a.seen[i].kind == ZPLC_PROTO_KIND_EVENT && a.seen[i].message == ZPLC_PROTO_EVT_SESSION_END &&
               a.seen[i].payload[0] == ZPLC_PROTO_SESSION_END_TAKEN_OVER && a.seen[i].payload[1] == 1U;
    }
    CHECK(found, "the link that was taken over is told why, and how many forces went with it");
  }
  CHECK(ask(&a, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U) == ZPLC_PROTO_ERR_NO_SESSION,
        "the first link has no session any more");

  /* a force of the new session ends when it is closed */
  CHECK(ask(&b, ZPLC_PROTO_MSG_FORCE_SET, addr_data, 3U) == ZPLC_PROTO_ERR_OK && forces_in_use() == 1U,
        "the new session sets a force");
  CHECK(ask(&b, ZPLC_PROTO_MSG_SESSION_CLOSE, NULL, 0U) == ZPLC_PROTO_ERR_OK, "it is closed");
  CHECK(forces_in_use() == 0U && !zplc_proto_session_is_open(&dev), "its force was released with it");

  /* idle timeout */
  open_serial_session(&a, 0U);
  CHECK(ask(&a, ZPLC_PROTO_MSG_FORCE_SET, addr_data, 3U) == ZPLC_PROTO_ERR_OK && forces_in_use() == 1U,
        "a session sets a force and goes quiet");
  fake.now += 29000U;
  zplc_proto_dev_service(&dev, links, 2U);
  CHECK(zplc_proto_session_is_open(&dev) && forces_in_use() == 1U, "29 seconds of silence do not end it");
  CHECK(ask(&a, ZPLC_PROTO_MSG_KEEPALIVE, NULL, 0U) == ZPLC_PROTO_ERR_OK, "a keepalive is answered");
  fake.now += 29000U;
  zplc_proto_dev_service(&dev, links, 2U);
  CHECK(zplc_proto_session_is_open(&dev), "and it restarted the time");
  fake.now += 2000U;
  zplc_proto_dev_service(&dev, links, 2U);
  CHECK(!zplc_proto_session_is_open(&dev), "31 seconds of silence end it");
  CHECK(forces_in_use() == 0U, "and the force is released: the outputs follow the program");
  CHECK(ask(&a, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U) == ZPLC_PROTO_ERR_NO_SESSION, "a write now is refused");

  /* the link is lost */
  open_serial_session(&a, 0U);
  CHECK(ask(&a, ZPLC_PROTO_MSG_FORCE_SET, addr_data, 3U) == ZPLC_PROTO_ERR_OK && forces_in_use() == 1U,
        "a session sets a force");
  zplc_proto_link_lost(&a.link);
  CHECK(!zplc_proto_session_is_open(&dev) && forces_in_use() == 0U,
        "a link that is lost ends its session and releases its forces");

  /* a force that the shell set, outside a session, is not the session's to release */
  CHECK(port_force_set(NULL, 0x2010U, addr_data, 3U) == 0, "a force outside a session");
  open_serial_session(&a, 0U);
  CHECK(ask(&a, ZPLC_PROTO_MSG_SESSION_CLOSE, NULL, 0U) == 0 && forces_in_use() == 1U,
        "stays when a session that did not set it ends");
}

static void test_a_download_is_a_session_transaction(void) {
  client_t c;
  uint8_t program[300];
  uint8_t begin[8];
  uint8_t chunk[4U + 200U];
  const uint32_t crc_value = 0U;
  size_t i;
  const seen_t *s;

  reset_world(&ops);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  for (i = 0U; i < sizeof(program); i++) {
    program[i] = (uint8_t)(i * 13U + 5U);
  }
  (void)crc_value;
  open_serial_session(&c, 0U);
  CHECK(last_status(&c) == 0, "session");

  zplc_put_u32_le(begin, sizeof(program));
  zplc_put_u32_le(begin + 4U, zplc_crc32(program, sizeof(program)));
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_BEGIN, begin, 8U) == 0, "the transfer starts");
  s = last_seen(&c);
  CHECK(s != NULL && zplc_get_u16_le(s->payload + 1U) == ZPLC_PROTO_PAYLOAD_MAX - 4U,
        "and says how large a chunk may be");

  zplc_put_u32_le(chunk, 100U);
  memcpy(chunk + 4U, program + 100U, 100U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_CHUNK, chunk, 104U) == ZPLC_PROTO_ERR_BAD_REQUEST,
        "a chunk out of order is refused");
  zplc_put_u32_le(chunk, 0U);
  memcpy(chunk + 4U, program, 200U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_CHUNK, chunk, 204U) == 0 && u32_at(last_seen(&c)->payload + 1U) == 200U,
        "the first chunk");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_COMMIT, NULL, 0U) == ZPLC_PROTO_ERR_STATE,
        "a commit before the last byte is refused");
  zplc_put_u32_le(chunk, 200U);
  memcpy(chunk + 4U, program + 200U, 100U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_CHUNK, chunk, 104U) == 0, "the last chunk");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_COMMIT, NULL, 0U) == 0, "the commit");
  s = last_seen(&c);
  CHECK(s != NULL && u32_at(s->payload + 1U) == sizeof(program) &&
            u32_at(s->payload + 5U) == zplc_crc32(program, sizeof(program)) && u32_at(s->payload + 9U) == 1U,
        "reports the size, the CRC-32 read back and the generation");
  CHECK(memcmp(fake.stored, program, sizeof(program)) == 0 && fake.state == ZPLC_PROTO_RUN_STATE_STOPPED,
        "the program is stored and the runtime is stopped: RUN is another request");

  /* a wrong CRC is refused and nothing is stored */
  fake.stored_size = 0U;
  zplc_put_u32_le(begin + 4U, 0x12345678U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_BEGIN, begin, 8U) == 0, "a second transfer");
  zplc_put_u32_le(chunk, 0U);
  memcpy(chunk + 4U, program, 200U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_CHUNK, chunk, 204U) == 0, "its first chunk");
  zplc_put_u32_le(chunk, 200U);
  memcpy(chunk + 4U, program + 200U, 100U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_CHUNK, chunk, 104U) == 0, "its last chunk");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_COMMIT, NULL, 0U) == ZPLC_PROTO_ERR_CRC && fake.stored_size == 0U,
        "a CRC-32 that is not the announced one is refused, with nothing stored");

  /* the device read back something else than what was sent */
  zplc_put_u32_le(begin + 4U, zplc_crc32(program, sizeof(program)));
  fake.corrupt_readback = 1;
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_BEGIN, begin, 8U) == 0, "a third transfer");
  zplc_put_u32_le(chunk, 0U);
  memcpy(chunk + 4U, program, 200U);
  (void)ask(&c, ZPLC_PROTO_MSG_PROGRAM_CHUNK, chunk, 204U);
  zplc_put_u32_le(chunk, 200U);
  memcpy(chunk + 4U, program + 200U, 100U);
  (void)ask(&c, ZPLC_PROTO_MSG_PROGRAM_CHUNK, chunk, 104U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_COMMIT, NULL, 0U) == ZPLC_PROTO_ERR_FAILED,
        "a read-back that is not the announced CRC-32 is a failure the client sees");
  fake.corrupt_readback = 0;

  /* a program the loader refuses */
  fake.refuse_program_commit = 1;
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_BEGIN, begin, 8U) == 0, "a fourth transfer");
  zplc_put_u32_le(chunk, 0U);
  memcpy(chunk + 4U, program, 200U);
  (void)ask(&c, ZPLC_PROTO_MSG_PROGRAM_CHUNK, chunk, 204U);
  zplc_put_u32_le(chunk, 200U);
  memcpy(chunk + 4U, program + 200U, 100U);
  (void)ask(&c, ZPLC_PROTO_MSG_PROGRAM_CHUNK, chunk, 104U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_COMMIT, NULL, 0U) == ZPLC_PROTO_ERR_PROGRAM_INVALID,
        "the loader refusing the artifact is PROGRAM_INVALID");
  fake.refuse_program_commit = 0;

  /* not while running; too large; aborted with the session */
  fake.state = ZPLC_PROTO_RUN_STATE_RUNNING;
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_BEGIN, begin, 8U) == ZPLC_PROTO_ERR_STATE, "a download needs the runtime stopped");
  fake.state = ZPLC_PROTO_RUN_STATE_STOPPED;
  zplc_put_u32_le(begin, ZPLC_MEM_CODE_SIZE + 1U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_BEGIN, begin, 8U) == ZPLC_PROTO_ERR_TOO_LARGE,
        "a program larger than the device accepts");
  zplc_put_u32_le(begin, 300U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PROGRAM_BEGIN, begin, 8U) == 0, "a transfer is started");
  {
    const unsigned aborts = fake.program_aborts;

    CHECK(ask(&c, ZPLC_PROTO_MSG_SESSION_CLOSE, NULL, 0U) == 0 && fake.program_aborts == aborts + 1U,
          "and dropped when the session ends");
  }
}

static void test_configuration_and_credentials_follow_the_session_rule(void) {
  client_t c;
  uint8_t config[ZPLC_PROTO_CONFIG_SET_REQ_FIXED + 4U];
  const uint8_t cred_begin[3] = {1U, 4U, 0U};
  const uint8_t cred_data[4] = {1U, 2U, 3U, 4U};

  reset_world(&ops);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  memset(config, 0, sizeof(config));
  memcpy(config, "wifi_ssid", 9U);
  memcpy(config + ZPLC_PROTO_CONFIG_SET_REQ_FIXED, "lab!", 4U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_CONFIG_SET, config, sizeof(config)) == ZPLC_PROTO_ERR_NO_SESSION &&
            ask(&c, ZPLC_PROTO_MSG_CRED_BEGIN, cred_begin, 3U) == ZPLC_PROTO_ERR_NO_SESSION &&
            fake.calls_config == 0U && fake.calls_cred == 0U,
        "without a session neither reaches the port");
  open_serial_session(&c, 0U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_CONFIG_SET, config, sizeof(config)) == 0 && strcmp(fake.config_key, "wifi_ssid") == 0,
        "a configuration change in a session");
  CHECK(ask(&c, ZPLC_PROTO_MSG_CONFIG_SAVE, NULL, 0U) == 0, "and its save");
  CHECK(ask(&c, ZPLC_PROTO_MSG_CRED_CHUNK, cred_data, 4U) == ZPLC_PROTO_ERR_STATE, "a chunk before the start");
  CHECK(ask(&c, ZPLC_PROTO_MSG_CRED_BEGIN, cred_begin, 3U) == 0 && ask(&c, ZPLC_PROTO_MSG_CRED_CHUNK, cred_data, 4U) == 0 &&
            ask(&c, ZPLC_PROTO_MSG_CRED_COMMIT, NULL, 0U) == 0 && fake.cred_bytes == 4U,
        "a credential upload in a session");

  /* a port without them says so */
  {
    zplc_proto_ops_t small = full_ops();

    small.config_set = NULL;
    small.cred_begin = NULL;
    CHECK(zplc_proto_dev_init(&dev, &small, 30U) == 0, "a port without configuration and credentials");
    client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
    open_serial_session(&c, 0U);
    CHECK(ask(&c, ZPLC_PROTO_MSG_CONFIG_SET, config, sizeof(config)) == ZPLC_PROTO_ERR_UNSUPPORTED,
          "the configuration change is unsupported");
    client_forget(&c);
    (void)send_plain(&c, ZPLC_PROTO_MSG_HELLO, (const uint8_t[3]){1U, 0U, 2U}, 3U);
    CHECK((u32_at(last_seen(&c)->payload + ZPLC_PROTO_HELLO_RSP_CAPABILITIES_OFF) &
           (ZPLC_PROTO_CAP_CONFIG | ZPLC_PROTO_CAP_CREDENTIALS)) == 0U,
          "and the hello does not offer it");
  }
}

/* The scan-boundary proof: writes land at the input latch, whole. */
static int scan_flag;
static int scan_active_hook(void) { return scan_flag; }

static void test_a_multi_byte_write_lands_whole_at_the_latch(void) {
  client_t c;
  zplc_exchange_hooks_t hooks;
  uint8_t request[2U + 4U];
  uint8_t back[4];
  const uint16_t var = ZPLC_MEM_WORK_BASE + 0x40U;
  uint8_t *live;

  reset_world(&ops);
  fake.use_exchange = 1;
  CHECK(zplc_core_init() == 0, "core init");
  zplc_core_cold_start();
  memset(&hooks, 0, sizeof(hooks));
  hooks.scan_active = scan_active_hook;
  scan_flag = 1;
  CHECK(zplc_exchange_init(&hooks) == 0, "the exchange");
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  open_serial_session(&c, 0U);
  live = zplc_mem_get_region(ZPLC_MEM_WORK_BASE) + 0x40U;
  memset(live, 0, 4U);

  zplc_put_u16_le(request, var);
  request[2] = 0x78U;
  request[3] = 0x56U;
  request[4] = 0x34U;
  request[5] = 0x12U;
  CHECK(ask(&c, ZPLC_PROTO_MSG_MEM_WRITE, request, sizeof(request)) == 0, "the write is accepted while scans run");
  CHECK(live[0] == 0U && live[1] == 0U && live[2] == 0U && live[3] == 0U,
        "and nothing of it is in the live memory yet: no byte lands in the middle of a scan");
  CHECK(zplc_exchange_latch() == 1U, "the input latch of the next scan applies it");
  CHECK(live[0] == 0x78U && live[1] == 0x56U && live[2] == 0x34U && live[3] == 0x12U, "whole");
  zplc_exchange_publish();
  zplc_put_u16_le(request, var);
  request[2] = 4U;
  request[3] = 0U;
  client_forget(&c);
  (void)send_plain(&c, ZPLC_PROTO_MSG_MEM_READ, request, 4U);
  memcpy(back, last_seen(&c)->payload + 1U, 4U);
  CHECK(back[0] == 0x78U && back[3] == 0x12U, "and a read returns the published snapshot");
  scan_flag = 0;
}

/* A scanner and a client that writes alternating values: the scanner never sees a mix. */
#define SCANS 20000U
static volatile int run_scanner;
static unsigned torn_atomic;
static unsigned torn_bytewise;
static unsigned scans_done;
static volatile int use_bytewise;

static void *scanner(void *arg) {
  uint8_t *live = (uint8_t *)arg;
  unsigned n;

  for (n = 0U; n < SCANS && run_scanner; n++) {
    uint8_t b0;
    uint8_t b1;
    uint8_t b2;
    uint8_t b3;

    (void)zplc_exchange_latch();
    /* a program reads the value one byte at a time, the way an instruction sequence does */
    b0 = live[0];
    sched_yield();
    b1 = live[1];
    sched_yield();
    b2 = live[2];
    b3 = live[3];
    zplc_exchange_publish();
    if (!(b0 == b1 && b1 == b2 && b2 == b3)) {
      if (use_bytewise) {
        torn_bytewise++;
      } else {
        torn_atomic++;
      }
    }
    scans_done++;
  }
  run_scanner = 0;
  return NULL;
}

static void test_the_value_a_scan_reads_is_never_a_mix(void) {
  client_t c;
  pthread_t thread;
  uint8_t *live;
  unsigned i;

  reset_world(&ops);
  fake.use_exchange = 1;
  CHECK(zplc_core_init() == 0, "core init");
  zplc_core_cold_start();
  {
    zplc_exchange_hooks_t hooks;

    memset(&hooks, 0, sizeof(hooks));
    hooks.scan_active = scan_active_hook;
    scan_flag = 1;
    CHECK(zplc_exchange_init(&hooks) == 0, "the exchange");
  }
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  open_serial_session(&c, 0U);
  live = zplc_mem_get_region(ZPLC_MEM_WORK_BASE) + 0x80U;
  memset(live, 0x11, 4U);

  /* one write command of four bytes, alternating values */
  torn_atomic = torn_bytewise = scans_done = 0U;
  use_bytewise = 0;
  run_scanner = 1;
  (void)pthread_create(&thread, NULL, scanner, live);
  for (i = 0U; run_scanner; i++) {
    uint8_t request[2U + 4U];
    const uint8_t v = (i & 1U) != 0U ? 0x22U : 0x11U;

    zplc_put_u16_le(request, ZPLC_MEM_WORK_BASE + 0x80U);
    memset(request + 2U, v, 4U);
    client_forget(&c);
    (void)send_session(&c, ZPLC_PROTO_MSG_MEM_WRITE, request, sizeof(request));
    if (c.seen_count > 8U) {
      client_forget(&c);
    }
  }
  (void)pthread_join(thread, NULL);
  CHECK(scans_done > 100U, "the scanner ran against the writer");
  CHECK(torn_atomic == 0U, "a value written by one MEM_WRITE is never read half written by a scan");
  printf("  atomic: %u scans, %u torn\n", scans_done, torn_atomic);

  /* the same four bytes as four one-byte writes, which is what a byte-wise writer does: scans see mixes */
  torn_bytewise = scans_done = 0U;
  use_bytewise = 1;
  run_scanner = 1;
  memset(live, 0x11, 4U);
  (void)pthread_create(&thread, NULL, scanner, live);
  for (i = 0U; run_scanner; i++) {
    const uint8_t v = (i & 1U) != 0U ? 0x22U : 0x11U;
    unsigned k;

    for (k = 0U; k < 4U && run_scanner; k++) {
      uint8_t request[3];

      zplc_put_u16_le(request, (uint16_t)(ZPLC_MEM_WORK_BASE + 0x80U + k));
      request[2] = v;
      client_forget(&c);
      (void)send_session(&c, ZPLC_PROTO_MSG_MEM_WRITE, request, sizeof(request));
      sched_yield();
    }
  }
  (void)pthread_join(thread, NULL);
  CHECK(scans_done > 100U, "the scanner ran against the byte-wise writer");
  CHECK(torn_bytewise > 0U, "four one-byte writes are seen half done: the problem the single command removes");
  printf("  byte-wise: %u scans, %u torn\n", scans_done, torn_bytewise);
  scan_flag = 0;
}

static void test_serial_trust_and_key_provisioning(void) {
  client_t serial;
  client_t net;
  const uint8_t key[32] = {0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42,
                           0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x42};
  uint8_t payload[32];
  size_t i;
  int echoed = 0;

  reset_world(&ops);
  client_init(&serial, ZPLC_PROTO_TRANSPORT_SERIAL);
  client_init(&net, ZPLC_PROTO_TRANSPORT_NETWORK);

  /* a network link: HELLO is open, the rest is not */
  client_forget(&net);
  (void)send_plain(&net, ZPLC_PROTO_MSG_HELLO, (const uint8_t[3]){1U, 0U, 2U}, 3U);
  CHECK(last_status(&net) == 0 && last_seen(&net)->payload[ZPLC_PROTO_HELLO_RSP_TRANSPORT_OFF] ==
                                     ZPLC_PROTO_TRANSPORT_NETWORK,
        "a hello is answered on a network link, and says it is one");
  client_forget(&net);
  (void)send_plain(&net, ZPLC_PROTO_MSG_STATUS, NULL, 0U);
  CHECK(last_status(&net) == ZPLC_PROTO_ERR_AUTH_REQUIRED, "a read on a network link needs an authenticated session");
  CHECK(open_network_session(&net, key, 0) == ZPLC_PROTO_ERR_AUTH_FAILED || last_status(&net) == -1,
        "and a session cannot be opened while the device holds no key");

  /* the key is provisioned over the serial link, inside a session */
  memcpy(payload, key, sizeof(payload));
  CHECK(ask(&serial, ZPLC_PROTO_MSG_KEY_SET, payload, 32U) == ZPLC_PROTO_ERR_NO_SESSION, "no key without a session");
  open_serial_session(&serial, 0U);
  memcpy(payload, key, sizeof(payload));
  CHECK(ask(&serial, ZPLC_PROTO_MSG_KEY_SET, payload, 32U) == 0 && fake.key_set && memcmp(fake.key, key, 32U) == 0,
        "the key is stored");
  for (i = 0U; i + 32U <= serial.all_output_len; i++) {
    echoed |= memcmp(serial.all_output + i, key, 32U) == 0;
  }
  CHECK(!echoed, "and it is not in anything the device sent back");
  client_forget(&serial);
  (void)send_plain(&serial, ZPLC_PROTO_MSG_HELLO, (const uint8_t[3]){1U, 0U, 2U}, 3U);
  CHECK(last_seen(&serial)->payload[ZPLC_PROTO_HELLO_RSP_KEY_PROVISIONED_OFF] == 1U,
        "the hello says a key is held, and nothing more");
  CHECK(ask(&serial, ZPLC_PROTO_MSG_SESSION_CLOSE, NULL, 0U) == 0, "the serial session is closed");

  /* the key is refused over the network, whatever else is true */
  {
    client_t n2;

    client_init(&n2, ZPLC_PROTO_TRANSPORT_NETWORK);
    CHECK(open_network_session(&n2, key, 0) == 0, "a network session opens with the right key");
    memcpy(payload, TEST_KEY, 32U);
    CHECK(ask(&n2, ZPLC_PROTO_MSG_KEY_SET, payload, 32U) == ZPLC_PROTO_ERR_REFUSED,
          "and still cannot provision a key: that is the serial link's");
    CHECK(memcmp(fake.key, key, 32U) == 0, "the key is as it was");
    CHECK(ask(&n2, ZPLC_PROTO_MSG_KEY_CLEAR, NULL, 0U) == ZPLC_PROTO_ERR_REFUSED, "nor erase it");
  }
}

static void test_a_network_session_authenticates_every_frame(void) {
  client_t net;
  client_t other;
  const uint8_t addr_data[3] = {0x00U, 0x20U, 0xAAU};
  const uint8_t good_key[32] = {9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 9, 8, 7, 6, 5, 4,
                                3, 2, 1, 0, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 9, 8};
  uint8_t wrong_key[32];
  const seen_t *s;
  uint32_t drops_before;
  uint32_t seq;
  uint8_t frame[ZPLC_PROTO_FRAME_MAX];
  size_t used;
  size_t total;
  uint8_t mac[32];

  reset_world(&ops);
  memcpy(fake.key, good_key, 32U);
  fake.key_set = 1;
  client_init(&net, ZPLC_PROTO_TRANSPORT_NETWORK);
  client_init(&other, ZPLC_PROTO_TRANSPORT_NETWORK);

  /* a wrong key: the frame is dropped and counted, nothing is answered */
  memcpy(wrong_key, good_key, 32U);
  wrong_key[0] ^= 0xFFU;
  CHECK(open_network_session(&other, wrong_key, 0) == -1, "an open under a wrong key is not answered");
  CHECK(other.link.stats.auth_drops == 1U, "and is counted");
  CHECK(!zplc_proto_session_is_open(&dev), "no session was opened");

  /* the right key, the wrong challenge */
  CHECK(open_network_session(&other, good_key, 1) == ZPLC_PROTO_ERR_CHALLENGE_STALE,
        "an open over a challenge that is not the one that was issued is stale");
  CHECK(!zplc_proto_session_is_open(&dev), "no session");

  /* the open itself, replayed after it was used */
  CHECK(open_network_session(&net, good_key, 0) == 0, "the right key and challenge open a session");
  s = last_seen(&net);
  CHECK(s != NULL && s->auth == 1U && s->mac_ok == 1U && s->payload[1U + 4U + 2U] == 1U,
        "the response is authenticated under the new key");
  {
    uint8_t captured[ZPLC_PROTO_FRAME_MAX];
    size_t captured_len;
    client_t fresh;
    uint32_t before;

    /* the exact frame of the open (header, payload, code, checksum), kept as it went over the link */
    memcpy(captured, net.last_sent, net.last_sent_len);
    captured_len = net.last_sent_len;
    CHECK(ask(&net, ZPLC_PROTO_MSG_SESSION_CLOSE, NULL, 0U) == 0, "the session is closed");
    client_init(&fresh, ZPLC_PROTO_TRANSPORT_NETWORK);
    before = fresh.link.stats.replay_drops;
    zplc_proto_link_feed(&fresh.link, captured, captured_len);
    CHECK(fresh.link.stats.replay_drops == before + 1U && !zplc_proto_session_is_open(&dev),
          "the frame of an open that is sent again opens nothing, and is counted as a replay");
    CHECK(fresh.seen_count == 1U && last_status(&fresh) == ZPLC_PROTO_ERR_CHALLENGE_STALE,
          "it is told the challenge is not the current one");
  }
  CHECK(open_network_session(&net, good_key, 0) == 0, "a session opens again, with a new challenge");

  /* inside the session: good frames */
  CHECK(ask(&net, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U) == 0 && fake.calls_mem_write == 1U,
        "an authenticated write is done");
  s = last_seen(&net);
  CHECK(s != NULL && s->auth == 1U && s->mac_ok == 1U, "and answered under the session key");
  seq = net.next_sequence - 1U;

  /* a modified frame (one bit of the payload flipped, checksum repaired) */
  used = zplc_proto_begin(frame, sizeof(frame), ZPLC_PROTO_KIND_REQUEST, ZPLC_PROTO_MSG_MEM_WRITE, seq + 1U, addr_data,
                          3U, 1);
  zplc_hmac_sha256(net.session_key, 32U, frame, used, mac);
  frame[ZPLC_PROTO_HEADER_BYTES + 2U] ^= 0x01U; /* modified after it was signed */
  total = zplc_proto_finish(frame, used, mac);
  drops_before = net.link.stats.auth_drops;
  client_forget(&net);
  zplc_proto_link_feed(&net.link, frame, total);
  CHECK(net.seen_count == 0U && net.link.stats.auth_drops == drops_before + 1U && fake.calls_mem_write == 1U,
        "a modified frame is dropped, counted, not answered and not done");

  /* a replayed frame: the sequence number of one already accepted */
  used = zplc_proto_begin(frame, sizeof(frame), ZPLC_PROTO_KIND_REQUEST, ZPLC_PROTO_MSG_MEM_WRITE, seq, addr_data, 3U, 1);
  zplc_hmac_sha256(net.session_key, 32U, frame, used, mac);
  total = zplc_proto_finish(frame, used, mac);
  drops_before = net.link.stats.replay_drops;
  client_forget(&net);
  zplc_proto_link_feed(&net.link, frame, total);
  CHECK(net.seen_count == 0U && net.link.stats.replay_drops == drops_before + 1U && fake.calls_mem_write == 1U,
        "a replayed frame is dropped and counted");

  /* out of order: ahead of the next */
  used = zplc_proto_begin(frame, sizeof(frame), ZPLC_PROTO_KIND_REQUEST, ZPLC_PROTO_MSG_MEM_WRITE, seq + 5U, addr_data,
                          3U, 1);
  zplc_hmac_sha256(net.session_key, 32U, frame, used, mac);
  total = zplc_proto_finish(frame, used, mac);
  drops_before = net.link.stats.order_drops;
  client_forget(&net);
  zplc_proto_link_feed(&net.link, frame, total);
  CHECK(net.seen_count == 0U && net.link.stats.order_drops == drops_before + 1U && fake.calls_mem_write == 1U,
        "a frame that is not the next is dropped and counted");

  /* no code at all, inside a session */
  drops_before = net.link.stats.auth_drops;
  client_forget(&net);
  (void)send_with(&net, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U, NULL, seq + 1U);
  CHECK(net.seen_count == 0U && net.link.stats.auth_drops == drops_before + 1U && fake.calls_mem_write == 1U,
        "a frame without a code inside the session is dropped and counted");

  /* a code under the wrong key */
  client_forget(&net);
  (void)send_with(&net, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U, good_key, seq + 1U);
  CHECK(net.seen_count == 0U && fake.calls_mem_write == 1U, "a code under the device key is not the session key");

  /* the counters did not move the sequence: the right next frame still works */
  CHECK(ask(&net, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U) == 0 && fake.calls_mem_write == 2U,
        "the next frame in order is accepted: dropped frames did not advance the sequence");

  /* the counters are visible */
  CHECK(ask(&net, ZPLC_PROTO_MSG_LINK_STATS, NULL, 0U) == 0, "the counters can be asked for");
  s = last_seen(&net);
  CHECK(s != NULL && u32_at(s->payload + ZPLC_PROTO_LINK_STATS_RSP_AUTH_DROPS_OFF) >= 2U &&
            u32_at(s->payload + ZPLC_PROTO_LINK_STATS_RSP_REPLAY_DROPS_OFF) >= 1U &&
            u32_at(s->payload + ZPLC_PROTO_LINK_STATS_RSP_ORDER_DROPS_OFF) >= 1U,
        "and show the frames that were dropped, by reason");

  /* a second network link cannot use the session of the first */
  client_forget(&other);
  (void)send_with(&other, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U, net.session_key, 1U);
  CHECK(last_status(&other) == ZPLC_PROTO_ERR_AUTH_REQUIRED && fake.calls_mem_write == 2U,
        "another link, with the key of the session, is not the session");

  /* the session ends: the key is gone */
  CHECK(ask(&net, ZPLC_PROTO_MSG_SESSION_CLOSE, NULL, 0U) == 0, "the session is closed");
  client_forget(&net);
  (void)send_session(&net, ZPLC_PROTO_MSG_MEM_WRITE, addr_data, 3U);
  CHECK(last_status(&net) == ZPLC_PROTO_ERR_AUTH_REQUIRED, "a frame of the closed session is not a session");
}

static void test_events(void) {
  client_t c;
  zplc_proto_link_t *links[1];
  uint8_t mask[4];
  size_t i;
  unsigned statuses = 0U;
  unsigned faults = 0U;
  unsigned breakpoints = 0U;
  unsigned forces = 0U;
  unsigned logs = 0U;
  unsigned watches = 0U;
  unsigned dropped = 0U;
  uint8_t watch[2U + 3U + 3U];

  reset_world(&ops);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  links[0] = &c.link;
  zplc_put_u32_le(mask, ZPLC_PROTO_EVTMASK_STATUS | ZPLC_PROTO_EVTMASK_FAULT | ZPLC_PROTO_EVTMASK_BREAKPOINT |
                            ZPLC_PROTO_EVTMASK_FORCE | ZPLC_PROTO_EVTMASK_LOG | ZPLC_PROTO_EVTMASK_WATCH);
  CHECK(ask(&c, ZPLC_PROTO_MSG_EVENTS_SET, mask, 4U) == 0, "events are asked for");
  zplc_proto_dev_service(&dev, links, 1U); /* the first look is the baseline */
  client_forget(&c);

  fake.state = ZPLC_PROTO_RUN_STATE_RUNNING;
  fake.cycles = 5U;
  zplc_proto_dev_service(&dev, links, 1U);
  fake.fault = ZPLC_PROTO_FAULT_VM;
  fake.state = ZPLC_PROTO_RUN_STATE_FAULT;
  zplc_proto_dev_service(&dev, links, 1U);
  fake.break_hit = 1U;
  fake.break_pc = 0x0042U;
  zplc_proto_dev_service(&dev, links, 1U);
  fake.forces[0].used = 1U; /* a force set by another path (the shell) */
  fake.forces[0].address = 0x2000U;
  fake.forces[0].size = 1U;
  zplc_proto_dev_service(&dev, links, 1U);
  zplc_proto_log(&dev, ZPLC_PROTO_LOG_LEVEL_INFO, "loaded");
  zplc_proto_dev_service(&dev, links, 1U);

  for (i = 0U; i < c.seen_count; i++) {
    if (c.seen[i].kind != ZPLC_PROTO_KIND_EVENT) {
      continue;
    }
    statuses += c.seen[i].message == ZPLC_PROTO_EVT_STATUS;
    faults += c.seen[i].message == ZPLC_PROTO_EVT_FAULT;
    breakpoints += c.seen[i].message == ZPLC_PROTO_EVT_BREAKPOINT;
    forces += c.seen[i].message == ZPLC_PROTO_EVT_FORCE;
    logs += c.seen[i].message == ZPLC_PROTO_EVT_LOG;
  }
  CHECK(statuses == 2U, "a status change is pushed (running, then fault)");
  CHECK(faults == 1U, "a fault is pushed once");
  CHECK(breakpoints == 1U, "a breakpoint hit is pushed");
  CHECK(forces == 1U, "a force changed by another path is pushed");
  CHECK(logs == 1U, "a log line is pushed");

  /* event numbers go up by one on the link */
  {
    uint32_t last = 0U;
    int ordered = 1;

    for (i = 0U; i < c.seen_count; i++) {
      if (c.seen[i].kind == ZPLC_PROTO_KIND_EVENT) {
        ordered &= c.seen[i].sequence == last + 1U;
        last = c.seen[i].sequence;
      }
    }
    CHECK(ordered, "events carry the counter of the link, one by one");
  }

  /* watch batch */
  client_forget(&c);
  zplc_put_u16_le(watch, 0U);
  zplc_put_u16_le(watch + 2U, 0x2000U);
  watch[4] = 4U;
  zplc_put_u16_le(watch + 5U, 0x0010U);
  watch[7] = 2U;
  CHECK(ask(&c, ZPLC_PROTO_MSG_WATCH_SET, watch, sizeof(watch)) == 0, "watch two extents, push on change");
  fake.memory[0x2000] = 0x77U;
  fake.cycles = 9U;
  zplc_proto_dev_service(&dev, links, 1U);
  for (i = 0U; i < c.seen_count; i++) {
    watches += c.seen[i].kind == ZPLC_PROTO_KIND_EVENT && c.seen[i].message == ZPLC_PROTO_EVT_WATCH;
  }
  CHECK(watches == 1U && c.seen[c.seen_count - 1U].length == 4U + 6U && c.seen[c.seen_count - 1U].payload[4] == 0x77U,
        "a batch of the two extents, from one scan, with the values");
  client_forget(&c);
  zplc_proto_dev_service(&dev, links, 1U);
  CHECK(c.seen_count == 0U, "an unchanged value is not pushed again");

  /* the queue is bounded: a producer that outruns the pump loses events and the loss is said */
  client_forget(&c);
  for (i = 0U; i < ZPLC_PROTO_EVENT_QUEUE + 5U; i++) {
    zplc_proto_log(&dev, ZPLC_PROTO_LOG_LEVEL_INFO, "flood");
  }
  CHECK(dev.queue_count == ZPLC_PROTO_EVENT_QUEUE, "the queue holds what it holds");
  CHECK(dev.dropped_since_report == 5U, "and counts what it dropped");
  zplc_proto_dev_service(&dev, links, 1U);
  logs = 0U;
  for (i = 0U; i < c.seen_count; i++) {
    logs += c.seen[i].message == ZPLC_PROTO_EVT_LOG;
    if (c.seen[i].message == ZPLC_PROTO_EVT_DROPPED) {
      dropped += u32_at(c.seen[i].payload);
    }
  }
  CHECK(logs == ZPLC_PROTO_EVENT_QUEUE, "the events that fit were sent");
  CHECK(dropped == 0U, "the loss is reported once there is room, in the next service");
  client_forget(&c);
  zplc_proto_dev_service(&dev, links, 1U);
  for (i = 0U; i < c.seen_count; i++) {
    if (c.seen[i].message == ZPLC_PROTO_EVT_DROPPED) {
      dropped += u32_at(c.seen[i].payload);
    }
  }
  CHECK(dropped == 5U, "five events were lost, and the link is told so");

  /* a link that asked for nothing is sent nothing */
  {
    client_t quiet;
    zplc_proto_link_t *two[1];

    client_init(&quiet, ZPLC_PROTO_TRANSPORT_SERIAL);
    two[0] = &quiet.link;
    zplc_proto_log(&dev, ZPLC_PROTO_LOG_LEVEL_INFO, "nobody listens");
    zplc_proto_dev_service(&dev, two, 1U);
    CHECK(quiet.seen_count == 0U, "a link whose mask is empty receives no event");
  }
}

static void test_a_hostile_stream_does_nothing(void) {
  client_t c;
  uint32_t state = 0xDEADBEEFU;
  unsigned round;
  size_t i;

  reset_world(&ops);
  client_init(&c, ZPLC_PROTO_TRANSPORT_NETWORK);
  for (round = 0U; round < 300U; round++) {
    uint8_t junk[200];

    for (i = 0U; i < sizeof(junk); i++) {
      state = state * 1664525U + 1013904223U;
      junk[i] = (uint8_t)(state >> 24);
      if ((state & 0x40U) != 0U) {
        junk[i] = (i & 1U) != 0U ? ZPLC_PROTO_SYNC1 : ZPLC_PROTO_SYNC0;
      }
    }
    zplc_proto_link_feed(&c.link, junk, sizeof(junk));
  }
  CHECK(!zplc_proto_session_is_open(&dev) && fake.calls_mem_write == 0U && fake.calls_run == 0U &&
            fake.calls_force_set == 0U && fake.calls_program_begin == 0U && fake.calls_key == 0U,
        "random bytes on a network link open no session and reach nothing");
}

int main(void) {
  test_open_messages_and_the_shape_of_a_response();
  test_the_access_table_is_the_same_as_the_adapters();
  test_state_changing_messages_need_a_session();
  test_one_session_at_a_time_and_how_it_ends();
  test_a_download_is_a_session_transaction();
  test_configuration_and_credentials_follow_the_session_rule();
  test_a_multi_byte_write_lands_whole_at_the_latch();
  test_the_value_a_scan_reads_is_never_a_mix();
  test_serial_trust_and_key_provisioning();
  test_a_network_session_authenticates_every_frame();
  test_events();
  test_a_hostile_stream_does_nothing();
  printf("%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
