/**
 * @file main.c
 * @brief POSIX native runtime session entry point.
 *
 * Reads one JSON request per line from stdin, writes one JSON response per line
 * to stdout, and emits async JSON events on stdout as they occur.
 */

#include "native_runtime_session.h"
#include "host_stdio.h"

#include <signal.h>
#include <stdio.h>
#include <string.h>

#include <zplc_hal.h>

#define ZPLC_NATIVE_REQUEST_MAX 8192U
#define ZPLC_NATIVE_RESPONSE_MAX 8192U
#define ZPLC_NATIVE_EVENT_MAX 8192U
#define ZPLC_NATIVE_REQUEST_POLL_MS 10U

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

static void write_json_line(FILE *stream, const char *line)
{
    if (stream == NULL || line == NULL || line[0] == '\0') {
        return;
    }

    (void)fprintf(stream, "%s\n", line);
    (void)fflush(stream);
}

int main(void)
{
    zplc_native_runtime_session_t session;
    char request_line[ZPLC_NATIVE_REQUEST_MAX];
    char response[ZPLC_NATIVE_RESPONSE_MAX];
    char event[ZPLC_NATIVE_EVENT_MAX];
    zplc_host_stdio_result_t io_result;

    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    if (zplc_hal_init() != ZPLC_HAL_OK) {
        (void)fprintf(stderr, "[native-sim] HAL initialization failed\n");
        return 1;
    }

    zplc_native_runtime_session_init(&session);
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

        if (io_result != ZPLC_HOST_STDIO_READY) {
            (void)fprintf(stderr, "[native-sim] stdin read error\n");
            zplc_hal_sleep(ZPLC_NATIVE_REQUEST_POLL_MS);
            continue;
        }

        if (request_line[0] == '\0') {
            if (feof(stdin) != 0) {
                break;
            }
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
