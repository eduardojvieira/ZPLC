/**
 * @file zplc_plant.c
 * @brief Plant I/O mode: entry, frame validation, staging, the scan's latch, the staleness bound and the exit rule
 *        (LNK-006, LNK-011, LNK-015, LNK-018; rules R-M6-1 to R-M6-7 of plan-m6.md).
 *
 * SPDX-License-Identifier: MIT
 *
 * One entry at a time, all state in static storage sized by ZPLC_PLANT_MAX_SLOTS. A frame is validated whole before
 * a byte of it is kept; the scan applies the kept frame at its input latch through the force-aware write of the
 * core. The scan never waits: it takes the plant lock with a try and, when it does not get it, goes on with the
 * values already in the image and counts the scan as late (that count is private to the scan until it can be merged
 * under the lock, so no shared field is written without it).
 *
 * REAL values are copied as four bytes and checked for finiteness by their exponent bits: no float arithmetic, no
 * libm.
 */

#include <string.h>

#include "zplc_core.h"
#include "zplc_exchange.h"
#include "zplc_isa.h"
#include "zplc_plant.h"
#include "zplc_proto_defs.h"

#define SLOTS ZPLC_PLANT_MAX_SLOTS
#define BITMAP_MAX ((SLOTS + 7U) / 8U)
#define VALUES_MAX (BITMAP_MAX + 4U * SLOTS)
#define SYS_REG_OFF ((uint32_t)(ZPLC_SYS_CYCLE_TIME - ZPLC_MEM_IPI_BASE))
#define TIMEOUT_MIN_MS 50U
#define TIMEOUT_MAX_MS 2000U
#define REJECT_RUN_EXIT 8U
#define ENTER_FIXED 4U
#define DESC_BYTES 3U
#define FRAME_FIXED 6U
#define FRAME_RSP_FIXED 13U
#define ENTER_RSP_BYTES 9U

#define T_BOOL 0U
#define T_INT 1U
#define T_REAL 2U

typedef struct {
  uint16_t off;  /* byte offset in IPI (input) or OPI (output) */
  uint16_t vpos; /* BOOL: bit index in the bitmap; numeric: byte position in the value area */
  uint8_t type;
  uint8_t bit; /* BOOL only */
  uint8_t len; /* bytes in the image */
} slot_t;

static struct {
  zplc_plant_hooks_t hooks;
  slot_t in[SLOTS];
  slot_t out[SLOTS];
  uint8_t n_in, n_out;
  uint8_t in_bool, out_bool;
  uint16_t in_bytes, out_bytes;
  uint16_t plant_id, next_id;
  uint16_t timeout_ms;
  uint8_t staged[VALUES_MAX];
  uint32_t staged_seq, last_seq, applied_seq;
  uint8_t fresh, have_seq, reject_run, missed;
  uint32_t frames, scans;
  uint16_t rejected, late;
} g;

/* Read by other threads without the lock, written by one side each; byte and word sized. */
static volatile uint8_t g_active;
static volatile uint8_t g_fired;
static volatile uint8_t g_mirror;
static volatile uint8_t g_reason;
static volatile uint32_t g_last_ms;
static volatile uint16_t g_miss; /* scans that could not take the lock; written by the scan only */

static int take(void) { return g.hooks.lock == NULL ? 0 : g.hooks.lock(g.hooks.ctx); }
static void give(void) {
  if (g.hooks.unlock != NULL) {
    g.hooks.unlock(g.hooks.ctx);
  }
}
static uint32_t now(void) { return g.hooks.now_ms == NULL ? 0U : g.hooks.now_ms(g.hooks.ctx); }

static uint16_t rd16(const uint8_t *p) { return (uint16_t)((uint16_t)p[0] | (uint16_t)((uint16_t)p[1] << 8)); }
static uint32_t rd32(const uint8_t *p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }
static void wr16(uint8_t *p, uint32_t v) {
  p[0] = (uint8_t)v;
  p[1] = (uint8_t)(v >> 8);
}
static void wr32(uint8_t *p, uint32_t v) {
  wr16(p, v);
  wr16(p + 2, v >> 16);
}

