/**
 * @file zplc_verify_scratch_zephyr.c
 * @brief The one verifier workspace of a Zephyr image. See zplc_verify_scratch.h.
 *
 * SPDX-License-Identifier: MIT
 */

#include <zephyr/kernel.h>

#include <zplc_verify_scratch.h>

/* Caller-owned verifier scratch; never allocate this from a task stack. */
static uint8_t verify_workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
static K_MUTEX_DEFINE(verify_mutex);

uint8_t *zplc_verify_scratch_take(void) {
  if (k_mutex_lock(&verify_mutex, K_FOREVER) != 0) {
    return NULL;
  }
  return verify_workspace;
}

void zplc_verify_scratch_give(void) { (void)k_mutex_unlock(&verify_mutex); }
