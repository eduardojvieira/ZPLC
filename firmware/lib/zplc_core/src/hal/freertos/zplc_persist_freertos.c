/**
 * @file zplc_persist_freertos.c
 * @brief Non-volatile storage of the FreeRTOS port: keyed records in files (the flash model of the simulator).
 *
 * SPDX-License-Identifier: MIT
 *
 * The HAL persistence API of the portable core is three calls on keyed blobs (zplc_hal_persist_save, _load and
 * _delete). The records of the program store and of the retentive memory (RT-025 to RT-032) depend on the ordering
 * guarantees of a save, not on the medium, so this port keeps one file per key, written the way a flash driver is
 * expected to behave:
 *
 *   1. the record is written whole to "<key>.bin.tmp" and flushed to the medium;
 *   2. the temporary file is renamed over the final one, so that a reader sees the old record or the new, never a
 *      mixture;
 *   3. the directory entry is flushed; if that fails the commit is reported as unknown (ZPLC_HAL_COMMIT_UNKNOWN).
 *
 * A board port replaces this file with its flash or NVS driver and keeps the same three guarantees. The result codes
 * are those of the POSIX host: ZPLC_HAL_NOT_IMPL for a key that is not stored, ZPLC_HAL_CORRUPT for an empty record or
 * a record larger than the caller's buffer.
 *
 * With ZPLC_HAL_PERSIST_TESTING the operations can be failed, cut or torn on purpose (zplc_test_hooks.h); the
 * conformance suites of the program store and the retentive memory use that to cut the power at every operation.
 *
 * The records live in $ZPLC_PERSIST_ROOT, or in $HOME/.zplc when it is not set.
 */

#include <zplc_hal.h>

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifdef ZPLC_HAL_PERSIST_TESTING
#include <zplc_test_hooks.h>
#endif

#define ZPLC_PERSIST_DIR ".zplc"
#define ZPLC_PERSIST_ROOT_ENV "ZPLC_PERSIST_ROOT"
#define ZPLC_PATH_MAX 256
#define ZPLC_PERSIST_KEY_MAX 128

/* ============================================================================
 * Fault injection (tests only)
 * ============================================================================ */

#ifdef ZPLC_HAL_PERSIST_TESTING
static unsigned long persist_operation_count = 0UL;
static unsigned long persist_fail_at = 0UL;
static int persist_failure_triggered = 0;
static zplc_hal_result_t persist_failure_result = ZPLC_HAL_ERROR;
static unsigned long persist_parent_sync_attempt_count = 0UL;
static unsigned long persist_parent_sync_fail_at = 0UL;
static unsigned long persist_power_cut_at = 0UL;
static int persist_power_is_cut = 0;
static unsigned long persist_tear_at = 0UL;
static size_t persist_tear_bytes = 0U;

void zplc_hal_persist_test_fail_at(unsigned long operation)
{
    persist_operation_count = 0UL;
    persist_fail_at = operation;
    persist_failure_triggered = 0;
    persist_failure_result = ZPLC_HAL_ERROR;
    persist_power_cut_at = 0UL;
    persist_power_is_cut = 0;
    persist_tear_at = 0UL;
    persist_tear_bytes = 0U;
}

void zplc_hal_persist_test_power_cut_at(unsigned long operation)
{
    zplc_hal_persist_test_fail_at(0UL);
    persist_power_cut_at = operation;
}

void zplc_hal_persist_test_tear_at(unsigned long operation, size_t bytes)
{
    zplc_hal_persist_test_fail_at(0UL);
    persist_tear_at = operation;
    persist_tear_bytes = bytes;
}

void zplc_hal_persist_test_fail_result(zplc_hal_result_t result)
{
    persist_failure_result = result;
}

unsigned long zplc_hal_persist_test_operation_count(void)
{
    return persist_operation_count;
}

int zplc_hal_persist_test_failure_triggered(void)
{
    return persist_failure_triggered;
}

void zplc_hal_persist_test_parent_sync_fail(int enabled)
{
    persist_parent_sync_attempt_count = 0UL;
    persist_parent_sync_fail_at = enabled != 0 ? 1UL : 0UL;
}

void zplc_hal_persist_test_parent_sync_fail_at(unsigned long attempt)
{
    persist_parent_sync_attempt_count = 0UL;
    persist_parent_sync_fail_at = attempt;
}

unsigned long zplc_hal_persist_test_parent_sync_attempts(void)
{
    return persist_parent_sync_attempt_count;
}

