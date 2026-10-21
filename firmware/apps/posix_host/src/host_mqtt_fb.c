/*
 * The MQTT client of the simulation runtime, behind zplc_mqtt_fb.h (COM-009).
 *
 * It is the other side of the same seam the controller's client implements: the MQTT handler of the
 * application asks it to publish and subscribe, from the scan, and it never waits for the broker; this thread
 * owns the connection. MQTT 3.1.1 over plain TCP, QoS 0, 1 and 2 on publish (the acknowledgement of a message is
 * not waited for, as on the controller) and QoS 0 to 2 on subscribe. Session loss fails every queued request
 * (nothing is sent on a later session) and the client reconnects with the documented back-off.
 *
 * What it does not have, because the controller's client has them only for a cloud profile: Sparkplug B, Azure
 * Event Grid and cloud-to-device messages. Those blocks answer STATUS 10 in a simulation.
 *
 * SPDX-License-Identifier: MIT
 */
#define _POSIX_C_SOURCE 200809L /* NOLINT(bugprone-reserved-identifier,cert-dcl37-c,cert-dcl51-cpp): feature-test macro */

#include <errno.h>
#include <poll.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include <zplc_comm_dispatch.h>
#include <zplc_comm_req.h>

#include "host_comm.h"
#include "zplc_mqtt_fb.h"

LOG_MODULE_REGISTER(zplc_host_mqtt, LOG_LEVEL_INF);

#define REQ_MAX 8U
#define SUB_MAX 4U
#define TOPIC_MAX 128U
#define PAYLOAD_MAX 128U
/** A request that this thread has not finished in this time is reported TIMEOUT and dropped (COM-018). */
#define REQUEST_TIMEOUT_MS 5000U
#define SUBSCRIBE_ID_BASE 0x0300U
#define PACKET_MAX 2048U

enum { PHASE_CONNECTING = 0, PHASE_DOWN = 1 };

struct fb_req {
  zplc_comm_req_t head; /* first: the pool of zplc_comm_req.h */
  uint8_t qos;
  bool retain;
  size_t payload_len;
  char topic[TOPIC_MAX];
  uint8_t payload[PAYLOAD_MAX];
};

struct fb_sub {
  const void *owner; /* NULL: free */
  uint8_t qos;
  uint8_t state; /* 0 to be sent, 1 sent, 2 acknowledged, 3 refused */
  char topic[TOPIC_MAX];
  bool has_message;
  size_t message_len;
  uint8_t message[PAYLOAD_MAX];
};

static struct fb_req s_reqs[REQ_MAX];
static struct fb_req *s_queue_buffer[REQ_MAX];
static struct k_msgq s_queue;
static struct fb_sub s_subs[SUB_MAX];
static struct k_spinlock s_lock;
static k_spinlock_key_t s_key;

static void lock(void *context) {
  (void)context;
  s_key = k_spin_lock(&s_lock);
}
static void unlock(void *context) {
  (void)context;
  k_spin_unlock(&s_lock, s_key);
}

static const zplc_comm_req_pool_t s_pool = {
    .slots = s_reqs,
    .stride = sizeof(struct fb_req),
    .count = REQ_MAX,
    .lock = lock,
    .unlock = unlock,
    .context = NULL,
};

/* Written by the client thread and read by the scan, and the other way round for s_started: atomics, not locks,
 * because each is one word that means something by itself. */
static bool s_started;
static bool s_connected;
static uint8_t s_phase = PHASE_CONNECTING;
static int s_last_error;

#define GET(variable) __atomic_load_n(&(variable), __ATOMIC_ACQUIRE)
#define SET(variable, value) __atomic_store_n(&(variable), (value), __ATOMIC_RELEASE)

static char s_host[96];
static char s_client_id[48];
static uint16_t s_port;
static uint16_t s_keepalive_s;
static uint32_t s_connect_timeout_ms;
static uint32_t s_reconnect_initial_ms;
static uint32_t s_reconnect_max_ms;
static struct k_thread s_thread;
static K_THREAD_STACK_DEFINE(s_stack, 4096);
static uint16_t s_packet_id;

/* ---- what the blocks ask of the client (the scan's side) -------------------------------------------------- */

