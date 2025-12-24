/**
 * @file zplc_hal_posix.c
 * @brief ZPLC HAL Implementation for POSIX Systems (Linux, macOS, BSD)
 *
 * SPDX-License-Identifier: MIT
 *
 * This implementation uses standard POSIX APIs for timing, I/O, and
 * networking. It's the reference implementation for desktop development
 * and simulation.
 */

/* Required for clock_gettime on some systems */
#define _POSIX_C_SOURCE 199309L

#include <zplc_hal.h>

#include <stdio.h>
#include <stdarg.h>
#include <time.h>
#include <unistd.h>
#include <errno.h>

/* ============================================================================
 * Internal State
 * ============================================================================ */

static int hal_initialized = 0;

/* ============================================================================
 * Timing Functions
 * ============================================================================ */

uint32_t zplc_hal_tick(void)
{
    struct timespec ts;
    uint64_t ms;

    /*
     * CLOCK_MONOTONIC: Monotonically increasing, not affected by
     * system time changes. Essential for deterministic timing.
     */
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
        /* If this fails, we have bigger problems. Return 0 and log. */
        zplc_hal_log("[HAL] CRITICAL: clock_gettime failed!\n");
        return 0;
    }

    /* Convert to milliseconds */
    ms = (uint64_t)ts.tv_sec * 1000ULL + (uint64_t)ts.tv_nsec / 1000000ULL;

    /*
     * Truncate to 32-bit. This gives us ~49 days before rollover.
     * For a PLC runtime, this is acceptable - production systems
     * will have watchdogs and scheduled restarts anyway.
     */
    return (uint32_t)(ms & 0xFFFFFFFFULL);
}

void zplc_hal_sleep(uint32_t ms)
{
    struct timespec req, rem;

    req.tv_sec = ms / 1000;
    req.tv_nsec = (ms % 1000) * 1000000L;

    /*
     * nanosleep can be interrupted by signals. In a proper implementation,
     * we'd loop until the full duration. For Phase 0, this is sufficient.
     * TODO: Handle EINTR properly for production.
     */
    while (nanosleep(&req, &rem) == -1 && errno == EINTR) {
        req = rem;
    }
}

/* ============================================================================
 * GPIO Functions (Stubs for Phase 0)
 * ============================================================================ */

zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value)
{
    (void)channel;  /* Suppress unused parameter warning */

    if (value == NULL) {
        return ZPLC_HAL_ERROR;
    }

    /*
     * Stub: Always return 0 (low).
     * Phase 3 will implement actual GPIO via:
     * - /sys/class/gpio on Linux
     * - Simulation file on desktop
     */
    *value = 0;
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value)
{
    (void)channel;
    (void)value;

    /* Stub: Silently accept writes, do nothing */
    return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Analog I/O Functions (Stubs for Phase 0)
 * ============================================================================ */

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value)
{
    (void)channel;

    if (value == NULL) {
        return ZPLC_HAL_ERROR;
    }

    *value = 0;
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value)
{
    (void)channel;
    (void)value;

    return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Persistence Functions (Stubs for Phase 0)
 * ============================================================================ */

zplc_hal_result_t zplc_hal_persist_save(const char *key,
                                         const void *data,
                                         size_t len)
{
    (void)key;
    (void)data;
    (void)len;

    /*
     * Stub: No-op.
     * Phase 3+ will implement file-based persistence:
     * - Write to ~/.zplc/retain/<key>.bin
     * - Use atomic write (write to .tmp, then rename)
     */
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_persist_load(const char *key,
                                         void *data,
                                         size_t len)
{
    (void)key;
    (void)data;
    (void)len;

    /* Stub: Return "not found" */
    return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Network Functions (Stubs for Phase 0)
 * ============================================================================ */

zplc_hal_socket_t zplc_hal_socket_connect(const char *host, uint16_t port)
{
    (void)host;
    (void)port;

    /*
     * Stub: Return NULL (connection failed).
     * Phase 4 will implement BSD sockets.
     */
    return NULL;
}

int32_t zplc_hal_socket_send(zplc_hal_socket_t sock,
                              const void *data,
                              size_t len)
{
    (void)sock;
    (void)data;
    (void)len;

    return (int32_t)ZPLC_HAL_NOT_IMPL;
}

int32_t zplc_hal_socket_recv(zplc_hal_socket_t sock,
                              void *buf,
                              size_t len)
{
    (void)sock;
    (void)buf;
    (void)len;

    return (int32_t)ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_socket_close(zplc_hal_socket_t sock)
{
    (void)sock;

    return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Logging
 * ============================================================================ */

void zplc_hal_log(const char *fmt, ...)
{
    va_list args;

    va_start(args, fmt);
    vfprintf(stderr, fmt, args);
    va_end(args);

    /*
     * Flush immediately. In an industrial context, you want logs
     * visible NOW, not buffered for later. If it crashes, you need
     * to know what the last message was.
     */
    fflush(stderr);
}

/* ============================================================================
 * System Initialization
 * ============================================================================ */

zplc_hal_result_t zplc_hal_init(void)
{
    if (hal_initialized) {
        zplc_hal_log("[HAL] Warning: Already initialized\n");
        return ZPLC_HAL_OK;
    }

    zplc_hal_log("[HAL] POSIX HAL initializing...\n");

    /*
     * Phase 0: Nothing to initialize.
     * Future phases will:
     * - Open GPIO sysfs files
     * - Initialize network stack
     * - Load retained memory from disk
     */

    hal_initialized = 1;
    zplc_hal_log("[HAL] POSIX HAL ready\n");

    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_shutdown(void)
{
    if (!hal_initialized) {
        return ZPLC_HAL_OK;
    }

    zplc_hal_log("[HAL] POSIX HAL shutting down...\n");

    /*
     * Future: Close file handles, flush persistence, cleanup.
     */

    hal_initialized = 0;
    return ZPLC_HAL_OK;
}
