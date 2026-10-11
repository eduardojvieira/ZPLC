/* What the embedder (the IDE) calls: the session of the native runtime, as exports of the module (tools/wasm-core).
 *
 * The session of firmware/apps/posix_host reads a request line and writes a response line and an event line; the
 * POSIX program reads and writes them on standard input and output. Here the host writes the request into the buffer
 * that zplc_wasm_request_buffer() returns, calls zplc_wasm_request() and reads the buffers of the response and of the
 * event. The runtime is the same code, so it answers the same requests with the same lines.
 *
 *   zplc_wasm_runtime_init()          the HAL and the session, a session ready to answer session.hello
 *   zplc_wasm_set_scenario_clock(on)  the virtual clock of scenario.step, for scenario tests
 *   zplc_wasm_request()               one request line (NUL-terminated) in the request buffer; the length of the
 *                                     response, with the event of the request left in the event buffer
 *   zplc_wasm_tick(now_ms)            the poll of the runtime: the scans that are due; the length of the event
 *   zplc_wasm_poll_timeout_ms(...)    how long the host may wait before the next tick
 *   zplc_wasm_shutdown()              what session.shutdown does on the POSIX host
 *
 *   zplc_wasm_trace_*                 the decisions of the scheduler core, in the order it took them (RT-008): admit,
 *                                     order, latch, task, miss, fault, commit. Off until the host enables it.
 *
 * The buffers of the artifact and of the verifier of the loader (zplc_shim_*) are for a host that drives the bare core
 * (zplc_core_load) instead of the session: the parity test of the conformance cases does.
 */
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include <zplc_comm_dispatch.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>
#include <zplc_sched_core.h>

#include "native_runtime_session.h"

#define ZPLC_SHIM_ARTIFACT_MAX ((uint32_t)ZPLC_MEM_CODE_SIZE)
#define ZPLC_SHIM_WORKSPACE_MAX ((uint32_t)ZPLC_LOADER_VERIFY_WORKSPACE_SIZE)

static uint8_t artifact[ZPLC_SHIM_ARTIFACT_MAX];
static uint8_t workspace[ZPLC_SHIM_WORKSPACE_MAX];

static zplc_native_runtime_session_t session;
static char request_line[ZPLC_NATIVE_REQUEST_MAX];
static char response_line[ZPLC_NATIVE_RESPONSE_MAX];
static char event_line[ZPLC_NATIVE_EVENT_MAX];

/* One decision of the scheduler core: the fields of zplc_sched_trace_fn, fixed width so that a host reads them with a
 * DataView. The ring keeps the first ZPLC_TRACE_CAPACITY decisions after the host enabled or cleared it. */
#define ZPLC_TRACE_CAPACITY 512U

typedef struct {
    uint32_t kind; /* zplc_sched_trace_kind_t */
    uint32_t task_id;
    uint64_t a;
    uint64_t b;
} trace_record_t;

static trace_record_t trace_records[ZPLC_TRACE_CAPACITY];
static uint32_t trace_count;
static int trace_enabled;

static void trace_record(void *context, zplc_sched_trace_kind_t kind, uint16_t task_id, uint64_t a, uint64_t b)
{
    (void)context;
    if (trace_count < ZPLC_TRACE_CAPACITY) {
        trace_records[trace_count].kind = (uint32_t)kind;
        trace_records[trace_count].task_id = task_id;
        trace_records[trace_count].a = a;
        trace_records[trace_count].b = b;
        trace_count++;
    }
}

/* The core is initialised again whenever a program is loaded, which drops the sink: it is installed again after every
 * call that can have loaded one. */
static void trace_attach(void)
{
    if (trace_enabled != 0) {
        zplc_sched_core_set_trace(&session.core, trace_record, NULL);
    }
}

void zplc_wasm_trace_enable(int32_t enabled)
{
    trace_enabled = enabled != 0;
    trace_count = 0U;
    if (trace_enabled != 0) {
        trace_attach();
    } else {
        zplc_sched_core_set_trace(&session.core, NULL, NULL);
    }
}