zplc_mqtt_fb_session_t zplc_mqtt_fb_session(int *last_error) {
  if (last_error != NULL) {
    *last_error = 0;
  }
  if (!GET(s_started)) {
    if (last_error != NULL) {
      *last_error = -ENOTSUP; /* no broker named: the service is off */
    }
    return ZPLC_MQTT_FB_DOWN;
  }
  if (GET(s_connected)) {
    return ZPLC_MQTT_FB_UP;
  }
  if (last_error != NULL) {
    *last_error = GET(s_last_error);
  }
  return GET(s_phase) == PHASE_CONNECTING ? ZPLC_MQTT_FB_CONNECTING : ZPLC_MQTT_FB_DOWN;
}

int zplc_mqtt_fb_publish(const void *owner, const char *topic, const uint8_t *payload, size_t length, uint8_t qos, bool retain) {
  struct fb_req *req;

  if (!GET(s_started)) {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNAVAILABLE);
  }
  if (topic == NULL || length > PAYLOAD_MAX || strlen(topic) >= TOPIC_MAX) {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_STRING_OVERFLOW);
  }
  if (!GET(s_connected)) {
    /* Nothing is queued for a session that may come later: the block reports the failure now. */
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_NOT_CONNECTED);
  }
  req = (struct fb_req *)zplc_comm_req_claim(&s_pool, owner, k_uptime_get_32());
  if (req == NULL) {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_QUEUE_FULL);
  }
  strncpy(req->topic, topic, sizeof(req->topic) - 1U);
  req->topic[sizeof(req->topic) - 1U] = '\0';
  if (length != 0U) {
    memcpy(req->payload, payload, length);
  }
  req->payload_len = length;
  req->qos = qos;
  req->retain = retain;
  zplc_comm_req_submit(&s_pool, &req->head);
  if (k_msgq_put(&s_queue, (const void *)&req, K_NO_WAIT) != 0) {
    zplc_comm_req_cancel(&s_pool, &req->head);
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_QUEUE_FULL);
  }
  return ZPLC_COMM_HANDLER_PENDING;
}

int zplc_mqtt_fb_event_grid(const void *owner, const char *event_type, const char *topic, const char *data) {
  (void)owner;
  (void)event_type;
  (void)topic;
  (void)data;
  return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNAVAILABLE);
}

int zplc_mqtt_fb_rebirth(const void *owner) {
  (void)owner;
  return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNAVAILABLE);
}

int zplc_mqtt_fb_poll(const void *owner) {
  zplc_comm_req_t *slot = NULL;
  const int result = zplc_comm_req_peek(&s_pool, owner, k_uptime_get_32(), REQUEST_TIMEOUT_MS, &slot);

  if (result == ZPLC_COMM_HANDLER_DONE && slot != NULL) {
    zplc_comm_req_release(&s_pool, slot);
  }
  return result;
}

void zplc_mqtt_fb_abort(const void *owner) { zplc_comm_req_abort(&s_pool, owner); }

bool zplc_mqtt_fb_c2d_available(void) { return false; }
bool zplc_mqtt_fb_sparkplug(void) { return false; }

int zplc_mqtt_fb_subscribe(const void *owner, const char *topic, uint8_t qos) {
  struct fb_sub *sub = NULL;
  int result;
  size_t i;

  if (!GET(s_started) || topic == NULL) {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNAVAILABLE);
  }
  if (strlen(topic) >= TOPIC_MAX) {
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_STRING_OVERFLOW);
  }

  lock(NULL);
  for (i = 0U; i < SUB_MAX; i++) {
    if (s_subs[i].owner == owner) {
      sub = &s_subs[i];
      break;
    }
  }
  if (sub == NULL) {
    for (i = 0U; i < SUB_MAX; i++) {
      if (s_subs[i].owner == NULL) {
        sub = &s_subs[i];
        memset(sub, 0, sizeof(*sub));
        sub->owner = owner;
        sub->topic[0] = '\1'; /* differs from every topic: filled in below */
        break;
      }
    }
  }
  if (sub == NULL) {
    unlock(NULL);
    return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_QUEUE_FULL);
  }
  if (strcmp(sub->topic, topic) != 0 || sub->qos != qos) {
    sub->qos = qos;
    sub->state = 0U;
    sub->has_message = false;
    sub->message_len = 0U;
    strncpy(sub->topic, topic, sizeof(sub->topic) - 1U);
    sub->topic[sizeof(sub->topic) - 1U] = '\0';
  }
  if (!GET(s_connected)) {
    result = ZPLC_COMM_HANDLER_PENDING;
    if (GET(s_phase) != PHASE_CONNECTING) {
      const int status = zplc_comm_status_from_errno(GET(s_last_error));

      result = ZPLC_COMM_HANDLER_FAIL(status == ZPLC_COMM_UNKNOWN || status == ZPLC_COMM_OK ? ZPLC_COMM_NOT_CONNECTED : status);
    }
  } else if (sub->state == 2U) {
    result = ZPLC_COMM_HANDLER_DONE;
  } else if (sub->state == 3U) {
    result = ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_PROTO_ERROR);
  } else {
    result = ZPLC_COMM_HANDLER_PENDING;
  }
  unlock(NULL);
  return result;
}

