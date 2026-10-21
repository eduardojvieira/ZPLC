/**
 * @file zplc_proto_dev.c
 * @brief The device side of the device link protocol. See zplc_proto_dev.h for the rules.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_proto_dev.h"

#include <string.h>

#include "zplc_bytes.h"
#include "zplc_core.h"
#include "zplc_crc32.h"
#include "zplc_mem_extent.h"

#define LABEL_SESSION_KEY "ZPLC-LINK-SK1"

/* ------------------------------------------------------------------------------------------------------------- */
/* The table of requests, from the definition                                                                    */
/* ------------------------------------------------------------------------------------------------------------- */

typedef struct {
  uint8_t id;
  uint8_t access;
  uint16_t fixed;
  uint8_t tail;
} request_spec_t;

#define X_SPEC(name, id, access, fixed, tail) {(uint8_t)(id), (uint8_t)(access), (uint16_t)(fixed), (uint8_t)(tail)},
static const request_spec_t SPECS[] = {ZPLC_PROTO_MESSAGE_TABLE(X_SPEC)};
#undef X_SPEC

static const request_spec_t *spec_of(uint8_t id) {
  size_t i;

  for (i = 0U; i < sizeof(SPECS) / sizeof(SPECS[0]); i++) {
    if (SPECS[i].id == id) {
      return &SPECS[i];
    }
  }
  return NULL;
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Small helpers                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------- */

static uint32_t now_ms(const zplc_proto_dev_t *dev) { return dev->ops->now_ms(dev->ops->context); }

static uint32_t elapsed_ms(uint32_t now, uint32_t then) { return now - then; }

/** The response body starts after the header and the status byte. */
static uint8_t *body_of(zplc_proto_dev_t *dev) { return dev->tx + ZPLC_PROTO_HEADER_BYTES + 1U; }

static size_t body_capacity(const zplc_proto_link_t *link) { return link->payload_max - 1U; }

static void put_text(uint8_t *out, size_t size, const char *text) {
  size_t length = text == NULL ? 0U : strlen(text);
  size_t i;

  (void)memset(out, 0, size);
  if (length > size) {
    length = size;
  }
  for (i = 0U; i < length; i++) {
    out[i] = (uint8_t)text[i];
  }
}

static int ops_error(int result) {
  /* A port returns 0 or a ZPLC_PROTO_ERR_* number; anything else is a failure. */
  if (result == 0) {
    return 0;
  }
  if (result > 0 && result < 64) {
    return result;
  }
  return (int)ZPLC_PROTO_ERR_FAILED;
}

static int capability_bit(const zplc_proto_ops_t *ops, uint32_t bit) {
  switch (bit) {
  case ZPLC_PROTO_CAP_MEMORY:
    return ops->mem_read != NULL && ops->mem_write != NULL;
  case ZPLC_PROTO_CAP_FORCE:
    return ops->force_set != NULL && ops->force_clear != NULL && ops->force_clear_all != NULL && ops->force_get != NULL;
  case ZPLC_PROTO_CAP_RUN_CONTROL:
    return ops->run != NULL && ops->stop != NULL;
  case ZPLC_PROTO_CAP_BREAKPOINTS:
    return ops->bp_add != NULL && ops->bp_remove != NULL && ops->bp_clear != NULL && ops->bp_list != NULL;
  case ZPLC_PROTO_CAP_PROGRAM:
    return ops->program_begin != NULL && ops->program_chunk != NULL && ops->program_commit != NULL && ops->program_abort != NULL &&
           ops->program_info != NULL;
  case ZPLC_PROTO_CAP_WATCH:
    return ops->mem_read != NULL;
  case ZPLC_PROTO_CAP_AUTH:
    return ops->random != NULL && ops->key_load != NULL && ops->key_store != NULL && ops->key_erase != NULL;
  case ZPLC_PROTO_CAP_SIGNATURE:
    return ops->signing_key_load != NULL && ops->signing_key_store != NULL && ops->signing_key_erase != NULL && ops->program_verify != NULL;
  case ZPLC_PROTO_CAP_CONFIG:
    return ops->config_set != NULL && ops->config_save != NULL && ops->config_reset != NULL;
  case ZPLC_PROTO_CAP_CREDENTIALS:
    return ops->cred_begin != NULL && ops->cred_chunk != NULL && ops->cred_commit != NULL && ops->cred_erase != NULL;
  default:
    return 1;
  }
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Memory regions: the rule of the core (zplc_mem_extent_locate), with the policy of the link on top             */
/* ------------------------------------------------------------------------------------------------------------- */

typedef enum { ACCESS_READ = 0, ACCESS_WRITE = 1, ACCESS_FORCE = 2 } access_kind_t;

static void region_of(uint32_t address, uint16_t *start, uint16_t *end) {
  static const uint32_t bases[4] = {ZPLC_MEM_IPI_BASE, ZPLC_MEM_OPI_BASE, ZPLC_MEM_WORK_BASE, ZPLC_MEM_RETAIN_BASE};
  static const uint32_t sizes[4] = {ZPLC_MEM_IPI_SIZE, ZPLC_MEM_OPI_SIZE, ZPLC_MEM_WORK_SIZE, ZPLC_MEM_RETAIN_SIZE};
  static const uint32_t ends[4] = {ZPLC_MEM_OPI_BASE, ZPLC_MEM_WORK_BASE, ZPLC_MEM_RETAIN_BASE, ZPLC_MEM_CODE_BASE};
  uint32_t r;

  for (r = 0U; r < 4U; r++) {
    uint32_t size = sizes[r];

    if (size > ends[r] - bases[r]) {
      size = ends[r] - bases[r];
    }
    if (address >= bases[r] && address - bases[r] < size) {
      *start = (uint16_t)bases[r];
      *end = (uint16_t)(bases[r] + size);
      return;
    }
  }
  *start = 0xFFFFU;
  *end = 0xFFFFU;
}

/** 0 when the access is valid, ERR_RANGE otherwise; region_start and region_end describe where the address is. */
static int check_access(uint32_t address, uint32_t length, access_kind_t kind, uint16_t *region_start, uint16_t *region_end) {
  const int region = zplc_mem_extent_locate(address, length, NULL);

  region_of(address, region_start, region_end);
  if (region < 0) {
    return (int)ZPLC_PROTO_ERR_RANGE;
  }
  if (kind == ACCESS_WRITE && region == ZPLC_MEM_REGION_OPI) {
    return (int)ZPLC_PROTO_ERR_RANGE; /* the scan writes the outputs; a force is the way to hold one */
  }
  return 0;
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Sending                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------- */

/** Seal the frame whose payload (length bytes) is at dev->tx + HEADER, and hand it to the link. */
static void send_sealed(zplc_proto_link_t *link, uint8_t kind, uint8_t message, uint32_t sequence, size_t length, int authenticated) {
  zplc_proto_dev_t *dev = link->dev;
  uint8_t mac[ZPLC_SHA256_DIGEST_BYTES];
  size_t used;
  size_t total;

  used = zplc_proto_write_header(dev->tx, kind, message, sequence, (uint16_t)length, authenticated);
  used += length;
  if (authenticated != 0) {
    zplc_hmac_sha256(dev->session_key, ZPLC_PROTO_KEY_BYTES, dev->tx, used, mac);
    total = zplc_proto_finish(dev->tx, used, mac);
    zplc_secure_zero(mac, sizeof(mac));
  } else {
    total = zplc_proto_finish(dev->tx, used, NULL);
  }
  if (link->write != NULL && link->write(link->write_context, dev->tx, total) == 0) {
    link->stats.frames_out++;
  }
}

/** The response to a request: the body (body_length bytes) is already at body_of(dev). */
static void respond(zplc_proto_link_t *link, const zplc_proto_frame_t *request, uint8_t status, size_t body_length) {
  zplc_proto_dev_t *dev = link->dev;
  const int authenticated =
      dev->session_open != 0U && dev->owner == link && dev->session_authenticated != 0U && request->authenticated != 0U;

  dev->tx[ZPLC_PROTO_HEADER_BYTES] = status;
  send_sealed(link, ZPLC_PROTO_KIND_RESPONSE, request->message, request->sequence, 1U + body_length, authenticated);
}

static void respond_error(zplc_proto_link_t *link, const zplc_proto_frame_t *request, int status) {
  respond(link, request, (uint8_t)status, 0U);
}

static void respond_range(zplc_proto_link_t *link, const zplc_proto_frame_t *request, uint32_t address, uint32_t length,
                          uint16_t region_start, uint16_t region_end) {
  uint8_t *body = body_of(link->dev);

  zplc_put_u16_le(body + 0U, (uint16_t)address);
  zplc_put_u16_le(body + 2U, (uint16_t)length);
  zplc_put_u16_le(body + 4U, region_start);
  zplc_put_u16_le(body + 6U, region_end);
  respond(link, request, (uint8_t)ZPLC_PROTO_ERR_RANGE, ZPLC_PROTO_RANGE_DETAIL_BYTES);
}

static void send_event(zplc_proto_link_t *link, uint8_t id, const uint8_t *data, size_t length) {
  zplc_proto_dev_t *dev = link->dev;
  const int authenticated = dev->session_open != 0U && dev->owner == link && dev->session_authenticated != 0U;

  if (length != 0U) {
    (void)memcpy(dev->tx + ZPLC_PROTO_HEADER_BYTES, data, length);
  }
  link->event_seq++;
  send_sealed(link, ZPLC_PROTO_KIND_EVENT, id, link->event_seq, length, authenticated);
  link->stats.events_sent++;
}

/* ------------------------------------------------------------------------------------------------------------- */
/* The event queue                                                                                               */
/* ------------------------------------------------------------------------------------------------------------- */

static int queue_lock(zplc_proto_dev_t *dev) { return dev->ops->event_lock == NULL || dev->ops->event_lock(dev->ops->context) == 0; }

static void queue_unlock(zplc_proto_dev_t *dev) {
  if (dev->ops->event_unlock != NULL) {
    dev->ops->event_unlock(dev->ops->context);
  }
}

/* The queue is touched with the lock held (or by the one thread that owns the engine). */
static int queue_push_locked(zplc_proto_dev_t *dev, uint8_t id, const uint8_t *data, size_t length) {
  zplc_proto_event_t *slot;

  if (length > ZPLC_PROTO_EVENT_PAYLOAD_MAX) {
    length = ZPLC_PROTO_EVENT_PAYLOAD_MAX;
  }
  if (dev->queue_count >= ZPLC_PROTO_EVENT_QUEUE) {
    dev->dropped_since_report++;
    return -1;
  }
  slot = &dev->queue[(dev->queue_head + dev->queue_count) % ZPLC_PROTO_EVENT_QUEUE];
  slot->id = id;
  slot->length = (uint8_t)length;
  if (length != 0U) {
    (void)memcpy(slot->data, data, length);
  }
  dev->queue_count++;
  return 0;
}

int zplc_proto_event_post(zplc_proto_dev_t *dev, uint8_t id, const uint8_t *data, size_t length) {
  int result;

  if (!queue_lock(dev)) {
    /* The consumer holds the lock: count the loss without it (a lost count is better than a wait). */
    dev->dropped_since_report++;
    return -1;
  }
  result = queue_push_locked(dev, id, data, length);
  queue_unlock(dev);
  return result;
}

void zplc_proto_log(zplc_proto_dev_t *dev, uint8_t level, const char *text) {
  uint8_t data[ZPLC_PROTO_EVENT_PAYLOAD_MAX];
  size_t length = text == NULL ? 0U : strlen(text);
  size_t i;

  if (length > sizeof(data) - 1U) {
    length = sizeof(data) - 1U;
  }
  data[0] = level;
  for (i = 0U; i < length; i++) {
    data[1U + i] = (uint8_t)text[i];
  }
  (void)zplc_proto_event_post(dev, ZPLC_PROTO_EVT_LOG, data, 1U + length);
}

static uint32_t mask_of(uint8_t id) {
  switch (id) {
  case ZPLC_PROTO_EVT_STATUS:
    return ZPLC_PROTO_EVT_STATUS_MASK;
  case ZPLC_PROTO_EVT_FAULT:
    return ZPLC_PROTO_EVT_FAULT_MASK;
  case ZPLC_PROTO_EVT_BREAKPOINT:
    return ZPLC_PROTO_EVT_BREAKPOINT_MASK;
  case ZPLC_PROTO_EVT_FORCE:
    return ZPLC_PROTO_EVT_FORCE_MASK;
  case ZPLC_PROTO_EVT_LOG:
    return ZPLC_PROTO_EVT_LOG_MASK;
  case ZPLC_PROTO_EVT_WATCH:
    return ZPLC_PROTO_EVT_WATCH_MASK;
  default:
    return 0U;
  }
}

static uint32_t all_event_bits(void) {
  return ZPLC_PROTO_EVTMASK_STATUS | ZPLC_PROTO_EVTMASK_FAULT | ZPLC_PROTO_EVTMASK_BREAKPOINT | ZPLC_PROTO_EVTMASK_FORCE |
         ZPLC_PROTO_EVTMASK_LOG | ZPLC_PROTO_EVTMASK_WATCH;
}

/** An event the engine produced itself (a force it set): into the queue, without the lock of the producers. */
static void post_internal(zplc_proto_dev_t *dev, uint8_t id, const uint8_t *data, size_t length) {
  (void)zplc_proto_event_post(dev, id, data, length);
}

static uint8_t current_forces(zplc_proto_dev_t *dev) {
  zplc_proto_status_t status;

  if (dev->ops->status != NULL && dev->ops->status(dev->ops->context, &status) == 0) {
    return status.forces;
  }
  return 0U;
}

static void post_force_event(zplc_proto_dev_t *dev, uint8_t change, uint16_t address, uint8_t forces) {
  uint8_t data[4];

  data[ZPLC_PROTO_EVT_FORCE_CHANGE_OFF] = change;
  zplc_put_u16_le(data + ZPLC_PROTO_EVT_FORCE_ADDRESS_OFF, address);
  data[ZPLC_PROTO_EVT_FORCE_FORCES_OFF] = forces;
  dev->known_forces = forces;
  post_internal(dev, ZPLC_PROTO_EVT_FORCE, data, ZPLC_PROTO_EVT_FORCE_FIXED);
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Sessions                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------- */

static void owned_remove(zplc_proto_dev_t *dev, uint16_t address) {
  uint8_t i;

  for (i = 0U; i < dev->owned_count; i++) {
    if (dev->owned[i] == address) {
      dev->owned[i] = dev->owned[dev->owned_count - 1U];
      dev->owned_count--;
      return;
    }
  }
}

static void owned_add(zplc_proto_dev_t *dev, uint16_t address) {
  uint8_t i;

  for (i = 0U; i < dev->owned_count; i++) {
    if (dev->owned[i] == address) {
      return;
    }
  }
  if (dev->owned_count < ZPLC_PROTO_OWNED_FORCES) {
    dev->owned[dev->owned_count++] = address;
  }
}

static uint8_t release_owned_forces(zplc_proto_dev_t *dev) {
  const uint8_t released = dev->owned_count;
  uint8_t i;

  for (i = 0U; i < dev->owned_count; i++) {
    if (dev->ops->force_clear != NULL) {
      (void)dev->ops->force_clear(dev->ops->context, dev->owned[i]);
    }
  }
  dev->owned_count = 0U;
  return released;
}

static void abandon_transfers(zplc_proto_dev_t *dev) {
  if (dev->transfer_active != 0U) {
    if (dev->ops->program_abort != NULL) {
      dev->ops->program_abort(dev->ops->context);
    }
    dev->transfer_active = 0U;
  }
  if (dev->cred_active != 0U) {
    if (dev->ops->cred_abort != NULL) {
      dev->ops->cred_abort(dev->ops->context);
    }
    dev->cred_active = 0U;
  }
}

static void end_session(zplc_proto_dev_t *dev, uint8_t reason, int notify) {
  zplc_proto_link_t *link = dev->owner;
  uint8_t released;
  uint8_t data[2];

  if (dev->session_open == 0U) {
    return;
  }
  released = release_owned_forces(dev);
  abandon_transfers(dev);
  if (released != 0U) {
    uint8_t forces = 0U;

    if (dev->ops->status != NULL) {
      zplc_proto_status_t status;

      if (dev->ops->status(dev->ops->context, &status) == 0) {
        forces = status.forces;
      }
    }
    post_force_event(dev, (uint8_t)ZPLC_PROTO_FORCE_CHANGE_RELEASED, 0U, forces);
  }
  data[ZPLC_PROTO_EVT_SESSION_END_REASON_OFF] = reason;
  data[ZPLC_PROTO_EVT_SESSION_END_FORCES_RELEASED_OFF] = released;
  if (notify != 0 && link != NULL) {
    send_event(link, ZPLC_PROTO_EVT_SESSION_END, data, ZPLC_PROTO_EVT_SESSION_END_FIXED);
  }
  zplc_secure_zero(dev->session_key, sizeof(dev->session_key));
  dev->session_open = 0U;
  dev->session_authenticated = 0U;
  dev->owner = NULL;
  if (link != NULL) {
    link->rx_seq = 0U;
  }
}

static void begin_session(zplc_proto_dev_t *dev, zplc_proto_link_t *link, uint8_t authenticated) {
  dev->session_open = 1U;
  dev->session_authenticated = authenticated;
  dev->owner = link;
  dev->session_id = ++dev->last_session_id;
  dev->last_activity_ms = now_ms(dev);
  dev->owned_count = 0U;
  dev->transfer_active = 0U;
  dev->cred_active = 0U;
  link->event_seq = 0U;
  link->stats.sessions_opened++;
}

void zplc_proto_link_line(zplc_proto_link_t *link, int up) {
  if (link->line_up != 0U && up == 0) {
    zplc_proto_link_lost(link);
  }
  link->line_up = up != 0 ? 1U : 0U;
}

/* The console of a serial link is the person at its cable, as a frame on that link is: its commands open or join the
 * link's session, so a force set at the console ends with that session like one set by a frame (COM-020). */
int zplc_proto_session_lease(zplc_proto_link_t *link) {
  zplc_proto_dev_t *dev = link->dev;

  if (link->transport != ZPLC_PROTO_TRANSPORT_SERIAL) {
    return (int)ZPLC_PROTO_ERR_AUTH_REQUIRED;
  }
  if (dev->session_open != 0U && dev->owner != link) {
    return (int)ZPLC_PROTO_ERR_SESSION_BUSY;
  }
  if (dev->session_open == 0U) {
    begin_session(dev, link, 0U);
    link->rx_seq = 0U;
  }
  dev->last_activity_ms = now_ms(dev);
  return 0;
}

void zplc_proto_session_force_changed(zplc_proto_link_t *link, uint8_t change, uint16_t address) {
  zplc_proto_dev_t *dev = link->dev;
  const int ours = dev->session_open != 0U && dev->owner == link;

  if (change == (uint8_t)ZPLC_PROTO_FORCE_CHANGE_CLEARED_ALL) {
    dev->owned_count = 0U; /* the force table is empty: no session owns anything in it */
    post_force_event(dev, change, 0U, 0U);
    return;
  }
  if (change == (uint8_t)ZPLC_PROTO_FORCE_CHANGE_SET && ours) {
    owned_add(dev, address);
  } else if (change == (uint8_t)ZPLC_PROTO_FORCE_CHANGE_CLEARED) {
    owned_remove(dev, address);
  }
  if (ours) {
    dev->last_activity_ms = now_ms(dev);
  }
  post_force_event(dev, change, address, current_forces(dev));
}

int zplc_proto_session_is_open(const zplc_proto_dev_t *dev) { return dev->session_open != 0U; }

void zplc_proto_session_end(zplc_proto_dev_t *dev, uint8_t reason) { end_session(dev, reason, 1); }

static uint8_t session_state_for(const zplc_proto_dev_t *dev, const zplc_proto_link_t *link) {
  if (dev->session_open == 0U) {
    return (uint8_t)ZPLC_PROTO_SESSION_STATE_NONE;
  }
  return dev->owner == link ? (uint8_t)ZPLC_PROTO_SESSION_STATE_THIS_LINK : (uint8_t)ZPLC_PROTO_SESSION_STATE_OTHER_LINK;
}

static int signing_key_held(const zplc_proto_dev_t *dev, uint8_t key[ZPLC_PROTO_KEY_BYTES]) {
  if (!capability_bit(dev->ops, ZPLC_PROTO_CAP_SIGNATURE)) {
    return 0;
  }
  return dev->ops->signing_key_load(dev->ops->context, key) == 0;
}

static int load_key(const zplc_proto_dev_t *dev, uint8_t key[ZPLC_PROTO_KEY_BYTES]) {
  if (dev->ops->key_load == NULL) {
    return -1;
  }
  return dev->ops->key_load(dev->ops->context, key) == 0 ? 0 : -1;
}

/* ------------------------------------------------------------------------------------------------------------- */
/* The gate: authentication, sequence and the session rule                                                       */
/* ------------------------------------------------------------------------------------------------------------- */

typedef enum { GATE_PASS = 0, GATE_DROP = 1, GATE_ANSWER = 2 } gate_t;

static int code_matches(const uint8_t *key, const zplc_proto_frame_t *frame) {
  uint8_t mac[ZPLC_SHA256_DIGEST_BYTES];
  int equal;

  zplc_hmac_sha256(key, ZPLC_PROTO_KEY_BYTES, frame->covered, frame->covered_length, mac);
  equal = frame->mac != NULL && zplc_ct_equal(mac, frame->mac, sizeof(mac));
  zplc_secure_zero(mac, sizeof(mac));
  return equal;
}

static gate_t gate(zplc_proto_link_t *link, const zplc_proto_frame_t *frame, const request_spec_t *spec, int *answer) {
  zplc_proto_dev_t *dev = link->dev;
  const int network = link->transport == ZPLC_PROTO_TRANSPORT_NETWORK;
  const int session_here = dev->session_open != 0U && dev->owner == link;
  const int authenticated_here = session_here && dev->session_authenticated != 0U;

  if (spec->id == ZPLC_PROTO_MSG_SESSION_OPEN) {
    uint8_t key[ZPLC_PROTO_KEY_BYTES];
    int good;

    if (!frame->authenticated) {
      if (network) {
        *answer = (int)ZPLC_PROTO_ERR_AUTH_REQUIRED;
        return GATE_ANSWER;
      }
      return GATE_PASS;
    }
    if (load_key(dev, key) != 0) {
      *answer = (int)ZPLC_PROTO_ERR_AUTH_FAILED;
      return GATE_ANSWER;
    }
    good = code_matches(key, frame);
    zplc_secure_zero(key, sizeof(key));
    if (!good) {
      link->stats.auth_drops++;
      return GATE_DROP;
    }
    return GATE_PASS;
  }

  /* An open message needs no code. Inside an authenticated session a frame that carries one is a frame of the
   * session, and is held to the code and to the sequence like every other. */
  if (spec->access == ZPLC_PROTO_ACCESS_OPEN && !(authenticated_here && frame->authenticated)) {
    return GATE_PASS;
  }

  if (authenticated_here) {
    if (!frame->authenticated || !code_matches(dev->session_key, frame)) {
      link->stats.auth_drops++;
      return GATE_DROP;
    }
    if (frame->sequence <= link->rx_seq) {
      link->stats.replay_drops++;
      return GATE_DROP;
    }
    if (frame->sequence != link->rx_seq + 1U) {
      link->stats.order_drops++;
      return GATE_DROP;
    }
    link->rx_seq = frame->sequence;
    return GATE_PASS;
  }

  if (network) {
    *answer = (int)ZPLC_PROTO_ERR_AUTH_REQUIRED;
    return GATE_ANSWER;
  }
  return GATE_PASS;
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Handlers                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------- */

typedef struct {
  zplc_proto_link_t *link;
  const zplc_proto_frame_t *frame;
  const uint8_t *payload;
  uint8_t *payload_rw; /* the same bytes, in the buffer the caller owns: a key is cleared from it */
  size_t length;
} request_t;

static void do_hello(const request_t *r) {
  zplc_proto_link_t *link = r->link;
  zplc_proto_dev_t *dev = link->dev;
  uint8_t *body = body_of(dev);
  uint8_t key[ZPLC_PROTO_KEY_BYTES];
  size_t negotiated = zplc_get_u16_le(r->payload + ZPLC_PROTO_HELLO_REQ_CLIENT_MAX_PAYLOAD_OFF);

  if (negotiated > ZPLC_PROTO_PAYLOAD_MAX) {
    negotiated = ZPLC_PROTO_PAYLOAD_MAX;
  }
  if (negotiated < ZPLC_PROTO_PAYLOAD_MAX_MIN) {
    negotiated = ZPLC_PROTO_PAYLOAD_MAX_MIN < ZPLC_PROTO_PAYLOAD_MAX ? ZPLC_PROTO_PAYLOAD_MAX_MIN : ZPLC_PROTO_PAYLOAD_MAX;
  }
  if (dev->session_open != 0U && dev->owner == link) {
    /* The hello is answered to anyone, with no code: it must not be able to change what a live session uses. */
    negotiated = link->payload_max;
  }
  link->payload_max = negotiated;
  link->decoder.payload_max = negotiated;

  body[ZPLC_PROTO_HELLO_RSP_VERSION_OFF - 1U] = (uint8_t)ZPLC_PROTO_VERSION;
  body[ZPLC_PROTO_HELLO_RSP_TRANSPORT_OFF - 1U] = link->transport;
  zplc_put_u16_le(body + ZPLC_PROTO_HELLO_RSP_MAX_PAYLOAD_OFF - 1U, (uint16_t)negotiated);
  zplc_put_u32_le(body + ZPLC_PROTO_HELLO_RSP_CAPABILITIES_OFF - 1U, dev->capabilities);
  body[ZPLC_PROTO_HELLO_RSP_SESSION_STATE_OFF - 1U] = session_state_for(dev, link);
  body[ZPLC_PROTO_HELLO_RSP_KEY_PROVISIONED_OFF - 1U] = (uint8_t)(load_key(dev, key) == 0 ? 1U : 0U);
  zplc_secure_zero(key, sizeof(key));
  zplc_put_u16_le(body + ZPLC_PROTO_HELLO_RSP_IDLE_TIMEOUT_S_OFF - 1U, dev->idle_timeout_s);
  body[ZPLC_PROTO_HELLO_RSP_SIGNATURE_REQUIRED_OFF - 1U] = (uint8_t)(signing_key_held(dev, key) ? 1U : 0U);
  zplc_secure_zero(key, sizeof(key));
  respond(link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, ZPLC_PROTO_HELLO_RSP_FIXED - 1U);
}

static void do_identity(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  zplc_proto_identity_t id;
  uint8_t *b = body_of(dev);
  const size_t shift = 1U; /* response offsets count the status byte */
  int result;

  if (dev->ops->identity == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  (void)memset(&id, 0, sizeof(id));
  result = ops_error(dev->ops->identity(dev->ops->context, &id));
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  zplc_put_u16_le(b + ZPLC_PROTO_IDENTITY_RSP_ABI_MAJOR_OFF - shift, id.abi_major);
  zplc_put_u16_le(b + ZPLC_PROTO_IDENTITY_RSP_ABI_MINOR_OFF - shift, id.abi_minor);
  zplc_put_u32_le(b + ZPLC_PROTO_IDENTITY_RSP_DRAFT_COUNTER_OFF - shift, id.draft_counter);
  zplc_put_u32_le(b + ZPLC_PROTO_IDENTITY_RSP_IO_HASH_OFF - shift, id.io_hash);
  zplc_put_u16_le(b + ZPLC_PROTO_IDENTITY_RSP_IO_INPUT_BYTES_OFF - shift, id.io_input_bytes);
  zplc_put_u16_le(b + ZPLC_PROTO_IDENTITY_RSP_IO_OUTPUT_BYTES_OFF - shift, id.io_output_bytes);
  zplc_put_u16_le(b + ZPLC_PROTO_IDENTITY_RSP_IO_CHANNELS_OFF - shift, id.io_channels);
  zplc_put_u32_le(b + ZPLC_PROTO_IDENTITY_RSP_CODE_SIZE_MAX_OFF - shift, id.code_size_max);
  zplc_put_u32_le(b + ZPLC_PROTO_IDENTITY_RSP_WORK_SIZE_OFF - shift, id.work_size);
  zplc_put_u32_le(b + ZPLC_PROTO_IDENTITY_RSP_RETAIN_SIZE_OFF - shift, id.retain_size);
  zplc_put_u32_le(b + ZPLC_PROTO_IDENTITY_RSP_IPI_SIZE_OFF - shift, id.ipi_size);
  zplc_put_u32_le(b + ZPLC_PROTO_IDENTITY_RSP_OPI_SIZE_OFF - shift, id.opi_size);
  put_text(b + ZPLC_PROTO_IDENTITY_RSP_PRODUCT_VERSION_OFF - shift, ZPLC_PROTO_IDENTITY_RSP_PRODUCT_VERSION_SIZE, id.product_version);
  put_text(b + ZPLC_PROTO_IDENTITY_RSP_BOARD_OFF - shift, ZPLC_PROTO_IDENTITY_RSP_BOARD_SIZE, id.board);
  put_text(b + ZPLC_PROTO_IDENTITY_RSP_BOARD_PROFILE_OFF - shift, ZPLC_PROTO_IDENTITY_RSP_BOARD_PROFILE_SIZE, id.board_profile);
  put_text(b + ZPLC_PROTO_IDENTITY_RSP_IO_BOARD_ID_OFF - shift, ZPLC_PROTO_IDENTITY_RSP_IO_BOARD_ID_SIZE, id.io_board_id);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, ZPLC_PROTO_IDENTITY_RSP_FIXED - shift);
}

static void do_status(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  zplc_proto_status_t s;
  uint8_t *b = body_of(dev);
  const size_t shift = 1U;
  int result;

  if (dev->ops->status == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  (void)memset(&s, 0, sizeof(s));
  result = ops_error(dev->ops->status(dev->ops->context, &s));
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  b[ZPLC_PROTO_STATUS_RSP_STATE_OFF - shift] = s.state;
  b[ZPLC_PROTO_STATUS_RSP_FAULT_OFF - shift] = s.fault;
  b[ZPLC_PROTO_STATUS_RSP_PROGRAM_LOADED_OFF - shift] = s.program_loaded;
  b[ZPLC_PROTO_STATUS_RSP_FORCES_OFF - shift] = s.forces;
  zplc_put_u32_le(b + ZPLC_PROTO_STATUS_RSP_CYCLES_OFF - shift, s.cycles);
  zplc_put_u32_le(b + ZPLC_PROTO_STATUS_RSP_OVERRUNS_OFF - shift, s.overruns);
  zplc_put_u32_le(b + ZPLC_PROTO_STATUS_RSP_PROGRAM_SIZE_OFF - shift, s.program_size);
  zplc_put_u32_le(b + ZPLC_PROTO_STATUS_RSP_PROGRAM_GENERATION_OFF - shift, s.program_generation);
  zplc_put_u32_le(b + ZPLC_PROTO_STATUS_RSP_UPTIME_MS_OFF - shift, s.uptime_ms);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, ZPLC_PROTO_STATUS_RSP_FIXED - shift);
}

static void do_challenge(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint32_t now = now_ms(dev);

  if (!capability_bit(dev->ops, ZPLC_PROTO_CAP_AUTH)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  /* A challenge is issued once and kept until it is used or has expired, so that asking for one cannot make
   * another client's challenge stale. It is a public number: what makes a session is the key. */
  if (dev->challenge_valid == 0U || elapsed_ms(now, dev->challenge_ms) > ZPLC_PROTO_CHALLENGE_S * 1000U) {
    if (dev->ops->random(dev->ops->context, dev->challenge, sizeof(dev->challenge)) != 0) {
      dev->challenge_valid = 0U;
      respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_FAILED);
      return;
    }
    dev->challenge_valid = 1U;
    dev->challenge_ms = now;
  }
  (void)memcpy(body_of(dev), dev->challenge, sizeof(dev->challenge));
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, sizeof(dev->challenge));
}

static void do_link_stats(const request_t *r) {
  zplc_proto_link_t *link = r->link;
  uint8_t *b = body_of(link->dev);
  const size_t shift = 1U;
  const zplc_proto_decoder_stats_t *d = &link->decoder.stats;

  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_FRAMES_IN_OFF - shift, link->stats.frames_in);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_FRAMES_OUT_OFF - shift, link->stats.frames_out);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_CRC_ERRORS_OFF - shift, d->crc_errors);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_RESYNCS_OFF - shift, d->resyncs);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_VERSION_ERRORS_OFF - shift, d->version_errors);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_OVERSIZE_OFF - shift, d->oversize);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_AUTH_DROPS_OFF - shift, link->stats.auth_drops);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_REPLAY_DROPS_OFF - shift, link->stats.replay_drops);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_ORDER_DROPS_OFF - shift, link->stats.order_drops);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_EVENTS_SENT_OFF - shift, link->stats.events_sent);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_EVENTS_DROPPED_OFF - shift, link->stats.events_dropped + link->dev->dropped_total);
  zplc_put_u32_le(b + ZPLC_PROTO_LINK_STATS_RSP_SESSIONS_OPENED_OFF - shift, link->stats.sessions_opened);
  respond(link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, ZPLC_PROTO_LINK_STATS_RSP_FIXED - shift);
}

