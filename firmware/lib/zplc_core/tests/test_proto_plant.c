/**
 * @file test_proto_plant.c
 * @brief The plant I/O messages through the device link engine: capability, session rules, exit on every way a
 *        session ends, network authentication (LNK-012, LNK-017, LNK-018, COM-019, COM-020, COM-025).
 *
 * SPDX-License-Identifier: MIT
 *
 * The engine runs over a fake ops table that records what it was asked; the module behind the port is not
 * linked here (it has its own test). Frames go in through zplc_proto_link_feed, as a transport would deliver
 * them, and the payloads are those of tools/contract/plant_vectors.json.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_bytes.h>
#include <zplc_proto.h>
#include <zplc_proto_dev.h>
#include <zplc_sha256.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                      \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    }                                                         \
  } while (0)

/* Payloads of tools/contract/plant_vectors.json (bodies: without the status byte). */
static const uint8_t V_ENTER_REQ[] = {0xf4, 0x01, 0x05, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x01, 0x00, 0x1c,
                                      0x02, 0x00, 0x01, 0x04, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0c};
static const uint8_t V_ENTER_RSP[] = {0x01, 0x00, 0x07, 0x00, 0x01, 0x00, 0x20, 0xf4, 0x01};
static const uint8_t V_FRAME_REQ[] = {0x01, 0x00, 0x02, 0x01, 0x00, 0x00, 0x05, 0xfe, 0xff, 0x00, 0x00, 0xc0, 0x3f};
static const uint8_t V_FRAME_RSP[] = {0x02, 0x01, 0x00, 0x00, 0xe8, 0x03, 0x00, 0x00, 0x01, 0x03, 0x00, 0x01, 0x00, 0x02};
static const uint8_t V_MIRROR_REQ[] = {0x01};
static const uint8_t V_STATUS_RSP[] = {0x01, 0x01, 0x00, 0x01, 0xd2, 0x04, 0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x14, 0x00};
static const uint8_t V_EXIT_RSP[] = {0x00, 0xd2, 0x04, 0x00, 0x00, 0x03, 0x00, 0x01, 0x00};
static const uint8_t V_EXIT_EVENT[] = {0x01, 0xd2, 0x04, 0x00, 0x00};

/* ---- the fake port ------------------------------------------------------------------------------------------ */

typedef struct {
  uint32_t now;
  uint8_t key[32];
  int key_set;
  uint32_t random_state;
  int active;
  uint8_t mirror;
  unsigned enters;
  unsigned frames;
  unsigned exits;      /* calls that left an active mode */
  unsigned exit_calls; /* every call */
  uint8_t last_exit_reason;
  int with_status;
} fake_t;

static fake_t fake;

static uint32_t p_now(void *c) {
  (void)c;
  return fake.now;
}
static int p_random(void *c, uint8_t *out, size_t n) {
  size_t i;

  (void)c;
  for (i = 0U; i < n; i++) {
    fake.random_state = fake.random_state * 1664525U + 1013904223U;
    out[i] = (uint8_t)(fake.random_state >> 16);
  }
  return 0;
}
static int p_key_load(void *c, uint8_t key[32]) {
  (void)c;
  if (!fake.key_set) {
    return 1;
  }
  memcpy(key, fake.key, 32U);
  return 0;
}
static int p_key_store(void *c, const uint8_t key[32]) {
  (void)c;
  memcpy(fake.key, key, 32U);
  fake.key_set = 1;
  return 0;
}
static int p_key_erase(void *c) {
  (void)c;
  fake.key_set = 0;
  return 0;
}

