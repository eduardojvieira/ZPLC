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

/* Required for clock_gettime, snprintf, fsync, fileno, pthread_mutex_t on some systems */
#define _POSIX_C_SOURCE 200809L

#include <zplc_hal.h>
#include <zplc_hal_posix.h>

#include <errno.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <direct.h>
#include <io.h>
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#include <pthread.h>
#endif

/* ============================================================================
 * Internal State
 * ============================================================================
 */

static int hal_initialized = 0;
static int tick_override_active = 0;
static uint32_t tick_override_ms = 0U;

void zplc_hal_posix_set_tick_override(uint32_t tick_ms)
{
  tick_override_ms = tick_ms;
  tick_override_active = 1;
}

void zplc_hal_posix_clear_tick_override(void)
{
  tick_override_active = 0;
  tick_override_ms = 0U;
}

#ifdef ZPLC_HAL_PERSIST_TESTING
static unsigned long persist_operation_count = 0UL;
static unsigned long persist_fail_at = 0UL;
static int persist_failure_triggered = 0;
static zplc_hal_result_t persist_failure_result = ZPLC_HAL_ERROR;
static unsigned long persist_parent_sync_attempt_count = 0UL;
static unsigned long persist_parent_sync_fail_at = 0UL;

void zplc_hal_persist_test_fail_at(unsigned long operation)
{
  persist_operation_count = 0UL;
  persist_fail_at = operation;
  persist_failure_triggered = 0;
  persist_failure_result = ZPLC_HAL_ERROR;
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

#ifdef _WIN32
#define ZPLC_PATH_SEP '/'
#define zplc_mkdir(path) _mkdir(path)
#define zplc_unlink(path) _unlink(path)
#define zplc_fsync(fd) _commit(fd)
#define zplc_fileno(stream) _fileno(stream)
#else
#define ZPLC_PATH_SEP '/'
#define zplc_mkdir(path) mkdir((path), 0755)
#define zplc_unlink(path) unlink(path)
#define zplc_fsync(fd) fsync(fd)
#define zplc_fileno(stream) fileno(stream)
#endif

/** @brief Directory for persistent storage */
#define ZPLC_PERSIST_DIR ".zplc"

/** @brief Environment override for testable persistence root */
#define ZPLC_PERSIST_ROOT_ENV "ZPLC_PERSIST_ROOT"

/** @brief Maximum path length */
#define ZPLC_PATH_MAX 256

/** @brief Maximum persistence key length */
#define ZPLC_PERSIST_KEY_MAX 128

/* ============================================================================
 * Timing Functions
 * ============================================================================
 */

uint32_t zplc_hal_tick(void) {
  if (tick_override_active != 0) {
    return tick_override_ms;
  }
#ifdef _WIN32
  return (uint32_t)(GetTickCount64() & 0xFFFFFFFFULL);
#else
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
#endif
}

void zplc_hal_sleep(uint32_t ms) {
#ifdef _WIN32
  Sleep(ms);
#else
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
#endif
}

/* ============================================================================
 * GPIO Functions (Stubs for Phase 0)
 * ============================================================================
 */

zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value) {
  (void)channel; /* Suppress unused parameter warning */

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

zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value) {
  (void)channel;
  (void)value;

  /* Stub: Silently accept writes, do nothing */
  return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Analog I/O Functions (Stubs for Phase 0)
 * ============================================================================
 */

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
  (void)channel;

  if (value == NULL) {
    return ZPLC_HAL_ERROR;
  }

  *value = 0;
  return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value) {
  (void)channel;
  (void)value;

  return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Persistence Functions
 * ============================================================================
 */

/**
 * @brief Build the full path to a persistence file
 * @param key The key name (will become filename)
 * @param path Output buffer for the path
 * @param path_len Size of the output buffer
 * @return 0 on success, -1 on error
 */
static int persist_build_path(const char *key, char *path, size_t path_len) {
  const char *persist_root;
  char sanitized_key[ZPLC_PERSIST_KEY_MAX];
  int ret;
  size_t index;

  if (key == NULL) {
    return -1;
  }

  for (index = 0; index + 1U < sizeof(sanitized_key) && key[index] != '\0'; ++index) {
    sanitized_key[index] = (key[index] == '/') ? '_' : key[index];
  }
  sanitized_key[index] = '\0';

  persist_root = getenv(ZPLC_PERSIST_ROOT_ENV);
  if (persist_root == NULL || persist_root[0] == '\0') {
    persist_root = getenv("HOME");
    if (persist_root == NULL) {
#ifdef _WIN32
      persist_root = getenv("TEMP");
      if (persist_root == NULL) {
        persist_root = ".";
      }
#else
      persist_root = "/tmp"; /* Fallback if HOME is not set */
#endif
    }

    ret = snprintf(path, path_len, "%s%c%s%c%s.bin", persist_root,
                   ZPLC_PATH_SEP, ZPLC_PERSIST_DIR, ZPLC_PATH_SEP,
                   sanitized_key);
  } else {
    ret = snprintf(path, path_len, "%s%c%s.bin", persist_root,
                   ZPLC_PATH_SEP, sanitized_key);
  }

  if (ret < 0 || (size_t)ret >= path_len) {
    return -1; /* Path too long */
  }

  return 0;
}

/**
 * @brief Ensure the persistence directory exists
 * @return 0 on success, -1 on error
 */
static int persist_ensure_dir(void) {
  const char *persist_root;
  char dir_path[ZPLC_PATH_MAX];
  int ret;

  persist_root = getenv(ZPLC_PERSIST_ROOT_ENV);
  if (persist_root != NULL && persist_root[0] != '\0') {
    if (zplc_mkdir(persist_root) != 0 && errno != EEXIST) {
      zplc_hal_log("[HAL] Failed to create persist root dir: %s\n", strerror(errno));
      return -1;
    }
    return 0;
  }

  persist_root = getenv("HOME");
  if (persist_root == NULL) {
#ifdef _WIN32
    persist_root = getenv("TEMP");
    if (persist_root == NULL) {
      persist_root = ".";
    }
#else
    persist_root = "/tmp";
#endif
  }

  ret = snprintf(dir_path, sizeof(dir_path), "%s%c%s", persist_root,
                 ZPLC_PATH_SEP, ZPLC_PERSIST_DIR);
  if (ret < 0 || (size_t)ret >= sizeof(dir_path)) {
    return -1;
  }

  /* Create directory if it doesn't exist (mode 0755) */
  if (zplc_mkdir(dir_path) != 0 && errno != EEXIST) {
    zplc_hal_log("[HAL] Failed to create persist dir: %s\n", strerror(errno));
    return -1;
  }

  return 0;
}

/* Linux fsync() provides the directory-entry durability contract required
 * after rename().  Other host platforms retain the pre-existing semantics
 * until their corresponding directory-sync contract is verified. */
static int persist_sync_parent_dir(const char *path)
{
#if !defined(__linux__)
  (void)path;
  return 0;
#else
  char dir_path[ZPLC_PATH_MAX];
  char *separator;
  int directory_fd;
  int saved_errno;

  if (path == NULL || strlen(path) >= sizeof(dir_path)) {
    errno = EINVAL;
    return -1;
  }
  (void)strcpy(dir_path, path);
  separator = strrchr(dir_path, ZPLC_PATH_SEP);
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
  if (persist_parent_sync_fail_at != 0UL &&
      persist_parent_sync_attempt_count == persist_parent_sync_fail_at) {
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
#endif
}

zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data,
                                        size_t len) {
  char path[ZPLC_PATH_MAX];
  char tmp_path[ZPLC_PATH_MAX];
  FILE *fp;
  size_t written;
  int flush_failed;
  int tmp_path_length;

  if (key == NULL || data == NULL || len == 0) {
    return ZPLC_HAL_ERROR;
  }
  { zplc_hal_result_t injected = persist_test_result(); if (injected != ZPLC_HAL_OK) return injected; }

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
  tmp_path_length = snprintf(tmp_path, sizeof(tmp_path), "%s.tmp", path);
  if (tmp_path_length < 0 || (size_t)tmp_path_length >= sizeof(tmp_path)) {
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
    zplc_unlink(tmp_path); /* Clean up failed write */
    return ZPLC_HAL_ERROR;
  }

  /* Flush and sync to ensure data is on disk */
  flush_failed = fflush(fp) != 0;
  if (flush_failed == 0 && zplc_fsync(zplc_fileno(fp)) != 0) {
    flush_failed = 1;
  }
  if (fclose(fp) != 0) {
    flush_failed = 1;
  }
  if (flush_failed != 0) {
    zplc_hal_log("[HAL] Failed to flush %s: %s\n", tmp_path, strerror(errno));
    zplc_unlink(tmp_path);
    return ZPLC_HAL_ERROR;
  }

  /* Atomic rename: tmp -> final */
  if (rename(tmp_path, path) != 0) {
    zplc_hal_log("[HAL] Failed to rename %s -> %s: %s\n", tmp_path, path,
                 strerror(errno));
    zplc_unlink(tmp_path);
    return ZPLC_HAL_ERROR;
  }
  if (persist_sync_parent_dir(path) != 0) {
    int sync_errno = errno;
    zplc_hal_log("[HAL] Failed to sync parent directory for %s: %s\n", path,
                 strerror(sync_errno));
    errno = sync_errno;
    return ZPLC_HAL_COMMIT_UNKNOWN;
  }

  zplc_hal_log("[HAL] Saved %zu bytes to %s\n", len, path);
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data,
                                        size_t len) {
  char path[ZPLC_PATH_MAX];
  FILE *fp;
  size_t bytes_read;
  long file_size;
  int read_error;
  int close_error;

  if (key == NULL || data == NULL || len == 0) {
    return ZPLC_HAL_ERROR;
  }
  { zplc_hal_result_t injected = persist_test_result(); if (injected != ZPLC_HAL_OK) return injected; }

  /* Build the file path */
  if (persist_build_path(key, path, sizeof(path)) != 0) {
    return ZPLC_HAL_ERROR;
  }

  /* Open the file */
  fp = fopen(path, "rb");
  if (fp == NULL) {
    if (errno == ENOENT) {
      /* File doesn't exist - not an error, just no data */
      return ZPLC_HAL_NOT_IMPL; /* Indicates "not found" */
    }
    zplc_hal_log("[HAL] Failed to open %s: %s\n", path, strerror(errno));
    return ZPLC_HAL_ERROR;
  }

  /* Get file size to verify it matches expected length */
  if (fseek(fp, 0, SEEK_END) != 0) {
    (void)fclose(fp);
    return ZPLC_HAL_ERROR;
  }
  file_size = ftell(fp);
  if (fseek(fp, 0, SEEK_SET) != 0) {
    (void)fclose(fp);
    return ZPLC_HAL_ERROR;
  }

  if (file_size < 0) {
    (void)fclose(fp);
    return ZPLC_HAL_ERROR;
  }
  if ((unsigned long)file_size > (unsigned long)len) {
    (void)fclose(fp);
    return ZPLC_HAL_CORRUPT;
  }

  /* Existing callers intentionally accept shorter records; reject only
   * oversize and actual read errors. Length-sensitive users use an envelope. */
  bytes_read = fread(data, 1, (size_t)file_size, fp);
  read_error = bytes_read != (size_t)file_size || ferror(fp) != 0;
  close_error = fclose(fp) != 0;
  if (read_error != 0 || close_error != 0) {
    return ZPLC_HAL_ERROR;
  }

  if (bytes_read == 0) {
    zplc_hal_log("[HAL] Empty persisted record in %s\n", path);
    return ZPLC_HAL_CORRUPT;
  }

  zplc_hal_log("[HAL] Loaded %zu bytes from %s\n", bytes_read, path);
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_persist_delete(const char *key) {
  char path[ZPLC_PATH_MAX];

  if (key == NULL) {
    return ZPLC_HAL_ERROR;
  }
  { zplc_hal_result_t injected = persist_test_result(); if (injected != ZPLC_HAL_OK) return injected; }

  /* Build the file path */
  if (persist_build_path(key, path, sizeof(path)) != 0) {
    return ZPLC_HAL_ERROR;
  }

  /* Delete the file */
  if (zplc_unlink(path) != 0) {
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
 * Synchronization Functions
 * ============================================================================ */

#ifndef _WIN32

/**
 * @brief POSIX mutex wrapper structure.
 *
 * Wraps a pthread_mutex_t so we can return it as an opaque zplc_hal_mutex_t.
 */
typedef struct {
  pthread_mutex_t mtx;
} zplc_posix_mutex_t;

zplc_hal_mutex_t zplc_hal_mutex_create(void) {
  zplc_posix_mutex_t *wrapper =
      (zplc_posix_mutex_t *)malloc(sizeof(zplc_posix_mutex_t));
  if (wrapper == NULL) {
    return NULL;
  }

  if (pthread_mutex_init(&wrapper->mtx, NULL) != 0) {
    free(wrapper);
    return NULL;
  }

  return (zplc_hal_mutex_t)wrapper;
}

zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex) {
  zplc_posix_mutex_t *wrapper = (zplc_posix_mutex_t *)mutex;
  if (wrapper == NULL) {
    return ZPLC_HAL_ERROR;
  }

  if (pthread_mutex_lock(&wrapper->mtx) != 0) {
    return ZPLC_HAL_ERROR;
  }

  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex) {
  zplc_posix_mutex_t *wrapper = (zplc_posix_mutex_t *)mutex;
  if (wrapper == NULL) {
    return ZPLC_HAL_ERROR;
  }

  if (pthread_mutex_unlock(&wrapper->mtx) != 0) {
    return ZPLC_HAL_ERROR;
  }

  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex) {
  zplc_posix_mutex_t *wrapper = (zplc_posix_mutex_t *)mutex;
  if (wrapper == NULL) {
    return ZPLC_HAL_ERROR;
  }

  (void)pthread_mutex_destroy(&wrapper->mtx);
  free(wrapper);
  return ZPLC_HAL_OK;
}

#else /* _WIN32 */

typedef struct {
  HANDLE mtx;
} zplc_win32_mutex_t;

zplc_hal_mutex_t zplc_hal_mutex_create(void) {
  zplc_win32_mutex_t *wrapper =
      (zplc_win32_mutex_t *)malloc(sizeof(zplc_win32_mutex_t));
  if (wrapper == NULL) {
    return NULL;
  }

  wrapper->mtx = CreateMutex(NULL, FALSE, NULL);
  if (wrapper->mtx == NULL) {
    free(wrapper);
    return NULL;
  }

  return (zplc_hal_mutex_t)wrapper;
}

zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex) {
  zplc_win32_mutex_t *wrapper = (zplc_win32_mutex_t *)mutex;
  if (wrapper == NULL || wrapper->mtx == NULL) {
    return ZPLC_HAL_ERROR;
  }

  if (WaitForSingleObject(wrapper->mtx, INFINITE) != WAIT_OBJECT_0) {
    return ZPLC_HAL_ERROR;
  }

  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex) {
  zplc_win32_mutex_t *wrapper = (zplc_win32_mutex_t *)mutex;
  if (wrapper == NULL || wrapper->mtx == NULL) {
    return ZPLC_HAL_ERROR;
  }

  if (!ReleaseMutex(wrapper->mtx)) {
    return ZPLC_HAL_ERROR;
  }

  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex) {
  zplc_win32_mutex_t *wrapper = (zplc_win32_mutex_t *)mutex;
  if (wrapper == NULL) {
    return ZPLC_HAL_ERROR;
  }

  if (wrapper->mtx != NULL) {
    CloseHandle(wrapper->mtx);
  }
  free(wrapper);
  return ZPLC_HAL_OK;
}

#endif /* _WIN32 */

/* ============================================================================
 * Network Functions (Stubs for Phase 0)
 * ============================================================================
 */

zplc_hal_result_t zplc_hal_net_init(void) { return ZPLC_HAL_NOT_IMPL; }

zplc_hal_result_t zplc_hal_net_get_ip(char *buf, size_t len) {
  if (buf && len > 0)
    buf[0] = '\0';
  return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_dns_resolve(const char *hostname, char *ip_buf,
                                       size_t len) {
  (void)hostname;
  if (ip_buf && len > 0)
    ip_buf[0] = '\0';
  return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_socket_t zplc_hal_socket_connect(const char *host, uint16_t port) {
  (void)host;
  (void)port;

  /*
   * Stub: Return NULL (connection failed).
   * Phase 4 will implement BSD sockets.
   */
  return NULL;
}

int32_t zplc_hal_socket_send(zplc_hal_socket_t sock, const void *data,
                             size_t len) {
  (void)sock;
  (void)data;
  (void)len;

  return (int32_t)ZPLC_HAL_NOT_IMPL;
}

int32_t zplc_hal_socket_recv(zplc_hal_socket_t sock, void *buf, size_t len) {
  (void)sock;
  (void)buf;
  (void)len;

  return (int32_t)ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_socket_close(zplc_hal_socket_t sock) {
  (void)sock;

  return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Logging
 * ============================================================================
 */

void zplc_hal_log(const char *fmt, ...) {
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
 * ============================================================================
 */

zplc_hal_result_t zplc_hal_init(void) {
  zplc_hal_posix_clear_tick_override();
  if (hal_initialized) {
    zplc_hal_log("[HAL] Warning: Already initialized\n");
    return ZPLC_HAL_OK;
  }

  zplc_hal_log("[HAL] POSIX HAL initializing...\n");

  if (persist_ensure_dir() != 0) {
    zplc_hal_log("[HAL] Failed to prepare persistence directory\n");
    return ZPLC_HAL_ERROR;
  }

  zplc_hal_log("[HAL] Persistence root ready\n");

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

zplc_hal_result_t zplc_hal_shutdown(void) {
  zplc_hal_posix_clear_tick_override();
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
