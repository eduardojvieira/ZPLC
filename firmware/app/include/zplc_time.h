/**
 * @file zplc_time.h
 * @brief ZPLC Real-Time Clock / SNTP Time Synchronization API
 *
 * Provides wall-clock UTC timestamps via SNTP for use in Sparkplug B payloads
 * and general audit logging. Falls back to k_uptime_get() when not yet synced.
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_TIME_H
#define ZPLC_TIME_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize the SNTP time synchronization module.
 *
 * Spawns a background synchronization attempt against the configured NTP
 * server. Non-blocking — returns immediately. The first successful sync
 * sets an internal "synced" flag accessible via zplc_time_is_synced().
 *
 * Must be called AFTER the network interface is up and DNS is available.
 * Typically called from the MQTT thread after L3 connectivity is confirmed.
 *
 * @return 0 on success (sync started or already synced), negative errno on
 *         unrecoverable initialization error (e.g. NTP disabled by config).
 */
int zplc_time_init(void);

/**
 * @brief Query whether a successful NTP sync has occurred.
 *
 * @return true if the clock is synchronized to UTC, false otherwise.
 */
bool zplc_time_is_synced(void);

/**
 * @brief Get the current UTC time as milliseconds since Unix epoch.
 *
 * If NTP has not yet synced, returns -1 and the caller should fall back to
 * k_uptime_get() for relative timestamps.
 *
 * @return Milliseconds since 1970-01-01T00:00:00Z, or -1 if not synced.
 */
int64_t zplc_time_get_unix_ms(void);

/**
 * @brief Trigger a re-synchronization with the NTP server.
 *
 * Useful when the broker reconnects after a long outage and wall-clock drift
 * may be significant. Safe to call from any thread.
 *
 * @return 0 on success, negative errno on failure.
 */
int zplc_time_resync(void);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_TIME_H */