static void do_mem_read(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint16_t address = zplc_get_u16_le(r->payload + ZPLC_PROTO_MEM_READ_REQ_ADDRESS_OFF);
  const uint16_t length = zplc_get_u16_le(r->payload + ZPLC_PROTO_MEM_READ_REQ_LENGTH_OFF);
  uint16_t start = 0xFFFFU;
  uint16_t end = 0xFFFFU;
  int result;

  if (dev->ops->mem_read == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  if (check_access(address, length, ACCESS_READ, &start, &end) != 0) {
    respond_range(r->link, r->frame, address, length, start, end);
    return;
  }
  if (length > body_capacity(r->link)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_TOO_LARGE);
    return;
  }
  result = ops_error(dev->ops->mem_read(dev->ops->context, address, body_of(dev), length));
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, length);
}

static void do_mem_write(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint16_t address = zplc_get_u16_le(r->payload + ZPLC_PROTO_MEM_WRITE_REQ_ADDRESS_OFF);
  const uint16_t length = (uint16_t)(r->length - ZPLC_PROTO_MEM_WRITE_REQ_FIXED);
  uint16_t start = 0xFFFFU;
  uint16_t end = 0xFFFFU;
  int result;

  if (dev->ops->mem_write == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  if (check_access(address, length, ACCESS_WRITE, &start, &end) != 0) {
    respond_range(r->link, r->frame, address, length, start, end);
    return;
  }
  /* One call, one value: the port queues it whole and the scan applies it at its next input latch. */
  result = ops_error(dev->ops->mem_write(dev->ops->context, address, r->payload + ZPLC_PROTO_MEM_WRITE_REQ_FIXED, length));
  respond(r->link, r->frame, (uint8_t)result, 0U);
}

static void do_force_set(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint16_t address = zplc_get_u16_le(r->payload + ZPLC_PROTO_FORCE_SET_REQ_ADDRESS_OFF);
  const size_t length = r->length - ZPLC_PROTO_FORCE_SET_REQ_FIXED;
  uint16_t start = 0xFFFFU;
  uint16_t end = 0xFFFFU;
  int result;

  if (dev->ops->force_set == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  if (length > ZPLC_FORCE_MAX_BYTES) {
    region_of(address, &start, &end);
    respond_range(r->link, r->frame, address, (uint32_t)length, start, end);
    return;
  }
  if (check_access(address, length, ACCESS_FORCE, &start, &end) != 0) {
    respond_range(r->link, r->frame, address, (uint32_t)length, start, end);
    return;
  }
  result = ops_error(dev->ops->force_set(dev->ops->context, address, r->payload + ZPLC_PROTO_FORCE_SET_REQ_FIXED, (uint16_t)length));
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  owned_add(dev, address);
  body_of(dev)[0] = current_forces(dev);
  post_force_event(dev, (uint8_t)ZPLC_PROTO_FORCE_CHANGE_SET, address, body_of(dev)[0]);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 1U);
}

static void do_force_clear(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint16_t address = zplc_get_u16_le(r->payload + ZPLC_PROTO_FORCE_CLEAR_REQ_ADDRESS_OFF);
  int result;

  if (dev->ops->force_clear == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  result = ops_error(dev->ops->force_clear(dev->ops->context, address));
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  owned_remove(dev, address);
  body_of(dev)[0] = current_forces(dev);
  post_force_event(dev, (uint8_t)ZPLC_PROTO_FORCE_CHANGE_CLEARED, address, body_of(dev)[0]);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 1U);
}

static void do_force_clear_all(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  int result;

  if (dev->ops->force_clear_all == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  result = ops_error(dev->ops->force_clear_all(dev->ops->context));
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  dev->owned_count = 0U;
  post_force_event(dev, (uint8_t)ZPLC_PROTO_FORCE_CHANGE_CLEARED_ALL, 0U, 0U);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 0U);
}

static void do_force_list(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  uint8_t *b = body_of(dev);
  size_t used = 1U; /* the count */
  uint8_t total = 0U;
  uint8_t index;
  zplc_proto_status_t status;

  if (dev->ops->force_get == NULL || dev->ops->status == NULL || dev->ops->status(dev->ops->context, &status) != 0) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  total = status.forces;
  for (index = 0U; index < total; index++) {
    uint16_t address = 0U;
    uint16_t size = 0U;
    uint8_t data[ZPLC_FORCE_MAX_BYTES];

    if (dev->ops->force_get(dev->ops->context, index, &address, &size, data) != 0 || size > sizeof(data)) {
      continue;
    }
    if (used + 4U + size > body_capacity(r->link)) {
      break; /* the entries that fit; the count says how many there are */
    }
    zplc_put_u16_le(b + used, address);
    zplc_put_u16_le(b + used + 2U, size);
    (void)memcpy(b + used + 4U, data, size);
    used += 4U + size;
  }
  b[0] = total;
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, used);
}

