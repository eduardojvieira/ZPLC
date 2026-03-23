/**
 * @file native_runtime_session.h
 * @brief Native simulator session helpers for the POSIX host runtime.
 */

#ifndef ZPLC_NATIVE_RUNTIME_SESSION_H
#define ZPLC_NATIVE_RUNTIME_SESSION_H

#include <stddef.h>
#include <stdint.h>

#include <zplc_isa.h>

#ifndef ZPLC_MEM_CODE_SIZE
#define ZPLC_MEM_CODE_SIZE 0xB000U
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    ZPLC_NATIVE_SESSION_IDLE = 0,
    ZPLC_NATIVE_SESSION_RUNNING,
    ZPLC_NATIVE_SESSION_PAUSED,
    ZPLC_NATIVE_SESSION_ERROR
} zplc_native_session_state_t;

typedef enum {
    ZPLC_NATIVE_PROGRAM_RAW = 0,
    ZPLC_NATIVE_PROGRAM_ZPLC = 1,
} zplc_native_program_format_t;

typedef struct {
    uint8_t program_loaded;
    uint8_t should_exit;
    uint8_t reserved0;
    uint8_t reserved1;
    zplc_native_session_state_t state;
    uint32_t cycle_count;
    uint32_t overrun_count;
    uint32_t scan_interval_ms;
    uint32_t last_scan_tick_ms;
    uint32_t program_size;
    zplc_native_program_format_t program_format;
    uint8_t program[ZPLC_MEM_CODE_SIZE];
} zplc_native_runtime_session_t;

void zplc_native_runtime_session_init(zplc_native_runtime_session_t *session);

void zplc_native_runtime_session_shutdown(zplc_native_runtime_session_t *session);

int zplc_native_runtime_session_handle_request(zplc_native_runtime_session_t *session,
                                               const char *request_line,
                                               char *response,
                                               size_t response_size,
                                               char *event,
                                               size_t event_size);

int zplc_native_runtime_session_tick(zplc_native_runtime_session_t *session,
                                     uint32_t now_ms,
                                     char *event,
                                     size_t event_size);

uint32_t zplc_native_runtime_session_poll_timeout_ms(
    const zplc_native_runtime_session_t *session,
    uint32_t now_ms,
    uint32_t max_timeout_ms);

int zplc_native_runtime_session_should_exit(
    const zplc_native_runtime_session_t *session);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_NATIVE_RUNTIME_SESSION_H */
