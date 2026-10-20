/**
 * @file zplc_io_trace.h
 * @brief A trace of the process image recorded on the device, one sample per scan, read afterwards (LRN-024).
 *
 * SPDX-License-Identifier: MIT
 *
 * The hardware check of a lesson compares what a board did with the lesson's reference scenario. Read over the serial
 * link a hundred milliseconds apart, the board's inputs and outputs are too coarse for a scenario whose assertions are
 * ten milliseconds apart. This trace is recorded where the scan happens: the scheduler core calls
 * zplc_io_trace_sched_hook() through its trace port, and at the end of every scan that wrote its outputs the trace
 * keeps one sample: the instant the scan latched its inputs, the scan's number in its run (1 is the first scan after
 * a start), and the first bytes of the input and the output images. Studio reads the samples afterwards, in chunks.
 *
 * The trace only reads. Arming, reading and clearing it never write PLC memory, never force and never start or stop
 * a program.
 *
 * Storage is a ring of fixed-size samples in a buffer the platform supplies: the newest sample overwrites the oldest
 * once the ring is full, and every sample has a sequence number, counted from 0 at the arm, so a reader that fell
 * behind sees which samples it lost. One writer (the scan) and readers on threads that cannot preempt it in the middle
 * of a sample (a lower priority on one core, or the same thread on the host): a read copies the slot and then checks
 * that the writer has not reached it again meanwhile.
 *
 * Cost per scan: a clock read at the input latch; at the output commit, two reads of the image and one copy of at most
 * 8 + 2 x ZPLC_IO_TRACE_MAX_IO_BYTES bytes. No loop depends on the capacity. A trace that is not armed costs a test.
 */

#ifndef ZPLC_IO_TRACE_H
#define ZPLC_IO_TRACE_H

#include <stdint.h>

#include "zplc_sched_core.h"

#ifdef __cplusplus
extern "C" {
#endif

/** @brief The most bytes of the input image, and of the output image, that one sample holds. */
#define ZPLC_IO_TRACE_MAX_IO_BYTES 32U
/** @brief Bytes of a stored sample besides its image bytes: the time (u32) and the scan number (u32). */
#define ZPLC_IO_TRACE_SAMPLE_HEADER 8U

/** @brief Error: an argument is out of range (no bytes, too many bytes, a capacity the buffer cannot hold). */
#define ZPLC_IO_TRACE_ERR_ARGS (-22)
/** @brief Error: no scheduler feeds this trace on this build, so it would never record. */
#define ZPLC_IO_TRACE_ERR_UNFED (-19)

/** @brief One sample, as a reader gets it. */
typedef struct {
  uint32_t t_us;  /**< when the scan latched its inputs, in microseconds since the trace was armed */
  uint32_t batch; /**< the scan's number in its run: 1 is the first scan after a start (RUN) */
  uint8_t in[ZPLC_IO_TRACE_MAX_IO_BYTES];  /**< the first in_bytes bytes of the input image */
  uint8_t out[ZPLC_IO_TRACE_MAX_IO_BYTES]; /**< the first out_bytes bytes of the output image */
} zplc_io_trace_sample_t;

/** @brief A trace. The platform owns it and its storage; every member is private to zplc_io_trace.c. */
typedef struct {
  uint8_t *storage;
  uint32_t storage_size;
  /** The clock of the timestamps, in microseconds. */
  uint64_t (*now_us)(void *ctx);
  void *clock_ctx;
  /** Reads PLC memory: the snapshot of the last commit on a target, the image itself on the host. 0 on success. */
  int (*read)(uint16_t addr, uint8_t *out, uint16_t size);
  uint8_t fed;              /**< a scheduler calls the hook of this trace */
  volatile uint8_t armed;   /**< samples are kept */
  uint8_t latched;          /**< the scan in progress latched its inputs while armed */
  uint16_t in_bytes;
  uint16_t out_bytes;
  uint32_t capacity;        /**< samples the ring holds */
  volatile uint32_t written; /**< samples kept since the arm; the next one has this sequence number */
  uint64_t armed_us;
  uint64_t latch_us;
  uint32_t latch_batch;
} zplc_io_trace_t;

/** @brief What a reader is told about a trace. */
typedef struct {
  uint8_t fed;           /**< a scheduler feeds the trace: arming it records */
  uint8_t armed;
  uint16_t in_bytes;
  uint16_t out_bytes;
  uint32_t capacity;     /**< samples the ring holds while armed */
  uint32_t written;      /**< samples kept since the arm */
  uint32_t first;        /**< the oldest sequence number still held */
  uint32_t storage_size; /**< bytes of the ring */
} zplc_io_trace_status_t;

/** @brief Prepare a trace over a buffer. It is not fed and not armed. */
void zplc_io_trace_init(zplc_io_trace_t *trace, uint8_t *storage, uint32_t storage_size,
                        uint64_t (*now_us)(void *ctx), void *clock_ctx,
                        int (*read)(uint16_t addr, uint8_t *out, uint16_t size));

/** @brief Say that a scheduler calls the hook with this trace. Returns the trace, for zplc_sched_core_set_trace(). */
zplc_io_trace_t *zplc_io_trace_attach(zplc_io_trace_t *trace);

/**
 * @brief Empty the trace and start keeping samples of the first in_bytes input and out_bytes output bytes.
 * @param capacity samples to keep; 0 keeps as many as the buffer holds
 * @return the capacity armed, ZPLC_IO_TRACE_ERR_ARGS, or ZPLC_IO_TRACE_ERR_UNFED
 */
int zplc_io_trace_arm(zplc_io_trace_t *trace, uint32_t capacity, uint16_t in_bytes, uint16_t out_bytes);

/** @brief Stop keeping samples and forget the ones kept. */
void zplc_io_trace_clear(zplc_io_trace_t *trace);

void zplc_io_trace_get_status(const zplc_io_trace_t *trace, zplc_io_trace_status_t *status);

/**
 * @brief Copy the sample with sequence number seq.
 * @return 0, or -1 when the trace does not hold it (not yet written, or overwritten)
 */
int zplc_io_trace_get(const zplc_io_trace_t *trace, uint32_t seq, zplc_io_trace_sample_t *sample);

/** @brief The trace sink of the scheduler core (zplc_sched_trace_fn); ctx is the zplc_io_trace_t. */
void zplc_io_trace_sched_hook(void *ctx, zplc_sched_trace_kind_t kind, uint16_t task_id, uint64_t a, uint64_t b);

#ifdef CONFIG_ZPLC_IO_TRACE
/**
 * @brief The trace of the board: CONFIG_ZPLC_IO_TRACE_BUFFER_SIZE bytes, timestamps from the HAL tick (whole
 *        milliseconds), and reads from the snapshot of the exchange (RT-010). The scheduler attaches it.
 */
zplc_io_trace_t *zplc_io_trace_board(void);
#endif

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_IO_TRACE_H */
