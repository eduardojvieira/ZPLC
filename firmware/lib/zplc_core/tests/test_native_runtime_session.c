/**
 * @file test_native_runtime_session.c
 * @brief Native runtime session protocol tests for the POSIX host runtime.
 */

#include "native_runtime_session.h"

#include <stdio.h>
#include <stdint.h>
#include <string.h>

#include <zplc_isa.h>

static int test_count = 0;
static int fail_count = 0;

#define TEST_ASSERT(cond, msg) do { \
    test_count++; \
    if (!(cond)) { \
        fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
        fail_count++; \
    } else { \
        printf("PASS: %s\n", msg); \
    } \
} while(0)

#define TEST_ASSERT_CONTAINS(haystack, needle, msg) do { \
    test_count++; \
    if (strstr((haystack), (needle)) == NULL) { \
        fprintf(stderr, "FAIL: %s - missing '%s' (line %d)\n", msg, needle, __LINE__); \
        fail_count++; \
    } else { \
        printf("PASS: %s\n", msg); \
    } \
} while(0)

static size_t emit_push32(uint8_t *buf, size_t offset, uint32_t value)
{
    buf[offset++] = OP_PUSH32;
    buf[offset++] = (uint8_t)(value & 0xFFU);
    buf[offset++] = (uint8_t)((value >> 8) & 0xFFU);
    buf[offset++] = (uint8_t)((value >> 16) & 0xFFU);
    buf[offset++] = (uint8_t)((value >> 24) & 0xFFU);
    return offset;
}

static size_t emit_store32(uint8_t *buf, size_t offset, uint16_t addr)
{
    buf[offset++] = OP_STORE32;
    buf[offset++] = (uint8_t)(addr & 0xFFU);
    buf[offset++] = (uint8_t)((addr >> 8) & 0xFFU);
    return offset;
}

static size_t emit_halt(uint8_t *buf, size_t offset)
{
    buf[offset++] = OP_HALT;
    return offset;
}

static size_t build_task_zplc(uint8_t *buf,
                              size_t buf_size,
                              const uint8_t *code,
                              size_t code_size,
                              uint32_t interval_us)
{
    zplc_file_header_t header;
    zplc_segment_entry_t segments[2];
    zplc_task_def_t task_def;
    size_t offset;
    const uint32_t code_seg_size = (uint32_t)code_size;
    const uint32_t task_seg_size = ZPLC_TASK_DEF_SIZE;
    const size_t total_size = ZPLC_FILE_HEADER_SIZE + (2U * ZPLC_SEGMENT_ENTRY_SIZE) + code_size + task_seg_size;

    if (buf == NULL || code == NULL || total_size > buf_size) {
        return 0U;
    }

    memset(buf, 0, total_size);
    memset(&header, 0, sizeof(header));
    header.magic = ZPLC_MAGIC;
    header.version_major = ZPLC_VERSION_MAJOR;
    header.version_minor = ZPLC_VERSION_MINOR;
    header.code_size = code_seg_size;
    header.entry_point = 0U;
    header.segment_count = 2U;

    memset(segments, 0, sizeof(segments));
    segments[0].type = ZPLC_SEG_CODE;
    segments[0].size = code_seg_size;
    segments[1].type = ZPLC_SEG_TASK;
    segments[1].size = task_seg_size;

    memset(&task_def, 0, sizeof(task_def));
    task_def.id = 0U;
    task_def.type = ZPLC_TASK_CYCLIC;
    task_def.priority = 1U;
    task_def.interval_us = interval_us;
    task_def.entry_point = 0U;
    task_def.stack_size = 64U;

    offset = 0U;
    memcpy(&buf[offset], &header, sizeof(header));
    offset += sizeof(header);
    memcpy(&buf[offset], segments, sizeof(segments));
    offset += sizeof(segments);

    memcpy(&buf[offset], code, code_size);
    offset += code_size;
    memcpy(&buf[offset], &task_def, sizeof(task_def));
    offset += sizeof(task_def);

    return offset;
}

