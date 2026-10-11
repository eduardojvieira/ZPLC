/*
 * The loopback endpoints of a simulation. See loopback_endpoints.h.
 *
 * SPDX-License-Identifier: MIT
 */
#define _POSIX_C_SOURCE 200809L /* NOLINT(bugprone-reserved-identifier,cert-dcl37-c,cert-dcl51-cpp): feature-test macro */

#include "loopback_endpoints.h"

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <poll.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

/* ---- shared plumbing -------------------------------------------------------------------------------------- */

static int64_t now_ms(void) {
  struct timespec now;

  (void)clock_gettime(CLOCK_MONOTONIC, &now);
  return (int64_t)now.tv_sec * 1000 + (int64_t)(now.tv_nsec / 1000000L);
}

static int listen_loopback(uint16_t port, uint16_t *bound) {
  struct sockaddr_in address;
  socklen_t length = sizeof(address);
  int one = 1;
  int sock = socket(AF_INET, SOCK_STREAM, 0);

  if (sock < 0) {
    return -1;
  }
  (void)setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_port = htons(port);
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(sock, (struct sockaddr *)&address, sizeof(address)) < 0 || listen(sock, 8) < 0 ||
      getsockname(sock, (struct sockaddr *)&address, &length) < 0) {
    (void)close(sock);
    return -1;
  }
  (void)fcntl(sock, F_SETFL, fcntl(sock, F_GETFL, 0) | O_NONBLOCK);
  if (bound != NULL) {
    *bound = ntohs(address.sin_port);
  }
  return sock;
}

static void send_whole(int sock, const uint8_t *data, size_t length) {
  size_t sent = 0U;
  int tries = 0;

  while (sent < length && tries < 200) {
    const ssize_t n = send(sock, data + sent, length - sent, 0);

    if (n > 0) {
      sent += (size_t)n;
    } else if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) {
      struct pollfd fd = {.fd = sock, .events = POLLOUT, .revents = 0};

      (void)poll(&fd, 1, 10);
      tries++;
    } else {
      return;
    }
  }
}

/* ---- Modbus TCP server ------------------------------------------------------------------------------------ */

#define MB_CLIENTS 8U
#define MB_BUFFER 300U

struct mb_client {
  int fd;
  uint8_t buffer[MB_BUFFER];
  size_t have;
  uint8_t response[MB_BUFFER];
  size_t response_length;
  int64_t due; /* when the pending response may be sent */
};

struct zplc_loopback_modbus {
  pthread_mutex_t lock;
  pthread_t thread;
  bool stop;
  int listener;
  struct mb_client clients[MB_CLIENTS];
  uint16_t registers[ZPLC_LOOPBACK_BANK];
  uint8_t coils[ZPLC_LOOPBACK_BANK];
  zplc_loopback_modbus_mode_t mode;
  uint32_t delay_ms;
  uint32_t requests;
};

static void put_be16(uint8_t *at, uint16_t value) {
  at[0] = (uint8_t)(value >> 8);
  at[1] = (uint8_t)value;
}

static uint16_t get_be16(const uint8_t *at) { return (uint16_t)(((uint16_t)at[0] << 8) | at[1]); }

static size_t exception(uint8_t function, uint8_t code, uint8_t *pdu) {
  pdu[0] = (uint8_t)(function | 0x80U);
  pdu[1] = code;
  return 2U;
}

