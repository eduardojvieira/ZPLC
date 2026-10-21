/**
 * @file test_core_shutdown.c
 * @brief Core shutdown releases the process-image mutex, and a later init creates it again (IO-007).
 *
 * zplc_hal_mutex_destroy() had no caller: the core created its mutex and kept it for the life of the process.
 * Shutdown now destroys it, so the HAL function is part of the contract with a real call site.
 *
 * SPDX-License-Identifier: MIT
 */

#include <stdio.h>

#include <zplc_core.h>

static int fail_count = 0;

#define CHECK(cond, msg)                                      \
  do {                                                        \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    } else {                                                  \
      printf("PASS: %s\n", msg);                              \
    }                                                         \
  } while (0)

int main(void) {
  CHECK(zplc_core_init() == 0, "init creates the process-image mutex");
  CHECK(zplc_pi_lock() == 0, "the lock is taken while the core is initialised");
  zplc_pi_unlock();

  CHECK(zplc_core_shutdown() == 0, "shutdown succeeds");
  CHECK(zplc_pi_lock() != 0, "after shutdown the mutex is released and a lock is refused");
  zplc_pi_unlock(); /* must be harmless without a mutex */

  CHECK(zplc_core_init() == 0, "a later init creates the mutex again");
  CHECK(zplc_pi_lock() == 0, "the lock works again");
  zplc_pi_unlock();
  CHECK(zplc_core_shutdown() == 0, "second shutdown succeeds");
  CHECK(zplc_core_shutdown() == 0, "shutdown twice is harmless");

  return fail_count == 0 ? 0 : 1;
}
