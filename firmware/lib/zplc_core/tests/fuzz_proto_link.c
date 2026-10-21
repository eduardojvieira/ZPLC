/**
 * @file fuzz_proto_link.c
 * @brief libFuzzer target for the device engine of the device link protocol (COM-020, COM-021, VF-014).
 *
 * SPDX-License-Identifier: MIT
 *
 * Build with -DZPLC_BUILD_FUZZER=ON (Clang); tools/fuzz/run.sh does that and runs it.
 *
 * The input is a byte stream that is fed, in chunks, to a link of the engine; the first byte chooses the kind
 * of link and whether the device holds a key. The engine runs over a port that counts the calls that change the
 * device. Invariants checked on every input:
 *
 *  - a network link whose frames carry no valid code never reaches a call that changes the device (the mutator
 *    cannot compute HMAC-SHA-256 under a key it does not have);
 *  - a serial link reaches them only through a session: every counted change happened while a session was open
 *    on that link;
 *  - the key is never in what the engine sends;
 *  - the engine is still usable afterwards: a hello is answered.
 * Memory errors and undefined behaviour are found by the sanitizers.
 */

#include "fuzz_common.h"

#include "zplc_proto.h"
#include "zplc_proto_dev.h"

typedef struct {
  uint32_t now;
  unsigned changes;
  unsigned changes_without_session;
  zplc_proto_dev_t *dev;
  uint8_t memory[0x5000];
  uint8_t key[32];
  int key_set;
  int key_leaked;
  uint8_t out[8192];
  size_t out_len;
} port_t;

static port_t g_port;

static uint32_t p_now(void *c) {
  port_t *p = (port_t *)c;
  p->now += 7U;
  return p->now;
}

static int p_random(void *c, uint8_t *out, size_t n) {
  size_t i;

  (void)c;
  for (i = 0; i < n; i++) {
    out[i] = (uint8_t)(0x5A + i * 17U);
  }
  return 0;
}

static int p_key_load(void *c, uint8_t key[32]) {
  port_t *p = (port_t *)c;

  if (!p->key_set) {
    return 1;
  }
  memcpy(key, p->key, 32U);
  return 0;
}

static int p_key_store(void *c, const uint8_t key[32]) {
  port_t *p = (port_t *)c;

  p->changes++;
  if (!zplc_proto_session_is_open(p->dev)) {
    p->changes_without_session++;
  }
  memcpy(p->key, key, 32U);
  p->key_set = 1;
  return 0;
}

static int p_key_erase(void *c) {
  port_t *p = (port_t *)c;

  p->changes++;
  if (!zplc_proto_session_is_open(p->dev)) {
    p->changes_without_session++;
  }
  p->key_set = 0;
  return 0;
}

static void note_change(port_t *p) {
  p->changes++;
  if (!zplc_proto_session_is_open(p->dev)) {
    p->changes_without_session++;
  }
}

static int p_status(void *c, zplc_proto_status_t *s) {
  (void)c;
  memset(s, 0, sizeof(*s));
  return 0;
}

static int p_mem_read(void *c, uint16_t a, uint8_t *out, uint16_t n) {
  port_t *p = (port_t *)c;

  if ((size_t)a + n > sizeof(p->memory)) {
    return 1;
  }
  memcpy(out, p->memory + a, n);
  return 0;
}

static int p_mem_write(void *c, uint16_t a, const uint8_t *d, uint16_t n) {
  port_t *p = (port_t *)c;

  note_change(p);
  if ((size_t)a + n > sizeof(p->memory)) {
    return 1;
  }
  memcpy(p->memory + a, d, n);
  return 0;
}

static int p_force_set(void *c, uint16_t a, const uint8_t *d, uint16_t n) {
  (void)a;
  (void)d;
  (void)n;
  note_change((port_t *)c);
  return 0;
}
static int p_force_clear(void *c, uint16_t a) {
  (void)a;
  note_change((port_t *)c);
  return 0;
}
static int p_force_clear_all(void *c) {
  note_change((port_t *)c);
  return 0;
}
static int p_run(void *c) {
  note_change((port_t *)c);
  return 0;
}
static int p_program_begin(void *c, uint32_t n) {
  (void)n;
  note_change((port_t *)c);
  return 0;
}
static int p_program_chunk(void *c, uint32_t o, const uint8_t *d, uint16_t n) {
  (void)o;
  (void)d;
  (void)n;
  note_change((port_t *)c);
  return 0;
}
static int p_program_commit(void *c, zplc_proto_program_info_t *i) {
  note_change((port_t *)c);
  memset(i, 0, sizeof(*i));
  return 0;
}
static void p_program_abort(void *c) { (void)c; }
static int p_program_info(void *c, zplc_proto_program_info_t *i) {
  (void)c;
  memset(i, 0, sizeof(*i));
  return 0;
}
static int p_config_set(void *c, const char *k, const uint8_t *v, uint16_t n) {
  (void)k;
  (void)v;
  (void)n;
  note_change((port_t *)c);
  return 0;
}