/* The PDU of the answer to one request; the lock is held. */
static size_t modbus_answer(struct zplc_loopback_modbus *s, const uint8_t *request, size_t length,
                            uint8_t *pdu) {
  const uint8_t function = request[0];
  const uint16_t address = length >= 3U ? get_be16(&request[1]) : 0U;
  const uint16_t count = length >= 5U ? get_be16(&request[3]) : 0U;
  uint16_t i;

  if (s->mode == ZPLC_LOOPBACK_MODBUS_EXCEPTION) {
    return exception(function, 0x06U, pdu);
  }
  switch (function) {
  case 0x01:
    if (length != 5U || count == 0U || count > 2000U) {
      return exception(function, 0x03U, pdu);
    }
    if ((uint32_t)address + count > ZPLC_LOOPBACK_BANK) {
      return exception(function, 0x02U, pdu);
    }
    pdu[0] = function;
    pdu[1] = (uint8_t)((count + 7U) / 8U);
    memset(&pdu[2], 0, pdu[1]);
    for (i = 0U; i < count; i++) {
      if (s->coils[address + i] != 0U) {
        pdu[2U + i / 8U] |= (uint8_t)(1U << (i % 8U));
      }
    }
    return 2U + pdu[1];
  case 0x03:
    if (length != 5U || count == 0U || count > 125U) {
      return exception(function, 0x03U, pdu);
    }
    if ((uint32_t)address + count > ZPLC_LOOPBACK_BANK) {
      return exception(function, 0x02U, pdu);
    }
    pdu[0] = function;
    pdu[1] = (uint8_t)(count * 2U);
    for (i = 0U; i < count; i++) {
      put_be16(&pdu[2U + i * 2U], s->registers[address + i]);
    }
    return 2U + (size_t)count * 2U;
  case 0x05:
    if (length != 5U || (count != 0xFF00U && count != 0x0000U)) {
      return exception(function, 0x03U, pdu);
    }
    if (address >= ZPLC_LOOPBACK_BANK) {
      return exception(function, 0x02U, pdu);
    }
    s->coils[address] = count == 0xFF00U ? 1U : 0U;
    memcpy(pdu, request, 5U);
    return 5U;
  case 0x06:
    if (length != 5U) {
      return exception(function, 0x03U, pdu);
    }
    if (address >= ZPLC_LOOPBACK_BANK) {
      return exception(function, 0x02U, pdu);
    }
    s->registers[address] = count;
    memcpy(pdu, request, 5U);
    return 5U;
  case 0x10:
    if (length < 6U || count == 0U || count > 123U || request[5] != count * 2U || length != 6U + (size_t)count * 2U) {
      return exception(function, 0x03U, pdu);
    }
    if ((uint32_t)address + count > ZPLC_LOOPBACK_BANK) {
      return exception(function, 0x02U, pdu);
    }
    for (i = 0U; i < count; i++) {
      s->registers[address + i] = get_be16(&request[6U + i * 2U]);
    }
    memcpy(pdu, request, 5U);
    return 5U;
  default:
    return exception(function, 0x01U, pdu);
  }
}

/* One complete MBAP frame at the front of the client's buffer: answer it (or do what the mode says). */
static bool modbus_frame(struct zplc_loopback_modbus *s, struct mb_client *c) {
  size_t total;
  uint16_t length;
  uint8_t pdu[MB_BUFFER];
  size_t pdu_length;

  if (c->have < 7U) {
    return false;
  }
  length = get_be16(&c->buffer[4]);
  if (length < 2U || length > MB_BUFFER - 6U) {
    return false;
  }
  total = 6U + (size_t)length;
  if (c->have < total) {
    return false;
  }
  s->requests++;
  switch (s->mode) {
  case ZPLC_LOOPBACK_MODBUS_SILENT:
    break;
  case ZPLC_LOOPBACK_MODBUS_CLOSE:
    (void)close(c->fd);
    c->fd = -1;
    return false;
  default:
    pdu_length = modbus_answer(s, &c->buffer[7], (size_t)length - 1U, pdu);
    memcpy(c->response, c->buffer, 4U); /* transaction and protocol identifiers */
    put_be16(&c->response[4], (uint16_t)(pdu_length + 1U));
    c->response[6] = c->buffer[6]; /* the unit */
    memcpy(&c->response[7], pdu, pdu_length);
    c->response_length = 7U + pdu_length;
    c->due = now_ms() + (s->mode == ZPLC_LOOPBACK_MODBUS_SLOW ? (int64_t)s->delay_ms : 0);
    break;
  }
  memmove(c->buffer, &c->buffer[total], c->have - total);
  c->have -= total;
  return true;
}