static void do_session_open(const request_t *r) {
  zplc_proto_link_t *link = r->link;
  zplc_proto_dev_t *dev = link->dev;
  const uint8_t flags = r->payload[ZPLC_PROTO_SESSION_OPEN_REQ_FLAGS_OFF];
  const uint8_t *client_nonce = r->payload + ZPLC_PROTO_SESSION_OPEN_REQ_CLIENT_NONCE_OFF;
  const uint8_t *device_nonce = r->payload + ZPLC_PROTO_SESSION_OPEN_REQ_DEVICE_NONCE_OFF;
  const int authenticated = r->frame->authenticated != 0U;
  uint8_t session_key[ZPLC_PROTO_KEY_BYTES];
  uint8_t *b = body_of(dev);
  const size_t shift = 1U;

  if (dev->session_open != 0U) {
    if (dev->owner == link) {
      end_session(dev, (uint8_t)ZPLC_PROTO_SESSION_END_CLOSED, 0);
    } else if ((flags & 1U) != 0U && link->transport == ZPLC_PROTO_TRANSPORT_SERIAL) {
      end_session(dev, (uint8_t)ZPLC_PROTO_SESSION_END_TAKEN_OVER, 1);
    } else if ((flags & 1U) != 0U) {
      respond_error(link, r->frame, (int)ZPLC_PROTO_ERR_REFUSED); /* a takeover is a person at the cable */
      return;
    } else {
      respond_error(link, r->frame, (int)ZPLC_PROTO_ERR_SESSION_BUSY);
      return;
    }
  }

  if (authenticated) {
    uint8_t key[ZPLC_PROTO_KEY_BYTES];
    zplc_hmac_sha256_t hmac;
    const uint32_t now = now_ms(dev);
    const int fresh = dev->challenge_valid != 0U && elapsed_ms(now, dev->challenge_ms) <= ZPLC_PROTO_CHALLENGE_S * 1000U &&
                      zplc_ct_equal(device_nonce, dev->challenge, ZPLC_PROTO_NONCE_BYTES);

    /* The challenge is used up whether it was the right one or not. */
    dev->challenge_valid = 0U;
    zplc_secure_zero(dev->challenge, sizeof(dev->challenge));
    if (!fresh) {
      /* A code that is right over a challenge that is not the last one: a frame that was seen before. */
      link->stats.replay_drops++;
      respond_error(link, r->frame, (int)ZPLC_PROTO_ERR_CHALLENGE_STALE);
      return;
    }
    if (load_key(dev, key) != 0) {
      respond_error(link, r->frame, (int)ZPLC_PROTO_ERR_AUTH_FAILED);
      return;
    }
    zplc_hmac_sha256_init(&hmac, key, sizeof(key));
    zplc_hmac_sha256_update(&hmac, (const uint8_t *)LABEL_SESSION_KEY, sizeof(LABEL_SESSION_KEY) - 1U);
    zplc_hmac_sha256_update(&hmac, device_nonce, ZPLC_PROTO_NONCE_BYTES);
    zplc_hmac_sha256_update(&hmac, client_nonce, ZPLC_PROTO_NONCE_BYTES);
    zplc_hmac_sha256_final(&hmac, session_key);
    zplc_secure_zero(key, sizeof(key));
    (void)memcpy(dev->session_key, session_key, sizeof(session_key));
    zplc_secure_zero(session_key, sizeof(session_key));
  }

  begin_session(dev, link, authenticated ? 1U : 0U);
  link->rx_seq = r->frame->sequence;

  zplc_put_u32_le(b + ZPLC_PROTO_SESSION_OPEN_RSP_SESSION_ID_OFF - shift, dev->session_id);
  zplc_put_u16_le(b + ZPLC_PROTO_SESSION_OPEN_RSP_IDLE_TIMEOUT_S_OFF - shift, dev->idle_timeout_s);
  b[ZPLC_PROTO_SESSION_OPEN_RSP_AUTHENTICATED_OFF - shift] = dev->session_authenticated;
  respond(link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, ZPLC_PROTO_SESSION_OPEN_RSP_FIXED - shift);
}