int zplc_mqtt_fb_take_message(const void *owner, uint8_t *payload, size_t capacity) {
  int length = -1;
  size_t i;

  lock(NULL);
  for (i = 0U; i < SUB_MAX; i++) {
    struct fb_sub *sub = &s_subs[i];

    if (sub->owner == owner && sub->has_message) {
      const size_t kept = MIN(sub->message_len, capacity);

      memcpy(payload, sub->message, kept);
      length = (int)kept;
      sub->has_message = false;
      break;
    }
  }
  unlock(NULL);
  return length;
}

void zplc_mqtt_fb_unsubscribe(const void *owner) {
  size_t i;

  lock(NULL);
  for (i = 0U; i < SUB_MAX; i++) {
    if (s_subs[i].owner == owner) {
      memset(&s_subs[i], 0, sizeof(s_subs[i]));
    }
  }
  unlock(NULL);
}

/* ---- MQTT 3.1.1 packets ----------------------------------------------------------------------------------- */

struct packet {
  uint8_t data[PACKET_MAX];
  size_t length;
};

static bool put_byte(struct packet *p, uint8_t value) {
  if (p->length >= sizeof(p->data)) {
    return false;
  }
  p->data[p->length++] = value;
  return true;
}

static bool put_u16(struct packet *p, uint16_t value) { return put_byte(p, (uint8_t)(value >> 8)) && put_byte(p, (uint8_t)value); }

static bool put_bytes(struct packet *p, const void *data, size_t length) {
  if (length > sizeof(p->data) - p->length) {
    return false;
  }
  memcpy(&p->data[p->length], data, length);
  p->length += length;
  return true;
}

static bool put_string(struct packet *p, const char *text) {
  const size_t length = strlen(text);

  return put_u16(p, (uint16_t)length) && put_bytes(p, text, length);
}

/* The fixed header goes in front of a body that was built behind a reserved gap of 5 bytes. */
static size_t seal(struct packet *p, uint8_t first, uint8_t *out) {
  const size_t body = p->length - 5U;
  uint8_t digits[4];
  size_t count = 0U;
  size_t remaining = body;

  do {
    uint8_t digit = (uint8_t)(remaining % 128U);

    remaining /= 128U;
    if (remaining != 0U) {
      digit |= 0x80U;
    }
    digits[count++] = digit;
  } while (remaining != 0U && count < 4U);
  out[0] = first;
  memcpy(&out[1], digits, count);
  memcpy(&out[1U + count], &p->data[5], body);
  return 1U + count + body;
}

static uint16_t next_packet_id(void) {
  if (++s_packet_id == 0U) {
    s_packet_id = 1U;
  }
  return s_packet_id;
}

static int send_all(int sock, const uint8_t *data, size_t length, int64_t deadline) {
  size_t sent = 0U;

  while (sent < length) {
    struct pollfd fd = {.fd = sock, .events = POLLOUT, .revents = 0};
    int64_t left = deadline - k_uptime_get();
    int rc = poll(&fd, 1, left > 0 ? (int)left : 0);
    ssize_t n;

    if (rc == 0) {
      return -ETIMEDOUT;
    }
    if (rc < 0) {
      return -errno;
    }
    n = send(sock, data + sent, length - sent, 0);
    if (n < 0) {
      if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) {
        continue;
      }
      return -errno;
    }
    sent += (size_t)n;
  }
  return 0;
}