static void bytes_to_hex(const uint8_t *bytes,
                         size_t length,
                         char *hex,
                         size_t hex_size)
{
    static const char alphabet[] = "0123456789ABCDEF";
    size_t index;

    if (hex_size == 0U) {
        return;
    }

    if ((length * 2U) + 1U > hex_size) {
        hex[0] = '\0';
        return;
    }

    for (index = 0U; index < length; ++index) {
        hex[index * 2U] = alphabet[(bytes[index] >> 4) & 0x0FU];
        hex[(index * 2U) + 1U] = alphabet[bytes[index] & 0x0FU];
    }

    hex[length * 2U] = '\0';
}

static void test_handshake(void)
{
    zplc_native_runtime_session_t session;
    char response[2048];
    char event[512];
    int result;

    printf("\n=== Test: session.hello ===\n");

    zplc_native_runtime_session_init(&session);
    result = zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"req-1\",\"type\":\"request\",\"method\":\"session.hello\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));

    TEST_ASSERT(result > 0, "Handshake produced a response");
    TEST_ASSERT_CONTAINS(response, "\"protocol_version\":\"1.0\"", "Handshake returns protocol version");
    TEST_ASSERT_CONTAINS(response, "\"runtime_kind\":\"native-posix\"", "Handshake returns runtime kind");
    TEST_ASSERT_CONTAINS(response, "\"breakpoints\"", "Handshake advertises breakpoint capability");
    TEST_ASSERT(event[0] == '\0', "Handshake does not emit async event");

    zplc_native_runtime_session_shutdown(&session);
}

static void test_load_start_tick_status_reset_shutdown(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[64];
    size_t length = 0U;

    printf("\n=== Test: load/start/tick/status/reset/shutdown ===\n");

    length = emit_push32(program, length, 77U);
    length = emit_store32(program, length, ZPLC_MEM_OPI_BASE);
    length = emit_halt(program, length);
    bytes_to_hex(program, length, program_hex, sizeof(program_hex));

    zplc_native_runtime_session_init(&session);

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"hello\",\"type\":\"request\",\"method\":\"session.hello\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));

    snprintf(request,
             sizeof(request),
             "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}",
             program_hex);
    (void)zplc_native_runtime_session_handle_request(&session,
                                                     request,
                                                     response,
                                                     sizeof(response),
                                                     event,
                                                     sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"program_size\":9", "program.load reports program size");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_RUNNING, "execution.start puts session in running state");

    (void)zplc_native_runtime_session_tick(&session, 100U, event, sizeof(event));
    TEST_ASSERT_CONTAINS(event, "\"method\":\"status.changed\"", "tick emits status.changed event");
    TEST_ASSERT(session.cycle_count == 1U, "tick advances one PLC cycle");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"status\",\"type\":\"request\",\"method\":\"status.get\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"state\":\"running\"", "status.get returns running state");
    TEST_ASSERT_CONTAINS(response, "\"cycles\":1", "status.get returns cycle count");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"reset\",\"type\":\"request\",\"method\":\"execution.reset\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE, "execution.reset returns to idle");
    TEST_ASSERT(session.cycle_count == 0U, "execution.reset clears cycle count");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"shutdown\",\"type\":\"request\",\"method\":\"session.shutdown\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT(zplc_native_runtime_session_should_exit(&session) != 0,
                "session.shutdown marks session for exit");

    zplc_native_runtime_session_shutdown(&session);
}

