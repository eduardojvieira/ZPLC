/**
 * @file zplc_io_trace.c
 * @brief The per-scan I/O trace (LRN-024): see zplc_io_trace.h.
 *
 * SPDX-License-Identifier: MIT
 *
 * A stored sample is: the time (u32, little-endian), the scan number (u32), in_bytes input bytes, out_bytes output
 * bytes. Sample n lives in slot n % capacity.
 */

#include <string.h>

#include "zplc_core.h"
#include "zplc_io_trace.h"

#ifdef CONFIG_ZPLC_IO_TRACE
#include "zplc_exchange.h"
#include "zplc_hal.h"
#endif

static void put_u32(uint8_t *out, uint32_t value) {
  out[0] = (uint8_t)value;
  out[1] = (uint8_t)(value >> 8);
  out[2] = (uint8_t)(value >> 16);
  out[3] = (uint8_t)(value >> 24);
}

static uint32_t get_u32(const uint8_t *in) {
  return (uint32_t)in[0] | ((uint32_t)in[1] << 8) | ((uint32_t)in[2] << 16) | ((uint32_t)in[3] << 24);
}

static uint32_t sample_size(const zplc_io_trace_t *trace) {
  return ZPLC_IO_TRACE_SAMPLE_HEADER + (uint32_t)trace->in_bytes + (uint32_t)trace->out_bytes;
}

/* Where sample seq lives: slot seq % capacity. */
static uint8_t *slot_of(const zplc_io_trace_t *trace, uint32_t seq) {
  return trace->storage + (size_t)(seq % trace->capacity) * (size_t)sample_size(trace);
}

static uint32_t first_held(const zplc_io_trace_t *trace, uint32_t written) {
  return written > trace->capacity ? written - trace->capacity : 0U;
}

void zplc_io_trace_init(zplc_io_trace_t *trace, uint8_t *storage, uint32_t storage_size,
                        uint64_t (*now_us)(void *ctx), void *clock_ctx,
                        int (*read)(uint16_t addr, uint8_t *out, uint16_t size)) {
  if (trace == NULL) {
    return;
  }
  memset(trace, 0, sizeof(*trace));
  trace->storage = storage;
  trace->storage_size = storage != NULL ? storage_size : 0U;
  trace->now_us = now_us;
  trace->clock_ctx = clock_ctx;
  trace->read = read;
}

zplc_io_trace_t *zplc_io_trace_attach(zplc_io_trace_t *trace) {
  if (trace != NULL) {
    trace->fed = 1U;
  }
  return trace;
}

int zplc_io_trace_arm(zplc_io_trace_t *trace, uint32_t capacity, uint16_t in_bytes, uint16_t out_bytes) {
  uint32_t size;
  uint32_t fits;

  if (trace == NULL || trace->now_us == NULL || trace->read == NULL) {
    return ZPLC_IO_TRACE_ERR_ARGS;
  }
  if (trace->fed == 0U) {
    return ZPLC_IO_TRACE_ERR_UNFED;
  }
  if ((in_bytes == 0U && out_bytes == 0U) || in_bytes > ZPLC_IO_TRACE_MAX_IO_BYTES ||
      out_bytes > ZPLC_IO_TRACE_MAX_IO_BYTES) {
    return ZPLC_IO_TRACE_ERR_ARGS;
  }
  size = ZPLC_IO_TRACE_SAMPLE_HEADER + (uint32_t)in_bytes + (uint32_t)out_bytes;
  fits = trace->storage_size / size;
  if (capacity == 0U) {
    capacity = fits;
  }
  if (capacity == 0U || capacity > fits || capacity > 0x7FFFFFFFUL) {
    return ZPLC_IO_TRACE_ERR_ARGS;
  }
  /* The scan skips a trace that is not armed: it is disarmed while its shape changes. */
  trace->armed = 0U;
  trace->latched = 0U;
  trace->in_bytes = in_bytes;
  trace->out_bytes = out_bytes;
  trace->capacity = capacity;
  trace->written = 0U;
  trace->armed_us = trace->now_us(trace->clock_ctx);
  trace->armed = 1U;
  return (int)capacity;
}