static void *modbus_thread(void *argument) {
  struct zplc_loopback_modbus *s = argument;

  while (!__atomic_load_n(&s->stop, __ATOMIC_ACQUIRE)) {
    struct pollfd fds[MB_CLIENTS + 1U];
    size_t index[MB_CLIENTS + 1U];
    size_t count = 0U;
    size_t i;

    pthread_mutex_lock(&s->lock);
    fds[count].fd = s->listener;
    fds[count].events = POLLIN;
    index[count++] = MB_CLIENTS;
    for (i = 0U; i < MB_CLIENTS; i++) {
      if (s->clients[i].fd >= 0) {
        fds[count].fd = s->clients[i].fd;
        fds[count].events = POLLIN;
        index[count++] = i;
      }
    }
    pthread_mutex_unlock(&s->lock);

    (void)poll(fds, (nfds_t)count, 10);

    pthread_mutex_lock(&s->lock);
    for (i = 0U; i < count; i++) {
      if (index[i] == MB_CLIENTS) {
        if ((fds[i].revents & POLLIN) != 0) {
          const int fd = accept(s->listener, NULL, NULL);

          if (fd >= 0) {
            size_t slot;

            for (slot = 0U; slot < MB_CLIENTS && s->clients[slot].fd >= 0; slot++) {
            }
            if (slot == MB_CLIENTS) {
              (void)close(fd);
            } else {
              memset(&s->clients[slot], 0, sizeof(s->clients[slot]));
              s->clients[slot].fd = fd;
            }
          }
        }
        continue;
      }
      if ((fds[i].revents & (POLLIN | POLLHUP | POLLERR)) != 0) {
        struct mb_client *c = &s->clients[index[i]];
        const ssize_t n = c->fd >= 0 ? recv(c->fd, c->buffer + c->have, sizeof(c->buffer) - c->have, 0) : 0;

        if (n <= 0 && !(n < 0 && (errno == EAGAIN || errno == EINTR))) {
          if (c->fd >= 0) {
            (void)close(c->fd);
          }
          c->fd = -1;
        } else if (n > 0) {
          c->have += (size_t)n;
          while (c->fd >= 0 && modbus_frame(s, c)) {
          }
        }
      }
    }
    /* answers that are due */
    for (i = 0U; i < MB_CLIENTS; i++) {
      struct mb_client *c = &s->clients[i];

      if (c->fd >= 0 && c->response_length != 0U && now_ms() >= c->due) {
        send_whole(c->fd, c->response, c->response_length);
        c->response_length = 0U;
      }
    }
    pthread_mutex_unlock(&s->lock);
  }
  return NULL;
}

zplc_loopback_modbus_t *zplc_loopback_modbus_start(uint16_t port, uint16_t *bound) {
  struct zplc_loopback_modbus *s = calloc(1U, sizeof(*s));
  size_t i;

  if (s == NULL) {
    return NULL;
  }
  s->listener = listen_loopback(port, bound);
  if (s->listener < 0) {
    free(s);
    return NULL;
  }
  for (i = 0U; i < MB_CLIENTS; i++) {
    s->clients[i].fd = -1;
  }
  pthread_mutex_init(&s->lock, NULL);
  if (pthread_create(&s->thread, NULL, modbus_thread, s) != 0) {
    (void)close(s->listener);
    free(s);
    return NULL;
  }
  return s;
}