static zplc_hal_result_t persist_test_result(void)
{
    persist_operation_count++;
    if (persist_power_is_cut != 0 ||
        (persist_power_cut_at != 0UL && persist_operation_count >= persist_power_cut_at)) {
        persist_power_is_cut = 1;
        persist_failure_triggered = 1;
        return ZPLC_HAL_ERROR;
    }
    if (persist_fail_at != 0UL && persist_operation_count == persist_fail_at) {
        persist_failure_triggered = 1;
        return persist_failure_result;
    }
    return ZPLC_HAL_OK;
}
#else
static zplc_hal_result_t persist_test_result(void)
{
    return ZPLC_HAL_OK;
}
#endif

/* ============================================================================
 * Paths
 * ============================================================================ */

static const char *persist_root_dir(char *fallback, size_t size)
{
    const char *root = getenv(ZPLC_PERSIST_ROOT_ENV);
    const char *home;

    if (root != NULL && root[0] != '\0') {
        return root;
    }
    home = getenv("HOME");
    if (snprintf(fallback, size, "%s/%s", home != NULL ? home : "/tmp", ZPLC_PERSIST_DIR) >= (int)size) {
        return NULL;
    }
    return fallback;
}

static int persist_build_path(const char *key, char *path, size_t path_len)
{
    char dir[ZPLC_PATH_MAX];
    char name[ZPLC_PERSIST_KEY_MAX];
    const char *root = persist_root_dir(dir, sizeof(dir));
    size_t index;

    if (key == NULL || root == NULL) {
        return -1;
    }
    for (index = 0; index + 1U < sizeof(name) && key[index] != '\0'; ++index) {
        name[index] = key[index] == '/' ? '_' : key[index];
    }
    name[index] = '\0';
    return snprintf(path, path_len, "%s/%s.bin", root, name) < (int)path_len ? 0 : -1;
}

static int persist_ensure_dir(void)
{
    char dir[ZPLC_PATH_MAX];
    const char *root = persist_root_dir(dir, sizeof(dir));

    if (root == NULL) {
        return -1;
    }
    if (mkdir(root, 0755) != 0 && errno != EEXIST) {
        zplc_hal_log("[HAL] Failed to create persist dir: %s\n", strerror(errno));
        return -1;
    }
    return 0;
}

/* fsync() of the directory is what makes the rename durable on Linux. */
static int persist_sync_parent_dir(const char *path)
{
    char dir_path[ZPLC_PATH_MAX];
    char *separator;
    int directory_fd;
    int saved_errno;

    if (strlen(path) >= sizeof(dir_path)) {
        errno = EINVAL;
        return -1;
    }
    memcpy(dir_path, path, strlen(path) + 1U);
    separator = strrchr(dir_path, '/');
    if (separator == NULL) {
        errno = EINVAL;
        return -1;
    }
    if (separator == dir_path) {
        separator[1] = '\0';
    } else {
        *separator = '\0';
    }
#ifdef ZPLC_HAL_PERSIST_TESTING
    persist_parent_sync_attempt_count++;
    if (persist_parent_sync_fail_at != 0UL && persist_parent_sync_attempt_count == persist_parent_sync_fail_at) {
        errno = EIO;
        return -1;
    }
#endif
    directory_fd = open(dir_path, O_RDONLY);
    if (directory_fd < 0) {
        return -1;
    }
    if (fsync(directory_fd) != 0) {
        saved_errno = errno;
        (void)close(directory_fd);
        errno = saved_errno;
        return -1;
    }
    (void)close(directory_fd);
    return 0;
}

/* ============================================================================
 * The HAL persistence API
 * ============================================================================ */

zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data, size_t len)
{
    char path[ZPLC_PATH_MAX];
    char tmp_path[ZPLC_PATH_MAX + 8U];
    FILE *fp;
    int flush_failed;

    if (key == NULL || data == NULL || len == 0U) {
        return ZPLC_HAL_ERROR;
    }
    {
        const zplc_hal_result_t injected = persist_test_result();

        if (injected != ZPLC_HAL_OK) {
            return injected;
        }
    }
    if (persist_ensure_dir() != 0 || persist_build_path(key, path, sizeof(path)) != 0) {
        return ZPLC_HAL_ERROR;
    }
    if (snprintf(tmp_path, sizeof(tmp_path), "%s.tmp", path) >= (int)sizeof(tmp_path)) {
        return ZPLC_HAL_ERROR;
    }

#ifdef ZPLC_HAL_PERSIST_TESTING
    if (persist_tear_at != 0UL && persist_operation_count == persist_tear_at) {
        /* A write the power cut in the middle: the record is a prefix of what was being written. */
        FILE *torn = fopen(path, "wb");

        persist_power_is_cut = 1;
        persist_failure_triggered = 1;
        if (torn != NULL) {
            if (persist_tear_bytes != 0U) {
                (void)fwrite(data, 1, persist_tear_bytes < len ? persist_tear_bytes : len, torn);
            }
            (void)fclose(torn);
        }
        return ZPLC_HAL_ERROR;
    }
#endif

    fp = fopen(tmp_path, "wb");
    if (fp == NULL) {
        zplc_hal_log("[HAL] Failed to open %s: %s\n", tmp_path, strerror(errno));
        return ZPLC_HAL_ERROR;
    }
    if (fwrite(data, 1, len, fp) != len) {
        (void)fclose(fp); /* the write already failed; its error is the one reported */
        (void)unlink(tmp_path);
        return ZPLC_HAL_ERROR;
    }
    flush_failed = fflush(fp) != 0;
    if (flush_failed == 0 && fsync(fileno(fp)) != 0) {
        flush_failed = 1;
    }
    if (fclose(fp) != 0) {
        flush_failed = 1;
    }
    if (flush_failed != 0) {
        zplc_hal_log("[HAL] Failed to flush %s: %s\n", tmp_path, strerror(errno));
        (void)unlink(tmp_path);
        return ZPLC_HAL_ERROR;
    }
    if (rename(tmp_path, path) != 0) {
        zplc_hal_log("[HAL] Failed to rename %s -> %s: %s\n", tmp_path, path, strerror(errno));
        (void)unlink(tmp_path);
        return ZPLC_HAL_ERROR;
    }
    if (persist_sync_parent_dir(path) != 0) {
        zplc_hal_log("[HAL] Failed to sync the directory of %s: %s\n", path, strerror(errno));
        return ZPLC_HAL_COMMIT_UNKNOWN;
    }
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data, size_t len)
{
    char path[ZPLC_PATH_MAX];
    FILE *fp;
    long file_size;
    size_t bytes_read;
    int read_error;
    int close_error;

    if (key == NULL || data == NULL || len == 0U) {
        return ZPLC_HAL_ERROR;
    }
    {
        const zplc_hal_result_t injected = persist_test_result();

        if (injected != ZPLC_HAL_OK) {
            return injected;
        }
    }
    if (persist_build_path(key, path, sizeof(path)) != 0) {
        return ZPLC_HAL_ERROR;
    }
    fp = fopen(path, "rb");
    if (fp == NULL) {
        if (errno == ENOENT) {
            return ZPLC_HAL_NOT_IMPL; /* not found */
        }
        zplc_hal_log("[HAL] Failed to open %s: %s\n", path, strerror(errno));
        return ZPLC_HAL_ERROR;
    }
    if (fseek(fp, 0, SEEK_END) != 0) {
        (void)fclose(fp);
        return ZPLC_HAL_ERROR;
    }
    file_size = ftell(fp);
    if (file_size < 0 || fseek(fp, 0, SEEK_SET) != 0) {
        (void)fclose(fp);
        return ZPLC_HAL_ERROR;
    }
    if ((unsigned long)file_size > (unsigned long)len) {
        (void)fclose(fp);
        return ZPLC_HAL_CORRUPT;
    }
    /* A shorter record than the buffer is accepted: length-sensitive users keep an envelope. */
    bytes_read = fread(data, 1, (size_t)file_size, fp);
    read_error = bytes_read != (size_t)file_size || ferror(fp) != 0;
    close_error = fclose(fp) != 0;
    if (read_error != 0 || close_error != 0) {
        return ZPLC_HAL_ERROR;
    }
    if (bytes_read == 0U) {
        zplc_hal_log("[HAL] Empty persisted record in %s\n", path);
        return ZPLC_HAL_CORRUPT;
    }
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_persist_delete(const char *key)
{
    char path[ZPLC_PATH_MAX];

    if (key == NULL) {
        return ZPLC_HAL_ERROR;
    }
    {
        const zplc_hal_result_t injected = persist_test_result();

        if (injected != ZPLC_HAL_OK) {
            return injected;
        }
    }
    if (persist_build_path(key, path, sizeof(path)) != 0) {
        return ZPLC_HAL_ERROR;
    }
    if (unlink(path) != 0) {
        if (errno == ENOENT) {
            return ZPLC_HAL_NOT_IMPL; /* not found */
        }
        zplc_hal_log("[HAL] Failed to delete %s: %s\n", path, strerror(errno));
        return ZPLC_HAL_ERROR;
    }
    return ZPLC_HAL_OK;
}