void zplc_wasm_trace_clear(void) { trace_count = 0U; }
uint32_t zplc_wasm_trace_count(void) { return trace_count; }
const void *zplc_wasm_trace_records(void) { return trace_records; }
uint32_t zplc_wasm_trace_record_size(void) { return (uint32_t)sizeof(trace_record_t); }

uint8_t *zplc_shim_artifact(void) { return artifact; }
uint32_t zplc_shim_artifact_capacity(void) { return ZPLC_SHIM_ARTIFACT_MAX; }
uint8_t *zplc_shim_workspace(void) { return workspace; }
uint32_t zplc_shim_workspace_capacity(void) { return ZPLC_SHIM_WORKSPACE_MAX; }

char *zplc_wasm_request_buffer(void) { return request_line; }
uint32_t zplc_wasm_request_capacity(void) { return (uint32_t)sizeof(request_line); }
const char *zplc_wasm_response_buffer(void) { return response_line; }
const char *zplc_wasm_event_buffer(void) { return event_line; }

/* A module has no network. Every communication block has a handler that says so: it fails the request at once with
 * STATUS 10 (UNAVAILABLE), the defined "this runtime cannot do it", so that no block reports success without acting
 * and a program is told the real reason, not "no handler". */
static int comm_unavailable(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len, zplc_comm_call_t call)
{
    (void)kind;
    (void)fb_mem;
    (void)fb_len;
    return call == ZPLC_COMM_CALL_RESET ? ZPLC_COMM_HANDLER_DONE : ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNAVAILABLE);
}

#define ZPLC_REGISTER_UNAVAILABLE(name, kind, size) \
    (void)zplc_comm_register_handler((zplc_comm_fb_kind_t)(kind), comm_unavailable);

/** The session starts with the clock of the host. */
int32_t zplc_wasm_runtime_init(void)
{
    if (zplc_hal_init() != ZPLC_HAL_OK) {
        return -1;
    }
    zplc_native_runtime_session_init(&session);
    ZPLC_COMM_FB_TABLE(ZPLC_REGISTER_UNAVAILABLE)
    return 0;
}

/**
 * The scenario clock of the session (scenario.step): time is what the scenario says, not what the host's clock reads.
 * It is the setting that ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK=1 gives the POSIX process, and like it a setting for
 * scenario tests: the host of a simulation that a person drives does not enable it.
 */
void zplc_wasm_set_scenario_clock(int32_t enabled)
{
    zplc_native_runtime_session_set_scenario_clock_enabled(&session, enabled);
}

int32_t zplc_wasm_request(void)
{
    response_line[0] = '\0';
    event_line[0] = '\0';
    request_line[sizeof(request_line) - 1U] = '\0';
    (void)zplc_native_runtime_session_handle_request(&session, request_line, response_line, sizeof(response_line),
                                                     event_line, sizeof(event_line));
    trace_attach();
    return (int32_t)strlen(response_line);
}

int32_t zplc_wasm_tick(uint32_t now_ms)
{
    event_line[0] = '\0';
    (void)zplc_native_runtime_session_tick(&session, now_ms, event_line, sizeof(event_line));
    return (int32_t)strlen(event_line);
}

int32_t zplc_wasm_event_length(void)
{
    return (int32_t)strlen(event_line);
}

uint32_t zplc_wasm_poll_timeout_ms(uint32_t now_ms, uint32_t max_timeout_ms)
{
    return zplc_native_runtime_session_poll_timeout_ms(&session, now_ms, max_timeout_ms);
}

int32_t zplc_wasm_should_exit(void)
{
    return zplc_native_runtime_session_should_exit(&session);
}

void zplc_wasm_shutdown(void)
{
    zplc_native_runtime_session_shutdown(&session);
    (void)zplc_hal_shutdown();
}