void zplc_loopback_modbus_stop(zplc_loopback_modbus_t *s) {
  size_t i;

  if (s == NULL) {
    return;
  }
  __atomic_store_n(&s->stop, true, __ATOMIC_RELEASE);
  (void)pthread_join(s->thread, NULL);
  for (i = 0U; i < MB_CLIENTS; i++) {
    if (s->clients[i].fd >= 0) {
      (void)close(s->clients[i].fd);
    }
  }
  (void)close(s->listener);
  pthread_mutex_destroy(&s->lock);
  free(s);
}

void zplc_loopback_modbus_set_mode(zplc_loopback_modbus_t *s, zplc_loopback_modbus_mode_t mode) {
  pthread_mutex_lock(&s->lock);
  s->mode = mode;
  pthread_mutex_unlock(&s->lock);
}

void zplc_loopback_modbus_set_delay_ms(zplc_loopback_modbus_t *s, uint32_t delay_ms) {
  pthread_mutex_lock(&s->lock);
  s->delay_ms = delay_ms;
  pthread_mutex_unlock(&s->lock);
}

uint16_t zplc_loopback_modbus_register(zplc_loopback_modbus_t *s, uint16_t address) {
  uint16_t value;

  pthread_mutex_lock(&s->lock);
  value = address < ZPLC_LOOPBACK_BANK ? s->registers[address] : 0U;
  pthread_mutex_unlock(&s->lock);
  return value;
}

void zplc_loopback_modbus_set_register(zplc_loopback_modbus_t *s, uint16_t address, uint16_t value) {
  pthread_mutex_lock(&s->lock);
  if (address < ZPLC_LOOPBACK_BANK) {
    s->registers[address] = value;
  }
  pthread_mutex_unlock(&s->lock);
}

bool zplc_loopback_modbus_coil(zplc_loopback_modbus_t *s, uint16_t address) {
  bool value;

  pthread_mutex_lock(&s->lock);
  value = address < ZPLC_LOOPBACK_BANK && s->coils[address] != 0U;
  pthread_mutex_unlock(&s->lock);
  return value;
}

void zplc_loopback_modbus_set_coil(zplc_loopback_modbus_t *s, uint16_t address, bool value) {
  pthread_mutex_lock(&s->lock);
  if (address < ZPLC_LOOPBACK_BANK) {
    s->coils[address] = value ? 1U : 0U;
  }
  pthread_mutex_unlock(&s->lock);
}

uint32_t zplc_loopback_modbus_requests(zplc_loopback_modbus_t *s) {
  uint32_t value;

  pthread_mutex_lock(&s->lock);
  value = s->requests;
  pthread_mutex_unlock(&s->lock);
  return value;
}

/* ---- MQTT 3.1.1 broker ------------------------------------------------------------------------------------ */

#define MQ_CLIENTS 8U
#define MQ_FILTERS 8U
#define MQ_RETAINED 16U
#define MQ_TEXT 128U
#define MQ_BUFFER 1024U

struct mq_filter {
  char filter[MQ_TEXT];
  bool used;
};

struct mq_client {
  int fd;
  bool session;
  uint8_t buffer[MQ_BUFFER];
  size_t have;
  struct mq_filter filters[MQ_FILTERS];
};

struct mq_retained {
  bool used;
  char topic[MQ_TEXT];
  uint8_t payload[MQ_TEXT];
  size_t length;
};

struct zplc_loopback_mqtt {
  pthread_mutex_t lock;
  pthread_t thread;
  bool stop;
  int listener;
  bool silent;
  struct mq_client clients[MQ_CLIENTS];
  struct mq_retained retained[MQ_RETAINED];
  uint32_t publishes;
  bool have_last;
  char last_topic[MQ_TEXT];
  uint8_t last_payload[MQ_TEXT];
  size_t last_length;
  uint8_t last_qos;
  bool last_retain;
};