static void do_session_close(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint8_t released = dev->owned_count;

  body_of(dev)[0] = released;
  /* The answer is sealed under the session key, then the session goes. */
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 1U);
  end_session(dev, (uint8_t)ZPLC_PROTO_SESSION_END_CLOSED, 0);
}

static void do_keepalive(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  uint8_t *b = body_of(dev);

  zplc_put_u16_le(b, dev->idle_timeout_s);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 2U);
}

static void do_events_set(const request_t *r) {
  const uint32_t requested = zplc_get_u32_le(r->payload + ZPLC_PROTO_EVENTS_SET_REQ_MASK_OFF);
  uint8_t *b = body_of(r->link->dev);

  r->link->event_mask = requested & all_event_bits();
  r->link->dev->reported_unsupported = 0U; /* IO-007: a client that subscribes is told what the board cannot serve */
  zplc_put_u32_le(b, r->link->event_mask);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 4U);
}

static void do_watch_set(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint16_t period = zplc_get_u16_le(r->payload + ZPLC_PROTO_WATCH_SET_REQ_PERIOD_MS_OFF);
  const size_t entries_bytes = r->length - ZPLC_PROTO_WATCH_SET_REQ_FIXED;
  const size_t count = entries_bytes / 3U;
  const uint8_t *entries = r->payload + ZPLC_PROTO_WATCH_SET_REQ_FIXED;
  size_t total = 0U;
  size_t i;

  if (!capability_bit(dev->ops, ZPLC_PROTO_CAP_WATCH)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  if (entries_bytes % 3U != 0U || count == 0U || count > ZPLC_PROTO_WATCH_ENTRIES_MAX) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_BAD_REQUEST);
    return;
  }
  for (i = 0U; i < count; i++) {
    const uint16_t address = zplc_get_u16_le(entries + 3U * i);
    const uint8_t length = entries[3U * i + 2U];
    uint16_t start = 0xFFFFU;
    uint16_t end = 0xFFFFU;

    total += length;
    if (check_access(address, length, ACCESS_READ, &start, &end) != 0) {
      respond_range(r->link, r->frame, address, length, start, end);
      return;
    }
    if (total > ZPLC_PROTO_EVENT_PAYLOAD_MAX - ZPLC_PROTO_EVT_WATCH_FIXED) {
      respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_TOO_LARGE);
      return;
    }
    dev->watch_extents[i].address = address;
    dev->watch_extents[i].length = length;
  }
  dev->watch_count = (uint8_t)count;
  dev->watch_period_ms = period;
  dev->watch_last_ms = now_ms(dev);
  dev->watch_have_last = 0U;
  dev->watch_link = r->link;
  body_of(dev)[0] = (uint8_t)count;
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 1U);
}

