/**
 * @file zplc_plant.c
 * @brief Plant I/O mode. Foundation stub: every entry point is inert so that lanes link against it; the module
 *        is implemented by the plant module task (F1) of plan-m6.md.
 *
 * SPDX-License-Identifier: MIT
 */

#include <string.h>

#include "zplc_plant.h"
#include "zplc_proto_defs.h"

void zplc_plant_init(const zplc_plant_hooks_t *hooks) { (void)hooks; }

int zplc_plant_enter(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len) {
  (void)req;
  (void)len;
  (void)rsp;
  if (rsp_len != NULL) {
    *rsp_len = 0U;
  }
  return (int)ZPLC_PROTO_ERR_UNSUPPORTED;
}

int zplc_plant_frame(const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len) {
  (void)req;
  (void)len;
  (void)rsp;
  if (rsp_len != NULL) {
    *rsp_len = 0U;
  }
  return (int)ZPLC_PROTO_ERR_UNSUPPORTED;
}

int zplc_plant_exit(uint8_t reason) {
  (void)reason;
  return (int)ZPLC_PROTO_ERR_UNSUPPORTED;
}

void zplc_plant_set_mirror(uint8_t on) { (void)on; }

int zplc_plant_active(void) { return 0; }

int zplc_plant_holds_outputs(void) { return 0; }

void zplc_plant_latch(void) {}

int zplc_plant_tick(void) { return 0; }

uint8_t zplc_plant_exit_reason(void) { return (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED; }

void zplc_plant_get_stats(zplc_plant_stats_t *out) {
  if (out != NULL) {
    memset(out, 0, sizeof(*out));
  }
}