static bool mq_matches(const char *filter, const char *topic) {
  while (*filter != '\0') {
    if (*filter == '#') {
      return true;
    }
    if (*filter == '+') {
      while (*topic != '\0' && *topic != '/') {
        topic++;
      }
      filter++;
      if (*filter == '\0') {
        return *topic == '\0';
      }
      if (*filter != '/' || *topic != '/') {
        return false;
      }
      filter++;
      topic++;
      continue;
    }
    if (*filter != *topic) {
      return false;
    }
    filter++;
    topic++;
  }
  return *topic == '\0';
}

/* A PUBLISH of QoS 0 to one client. */
static void mq_send_publish(struct mq_client *c, const char *topic, const uint8_t *payload, size_t length,
                            bool retain) {
  uint8_t wire[MQ_BUFFER + 8U];
  const size_t topic_len = strlen(topic);
  const size_t body = 2U + topic_len + length;
  size_t at = 0U;
  size_t remaining = body;

  if (body > 16000U || 5U + body > sizeof(wire)) {
    return;
  }
  wire[at++] = (uint8_t)(0x30U | (retain ? 1U : 0U));
  do {
    uint8_t digit = (uint8_t)(remaining % 128U);

    remaining /= 128U;
    wire[at++] = remaining != 0U ? (uint8_t)(digit | 0x80U) : digit;
  } while (remaining != 0U);
  put_be16(&wire[at], (uint16_t)topic_len);
  at += 2U;
  memcpy(&wire[at], topic, topic_len); /* NOLINT(bugprone-not-null-terminated-result): a packet, not a string */
  at += topic_len;
  if (length != 0U) {
    memcpy(&wire[at], payload, length);
  }
  at += length;
  send_whole(c->fd, wire, at);
}

static void mq_route(struct zplc_loopback_mqtt *b, const char *topic, const uint8_t *payload, size_t length) {
  size_t i, f;

  for (i = 0U; i < MQ_CLIENTS; i++) {
    struct mq_client *c = &b->clients[i];

    if (c->fd < 0 || !c->session) {
      continue;
    }
    for (f = 0U; f < MQ_FILTERS; f++) {
      if (c->filters[f].used && mq_matches(c->filters[f].filter, topic)) {
        mq_send_publish(c, topic, payload, length, false);
        break;
      }
    }
  }
}

static void mq_keep_retained(struct zplc_loopback_mqtt *b, const char *topic, const uint8_t *payload,
                             size_t length) {
  struct mq_retained *slot = NULL;
  size_t i;

  for (i = 0U; i < MQ_RETAINED; i++) {
    if (b->retained[i].used && strcmp(b->retained[i].topic, topic) == 0) {
      slot = &b->retained[i];
      break;
    }
  }
  if (slot == NULL) {
    for (i = 0U; i < MQ_RETAINED; i++) {
      if (!b->retained[i].used) {
        slot = &b->retained[i];
        break;
      }
    }
  }
  if (slot == NULL) {
    return;
  }
  if (length == 0U) {
    slot->used = false; /* an empty retained message clears it */
    return;
  }
  slot->used = true;
  (void)snprintf(slot->topic, sizeof(slot->topic), "%s", topic);
  slot->length = length < sizeof(slot->payload) ? length : sizeof(slot->payload);
  memcpy(slot->payload, payload, slot->length);
}

static void mq_close(struct mq_client *c) {
  if (c->fd >= 0) {
    (void)close(c->fd);
  }
  memset(c, 0, sizeof(*c));
  c->fd = -1;
}

