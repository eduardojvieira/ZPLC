/*
 * SPDX-License-Identifier: MIT
 *
 * The part of the HAL the core library calls: a clock and a mutex. Nothing
 * else is linked, so a suite that reaches for GPIO, storage or networking
 * fails to link instead of passing against a stub.
 */
#include <zephyr/kernel.h>
#include <zplc_hal.h>

#define TEST_HAL_MUTEXES 2

static struct k_mutex mutexes[TEST_HAL_MUTEXES];
static unsigned int mutexes_used;

uint32_t zplc_hal_tick(void) { return k_uptime_get_32(); }

zplc_hal_mutex_t zplc_hal_mutex_create(void) {
  struct k_mutex *mutex;

  if (mutexes_used >= TEST_HAL_MUTEXES) {
    return NULL;
  }
  mutex = &mutexes[mutexes_used++];
  (void)k_mutex_init(mutex);
  return mutex;
}

zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex) {
  if (mutex == NULL) {
    return ZPLC_HAL_ERROR;
  }
  return k_mutex_lock((struct k_mutex *)mutex, K_FOREVER) == 0 ? ZPLC_HAL_OK : ZPLC_HAL_ERROR;
}

zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex) {
  if (mutex == NULL) {
    return ZPLC_HAL_ERROR;
  }
  if (mutexes_used > 0U && mutex == &mutexes[mutexes_used - 1U]) {
    mutexes_used--; /* the pool is a stack: a re-created mutex takes the slot back */
  }
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex) {
  if (mutex == NULL) {
    return ZPLC_HAL_ERROR;
  }
  return k_mutex_unlock((struct k_mutex *)mutex) == 0 ? ZPLC_HAL_OK : ZPLC_HAL_ERROR;
}
