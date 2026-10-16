/**
 * @file zplc_hal_wasm.c
 * @brief ZPLC Hardware Abstraction Layer - WebAssembly Implementation
 *
 * SPDX-License-Identifier: MIT
 *
 * The port of a module that has no operating system: the host that instantiates the module (the IDE, in a browser
 * or in a desktop renderer) supplies what the core needs through five imports of the module "zplc_host":
 *
 *   clock_ms        monotonic milliseconds                                   (zplc_hal_tick)
 *   persist_save    store a record under a key                               (zplc_hal_persist_save)
 *   persist_load    read a record, at most `length` bytes                    (zplc_hal_persist_load)
 *   persist_delete  remove a record                                          (zplc_hal_persist_delete)
 *   log             one line of diagnostics, a NUL-terminated string         (zplc_hal_log)
 *
 * The persistence imports return a zplc_hal_result_t, with the meaning of the POSIX port: ZPLC_HAL_NOT_IMPL for a
 * key that is not stored, ZPLC_HAL_CORRUPT for a record larger than the buffer. Which store lies behind them is the
 * host's decision (the IDE keeps the RETAIN records in the storage of the open project); the retain rules
 * themselves are the ones of zplc_retain.c, the same file the firmware and the POSIX host run (RT-027).
 *
 * The port has no pins: a program exchanges its process image with Studio, so the I/O table is empty (as on the
 * POSIX port) and there is no network. Time is the host's: a browser clock has the resolution and the jitter that
 * the browser gives it, and nothing in this port makes it deterministic.
 *
 * The same file compiles on a host, with the imports replaced by stubs, so that the HAL contract check and a
 * static analysis see one definition of every function.
 *
 * Build: tools/wasm-core/build.ts (clang --target=wasm32 and wasm-ld, no C library, no Emscripten).
 */

#include <zplc_hal.h>
#include <zplc_hal_posix.h>

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

/* ============================================================================
 * Host imports
 * ============================================================================ */

#if defined(__wasm__)

#define ZPLC_HOST_IMPORT(name) __attribute__((import_module("zplc_host"), import_name(name)))

ZPLC_HOST_IMPORT("clock_ms") extern uint32_t zplc_host_clock_ms(void);
ZPLC_HOST_IMPORT("persist_save") extern int32_t zplc_host_persist_save(const char *key, const void *data, uint32_t length);
ZPLC_HOST_IMPORT("persist_load") extern int32_t zplc_host_persist_load(const char *key, void *data, uint32_t length);
ZPLC_HOST_IMPORT("persist_delete") extern int32_t zplc_host_persist_delete(const char *key);
ZPLC_HOST_IMPORT("log") extern void zplc_host_log(const char *line);

#else

/* A host build: no module, so no host. The persistence of such a build is "not available". */
static uint32_t zplc_host_clock_ms(void) { return 0U; }
static int32_t zplc_host_persist_save(const char *key, const void *data, uint32_t length) {
    (void)key; (void)data; (void)length;
    return ZPLC_HAL_NOT_IMPL;
}
static int32_t zplc_host_persist_load(const char *key, void *data, uint32_t length) {
    (void)key; (void)data; (void)length;
    return ZPLC_HAL_NOT_IMPL;
}
static int32_t zplc_host_persist_delete(const char *key) {
    (void)key;
    return ZPLC_HAL_NOT_IMPL;
}
static void zplc_host_log(const char *line) { (void)line; }

#endif

/* ============================================================================
 * Internal State
 * ============================================================================ */

static int tick_override_active = 0;
static uint32_t tick_override_ms = 0U;

/* The logical clock of a scenario: the session sets it for the length of a scenario step and clears it after, as it
 * does on the POSIX port (zplc_hal_posix.h). */
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

/* ============================================================================
 * Timing Functions
 * ============================================================================ */

/**
 * @brief The current tick in milliseconds: the logical clock of a scenario, or the host's clock.
 */
uint32_t zplc_hal_tick(void)
{
    if (tick_override_active != 0) {
        return tick_override_ms;
    }
    return zplc_host_clock_ms();
}

/**
 * @brief Sleep for the specified number of milliseconds.
 *
 * A module cannot block: the host calls the runtime again when the next release is due, so this does nothing.
 */