static void do_watch_clear(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;

  dev->watch_count = 0U;
  dev->watch_link = NULL;
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 0U);
}

static void respond_state(const request_t *r, int result) {
  zplc_proto_dev_t *dev = r->link->dev;
  zplc_proto_status_t status;

  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  body_of(dev)[0] = (dev->ops->status != NULL && dev->ops->status(dev->ops->context, &status) == 0) ? status.state
                                                                                                    : (uint8_t)ZPLC_PROTO_RUN_STATE_STOPPED;
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 1U);
}

typedef int (*control_fn)(void *context);

static void do_control(const request_t *r, control_fn fn) {
  zplc_proto_dev_t *dev = r->link->dev;

  if (fn == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  respond_state(r, ops_error(fn(dev->ops->context)));
}

static void respond_breakpoints(const request_t *r, int result) {
  zplc_proto_dev_t *dev = r->link->dev;
  uint16_t pcs[32];
  size_t count = 0U;

  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  if (dev->ops->bp_list != NULL) {
    (void)dev->ops->bp_list(dev->ops->context, pcs, sizeof(pcs) / sizeof(pcs[0]), &count);
  }
  body_of(dev)[0] = (uint8_t)count;
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 1U);
}

static void do_bp_list(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  uint16_t pcs[32];
  uint8_t *b = body_of(dev);
  size_t count = 0U;
  size_t i;

  if (dev->ops->bp_list == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  if (dev->ops->bp_list(dev->ops->context, pcs, sizeof(pcs) / sizeof(pcs[0]), &count) != 0) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_FAILED);
    return;
  }
  if (count > sizeof(pcs) / sizeof(pcs[0])) {
    count = sizeof(pcs) / sizeof(pcs[0]);
  }
  b[0] = (uint8_t)count;
  for (i = 0U; i < count; i++) {
    zplc_put_u16_le(b + 1U + 2U * i, pcs[i]);
  }
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 1U + 2U * count);
}

static void do_program_begin(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint32_t size = zplc_get_u32_le(r->payload + ZPLC_PROTO_PROGRAM_BEGIN_REQ_SIZE_OFF);
  const uint32_t crc = zplc_get_u32_le(r->payload + ZPLC_PROTO_PROGRAM_BEGIN_REQ_CRC32_OFF);
  int result;

  if (!capability_bit(dev->ops, ZPLC_PROTO_CAP_PROGRAM)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  if (dev->transfer_active != 0U) {
    dev->ops->program_abort(dev->ops->context);
    dev->transfer_active = 0U;
  }
  if (size == 0U || size > ZPLC_MEM_CODE_SIZE) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_TOO_LARGE);
    return;
  }
  result = ops_error(dev->ops->program_begin(dev->ops->context, size));
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  dev->transfer_active = 1U;
  dev->transfer_signed = 0U;
  dev->transfer_size = size;
  dev->transfer_received = 0U;
  dev->transfer_crc = crc;
  dev->transfer_crc_state = 0xFFFFFFFFU;
  zplc_put_u16_le(body_of(dev), (uint16_t)(r->link->payload_max - ZPLC_PROTO_PROGRAM_CHUNK_REQ_FIXED));
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 2U);
}

static void do_program_chunk(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint32_t offset = zplc_get_u32_le(r->payload + ZPLC_PROTO_PROGRAM_CHUNK_REQ_OFFSET_OFF);
  const uint8_t *data = r->payload + ZPLC_PROTO_PROGRAM_CHUNK_REQ_FIXED;
  const size_t length = r->length - ZPLC_PROTO_PROGRAM_CHUNK_REQ_FIXED;
  int result;

  if (dev->transfer_active == 0U) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_STATE);
    return;
  }
  if (length == 0U || offset != dev->transfer_received) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_BAD_REQUEST);
    return;
  }
  if (length > dev->transfer_size - dev->transfer_received) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_TOO_LARGE);
    return;
  }
  result = ops_error(dev->ops->program_chunk(dev->ops->context, offset, data, (uint16_t)length));
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  dev->transfer_crc_state = zplc_crc32_update(dev->transfer_crc_state, data, length);
  dev->transfer_received += (uint32_t)length;
  zplc_put_u32_le(body_of(dev), dev->transfer_received);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 4U);
}