void zplc_plant_init(const zplc_plant_hooks_t *hooks) {
  memset(&g, 0, sizeof(g));
  if (hooks != NULL) {
    g.hooks = *hooks;
  }
  g_active = 0U;
  g_fired = 0U;
  g_mirror = 0U;
  g_reason = (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED;
  g_last_ms = 0U;
  g_miss = 0U;
}

static uint8_t type_len(uint8_t type) { return type == T_BOOL ? 1U : (type == T_INT ? 2U : 4U); }

/** Overlap rule: a numeric slot owns all its bytes; two BOOLs of one byte only collide on the same bit. */
static int overlaps(const slot_t *a, const slot_t *b) {
  uint32_t a_end = (uint32_t)a->off + a->len;
  uint32_t b_end = (uint32_t)b->off + b->len;

  if (a->off >= b_end || b->off >= a_end) {
    return 0;
  }
  if (a->type == T_BOOL && b->type == T_BOOL) {
    return a->bit == b->bit;
  }
  return 1;
}

/** Decode and check one direction. Types and reserved bits were checked already; this is the range rule. */
static int build_slots(const uint8_t *d, uint8_t n, slot_t *s, uint32_t limit, uint8_t *n_bool, uint16_t *bytes) {
  uint8_t bools = 0U;
  uint16_t pos;

  for (uint8_t i = 0U; i < n; i++) {
    s[i].off = rd16(d + DESC_BYTES * i);
    s[i].type = (uint8_t)(d[DESC_BYTES * i + 2U] & 0x03U);
    s[i].bit = (uint8_t)((d[DESC_BYTES * i + 2U] >> 2) & 0x07U);
    s[i].len = type_len(s[i].type);
    if ((uint32_t)s[i].off + s[i].len > limit) {
      return (int)ZPLC_PROTO_ERR_RANGE;
    }
    if (s[i].type == T_BOOL) {
      bools++;
    }
  }
  for (uint8_t i = 0U; i < n; i++) {
    for (uint8_t j = (uint8_t)(i + 1U); j < n; j++) {
      if (overlaps(&s[i], &s[j])) {
        return (int)ZPLC_PROTO_ERR_RANGE;
      }
    }
  }
  pos = (uint16_t)((bools + 7U) / 8U);
  bools = 0U;
  for (uint8_t i = 0U; i < n; i++) {
    if (s[i].type == T_BOOL) {
      s[i].vpos = bools++;
    } else {
      s[i].vpos = pos;
      pos = (uint16_t)(pos + s[i].len);
    }
  }
  *n_bool = bools;
  *bytes = pos;
  return 0;
}

int zplc_plant_enter(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len) {
  int rc = (int)ZPLC_PROTO_ERR_BAD_REQUEST;
  uint8_t n_in, n_out;
  uint16_t timeout;

  if (rsp_len != NULL) {
    *rsp_len = 0U;
  }
  if (req == NULL || rsp == NULL || rsp_len == NULL) {
    return (int)ZPLC_PROTO_ERR_BAD_REQUEST;
  }
  if (take() != 0) {
    return (int)ZPLC_PROTO_ERR_BUSY;
  }
  if (g_active != 0U) {
    rc = (int)ZPLC_PROTO_ERR_STATE;
    goto out;
  }
  if (len < ENTER_FIXED) {
    goto out;
  }
  n_in = req[2];
  n_out = req[3];
  if (n_in > SLOTS || n_out > SLOTS || len != ENTER_FIXED + DESC_BYTES * ((uint16_t)n_in + (uint16_t)n_out)) {
    goto out;
  }
  for (uint16_t i = 0U; i < (uint16_t)n_in + (uint16_t)n_out; i++) {
    uint8_t spec = req[ENTER_FIXED + DESC_BYTES * i + 2U];
    uint8_t type = (uint8_t)(spec & 0x03U);
    if (type > T_REAL || (spec & 0xE0U) != 0U || (type != T_BOOL && (spec & 0x1CU) != 0U)) {
      goto out;
    }
  }
  rc = build_slots(req + ENTER_FIXED, n_in, g.in, SYS_REG_OFF, &g.in_bool, &g.in_bytes);
  if (rc == 0) {
    rc = build_slots(req + ENTER_FIXED + DESC_BYTES * n_in, n_out, g.out, ZPLC_MEM_OPI_SIZE, &g.out_bool, &g.out_bytes);
  }
  if (rc != 0) {
    goto out;
  }
  timeout = rd16(req);
  g.timeout_ms = timeout < TIMEOUT_MIN_MS ? TIMEOUT_MIN_MS : (timeout > TIMEOUT_MAX_MS ? TIMEOUT_MAX_MS : timeout);
  g.n_in = n_in;
  g.n_out = n_out;
  g.next_id = (uint16_t)(g.next_id + 1U);
  if (g.next_id == 0U) {
    g.next_id = 1U;
  }
  g.plant_id = g.next_id;
  g.fresh = 0U;
  g.have_seq = 0U;
  g.reject_run = 0U;
  g.missed = 0U;
  g.frames = 0U;
  g.scans = 0U;
  g.rejected = 0U;
  g.late = 0U;
  g.applied_seq = 0U;
  g_miss = 0U;
  g_last_ms = now();
  g_fired = 0U;
  g_mirror = 0U;
  g_reason = (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED;
  wr16(rsp, g.plant_id);
  wr16(rsp + 2, g.in_bytes);
  wr16(rsp + 4, g.out_bytes);
  rsp[6] = (uint8_t)SLOTS;
  wr16(rsp + 7, g.timeout_ms);
  *rsp_len = ENTER_RSP_BYTES;
  g_active = 1U;
  rc = 0;
out:
  give();
  return rc;
}

static int reject(void) {
  if (g.rejected != 0xFFFFU) {
    g.rejected++;
  }
  if (++g.reject_run >= REJECT_RUN_EXIT && g_fired == 0U) {
    g_reason = (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_PROTOCOL;
    g_fired = 1U;
  }
  return (int)ZPLC_PROTO_ERR_BAD_REQUEST;
}

/** R-M6-2 checks, in order. Returns 0 when the frame may be kept. */
static int check_frame(const uint8_t *req, uint16_t len) {
  const uint8_t *v = req + FRAME_FIXED;
  uint32_t seq, diff;

  if (len < 2U || rd16(req) != g.plant_id) {
    return 1;
  }
  if (len != FRAME_FIXED + g.in_bytes) {
    return 1;
  }
  if ((g.in_bool & 7U) != 0U && (v[(g.in_bool - 1U) / 8U] >> (g.in_bool & 7U)) != 0U) {
    return 1;
  }
  for (uint8_t i = 0U; i < g.n_in; i++) {
    if (g.in[i].type == T_REAL && (rd32(v + g.in[i].vpos) & 0x7F800000UL) == 0x7F800000UL) {
      return 1;
    }
  }
  seq = rd32(req + 2);
  diff = seq - g.last_seq;
  if (g.have_seq != 0U && (diff == 0U || diff > 0x7FFFFFFFUL)) {
    return 1;
  }
  return 0;
}

int zplc_plant_frame(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len) {
  slot_t out[SLOTS];
  uint8_t n_out, flags;
  uint16_t out_bytes, late, rejected;
  uint32_t applied, scans;
  int rc;

  if (rsp_len != NULL) {
    *rsp_len = 0U;
  }
  if (req == NULL || rsp == NULL || rsp_len == NULL) {
    return (int)ZPLC_PROTO_ERR_BAD_REQUEST;
  }
  if (take() != 0) {
    return (int)ZPLC_PROTO_ERR_BUSY;
  }
  if (g_active == 0U || g_fired != 0U) {
    give();
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  if (check_frame(req, len) != 0) {
    rc = reject();
    give();
    return rc;
  }
  memcpy(g.staged, req + FRAME_FIXED, g.in_bytes);
  g.staged_seq = rd32(req + 2);
  g.last_seq = g.staged_seq;
  g.have_seq = 1U;
  g.fresh = 1U;
  g.reject_run = 0U;
  g.frames++;
  g_last_ms = now();
  applied = g.applied_seq;
  scans = g.scans + g_miss;
  late = (uint16_t)(g.late + g_miss);
  rejected = g.rejected;
  flags = (uint8_t)((g_mirror != 0U ? 1U : 0U) | (g.missed != 0U ? 2U : 0U));
  g.missed = 0U;
  n_out = g.n_out;
  out_bytes = g.out_bytes;
  memcpy(out, g.out, sizeof(slot_t) * n_out);
  give();

  /* R-M6-7: every output of the response comes from one publication of the exchange. The plant lock is not held
   * here: image lock, then exchange lock; the plant lock is never held across the exchange's. */
  memset(rsp + FRAME_RSP_FIXED, 0, out_bytes);
  if (zplc_exchange_read_lock() != 0) {
    return (int)ZPLC_PROTO_ERR_BUSY;
  }
  for (uint8_t i = 0U; i < n_out; i++) {
    uint8_t *dst = rsp + FRAME_RSP_FIXED;
    uint8_t b[4];

    if (zplc_exchange_read_locked((uint16_t)(ZPLC_MEM_OPI_BASE + out[i].off), b, out[i].len) != 0) {
      zplc_exchange_read_unlock();
      return (int)ZPLC_PROTO_ERR_FAILED;
    }
    if (out[i].type == T_BOOL) {
      if (((b[0] >> out[i].bit) & 1U) != 0U) {
        dst[out[i].vpos / 8U] = (uint8_t)(dst[out[i].vpos / 8U] | (1U << (out[i].vpos % 8U)));
      }
    } else {
      memcpy(dst + out[i].vpos, b, out[i].len);
    }
  }
  zplc_exchange_read_unlock();
  wr32(rsp, applied);
  wr32(rsp + 4, scans);
  rsp[8] = flags;
  wr16(rsp + 9, late);
  wr16(rsp + 11, rejected);
  *rsp_len = (uint16_t)(FRAME_RSP_FIXED + out_bytes);
  return 0;
}

int zplc_plant_exit(uint8_t reason) {
  int held = take() == 0;
  int rc = (int)ZPLC_PROTO_ERR_STATE;

  /* An exit must not fail: when the lock is not to be had it still completes (it only clears byte flags). */
  if (g_active != 0U) {
    if (g_fired == 0U) {
      g_reason = reason;
    }
    g_fired = 0U;
    g_mirror = 0U;
    g_active = 0U;
    rc = 0;
  }
  if (held) {
    give();
  }
  return rc;
}

void zplc_plant_set_mirror(uint8_t on) {
  if (g_active != 0U) {
    g_mirror = on != 0U ? 1U : 0U;
  }
}

int zplc_plant_active(void) { return g_active != 0U; }

int zplc_plant_holds_outputs(void) { return g_active != 0U && (g_fired != 0U || g_mirror == 0U); }

void zplc_plant_latch(void) {
  uint8_t *ipi;

  if (g_active == 0U || g_fired != 0U) {
    return;
  }
  if (take() != 0) {
    g_miss++;
    return;
  }
  if (g_active != 0U && g_fired == 0U) {
    g.scans += (uint32_t)g_miss + 1U;
    g.late = (uint16_t)(g.late + g_miss);
    g_miss = 0U;
    ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    if (g.fresh != 0U && ipi != NULL) {
      for (uint8_t i = 0U; i < g.n_in; i++) {
        const slot_t *s = &g.in[i];

        if (s->type == T_BOOL) {
          uint8_t byte = ipi[s->off];
          if (((g.staged[s->vpos / 8U] >> (s->vpos % 8U)) & 1U) != 0U) {
            byte = (uint8_t)(byte | (1U << s->bit));
          } else {
            byte = (uint8_t)(byte & ~(1U << s->bit));
          }
          (void)zplc_force_write_bytes((uint16_t)(ZPLC_MEM_IPI_BASE + s->off), &byte, 1U);
        } else {
          (void)zplc_force_write_bytes((uint16_t)(ZPLC_MEM_IPI_BASE + s->off), g.staged + s->vpos, s->len);
        }
      }
      g.fresh = 0U;
      g.applied_seq = g.staged_seq;
    } else {
      g.late++;
      g.missed = 1U;
    }
  }
  give();
}

int zplc_plant_tick(void) {
  uint32_t age;

  if (g_active == 0U) {
    return 0;
  }
  if (g_fired != 0U) {
    return 1;
  }
  age = now() - g_last_ms;
  if (age > g.timeout_ms) {
    g_reason = (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_TIMEOUT;
    g_fired = 1U;
    return 1;
  }
  return 0;
}

uint8_t zplc_plant_exit_reason(void) { return g_reason; }

void zplc_plant_get_stats(zplc_plant_stats_t *out) {
  uint32_t age;
  int held;

  if (out == NULL) {
    return;
  }
  held = take() == 0;
  out->frames = g.frames;
  out->applied_seq = g.applied_seq;
  out->rejected = g.rejected;
  out->late = (uint16_t)(g.late + g_miss);
  age = now() - g_last_ms;
  out->age_ms = (uint16_t)(age > 0xFFFFU ? 0xFFFFU : age);
  if (held) {
    give();
  }
}