static int p_plant_enter(void *c, const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len) {
  (void)c;
  fake.enters++;
  if (fake.active) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  if (len != sizeof(V_ENTER_REQ) || memcmp(req, V_ENTER_REQ, len) != 0) {
    return (int)ZPLC_PROTO_ERR_BAD_REQUEST;
  }
  memcpy(rsp, V_ENTER_RSP, sizeof(V_ENTER_RSP));
  *rsp_len = (uint16_t)sizeof(V_ENTER_RSP);
  fake.active = 1;
  return 0;
}
static int p_plant_frame(void *c, const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len) {
  (void)c;
  fake.frames++;
  if (!fake.active) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  if (len != sizeof(V_FRAME_REQ) || memcmp(req, V_FRAME_REQ, len) != 0) {
    return (int)ZPLC_PROTO_ERR_BAD_REQUEST;
  }
  memcpy(rsp, V_FRAME_RSP, sizeof(V_FRAME_RSP));
  *rsp_len = (uint16_t)sizeof(V_FRAME_RSP);
  return 0;
}
static int p_plant_exit(void *c, uint8_t reason, uint8_t *rsp, uint16_t *rsp_len) {
  (void)c;
  fake.exit_calls++;
  if (!fake.active) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  fake.active = 0;
  fake.exits++;
  fake.last_exit_reason = reason;
  if (rsp != NULL) {
    memcpy(rsp, V_EXIT_RSP, sizeof(V_EXIT_RSP));
    rsp[0] = reason;
    *rsp_len = (uint16_t)sizeof(V_EXIT_RSP);
  }
  return 0;
}
static int p_plant_mirror(void *c, uint8_t on, uint8_t *mirror) {
  (void)c;
  if (!fake.active) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  fake.mirror = on;
  *mirror = on;
  return 0;
}
static int p_plant_status(void *c, uint8_t *rsp, uint16_t *rsp_len) {
  (void)c;
  memcpy(rsp, V_STATUS_RSP, sizeof(V_STATUS_RSP));
  *rsp_len = (uint16_t)sizeof(V_STATUS_RSP);
  return 0;
}

static zplc_proto_dev_t dev;
static zplc_proto_ops_t ops;

static void reset_world(int with_plant) {
  memset(&fake, 0, sizeof(fake));
  fake.random_state = 0x2545F491U;
  fake.now = 1000U;
  memset(&ops, 0, sizeof(ops));
  ops.now_ms = p_now;
  ops.random = p_random;
  ops.key_load = p_key_load;
  ops.key_store = p_key_store;
  ops.key_erase = p_key_erase;
  if (with_plant) {
    ops.plant_enter = p_plant_enter;
    ops.plant_frame = p_plant_frame;
    ops.plant_exit = p_plant_exit;
    ops.plant_mirror = p_plant_mirror;
    ops.plant_status = p_plant_status;
  }
  CHECK(zplc_proto_dev_init(&dev, &ops, 30U) == 0, "the engine starts over the fake port");
}

/* ---- the client --------------------------------------------------------------------------------------------- */

#define MAX_FRAMES 32U

typedef struct {
  uint8_t kind;
  uint8_t message;
  uint8_t payload[ZPLC_PROTO_PAYLOAD_MAX];
  size_t length;
} seen_t;

typedef struct {
  zplc_proto_link_t link;
  seen_t seen[MAX_FRAMES];
  size_t seen_count;
  uint8_t session_key[32];
  int has_session_key;
  uint32_t next_sequence;
} client_t;

static int client_write(void *context, const uint8_t *frame, size_t length) {
  client_t *c = (client_t *)context;
  zplc_proto_frame_t f;

  if (zplc_proto_parse(frame, length, ZPLC_PROTO_PAYLOAD_MAX, &f) == 0 && c->seen_count < MAX_FRAMES) {
    seen_t *s = &c->seen[c->seen_count++];

    s->kind = f.kind;
    s->message = f.message;
    s->length = f.length;
    memcpy(s->payload, f.payload, f.length);
  }
  return 0;
}

static void client_init(client_t *c, uint8_t transport) {
  memset(c, 0, sizeof(*c));
  zplc_proto_link_init(&c->link, &dev, transport, client_write, c);
  c->next_sequence = 1U;
}

