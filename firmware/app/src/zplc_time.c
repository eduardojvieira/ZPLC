/**
 * @file zplc_time.c
 * @brief ZPLC Real-Time Clock / SNTP Time Synchronization
 *
 * Maintains a UTC epoch offset computed from a single SNTP exchange.
 * Once synced, zplc_time_get_unix_ms() returns wall-clock UTC milliseconds
 * by adding k_uptime_get() delta to the stored offset — no repeated SNTP
 * traffic while the device is running normally.
 *
 * Thread-safety: the sync state is protected by a lightweight spinlock.
 * All public functions are safe to call from any Zephyr thread context.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_time.h"
#include "zplc_config.h"

#include <errno.h>
#include <zephyr/kernel.h>
#if defined(CONFIG_SNTP)
#include <zephyr/net/sntp.h>
#include <zephyr/net/socketutils.h>
#endif
#include <zephyr/logging/log.h>
#include <string.h>

LOG_MODULE_REGISTER(zplc_time, LOG_LEVEL_INF);

/* ============================================================================
 * Internal State
 * ============================================================================ */

/** Mutex protecting sync state. */
static struct k_mutex s_lock;

/**
 * Anchor point recorded at last successful SNTP sync.
 * s_epoch_base_ms  : SNTP result converted to Unix milliseconds.
 * s_uptime_base_ms : k_uptime_get() at the moment of the sync.
 * Together they let us compute current UTC without repeated SNTP calls:
 *   now_utc_ms = s_epoch_base_ms + (k_uptime_get() - s_uptime_base_ms)
 */
static int64_t  s_epoch_base_ms  = -1;
static int64_t  s_uptime_base_ms = 0;
static bool     s_synced         = false;

/* ============================================================================
 * Internal Helpers
 * ============================================================================ */

/**
 * @brief Perform a single blocking SNTP request against the given server.
 *
 * Uses the Zephyr SNTP simple API (sntp_simple) which does one exchange
 * with a 5-second timeout.  All memory is stack-local — no heap involved.
 *
 * @param server  NTP server hostname or IP string (null-terminated).
 * @return 0 on success with s_epoch_base_ms / s_uptime_base_ms updated,
 *         negative errno on failure.
 */
#if defined(CONFIG_SNTP)
static int do_sntp_sync(const char *server)
{
    struct sntp_time sntp_result;
    int ret;

    if (!server || server[0] == '\0') {
        LOG_WRN("SNTP: no server configured — using default pool.ntp.org");
        server = "pool.ntp.org";
    }

    LOG_INF("SNTP: syncing with %s ...", server);

    ret = sntp_simple(server, 5000U /* ms */, &sntp_result);
    if (ret < 0) {
        LOG_ERR("SNTP: sync failed (err %d)", ret);
        return ret;
    }

    k_mutex_lock(&s_lock, K_FOREVER);
    /* sntp_time.seconds is seconds since Unix epoch (NTP epoch offset applied
     * by Zephyr's SNTP driver — result is already in Unix time). */
    s_epoch_base_ms  = (int64_t)sntp_result.seconds * 1000LL
                       + (int64_t)(sntp_result.fraction >> 22); /* ~ms */
    s_uptime_base_ms = k_uptime_get();
    s_synced         = true;
    k_mutex_unlock(&s_lock);

    LOG_INF("SNTP: synchronized — Unix epoch %lld ms", (long long)s_epoch_base_ms);
    return 0;
}
#endif

/* ============================================================================
 * Public API
 * ============================================================================ */

int zplc_time_init(void)
{
    k_mutex_init(&s_lock);

#if defined(CONFIG_SNTP)
    /* Check if NTP is enabled in config */
    if (!zplc_config_get_ntp_enabled()) {
        LOG_INF("SNTP: disabled by config — timestamps will use k_uptime_get()");
        return 0;
    }

    char server[64];
    zplc_config_get_ntp_server(server, sizeof(server));

    /* Attempt initial sync. Non-fatal on failure — will retry via resync(). */
    int ret = do_sntp_sync(server);
    if (ret < 0) {
        LOG_WRN("SNTP: initial sync failed, retrying on next resync() call");
        /* Return 0 — failure is non-fatal, caller continues with uptime */
    }

    return 0;
#else
    LOG_INF("SNTP support disabled in this build");
    return 0;
#endif
}

bool zplc_time_is_synced(void)
{
    k_mutex_lock(&s_lock, K_FOREVER);
    bool synced = s_synced;
    k_mutex_unlock(&s_lock);
    return synced;
}

int64_t zplc_time_get_unix_ms(void)
{
    k_mutex_lock(&s_lock, K_FOREVER);
    if (!s_synced) {
        k_mutex_unlock(&s_lock);
        return -1;
    }
    int64_t now = s_epoch_base_ms + (k_uptime_get() - s_uptime_base_ms);
    k_mutex_unlock(&s_lock);
    return now;
}

int zplc_time_resync(void)
{
#if !defined(CONFIG_SNTP)
    return -ENOTSUP;
#else
    if (!zplc_config_get_ntp_enabled()) {
        return 0;
    }

    char server[64];
    zplc_config_get_ntp_server(server, sizeof(server));
    return do_sntp_sync(server);
#endif
}
