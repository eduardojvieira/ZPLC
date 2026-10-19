/**
 * @file test_core_lock.c
 * @brief The process-image lock of the core: a failure to create or take it is reported (RT-030).
 *
 * SPDX-License-Identifier: MIT
 *
 * The test supplies its own HAL (the four calls the core makes) so that creating and taking the mutex can fail on
 * demand. Before this was fixed, zplc_core_init() kept going without a mutex and returned 0.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_hal.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                      \
  do {                                                                        \
    test_count++;                                                             \
    if (!(cond)) {                                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                 \
      fail_count++;                                                           \
    } else {                                                                  \
      printf("PASS: %s\n", msg);                                              \
    }                                                                         \
  } while (0)

static int create_fails;
static zplc_hal_result_t lock_result = ZPLC_HAL_OK;
static int locks_held;
static int token;

zplc_hal_mutex_t zplc_hal_mutex_create(void) {
  return create_fails != 0 ? NULL : (zplc_hal_mutex_t)&token;
}

zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex) {
  if (mutex == NULL) {
    return ZPLC_HAL_ERROR;
  }
  if (lock_result == ZPLC_HAL_OK) {
    locks_held++;
  }
  return lock_result;
}

zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex) {
  return mutex == NULL ? ZPLC_HAL_ERROR : ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex) {
  if (mutex == NULL) {
    return ZPLC_HAL_ERROR;
  }
  locks_held--;
  return ZPLC_HAL_OK;
}

uint32_t zplc_hal_tick(void) { return 0U; }

int main(void) {
  printf("=== core process-image lock (RT-030) ===\n");

  create_fails = 1;
  CHECK(zplc_core_init() != 0, "init reports a mutex that could not be created");
  CHECK(zplc_pi_lock() != 0, "and the lock of a runtime without a mutex is refused, not granted");

  create_fails = 0;
  CHECK(zplc_core_init() == 0, "a later init, with the resource back, creates the mutex and succeeds");
  CHECK(zplc_pi_lock() == 0 && locks_held == 1, "the lock is taken");
  zplc_pi_unlock();
  CHECK(locks_held == 0, "and released");

  lock_result = ZPLC_HAL_TIMEOUT;
  CHECK(zplc_pi_lock() != 0, "a lock the HAL could not take is reported to the caller");
  CHECK(locks_held == 0, "and is not counted as held");

  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