static void send_with(client_t *c, uint8_t message, const uint8_t *payload, size_t length, const uint8_t *key, uint32_t sequence) {
  uint8_t frame[ZPLC_PROTO_FRAME_MAX];
  size_t used = zplc_proto_begin(frame, sizeof(frame), ZPLC_PROTO_KIND_REQUEST, message, sequence, payload, (uint16_t)length, key != NULL);
  size_t total;

  if (key != NULL) {
    uint8_t mac[32];

    zplc_hmac_sha256(key, 32U, frame, used, mac);
    total = zplc_proto_finish(frame, used, mac);
  } else {
    total = zplc_proto_finish(frame, used, NULL);
  }
  zplc_proto_link_feed(&c->link, frame, total);
}

static const seen_t *last_seen(const client_t *c) { return c->seen_count == 0U ? NULL : &c->seen[c->seen_count - 1U]; }

static int last_status(const client_t *c) {
  const seen_t *s = last_seen(c);

  return (s == NULL || s->kind != ZPLC_PROTO_KIND_RESPONSE || s->length == 0U) ? -1 : (int)s->payload[0];
}

/* The response status to a request, or -1 when it was dropped. */
static int ask(client_t *c, uint8_t message, const uint8_t *payload, size_t length) {
  c->seen_count = 0U;
  send_with(c, message, payload, length, c->has_session_key ? c->session_key : NULL, c->next_sequence++);
  return last_status(c);
}

static int body_is(const client_t *c, const uint8_t *body, size_t length) {
  const seen_t *s = last_seen(c);

  return s != NULL && s->length == length + 1U && memcmp(s->payload + 1U, body, length) == 0;
}

static void open_serial_session(client_t *c, uint8_t flags) {
  uint8_t payload[ZPLC_PROTO_SESSION_OPEN_REQ_FIXED];

  memset(payload, 0, sizeof(payload));
  payload[ZPLC_PROTO_SESSION_OPEN_REQ_FLAGS_OFF] = flags;
  memcpy(payload + ZPLC_PROTO_SESSION_OPEN_REQ_NAME_OFF, "test", 4U);
  c->seen_count = 0U;
  send_with(c, ZPLC_PROTO_MSG_SESSION_OPEN, payload, sizeof(payload), NULL, c->next_sequence++);
}