/* One complete packet at the front of the client's buffer; its size, or 0 when it is not whole yet. */
static size_t mq_packet(struct zplc_loopback_mqtt *b, struct mq_client *c) {
  const uint8_t first = c->buffer[0];
  size_t at = 1U;
  size_t length = 0U;
  size_t multiplier = 1U;
  const uint8_t *body;
  uint8_t digit;

  if (c->have < 2U) {
    return 0U;
  }
  do {
    if (at >= c->have) {
      return 0U;
    }
    digit = c->buffer[at++];
    length += (size_t)(digit & 0x7FU) * multiplier;
    multiplier *= 128U;
  } while ((digit & 0x80U) != 0U && at < 5U);
  if (length > sizeof(c->buffer) - at) {
    mq_close(c); /* larger than this double takes */
    return 0U;
  }
  if (c->have < at + length) {
    return 0U;
  }
  body = &c->buffer[at];

  switch (first >> 4) {
  case 1: { /* CONNECT */
    static const uint8_t connack[4] = {0x20U, 0x02U, 0x00U, 0x00U};

    c->session = true;
    send_whole(c->fd, connack, sizeof(connack));
    break;
  }
  case 3: { /* PUBLISH */
    const uint8_t qos = (uint8_t)((first >> 1) & 3U);
    const bool retain = (first & 1U) != 0U;
    size_t topic_len;
    size_t offset;
    uint16_t id = 0U;
    char topic[MQ_TEXT];

    if (length < 2U) {
      mq_close(c);
      return 0U;
    }
    topic_len = get_be16(body);
    offset = 2U + topic_len;
    if (offset > length || topic_len >= sizeof(topic)) {
      mq_close(c);
      return 0U;
    }
    memcpy(topic, &body[2], topic_len);
    topic[topic_len] = '\0';
    if (qos != 0U) {
      if (offset + 2U > length) {
        mq_close(c);
        return 0U;
      }
      id = get_be16(&body[offset]);
      offset += 2U;
    }
    b->publishes++;
    b->have_last = true;
    (void)snprintf(b->last_topic, sizeof(b->last_topic), "%s", topic);
    b->last_length = length - offset < sizeof(b->last_payload) ? length - offset : sizeof(b->last_payload);
    memcpy(b->last_payload, &body[offset], b->last_length);
    b->last_qos = qos;
    b->last_retain = retain;
    if (retain) {
      mq_keep_retained(b, topic, &body[offset], length - offset);
    }
    mq_route(b, topic, &body[offset], length - offset);
    if (qos == 1U || qos == 2U) {
      uint8_t ack[4] = {(uint8_t)(qos == 1U ? 0x40U : 0x50U), 0x02U, 0U, 0U};

      put_be16(&ack[2], id);
      send_whole(c->fd, ack, sizeof(ack));
    }
    break;
  }
  case 6: { /* PUBREL */
    uint8_t comp[4] = {0x70U, 0x02U, 0U, 0U};

    if (length >= 2U) {
      memcpy(&comp[2], body, 2U);
      send_whole(c->fd, comp, sizeof(comp));
    }
    break;
  }
  case 8: { /* SUBSCRIBE */
    uint8_t suback[16];
    size_t offset = 2U;
    size_t granted = 0U;

    if (length < 2U) {
      mq_close(c);
      return 0U;
    }
    suback[0] = 0x90U;
    memcpy(&suback[2], body, 2U);
    while (offset + 3U <= length && granted < 8U) {
      const size_t filter_len = get_be16(&body[offset]);
      const uint8_t qos = body[offset + 2U + filter_len < length ? offset + 2U + filter_len : 0U];
      char filter[MQ_TEXT];
      size_t f;
      size_t r;

      if (offset + 2U + filter_len + 1U > length || filter_len >= sizeof(filter)) {
        break;
      }
      memcpy(filter, &body[offset + 2U], filter_len);
      filter[filter_len] = '\0';
      for (f = 0U; f < MQ_FILTERS; f++) {
        if (c->filters[f].used && strcmp(c->filters[f].filter, filter) == 0) {
          break;
        }
      }
      if (f == MQ_FILTERS) {
        for (f = 0U; f < MQ_FILTERS && c->filters[f].used; f++) {
        }
      }
      if (f == MQ_FILTERS) {
        suback[4U + granted++] = 0x80U; /* no room: refused */
      } else {
        c->filters[f].used = true;
        (void)snprintf(c->filters[f].filter, sizeof(c->filters[f].filter), "%s", filter);
        suback[4U + granted++] = qos <= 2U ? 0x00U : 0x80U; /* granted at QoS 0: publishes are delivered so */
        for (r = 0U; r < MQ_RETAINED; r++) {
          if (b->retained[r].used && mq_matches(filter, b->retained[r].topic)) {
            mq_send_publish(c, b->retained[r].topic, b->retained[r].payload, b->retained[r].length, true);
          }
        }
      }
      offset += 3U + filter_len;
    }
    suback[1] = (uint8_t)(2U + granted);
    send_whole(c->fd, suback, 4U + granted);
    break;
  }
  case 12: { /* PINGREQ */
    static const uint8_t pingresp[2] = {0xD0U, 0x00U};

    send_whole(c->fd, pingresp, sizeof(pingresp));
    break;
  }
  case 14: /* DISCONNECT */
    mq_close(c);
    return 0U;
  default:
    break;
  }
  return at + length;
}