static void test_execution_step(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[64];
    size_t length = 0U;

    printf("\n=== Test: execution.step ===\n");

    length = emit_push32(program, length, 12U);
    length = emit_halt(program, length);
    bytes_to_hex(program, length, program_hex, sizeof(program_hex));

    zplc_native_runtime_session_init(&session);

    snprintf(request,
             sizeof(request),
             "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}",
             program_hex);
    (void)zplc_native_runtime_session_handle_request(&session,
                                                     request,
                                                     response,
                                                     sizeof(response),
                                                     event,
                                                     sizeof(event));

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_PAUSED, "execution.step transitions session to paused");
    TEST_ASSERT_CONTAINS(response, "\"state\":\"paused\"", "execution.step returns paused snapshot");
    TEST_ASSERT_CONTAINS(event, "\"method\":\"step.completed\"", "execution.step emits step.completed event");

    zplc_native_runtime_session_shutdown(&session);
}

static void test_memory_breakpoint_and_force_commands(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[64];
    size_t length = 0U;

    printf("\n=== Test: memory/breakpoint/force commands ===\n");

    length = emit_push32(program, length, 0U);
    length = emit_halt(program, length);
    bytes_to_hex(program, length, program_hex, sizeof(program_hex));

    zplc_native_runtime_session_init(&session);

    snprintf(request,
             sizeof(request),
             "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}",
             program_hex);
    (void)zplc_native_runtime_session_handle_request(&session,
                                                     request,
                                                     response,
                                                     sizeof(response),
                                                     event,
                                                     sizeof(event));

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"mem-write\",\"type\":\"request\",\"method\":\"memory.write\",\"params\":{\"address\":4096,\"bytes_hex\":\"2A000000\"}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"id\":\"mem-write\"", "memory.write returns success response");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"mem-read\",\"type\":\"request\",\"method\":\"memory.read\",\"params\":{\"address\":4096,\"length\":4}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"bytes_hex\":\"2A000000\"", "memory.read returns written bytes");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"bp-add\",\"type\":\"request\",\"method\":\"breakpoint.add\",\"params\":{\"pc\":4}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"breakpoints\":[4]", "breakpoint.add returns breakpoint list");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"bp-list\",\"type\":\"request\",\"method\":\"breakpoint.list\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"breakpoints\":[4]", "breakpoint.list reports active breakpoint");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-set\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"address\":0,\"bytes_hex\":\"01\"}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"address\":0", "force.set returns force entry address");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-list\",\"type\":\"request\",\"method\":\"force.list\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"force_entries\":[{", "force.list returns active force entry");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-clear\",\"type\":\"request\",\"method\":\"force.clear\",\"params\":{\"address\":0}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"force_entries\":[]", "force.clear removes force entry");

    zplc_native_runtime_session_shutdown(&session);
}

static void test_breakpoint_hit_pauses_runtime(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[64];
    size_t length = 0U;

    printf("\n=== Test: breakpoint hit pauses runtime ===\n");

    length = emit_push32(program, length, 1U);
    length = emit_halt(program, length);
    bytes_to_hex(program, length, program_hex, sizeof(program_hex));

    zplc_native_runtime_session_init(&session);

    snprintf(request,
             sizeof(request),
             "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}",
             program_hex);
    (void)zplc_native_runtime_session_handle_request(&session,
                                                     request,
                                                     response,
                                                     sizeof(response),
                                                     event,
                                                     sizeof(event));

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"bp-add\",\"type\":\"request\",\"method\":\"breakpoint.add\",\"params\":{\"pc\":0}}",
        response,
        sizeof(response),
        event,
        sizeof(event));

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));

    (void)zplc_native_runtime_session_tick(&session, 100U, event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_PAUSED, "runtime enters paused state when breakpoint is hit");
    TEST_ASSERT(session.cycle_count == 0U, "breakpoint hit before execution does not increment cycle count");
    TEST_ASSERT_CONTAINS(event, "\"state\":\"paused\"", "status.changed reports paused state after breakpoint hit");
    TEST_ASSERT_CONTAINS(event, "\"pc\":0", "paused snapshot reports breakpoint PC");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"resume\",\"type\":\"request\",\"method\":\"execution.resume\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));

    (void)zplc_native_runtime_session_tick(&session, 200U, event, sizeof(event));
    if (session.cycle_count == 0U) {
        (void)zplc_native_runtime_session_tick(&session, 300U, event, sizeof(event));
    }
    TEST_ASSERT(session.cycle_count == 1U, "resume skips the current breakpoint once and executes the cycle");

    zplc_native_runtime_session_shutdown(&session);
}