/* The send of a packet is bounded by the connect time: a peer that does not read is a lost session. */
static int send_packet(int sock, struct packet *body, uint8_t first) {
  uint8_t wire[PACKET_MAX + 5U];
  const size_t length = seal(body, first, wire);

  return send_all(sock, wire, length, k_uptime_get() + (int64_t)s_connect_timeout_ms);
}

static void packet_begin(struct packet *p) { p->length = 5U; /* the gap of the fixed header */ }

static int send_connect(int sock) {
  struct packet p;

  packet_begin(&p);
  if (!put_string(&p, "MQTT") || !put_byte(&p, 4U) || !put_byte(&p, 0x02U) /* clean session */ || !put_u16(&p, s_keepalive_s) ||
      !put_string(&p, s_client_id)) {
    return -EMSGSIZE;
  }
  return send_packet(sock, &p, 0x10U);
}

static int send_publish(int sock, const struct fb_req *req) {
  struct packet p;
  const uint8_t qos = req->qos <= 2U ? req->qos : 0U;

  packet_begin(&p);
  if (!put_string(&p, req->topic)) {
    return -EMSGSIZE;
  }
  if (qos != 0U && !put_u16(&p, next_packet_id())) {
    return -EMSGSIZE;
  }
  if (!put_bytes(&p, req->payload, req->payload_len)) {
    return -EMSGSIZE;
  }
  return send_packet(sock, &p, (uint8_t)(0x30U | (qos << 1) | (req->retain ? 1U : 0U)));
}

static int send_subscribe(int sock, uint16_t id, const char *topic, uint8_t qos) {
  struct packet p;

  packet_begin(&p);
  if (!put_u16(&p, id) || !put_string(&p, topic) || !put_byte(&p, qos <= 2U ? qos : 0U)) {
    return -EMSGSIZE;
  }
  return send_packet(sock, &p, 0x82U);
}

static int send_small(int sock, uint8_t first, bool with_id, uint16_t id) {
  struct packet p;

  packet_begin(&p);
  if (with_id && !put_u16(&p, id)) {
    return -EMSGSIZE;
  }
  return send_packet(sock, &p, first);
}

/* ---- topics and incoming messages ------------------------------------------------------------------------- */

/* `topic` matches `filter` with the wildcards of MQTT: + one level, # the rest. */
static bool topic_matches(const char *filter, const char *topic) {
  while (*filter != '\0') {
    if (*filter == '#') {
      return true;
    }
    if (*filter == '/' && filter[1] == '#' && filter[2] == '\0' && *topic == '\0') {
      return true; /* "a/#" matches "a" too */
    }
    if (*filter == '+') {
      while (*topic != '\0' && *topic != '/') {
        topic++;
      }
      filter++;
    } else {
      if (*filter != *topic) {
        return false;
      }
      filter++;
      topic++;
      continue;
    }
    if (*filter == '\0') {
      return *topic == '\0';
    }
    if (*filter != '/' || *topic != '/') {
      return false;
    }
    filter++;
    topic++;
  }
  return *topic == '\0';
}

static void deliver(const char *topic, const uint8_t *payload, size_t length) {
  const size_t kept = MIN(length, (size_t)PAYLOAD_MAX);
  size_t i;

  lock(NULL);
  for (i = 0U; i < SUB_MAX; i++) {
    struct fb_sub *sub = &s_subs[i];

    if (sub->owner != NULL && sub->state == 2U && topic_matches(sub->topic, topic)) {
      memcpy(sub->message, payload, kept);
      sub->message_len = kept;
      sub->has_message = true;
    }
  }
  unlock(NULL);
}

static void subscriptions_unsent(void) {
  size_t i;

  lock(NULL);
  for (i = 0U; i < SUB_MAX; i++) {
    if (s_subs[i].owner != NULL) {
      s_subs[i].state = 0U;
    }
  }
  unlock(NULL);
}

static void subscription_acknowledged(uint16_t id, bool granted) {
  if (id >= SUBSCRIBE_ID_BASE && id < SUBSCRIBE_ID_BASE + SUB_MAX) {
    struct fb_sub *sub = &s_subs[id - SUBSCRIBE_ID_BASE];

    lock(NULL);
    if (sub->owner != NULL && sub->state == 1U) {
      sub->state = granted ? 2U : 3U;
    }
    unlock(NULL);
  }
}

