/**
 * @file main.c
 * @brief POSIX native runtime session entry point.
 *
 * Reads one JSON request per line from stdin, writes one JSON response per line
 * to stdout, and emits async JSON events on stdout as they occur.
 */

#include "native_runtime_session.h"
#include "native_device_link.h"
#include "host_stdio.h"

#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zplc_hal.h>

#ifdef ZPLC_HOST_COMM
#include "host_comm.h"
#endif

/* ZPLC_NATIVE_REQUEST_MAX, _RESPONSE_MAX and _EVENT_MAX are in native_runtime_session.h. */
#define ZPLC_NATIVE_REQUEST_POLL_MS 10U

/*
 * The pending buffer must hold a whole request line: a smaller one would cut the
 * largest program.load into pieces. A negative array size stops the build instead.
 */
typedef char zplc_pending_holds_a_request[(ZPLC_HOST_STDIO_PENDING_MAX >= ZPLC_NATIVE_REQUEST_MAX) ? 1 : -1];

static void emit_session_ready_event(void)
{
    (void)fprintf(stdout,
                  "{\"type\":\"event\",\"method\":\"session.ready\",\"params\":{\"runtime_kind\":\"native-posix\"}}\n");
    (void)fflush(stdout);
}

static volatile sig_atomic_t keep_running = 1;

static void signal_handler(int signal_value)
{
    (void)signal_value;
    keep_running = 0;
}

/* A handler that was not installed leaves the default action: the process dies without the session shutting down. */
static void install_signal_handler(int signal_number, const char *name)
{
    if (signal(signal_number, signal_handler) == SIG_ERR) {
        (void)fprintf(stderr, "[native-sim] could not install the %s handler; it will not stop the runtime gracefully\n", name);
    }
}

static void write_json_line(FILE *stream, const char *line)
{
    if (stream == NULL || line == NULL || line[0] == '\0') {
        return;
    }

    (void)fprintf(stream, "%s\n", line);
    (void)fflush(stream);
}

/*
 * A line longer than the request buffer comes back in buffer-sized pieces. The
 * first is answered with this error; the rest of the line is dropped, so no
 * piece is parsed as a request of its own.
 */
static void write_request_too_long_error(void)
{
    (void)fprintf(stdout,
                  "{\"id\":\"unknown\",\"type\":\"response\",\"error\":{\"code\":\"INVALID_REQUEST\","
                  "\"message\":\"request line is longer than the %u bytes the runtime reads\"}}\n",
                  (ZPLC_NATIVE_REQUEST_MAX - 1U));
    (void)fflush(stdout);
}