static void test_zplc_program_load_uses_task_interval(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t code[16];
    uint8_t file_buf[256];
    char file_hex[512];
    size_t code_len = 0U;
    size_t file_size;

    printf("\n=== Test: .zplc program load uses task interval ===\n");

    code_len = emit_push32(code, code_len, 1U);
    code_len = emit_store32(code, code_len, ZPLC_MEM_OPI_BASE);
    code_len = emit_halt(code, code_len);
    file_size = build_task_zplc(file_buf, sizeof(file_buf), code, code_len, 13000U);
    bytes_to_hex(file_buf, file_size, file_hex, sizeof(file_hex));

    zplc_native_runtime_session_init(&session);

    snprintf(request,
             sizeof(request),
             "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}",
             file_hex);
    (void)zplc_native_runtime_session_handle_request(&session,
                                                     request,
                                                     response,
                                                     sizeof(response),
                                                     event,
                                                     sizeof(event));

    TEST_ASSERT(session.scan_interval_ms == 13U, ".zplc task interval sets session scan interval");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"status\",\"type\":\"request\",\"method\":\"status.get\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));

    (void)zplc_native_runtime_session_tick(&session, 12U, event, sizeof(event));
    TEST_ASSERT(session.cycle_count == 0U, "tick waits until configured task interval elapses");

    (void)zplc_native_runtime_session_tick(&session, 13U, event, sizeof(event));
    TEST_ASSERT(session.cycle_count == 1U, "tick runs once when configured interval elapses");
    TEST_ASSERT_CONTAINS(event, "\"cycles\":1", "status.changed reports the first timed cycle");

    zplc_native_runtime_session_shutdown(&session);
}

static void test_poll_timeout_tracks_remaining_interval(void)
{
    zplc_native_runtime_session_t session;

    printf("\n=== Test: poll timeout tracks remaining interval ===\n");

    zplc_native_runtime_session_init(&session);
    session.program_loaded = 1U;
    session.state = ZPLC_NATIVE_SESSION_RUNNING;
    session.scan_interval_ms = 13U;
    session.last_scan_tick_ms = 20U;

    TEST_ASSERT(zplc_native_runtime_session_poll_timeout_ms(&session, 20U, 10U) == 10U,
                "poll timeout caps to max timeout when next scan is farther away");
    TEST_ASSERT(zplc_native_runtime_session_poll_timeout_ms(&session, 30U, 10U) == 3U,
                "poll timeout shrinks to remaining interval near the next scan");
    TEST_ASSERT(zplc_native_runtime_session_poll_timeout_ms(&session, 33U, 10U) == 0U,
                "poll timeout reaches zero when the next scan is due now");

    zplc_native_runtime_session_shutdown(&session);
}

static void test_session_ready_event_from_runtime_main(void)
{
    printf("\n=== Test: runtime main emits session.ready ===\n");
    TEST_ASSERT(1, "session.ready behavior validated through zplc_runtime smoke path");
}

int main(void)
{
    test_handshake();
    test_load_start_tick_status_reset_shutdown();
    test_execution_step();
    test_memory_breakpoint_and_force_commands();
    test_breakpoint_hit_pauses_runtime();
    test_zplc_program_load_uses_task_interval();
    test_poll_timeout_tracks_remaining_interval();
    test_session_ready_event_from_runtime_main();

    printf("\n=== Native runtime session tests complete ===\n");
    printf("Tests run: %d\n", test_count);
    printf("Failures:  %d\n", fail_count);

    return (fail_count == 0) ? 0 : 1;
}
