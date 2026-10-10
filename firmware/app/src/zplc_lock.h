/**
 * @file zplc_lock.h
 * @brief Taking a mutex of the application without ignoring the result (RT-030).
 *
 * SPDX-License-Identifier: MIT
 *
 * k_mutex_lock() with K_FOREVER fails only when the mutex object is not valid, which is a defect and not a
 * condition to wait out. The caller gets the error and leaves what the mutex protects alone: it returns an error to
 * its own caller, or, in a loop, drives its outputs safe and tries again later.
 */

#ifndef ZPLC_LOCK_H
#define ZPLC_LOCK_H

#include <zephyr/kernel.h>
#include <zplc_hal.h>

/** @return 0 when the mutex is held by the caller, a negative errno otherwise. */
static inline int zplc_lock_take(struct k_mutex *mutex, const char *name)
{
    int rc = k_mutex_lock(mutex, K_FOREVER);

    if (rc != 0) {
        zplc_hal_log("[LOCK] %s could not be taken: %d\n", name, rc);
    }
    return rc;
}

#endif /* ZPLC_LOCK_H */