static int open_network_session(client_t *c, const uint8_t *device_key) {
  uint8_t challenge[ZPLC_PROTO_NONCE_BYTES];
  uint8_t client_nonce[ZPLC_PROTO_NONCE_BYTES];
  uint8_t payload[ZPLC_PROTO_SESSION_OPEN_REQ_FIXED];
  zplc_hmac_sha256_t h;
  size_t i;

  c->seen_count = 0U;
  send_with(c, ZPLC_PROTO_MSG_CHALLENGE, NULL, 0U, NULL, c->next_sequence++);
  if (last_status(c) != 0) {
    return last_status(c);
  }
  memcpy(challenge, last_seen(c)->payload + 1U, sizeof(challenge));
  for (i = 0U; i < sizeof(client_nonce); i++) {
    client_nonce[i] = (uint8_t)(0xC0U + i);
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
  c->has_session_key = 1;
  c->seen_count = 0U;
  c->next_sequence = 100U;
  send_with(c, ZPLC_PROTO_MSG_SESSION_OPEN, payload, sizeof(payload), device_key, c->next_sequence++);
  return last_status(c);
}

static void subscribe_plant_events(client_t *c) {
  uint8_t mask[4];

  zplc_put_u32_le(mask, (uint32_t)ZPLC_PROTO_EVTMASK_PLANT);
  CHECK(ask(c, ZPLC_PROTO_MSG_EVENTS_SET, mask, sizeof(mask)) == 0, "plant events are asked for");
}

static unsigned exit_events(const client_t *c, uint8_t reason) {
  unsigned n = 0U;
  size_t i;

  for (i = 0U; i < c->seen_count; i++) {
    n += c->seen[i].kind == ZPLC_PROTO_KIND_EVENT && c->seen[i].message == ZPLC_PROTO_EVT_PLANT_EXIT && c->seen[i].length == 5U &&
         c->seen[i].payload[0] == reason;
  }
  return n;
}

static void enter_plant(client_t *c) {
  CHECK(ask(c, ZPLC_PROTO_MSG_PLANT_ENTER, V_ENTER_REQ, sizeof(V_ENTER_REQ)) == 0 && fake.active, "a session enters plant I/O mode");
}

static void open_and_enter(client_t *c, zplc_proto_link_t **links) {
  client_init(c, ZPLC_PROTO_TRANSPORT_SERIAL);
  links[0] = &c->link;
  open_serial_session(c, 0U);
  CHECK(last_status(c) == 0, "a session opens");
  subscribe_plant_events(c);
  enter_plant(c);
}

/* ---- tests -------------------------------------------------------------------------------------------------- */

static uint32_t hello_capabilities(client_t *c) {
  const uint8_t hello[3] = {1U, 0x00U, 0x02U};
  const seen_t *s;

  CHECK(ask(c, ZPLC_PROTO_MSG_HELLO, hello, sizeof(hello)) == 0, "a hello is answered");
  s = last_seen(c);
  return s != NULL && s->length > ZPLC_PROTO_HELLO_RSP_CAPABILITIES_OFF + 4U
             ? zplc_get_u32_le(s->payload + ZPLC_PROTO_HELLO_RSP_CAPABILITIES_OFF)
             : 0U;
}

static const uint8_t PLANT_IDS[5] = {ZPLC_PROTO_MSG_PLANT_ENTER, ZPLC_PROTO_MSG_PLANT_FRAME, ZPLC_PROTO_MSG_PLANT_EXIT,
                                     ZPLC_PROTO_MSG_PLANT_MIRROR, ZPLC_PROTO_MSG_PLANT_STATUS};

static void test_proto_plant_capability_absent_without_ops(void) {
  client_t c;
  size_t i;

  reset_world(0);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  CHECK((hello_capabilities(&c) & ZPLC_PROTO_CAP_PLANT) == 0U, "the hello of a build without plant ops carries no bit 12");
  open_serial_session(&c, 0U);
  for (i = 0U; i < 5U; i++) {
    const uint8_t payload[ZPLC_PROTO_PLANT_FRAME_REQ_FIXED] = {0};
    const size_t length = PLANT_IDS[i] == ZPLC_PROTO_MSG_PLANT_ENTER    ? 4U
                          : PLANT_IDS[i] == ZPLC_PROTO_MSG_PLANT_FRAME  ? 6U
                          : PLANT_IDS[i] == ZPLC_PROTO_MSG_PLANT_MIRROR ? 1U
                                                                        : 0U;

    CHECK(ask(&c, PLANT_IDS[i], payload, length) == (int)ZPLC_PROTO_ERR_UNSUPPORTED, "every plant message answers UNSUPPORTED");
  }
  /* a port with only some of the four mandatory members does not advertise it either */
  ops.plant_enter = p_plant_enter;
  ops.plant_frame = p_plant_frame;
  CHECK(zplc_proto_dev_init(&dev, &ops, 30U) == 0, "the engine starts over a partial table");
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  CHECK((hello_capabilities(&c) & ZPLC_PROTO_CAP_PLANT) == 0U, "a partial table advertises nothing");
}

static void test_proto_plant_capability_present_with_ops(void) {
  client_t c;

  reset_world(1);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  CHECK((hello_capabilities(&c) & ZPLC_PROTO_CAP_PLANT) != 0U, "the hello advertises bit 12 with the four members");
  CHECK(ZPLC_PROTO_CAP_PLANT == 0x00001000UL, "the bit is 0x00001000");
  /* the status member is optional */
  ops.plant_status = NULL;
  open_serial_session(&c, 0U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_STATUS, NULL, 0U) == (int)ZPLC_PROTO_ERR_UNSUPPORTED,
        "PLANT_STATUS without its member is UNSUPPORTED");
}