void zplc_io_trace_clear(zplc_io_trace_t *trace) {
  if (trace == NULL) {
    return;
  }
  trace->armed = 0U;
  trace->latched = 0U;
  trace->capacity = 0U;
  trace->written = 0U;
}

void zplc_io_trace_get_status(const zplc_io_trace_t *trace, zplc_io_trace_status_t *status) {
  uint32_t written;

  if (status == NULL) {
    return;
  }
  memset(status, 0, sizeof(*status));
  if (trace == NULL) {
    return;
  }
  written = trace->written;
  status->fed = trace->fed;
  status->armed = trace->armed;
  status->in_bytes = trace->in_bytes;
  status->out_bytes = trace->out_bytes;
  status->capacity = trace->capacity;
  status->written = written;
  status->first = first_held(trace, written);
  status->storage_size = trace->storage_size;
}

int zplc_io_trace_get(const zplc_io_trace_t *trace, uint32_t seq, zplc_io_trace_sample_t *sample) {
  const uint8_t *slot;
  uint32_t written;

  if (trace == NULL || sample == NULL || trace->capacity == 0U) {
    return -1;
  }
  written = trace->written;
  if (seq >= written || seq < first_held(trace, written)) {
    return -1;
  }
  memset(sample, 0, sizeof(*sample));
  slot = slot_of(trace, seq);
  sample->t_us = get_u32(slot);
  sample->batch = get_u32(slot + 4);
  memcpy(sample->in, slot + ZPLC_IO_TRACE_SAMPLE_HEADER, trace->in_bytes);
  memcpy(sample->out, slot + ZPLC_IO_TRACE_SAMPLE_HEADER + trace->in_bytes, trace->out_bytes);
  /* The scan may have reached this slot again while it was copied: then the copy is not sample seq. */
  return seq < first_held(trace, trace->written) ? -1 : 0;
}

void zplc_io_trace_sched_hook(void *ctx, zplc_sched_trace_kind_t kind, uint16_t task_id, uint64_t a, uint64_t b) {
  zplc_io_trace_t *trace = (zplc_io_trace_t *)ctx;
  uint8_t *slot;
  uint8_t *image;
  uint32_t seq;

  (void)task_id;
  (void)b;
  if (trace == NULL || trace->armed == 0U) {
    return;
  }
  if (kind == ZPLC_SCHED_TRACE_LATCH) {
    /* The scan's time is its input latch: the instant the scenario's tick stands for. */
    trace->latch_us = trace->now_us(trace->clock_ctx);
    trace->latch_batch = (uint32_t)a;
    trace->latched = 1U;
    return;
  }
  if (kind != ZPLC_SCHED_TRACE_COMMIT || trace->latched == 0U) {
    return;
  }
  /* The outputs of the scan were written: the sample is the image the scan latched and wrote. */
  trace->latched = 0U;
  seq = trace->written;
  slot = slot_of(trace, seq);
  image = slot + ZPLC_IO_TRACE_SAMPLE_HEADER;
  put_u32(slot, (uint32_t)(trace->latch_us - trace->armed_us));
  put_u32(slot + 4, trace->latch_batch);
  if ((trace->in_bytes != 0U && trace->read(ZPLC_MEM_IPI_BASE, image, trace->in_bytes) != 0) ||
      (trace->out_bytes != 0U && trace->read(ZPLC_MEM_OPI_BASE, image + trace->in_bytes, trace->out_bytes) != 0)) {
    return; /* an image that cannot be read gives no sample; the next sample takes the slot */
  }
  trace->written = seq + 1U;
}

#ifdef CONFIG_ZPLC_IO_TRACE
static uint8_t board_storage[CONFIG_ZPLC_IO_TRACE_BUFFER_SIZE];

static uint64_t board_now_us(void *ctx) {
  (void)ctx;
  return (uint64_t)zplc_hal_tick() * 1000U;
}

zplc_io_trace_t *zplc_io_trace_board(void) {
  static zplc_io_trace_t board;

  if (board.storage == NULL) {
    zplc_io_trace_init(&board, board_storage, (uint32_t)sizeof(board_storage), board_now_us, NULL,
                       zplc_exchange_read);
  }
  return &board;
}
#endif