static void do_program_commit(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  zplc_proto_program_info_t info;
  uint8_t *b = body_of(dev);
  int result;

  if (dev->transfer_active == 0U || dev->transfer_received != dev->transfer_size) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_STATE);
    return;
  }
  if ((dev->transfer_crc_state ^ 0xFFFFFFFFU) != dev->transfer_crc) {
    dev->ops->program_abort(dev->ops->context);
    dev->transfer_active = 0U;
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_CRC);
    return;
  }
  {
    uint8_t signing_key[ZPLC_PROTO_KEY_BYTES];

    if (signing_key_held(dev, signing_key)) {
      /* the device holds a public key: nothing is activated that its owner did not sign (COM-026) */
      if (dev->transfer_signed == 0U) {
        zplc_secure_zero(signing_key, sizeof(signing_key));
        respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_SIGNATURE_REQUIRED);
        return; /* the transfer stays: the signature can still be sent */
      }
      result = ops_error(dev->ops->program_verify(dev->ops->context, signing_key, dev->transfer_signature));
      zplc_secure_zero(signing_key, sizeof(signing_key));
      if (result != 0) {
        dev->ops->program_abort(dev->ops->context);
        dev->transfer_active = 0U;
        respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_SIGNATURE_INVALID);
        return;
      }
    }
  }
  (void)memset(&info, 0, sizeof(info));
  result = ops_error(dev->ops->program_commit(dev->ops->context, &info));
  dev->transfer_active = 0U;
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  /* The device read back what it holds: it has to be what was announced. */
  if (info.size != dev->transfer_size || info.crc32 != dev->transfer_crc) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_FAILED);
    return;
  }
  zplc_put_u32_le(b + 0U, info.size);
  zplc_put_u32_le(b + 4U, info.crc32);
  zplc_put_u32_le(b + 8U, info.generation);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 12U);
}

static void do_program_sign(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;

  if (!capability_bit(dev->ops, ZPLC_PROTO_CAP_SIGNATURE)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  if (dev->transfer_active == 0U) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_STATE);
    return;
  }
  (void)memcpy(dev->transfer_signature, r->payload + ZPLC_PROTO_PROGRAM_SIGN_REQ_SIGNATURE_OFF, sizeof(dev->transfer_signature));
  dev->transfer_signed = 1U;
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 0U);
}

static void do_program_abort(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;

  if (dev->transfer_active != 0U) {
    dev->ops->program_abort(dev->ops->context);
    dev->transfer_active = 0U;
  }
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 0U);
}

static void do_program_info(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  zplc_proto_program_info_t info;
  uint8_t *b = body_of(dev);
  int result;

  if (dev->ops->program_info == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  (void)memset(&info, 0, sizeof(info));
  result = ops_error(dev->ops->program_info(dev->ops->context, &info));
  if (result != 0) {
    respond_error(r->link, r->frame, result);
    return;
  }
  b[0] = info.loaded;
  zplc_put_u32_le(b + 1U, info.size);
  zplc_put_u32_le(b + 5U, info.crc32);
  zplc_put_u32_le(b + 9U, info.generation);
  respond(r->link, r->frame, (uint8_t)ZPLC_PROTO_ERR_OK, 13U);
}

static void do_config_set(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  char key[ZPLC_PROTO_CONFIG_SET_REQ_KEY_SIZE + 1U];
  int result;

  if (dev->ops->config_set == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  (void)memcpy(key, r->payload + ZPLC_PROTO_CONFIG_SET_REQ_KEY_OFF, ZPLC_PROTO_CONFIG_SET_REQ_KEY_SIZE);
  key[ZPLC_PROTO_CONFIG_SET_REQ_KEY_SIZE] = '\0';
  result = ops_error(dev->ops->config_set(dev->ops->context, key, r->payload + ZPLC_PROTO_CONFIG_SET_REQ_FIXED,
                                          (uint16_t)(r->length - ZPLC_PROTO_CONFIG_SET_REQ_FIXED)));
  respond(r->link, r->frame, (uint8_t)result, 0U);
}

static void do_simple(const request_t *r, int (*fn)(void *context)) {
  zplc_proto_dev_t *dev = r->link->dev;

  if (fn == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  respond(r->link, r->frame, (uint8_t)ops_error(fn(dev->ops->context)), 0U);
}

static void do_cred_begin(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const uint8_t kind = r->payload[ZPLC_PROTO_CRED_BEGIN_REQ_KIND_OFF];
  const uint16_t size = zplc_get_u16_le(r->payload + ZPLC_PROTO_CRED_BEGIN_REQ_SIZE_OFF);
  int result;

  if (dev->ops->cred_begin == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  if (dev->cred_active != 0U && dev->ops->cred_abort != NULL) {
    dev->ops->cred_abort(dev->ops->context);
  }
  dev->cred_active = 0U;
  if (size == 0U) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_BAD_REQUEST);
    return;
  }
  result = ops_error(dev->ops->cred_begin(dev->ops->context, kind, size));
  if (result == 0) {
    dev->cred_active = 1U;
    dev->cred_size = size;
    dev->cred_received = 0U;
  }
  respond(r->link, r->frame, (uint8_t)result, 0U);
}

static void do_cred_chunk(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  const size_t length = r->length;
  int result;

  if (dev->ops->cred_chunk == NULL || dev->cred_active == 0U) {
    respond_error(r->link, r->frame, dev->ops->cred_chunk == NULL ? (int)ZPLC_PROTO_ERR_UNSUPPORTED : (int)ZPLC_PROTO_ERR_STATE);
    return;
  }
  if (length == 0U || length > (size_t)(dev->cred_size - dev->cred_received)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_TOO_LARGE);
    return;
  }
  result = ops_error(dev->ops->cred_chunk(dev->ops->context, r->payload, (uint16_t)length));
  if (result == 0) {
    dev->cred_received = (uint16_t)(dev->cred_received + length);
  }
  respond(r->link, r->frame, (uint8_t)result, 0U);
}

static void do_cred_commit(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  int result;

  if (dev->ops->cred_commit == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  if (dev->cred_active == 0U || dev->cred_received != dev->cred_size) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_STATE);
    return;
  }
  result = ops_error(dev->ops->cred_commit(dev->ops->context));
  dev->cred_active = 0U;
  respond(r->link, r->frame, (uint8_t)result, 0U);
}

static void do_cred_erase(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;

  if (dev->ops->cred_erase == NULL) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  respond(r->link, r->frame, (uint8_t)ops_error(dev->ops->cred_erase(dev->ops->context, r->payload[ZPLC_PROTO_CRED_ERASE_REQ_KIND_OFF])),
          0U);
}