static void *mqtt_thread(void *argument) {
  struct zplc_loopback_mqtt *b = argument;

  while (!__atomic_load_n(&b->stop, __ATOMIC_ACQUIRE)) {
    struct pollfd fds[MQ_CLIENTS + 1U];
    size_t index[MQ_CLIENTS + 1U];
    size_t count = 0U;
    size_t i;

    pthread_mutex_lock(&b->lock);
    fds[count].fd = b->listener;
    fds[count].events = POLLIN;
    index[count++] = MQ_CLIENTS;
    for (i = 0U; i < MQ_CLIENTS; i++) {
      if (b->clients[i].fd >= 0) {
        fds[count].fd = b->clients[i].fd;
        fds[count].events = POLLIN;
        index[count++] = i;
      }
    }
    pthread_mutex_unlock(&b->lock);

    (void)poll(fds, (nfds_t)count, 10);

    pthread_mutex_lock(&b->lock);
    for (i = 0U; i < count; i++) {
      if (index[i] == MQ_CLIENTS) {
        if ((fds[i].revents & POLLIN) != 0) {
          const int fd = accept(b->listener, NULL, NULL);

          if (fd >= 0) {
            size_t slot;

            for (slot = 0U; slot < MQ_CLIENTS && b->clients[slot].fd >= 0; slot++) {
            }
            if (slot == MQ_CLIENTS) {
              (void)close(fd);
            } else {
              memset(&b->clients[slot], 0, sizeof(b->clients[slot]));
              b->clients[slot].fd = fd;
            }
          }
        }
        continue;
      }
      if ((fds[i].revents & (POLLIN | POLLHUP | POLLERR)) != 0) {
        struct mq_client *c = &b->clients[index[i]];
        ssize_t n;

        if (c->fd < 0) {
          continue;
        }
        n = recv(c->fd, c->buffer + c->have, sizeof(c->buffer) - c->have, 0);
        if (n == 0 || (n < 0 && errno != EAGAIN && errno != EINTR)) {
          mq_close(c);
        } else if (n > 0 && !b->silent) {
          size_t used;

          c->have += (size_t)n;
          while (c->fd >= 0 && c->have > 0U && (used = mq_packet(b, c)) != 0U) {
            memmove(c->buffer, &c->buffer[used], c->have - used);
            c->have -= used;
          }
        }
      }
    }
    pthread_mutex_unlock(&b->lock);
  }
  return NULL;
}

zplc_loopback_mqtt_t *zplc_loopback_mqtt_start(uint16_t port, uint16_t *bound) {
  struct zplc_loopback_mqtt *b = calloc(1U, sizeof(*b));
  size_t i;

  if (b == NULL) {
    return NULL;
  }
  b->listener = listen_loopback(port, bound);
  if (b->listener < 0) {
    free(b);
    return NULL;
  }
  for (i = 0U; i < MQ_CLIENTS; i++) {
    b->clients[i].fd = -1;
  }
  pthread_mutex_init(&b->lock, NULL);
  if (pthread_create(&b->thread, NULL, mqtt_thread, b) != 0) {
    (void)close(b->listener);
    free(b);
    return NULL;
  }
  return b;
}