void zplc_hal_sleep(uint32_t ms)
{
    (void)ms;
}

/* ============================================================================
 * GPIO and Analog I/O
 * ============================================================================
 * There are no pins in a browser: the I/O table is empty and these answer "not available", as on the POSIX port.
 */

zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value)
{
    (void)channel;
    if (value == NULL) {
        return ZPLC_HAL_ERROR;
    }
    *value = 0;
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value)
{
    (void)channel;
    (void)value;
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value)
{
    (void)channel;
    if (value != NULL) {
        *value = 0;
    }
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

zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data, size_t len)
{
    if (key == NULL || data == NULL || len == 0U || len > 0xFFFFFFFFU) {
        return ZPLC_HAL_ERROR;
    }
    return (zplc_hal_result_t)zplc_host_persist_save(key, data, (uint32_t)len);
}

zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data, size_t len)
{
    if (key == NULL || data == NULL || len == 0U || len > 0xFFFFFFFFU) {
        return ZPLC_HAL_ERROR;
    }
    return (zplc_hal_result_t)zplc_host_persist_load(key, data, (uint32_t)len);
}

zplc_hal_result_t zplc_hal_persist_delete(const char *key)
{
    if (key == NULL) {
        return ZPLC_HAL_ERROR;
    }
    return (zplc_hal_result_t)zplc_host_persist_delete(key);
}

/* ============================================================================
 * Synchronization Functions
 * ============================================================================ */

zplc_hal_mutex_t zplc_hal_mutex_create(void)
{
    /* One thread runs the module, so a lock never waits: the handle is a token. */
    return (zplc_hal_mutex_t)1;
}

zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex)
{
    (void)mutex;
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex)
{
    (void)mutex;
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex)
{
    /* The handle of zplc_hal_mutex_create() is a token: there is nothing to release. */
    return mutex != NULL ? ZPLC_HAL_OK : ZPLC_HAL_ERROR;
}

/* ============================================================================
 * Network Functions (not available in a module)
 * ============================================================================
 * The communication blocks reach the network through handlers that a runtime registers; this one registers none,
 * so a program that uses one gets STATUS 10 (UNAVAILABLE) from the dispatcher of the core.
 */

zplc_hal_result_t zplc_hal_net_init(void)
{
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_net_get_ip(char *buf, size_t len)
{
    if (buf != NULL && len > 0U) {
        buf[0] = '\0';
    }
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_dns_resolve(const char *hostname, char *ip_buf, size_t len)
{
    (void)hostname;
    if (ip_buf != NULL && len > 0U) {
        ip_buf[0] = '\0';
    }
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_socket_t zplc_hal_socket_connect(const char *host, uint16_t port)
{
    (void)host;
    (void)port;
    return NULL;
}

int32_t zplc_hal_socket_send(zplc_hal_socket_t sock, const void *data, size_t len)
{
    (void)sock;
    (void)data;
    (void)len;
    return (int32_t)ZPLC_HAL_NOT_IMPL;
}

int32_t zplc_hal_socket_recv(zplc_hal_socket_t sock, void *buf, size_t len)
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

/**
 * @brief Format one line and hand it to the host. A line longer than the buffer is cut.
 */
void zplc_hal_log(const char *fmt, ...)
{
    char line[256];
    va_list args;

    va_start(args, fmt);
    (void)vsnprintf(line, sizeof(line), fmt, args);
    va_end(args);

    zplc_host_log(line);
}

/* ============================================================================
 * System Initialization
 * ============================================================================ */

zplc_hal_result_t zplc_hal_init(void)
{
    zplc_hal_posix_clear_tick_override();
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_shutdown(void)
{
    return ZPLC_HAL_OK;
}

/* ============================================================================
 * I/O Table (IO-001, IO-007)
 * ============================================================================
 * This port has no pins: the runtime exchanges the process image with Studio, so its board description lists no
 * channel. The accessors are the same on every port.
 */

static const zplc_io_table_t zplc_io_empty_description = {
    "wasm", 0U, 0U, 0U, 0U, NULL};

const zplc_io_table_t *zplc_io_table(void) {
  return &zplc_io_empty_description;
}

#include "../common/zplc_io_common.inc"
