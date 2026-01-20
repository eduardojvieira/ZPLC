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

/* Required for clock_gettime, snprintf, fsync, fileno on some systems */
#define _POSIX_C_SOURCE 200809L

#include <zplc_hal.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <time.h>
#include <unistd.h>
#include <errno.h>
#include <sys/stat.h>

/* ============================================================================
 * Internal State
 * ============================================================================ */

static int hal_initialized = 0;

/** @brief Directory for persistent storage */
#define ZPLC_PERSIST_DIR ".zplc"

/** @brief Maximum path length */
#define ZPLC_PATH_MAX 256

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
 * Persistence Functions
 * ============================================================================ */

/**
 * @brief Build the full path to a persistence file
 * @param key The key name (will become filename)
 * @param path Output buffer for the path
 * @param path_len Size of the output buffer
 * @return 0 on success, -1 on error
 */
static int persist_build_path(const char *key, char *path, size_t path_len)
{
    const char *home;
    int ret;

    home = getenv("HOME");
    if (home == NULL) {
        home = "/tmp";  /* Fallback if HOME is not set */
    }

    /* Sanitize key: replace '/' with '_' to avoid subdirectory issues */
    ret = snprintf(path, path_len, "%s/%s/%s.bin", home, ZPLC_PERSIST_DIR, key);
    if (ret < 0 || (size_t)ret >= path_len) {
        return -1;  /* Path too long */
    }

    /* Replace '/' in key portion with '_' */
    char *key_start = path + strlen(home) + strlen(ZPLC_PERSIST_DIR) + 2;
    for (char *p = key_start; *p != '\0' && *p != '.'; p++) {
        if (*p == '/') {
            *p = '_';
        }
    }

    return 0;
}

/**
 * @brief Ensure the persistence directory exists
 * @return 0 on success, -1 on error
 */
static int persist_ensure_dir(void)
{
    const char *home;
    char dir_path[ZPLC_PATH_MAX];
    int ret;

    home = getenv("HOME");
    if (home == NULL) {
        home = "/tmp";
    }

    ret = snprintf(dir_path, sizeof(dir_path), "%s/%s", home, ZPLC_PERSIST_DIR);
    if (ret < 0 || (size_t)ret >= sizeof(dir_path)) {
        return -1;
    }

    /* Create directory if it doesn't exist (mode 0755) */
    if (mkdir(dir_path, 0755) != 0 && errno != EEXIST) {
        zplc_hal_log("[HAL] Failed to create persist dir: %s\n", strerror(errno));
        return -1;
    }

    return 0;
}

zplc_hal_result_t zplc_hal_persist_save(const char *key,
                                         const void *data,
                                         size_t len)
{
    char path[ZPLC_PATH_MAX];
    char tmp_path[ZPLC_PATH_MAX];
    FILE *fp;
    size_t written;

    if (key == NULL || data == NULL || len == 0) {
        return ZPLC_HAL_ERROR;
    }

    /* Ensure directory exists */
    if (persist_ensure_dir() != 0) {
        return ZPLC_HAL_ERROR;
    }

    /* Build the file path */
    if (persist_build_path(key, path, sizeof(path)) != 0) {
        zplc_hal_log("[HAL] Persist path too long for key: %s\n", key);
        return ZPLC_HAL_ERROR;
    }

    /* Build temp file path for atomic write */
    if (snprintf(tmp_path, sizeof(tmp_path), "%s.tmp", path) < 0) {
        return ZPLC_HAL_ERROR;
    }

    /* Write to temporary file first */
    fp = fopen(tmp_path, "wb");
    if (fp == NULL) {
        zplc_hal_log("[HAL] Failed to open %s: %s\n", tmp_path, strerror(errno));
        return ZPLC_HAL_ERROR;
    }

    written = fwrite(data, 1, len, fp);
    if (written != len) {
        zplc_hal_log("[HAL] Failed to write data: wrote %zu of %zu bytes\n",
                     written, len);
        fclose(fp);
        unlink(tmp_path);  /* Clean up failed write */
        return ZPLC_HAL_ERROR;
    }

    /* Flush and sync to ensure data is on disk */
    fflush(fp);
    fsync(fileno(fp));
    fclose(fp);

    /* Atomic rename: tmp -> final */
    if (rename(tmp_path, path) != 0) {
        zplc_hal_log("[HAL] Failed to rename %s -> %s: %s\n",
                     tmp_path, path, strerror(errno));
        unlink(tmp_path);
        return ZPLC_HAL_ERROR;
    }

    zplc_hal_log("[HAL] Saved %zu bytes to %s\n", len, path);
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_persist_load(const char *key,
                                         void *data,
                                         size_t len)
{
    char path[ZPLC_PATH_MAX];
    FILE *fp;
    size_t bytes_read;
    long file_size;

    if (key == NULL || data == NULL || len == 0) {
        return ZPLC_HAL_ERROR;
    }

    /* Build the file path */
    if (persist_build_path(key, path, sizeof(path)) != 0) {
        return ZPLC_HAL_ERROR;
    }

    /* Open the file */
    fp = fopen(path, "rb");
    if (fp == NULL) {
        if (errno == ENOENT) {
            /* File doesn't exist - not an error, just no data */
            return ZPLC_HAL_NOT_IMPL;  /* Indicates "not found" */
        }
        zplc_hal_log("[HAL] Failed to open %s: %s\n", path, strerror(errno));
        return ZPLC_HAL_ERROR;
    }

    /* Get file size to verify it matches expected length */
    fseek(fp, 0, SEEK_END);
    file_size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    if (file_size < 0) {
        fclose(fp);
        return ZPLC_HAL_ERROR;
    }

    /* Read the data (up to len bytes) */
    bytes_read = fread(data, 1, len, fp);
    fclose(fp);

    if (bytes_read == 0) {
        zplc_hal_log("[HAL] No data read from %s\n", path);
        return ZPLC_HAL_ERROR;
    }

    zplc_hal_log("[HAL] Loaded %zu bytes from %s\n", bytes_read, path);
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_persist_delete(const char *key)
{
    char path[ZPLC_PATH_MAX];

    if (key == NULL) {
        return ZPLC_HAL_ERROR;
    }

    /* Build the file path */
    if (persist_build_path(key, path, sizeof(path)) != 0) {
        return ZPLC_HAL_ERROR;
    }

    /* Delete the file */
    if (unlink(path) != 0) {
        if (errno == ENOENT) {
            /* File doesn't exist - not an error */
            return ZPLC_HAL_NOT_IMPL;
        }
        zplc_hal_log("[HAL] Failed to delete %s: %s\n", path, strerror(errno));
        return ZPLC_HAL_ERROR;
    }

    zplc_hal_log("[HAL] Deleted %s\n", path);
    return ZPLC_HAL_OK;
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