void zplc_loopback_mqtt_stop(zplc_loopback_mqtt_t *b) {
  size_t i;

  if (b == NULL) {
    return;
  }
  __atomic_store_n(&b->stop, true, __ATOMIC_RELEASE);
  (void)pthread_join(b->thread, NULL);
  for (i = 0U; i < MQ_CLIENTS; i++) {
    if (b->clients[i].fd >= 0) {
      (void)close(b->clients[i].fd);
    }
  }
  (void)close(b->listener);
  pthread_mutex_destroy(&b->lock);
  free(b);
}

void zplc_loopback_mqtt_drop_clients(zplc_loopback_mqtt_t *b) {
  size_t i;

  pthread_mutex_lock(&b->lock);
  for (i = 0U; i < MQ_CLIENTS; i++) {
    mq_close(&b->clients[i]);
  }
  pthread_mutex_unlock(&b->lock);
}

void zplc_loopback_mqtt_set_silent(zplc_loopback_mqtt_t *b, bool silent) {
  pthread_mutex_lock(&b->lock);
  b->silent = silent;
  pthread_mutex_unlock(&b->lock);
}

uint32_t zplc_loopback_mqtt_clients(zplc_loopback_mqtt_t *b) {
  uint32_t count = 0U;
  size_t i;

  pthread_mutex_lock(&b->lock);
  for (i = 0U; i < MQ_CLIENTS; i++) {
    if (b->clients[i].fd >= 0 && b->clients[i].session) {
      count++;
    }
  }
  pthread_mutex_unlock(&b->lock);
  return count;
}

uint32_t zplc_loopback_mqtt_subscriptions(zplc_loopback_mqtt_t *b) {
  uint32_t count = 0U;
  size_t i, f;

  pthread_mutex_lock(&b->lock);
  for (i = 0U; i < MQ_CLIENTS; i++) {
    if (b->clients[i].fd < 0) {
      continue;
    }
    for (f = 0U; f < MQ_FILTERS; f++) {
      if (b->clients[i].filters[f].used) {
        count++;
      }
    }
  }
  pthread_mutex_unlock(&b->lock);
  return count;
}

uint32_t zplc_loopback_mqtt_publishes(zplc_loopback_mqtt_t *b) {
  uint32_t count;

  pthread_mutex_lock(&b->lock);
  count = b->publishes;
  pthread_mutex_unlock(&b->lock);
  return count;
}

bool zplc_loopback_mqtt_last_publish(zplc_loopback_mqtt_t *b, char *topic, size_t topic_capacity,
                                     uint8_t *payload, size_t payload_capacity, size_t *payload_length,
                                     uint8_t *qos, bool *retain) {
  bool have;

  pthread_mutex_lock(&b->lock);
  have = b->have_last;
  if (have) {
    const size_t kept = b->last_length < payload_capacity ? b->last_length : payload_capacity;

    if (topic != NULL && topic_capacity != 0U) {
      (void)snprintf(topic, topic_capacity, "%s", b->last_topic);
    }
    if (payload != NULL) {
      memcpy(payload, b->last_payload, kept);
    }
    if (payload_length != NULL) {
      *payload_length = kept;
    }
    if (qos != NULL) {
      *qos = b->last_qos;
    }
    if (retain != NULL) {
      *retain = b->last_retain;
    }
  }
  pthread_mutex_unlock(&b->lock);
  return have;
}

void zplc_loopback_mqtt_inject(zplc_loopback_mqtt_t *b, const char *topic, const uint8_t *payload,
                               size_t length) {
  pthread_mutex_lock(&b->lock);
  mq_route(b, topic, payload, length);
  pthread_mutex_unlock(&b->lock);
}