static void test_proto_plant_needs_a_session(void) {
  client_t c;
  size_t i;

  reset_world(1);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  for (i = 0U; i < 5U; i++) {
    const size_t length = PLANT_IDS[i] == ZPLC_PROTO_MSG_PLANT_ENTER    ? sizeof(V_ENTER_REQ)
                          : PLANT_IDS[i] == ZPLC_PROTO_MSG_PLANT_FRAME  ? sizeof(V_FRAME_REQ)
                          : PLANT_IDS[i] == ZPLC_PROTO_MSG_PLANT_MIRROR ? 1U
                                                                        : 0U;
    const uint8_t *payload = PLANT_IDS[i] == ZPLC_PROTO_MSG_PLANT_ENTER ? V_ENTER_REQ : V_FRAME_REQ;

    CHECK(ask(&c, PLANT_IDS[i], payload, length) == (int)ZPLC_PROTO_ERR_NO_SESSION, "without a session every plant message is NO_SESSION");
  }
  CHECK(fake.enters == 0U && fake.frames == 0U && !fake.active, "and none of them reached the port");
}

static void test_proto_plant_enter_frame_exit_roundtrip_matches_the_vectors(void) {
  client_t c;
  zplc_proto_link_t *links[1];

  reset_world(1);
  client_init(&c, ZPLC_PROTO_TRANSPORT_SERIAL);
  links[0] = &c.link;
  open_serial_session(&c, 0U);
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_ENTER, V_ENTER_REQ, sizeof(V_ENTER_REQ)) == 0 && body_is(&c, V_ENTER_RSP, sizeof(V_ENTER_RSP)),
        "PLANT_ENTER answers the vector");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_FRAME, V_FRAME_REQ, sizeof(V_FRAME_REQ)) == 0 && body_is(&c, V_FRAME_RSP, sizeof(V_FRAME_RSP)),
        "PLANT_FRAME answers the vector");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_MIRROR, V_MIRROR_REQ, 1U) == 0 && fake.mirror == 1U && body_is(&c, V_MIRROR_REQ, 1U),
        "PLANT_MIRROR answers the vector");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_STATUS, NULL, 0U) == 0 && body_is(&c, V_STATUS_RSP, sizeof(V_STATUS_RSP)),
        "PLANT_STATUS answers the vector");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_EXIT, NULL, 0U) == 0 && !fake.active, "PLANT_EXIT leaves the mode");
  CHECK(last_seen(&c)->length == 10U && last_seen(&c)->payload[1] == ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED &&
            memcmp(last_seen(&c)->payload + 2U, V_EXIT_RSP + 1U, 8U) == 0,
        "its response is reason CLOSED and the counters of the vector");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_EXIT, NULL, 0U) == (int)ZPLC_PROTO_ERR_STATE, "a second exit is a state error, as the port says");
  (void)links;
}

static void test_proto_plant_session_close_exits_with_session_end(void) {
  client_t c;
  zplc_proto_link_t *links[1];

  reset_world(1);
  open_and_enter(&c, links);
  CHECK(ask(&c, ZPLC_PROTO_MSG_SESSION_CLOSE, NULL, 0U) == 0, "the session is closed");
  CHECK(!fake.active && fake.exits == 1U && fake.last_exit_reason == ZPLC_PROTO_PLANT_EXIT_REASON_SESSION_END,
        "the mode ended with the session, for SESSION_END");
}

static void test_proto_plant_idle_timeout_exits(void) {
  client_t c;
  zplc_proto_link_t *links[1];

  reset_world(1);
  open_and_enter(&c, links);
  fake.now += 29000U;
  zplc_proto_dev_service(&dev, links, 1U);
  CHECK(fake.active, "29 seconds of silence do not end the mode");
  fake.now += 2000U;
  zplc_proto_dev_service(&dev, links, 1U);
  CHECK(!zplc_proto_session_is_open(&dev) && !fake.active && fake.last_exit_reason == ZPLC_PROTO_PLANT_EXIT_REASON_SESSION_END,
        "an idle session ends and takes the mode with it");
}

static void test_proto_plant_takeover_exits(void) {
  client_t a;
  client_t b;
  zplc_proto_link_t *links[2];

  reset_world(1);
  open_and_enter(&a, links);
  client_init(&b, ZPLC_PROTO_TRANSPORT_SERIAL);
  links[1] = &b.link;
  open_serial_session(&b, 1U);
  CHECK(last_status(&b) == 0, "a person at the serial link takes the session over");
  CHECK(!fake.active && fake.exits == 1U && fake.last_exit_reason == ZPLC_PROTO_PLANT_EXIT_REASON_SESSION_END,
        "the mode of the session that was taken over ended");
  CHECK(ask(&b, ZPLC_PROTO_MSG_PLANT_FRAME, V_FRAME_REQ, sizeof(V_FRAME_REQ)) == (int)ZPLC_PROTO_ERR_STATE,
        "the new session finds no mode to feed");
}

