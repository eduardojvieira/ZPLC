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
#include <zplc_sched_core.h>
#include <zplc_io_trace.h>

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

/* LRN-024: bytes of the session's I/O trace ring (see zplc_io_trace.h); a board's ring is CONFIG_ZPLC_IO_TRACE_BUFFER_SIZE. */
#define ZPLC_NATIVE_IO_TRACE_BYTES 16384U
/* The most samples one trace.read returns, so that a response stays one line under ZPLC_NATIVE_RESPONSE_MAX. */
#define ZPLC_NATIVE_IO_TRACE_READ_MAX 32U

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

/* Why the session is in ERROR (RT-014); the status reports it as a string. */
typedef enum {
  ZPLC_NATIVE_FAULT_NONE = 0,
  ZPLC_NATIVE_FAULT_DEADLINE_MISS, /* one task missed its deadline deadline_miss_limit times in a row */
  ZPLC_NATIVE_FAULT_VM,            /* a task faulted: VM error or instruction budget */
  ZPLC_NATIVE_FAULT_RUNTIME        /* any other failure of the host runtime */
} zplc_native_fault_reason_t;

/* LRN-017: the most writes into the input image that can wait for the next scan, and the most bytes of one (the
 * bound of memory.write). */
#define ZPLC_NATIVE_STAGED_INPUTS_MAX 32U
#define ZPLC_NATIVE_STAGED_INPUT_BYTES 64U

typedef struct {
  uint16_t address;
  uint8_t length;
  uint8_t bytes[ZPLC_NATIVE_STAGED_INPUT_BYTES];
} zplc_native_staged_input_t;

typedef struct {
  uint8_t program_loaded;
  uint8_t should_exit;
  uint8_t timed_scan_started;
  uint8_t scenario_clock_enabled;
  uint8_t scenario_timestamp_started;
  /* Start/stop are host-owned one-scan pulses; E-stop is maintained. */
  uint8_t simulation_pulse_mask;
  /*
     * LRN-017, RT-009: a memory.write into the input image while the program runs is queued here, and the start of the
     * next scan applies it; the image a scan reads never changes inside that scan. scan_in_flight is 1 while a
     * breakpoint has held a scan that has begun and not ended: the queue waits for its end. A paused program takes a
     * write at once, which is how a debugger's write has always behaved.
     */
  zplc_native_staged_input_t staged_inputs[ZPLC_NATIVE_STAGED_INPUTS_MAX];
  uint8_t staged_input_count;
  uint8_t scan_in_flight;
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
  /*
     * RT-015: 1 when the tasks do not all share one interval. Each task is then
     * released at its own interval, and scan_interval_ms is the greatest common
     * divisor of the intervals (the step of a scenario).
     */
  uint8_t multirate;
  /*
     * multirate only: the instant each task is next released, on a grid that starts at the common start and
     * advances by the task's interval, whatever the instant the host dispatches. Indexed like tasks[].
     */
  uint32_t task_next_release_ms[ZPLC_LOADER_MAX_TASKS];
  uint32_t task_cycles[ZPLC_LOADER_MAX_TASKS];
  /* RT-014: deadline misses of each task, and the run of them that has not been broken by a scan in time. */
  uint32_t task_misses[ZPLC_LOADER_MAX_TASKS];
  uint32_t task_consecutive_misses[ZPLC_LOADER_MAX_TASKS];
  /* Consecutive misses of one task that latch the fault; 1 or more (ZPLC_DEADLINE_MISS_LIMIT). */
  uint32_t deadline_miss_limit;
  /* How far past its deadline the last late task ended, in microseconds (a multiple of 1000: the host clock is in ms). */
  uint32_t last_overrun_us;
  zplc_native_fault_reason_t fault_reason;
  uint16_t fault_task_id;
  /*
     * RT-008: admission, order, deadlines, the fault latch and the scan phases are decided by the portable
     * scheduler core, the same one the firmware runs. The session supplies the clock and the poll loop. The fields
     * above that report misses and the fault are what the status shows: they follow the core after every batch.
     */
  zplc_sched_slot_t core_slots[ZPLC_LOADER_MAX_TASKS];
  zplc_sched_core_t core;
  /* Milliseconds clock that times a scan; NULL means zplc_hal_tick(). A test sets it to let time pass inside a scan. */
  uint32_t (*clock_ms)(void);
  /*
     * LRN-024: the per-scan trace of the I/O images a board keeps, fed by the core at the end of each scan and read
     * with trace.read, so that the device-trace recorder of the ZPLC application can be tested against this runtime. Timestamps come
     * from the clock above.
     */
  zplc_io_trace_t io_trace;
  uint8_t io_trace_storage[ZPLC_NATIVE_IO_TRACE_BYTES];
  uint8_t program[ZPLC_MEM_CODE_SIZE];
} zplc_native_runtime_session_t;

void zplc_native_runtime_session_init(zplc_native_runtime_session_t *session);

void zplc_native_runtime_session_set_scenario_clock_enabled(zplc_native_runtime_session_t *session, int enabled);

void zplc_native_runtime_session_shutdown(zplc_native_runtime_session_t *session);

int zplc_native_runtime_session_handle_request(zplc_native_runtime_session_t *session, const char *request_line, char *response,
                                               size_t response_size, char *event, size_t event_size);

int zplc_native_runtime_session_tick(zplc_native_runtime_session_t *session, uint32_t now_ms, char *event, size_t event_size);

uint32_t zplc_native_runtime_session_poll_timeout_ms(const zplc_native_runtime_session_t *session, uint32_t now_ms,
                                                     uint32_t max_timeout_ms);

int zplc_native_runtime_session_should_exit(const zplc_native_runtime_session_t *session);

/**
 * Tell the hello of the session what the communication endpoints are (COM-009): status "supported", "degraded" or
 * "unavailable", and a reason with no quotes or backslashes. NULL status leaves the feature out (the default).
 */
void zplc_native_runtime_set_endpoints(const char *status, const char *reason);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_NATIVE_RUNTIME_SESSION_H */
