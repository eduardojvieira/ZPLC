/**
 * @file zplc_plant.h
 * @brief Plant I/O mode: inputs bound in the plant map take their values from a plant link, the output image is
 *        published to the plant, and the physical outputs stay safe unless a person turns mirroring on (LNK-007,
 *        LNK-010, LNK-011, LNK-018).
 *
 * SPDX-License-Identifier: MIT
 *
 * Portable C99: no Zephyr header, no allocation. The locks and the clock are hooks, as in zplc_exchange.h. The
 * scan never waits for the link: the latch takes the plant lock with a try and works for a bounded number of
 * bytes. Lock order, everywhere: image lock, then plant lock.
 *
 * The wire is in zplc_proto_defs.h (ZPLC_PROTO_MSG_PLANT_*), generated from tools/contract/protocol.json.
 * Entry, frame validation, latch, staleness bound, hold and exit follow rules R-M6-1 to R-M6-7 of
 * specs/012-zplc-2-1-plant-simulation/plan-m6.md.
 */

#ifndef ZPLC_PLANT_H
#define ZPLC_PLANT_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** @brief Slots per direction (inputs and outputs). */
#ifdef CONFIG_ZPLC_PLANT_MAX_SLOTS
#define ZPLC_PLANT_MAX_SLOTS ((uint32_t)CONFIG_ZPLC_PLANT_MAX_SLOTS)
#else
#define ZPLC_PLANT_MAX_SLOTS 32U
#endif

/**
 * @brief Hooks of the module. @c lock may fail and the scan never waits for it; @c now_ms is a monotonic clock.
 */
typedef struct {
  void *ctx;
  int (*lock)(void *ctx);
  void (*unlock)(void *ctx);
  uint32_t (*now_ms)(void *ctx);
} zplc_plant_hooks_t;

/** @brief Counters of the mode. */
typedef struct {
  uint32_t frames;      /**< frames accepted */
  uint32_t applied_seq; /**< the last sequence a scan latched */
  uint16_t rejected;    /**< frames rejected */
  uint16_t late;        /**< scans that found no new frame, or could not take the lock */
  uint16_t age_ms;      /**< milliseconds since the last accepted frame (saturated) */
} zplc_plant_stats_t;

/** @brief Inactive, counters zero. */
void zplc_plant_init(const zplc_plant_hooks_t *hooks);

/** @brief PLANT_ENTER: request payload in, response payload (after the status byte) out. ZPLC_PROTO_ERR_*. */
int zplc_plant_enter(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len);

/** @brief PLANT_ENTER with the capacity of @p rsp in bytes. An entry whose PLANT_FRAME response (13 + output bytes) or
 *         own response would not fit is refused with ZPLC_PROTO_ERR_RANGE (LNK-018). Link code must use this form. */
int zplc_plant_enter_bounded(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t cap, uint16_t *rsp_len);

/** @brief PLANT_FRAME: request payload in, response payload (after the status byte) out. ZPLC_PROTO_ERR_*. */
int zplc_plant_frame(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len);

/** @brief PLANT_FRAME with the capacity of @p rsp: a response that does not fit is never written; the frame is then
 *         answered ZPLC_PROTO_ERR_RANGE and neither staged nor counted. Link code must use this form. */
int zplc_plant_frame_bounded(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t cap, uint16_t *rsp_len);

/** @brief Leave the mode for @p reason (ZPLC_PROTO_PLANT_EXIT_REASON_*). Idempotent; posts the exit once. */
int zplc_plant_exit(uint8_t reason);

/** @brief Turn mirroring of the output image to the pins on or off. Off at entry. */
void zplc_plant_set_mirror(uint8_t on);

/** @brief Non-zero while the mode is active. Lock-free read. */
int zplc_plant_active(void);

/** @brief Non-zero while the mode is active and mirroring is off, or an exit rule has fired. */
int zplc_plant_holds_outputs(void);

/** @brief At the scan's input latch, image lock held: apply the staged inputs. Bounded; never blocks. */
void zplc_plant_latch(void);

/** @brief In the scan, after the latch: non-zero when the exit rule fired (the reason is kept). */
int zplc_plant_tick(void);

/** @brief The reason of the last exit (ZPLC_PROTO_PLANT_EXIT_REASON_*). */
uint8_t zplc_plant_exit_reason(void);

/** @brief Copy the counters. */
void zplc_plant_get_stats(zplc_plant_stats_t *out);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_PLANT_H */
