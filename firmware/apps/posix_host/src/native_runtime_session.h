/**
 * @file native_runtime_session.h
 * @brief Native simulator session helpers for the POSIX host runtime.
 */

#ifndef ZPLC_NATIVE_RUNTIME_SESSION_H
#define ZPLC_NATIVE_RUNTIME_SESSION_H

#include <stddef.h>
#include <stdint.h>

#include <zplc_isa.h>
#include <zplc_core.h>
#include <zplc_loader.h>

#ifndef ZPLC_MEM_CODE_SIZE
#define ZPLC_MEM_CODE_SIZE 0xB000U
#endif

/*
 * Sizes of the lines the POSIX host reads and writes on stdio (see main.c).
 *
 * A request line is a JSON envelope plus, for program.load, the whole program as
 * hex: two characters per byte, ZPLC_MEM_CODE_SIZE bytes at most. The envelope
 * is the id (63 characters at most), the method and the JSON punctuation, well
 * under ZPLC_NATIVE_REQUEST_ENVELOPE_MAX; the room that is left over lets a
 * program a little past the limit arrive whole, so it is refused by name instead
 * of being cut. The request buffer holds the line, its newline and the string
 * terminator. The IDE mirrors these numbers in packages/zplc-ide/electron/security.ts
 * and a test there fails when they drift apart.
 *
 * Responses and events are one line each; the IDE supervisor drops a session
 * that writes a line over 8191 bytes, so these stay at 8192.
 */
#define ZPLC_NATIVE_REQUEST_ENVELOPE_MAX 8192U
#define ZPLC_NATIVE_REQUEST_MAX ((ZPLC_MEM_CODE_SIZE * 2U) + ZPLC_NATIVE_REQUEST_ENVELOPE_MAX)
#define ZPLC_NATIVE_RESPONSE_MAX 8192U
#define ZPLC_NATIVE_EVENT_MAX 8192U

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
    ZPLC_NATIVE_PROGRAM_NONE = 0,
    ZPLC_NATIVE_PROGRAM_ZPLC = 1,
} zplc_native_program_format_t;

typedef struct {
    uint8_t program_loaded;
    uint8_t should_exit;
    uint8_t timed_scan_started;
    uint8_t scenario_clock_enabled;
    uint8_t scenario_timestamp_started;
    /* Start/stop are host-owned one-scan pulses; E-stop is maintained. */
    uint8_t simulation_pulse_mask;
    zplc_native_session_state_t state;
    uint32_t cycle_count;
    uint32_t overrun_count;
    uint32_t scan_interval_ms;
    uint32_t last_scan_tick_ms;
    uint32_t scenario_last_timestamp_ms;
    uint32_t missed_interval_count;
    uint32_t last_dispatch_lateness_ms;
    uint32_t program_generation;
    uint32_t program_size;
    zplc_native_program_format_t program_format;
    uint8_t task_count;
    uint8_t has_task_segment;
    zplc_task_def_t tasks[ZPLC_LOADER_MAX_TASKS];
    zplc_vm_t task_vms[ZPLC_LOADER_MAX_TASKS];
    uint8_t program[ZPLC_MEM_CODE_SIZE];
} zplc_native_runtime_session_t;

void zplc_native_runtime_session_init(zplc_native_runtime_session_t *session);

void zplc_native_runtime_session_set_scenario_clock_enabled(
    zplc_native_runtime_session_t *session,
    int enabled);

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