static int send_due_subscriptions(int sock) {
  size_t i;

  for (i = 0U; i < SUB_MAX; i++) {
    struct fb_sub *sub = &s_subs[i];
    char topic[TOPIC_MAX];
    uint8_t qos = 0U;
    bool send = false;
    int rc;

    lock(NULL);
    if (sub->owner != NULL && sub->state == 0U) {
      memcpy(topic, sub->topic, sizeof(topic));
      qos = sub->qos;
      sub->state = 1U;
      send = true;
    }
    unlock(NULL);
    if (!send) {
      continue;
    }
    rc = send_subscribe(sock, (uint16_t)(SUBSCRIBE_ID_BASE + i), topic, qos);
    if (rc != 0) {
      return rc;
    }
  }
  return 0;
}

/* ---- requests --------------------------------------------------------------------------------------------- */

/* Every queued request is let go with the failure of the session. */
static void fail_queued(int error) {
  struct fb_req *req = NULL;

  while (k_msgq_get(&s_queue, (void *)&req, K_NO_WAIT) == 0) {
    if (req != NULL && zplc_comm_req_begin(&s_pool, &req->head)) {
      zplc_comm_req_finish(&s_pool, &req->head, zplc_comm_fail_from_errno(error != 0 ? error : -ENOTCONN));
    }
  }
}

static int run_queued(int sock) {
  struct fb_req *req = NULL;

  while (k_msgq_get(&s_queue, (void *)&req, K_NO_WAIT) == 0) {
    int rc;

    /* Let go of by its block (reset, or older than its time limit) while it waited: nothing is sent. */
    if (req == NULL || !zplc_comm_req_begin(&s_pool, &req->head)) {
      continue;
    }
    rc = send_publish(sock, req);
    zplc_comm_req_finish(&s_pool, &req->head, rc == 0 ? ZPLC_COMM_HANDLER_DONE : zplc_comm_fail_from_errno(rc));
    if (rc != 0) {
      return rc;
    }
  }
  return 0;
}

/* ---- the session ------------------------------------------------------------------------------------------ */

struct reader {
  uint8_t body[PACKET_MAX];
  size_t have;   /* bytes of the body that arrived */
  size_t want;   /* bytes of the body the header announced */
  size_t skip;   /* bytes of a packet that does not fit and is dropped */
  uint8_t first; /* the first byte of the fixed header */
  uint32_t multiplier;
  uint32_t value;
  int state; /* 0 first byte, 1 length digits, 2 body, 3 skipping */
};

static int handle_packet(int sock, uint8_t first, const uint8_t *body, size_t length) {
  const uint8_t type = (uint8_t)(first >> 4);

  switch (type) {
  case 3: { /* PUBLISH */
    const uint8_t qos = (uint8_t)((first >> 1) & 3U);
    size_t topic_len;
    size_t offset;
    uint16_t id = 0U;
    char topic[TOPIC_MAX];

    if (length < 2U) {
      return -EPROTO;
    }
    topic_len = ((size_t)body[0] << 8) | body[1];
    offset = 2U + topic_len;
    if (offset > length || topic_len >= sizeof(topic)) {
      return -EPROTO;
    }
    memcpy(topic, &body[2], topic_len);
    topic[topic_len] = '\0';
    if (qos != 0U) {
      if (offset + 2U > length) {
        return -EPROTO;
      }
      id = (uint16_t)(((uint16_t)body[offset] << 8) | body[offset + 1U]);
      offset += 2U;
    }
    deliver(topic, &body[offset], length - offset);
    if (qos == 1U) {
      return send_small(sock, 0x40U, true, id);
    }
    if (qos == 2U) {
      return send_small(sock, 0x50U, true, id);
    }
    return 0;
  }
  case 5: /* PUBREC: the second step of a QoS 2 publish */
    return length >= 2U ? send_small(sock, 0x62U, true, (uint16_t)(((uint16_t)body[0] << 8) | body[1])) : -EPROTO;
  case 6: /* PUBREL */
    return length >= 2U ? send_small(sock, 0x70U, true, (uint16_t)(((uint16_t)body[0] << 8) | body[1])) : -EPROTO;
  case 9: { /* SUBACK */
    if (length < 3U) {
      return -EPROTO;
    }
    subscription_acknowledged((uint16_t)(((uint16_t)body[0] << 8) | body[1]), body[2] != 0x80U);
    return 0;
  }
  case 4:  /* PUBACK */
  case 7:  /* PUBCOMP */
  case 11: /* UNSUBACK */
  case 13: /* PINGRESP */
    return 0;
  default:
    return -EPROTO;
  }
}