static void test_proto_plant_link_lost_exits_with_link_lost(void) {
  client_t c;
  zplc_proto_link_t *links[1];

  reset_world(1);
  open_and_enter(&c, links);
  zplc_proto_link_lost(&c.link);
  CHECK(!fake.active && fake.exits == 1U && fake.last_exit_reason == ZPLC_PROTO_PLANT_EXIT_REASON_LINK_LOST,
        "a link that is lost ends the mode for LINK_LOST");
}

static void test_proto_plant_exit_event_is_pushed_once_with_the_reason(void) {
  client_t c;
  zplc_proto_link_t *links[1];

  reset_world(1);
  open_and_enter(&c, links);
  c.seen_count = 0U;
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_EXIT, NULL, 0U) == 0, "the person leaves the mode");
  zplc_proto_dev_service(&dev, links, 1U);
  CHECK(exit_events(&c, ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED) == 1U, "EVT_PLANT_EXIT is pushed with reason CLOSED");
  CHECK(ZPLC_PROTO_EVT_PLANT_EXIT == 136U, "the event is 136");
  c.seen_count = 0U;
  CHECK(ask(&c, ZPLC_PROTO_MSG_SESSION_CLOSE, NULL, 0U) == 0, "the session is closed afterwards");
  zplc_proto_dev_service(&dev, links, 1U);
  CHECK(exit_events(&c, ZPLC_PROTO_PLANT_EXIT_REASON_SESSION_END) == 0U && fake.exits == 1U,
        "closing the session after the exit pushes no second event");

  /* a session end pushes it once with its own reason and the frame count of the exit (a lost link has no one to tell) */
  reset_world(1);
  open_and_enter(&c, links);
  c.seen_count = 0U;
  fake.now += 31000U;
  zplc_proto_dev_service(&dev, links, 1U);
  zplc_proto_dev_service(&dev, links, 1U);
  CHECK(fake.exit_calls == 1U, "a session that ended once reaches the port once");
  CHECK(exit_events(&c, ZPLC_PROTO_PLANT_EXIT_REASON_SESSION_END) == 1U, "the end is pushed once with SESSION_END");
  {
    size_t i;
    int framed = 0;

    for (i = 0U; i < c.seen_count; i++) {
      framed |= c.seen[i].message == ZPLC_PROTO_EVT_PLANT_EXIT && memcmp(c.seen[i].payload + 1U, V_EXIT_EVENT + 1U, 4U) == 0;
    }
    CHECK(framed, "with the frame count of the exit");
  }
}

static void test_proto_plant_frame_counts_as_session_activity(void) {
  client_t c;
  zplc_proto_link_t *links[1];
  int i;

  reset_world(1);
  open_and_enter(&c, links);
  for (i = 0; i < 4; i++) {
    fake.now += 20000U;
    CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_FRAME, V_FRAME_REQ, sizeof(V_FRAME_REQ)) == 0, "a frame is applied");
    zplc_proto_dev_service(&dev, links, 1U);
  }
  CHECK(zplc_proto_session_is_open(&dev) && fake.active && fake.exits == 0U, "80 seconds of frames keep a 30 second session alive");
  fake.now += 31000U;
  zplc_proto_dev_service(&dev, links, 1U);
  CHECK(!zplc_proto_session_is_open(&dev) && !fake.active, "and silence still ends it");
}