static void do_key_set(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;
  int result;

  if (!capability_bit(dev->ops, ZPLC_PROTO_CAP_AUTH)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  result = ops_error(dev->ops->key_store(dev->ops->context, r->payload + ZPLC_PROTO_KEY_SET_REQ_KEY_OFF));
  /* The key is never sent back, and the copy of it in the buffer of the frame is cleared. */
  zplc_secure_zero(r->payload_rw, r->length);
  dev->challenge_valid = 0U;
  respond(r->link, r->frame, (uint8_t)result, 0U);
}

static void do_signing_key_set(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;

  if (!capability_bit(dev->ops, ZPLC_PROTO_CAP_SIGNATURE)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  respond(r->link, r->frame,
          (uint8_t)ops_error(dev->ops->signing_key_store(dev->ops->context, r->payload + ZPLC_PROTO_SIGNING_KEY_SET_REQ_PUBLIC_KEY_OFF)),
          0U);
}

static void do_signing_key_clear(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;

  if (!capability_bit(dev->ops, ZPLC_PROTO_CAP_SIGNATURE)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  respond(r->link, r->frame, (uint8_t)ops_error(dev->ops->signing_key_erase(dev->ops->context)), 0U);
}

static void do_key_clear(const request_t *r) {
  zplc_proto_dev_t *dev = r->link->dev;

  if (!capability_bit(dev->ops, ZPLC_PROTO_CAP_AUTH)) {
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    return;
  }
  dev->challenge_valid = 0U;
  respond(r->link, r->frame, (uint8_t)ops_error(dev->ops->key_erase(dev->ops->context)), 0U);
}

static void dispatch(const request_t *r) {
  const zplc_proto_ops_t *ops = r->link->dev->ops;

  switch (r->frame->message) {
  case ZPLC_PROTO_MSG_HELLO:
    do_hello(r);
    break;
  case ZPLC_PROTO_MSG_IDENTITY:
    do_identity(r);
    break;
  case ZPLC_PROTO_MSG_STATUS:
    do_status(r);
    break;
  case ZPLC_PROTO_MSG_CHALLENGE:
    do_challenge(r);
    break;
  case ZPLC_PROTO_MSG_LINK_STATS:
    do_link_stats(r);
    break;
  case ZPLC_PROTO_MSG_MEM_READ:
    do_mem_read(r);
    break;
  case ZPLC_PROTO_MSG_MEM_WRITE:
    do_mem_write(r);
    break;
  case ZPLC_PROTO_MSG_FORCE_SET:
    do_force_set(r);
    break;
  case ZPLC_PROTO_MSG_FORCE_CLEAR:
    do_force_clear(r);
    break;
  case ZPLC_PROTO_MSG_FORCE_CLEAR_ALL:
    do_force_clear_all(r);
    break;
  case ZPLC_PROTO_MSG_FORCE_LIST:
    do_force_list(r);
    break;
  case ZPLC_PROTO_MSG_SESSION_OPEN:
    do_session_open(r);
    break;
  case ZPLC_PROTO_MSG_SESSION_CLOSE:
    do_session_close(r);
    break;
  case ZPLC_PROTO_MSG_KEEPALIVE:
    do_keepalive(r);
    break;
  case ZPLC_PROTO_MSG_EVENTS_SET:
    do_events_set(r);
    break;
  case ZPLC_PROTO_MSG_WATCH_SET:
    do_watch_set(r);
    break;
  case ZPLC_PROTO_MSG_WATCH_CLEAR:
    do_watch_clear(r);
    break;
  case ZPLC_PROTO_MSG_RUN:
    do_control(r, ops->run);
    break;
  case ZPLC_PROTO_MSG_STOP:
    do_control(r, ops->stop);
    break;
  case ZPLC_PROTO_MSG_PAUSE:
    do_control(r, ops->pause);
    break;
  case ZPLC_PROTO_MSG_RESUME:
    do_control(r, ops->resume);
    break;
  case ZPLC_PROTO_MSG_STEP:
    do_control(r, ops->step);
    break;
  case ZPLC_PROTO_MSG_RESET:
    do_control(r, ops->reset);
    break;
  case ZPLC_PROTO_MSG_BP_ADD:
    if (ops->bp_add == NULL) {
      respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    } else {
      respond_breakpoints(r, ops_error(ops->bp_add(ops->context, zplc_get_u16_le(r->payload))));
    }
    break;
  case ZPLC_PROTO_MSG_BP_REMOVE:
    if (ops->bp_remove == NULL) {
      respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNSUPPORTED);
    } else {
      respond_breakpoints(r, ops_error(ops->bp_remove(ops->context, zplc_get_u16_le(r->payload))));
    }
    break;
  case ZPLC_PROTO_MSG_BP_CLEAR:
    do_simple(r, ops->bp_clear);
    break;
  case ZPLC_PROTO_MSG_BP_LIST:
    do_bp_list(r);
    break;
  case ZPLC_PROTO_MSG_PROGRAM_BEGIN:
    do_program_begin(r);
    break;
  case ZPLC_PROTO_MSG_PROGRAM_CHUNK:
    do_program_chunk(r);
    break;
  case ZPLC_PROTO_MSG_PROGRAM_COMMIT:
    do_program_commit(r);
    break;
  case ZPLC_PROTO_MSG_PROGRAM_SIGN:
    do_program_sign(r);
    break;
  case ZPLC_PROTO_MSG_PROGRAM_ABORT:
    do_program_abort(r);
    break;
  case ZPLC_PROTO_MSG_PROGRAM_INFO:
    do_program_info(r);
    break;
  case ZPLC_PROTO_MSG_CONFIG_SET:
    do_config_set(r);
    break;
  case ZPLC_PROTO_MSG_CONFIG_SAVE:
    do_simple(r, ops->config_save);
    break;
  case ZPLC_PROTO_MSG_CONFIG_RESET:
    do_simple(r, ops->config_reset);
    break;
  case ZPLC_PROTO_MSG_CRED_BEGIN:
    do_cred_begin(r);
    break;
  case ZPLC_PROTO_MSG_CRED_CHUNK:
    do_cred_chunk(r);
    break;
  case ZPLC_PROTO_MSG_CRED_COMMIT:
    do_cred_commit(r);
    break;
  case ZPLC_PROTO_MSG_CRED_ERASE:
    do_cred_erase(r);
    break;
  case ZPLC_PROTO_MSG_KEY_SET:
    do_key_set(r);
    break;
  case ZPLC_PROTO_MSG_KEY_CLEAR:
    do_key_clear(r);
    break;
  case ZPLC_PROTO_MSG_SIGNING_KEY_SET:
    do_signing_key_set(r);
    break;
  case ZPLC_PROTO_MSG_SIGNING_KEY_CLEAR:
    do_signing_key_clear(r);
    break;
  default:
    respond_error(r->link, r->frame, (int)ZPLC_PROTO_ERR_UNKNOWN_MESSAGE);
    break;
  }
}

static void handle_frame(zplc_proto_link_t *link, const zplc_proto_frame_t *frame, uint8_t *bytes) {
  zplc_proto_dev_t *dev = link->dev;
  const request_spec_t *spec;
  request_t request;
  int answer = 0;
  gate_t verdict;

  link->stats.frames_in++;
  if (frame->kind != ZPLC_PROTO_KIND_REQUEST) {
    return; /* a device is only asked */
  }
  spec = spec_of(frame->message);
  if (spec == NULL) {
    zplc_proto_frame_t unknown = *frame;

    unknown.authenticated = 0U;
    respond_error(link, &unknown, (int)ZPLC_PROTO_ERR_UNKNOWN_MESSAGE);
    return;
  }

  verdict = gate(link, frame, spec, &answer);
  if (verdict == GATE_DROP) {
    return;
  }
  if (verdict == GATE_ANSWER) {
    respond_error(link, frame, answer);
    return;
  }

  if (spec->access == ZPLC_PROTO_ACCESS_SESSION || spec->access == ZPLC_PROTO_ACCESS_SERIAL_SESSION) {
    if (dev->session_open == 0U || dev->owner != link) {
      respond_error(link, frame, (int)ZPLC_PROTO_ERR_NO_SESSION);
      return;
    }
    if (spec->access == ZPLC_PROTO_ACCESS_SERIAL_SESSION && link->transport != ZPLC_PROTO_TRANSPORT_SERIAL) {
      respond_error(link, frame, (int)ZPLC_PROTO_ERR_REFUSED);
      return;
    }
  }
  if (dev->session_open != 0U && dev->owner == link) {
    dev->last_activity_ms = now_ms(dev);
  }

  if (frame->length < spec->fixed || (spec->tail == 0U && frame->length != spec->fixed)) {
    respond_error(link, frame, (int)ZPLC_PROTO_ERR_BAD_REQUEST);
    return;
  }
  request.link = link;
  request.frame = frame;
  request.payload = frame->payload;
  request.payload_rw = bytes + (size_t)(frame->payload - bytes);
  request.length = frame->length;
  dispatch(&request);
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Public: engine, links                                                                                         */
/* ------------------------------------------------------------------------------------------------------------- */

int zplc_proto_dev_init(zplc_proto_dev_t *dev, const zplc_proto_ops_t *ops, uint16_t idle_timeout_s) {
  uint32_t bit;

  if (dev == NULL || ops == NULL || ops->now_ms == NULL) {
    return -1;
  }
  (void)memset(dev, 0, sizeof(*dev));
  dev->ops = ops;
  dev->idle_timeout_s = idle_timeout_s == 0U ? (uint16_t)ZPLC_PROTO_SESSION_IDLE_S_DEFAULT : idle_timeout_s;
  dev->capabilities = ZPLC_PROTO_CAP_SESSION | ZPLC_PROTO_CAP_EVENTS;
  for (bit = 1U; bit < 32U; bit++) {
    const uint32_t flag = 1UL << bit;

    if ((flag & (ZPLC_PROTO_CAP_MEMORY | ZPLC_PROTO_CAP_FORCE | ZPLC_PROTO_CAP_RUN_CONTROL | ZPLC_PROTO_CAP_BREAKPOINTS |
                 ZPLC_PROTO_CAP_PROGRAM | ZPLC_PROTO_CAP_WATCH | ZPLC_PROTO_CAP_AUTH | ZPLC_PROTO_CAP_CONFIG | ZPLC_PROTO_CAP_CREDENTIALS |
                 ZPLC_PROTO_CAP_SIGNATURE)) != 0U &&
        capability_bit(ops, flag) != 0) {
      dev->capabilities |= flag;
    }
  }
  return 0;
}

void zplc_proto_link_init(zplc_proto_link_t *link, zplc_proto_dev_t *dev, uint8_t transport, zplc_proto_write_fn write,
                          void *write_context) {
  (void)memset(link, 0, sizeof(*link));
  link->dev = dev;
  link->transport = transport;
  link->write = write;
  link->write_context = write_context;
  link->payload_max = ZPLC_PROTO_PAYLOAD_MAX;
  zplc_proto_decoder_init(&link->decoder, ZPLC_PROTO_PAYLOAD_MAX);
}

static void on_frame(void *context, const zplc_proto_frame_t *frame) {
  zplc_proto_link_t *link = (zplc_proto_link_t *)context;

  handle_frame(link, frame, link->decoder.buf);
}

void zplc_proto_link_feed(zplc_proto_link_t *link, const uint8_t *data, size_t length) {
  zplc_proto_decoder_feed(&link->decoder, data, length, on_frame, link);
}

int zplc_proto_link_feed_frame(zplc_proto_link_t *link, uint8_t *frame, size_t length) {
  zplc_proto_frame_t parsed;
  const int result = zplc_proto_parse(frame, length, link->decoder.payload_max, &parsed);
  zplc_proto_decoder_stats_t *stats = &link->decoder.stats;

  if (result != 0) {
    switch (result) {
    case ZPLC_PROTO_PARSE_VERSION:
      stats->version_errors++;
      break;
    case ZPLC_PROTO_PARSE_MALFORMED:
      stats->malformed++;
      break;
    case ZPLC_PROTO_PARSE_OVERSIZE:
      stats->oversize++;
      break;
    default:
      stats->crc_errors++;
      break;
    }
    stats->resyncs++;
    return result;
  }
  stats->frames++;
  handle_frame(link, &parsed, frame);
  return 0;
}

void zplc_proto_link_lost(zplc_proto_link_t *link) {
  zplc_proto_dev_t *dev = link->dev;

  if (dev->session_open != 0U && dev->owner == link) {
    end_session(dev, (uint8_t)ZPLC_PROTO_SESSION_END_LINK_LOST, 0);
  }
  if (dev->watch_link == link) {
    dev->watch_count = 0U;
    dev->watch_link = NULL;
  }
  link->event_mask = 0U;
  link->rx_seq = 0U;
  zplc_proto_decoder_reset(&link->decoder);
}

/* ------------------------------------------------------------------------------------------------------------- */
/* Service: time, telemetry and the queue                                                                        */
/* ------------------------------------------------------------------------------------------------------------- */

static int any_link_wants(zplc_proto_link_t *const *links, size_t count, uint32_t bits) {
  size_t i;

  for (i = 0U; i < count; i++) {
    if ((links[i]->event_mask & bits) != 0U) {
      return 1;
    }
  }
  return 0;
}

/* "3" for 3: the text of a warning is built without printf, as the engine has none. */
static size_t put_decimal(char *out, uint16_t value) {
  char digits[5];
  size_t n = 0U;
  size_t i;

  do {
    digits[n++] = (char)('0' + (value % 10U));
    value = (uint16_t)(value / 10U);
  } while (value != 0U);
  for (i = 0U; i < n; i++) {
    out[i] = digits[n - 1U - i];
  }
  return n;
}

static size_t put_text_at(char *out, const char *text) {
  size_t n = strlen(text);

  memcpy(out, text, n + 1U); /* the terminator goes too; the next piece overwrites it */
  return n;
}

/* IO-007: an I/O operation the board cannot perform is skipped by the scan; the user is told, once per change. */
static void report_unsupported_io(zplc_proto_dev_t *dev, const zplc_proto_status_t *now) {
  const uint32_t total = (uint32_t)now->io_unsupported_inputs + (uint32_t)now->io_unsupported_outputs;
  char text[96]; /* 44 + 16 + 15 + 1 at the largest counts */
  size_t n = 0U;

  if (total == dev->reported_unsupported) {
    return;
  }
  dev->reported_unsupported = total;
  if (total == 0U) {
    return;
  }
  n += put_text_at(text + n, "I/O not supported by this board, skipped: ");
  n += put_decimal(text + n, now->io_unsupported_inputs);
  n += put_text_at(text + n, " input(s), ");
  n += put_decimal(text + n, now->io_unsupported_outputs);
  n += put_text_at(text + n, " output(s)");
  text[n] = '\0';
  zplc_proto_log(dev, ZPLC_PROTO_LOG_LEVEL_WARNING, text);
}

static void produce_status_events(zplc_proto_dev_t *dev) {
  zplc_proto_status_t now;
  uint8_t data[8];

  if (dev->ops->status == NULL || dev->ops->status(dev->ops->context, &now) != 0) {
    return;
  }
  if (dev->have_previous != 0U) {
    const zplc_proto_status_t *was = &dev->previous;

    if (now.state != was->state || now.fault != was->fault) {
      data[ZPLC_PROTO_EVT_STATUS_STATE_OFF] = now.state;
      data[ZPLC_PROTO_EVT_STATUS_FAULT_OFF] = now.fault;
      zplc_put_u32_le(data + ZPLC_PROTO_EVT_STATUS_CYCLES_OFF, now.cycles);
      post_internal(dev, ZPLC_PROTO_EVT_STATUS, data, ZPLC_PROTO_EVT_STATUS_FIXED);
    }
    if (now.fault != ZPLC_PROTO_FAULT_NONE && now.fault != was->fault) {
      data[ZPLC_PROTO_EVT_FAULT_FAULT_OFF] = now.fault;
      data[ZPLC_PROTO_EVT_FAULT_TASK_OFF] = now.fault_task;
      zplc_put_u16_le(data + ZPLC_PROTO_EVT_FAULT_CODE_OFF, now.fault_code);
      post_internal(dev, ZPLC_PROTO_EVT_FAULT, data, ZPLC_PROTO_EVT_FAULT_FIXED);
    }
    if (now.break_hit != 0U && (was->break_hit == 0U || was->break_pc != now.break_pc)) {
      data[ZPLC_PROTO_EVT_BREAKPOINT_TASK_OFF] = now.break_task;
      zplc_put_u16_le(data + ZPLC_PROTO_EVT_BREAKPOINT_PC_OFF, now.break_pc);
      post_internal(dev, ZPLC_PROTO_EVT_BREAKPOINT, data, ZPLC_PROTO_EVT_BREAKPOINT_FIXED);
    }
    if (now.forces != dev->known_forces) {
      post_force_event(dev, (uint8_t)ZPLC_PROTO_FORCE_CHANGE_CHANGED, 0U, now.forces);
    }
  } else {
    dev->known_forces = now.forces;
  }
  report_unsupported_io(dev, &now);
  dev->previous = now;
  dev->have_previous = 1U;
}

static void produce_watch_batch(zplc_proto_dev_t *dev, uint32_t now) {
  uint8_t data[ZPLC_PROTO_EVENT_PAYLOAD_MAX];
  size_t total = 0U;
  size_t i;
  uint32_t scan = 0U;
  int changed;

  if (dev->watch_count == 0U) {
    return;
  }
  if (dev->watch_period_ms != 0U && elapsed_ms(now, dev->watch_last_ms) < dev->watch_period_ms) {
    return;
  }
  for (i = 0U; i < dev->watch_count; i++) {
    total += dev->watch_extents[i].length;
  }
  if (dev->ops->mem_read_many != NULL) {
    if (dev->ops->mem_read_many(dev->ops->context, dev->watch_extents, dev->watch_count, data + ZPLC_PROTO_EVT_WATCH_FIXED, &scan) != 0) {
      return;
    }
  } else {
    size_t offset = ZPLC_PROTO_EVT_WATCH_FIXED;

    for (i = 0U; i < dev->watch_count; i++) {
      if (dev->ops->mem_read(dev->ops->context, dev->watch_extents[i].address, data + offset, dev->watch_extents[i].length) != 0) {
        return;
      }
      offset += dev->watch_extents[i].length;
    }
    if (dev->previous.cycles != 0U || dev->have_previous != 0U) {
      scan = dev->previous.cycles;
    }
  }
  changed = dev->watch_have_last == 0U || memcmp(dev->watch_last, data + ZPLC_PROTO_EVT_WATCH_FIXED, total) != 0;
  dev->watch_last_ms = now;
  if (dev->watch_period_ms == 0U && !changed) {
    return;
  }
  (void)memcpy(dev->watch_last, data + ZPLC_PROTO_EVT_WATCH_FIXED, total);
  dev->watch_have_last = 1U;
  zplc_put_u32_le(data + ZPLC_PROTO_EVT_WATCH_CYCLE_OFF, scan);
  post_internal(dev, ZPLC_PROTO_EVT_WATCH, data, ZPLC_PROTO_EVT_WATCH_FIXED + total);
}

static void drain_queue(zplc_proto_dev_t *dev, zplc_proto_link_t *const *links, size_t link_count) {
  for (;;) {
    zplc_proto_event_t event;
    uint32_t mask;
    size_t i;

    if (!queue_lock(dev)) {
      return;
    }
    if (dev->queue_count == 0U) {
      queue_unlock(dev);
      return;
    }
    event = dev->queue[dev->queue_head];
    dev->queue_head = (dev->queue_head + 1U) % ZPLC_PROTO_EVENT_QUEUE;
    dev->queue_count--;
    queue_unlock(dev);

    mask = mask_of(event.id);
    for (i = 0U; i < link_count; i++) {
      zplc_proto_link_t *link = links[i];
      const int wanted = event.id == ZPLC_PROTO_EVT_DROPPED ? link->event_mask != 0U : (link->event_mask & mask) != 0U;

      if (wanted) {
        send_event(link, event.id, event.data, event.length);
      }
    }
  }
}

void zplc_proto_dev_service(zplc_proto_dev_t *dev, zplc_proto_link_t *const *links, size_t link_count) {
  const uint32_t now = now_ms(dev);

  /* idle session */
  if (dev->session_open != 0U && elapsed_ms(now, dev->last_activity_ms) >= (uint32_t)dev->idle_timeout_s * 1000U) {
    end_session(dev, (uint8_t)ZPLC_PROTO_SESSION_END_IDLE, 1);
  }
  /* challenge that was not used */
  if (dev->challenge_valid != 0U && elapsed_ms(now, dev->challenge_ms) > ZPLC_PROTO_CHALLENGE_S * 1000U) {
    dev->challenge_valid = 0U;
    zplc_secure_zero(dev->challenge, sizeof(dev->challenge));
  }
  /* telemetry the runtime does not push: the engine reads it, here, and not on the scan */
  if (any_link_wants(links, link_count,
                     ZPLC_PROTO_EVTMASK_STATUS | ZPLC_PROTO_EVTMASK_FAULT | ZPLC_PROTO_EVTMASK_BREAKPOINT | ZPLC_PROTO_EVTMASK_FORCE |
                         ZPLC_PROTO_EVTMASK_LOG)) {
    produce_status_events(dev);
  }
  if (dev->watch_link != NULL && (dev->watch_link->event_mask & ZPLC_PROTO_EVTMASK_WATCH) != 0U) {
    produce_watch_batch(dev, now);
  }
  /* events lost since the last report, said once there is room */
  if (queue_lock(dev)) {
    if (dev->dropped_since_report != 0U && dev->queue_count < ZPLC_PROTO_EVENT_QUEUE) {
      uint8_t data[4];
      const uint32_t lost = dev->dropped_since_report;

      zplc_put_u32_le(data, lost);
      dev->dropped_since_report = 0U;
      dev->dropped_total += lost;
      (void)queue_push_locked(dev, ZPLC_PROTO_EVT_DROPPED, data, sizeof(data));
    }
    queue_unlock(dev);
  }
  drain_queue(dev, links, link_count);
}