/* Feed the bytes read from the stream to the packet reader; a whole packet is handled. */
static int feed(int sock, struct reader *r, const uint8_t *data, size_t length) {
  size_t i = 0U;

  while (i < length) {
    switch (r->state) {
    case 0:
      r->first = data[i++];
      r->multiplier = 1U;
      r->value = 0U;
      r->state = 1;
      break;
    case 1: {
      const uint8_t digit = data[i++];

      r->value += (uint32_t)(digit & 0x7FU) * r->multiplier;
      r->multiplier *= 128U;
      if ((digit & 0x80U) == 0U) {
        r->want = r->value;
        r->have = 0U;
        if (r->want > sizeof(r->body)) {
          r->skip = r->want;
          r->state = 3;
        } else if (r->want == 0U) {
          const int rc = handle_packet(sock, r->first, r->body, 0U);

          r->state = 0;
          if (rc != 0) {
            return rc;
          }
        } else {
          r->state = 2;
        }
      } else if (r->multiplier > 128U * 128U * 128U) {
        return -EPROTO;
      }
      break;
    }
    case 2: {
      const size_t room = r->want - r->have;
      const size_t take = MIN(room, length - i);

      memcpy(&r->body[r->have], &data[i], take);
      r->have += take;
      i += take;
      if (r->have == r->want) {
        const int rc = handle_packet(sock, r->first, r->body, r->want);

        r->state = 0;
        if (rc != 0) {
          return rc;
        }
      }
      break;
    }
    default: { /* 3: a packet that does not fit is read and dropped */
      const size_t take = MIN(r->skip, length - i);

      r->skip -= take;
      i += take;
      if (r->skip == 0U) {
        r->state = 0;
      }
      break;
    }
    }
  }
  return 0;
}

/* CONNECT and its CONNACK. */
static int handshake(int sock) {
  uint8_t buffer[4];
  size_t have = 0U;
  const int64_t deadline = k_uptime_get() + (int64_t)s_connect_timeout_ms;
  int rc = send_connect(sock);

  if (rc != 0) {
    return rc;
  }
  while (have < sizeof(buffer)) {
    struct pollfd fd = {.fd = sock, .events = POLLIN, .revents = 0};
    int64_t left = deadline - k_uptime_get();
    ssize_t n;

    rc = poll(&fd, 1, left > 0 ? (int)left : 0);
    if (rc == 0) {
      return -ETIMEDOUT;
    }
    if (rc < 0) {
      return -errno;
    }
    n = recv(sock, buffer + have, sizeof(buffer) - have, 0);
    if (n == 0) {
      return -ECONNRESET;
    }
    if (n < 0) {
      if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR) {
        continue;
      }
      return -errno;
    }
    have += (size_t)n;
  }
  if (buffer[0] != 0x20U || buffer[1] != 0x02U) {
    return -EPROTO;
  }
  /* the return codes: 4 bad credentials and 5 not authorised are a refusal of this client */
  switch (buffer[3]) {
  case 0:
    return 0;
  case 4:
  case 5:
    return -EACCES;
  default:
    return -EPROTO;
  }
}

static int session(int sock) {
  struct reader reader;
  int64_t last_rx = k_uptime_get();
  int64_t last_tx = last_rx;
  const int64_t keepalive_ms = (int64_t)s_keepalive_s * 1000;

  memset(&reader, 0, sizeof(reader));
  for (;;) {
    struct pollfd fd = {.fd = sock, .events = POLLIN, .revents = 0};
    uint8_t chunk[512];
    int64_t now;
    int rc;

    rc = send_due_subscriptions(sock);
    if (rc == 0) {
      rc = run_queued(sock);
    }
    if (rc != 0) {
      return rc;
    }

    rc = poll(&fd, 1, 20);
    if (rc < 0) {
      if (errno == EINTR) {
        continue;
      }
      return -errno;
    }
    if (rc > 0) {
      const ssize_t n = recv(sock, chunk, sizeof(chunk), 0);

      if (n == 0) {
        return -ECONNRESET;
      }
      if (n < 0) {
        if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
          return -errno;
        }
      } else {
        last_rx = k_uptime_get();
        rc = feed(sock, &reader, chunk, (size_t)n);
        if (rc != 0) {
          return rc;
        }
      }
    }

    now = k_uptime_get();
    if (now - last_rx >= keepalive_ms) {
      return -ETIMEDOUT; /* silence for a whole keep-alive interval: the session is lost */
    }
    if (now - last_tx >= keepalive_ms / 3) {
      rc = send_small(sock, 0xC0U, false, 0U);
      if (rc != 0) {
        return rc;
      }
      last_tx = now;
    }
  }
}