static void test_proto_plant_network_transport_requires_authentication(void) {
  client_t net;
  zplc_proto_link_t *links[1];
  const uint8_t key[32] = {9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 9, 8};

  reset_world(1);
  memcpy(fake.key, key, 32U);
  fake.key_set = 1;
  client_init(&net, ZPLC_PROTO_TRANSPORT_NETWORK);
  links[0] = &net.link;
  CHECK(ask(&net, ZPLC_PROTO_MSG_PLANT_ENTER, V_ENTER_REQ, sizeof(V_ENTER_REQ)) != 0 && fake.enters == 0U,
        "a plant message without a session is refused over the network and reaches nothing");
  CHECK(open_network_session(&net, key) == 0, "the key opens a network session");
  CHECK(ask(&net, ZPLC_PROTO_MSG_PLANT_ENTER, V_ENTER_REQ, sizeof(V_ENTER_REQ)) == 0 && fake.active,
        "the authenticated link enters the mode");
  CHECK(ask(&net, ZPLC_PROTO_MSG_PLANT_FRAME, V_FRAME_REQ, sizeof(V_FRAME_REQ)) == 0 && body_is(&net, V_FRAME_RSP, sizeof(V_FRAME_RSP)),
        "and exchanges a frame");
  net.has_session_key = 0;
  {
    const unsigned frames = fake.frames;
    const uint32_t drops = net.link.stats.auth_drops;

    CHECK(ask(&net, ZPLC_PROTO_MSG_PLANT_FRAME, V_FRAME_REQ, sizeof(V_FRAME_REQ)) == -1 && fake.frames == frames &&
              net.link.stats.auth_drops == drops + 1U,
          "a frame without the code, inside the session, is dropped and counted before the port");
  }
  net.has_session_key = 1;
  net.next_sequence--; /* the dropped frame did not advance the sequence of the session */
  CHECK(ask(&net, ZPLC_PROTO_MSG_PLANT_EXIT, NULL, 0U) == 0 && !fake.active, "the authenticated link leaves the mode");
  (void)links;
}

static void test_proto_plant_bad_length_is_bad_request(void) {
  client_t c;
  zplc_proto_link_t *links[1];
  const uint8_t two[2] = {0x01, 0x00};
  const uint8_t bad_mirror[1] = {0x02};

  reset_world(1);
  open_and_enter(&c, links);
  fake.frames = 0U;
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_ENTER, V_ENTER_REQ, 3U) == (int)ZPLC_PROTO_ERR_BAD_REQUEST,
        "an enter shorter than its fixed part is refused");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_FRAME, V_FRAME_REQ, 5U) == (int)ZPLC_PROTO_ERR_BAD_REQUEST,
        "a frame shorter than its header is refused");
  CHECK(fake.frames == 0U, "without reaching the port");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_FRAME, V_FRAME_REQ, sizeof(V_FRAME_REQ) - 1U) == (int)ZPLC_PROTO_ERR_BAD_REQUEST,
        "a frame of the wrong length is refused by the port with BAD_REQUEST");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_EXIT, two, 2U) == (int)ZPLC_PROTO_ERR_BAD_REQUEST, "an exit with a payload is refused");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_MIRROR, two, 2U) == (int)ZPLC_PROTO_ERR_BAD_REQUEST, "a mirror of two bytes is refused");
  CHECK(ask(&c, ZPLC_PROTO_MSG_PLANT_MIRROR, bad_mirror, 1U) == (int)ZPLC_PROTO_ERR_BAD_REQUEST && fake.mirror == 0U,
        "a mirror value that is not 0 or 1 is refused");
  CHECK(fake.active, "refused requests left the mode as it was");
}

int main(void) {
  test_proto_plant_capability_absent_without_ops();
  test_proto_plant_capability_present_with_ops();
  test_proto_plant_needs_a_session();
  test_proto_plant_enter_frame_exit_roundtrip_matches_the_vectors();
  test_proto_plant_session_close_exits_with_session_end();
  test_proto_plant_idle_timeout_exits();
  test_proto_plant_takeover_exits();
  test_proto_plant_link_lost_exits_with_link_lost();
  test_proto_plant_exit_event_is_pushed_once_with_the_reason();
  test_proto_plant_frame_counts_as_session_activity();
  test_proto_plant_network_transport_requires_authentication();
  test_proto_plant_bad_length_is_bad_request();
  printf("%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