int main(int argc, char **argv)
{
    zplc_native_runtime_session_t session;
    int device_link = 0;
    int device_link_network = 0;
    int arg;
    /*
     * The request buffer is 96 KiB: the hex of the largest program plus the envelope.
     * Measured with gcc -fstack-usage at -O2, this frame is ~175 KiB (the session is
     * 62 KiB) and handle_request, which parses into its own ~89 KiB request struct, sits
     * below it: ~265 KiB at the deepest, against the 8 MiB main-thread stack of Linux and
     * macOS and the 1 MiB of Windows.
     */
    char request_line[ZPLC_NATIVE_REQUEST_MAX];
    char response[ZPLC_NATIVE_RESPONSE_MAX];
    char event[ZPLC_NATIVE_EVENT_MAX];
    zplc_host_stdio_result_t io_result;
    int discarding_long_line = 0;

    for (arg = 1; arg < argc; arg++) {
        if (strcmp(argv[arg], "--device-link") == 0) {
            device_link = 1;
        } else if (strcmp(argv[arg], "--device-link-network") == 0) {
            device_link = 1;
            device_link_network = 1; /* the rules of a network transport, on standard input and output */
        } else {
            (void)fprintf(stderr, "usage: %s [--device-link | --device-link-network]\n", argv[0]);
            return 2;
        }
    }

    install_signal_handler(SIGINT, "SIGINT");
    install_signal_handler(SIGTERM, "SIGTERM");

    if (zplc_hal_init() != ZPLC_HAL_OK) {
        (void)fprintf(stderr, "[native-sim] HAL initialization failed\n");
        return 1;
    }

#ifdef ZPLC_HOST_COMM
    /* The communication blocks answer a peer only when the session was started with ZPLC_NATIVE_COMM=1. */
    {
        const int comm_rc = zplc_host_comm_init_from_environment();

        if (comm_rc != 0) {
            (void)fprintf(stderr, "[native-sim] the communication blocks are not available: %d\n", comm_rc);
        }
        {
            zplc_host_endpoints_t endpoints;
            char reason[160];

            zplc_host_comm_endpoints(&endpoints);
            if (endpoints.state == ZPLC_HOST_ENDPOINTS_RUNNING) {
                (void)snprintf(reason, sizeof(reason),
                               "Modbus TCP and MQTT blocks reach simulated endpoints on 127.0.0.1 (Modbus %u, MQTT %u); "
                               "cloud blocks are unavailable in simulation",
                               (unsigned)endpoints.modbus_port, (unsigned)endpoints.mqtt_port);
                zplc_native_runtime_set_endpoints("degraded", reason);
            } else if (endpoints.state == ZPLC_HOST_ENDPOINTS_FAILED) {
                zplc_native_runtime_set_endpoints(
                    "unavailable", "the simulated Modbus and MQTT endpoints could not start; "
                                   "every communication block reports unavailable in simulation");
            }
        }
    }
#endif

    zplc_native_runtime_session_init(&session);
    {
        const char *scenario_clock = getenv("ZPLC_NATIVE_SCENARIO_VIRTUAL_CLOCK");
        zplc_native_runtime_session_set_scenario_clock_enabled(
            &session, scenario_clock != NULL && strcmp(scenario_clock, "1") == 0);
    }
    if (device_link != 0) {
        /* COM-019: frames of the device link protocol on standard input and output, no JSON */
        const int link_status = zplc_native_device_link_run(&session, device_link_network);

        zplc_native_runtime_session_shutdown(&session);
        zplc_hal_shutdown();
        return link_status;
    }
    emit_session_ready_event();

    while (keep_running && !zplc_native_runtime_session_should_exit(&session)) {
        const uint32_t now_ms = zplc_hal_tick();
        const uint32_t poll_timeout_ms = zplc_native_runtime_session_poll_timeout_ms(
            &session,
            now_ms,
            ZPLC_NATIVE_REQUEST_POLL_MS);

        event[0] = '\0';
        (void)zplc_native_runtime_session_tick(&session, now_ms, event, sizeof(event));
        write_json_line(stdout, event);

        request_line[0] = '\0';
        io_result = zplc_host_wait_for_request_line(stdin,
                                                    request_line,
                                                    sizeof(request_line),
                                                    poll_timeout_ms);
        if (io_result == ZPLC_HOST_STDIO_TIMEOUT) {
            continue;
        }

        if (io_result == ZPLC_HOST_STDIO_EOF) {
            break;
        }

        if (io_result == ZPLC_HOST_STDIO_ERROR &&
            strlen(request_line) == sizeof(request_line) - 1U) {
            /* A full buffer with no newline: the front of a line that does not fit. */
            if (discarding_long_line == 0) {
                write_request_too_long_error();
                discarding_long_line = 1;
            }
            continue;
        }

        if (discarding_long_line != 0 &&
            (io_result == ZPLC_HOST_STDIO_READY || request_line[0] != '\0')) {
            /* The last piece of that line: its tail (ending in a newline) or an unfinished end of input. */
            discarding_long_line = 0;
            continue;
        }

        if (io_result != ZPLC_HOST_STDIO_READY) {
            (void)fprintf(stderr, "[native-sim] stdin read error\n");
            zplc_hal_sleep(ZPLC_NATIVE_REQUEST_POLL_MS);
            continue;
        }

        if (request_line[0] == '\0' && feof(stdin) != 0) {
            break;
        }

        response[0] = '\0';
        event[0] = '\0';

        (void)zplc_native_runtime_session_handle_request(&session,
                                                         request_line,
                                                         response,
                                                         sizeof(response),
                                                         event,
                                                         sizeof(event));

        write_json_line(stdout, response);
        write_json_line(stdout, event);
    }

    zplc_native_runtime_session_shutdown(&session);
    (void)fprintf(stdout, "{\"type\":\"event\",\"method\":\"session.exited\",\"params\":{}}\n");
    (void)fflush(stdout);
    zplc_hal_shutdown();

    return 0;
}