static void sleep_ms(uint32_t ms) {
  struct timespec span = {.tv_sec = (time_t)(ms / 1000U), .tv_nsec = (long)(ms % 1000U) * 1000000L};

  (void)nanosleep(&span, NULL);
}

static void client_thread(void *a, void *b, void *c) {
  uint32_t backoff = s_reconnect_initial_ms;

  (void)a;
  (void)b;
  (void)c;
  for (;;) {
    int rc;
    int sock;

    SET(s_phase, PHASE_CONNECTING);
    sock = zplc_host_tcp_connect(s_host, s_port, s_connect_timeout_ms);
    rc = sock >= 0 ? handshake(sock) : sock;
    if (rc == 0) {
      subscriptions_unsent();
      SET(s_last_error, 0);
      SET(s_connected, true);
      backoff = s_reconnect_initial_ms;
      LOG_INF("MQTT session up (%s:%u)", s_host, (unsigned)s_port);
      rc = session(sock);
      SET(s_connected, false);
    }
    if (sock >= 0) {
      (void)close(sock);
    }
    SET(s_last_error, rc);
    SET(s_phase, PHASE_DOWN);
    LOG_WRN("MQTT session down: %d", rc);
    fail_queued(rc);

    /* Wait for the next attempt, failing what the blocks queue meanwhile (the session is down). */
    for (uint32_t waited = 0U; waited < backoff; waited += 20U) {
      sleep_ms(20U);
      fail_queued(rc);
    }
    backoff = MIN(backoff * 2U, s_reconnect_max_ms);
  }
}

int zplc_host_mqtt_start(const zplc_host_mqtt_config_t *config) {
  if (config == NULL || config->host == NULL || config->host[0] == '\0') {
    return -EINVAL;
  }
  if (GET(s_started)) {
    return -EALREADY;
  }
  if (strlen(config->host) >= sizeof(s_host)) {
    return -ENAMETOOLONG;
  }
  (void)snprintf(s_host, sizeof(s_host), "%s", config->host);
  s_port = config->port != 0U ? config->port : 1883U;
  if (config->client_id != NULL && strlen(config->client_id) < sizeof(s_client_id)) {
    (void)snprintf(s_client_id, sizeof(s_client_id), "%s", config->client_id);
  } else {
    (void)snprintf(s_client_id, sizeof(s_client_id), "zplc-sim-%ld", (long)getpid());
  }
  s_keepalive_s = config->keepalive_s != 0U ? config->keepalive_s : ZPLC_HOST_MQTT_KEEPALIVE_S_DEFAULT;
  s_connect_timeout_ms = config->connect_timeout_ms != 0U ? config->connect_timeout_ms : ZPLC_HOST_MQTT_CONNECT_TIMEOUT_MS_DEFAULT;
  s_reconnect_initial_ms = config->reconnect_initial_ms != 0U ? config->reconnect_initial_ms : ZPLC_HOST_MQTT_RECONNECT_INITIAL_MS_DEFAULT;
  s_reconnect_max_ms = config->reconnect_max_ms != 0U ? config->reconnect_max_ms : ZPLC_HOST_MQTT_RECONNECT_MAX_MS_DEFAULT;
  if (s_reconnect_max_ms < s_reconnect_initial_ms) {
    s_reconnect_max_ms = s_reconnect_initial_ms;
  }

  k_msgq_init(&s_queue, (char *)s_queue_buffer, sizeof(void *), REQ_MAX);
  SET(s_phase, PHASE_CONNECTING);
  SET(s_connected, false);
  SET(s_started, true);
  if (k_thread_create(&s_thread, s_stack, K_THREAD_STACK_SIZEOF(s_stack), client_thread, NULL, NULL, NULL, 0, 0, 0) != 0) {
    SET(s_started, false);
    return -EAGAIN;
  }
  return 0;
}