static int sink(void *context, const uint8_t *frame, size_t length) {
  port_t *p = (port_t *)context;
  size_t i;

  if (p->key_set && length >= 32U) {
    for (i = 0; i + 32U <= length; i++) {
      if (memcmp(frame + i, p->key, 32U) == 0) {
        p->key_leaked = 1;
      }
    }
  }
  if (p->out_len + length <= sizeof(p->out)) {
    memcpy(p->out + p->out_len, frame, length);
    p->out_len += length;
  } else {
    p->out_len = 0;
  }
  return 0;
}

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  static zplc_proto_dev_t dev;
  static zplc_proto_link_t link;
  zplc_proto_ops_t ops;
  const uint8_t hello[3] = {1U, 0x00U, 0x02U};
  uint8_t frame[ZPLC_PROTO_FRAME_MAX];
  size_t used;
  size_t offset;
  fz_rng_t rng;
  uint8_t mode;
  zplc_proto_link_t *links[1];

  if (size == 0U) {
    return 0;
  }
  mode = data[0];
  memset(&g_port, 0, sizeof(g_port));
  g_port.dev = &dev;
  g_port.key_set = (mode & 2U) != 0U;
  memset(g_port.key, 0x37, sizeof(g_port.key));
  memset(&ops, 0, sizeof(ops));
  ops.context = &g_port;
  ops.now_ms = p_now;
  ops.random = p_random;
  ops.key_load = p_key_load;
  ops.key_store = p_key_store;
  ops.key_erase = p_key_erase;
  ops.status = p_status;
  ops.mem_read = p_mem_read;
  ops.mem_write = p_mem_write;
  ops.force_set = p_force_set;
  ops.force_clear = p_force_clear;
  ops.force_clear_all = p_force_clear_all;
  ops.run = p_run;
  ops.program_begin = p_program_begin;
  ops.program_chunk = p_program_chunk;
  ops.program_commit = p_program_commit;
  ops.program_abort = p_program_abort;
  ops.program_info = p_program_info;
  ops.config_set = p_config_set;
  FZ_REQUIRE(zplc_proto_dev_init(&dev, &ops, 30U) == 0, "the engine starts");
  zplc_proto_link_init(&link, &dev, (mode & 1U) != 0U ? ZPLC_PROTO_TRANSPORT_NETWORK : ZPLC_PROTO_TRANSPORT_SERIAL, sink, &g_port);
  links[0] = &link;

  fz_rng_seed(&rng, (uint64_t)size * 40503ULL + data[size / 2U]);
  offset = 1U;
  while (offset < size) {
    size_t chunk = 1U + fz_below(&rng, 96U);

    if (chunk > size - offset) {
      chunk = size - offset;
    }
    zplc_proto_link_feed(&link, data + offset, chunk);
    offset += chunk;
    if (fz_below(&rng, 8U) == 0U) {
      zplc_proto_dev_service(&dev, links, 1U);
    }
  }

  if ((mode & 1U) != 0U) {
    /* a network link: no valid code was possible */
    FZ_REQUIRE(g_port.changes == 0U, "nothing a frame without the key says changes the device over the network");
  }
  FZ_REQUIRE(g_port.changes_without_session == 0U, "every change happened inside a session");
  FZ_REQUIRE(!g_port.key_leaked, "the key is never sent");

  /* still alive */
  g_port.out_len = 0;
  used = zplc_proto_encode(frame, sizeof(frame), ZPLC_PROTO_KIND_REQUEST, ZPLC_PROTO_MSG_HELLO, 0xFFFFFFF0U, hello, sizeof(hello));
  zplc_proto_decoder_reset(&link.decoder);
  zplc_proto_link_feed(&link, frame, used);
  FZ_REQUIRE(g_port.out_len > 0U, "a hello is answered after any input");
  return 0;
}
