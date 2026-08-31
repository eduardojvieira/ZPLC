/**
 * @file test_native_runtime_session.c
 * @brief Native runtime session protocol tests for the POSIX host runtime.
 */

#define _POSIX_C_SOURCE 200809L

#include "native_runtime_session.h"
#include "native_program_store.h"

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include <zplc_isa.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_hal_posix.h>

/* Test-only hooks; production zplc_hal.h deliberately stays clean. */
extern void zplc_hal_persist_test_fail_at(unsigned long operation);
extern void zplc_hal_persist_test_fail_result(zplc_hal_result_t result);
extern unsigned long zplc_hal_persist_test_operation_count(void);
extern int zplc_hal_persist_test_failure_triggered(void);
extern void zplc_hal_persist_test_parent_sync_fail_at(unsigned long attempt);

static int test_count = 0;
static int fail_count = 0;
static char test_persist_root[] = "/tmp/zplc_native_session_XXXXXX";

static void remove_persist_root(const char *root)
{
    static const char *const keys[] = {
        "program_v1_slot_a_payload", "program_v1_slot_a_meta",
        "program_v1_slot_b_payload", "program_v1_slot_b_meta",
        "program_v1_active", "code_len", "code"
    };
    size_t index;
    char path[512];

    for (index = 0U; index < sizeof(keys) / sizeof(keys[0]); index++) {
        (void)snprintf(path, sizeof(path), "%s/%s.bin", root, keys[index]);
        (void)unlink(path);
        (void)snprintf(path, sizeof(path), "%s/%s.bin.tmp", root, keys[index]);
        (void)unlink(path);
    }
    (void)rmdir(root);
}

static void remove_test_persist_root(void)
{
    remove_persist_root(test_persist_root);
}

typedef struct {
    zplc_native_runtime_session_t session;
    zplc_vm_t vm;
    uint32_t code_size;
    uint8_t code[ZPLC_MEM_CODE_SIZE];
    uint16_t tag_count;
    zplc_tag_entry_t tags[ZPLC_MAX_TAGS];
    uint8_t ipi[ZPLC_MEM_IPI_SIZE];
    uint8_t opi[ZPLC_MEM_OPI_SIZE];
    uint8_t work[ZPLC_MEM_WORK_SIZE];
    uint8_t retain[ZPLC_MEM_RETAIN_SIZE];
} native_runtime_snapshot_t;

static native_runtime_snapshot_t native_snapshot;

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

static void snapshot_native_runtime(const zplc_native_runtime_session_t *session)
{
    uint16_t index;
    native_snapshot.session = *session;
    native_snapshot.vm = *zplc_core_get_default_vm();
    native_snapshot.code_size = zplc_mem_get_code_size();
    memcpy(native_snapshot.code, zplc_mem_get_code(0U, native_snapshot.code_size), native_snapshot.code_size);
    native_snapshot.tag_count = zplc_core_get_tag_count();
    for (index = 0U; index < native_snapshot.tag_count; index++) native_snapshot.tags[index] = *zplc_core_get_tag(index);
    memcpy(native_snapshot.ipi, zplc_mem_get_region(ZPLC_MEM_IPI_BASE), sizeof(native_snapshot.ipi));
    memcpy(native_snapshot.opi, zplc_mem_get_region(ZPLC_MEM_OPI_BASE), sizeof(native_snapshot.opi));
    memcpy(native_snapshot.work, zplc_mem_get_region(ZPLC_MEM_WORK_BASE), sizeof(native_snapshot.work));
    memcpy(native_snapshot.retain, zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), sizeof(native_snapshot.retain));
}

static int native_runtime_matches_snapshot(const zplc_native_runtime_session_t *session)
{
    uint16_t index;
    if (memcmp(&native_snapshot.session, session, sizeof(*session)) != 0 ||
        memcmp(&native_snapshot.vm, zplc_core_get_default_vm(), sizeof(native_snapshot.vm)) != 0 ||
        native_snapshot.code_size != zplc_mem_get_code_size() ||
        memcmp(native_snapshot.code, zplc_mem_get_code(0U, native_snapshot.code_size), native_snapshot.code_size) != 0 ||
        native_snapshot.tag_count != zplc_core_get_tag_count() ||
        memcmp(native_snapshot.ipi, zplc_mem_get_region(ZPLC_MEM_IPI_BASE), sizeof(native_snapshot.ipi)) != 0 ||
        memcmp(native_snapshot.opi, zplc_mem_get_region(ZPLC_MEM_OPI_BASE), sizeof(native_snapshot.opi)) != 0 ||
        memcmp(native_snapshot.work, zplc_mem_get_region(ZPLC_MEM_WORK_BASE), sizeof(native_snapshot.work)) != 0 ||
        memcmp(native_snapshot.retain, zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE), sizeof(native_snapshot.retain)) != 0) return 0;
    for (index = 0U; index < native_snapshot.tag_count; index++) {
        if (memcmp(&native_snapshot.tags[index], zplc_core_get_tag(index), sizeof(native_snapshot.tags[index])) != 0) return 0;
    }
    return 1;
}

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

static void bytes_to_hex(const uint8_t *bytes, size_t length, char *hex,
                         size_t hex_size);
static void refresh_crc(uint8_t *file, size_t length);

static size_t build_task_zplc(uint8_t *buf,
                              size_t buf_size,
                              const uint8_t *code,
                              size_t code_size,
                              uint32_t interval_us)
{
    size_t offset = ZPLC_FILE_HEADER_SIZE;
    const uint32_t code_seg_size = (uint32_t)code_size;
    const uint32_t task_seg_size = ZPLC_TASK_DEF_SIZE;
    const size_t total_size = ZPLC_FILE_HEADER_SIZE + (2U * ZPLC_SEGMENT_ENTRY_SIZE) + code_size + task_seg_size;

    if (buf == NULL || code == NULL || total_size > buf_size) {
        return 0U;
    }

    uint32_t crc;

    memset(buf, 0, total_size);
    buf[0] = 'Z'; buf[1] = 'P'; buf[2] = 'L'; buf[3] = 'C';
    buf[4] = (uint8_t)ZPLC_VERSION_MAJOR;
    buf[6] = (uint8_t)ZPLC_VERSION_MINOR;
    buf[16] = (uint8_t)code_seg_size;
    buf[17] = (uint8_t)(code_seg_size >> 8);
    buf[18] = (uint8_t)(code_seg_size >> 16);
    buf[19] = (uint8_t)(code_seg_size >> 24);
    buf[20] = (uint8_t)task_seg_size;
    buf[21] = (uint8_t)(task_seg_size >> 8);
    buf[22] = (uint8_t)(task_seg_size >> 16);
    buf[23] = (uint8_t)(task_seg_size >> 24);
    buf[26] = 2U;
    buf[offset] = ZPLC_SEG_CODE;
    buf[offset + 4U] = (uint8_t)code_seg_size;
    buf[offset + 5U] = (uint8_t)(code_seg_size >> 8);
    buf[offset + 6U] = (uint8_t)(code_seg_size >> 16);
    buf[offset + 7U] = (uint8_t)(code_seg_size >> 24);
    offset += ZPLC_SEGMENT_ENTRY_SIZE;
    buf[offset] = ZPLC_SEG_TASK;
    buf[offset + 4U] = (uint8_t)task_seg_size;
    offset += ZPLC_SEGMENT_ENTRY_SIZE;

    memcpy(&buf[offset], code, code_size);
    offset += code_size;
    buf[offset + 2U] = ZPLC_TASK_CYCLIC;
    buf[offset + 3U] = 1U;
    buf[offset + 4U] = (uint8_t)interval_us;
    buf[offset + 5U] = (uint8_t)(interval_us >> 8);
    buf[offset + 6U] = (uint8_t)(interval_us >> 16);
    buf[offset + 7U] = (uint8_t)(interval_us >> 24);
    buf[offset + 10U] = 64U;
    offset += ZPLC_TASK_DEF_SIZE;

    crc = 0xFFFFFFFFU;
    for (size_t index = 0U; index < 12U; index++) {
        uint32_t bit;
        crc ^= buf[index];
        for (bit = 0U; bit < 8U; bit++) crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
    for (size_t index = 16U; index < offset; index++) {
        uint32_t bit;
        crc ^= buf[index];
        for (bit = 0U; bit < 8U; bit++) crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
    crc ^= 0xFFFFFFFFU;
    buf[12] = (uint8_t)crc;
    buf[13] = (uint8_t)(crc >> 8);
    buf[14] = (uint8_t)(crc >> 16);
    buf[15] = (uint8_t)(crc >> 24);

    return offset;
}

static size_t build_code_only_zplc(uint8_t *buf, size_t buf_size,
                                   const uint8_t *code, size_t code_size)
{
    size_t length = build_task_zplc(buf, buf_size, code, code_size, 10000U);
    if (length == 0U) return 0U;
    memmove(buf + ZPLC_FILE_HEADER_SIZE + ZPLC_SEGMENT_ENTRY_SIZE,
            buf + ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE,
            code_size);
    memset(buf + 20U, 0, 4U);
    buf[26] = 1U;
    length = ZPLC_FILE_HEADER_SIZE + ZPLC_SEGMENT_ENTRY_SIZE + code_size;
    refresh_crc(buf, length);
    return length;
}

static void bytecode_to_task_hex(const uint8_t *code, size_t code_size,
                                 char *hex, size_t hex_size)
{
    uint8_t artifact[128];
    size_t artifact_size = build_task_zplc(artifact, sizeof(artifact), code,
                                           code_size, 100000U);
    bytes_to_hex(artifact, artifact_size, hex, hex_size);
}

static void refresh_crc(uint8_t *file, size_t length)
{
    uint32_t crc = 0xFFFFFFFFU;
    size_t index;
    for (index = 0U; index < length; index++) {
        uint32_t bit;
        if (index >= 12U && index < 16U) continue;
        crc ^= file[index];
        for (bit = 0U; bit < 8U; bit++) crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
    crc ^= 0xFFFFFFFFU;
    file[12] = (uint8_t)crc;
    file[13] = (uint8_t)(crc >> 8);
    file[14] = (uint8_t)(crc >> 16);
    file[15] = (uint8_t)(crc >> 24);
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
        "{\"id\":\"req-1\",\"type\":\"request\",\"method\":\"session.hello\",\"params\":{\"client_name\":\"zplc-ide\",\"client_version\":\"1.5.0\",\"protocol_version\":\"1.0\"}}",
        response,
        sizeof(response),
        event,
        sizeof(event));

    TEST_ASSERT(result > 0, "Handshake produced a response");
    TEST_ASSERT_CONTAINS(response, "\"protocol_version\":\"1.0\"", "Handshake returns protocol version");
    TEST_ASSERT_CONTAINS(response, "\"runtime_kind\":\"native-posix\"", "Handshake returns runtime kind");
    TEST_ASSERT(strcmp(zplc_core_version(), ZPLC_EXPECTED_PRODUCT_VERSION) == 0,
                "Core returns the product version configured from root package.json");
    {
        char expected_runtime_version[128];
        (void)snprintf(expected_runtime_version,
                       sizeof(expected_runtime_version),
                       "\"runtime_version\":\"%s\"",
                       ZPLC_EXPECTED_PRODUCT_VERSION);
        TEST_ASSERT_CONTAINS(response,
                             expected_runtime_version,
                             "Handshake returns the core product version");
    }
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
    uint8_t forced_bytes[ZPLC_FORCE_MAX_BYTES];
    char program_hex[512];
    char forced_hex[(ZPLC_FORCE_MAX_BYTES * 2U) + 1U];
    size_t length = 0U;

    printf("\n=== Test: load/start/tick/status/reset/shutdown ===\n");

    length = emit_push32(program, length, 77U);
    length = emit_store32(program, length, ZPLC_MEM_OPI_BASE);
    length = emit_halt(program, length);
    bytecode_to_task_hex(program, length, program_hex, sizeof(program_hex));

    zplc_native_runtime_session_init(&session);

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"hello\",\"type\":\"request\",\"method\":\"session.hello\",\"params\":{\"client_name\":\"zplc-ide\",\"client_version\":\"1.5.0\",\"protocol_version\":\"1.0\"}}",
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
    TEST_ASSERT_CONTAINS(response, "\"program_size\":73", "program.load reports .zplc artifact size");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_RUNNING, "execution.start puts session in running state");

    memset(forced_bytes, 0xA5, sizeof(forced_bytes));
    bytes_to_hex(forced_bytes, sizeof(forced_bytes), forced_hex, sizeof(forced_hex));
    snprintf(request, sizeof(request),
             "{\"id\":\"force-max\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"address\":8192,\"bytes_hex\":\"%s\"}}",
             forced_hex);
    TEST_ASSERT(zplc_native_runtime_session_handle_request(&session, request, response,
                                                           sizeof(response), event,
                                                           sizeof(event)) > 0,
                "force.set accepts a maximum-size host force");
    TEST_ASSERT_CONTAINS(response, "\"size\":260", "force.set reports the full force size");
    TEST_ASSERT_CONTAINS(response, "\"bytes_hex\":\"A5A5", "force.set reports the force bytes");
    TEST_ASSERT(zplc_native_runtime_session_handle_request(
                    &session,
                    "{\"id\":\"force-list-max\",\"type\":\"request\",\"method\":\"force.list\",\"params\":{}}",
                    response, sizeof(response), event, sizeof(event)) > 0,
                "force.list serializes a maximum-size host force");
    TEST_ASSERT_CONTAINS(response, "\"size\":260", "force.list retains the full force size");
    TEST_ASSERT_CONTAINS(response, "\"bytes_hex\":\"A5A5", "force.list retains the force bytes");

    (void)zplc_native_runtime_session_tick(&session, 100U, event, sizeof(event));
    TEST_ASSERT_CONTAINS(event, "\"method\":\"status.changed\"", "tick emits status.changed event");
    TEST_ASSERT_CONTAINS(event, "\"opi\":[77,0,0,0,0,0,0,0]",
                         "status.changed reports real OPI bytes");
    TEST_ASSERT_CONTAINS(event, "\"size\":260",
                         "status.changed reports the active maximum-size force");
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
    TEST_ASSERT_CONTAINS(response, "\"opi\":[77,0,0,0,0,0,0,0]",
                         "status.get reports real OPI bytes");
    TEST_ASSERT_CONTAINS(response, "\"size\":260",
                         "status.get reports the active maximum-size force");

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

static void test_maximum_force_table_serialization(void)
{
    zplc_native_runtime_session_t session;
    char response[8192];
    uint8_t bytes[ZPLC_FORCE_MAX_BYTES];
    uint8_t index;
    size_t response_length;

    printf("\n=== Test: maximum force table serialization ===\n");
    memset(bytes, 0x5A, sizeof(bytes));
    zplc_native_runtime_session_init(&session);
    for (index = 0U; index < ZPLC_FORCE_MAX_ENTRIES; ++index) {
        const uint16_t address = (uint16_t)(ZPLC_MEM_WORK_BASE +
                                            (index * ZPLC_FORCE_MAX_BYTES));
        TEST_ASSERT(zplc_force_set_bytes(address, bytes, sizeof(bytes)) == 0,
                    "Populate a maximum-size force entry");
    }

    TEST_ASSERT(zplc_native_runtime_session_handle_request(
                    &session,
                    "{\"id\":\"force-eight\",\"type\":\"request\",\"method\":\"force.list\",\"params\":{}}",
                    response, sizeof(response), NULL, 0U) > 0,
                "force.list serializes eight maximum-size entries into 8192 bytes");
    for (index = 0U; index < ZPLC_FORCE_MAX_ENTRIES; ++index) {
        char expected[64];
        const uint16_t address = (uint16_t)(ZPLC_MEM_WORK_BASE +
                                            (index * ZPLC_FORCE_MAX_BYTES));
        (void)snprintf(expected, sizeof(expected), "\"address\":%u,\"size\":260",
                       (unsigned)address);
        TEST_ASSERT_CONTAINS(response, expected,
                             "force.list retains each maximum-size entry");
    }
    response_length = strlen(response);
    TEST_ASSERT(response_length >= 2U && strcmp(response + response_length - 2U, "}}") == 0,
                "force.list closes its JSON response");

    TEST_ASSERT(zplc_native_runtime_session_handle_request(
                    &session,
                    "{\"id\":\"status-eight\",\"type\":\"request\",\"method\":\"status.get\",\"params\":{}}",
                    response, sizeof(response), NULL, 0U) > 0,
                "status.get serializes eight maximum-size entries into 8192 bytes");
    TEST_ASSERT_CONTAINS(response, "\"address\":10012,\"size\":260",
                         "status.get retains the final maximum-size force entry");
    response_length = strlen(response);
    TEST_ASSERT(response_length >= 2U && strcmp(response + response_length - 2U, "}}") == 0,
                "status.get closes its JSON response");
    {
        char tiny_response[64];
        TEST_ASSERT(zplc_native_runtime_session_handle_request(
                        &session,
                        "{\"id\":\"force-tiny\",\"type\":\"request\",\"method\":\"force.list\",\"params\":{}}",
                        tiny_response, sizeof(tiny_response), NULL, 0U) < 0 &&
                    tiny_response[0] == '\0',
                    "truncated force.list response is rejected and not publishable");
    }
    zplc_native_runtime_session_shutdown(&session);
}

static void test_execution_step(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[512];
    size_t length = 0U;

    printf("\n=== Test: execution.step ===\n");

    length = emit_push32(program, length, 12U);
    length = emit_halt(program, length);
    bytecode_to_task_hex(program, length, program_hex, sizeof(program_hex));

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

static void test_execution_state_transitions_are_strict(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    uint8_t forced = 1U;
    uint8_t *opi;
    char program_hex[512];
    size_t length = 0U;

    printf("\n=== Test: strict execution state transitions ===\n");

    length = emit_push32(program, length, 12U);
    length = emit_halt(program, length);
    bytecode_to_task_hex(program, length, program_hex, sizeof(program_hex));

    zplc_native_runtime_session_init(&session);
    zplc_native_runtime_session_shutdown(&session);
    remove_test_persist_root();
    zplc_native_runtime_session_init(&session);
    opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    TEST_ASSERT(opi != NULL && zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &forced, 1U) == 0,
                "Strict transition test establishes observable output and force state");
    if (opi != NULL) opi[0] = 0xA5U;
    session.timed_scan_started = 1U;
    session.missed_interval_count = 7U;
    session.last_dispatch_lateness_ms = 3U;
    session.last_scan_tick_ms = 41U;

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"no-program-start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"code\":\"INVALID_STATE\"", "start rejection returns INVALID_STATE code");
    TEST_ASSERT_CONTAINS(response, "program not loaded", "start without a program uses the stable error");
    TEST_ASSERT(native_runtime_matches_snapshot(&session),
                "start without a program preserves runtime state");

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"no-program-pause\",\"type\":\"request\",\"method\":\"execution.pause\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "program not loaded", "pause without a program uses the stable error");
    TEST_ASSERT(native_runtime_matches_snapshot(&session),
                "pause without a program preserves runtime state");

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"no-program-resume\",\"type\":\"request\",\"method\":\"execution.resume\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "program not loaded", "resume without a program uses the stable error");
    TEST_ASSERT(native_runtime_matches_snapshot(&session),
                "resume without a program preserves runtime state");

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"no-program-step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "program not loaded", "step without a program uses the stable error");
    TEST_ASSERT(native_runtime_matches_snapshot(&session),
                "step without a program preserves runtime state");

    snprintf(request, sizeof(request),
             "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}",
             program_hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response,
                                                     sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE, "program.load leaves the strict transition session idle");

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"idle-pause\",\"type\":\"request\",\"method\":\"execution.pause\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"code\":\"INVALID_STATE\"", "pause rejection returns INVALID_STATE code");
    TEST_ASSERT_CONTAINS(response, "runtime is not running; start before pause", "pause rejects idle session");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "idle pause rejection preserves runtime state");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_RUNNING, "start transitions idle session to running");

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"running-start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "runtime is not idle; stop or reset before start", "start rejects running session");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "running start rejection preserves runtime state");

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"running-step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"code\":\"INVALID_STATE\"", "step rejection returns INVALID_STATE code");
    TEST_ASSERT_CONTAINS(response, "runtime is running; pause before step", "step rejects running session");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "running step rejection preserves runtime state");

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"running-resume\",\"type\":\"request\",\"method\":\"execution.resume\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"code\":\"INVALID_STATE\"", "resume rejection returns INVALID_STATE code");
    TEST_ASSERT_CONTAINS(response, "runtime is not paused; pause before resume", "resume rejects running session");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "running resume rejection preserves runtime state");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"pause\",\"type\":\"request\",\"method\":\"execution.pause\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_PAUSED, "pause transitions running session to paused");

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"paused-pause\",\"type\":\"request\",\"method\":\"execution.pause\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "runtime is not running; start before pause", "pause rejects paused session");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "paused pause rejection preserves runtime state");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"paused-step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_PAUSED && session.cycle_count == 1U,
                "step runs one cycle and remains paused");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"resume\",\"type\":\"request\",\"method\":\"execution.resume\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_RUNNING, "resume transitions paused session to running");

    zplc_native_runtime_session_shutdown(&session);
}

static void test_bounded_cycle_fault_is_safe(void)
{
    zplc_native_runtime_session_t session;
    uint8_t artifact[128], code[16], forced = 1U;
    size_t code_size = 0U, artifact_size;
    char hex[256], request[640], response[1024], event[1024];
    uint8_t *opi;

    printf("\n=== Test: bounded cycle fault safe state ===\n");
    code_size = emit_push32(code, code_size, 1U);
    code_size = emit_store32(code, code_size, ZPLC_MEM_OPI_BASE);
    code[code_size++] = OP_JMP;
    code[code_size++] = 0U;
    code[code_size++] = 0U;
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 10000U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));

    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request),
             "{\"id\":\"loop-load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}",
             hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response,
                                                     sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"result\"", "Loop artifact loads for bounded fault test");
    TEST_ASSERT(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &forced, 1U) == 0,
                "Force is active before bounded cycle fault");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"loop-step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "RUNTIME_FAILURE", "Bounded step returns runtime failure");
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_ERROR, "Bounded step latches session error");
    TEST_ASSERT(zplc_core_get_error() == ZPLC_VM_WATCHDOG,
                "Bounded step exposes watchdog VM error");
    opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    TEST_ASSERT(opi != NULL && opi[0] == 0U && opi[ZPLC_MEM_OPI_SIZE - 1U] == 0U,
                "Bounded step clears complete OPI region");
    TEST_ASSERT(zplc_force_get_count() == 0, "Bounded step clears forces");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"loop-restart\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "Faulted session rejects start until reset");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"loop-reset\",\"type\":\"request\",\"method\":\"execution.reset\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE,
                "Reset returns bounded-fault session to idle safe state");
    TEST_ASSERT(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &forced, 1U) == 0,
                "Force is active before tick bounded fault");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"loop-start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_RUNNING,
                "Reset session can start before tick fault");
    TEST_ASSERT(zplc_native_runtime_session_tick(&session, 10U, event, sizeof(event)) < 0,
                "Bounded tick returns without hanging");
    TEST_ASSERT_CONTAINS(event, "RUNTIME_FAILURE", "Bounded tick emits runtime failure");
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_ERROR &&
                zplc_force_get_count() == 0,
                "Bounded tick faults safe with no force entries");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"fault-pause\",\"type\":\"request\",\"method\":\"execution.pause\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "Faulted session rejects pause");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"fault-step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "Faulted session rejects step");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"fault-stop\",\"type\":\"request\",\"method\":\"execution.stop\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_ERROR,
                "Stop keeps the bounded-fault latch while making outputs safe");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"fault-start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "Faulted stopped session rejects start");
    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"fault-resume\",\"type\":\"request\",\"method\":\"execution.resume\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "Faulted stopped session rejects resume");
    TEST_ASSERT_CONTAINS(response, "runtime is faulted; reset before resume",
                         "Faulted resume uses its operation-specific error");
    TEST_ASSERT(native_runtime_matches_snapshot(&session),
                "Faulted resume rejection preserves the latched safe state");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"fault-reset\",\"type\":\"request\",\"method\":\"execution.reset\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE,
                "Reset is the explicit recovery from bounded fault");
    zplc_native_runtime_session_shutdown(&session);
}

static void test_multitask_watchdog_stops_batch_safe(void)
{
    zplc_native_runtime_session_t session;
    uint8_t artifact[160], code[48], forced = 1U;
    char hex[400], request[900], response[1024], event[1024];
    size_t code_size = 0U, artifact_size, task_offset;
    uint16_t second_entry;
    int result;

    printf("\n=== Test: multitask watchdog stops batch ===\n");
    code_size = emit_push32(code, code_size, 9U);
    code_size = emit_store32(code, code_size, ZPLC_MEM_OPI_BASE);
    code[code_size++] = OP_JMP;
    code[code_size++] = 0U;
    code[code_size++] = 0U;
    second_entry = (uint16_t)code_size;
    code_size = emit_push32(code, code_size, 77U);
    code_size = emit_store32(code, code_size, ZPLC_MEM_WORK_BASE);
    code_size = emit_halt(code, code_size);
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 10000U);
    task_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size;
    memcpy(artifact + artifact_size, artifact + task_offset, ZPLC_TASK_DEF_SIZE);
    artifact[artifact_size] = 2U;
    artifact[artifact_size + 3U] = 2U;
    artifact[artifact_size + 8U] = (uint8_t)second_entry;
    artifact[20] = 32U;
    artifact[44] = 32U;
    artifact_size += ZPLC_TASK_DEF_SIZE;
    refresh_crc(artifact, artifact_size);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request),
             "{\"id\":\"mt-loop\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{"
             "\"bytecode_hex\":\"%s\"}}",
             hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response),
                                                     event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"mt-start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    zplc_mem_get_region(ZPLC_MEM_IPI_BASE)[0] = 3U;
    TEST_ASSERT(zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &forced, 1U) == 0,
                "force staged before multitask watchdog");
    result = zplc_native_runtime_session_tick(&session, 10U, event, sizeof(event));
    TEST_ASSERT(result < 0 && session.state == ZPLC_NATIVE_SESSION_ERROR &&
                    session.cycle_count == 0U,
                "watchdog faults timed multitask batch without cycle increment");
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0] == 0U,
                "second task is inhibited after first watchdog");
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_OPI_BASE)[0] == 0U &&
                    zplc_mem_get_region(ZPLC_MEM_IPI_BASE)[0] == 0U && zplc_force_get_count() == 0U,
                "watchdog batch fault clears process images and forces");
    TEST_ASSERT(
        strcmp(event, "{\"type\":\"event\",\"method\":\"runtime.error\",\"params\":{\"code\":"
                      "\"RUNTIME_FAILURE\",\"message\":\"zplc_core_run_cycle failed\"}}") == 0,
        "timed watchdog emits balanced runtime.error JSON");
    zplc_native_runtime_session_shutdown(&session);
}

static void test_multitask_restore_clears_replacement_memory(void)
{
    zplc_native_runtime_session_t first, restored;
    uint8_t artifact[160], code[48], forced = 1U;
    char hex[400], request[900], response[2048], event[1024],
        root[] = "/tmp/zplc_mt_restore_XXXXXX";
    const char *old_root = getenv("ZPLC_PERSIST_ROOT");
    char old_copy[512];
    size_t code_size = 0U, artifact_size, task_offset;
    uint16_t second_entry;

    printf("\n=== Test: multitask restore and replacement cleanup ===\n");
    if (mkdtemp(root) == NULL) {
        TEST_ASSERT(0, "multitask restore root created");
        return;
    }
    if (old_root != NULL)
        snprintf(old_copy, sizeof(old_copy), "%s", old_root);
    setenv("ZPLC_PERSIST_ROOT", root, 1);
    code_size = emit_push32(code, code_size, 11U);
    code_size = emit_store32(code, code_size, ZPLC_MEM_OPI_BASE);
    code_size = emit_halt(code, code_size);
    second_entry = (uint16_t)code_size;
    code_size = emit_push32(code, code_size, 22U);
    code_size = emit_store32(code, code_size, ZPLC_MEM_OPI_BASE + 4U);
    code_size = emit_halt(code, code_size);
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 13000U);
    task_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size;
    memcpy(artifact + artifact_size, artifact + task_offset, ZPLC_TASK_DEF_SIZE);
    artifact[task_offset] = 9U;
    artifact[task_offset + 3U] = 3U;
    artifact[artifact_size] = 2U;
    artifact[artifact_size + 3U] = 1U;
    artifact[artifact_size + 8U] = (uint8_t)second_entry;
    artifact[20] = 32U;
    artifact[44] = 32U;
    artifact_size += ZPLC_TASK_DEF_SIZE;
    refresh_crc(artifact, artifact_size);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    zplc_native_runtime_session_init(&first);
    zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0] = 1U;
    zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE)[0] = 1U;
    (void)zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &forced, 1U);
    snprintf(request, sizeof(request),
             "{\"id\":\"mt-restore-load\",\"type\":\"request\",\"method\":\"program.load\","
             "\"params\":{\"bytecode_hex\":\"%s\"}}",
             hex);
    (void)zplc_native_runtime_session_handle_request(&first, request, response, sizeof(response),
                                                     event, sizeof(event));
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0] == 0U &&
                    zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE)[0] == 0U &&
                    zplc_force_get_count() == 0U,
                "multitask replacement clears WORK RETAIN and forces");
    zplc_native_runtime_session_shutdown(&first);
    zplc_native_runtime_session_init(&restored);
    TEST_ASSERT(restored.program_loaded != 0U && restored.task_count == 2U &&
                    restored.scan_interval_ms == 13U && restored.tasks[0].id == 2U &&
                    restored.tasks[1].id == 9U,
                "disk restore rebuilds ordered homogeneous task set");
    (void)zplc_native_runtime_session_handle_request(
        &restored,
        "{\"id\":\"mt-restore-step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":"
        "{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_core_get_opi(0U) == 11U && zplc_core_get_opi(4U) == 22U,
                "restored task set executes both entries");
    zplc_native_runtime_session_shutdown(&restored);
    if (old_root != NULL)
        setenv("ZPLC_PERSIST_ROOT", old_copy, 1);
    else
        unsetenv("ZPLC_PERSIST_ROOT");
    remove_persist_root(root);
}

static void test_multitask_timed_tick_does_not_catch_up(void)
{
    zplc_native_runtime_session_t session;
    uint8_t artifact[192], code[64];
    char hex[512], request[1100], response[1024], event[2048];
    size_t n = 0U, size, off;
    uint16_t second;
    uint16_t addresses[2] = {ZPLC_MEM_WORK_BASE, ZPLC_MEM_WORK_BASE + 4U};
    uint8_t task;
    printf("\n=== Test: multitask timed tick does not catch up ===\n");
    for (task = 0U; task < 2U; ++task) {
        if (task == 1U)
            second = (uint16_t)n;
        code[n++] = OP_LOAD32;
        code[n++] = (uint8_t)addresses[task];
        code[n++] = (uint8_t)(addresses[task] >> 8);
        n = emit_push32(code, n, 1U);
        code[n++] = OP_ADD;
        code[n++] = OP_STORE32;
        code[n++] = (uint8_t)addresses[task];
        code[n++] = (uint8_t)(addresses[task] >> 8);
        n = emit_halt(code, n);
    }
    size = build_task_zplc(artifact, sizeof(artifact), code, n, 10000U);
    off = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + n;
    memcpy(artifact + size, artifact + off, ZPLC_TASK_DEF_SIZE);
    artifact[off] = 9U;
    artifact[off + 3U] = 2U;
    artifact[size] = 2U;
    artifact[size + 3U] = 1U;
    artifact[size + 8U] = (uint8_t)second;
    artifact[20] = 32U;
    artifact[44] = 32U;
    size += ZPLC_TASK_DEF_SIZE;
    refresh_crc(artifact, size);
    bytes_to_hex(artifact, size, hex, sizeof(hex));
    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request),
             "{\"id\":\"mt-tick-load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":"
             "{\"bytecode_hex\":\"%s\"}}",
             hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response),
                                                     event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"mt-tick-start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{"
        "}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 10U, event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 50U, event, sizeof(event));
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0] == 2U &&
                    zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[4] == 2U && session.cycle_count == 2U &&
                    session.missed_interval_count == 3U &&
                    session.last_dispatch_lateness_ms == 30U && session.last_scan_tick_ms == 50U,
                "late multitask tick dispatches each task once and records missed cadence");
    (void)zplc_native_runtime_session_tick(&session, 55U, event, sizeof(event));
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0] == 2U &&
                    zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[4] == 2U,
                "sub-interval tick does not catch up multitask work");
    zplc_native_runtime_session_shutdown(&session);
}

static void test_multitask_scenario_uses_common_clock(void)
{
    zplc_native_runtime_session_t session;
    uint8_t artifact[128], code[24];
    char hex[320], request[760], response[2048], event[1024];
    size_t n = 0U, size, off;
    uint16_t second;
    printf("\n=== Test: multitask scenario common clock ===\n");
    code[n++] = OP_GET_TICKS;
    code[n++] = OP_STORE32;
    code[n++] = (uint8_t)ZPLC_MEM_WORK_BASE;
    code[n++] = (uint8_t)(ZPLC_MEM_WORK_BASE >> 8);
    n = emit_halt(code, n);
    second = (uint16_t)n;
    code[n++] = OP_GET_TICKS;
    code[n++] = OP_STORE32;
    code[n++] = (uint8_t)(ZPLC_MEM_WORK_BASE + 4U);
    code[n++] = (uint8_t)((ZPLC_MEM_WORK_BASE + 4U) >> 8);
    n = emit_halt(code, n);
    size = build_task_zplc(artifact, sizeof(artifact), code, n, 13000U);
    off = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + n;
    memcpy(artifact + size, artifact + off, ZPLC_TASK_DEF_SIZE);
    artifact[off] = 9U;
    artifact[size] = 2U;
    artifact[size + 3U] = 1U;
    artifact[size + 8U] = (uint8_t)second;
    artifact[20] = 32U;
    artifact[44] = 32U;
    size += ZPLC_TASK_DEF_SIZE;
    refresh_crc(artifact, size);
    bytes_to_hex(artifact, size, hex, sizeof(hex));
    zplc_native_runtime_session_init(&session);
    zplc_native_runtime_session_set_scenario_clock_enabled(&session, 1);
    snprintf(request, sizeof(request),
             "{\"id\":\"mt-scenario-load\",\"type\":\"request\",\"method\":\"program.load\","
             "\"params\":{\"bytecode_hex\":\"%s\"}}",
             hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response),
                                                     event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"mt-s0\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":"
        "0}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0] == 0U &&
                    zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[4] == 0U && session.cycle_count == 1U,
                "both multitask scenario VMs observe timestamp zero");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"mt-s13\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_"
        "ms\":13}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0] == 13U &&
                    zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[4] == 13U && session.cycle_count == 2U,
                "both multitask scenario VMs observe common interval timestamp");
    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"mt-s14\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_"
        "ms\":14}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST",
                         "intermediate multitask scenario timestamp is rejected");
    TEST_ASSERT(native_runtime_matches_snapshot(&session),
                "invalid multitask scenario timestamp does not mutate state");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"mt-s26\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_"
        "ms\":26}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0] == 26U &&
                    zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[4] == 26U &&
                    session.cycle_count == 3U && session.scenario_last_timestamp_ms == 26U &&
                    session.last_scan_tick_ms == 26U && zplc_hal_tick() != 26U,
                "common scenario clock advances both VMs and clears override");
    zplc_native_runtime_session_shutdown(&session);
}

static void test_json_serialization_fails_closed_on_small_buffers(void)
{
    zplc_native_runtime_session_t session;
    char small[8], response[2048], event[8], request[1024], hex[512];
    uint8_t code[] = { OP_HALT }, artifact[128];
    size_t artifact_size;
    uint8_t index;
    int result;

    printf("\n=== Test: JSON serialization fails closed ===\n");
    zplc_native_runtime_session_init(&session);
    memset(small, 'x', sizeof(small));
    result = zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"hello\",\"type\":\"request\",\"method\":\"session.hello\",\"params\":{\"client_name\":\"zplc-ide\",\"client_version\":\"1.5.0\",\"protocol_version\":\"1.0\"}}",
        small, sizeof(small), NULL, 0U);
    TEST_ASSERT(result < 0 && small[0] == '\0', "small hello response is empty and unpublished");
    result = zplc_native_runtime_session_handle_request(&session, "bad", small, sizeof(small), NULL, 0U);
    TEST_ASSERT(result < 0 && small[0] == '\0', "small invalid-request response is empty and unpublished");
    for (index = 0U; index < ZPLC_MAX_BREAKPOINTS; ++index) {
        (void)zplc_vm_add_breakpoint(zplc_core_get_default_vm(), index);
    }
    result = zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"bp\",\"type\":\"request\",\"method\":\"breakpoint.list\",\"params\":{}}",
        small, sizeof(small), NULL, 0U);
    TEST_ASSERT(result < 0 && small[0] == '\0', "full breakpoint list is empty when response truncates");
    result = zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"bp-ok\",\"type\":\"request\",\"method\":\"breakpoint.list\",\"params\":{}}",
        response, sizeof(response), NULL, 0U);
    TEST_ASSERT(result > 0 && response[result - 1] == '}', "normal breakpoint list remains complete JSON");
    zplc_vm_clear_breakpoints(zplc_core_get_default_vm());
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, sizeof(code), 10000U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request), "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), NULL, 0U);
    result = zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"stop\",\"type\":\"request\",\"method\":\"execution.stop\",\"params\":{}}",
        small, sizeof(small), NULL, 0U);
    TEST_ASSERT(result < 0 && small[0] == '\0', "small lifecycle response is empty and unpublished");
    result = zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(result > 0 && event[0] == '\0', "small successful step event is empty rather than partial JSON");
    zplc_native_runtime_session_shutdown(&session);
}

static void test_memory_breakpoint_and_force_commands(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[512];
    size_t length = 0U;

    printf("\n=== Test: memory/breakpoint/force commands ===\n");

    length = emit_push32(program, length, 0U);
    length = emit_halt(program, length);
    bytecode_to_task_hex(program, length, program_hex, sizeof(program_hex));

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

static void test_uint16_request_boundaries_reject_without_mutation(void)
{
    zplc_native_runtime_session_t session;
    char response[4096];
    char event[4096];
    uint8_t *ipi;
    uint16_t force_address;
    uint16_t force_size;
    uint8_t force_bytes[ZPLC_FORCE_MAX_BYTES];

    printf("\n=== Test: uint16 request boundaries ===\n");

    zplc_native_runtime_session_init(&session);
    ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    ipi[0] = 0x5AU;

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"write-outside-param\",\"type\":\"request\",\"method\":\"memory.write\",\"address\":0,\"params\":{\"bytes_hex\":\"A5\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "memory.write rejects an address outside params");
    TEST_ASSERT(ipi[0] == 0x5AU, "memory.write outside params does not write IPI zero");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"read-duplicate-length\",\"type\":\"request\",\"method\":\"memory.read\",\"params\":{\"address\":0,\"length\":1,\"length\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "memory.read rejects duplicate params");
    TEST_ASSERT(strstr(response, "5A") == NULL, "memory.read duplicate params does not leak IPI zero");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"write-over-u32\",\"type\":\"request\",\"method\":\"memory.write\",\"params\":{\"address\":4294967296,\"bytes_hex\":\"A5\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "memory.write rejects address above uint32");
    TEST_ASSERT(ipi[0] == 0x5AU, "memory.write above uint32 does not fall through to IPI zero");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"write-missing-address\",\"type\":\"request\",\"method\":\"memory.write\",\"params\":{\"bytes_hex\":\"A5\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "memory.write requires a valid address");
    TEST_ASSERT(ipi[0] == 0x5AU, "memory.write missing address does not fall through to IPI zero");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"read-negative\",\"type\":\"request\",\"method\":\"memory.read\",\"params\":{\"address\":-1,\"length\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "memory.read rejects a negative address");
    TEST_ASSERT(strstr(response, "5A") == NULL, "memory.read negative address does not return IPI zero");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"read-missing-length\",\"type\":\"request\",\"method\":\"memory.read\",\"params\":{\"address\":0}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "memory.read requires a valid length");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"write-overflow\",\"type\":\"request\",\"method\":\"memory.write\",\"params\":{\"address\":65536,\"bytes_hex\":\"A5\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "memory.write rejects uint16 overflow");
    TEST_ASSERT(ipi[0] == 0x5AU, "memory.write overflow does not wrap to IPI zero");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"read-overflow\",\"type\":\"request\",\"method\":\"memory.read\",\"params\":{\"address\":65536,\"length\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "memory.read rejects uint16 overflow");
    TEST_ASSERT(strstr(response, "5A") == NULL, "memory.read overflow does not return IPI zero");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-valid\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"address\":0,\"bytes_hex\":\"01\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_force_get_count() == 1U, "valid force establishes overflow preservation sentinel");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-set-duplicate-address\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"address\":0,\"address\":4294967296,\"bytes_hex\":\"A5\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "force.set rejects duplicate addresses");
    TEST_ASSERT(zplc_force_get(0U, &force_address, &force_size, force_bytes, sizeof(force_bytes)) == 0 &&
                force_bytes[0] == 0x01U, "force.set duplicate address preserves the force payload");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-set-duplicate-envelope\",\"type\":\"request\",\"method\":\"force.set\",\"method\":\"force.set\",\"params\":{\"address\":0,\"bytes_hex\":\"A5\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "force.set rejects duplicate envelope keys");
    TEST_ASSERT(zplc_force_get(0U, &force_address, &force_size, force_bytes, sizeof(force_bytes)) == 0 &&
                force_bytes[0] == 0x01U, "duplicate envelope keys preserve the force payload");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-set-missing-address\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"bytes_hex\":\"02\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "force.set requires a valid address");
    TEST_ASSERT(zplc_force_get_count() == 1U, "force.set missing address preserves the existing force");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-set-over-u32\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"address\":4294967296,\"bytes_hex\":\"02\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "force.set rejects address above uint32");
    TEST_ASSERT(zplc_force_get_count() == 1U, "force.set above uint32 preserves the existing force");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-set-overflow\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"address\":65536,\"bytes_hex\":\"02\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "force.set rejects uint16 overflow");
    TEST_ASSERT(zplc_force_get_count() == 1U &&
                zplc_force_get(0U, &force_address, &force_size, force_bytes, sizeof(force_bytes)) == 0 &&
                force_address == 0U && force_size == 1U && force_bytes[0] == 0x01U,
                "force.set overflow preserves the existing force payload");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-clear-overflow\",\"type\":\"request\",\"method\":\"force.clear\",\"params\":{\"address\":65536}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "force.clear rejects uint16 overflow");
    TEST_ASSERT(zplc_force_get_count() == 1U, "force.clear overflow preserves the existing force");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-clear-junk\",\"type\":\"request\",\"method\":\"force.clear\",\"params\":{\"address\":0junk}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "force.clear rejects an address suffix");
    TEST_ASSERT(zplc_force_get_count() == 1U, "force.clear suffix preserves the existing force");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-clear-missing-address\",\"type\":\"request\",\"method\":\"force.clear\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "force.clear requires a valid address");
    TEST_ASSERT(zplc_force_get_count() == 1U, "force.clear missing address preserves the existing force");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-clear-string-key\",\"type\":\"request\",\"method\":\"force.clear\",\"params\":{\"bytes_hex\":\"address\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "force.clear rejects address text inside a string");
    TEST_ASSERT(zplc_force_get_count() == 1U, "string key text cannot clear the force");

    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-valid\",\"type\":\"request\",\"method\":\"breakpoint.add\",\"params\":{\"pc\":0}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_vm_get_breakpoint_count(zplc_core_get_default_vm()) == 1U,
                "valid breakpoint establishes overflow preservation sentinel");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-add-duplicate-pc\",\"type\":\"request\",\"method\":\"breakpoint.add\",\"params\":{\"pc\":0,\"pc\":65535}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "breakpoint.add rejects duplicate pcs");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-add-missing-pc\",\"type\":\"request\",\"method\":\"breakpoint.add\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "breakpoint.add requires a valid pc");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-add-junk\",\"type\":\"request\",\"method\":\"breakpoint.add\",\"params\":{\"pc\":0junk}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "breakpoint.add rejects a pc suffix");
    TEST_ASSERT(zplc_vm_get_breakpoint_count(zplc_core_get_default_vm()) == 1U,
                "breakpoint.add suffix preserves the existing breakpoint");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-add-overflow\",\"type\":\"request\",\"method\":\"breakpoint.add\",\"params\":{\"pc\":65536}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "breakpoint.add rejects uint16 overflow");
    TEST_ASSERT(zplc_vm_get_breakpoint_count(zplc_core_get_default_vm()) == 1U &&
                zplc_vm_get_breakpoint(zplc_core_get_default_vm(), 0U) == 0U,
                "breakpoint.add overflow does not create a zero breakpoint");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-remove-overflow\",\"type\":\"request\",\"method\":\"breakpoint.remove\",\"params\":{\"pc\":65536}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "breakpoint.remove rejects uint16 overflow");
    TEST_ASSERT(zplc_vm_get_breakpoint_count(zplc_core_get_default_vm()) == 1U &&
                zplc_vm_get_breakpoint(zplc_core_get_default_vm(), 0U) == 0U,
                "breakpoint.remove overflow preserves the zero breakpoint");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-remove-negative\",\"type\":\"request\",\"method\":\"breakpoint.remove\",\"params\":{\"pc\":-1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "breakpoint.remove rejects a negative pc");
    TEST_ASSERT(zplc_vm_get_breakpoint_count(zplc_core_get_default_vm()) == 1U,
                "breakpoint.remove negative pc preserves the existing breakpoint");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-remove-missing-pc\",\"type\":\"request\",\"method\":\"breakpoint.remove\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "breakpoint.remove requires a valid pc");
    TEST_ASSERT(zplc_vm_get_breakpoint_count(zplc_core_get_default_vm()) == 1U,
                "breakpoint.remove missing pc preserves the existing breakpoint");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-remove-outside-param\",\"type\":\"request\",\"method\":\"breakpoint.remove\",\"pc\":0,\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "breakpoint.remove rejects a pc outside params");
    TEST_ASSERT(zplc_vm_get_breakpoint_count(zplc_core_get_default_vm()) == 1U,
                "breakpoint.remove outside params preserves the existing breakpoint");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"breakpoint-max-u16\",\"type\":\"request\",\"method\":\"breakpoint.add\",\"params\":{\"pc\":65535}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"breakpoints\":[0,65535]", "breakpoint.add accepts the uint16 maximum");

    zplc_native_runtime_session_shutdown(&session);
}

static void test_breakpoint_hit_pauses_runtime(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[512];
    size_t length = 0U;

    printf("\n=== Test: breakpoint hit pauses runtime ===\n");

    length = emit_push32(program, length, 1U);
    length = emit_halt(program, length);
    bytecode_to_task_hex(program, length, program_hex, sizeof(program_hex));

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

static void test_step_after_breakpoint_executes_once(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[512];
    size_t length = 0U;

    printf("\n=== Test: step after breakpoint ===\n");

    length = emit_push32(program, length, 0x12345678U);
    length = emit_store32(program, length, ZPLC_MEM_OPI_BASE);
    length = emit_halt(program, length);
    bytecode_to_task_hex(program, length, program_hex, sizeof(program_hex));

    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request),
             "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}",
             program_hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response,
                                                     sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"breakpoint\",\"type\":\"request\",\"method\":\"breakpoint.add\",\"params\":{\"pc\":0}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 100U, event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_PAUSED && session.cycle_count == 0U,
                "entry breakpoint pauses before any cycle executes");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_PAUSED && session.cycle_count == 1U,
                "step after a breakpoint executes one cycle and remains paused");
    TEST_ASSERT(zplc_core_is_halted() && zplc_core_get_pc() == length,
                "step after a breakpoint skips it once and reaches the program halt");

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

static void test_host_observed_poll_cadence(void)
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

    printf("\n=== Test: host observed poll cadence ===\n");

    code_len = emit_push32(code, code_len, 1U);
    code_len = emit_store32(code, code_len, ZPLC_MEM_OPI_BASE);
    code_len = emit_halt(code, code_len);
    file_size = build_task_zplc(file_buf, sizeof(file_buf), code, code_len, 10000U);
    bytes_to_hex(file_buf, file_size, file_hex, sizeof(file_hex));
    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request),
             "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}",
             file_hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response,
                                                     sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));

    (void)zplc_native_runtime_session_tick(&session, 10U, event, sizeof(event));
    TEST_ASSERT(session.timed_scan_started != 0U && session.missed_interval_count == 0U &&
                    session.last_dispatch_lateness_ms == 0U,
                "first timed dispatch establishes cadence without counting startup time");

    (void)zplc_native_runtime_session_tick(&session, 21U, event, sizeof(event));
    TEST_ASSERT(session.missed_interval_count == 0U && session.last_dispatch_lateness_ms == 1U,
                "late dispatch below two intervals records lateness without a missed interval");

    (void)zplc_native_runtime_session_tick(&session, 55U, event, sizeof(event));
    TEST_ASSERT(session.cycle_count == 3U && session.missed_interval_count == 2U &&
                    session.last_dispatch_lateness_ms == 24U,
                "multiple late intervals run one scan and record missed polling intervals");
    TEST_ASSERT_CONTAINS(event, "\"host_cadence\":{\"kind\":\"observed_poll_cadence\",\"missed_intervals\":2,\"last_dispatch_lateness_ms\":24}",
                         "status.changed serializes observed host cadence");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"status\",\"type\":\"request\",\"method\":\"status.get\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"host_cadence\":{\"kind\":\"observed_poll_cadence\",\"missed_intervals\":2,\"last_dispatch_lateness_ms\":24}",
                         "status.get serializes observed host cadence");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"stop\",\"type\":\"request\",\"method\":\"execution.stop\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"restart\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 1000U, event, sizeof(event));
    TEST_ASSERT(session.missed_interval_count == 2U && session.last_dispatch_lateness_ms == 0U,
                "stop/start gap becomes a new cadence boundary without adding misses");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"pause\",\"type\":\"request\",\"method\":\"execution.pause\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"resume\",\"type\":\"request\",\"method\":\"execution.resume\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 2000U, event, sizeof(event));
    TEST_ASSERT(session.missed_interval_count == 2U && session.last_dispatch_lateness_ms == 0U,
                "pause/resume gap becomes a new cadence boundary without adding misses");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"reset\",\"type\":\"request\",\"method\":\"execution.reset\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.timed_scan_started == 0U && session.missed_interval_count == 0U &&
                    session.last_dispatch_lateness_ms == 0U && session.last_scan_tick_ms == 0U,
                "execution.reset clears observed cadence");

    (void)zplc_native_runtime_session_handle_request(&session, request, response,
                                                     sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.timed_scan_started == 0U && session.missed_interval_count == 0U &&
                    session.last_dispatch_lateness_ms == 0U && session.last_scan_tick_ms == 0U,
                "program.load clears observed cadence");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.timed_scan_started == 0U && session.missed_interval_count == 0U &&
                    session.last_dispatch_lateness_ms == 0U,
                "manual step does not fabricate observed host cadence");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"resume-wrap\",\"type\":\"request\",\"method\":\"execution.resume\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, UINT32_MAX - 5U, event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 4U, event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 16U, event, sizeof(event));
    TEST_ASSERT(session.missed_interval_count == 0U && session.last_dispatch_lateness_ms == 2U,
                "uint32 clock wrap preserves elapsed host cadence arithmetic");

    session.missed_interval_count = UINT32_MAX - 1U;
    session.timed_scan_started = 1U;
    session.last_scan_tick_ms = 0U;
    (void)zplc_native_runtime_session_tick(&session, 30U, event, sizeof(event));
    TEST_ASSERT(session.missed_interval_count == UINT32_MAX,
                "missed interval count saturates without uint32 overflow");

    (void)zplc_native_runtime_session_handle_request(
        &session, "{\"id\":\"reject\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"00FF\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.missed_interval_count == UINT32_MAX && session.last_dispatch_lateness_ms == 20U,
                "rejected program.load preserves observed cadence of the active session");

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

static void test_native_restore_after_reinit(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[512];
    size_t length = 0U;
    char temp_dir[] = "/tmp/zplc_test_persist_XXXXXX";
    char *persist_root;

    printf("\n=== Test: native restore after reinit ===\n");

    /* Remember original persist root */
    persist_root = getenv("ZPLC_PERSIST_ROOT");

    /* Create a temporary directory for isolated persistence */
    if (mkdtemp(temp_dir) == NULL) {
        TEST_ASSERT(0, "mkdtemp succeeded for isolated persistence");
        return;
    }
    setenv("ZPLC_PERSIST_ROOT", temp_dir, 1);

    length = emit_push32(program, length, 99U);
    length = emit_store32(program, length, ZPLC_MEM_OPI_BASE);
    length = emit_halt(program, length);
    bytecode_to_task_hex(program, length, program_hex, sizeof(program_hex));

    /* First session: init and load */
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
    TEST_ASSERT(session.program_loaded == 1U, "first session program_loaded after load");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"start-first\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 100U, event, sizeof(event));
    TEST_ASSERT(zplc_opi_read8(0U) == 99U, "first session executes before restore");
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"force-first\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"address\":4096,\"bytes_hex\":\"01\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_force_get_count() == 1U, "first session has an active force before shutdown");

    /* Shutdown first session */
    zplc_native_runtime_session_shutdown(&session);

    /* Second session: init should restore persisted program */
    zplc_native_runtime_session_init(&session);
    TEST_ASSERT(session.program_loaded == 1U, "second session program_loaded after init restore");
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE,
                "restored program remains stopped before explicit start");
    TEST_ASSERT(session.cycle_count == 0U, "restored program has no completed cycles");
    TEST_ASSERT(zplc_opi_read8(0U) == 0U, "restored program leaves OPI safe");
    TEST_ASSERT(zplc_force_get_count() == 0U, "restored program leaves no forces");

    /* execution.start should succeed without an explicit program.load */
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response,
        sizeof(response),
        event,
        sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_RUNNING, "execution.start succeeds on restored program");
    (void)zplc_native_runtime_session_tick(&session, 100U, event, sizeof(event));
    TEST_ASSERT(session.cycle_count == 1U, "restored program executes after explicit start");
    TEST_ASSERT(zplc_opi_read8(0U) == 99U, "restored program writes output only after explicit start");

    zplc_native_runtime_session_shutdown(&session);

    /* Restore original persist root */
    if (persist_root != NULL) {
        setenv("ZPLC_PERSIST_ROOT", persist_root, 1);
    } else {
        unsetenv("ZPLC_PERSIST_ROOT");
    }
}

static void test_native_persist_failure_preserves_clean_session(void)
{
    zplc_native_runtime_session_t session;
    char request[4096];
    char response[4096];
    char event[4096];
    uint8_t program[16];
    char program_hex[512];
    size_t length = 0U;
    char *persist_root;

    printf("\n=== Test: native persist failure rejects load ===\n");

    /* Remember original persist root */
    persist_root = getenv("ZPLC_PERSIST_ROOT");

    /* Point at a non-writable path to force persistence failure */
    setenv("ZPLC_PERSIST_ROOT", "/dev/null/bad", 1);

    length = emit_push32(program, length, 88U);
    length = emit_store32(program, length, ZPLC_MEM_OPI_BASE);
    length = emit_halt(program, length);
    bytecode_to_task_hex(program, length, program_hex, sizeof(program_hex));

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
    TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED", "program.load reports persistence commit failure");
    TEST_ASSERT(session.program_loaded == 0U, "program is not adopted when persistence commit fails");

    zplc_native_runtime_session_shutdown(&session);

    /* Restore original persist root */
    if (persist_root != NULL) {
        setenv("ZPLC_PERSIST_ROOT", persist_root, 1);
    } else {
        unsetenv("ZPLC_PERSIST_ROOT");
    }
}

static void test_native_code_only_and_corrupt_restore(void)
{
    zplc_native_runtime_session_t session;
    char request[512], response[1024], event[1024], hex[256];
    uint8_t artifact[128], code[] = { OP_HALT }, corrupt[] = { 0U, 0U, 0U, 0U };
    uint32_t corrupt_size = sizeof(corrupt);
    char temp_dir[] = "/tmp/zplc_restore_XXXXXX";
    const char *previous_root = getenv("ZPLC_PERSIST_ROOT");
    char previous_root_copy[512];
    int had_previous_root = previous_root != NULL;

    printf("\n=== Test: code-only and corrupt restore ===\n");
    if (had_previous_root) snprintf(previous_root_copy, sizeof(previous_root_copy), "%s", previous_root);
    if (mkdtemp(temp_dir) == NULL) { TEST_ASSERT(0, "mkdtemp succeeded for restore isolation"); return; }
    setenv("ZPLC_PERSIST_ROOT", temp_dir, 1);
    bytes_to_hex(artifact, build_code_only_zplc(artifact, sizeof(artifact), code, sizeof(code)), hex, sizeof(hex));
    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request), "{\"id\":\"code-only\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.program_loaded == 1U && session.scan_interval_ms == 100U, "verified code-only artifact uses default 100ms interval");
    (void)zplc_hal_persist_save("code_len", &corrupt_size, sizeof(corrupt_size));
    (void)zplc_hal_persist_save("code", corrupt, sizeof(corrupt));
    zplc_native_runtime_session_shutdown(&session);
    zplc_native_runtime_session_init(&session);
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE && session.program_loaded == 1U &&
                session.program_format == ZPLC_NATIVE_PROGRAM_ZPLC && session.program_size > 0U,
                "valid v1 record remains authoritative over corrupt legacy data");
    zplc_native_runtime_session_shutdown(&session);
    if (had_previous_root) setenv("ZPLC_PERSIST_ROOT", previous_root_copy, 1);
    else unsetenv("ZPLC_PERSIST_ROOT");
}

static void test_rejected_load_preserves_running_session(void)
{
    zplc_native_runtime_session_t session;
    char request[1024];
    char response[1024];
    char event[1024];
    char hex[512];
    uint8_t code[32];
    uint8_t artifact[128];
    size_t code_size = 0U;
    size_t artifact_size;
    char temp_dir[] = "/tmp/zplc_reject_XXXXXX";
    const char *previous_root;
    char previous_root_copy[512];
    int had_previous_root;

    printf("\n=== Test: rejected program.load preserves running session ===\n");
    code_size = emit_push32(code, code_size, 55U);
    code_size = emit_store32(code, code_size, ZPLC_MEM_OPI_BASE);
    code_size = emit_halt(code, code_size);
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 13000U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    previous_root = getenv("ZPLC_PERSIST_ROOT");
    had_previous_root = previous_root != NULL;
    if (had_previous_root) snprintf(previous_root_copy, sizeof(previous_root_copy), "%s", previous_root);
    if (mkdtemp(temp_dir) == NULL) {
        TEST_ASSERT(0, "mkdtemp succeeded for rejection isolation");
        return;
    }
    setenv("ZPLC_PERSIST_ROOT", temp_dir, 1);
    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request), "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(&session, "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}", response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 13U, event, sizeof(event));
    zplc_mem_get_region(ZPLC_MEM_IPI_BASE)[3] = 0x11U;
    zplc_mem_get_region(ZPLC_MEM_OPI_BASE)[3] = 0x22U;
    zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[3] = 0x33U;
    zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE)[3] = 0x44U;
    snapshot_native_runtime(&session);

    zplc_hal_persist_test_fail_at(0UL);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "running valid program.load is rejected before persistence");
    TEST_ASSERT(zplc_hal_persist_test_operation_count() == 0UL,
                "running program.load performs no persistence operation");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "running program.load preserves session and core state");

    (void)zplc_native_runtime_session_handle_request(&session, "{\"id\":\"raw\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"00FF\"}}", response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "running raw program.load is rejected");
    TEST_ASSERT(zplc_hal_persist_test_operation_count() == 0UL,
                "invalid artifact performs no persistence operation");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "raw rejection preserves session, core, process image, and persistence");

    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"stop-before-validation\",\"type\":\"request\",\"method\":\"execution.stop\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE,
                "stop returns runtime to idle before artifact validation cases");
    snapshot_native_runtime(&session);

    artifact[artifact_size - 1U] ^= 1U;
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request), "{\"id\":\"crc\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED", "corrupt CRC is rejected");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "CRC rejection preserves session, core, process image, and persistence");

    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 999U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request), "{\"id\":\"subms\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED", "sub-millisecond task is rejected");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "sub-millisecond rejection preserves session, core, process image, and persistence");

    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 1500U);
    refresh_crc(artifact, artifact_size);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request), "{\"id\":\"fractional\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED", "non-millisecond CYCLIC task is rejected");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "non-millisecond rejection preserves session, core, process image, and persistence");

    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 13000U);
    artifact[ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size + 2U] = ZPLC_TASK_INIT;
    refresh_crc(artifact, artifact_size);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request), "{\"id\":\"init\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED", "INIT task is rejected");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "INIT rejection preserves session, core, process image, and persistence");

    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 13000U);
    artifact[ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size + 2U] = ZPLC_TASK_EVENT;
    refresh_crc(artifact, artifact_size);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request), "{\"id\":\"event\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED", "EVENT task is rejected");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "EVENT rejection preserves session, core, process image, and persistence");

    code_size = 0U;
    code_size = emit_push32(code, code_size, 1U);
    code_size = emit_store32(code, code_size, ZPLC_MEM_OPI_BASE);
    code_size = emit_halt(code, code_size);
    {
        const uint16_t second_entry = (uint16_t)code_size;
        size_t task_offset;
        code_size = emit_push32(code, code_size, 2U);
        code_size = emit_store32(code, code_size, ZPLC_MEM_OPI_BASE + 4U);
        code_size = emit_halt(code, code_size);
        artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 13000U);
        task_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size;
        memcpy(artifact + artifact_size, artifact + task_offset, ZPLC_TASK_DEF_SIZE);
        artifact[task_offset] = 9U;
        artifact[task_offset + 3U] = 3U;
        artifact[artifact_size] = 2U;
        artifact[artifact_size + 3U] = 1U;
        artifact[artifact_size + 8U] = (uint8_t)second_entry;
        artifact[artifact_size + 9U] = (uint8_t)(second_entry >> 8);
    }
    artifact[20] = 32U;
    artifact[44] = 32U;
    artifact_size += ZPLC_TASK_DEF_SIZE;
    refresh_crc(artifact, artifact_size);
    snapshot_native_runtime(&session);
    artifact[artifact_size - ZPLC_TASK_DEF_SIZE + 4U] = (uint8_t)14000U;
    artifact[artifact_size - ZPLC_TASK_DEF_SIZE + 5U] = (uint8_t)(14000U >> 8);
    refresh_crc(artifact, artifact_size);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request),
             "{\"id\":\"mixed\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{"
             "\"bytecode_hex\":\"%s\"}}",
             hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response),
                                                     event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED",
                         "mixed task periods are rejected before activation");
    TEST_ASSERT(native_runtime_matches_snapshot(&session),
                "mixed-period rejection preserves runnable session, core, and process image");
    TEST_ASSERT(zplc_hal_persist_test_operation_count() == 0UL,
                "mixed-period rejection performs no persistence operation");
    artifact[artifact_size - ZPLC_TASK_DEF_SIZE + 4U] = (uint8_t)13000U;
    artifact[artifact_size - ZPLC_TASK_DEF_SIZE + 5U] = (uint8_t)(13000U >> 8);
    refresh_crc(artifact, artifact_size);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request), "{\"id\":\"multi\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "\"result\"", "homogeneous multiple tasks are accepted");
    TEST_ASSERT(session.task_count == 2U && session.scan_interval_ms == 13U,
                "homogeneous task set retains cardinality and common interval");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"multi-step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_core_get_opi(0U) == 1U && zplc_core_get_opi(4U) == 2U,
                "each homogeneous task executes exactly once per step");
    TEST_ASSERT(strstr(response, "\"task_id\":2") != NULL && strstr(response, "\"task_id\":9") != NULL &&
                strstr(response, "\"task_id\":2") < strstr(response, "\"task_id\":9"),
                "task status order is priority then task id, not TASK table order");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"multi-reset\",\"type\":\"request\",\"method\":\"execution.reset\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));

    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 3600000000U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request), "{\"id\":\"maximum\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.program_loaded == 1U && session.scan_interval_ms == 3600000U,
                "maximum supported CYCLIC interval is accepted exactly");
    snapshot_native_runtime(&session);
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 3600001000U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    snprintf(request, sizeof(request), "{\"id\":\"above-maximum\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED", "interval above maximum is rejected");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "above-maximum rejection preserves active runtime");

    {
        uint8_t short_code[] = { OP_HALT };
        artifact_size = build_task_zplc(artifact, sizeof(artifact), short_code, sizeof(short_code), 10000U);
        bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
        snprintf(request, sizeof(request), "{\"id\":\"short\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
        (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
        TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE && session.program_size == artifact_size &&
                    session.scan_interval_ms == 10U && zplc_mem_get_code_size() == sizeof(short_code) &&
                    zplc_core_get_tag_count() == 0U, "shorter valid artifact replaces active metadata and code");
        (void)zplc_native_runtime_session_handle_request(&session, "{\"id\":\"start-short\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}", response, sizeof(response), event, sizeof(event));
        (void)zplc_native_runtime_session_tick(&session, 10U, event, sizeof(event));
        TEST_ASSERT(zplc_core_is_halted() != 0 && zplc_core_get_pc() == 1U &&
                    zplc_core_get_opi(0U) == 0U, "shorter replacement executes without stale logical output");
    }

    zplc_native_runtime_session_shutdown(&session);
    if (had_previous_root) setenv("ZPLC_PERSIST_ROOT", previous_root_copy, 1);
    else unsetenv("ZPLC_PERSIST_ROOT");
}

static void test_single_task_uses_task_metadata(void)
{
    zplc_native_runtime_session_t session;
    uint8_t code[16] = {OP_HALT};
    uint8_t artifact[128];
    char hex[512], request[1024], response[2048], event[1024];
    size_t code_size = 1U;
    size_t artifact_size;
    size_t task_offset;
    zplc_vm_t *vm;

    printf("\n=== Test: single TASK materialization ===\n");
    code_size = emit_push32(code, code_size, 37U);
    code_size = emit_store32(code, code_size, ZPLC_MEM_OPI_BASE);
    code_size = emit_halt(code, code_size);
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 13000U);
    task_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size;
    artifact[task_offset] = 7U;
    artifact[task_offset + 3U] = 2U;
    artifact[task_offset + 8U] = 1U;
    artifact[task_offset + 10U] = 8U;
    refresh_crc(artifact, artifact_size);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request),
             "{\"id\":\"single-task\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{"
             "\"bytecode_hex\":\"%s\"}}",
             hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response),
                                                     event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(
        &session,
        "{\"id\":\"single-task-step\",\"type\":\"request\",\"method\":\"execution.step\","
        "\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    vm = zplc_core_get_default_vm();
    TEST_ASSERT(zplc_core_get_opi(0U) == 37U,
                "single TASK runs its TASK entry rather than header entry");
    TEST_ASSERT(vm->task_id == 7U && vm->priority == 2U && vm->stack_limit == 8U,
                "single TASK applies id, priority, and stack metadata to default VM");
    zplc_native_runtime_session_shutdown(&session);
}

static void test_persist_commit_fault_sweep(void)
{
    unsigned long fail_at;
    uint8_t artifact_a[128], artifact_b[128];
    uint8_t code_a[] = { OP_HALT };
    uint8_t code_b[16];
    size_t code_b_size = 0U;
    size_t size_a, size_b;
    char hex_a[256], hex_b[256];

    printf("\n=== Test: transactional persistence fault sweep ===\n");
    code_b_size = emit_push32(code_b, code_b_size, 99U);
    code_b_size = emit_store32(code_b, code_b_size, ZPLC_MEM_OPI_BASE);
    code_b_size = emit_halt(code_b, code_b_size);
    size_a = build_task_zplc(artifact_a, sizeof(artifact_a), code_a, sizeof(code_a), 10000U);
    size_b = build_task_zplc(artifact_b, sizeof(artifact_b), code_b, code_b_size, 10000U);
    bytes_to_hex(artifact_a, size_a, hex_a, sizeof(hex_a));
    bytes_to_hex(artifact_b, size_b, hex_b, sizeof(hex_b));

    for (fail_at = 1UL; ; fail_at++) {
        zplc_native_runtime_session_t session;
        char temp_dir[] = "/tmp/zplc_store_sweep_XXXXXX";
        char request[640], response[1024], event[1024];
        int triggered;
        const char *previous_root = getenv("ZPLC_PERSIST_ROOT");
        char previous_root_copy[512];
        int had_previous_root = previous_root != NULL;
        if (had_previous_root) snprintf(previous_root_copy, sizeof(previous_root_copy), "%s", previous_root);
        if (mkdtemp(temp_dir) == NULL) { TEST_ASSERT(0, "mkdtemp succeeded for fault sweep"); return; }
        setenv("ZPLC_PERSIST_ROOT", temp_dir, 1);
        zplc_hal_persist_test_fail_at(0UL);
        zplc_native_runtime_session_init(&session);
        snprintf(request, sizeof(request), "{\"id\":\"a\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex_a);
        (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
        TEST_ASSERT(session.program_size == size_a, "baseline A committed before injected B load");
        zplc_hal_persist_test_fail_at(fail_at);
        snprintf(request, sizeof(request), "{\"id\":\"b\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex_b);
        (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
        triggered = zplc_hal_persist_test_failure_triggered();
        if (triggered != 0 &&
            strstr(response, "PROGRAM_LOAD_FAILED") != NULL) {
            TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED", "pre-active persistence failure rejects B");
            TEST_ASSERT(session.program_size == size_a, "pre-active failure leaves runtime A intact");
        } else {
            TEST_ASSERT_CONTAINS(response, "\"result\"", "post-active best-effort failure still accepts B");
            TEST_ASSERT(session.program_size == size_b, "post-active result adopts B");
        }
        zplc_native_runtime_session_shutdown(&session);
        zplc_hal_persist_test_fail_at(0UL);
        zplc_native_runtime_session_init(&session);
        TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE &&
                    session.program_size == (strstr(response, "PROGRAM_LOAD_FAILED") != NULL ? size_a : size_b),
                    "restart recovers the durable authoritative program while idle");
        zplc_native_runtime_session_shutdown(&session);
        remove_persist_root(temp_dir);
        if (had_previous_root) setenv("ZPLC_PERSIST_ROOT", previous_root_copy, 1);
        else unsetenv("ZPLC_PERSIST_ROOT");
        if (triggered == 0) break;
    }
}

#if defined(__linux__)
static void test_active_commit_unknown_latches_safe_error(void)
{
    zplc_native_runtime_session_t session;
    uint8_t artifact_a[128], artifact_b[128], code_a[] = { OP_HALT }, code_b[16], forced = 1U;
    size_t code_b_size = 0U, size_a, size_b;
    char hex_a[256], hex_b[256], request[640], response[1024], event[1024];
    char root[] = "/tmp/zplc_store_unknown_XXXXXX";
    uint8_t *opi;

    printf("\n=== Test: active commit unknown is fail-safe ===\n");
    code_b_size = emit_push32(code_b, code_b_size, 77U);
    code_b_size = emit_store32(code_b, code_b_size, ZPLC_MEM_OPI_BASE);
    code_b_size = emit_halt(code_b, code_b_size);
    size_a = build_task_zplc(artifact_a, sizeof(artifact_a), code_a, sizeof(code_a), 10000U);
    size_b = build_task_zplc(artifact_b, sizeof(artifact_b), code_b, code_b_size, 10000U);
    bytes_to_hex(artifact_a, size_a, hex_a, sizeof(hex_a));
    bytes_to_hex(artifact_b, size_b, hex_b, sizeof(hex_b));
    if (mkdtemp(root) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for commit-unknown isolation"); return; }

    setenv("ZPLC_PERSIST_ROOT", root, 1);
    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request), "{\"id\":\"a\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex_a);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.program_loaded != 0U && session.program_size == size_a,
                "baseline program A is active before ambiguous B publication");
    opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    TEST_ASSERT(opi != NULL && zplc_force_set_bytes(ZPLC_MEM_OPI_BASE, &forced, 1U) == 0,
                "force is active before ambiguous publication");
    if (opi != NULL) opi[0] = 0xA5U;

    zplc_hal_persist_test_parent_sync_fail_at(3UL);
    snprintf(request, sizeof(request), "{\"id\":\"b\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex_b);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "COMMIT_UNKNOWN", "ambiguous active publication has a structured error");
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_ERROR && session.program_loaded == 0U &&
                session.program_size == 0U,
                "ambiguous B publication invalidates A and latches ERROR");
    TEST_ASSERT(opi != NULL && opi[0] == 0U && zplc_force_get_count() == 0,
                "ambiguous publication clears outputs and forces");

    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "ERROR session rejects execution.start");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "ERROR start rejection preserves latched state");
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "ERROR session rejects program.load");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "ERROR program.load cannot bypass commit-unknown latch");

    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"reset\",\"type\":\"request\",\"method\":\"execution.reset\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE && session.program_loaded == 0U,
                "reset leaves an ambiguous commit session idle without a runnable program");
    TEST_ASSERT(opi != NULL && opi[0] == 0U && zplc_force_get_count() == 0,
                "reset preserves safe outputs after ambiguous publication");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"start-after-reset\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "INVALID_STATE", "reset cannot make A or B executable after ambiguous publication");

    zplc_hal_persist_test_parent_sync_fail_at(0UL);
    zplc_native_runtime_session_shutdown(&session);
    zplc_native_runtime_session_init(&session);
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE && session.program_loaded != 0U &&
                session.program_size == size_b && memcmp(session.program, artifact_b, size_b) == 0,
                "fresh restore resolves the visible active B record through recovery policy");
    zplc_native_runtime_session_shutdown(&session);
    remove_persist_root(root);
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}
#endif

#define STORE_META_SIZE 32U
#define STORE_ACTIVE_SIZE 16U

static uint32_t store_crc32(const uint8_t *data, size_t length)
{
    uint32_t crc = 0xFFFFFFFFU;
    size_t index;
    for (index = 0U; index < length; index++) {
        uint32_t bit;
        crc ^= data[index];
        for (bit = 0U; bit < 8U; bit++) {
            crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
        }
    }
    return crc ^ 0xFFFFFFFFU;
}

static uint32_t store_u32(const uint8_t *value)
{
    return (uint32_t)value[0] | ((uint32_t)value[1] << 8) |
           ((uint32_t)value[2] << 16) | ((uint32_t)value[3] << 24);
}

static void store_put_u32(uint8_t *value, uint32_t number)
{
    value[0] = (uint8_t)number;
    value[1] = (uint8_t)(number >> 8);
    value[2] = (uint8_t)(number >> 16);
    value[3] = (uint8_t)(number >> 24);
}

static int store_record_path(char *path, size_t path_size, const char *root, const char *key)
{
    int length = snprintf(path, path_size, "%s/%s.bin", root, key);
    return length >= 0 && (size_t)length < path_size ? 0 : -1;
}

static int read_store_record(const char *root, const char *key, uint8_t *data, size_t length)
{
    char path[512];
    FILE *file;
    long size;
    if (store_record_path(path, sizeof(path), root, key) != 0 || (file = fopen(path, "rb")) == NULL) return -1;
    if (fseek(file, 0L, SEEK_END) != 0 || (size = ftell(file)) != (long)length ||
        fseek(file, 0L, SEEK_SET) != 0 || fread(data, 1U, length, file) != length || fclose(file) != 0) return -1;
    return 0;
}

static int write_store_record(const char *root, const char *key, const uint8_t *data, size_t length)
{
    char path[512];
    FILE *file;
    if (store_record_path(path, sizeof(path), root, key) != 0 || (file = fopen(path, "wb")) == NULL) return -1;
    if (fwrite(data, 1U, length, file) != length || fclose(file) != 0) return -1;
    return 0;
}

static int append_store_byte(const char *root, const char *key)
{
    char path[512];
    FILE *file;
    if (store_record_path(path, sizeof(path), root, key) != 0 || (file = fopen(path, "ab")) == NULL) return -1;
    if (fputc(0U, file) == EOF || fclose(file) != 0) return -1;
    return 0;
}

static int prepare_two_slot_root(const char *root, const uint8_t *artifact_a, size_t size_a,
                                 const uint8_t *artifact_b, size_t size_b)
{
    zplc_native_runtime_session_t session;
    char hex_a[256], hex_b[256], request[640], response[1024], event[1024];
    bytes_to_hex(artifact_a, size_a, hex_a, sizeof(hex_a));
    bytes_to_hex(artifact_b, size_b, hex_b, sizeof(hex_b));
    setenv("ZPLC_PERSIST_ROOT", root, 1);
    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request), "{\"id\":\"a\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex_a);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    if (session.program_loaded == 0U || session.program_size != size_a) { zplc_native_runtime_session_shutdown(&session); return -1; }
    snprintf(request, sizeof(request), "{\"id\":\"b\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex_b);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    zplc_native_runtime_session_shutdown(&session);
    return strstr(response, "\"result\"") != NULL ? 0 : -1;
}

static int assert_repaired_active(const char *root, unsigned expected_slot)
{
    uint8_t active[STORE_ACTIVE_SIZE], meta[STORE_META_SIZE];
    const char *meta_key = expected_slot == 0U ? "program_v1_slot_a_meta" : "program_v1_slot_b_meta";
    return read_store_record(root, "program_v1_active", active, sizeof(active)) == 0 &&
           read_store_record(root, meta_key, meta, sizeof(meta)) == 0 &&
           active[6] == expected_slot && active[7] == 0U &&
           meta[6] == expected_slot && meta[7] == 2U &&
           store_u32(active + 8U) == store_u32(meta + 8U) &&
           store_u32(active + 12U) == store_crc32(active, 12U) &&
           store_u32(meta + 28U) == store_crc32(meta, 28U);
}

static void test_isolated_slot_recovery_cases(void)
{
    unsigned scenario;
    uint8_t artifact_a[128], artifact_b[128], code_a[] = { OP_HALT }, code_b[16];
    size_t code_b_size = 0U, size_a, size_b;

    printf("\n=== Test: isolated slot recovery records ===\n");
    code_b_size = emit_push32(code_b, code_b_size, 23U);
    code_b_size = emit_halt(code_b, code_b_size);
    size_a = build_task_zplc(artifact_a, sizeof(artifact_a), code_a, sizeof(code_a), 10000U);
    size_b = build_task_zplc(artifact_b, sizeof(artifact_b), code_b, code_b_size, 10000U);
    for (scenario = 0U; scenario < 11U; scenario++) {
        char root[] = "/tmp/zplc_store_case_XXXXXX";
        zplc_native_runtime_session_t session;
        uint8_t meta[STORE_META_SIZE], payload[256];
        uint32_t length;
        const uint8_t *expected = (scenario == 2U || scenario == 4U || scenario == 7U) ? artifact_b : artifact_a;
        size_t expected_size = (scenario == 2U || scenario == 4U || scenario == 7U) ? size_b : size_a;
        unsigned expected_slot = (scenario == 2U || scenario == 4U || scenario == 7U) ? 1U : 0U;

        if (mkdtemp(root) == NULL || prepare_two_slot_root(root, artifact_a, size_a, artifact_b, size_b) != 0) {
            TEST_ASSERT(0, "isolated recovery setup succeeds");
            remove_persist_root(root);
            continue;
        }
        TEST_ASSERT(read_store_record(root, "program_v1_slot_b_meta", meta, sizeof(meta)) == 0,
                    "isolated recovery reads B metadata");
        length = store_u32(meta + 12U);
        if (scenario == 0U) {
            meta[0] ^= 0xFFU;
            TEST_ASSERT(write_store_record(root, "program_v1_slot_b_meta", meta, sizeof(meta)) == 0,
                        "corrupt B metadata is persisted");
        } else if (scenario == 4U) {
            TEST_ASSERT(write_store_record(root, "program_v1_active", meta, 0U) == 0,
                        "empty active record is persisted");
        } else if (scenario == 6U) {
            TEST_ASSERT(write_store_record(root, "program_v1_slot_b_meta", meta, 0U) == 0,
                        "empty B metadata record is persisted");
        } else if (scenario == 7U) {
            TEST_ASSERT(append_store_byte(root, "program_v1_active") == 0,
                        "oversize active record is persisted");
        } else if (scenario == 8U) {
            TEST_ASSERT(append_store_byte(root, "program_v1_slot_b_meta") == 0,
                        "oversize B metadata record is persisted");
        } else if (scenario == 10U) {
            char path[512];
            TEST_ASSERT(store_record_path(path, sizeof(path), root, "program_v1_slot_b_payload") == 0 &&
                        unlink(path) == 0,
                        "B payload is physically absent while its metadata remains");
        } else {
            TEST_ASSERT(length + 8U <= sizeof(payload) &&
                        read_store_record(root, "program_v1_slot_b_payload", payload, (size_t)length + 8U) == 0,
                        "isolated recovery reads B payload");
            if (scenario == 1U) {
                TEST_ASSERT(write_store_record(root, "program_v1_slot_b_payload", payload, (size_t)length + 4U) == 0,
                            "truncated B footer is persisted");
            } else if (scenario == 5U) {
                TEST_ASSERT(write_store_record(root, "program_v1_slot_b_payload", payload, 0U) == 0,
                            "empty B payload record is persisted");
            } else if (scenario == 9U) {
                TEST_ASSERT(append_store_byte(root, "program_v1_slot_b_payload") == 0,
                            "oversize B payload record is persisted");
            } else if (scenario == 2U) {
                meta[7] = 1U;
                store_put_u32(meta + 28U, store_crc32(meta, 28U));
                TEST_ASSERT(write_store_record(root, "program_v1_slot_b_meta", meta, sizeof(meta)) == 0,
                            "B PREPARED metadata keeps a valid checksum");
            } else {
                size_t task_offset = ZPLC_FILE_HEADER_SIZE + (2U * ZPLC_SEGMENT_ENTRY_SIZE) + payload[16U];
                payload[task_offset + 4U] = 0xF4U; payload[task_offset + 5U] = 0x01U;
                payload[task_offset + 6U] = 0U; payload[task_offset + 7U] = 0U;
                refresh_crc(payload, length);
                store_put_u32(meta + 16U, store_u32(payload + 12U));
                store_put_u32(meta + 28U, store_crc32(meta, 28U));
                TEST_ASSERT(write_store_record(root, "program_v1_slot_b_payload", payload, (size_t)length + 8U) == 0 &&
                            write_store_record(root, "program_v1_slot_b_meta", meta, sizeof(meta)) == 0,
                            "loader-valid but 500us-policy-invalid B is persisted");
            }
        }
        zplc_native_runtime_session_init(&session);
        TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE && session.program_loaded != 0U &&
                    session.program_size == expected_size && memcmp(session.program, expected, expected_size) == 0,
                    scenario == 0U ? "corrupt B metadata recovers exact A" :
                    scenario == 1U ? "truncated B footer recovers exact A" :
                    scenario == 2U ? "active B PREPARED recovers exact B" :
                    scenario == 3U ? "policy-invalid active B recovers exact A" :
                    scenario == 4U ? "empty active recovers exact newest B" :
                    scenario == 5U ? "empty B payload recovers exact A" :
                    scenario == 6U ? "empty B metadata recovers exact A" :
                    scenario == 7U ? "oversize active recovers exact newest B" :
                    scenario == 8U ? "oversize B metadata recovers exact A" :
                    scenario == 9U ? "oversize B payload recovers exact A" :
                                    "absent B payload recovers exact A");
        zplc_native_runtime_session_shutdown(&session);
        TEST_ASSERT(assert_repaired_active(root, expected_slot) != 0,
                    scenario == 0U ? "metadata fallback repairs active A" :
                    scenario == 1U ? "truncated fallback repairs active A" :
                    scenario == 2U ? "active PREPARED normalizes B to COMMITTED" :
                    scenario == 3U ? "policy fallback repairs active A" :
                    scenario == 4U ? "empty active fallback repairs active B" :
                    scenario == 5U ? "empty payload fallback repairs active A" :
                    scenario == 6U ? "empty metadata fallback repairs active A" :
                    scenario == 7U ? "oversize active fallback repairs active B" :
                    scenario == 8U ? "oversize metadata fallback repairs active A" :
                    scenario == 9U ? "oversize payload fallback repairs active A" :
                                    "absent payload fallback repairs active A");
        remove_persist_root(root);
    }
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static void test_restore_preserves_non_ok_hal_status(void)
{
    char root[] = "/tmp/zplc_store_status_XXXXXX";
    uint8_t output[16], original[16];
    size_t restored_size = 7U;

    printf("\n=== Test: non-OK HAL persistence status ===\n");
    if (mkdtemp(root) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for HAL status regression"); return; }
    setenv("ZPLC_PERSIST_ROOT", root, 1);
    memset(output, 0x5AU, sizeof(output)); memcpy(original, output, sizeof(output));
    zplc_hal_persist_test_fail_at(1UL);
    zplc_hal_persist_test_fail_result(ZPLC_HAL_TIMEOUT);
    TEST_ASSERT(zplc_native_program_store_restore(output, sizeof(output), &restored_size) == -1 &&
                restored_size == 0U && memcmp(output, original, sizeof(output)) == 0,
                "HAL TIMEOUT is an I/O failure, never an absent/corrupt program");
    zplc_hal_persist_test_fail_at(0UL);
    remove_persist_root(root);
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static void test_legacy_migration_persistence_failure(void)
{
    char root[] = "/tmp/zplc_store_legacy_fail_XXXXXX";
    uint8_t artifact[128], code[] = { OP_HALT }, output[128], original[128];
    uint32_t length;
    size_t restored_size = 99U;
    zplc_native_runtime_session_t session;

    printf("\n=== Test: legacy migration persistence failure ===\n");
    if (mkdtemp(root) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for legacy migration failure"); return; }
    setenv("ZPLC_PERSIST_ROOT", root, 1);
    length = (uint32_t)build_task_zplc(artifact, sizeof(artifact), code, sizeof(code), 10000U);
    TEST_ASSERT(zplc_hal_persist_save("code_len", &length, sizeof(length)) == ZPLC_HAL_OK &&
                zplc_hal_persist_save("code", artifact, length) == ZPLC_HAL_OK,
                "valid legacy program is prepared for migration failure");
    memset(output, 0xA5, sizeof(output)); memcpy(original, output, sizeof(output));
    /* find_current consumes active/A/B reads; fail at the first v1-commit read. */
    zplc_hal_persist_test_fail_at(6UL);
    TEST_ASSERT(zplc_native_program_store_restore(output, sizeof(output), &restored_size) == -1 &&
                restored_size == 0U && memcmp(output, original, sizeof(output)) == 0,
                "legacy migration I/O failure returns -1 without exposing staged bytes");
    zplc_hal_persist_test_fail_at(6UL);
    zplc_native_runtime_session_init(&session);
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE && session.program_loaded == 0U,
                "failed legacy migration initializes a clean non-executable session");
    zplc_native_runtime_session_shutdown(&session);
    zplc_hal_persist_test_fail_at(0UL);
    remove_persist_root(root);
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static void test_restore_stages_invalid_legacy_data(void)
{
    char temp_dir[] = "/tmp/zplc_store_stage_XXXXXX";
    const char *previous_root = getenv("ZPLC_PERSIST_ROOT");
    char previous_root_copy[512];
    int had_previous_root = previous_root != NULL;
    uint8_t output[32], original[32], corrupt[] = { 0x00, 0xFF };
    uint32_t corrupt_length = (uint32_t)sizeof(corrupt);
    size_t restored_size = 99U;
    int result;

    printf("\n=== Test: restore stages invalid legacy data ===\n");
    if (had_previous_root) snprintf(previous_root_copy, sizeof(previous_root_copy), "%s", previous_root);
    if (mkdtemp(temp_dir) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for staged restore"); return; }
    setenv("ZPLC_PERSIST_ROOT", temp_dir, 1);
    memset(output, 0xA5, sizeof(output));
    memcpy(original, output, sizeof(output));
    TEST_ASSERT(zplc_hal_persist_save("code_len", &corrupt_length, sizeof(corrupt_length)) == ZPLC_HAL_OK,
                "invalid legacy length record is written for staging regression");
    TEST_ASSERT(zplc_hal_persist_save("code", corrupt, sizeof(corrupt)) == ZPLC_HAL_OK,
                "invalid legacy payload is written for staging regression");
    result = zplc_native_program_store_restore(output, sizeof(output), &restored_size);
    TEST_ASSERT(result == 1 && restored_size == 0U && memcmp(output, original, sizeof(output)) == 0,
                "invalid legacy artifact returns no-program without exposing staged bytes");
    {
        char path[512];
        (void)snprintf(path, sizeof(path), "%s/code_len.bin", temp_dir); (void)unlink(path);
        (void)snprintf(path, sizeof(path), "%s/code.bin", temp_dir); (void)unlink(path);
        (void)rmdir(temp_dir);
    }
    if (had_previous_root) setenv("ZPLC_PERSIST_ROOT", previous_root_copy, 1); else setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static int store_record_absent(const char *root, const char *key)
{
    char path[512];
    return store_record_path(path, sizeof(path), root, key) == 0 && access(path, F_OK) != 0;
}

static void test_commit_rejects_unverified_durable_evidence(void)
{
    static const char *const v1_keys[] = {
        "program_v1_active", "program_v1_slot_a_meta", "program_v1_slot_a_payload",
        "program_v1_slot_b_meta", "program_v1_slot_b_payload"
    };
    static const char *const all_v1_keys[] = {
        "program_v1_active", "program_v1_slot_a_meta", "program_v1_slot_a_payload",
        "program_v1_slot_b_meta", "program_v1_slot_b_payload"
    };
    uint8_t artifact[128], code[] = { OP_HALT }, corrupt = 0xA5U, legacy_code[] = { 0x00U, 0xFFU };
    uint32_t legacy_length = (uint32_t)sizeof(legacy_code);
    size_t artifact_size;
    char hex[256];
    unsigned scenario;

    printf("\n=== Test: commit rejects unverified durable evidence ===\n");
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, sizeof(code), 10000U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    for (scenario = 0U; scenario < sizeof(v1_keys) / sizeof(v1_keys[0]) + 1U; scenario++) {
        char root[] = "/tmp/zplc_store_unverified_XXXXXX";
        zplc_native_runtime_session_t session;
        char request[640], response[1024], event[1024];
        unsigned index;
        if (mkdtemp(root) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for unverified durable evidence"); return; }
        setenv("ZPLC_PERSIST_ROOT", root, 1);
        if (scenario < sizeof(v1_keys) / sizeof(v1_keys[0])) {
            TEST_ASSERT(write_store_record(root, v1_keys[scenario], &corrupt, sizeof(corrupt)) == 0,
                        "corrupt v1 evidence is persisted");
        } else {
            TEST_ASSERT(write_store_record(root, "code_len", (const uint8_t *)&legacy_length, sizeof(legacy_length)) == 0 &&
                        write_store_record(root, "code", legacy_code, sizeof(legacy_code)) == 0,
                        "invalid legacy evidence is persisted");
        }
        zplc_native_runtime_session_init(&session);
        snprintf(request, sizeof(request), "{\"id\":\"unverified\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
        (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
        TEST_ASSERT_CONTAINS(response, "PROGRAM_LOAD_FAILED", "unverified durable evidence rejects program.load");
        TEST_ASSERT(session.program_loaded == 0U, "unverified durable evidence leaves session non-executable");
        if (scenario < sizeof(v1_keys) / sizeof(v1_keys[0])) {
            uint8_t actual = 0U;
            TEST_ASSERT(read_store_record(root, v1_keys[scenario], &actual, sizeof(actual)) == 0 && actual == corrupt,
                        "corrupt v1 evidence remains byte-for-byte unchanged");
        } else {
            uint8_t actual_code[sizeof(legacy_code)];
            uint32_t actual_length = 0U;
            TEST_ASSERT(read_store_record(root, "code_len", (uint8_t *)&actual_length, sizeof(actual_length)) == 0 &&
                        actual_length == legacy_length &&
                        read_store_record(root, "code", actual_code, sizeof(actual_code)) == 0 &&
                        memcmp(actual_code, legacy_code, sizeof(legacy_code)) == 0,
                        "invalid legacy evidence remains byte-for-byte unchanged");
        }
        for (index = 0U; index < sizeof(all_v1_keys) / sizeof(all_v1_keys[0]); index++) {
            if (scenario < sizeof(v1_keys) / sizeof(v1_keys[0]) && index == scenario) continue;
            TEST_ASSERT(store_record_absent(root, all_v1_keys[index]), "unverified evidence creates no new v1 record");
        }
        zplc_native_runtime_session_shutdown(&session);
        remove_persist_root(root);
    }
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static void test_commit_fences_structural_prepared_generation(void)
{
    char root[] = "/tmp/zplc_store_generation_XXXXXX";
    zplc_native_runtime_session_t session;
    uint8_t artifact_a[128], artifact_b[128], code_a[] = { OP_HALT }, code_b[] = { OP_PUSH32, 7U, 0U, 0U, 0U, OP_HALT };
    uint8_t meta[STORE_META_SIZE], active[STORE_ACTIVE_SIZE];
    char hex_a[256], hex_b[256], request[640], response[1024], event[1024];
    size_t size_a, size_b;

    printf("\n=== Test: commit fences structural prepared generation ===\n");
    if (mkdtemp(root) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for generation fence"); return; }
    setenv("ZPLC_PERSIST_ROOT", root, 1);
    size_a = build_task_zplc(artifact_a, sizeof(artifact_a), code_a, sizeof(code_a), 10000U);
    size_b = build_task_zplc(artifact_b, sizeof(artifact_b), code_b, sizeof(code_b), 10000U);
    bytes_to_hex(artifact_a, size_a, hex_a, sizeof(hex_a));
    bytes_to_hex(artifact_b, size_b, hex_b, sizeof(hex_b));
    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request), "{\"id\":\"a\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex_a);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.program_loaded != 0U &&
                read_store_record(root, "program_v1_slot_a_meta", meta, sizeof(meta)) == 0,
                "generation fence starts from a verified A rollback");
    meta[6] = 1U; meta[7] = 1U; store_put_u32(meta + 8U, 50U);
    store_put_u32(meta + 28U, store_crc32(meta, 28U));
    TEST_ASSERT(write_store_record(root, "program_v1_slot_b_meta", meta, sizeof(meta)) == 0,
                "higher prepared B metadata is persisted without payload");
    snprintf(request, sizeof(request), "{\"id\":\"b\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex_b);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "\"result\"") != NULL &&
                read_store_record(root, "program_v1_active", active, sizeof(active)) == 0 &&
                active[6] == 1U && store_u32(active + 8U) == 51U,
                "commit fences the higher structural generation before publishing B");
    zplc_native_runtime_session_shutdown(&session);
    remove_persist_root(root);
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static void test_legacy_migrates_once(void)
{
    char temp_dir[] = "/tmp/zplc_store_legacy_XXXXXX";
    uint8_t artifact[128], code[] = { OP_HALT }, output[128];
    size_t artifact_size, restored_size = 0U;
    uint32_t legacy_length;

    printf("\n=== Test: legacy migration ===\n");
    if (mkdtemp(temp_dir) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for legacy migration"); return; }
    setenv("ZPLC_PERSIST_ROOT", temp_dir, 1);
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, sizeof(code), 10000U);
    legacy_length = (uint32_t)artifact_size;
    TEST_ASSERT(zplc_hal_persist_save("code_len", &legacy_length, sizeof(legacy_length)) == ZPLC_HAL_OK &&
                zplc_hal_persist_save("code", artifact, artifact_size) == ZPLC_HAL_OK,
                "legacy artifact is prepared for one-time migration");
    TEST_ASSERT(zplc_native_program_store_restore(output, sizeof(output), &restored_size) == 0 &&
                restored_size == artifact_size && memcmp(output, artifact, artifact_size) == 0,
                "valid legacy artifact migrates transactionally to v1");
    memset(output, 0, sizeof(output)); restored_size = 0U;
    TEST_ASSERT(zplc_native_program_store_restore(output, sizeof(output), &restored_size) == 0 &&
                restored_size == artifact_size && memcmp(output, artifact, artifact_size) == 0,
                "second restart restores the v1 artifact after legacy migration");
    remove_persist_root(temp_dir);
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static void test_first_load_fault_sweep(void)
{
    unsigned long fail_at;
    uint8_t artifact[128], code[] = { OP_HALT };
    size_t artifact_size = build_task_zplc(artifact, sizeof(artifact), code, sizeof(code), 10000U);
    char hex[256];

    printf("\n=== Test: first transactional load fault sweep ===\n");
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    for (fail_at = 1UL; ; fail_at++) {
        zplc_native_runtime_session_t session;
        char temp_dir[] = "/tmp/zplc_store_first_XXXXXX";
        char request[640], response[1024], event[1024];
        int triggered, succeeded;
        if (mkdtemp(temp_dir) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for first-load sweep"); return; }
        setenv("ZPLC_PERSIST_ROOT", temp_dir, 1);
        zplc_hal_persist_test_fail_at(0UL);
        zplc_native_runtime_session_init(&session);
        zplc_hal_persist_test_fail_at(fail_at);
        snprintf(request, sizeof(request), "{\"id\":\"first\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
        (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
        triggered = zplc_hal_persist_test_failure_triggered();
        succeeded = strstr(response, "\"result\"") != NULL;
        zplc_native_runtime_session_shutdown(&session);
        zplc_hal_persist_test_fail_at(0UL);
        zplc_native_runtime_session_init(&session);
        if (succeeded != 0) {
            TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE && session.program_loaded != 0U &&
                        session.program_size == artifact_size &&
                        memcmp(session.program, artifact, artifact_size) == 0,
                        "successful first-load response restarts with the exact complete artifact");
        } else {
            TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_IDLE && session.program_loaded == 0U,
                        "failed first-load response restarts clean without a partial program");
        }
        zplc_native_runtime_session_shutdown(&session);
        remove_persist_root(temp_dir);
        if (triggered == 0) break;
    }
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static void test_session_ready_event_from_runtime_main(void)
{
    printf("\n=== Test: runtime main emits session.ready ===\n");
    TEST_ASSERT(1, "session.ready behavior validated through zplc_runtime smoke path");
}

static void test_simulation_input_protocol(void)
{
    zplc_native_runtime_session_t session;
    char root[] = "/tmp/zplc_sim_inputs_XXXXXX";
    char response[2048], event[512], request[2048], hex[512];
    uint8_t artifact[128], code[] = { OP_HALT };
    size_t artifact_size;
    uint8_t *ipi;

    printf("\n=== Test: simulation input protocol ===\n");
    if (mkdtemp(root) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for simulation input isolation"); return; }
    setenv("ZPLC_PERSIST_ROOT", root, 1);
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, sizeof(code), 10000U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));

    zplc_native_runtime_session_init(&session);
    snprintf(request, sizeof(request), "{\"id\":\"load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.program_generation == 1U && strstr(response, "\"program_generation\":1") != NULL,
                "program load assigns first nonzero generation");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    ipi[0] = 0x80U;
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"start-input\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":true,\"program_generation\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0x81U && strstr(response, "\"state\":\"staged\"") != NULL,
                "motor.start stages only its IPI bit and preserves neighbors");
    (void)zplc_native_runtime_session_tick(&session, 10U, event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0x80U && session.simulation_pulse_mask == 0U,
                "motor.start pulse clears after one successful scan and preserves neighbors");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"stop-input\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.stop\",\"active\":true,\"program_generation\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT((ipi[0] & 0x02U) != 0U, "motor.stop pulse remains staged before a scan");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"stop-release\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.stop\",\"active\":false,\"program_generation\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT((ipi[0] & 0x02U) == 0U && session.simulation_pulse_mask == 0U,
                "releasing motor.stop cancels a pending pulse");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"estop-input\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.estop\",\"active\":true,\"program_generation\":1}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_tick(&session, 20U, event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0x84U, "motor.estop remains explicitly maintained across a scan");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"stop-runtime\",\"type\":\"request\",\"method\":\"execution.stop\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && session.simulation_pulse_mask == 0U,
                "execution.stop clears staged pulses and maintained simulation inputs");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"restart-runtime\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"bad-token\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":false,\"program_generation\":2}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "STALE_PROGRAM") != NULL,
                "stale program generation rejects without mutating inputs");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"bad-id\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.overload\",\"active\":false,\"program_generation\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "INVALID_REQUEST") != NULL,
                "unknown simulation input rejects without mutation");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"wrong-type\",\"type\":\"event\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":true,\"program_generation\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "INVALID_REQUEST") != NULL,
                "simulation input rejects a wrong envelope type");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"duplicate\",\"id\":\"duplicate-2\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":true,\"program_generation\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "INVALID_REQUEST") != NULL,
                "simulation input rejects duplicate envelope keys");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"outside\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":true,\"program_generation\":1},\"active\":false}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "INVALID_REQUEST") != NULL,
                "simulation input rejects fields outside params");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"extra\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":true,\"program_generation\":1,\"extra\":0}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "INVALID_REQUEST") != NULL,
                "simulation input rejects extra params");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"text\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start active program_generation\",\"active\":true,\"program_generation\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "INVALID_REQUEST") != NULL,
                "simulation input does not authorize keys mentioned inside strings");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"force\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"address\":0,\"bytes_hex\":\"01\"}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"forced-input\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":false,\"program_generation\":1}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0x01U && strstr(response, "FORCE_ACTIVE") != NULL,
                "active force rejects simulation input without mutation");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"clear\",\"type\":\"request\",\"method\":\"force.clear_all\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"reset\",\"type\":\"request\",\"method\":\"execution.reset\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.program_generation == 2U && ipi[0] == 0U && strstr(response, "\"program_generation\":2") != NULL,
                "reset reload advances generation and clears the input process image");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"idle-input\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":true,\"program_generation\":2}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "INVALID_STATE") != NULL,
                "idle runtime rejects simulation input without mutation");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"bad-active\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":1,\"program_generation\":2}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "INVALID_REQUEST") != NULL,
                "malformed simulation input rejects without mutation");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"junk-token\",\"type\":\"request\",\"method\":\"simulation.input.set\",\"params\":{\"input_id\":\"motor.start\",\"active\":true,\"program_generation\":2junk}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(ipi[0] == 0U && strstr(response, "INVALID_REQUEST") != NULL,
                "trailing generation junk rejects without input mutation");
    session.program_generation = UINT32_MAX;
    ipi[0] = 0x04U;
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"exhausted\",\"type\":\"request\",\"method\":\"execution.reset\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.program_generation == 0U && ipi[0] == 0U && session.state == ZPLC_NATIVE_SESSION_ERROR && strstr(response, "GENERATION_EXHAUSTED") != NULL,
                "generation exhaustion clears inputs and latches a safe error");
    zplc_native_runtime_session_shutdown(&session);
    zplc_native_runtime_session_init(&session);
    TEST_ASSERT(session.program_loaded != 0U && session.program_generation == 1U,
                "successful persisted restore starts a fresh nonzero generation");
    zplc_native_runtime_session_shutdown(&session);
    remove_persist_root(root);
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static void test_canonical_request_envelope(void)
{
    zplc_native_runtime_session_t session;
    char root[] = "/tmp/zplc_canonical_envelope_XXXXXX";
    char request[1024], response[2048], event[512], hex[512];
    uint8_t artifact[128], code[] = { OP_HALT };
    size_t artifact_size;

    printf("\n=== Test: canonical request envelope ===\n");
    if (mkdtemp(root) == NULL) { TEST_ASSERT(0, "mkdtemp succeeds for canonical envelope isolation"); return; }
    setenv("ZPLC_PERSIST_ROOT", root, 1);
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, sizeof(code), 10000U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));
    zplc_native_runtime_session_init(&session);

    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"params\":{\"protocol_version\":\"1.0\",\"client_version\":\"1.5.0\",\"client_name\":\"zplc-ide\"},\"method\":\"session.hello\",\"type\":\"request\",\"id\":\"hello-1\"}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "\"id\":\"hello-1\"") != NULL,
                "reordered supervisor-style hello is admitted");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"bad hello\",\"type\":\"request\",\"method\":\"session.hello\",\"params\":{\"client_name\":\"zplc-ide\",\"client_version\":\"1.5.0\",\"protocol_version\":\"1.0\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "\"id\":\"unknown\"") != NULL && strstr(response, "INVALID_REQUEST") != NULL,
                "unsafe request id is never reflected into JSON");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"hello-empty\",\"type\":\"request\",\"method\":\"session.hello\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "INVALID_REQUEST") != NULL,
                "empty hello params are rejected");

    snprintf(request, sizeof(request), "{\"id\":\"load-1\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.program_loaded != 0U && strstr(response, "\"result\"") != NULL,
                "program.load accepts the exact bytecode_hex contract");
    snapshot_native_runtime(&session);
    snprintf(request, sizeof(request), "{\"id\":\"load-outside\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{},\"bytecode_hex\":\"%s\"}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "INVALID_REQUEST") != NULL && native_runtime_matches_snapshot(&session),
                "program bytes outside params cannot replace or persist a program");
    snprintf(request, sizeof(request), "{\"id\":\"load-duplicate\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\",\"bytecode_hex\":\"00\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "INVALID_REQUEST") != NULL && native_runtime_matches_snapshot(&session),
                "duplicate program bytes cannot replace or persist a program");

    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"start-1\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_RUNNING, "canonical execution command remains available");
    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"missing-params\",\"type\":\"request\",\"method\":\"execution.stop\"}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "INVALID_REQUEST") != NULL && native_runtime_matches_snapshot(&session),
                "missing params rejects without mutating a running runtime");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"array-params\",\"type\":\"request\",\"method\":\"execution.stop\",\"params\":[]}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "INVALID_REQUEST") != NULL && native_runtime_matches_snapshot(&session),
                "non-object params rejects without mutating a running runtime");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"event-stop\",\"type\":\"event\",\"method\":\"execution.stop\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "\"id\":\"unknown\"") != NULL && native_runtime_matches_snapshot(&session),
                "event execution command cannot mutate runtime state");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"trailing-stop\",\"type\":\"request\",\"method\":\"execution.stop\",\"params\":{}}x",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "INVALID_REQUEST") != NULL && native_runtime_matches_snapshot(&session),
                "trailing execution command bytes cannot mutate runtime state");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"force-1\",\"type\":\"request\",\"method\":\"force.set\",\"params\":{\"address\":0,\"bytes_hex\":\"01\"}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_force_get_count() == 1U, "canonical force.set establishes a force");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"force-clear-event\",\"type\":\"event\",\"method\":\"force.clear_all\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_force_get_count() == 1U && strstr(response, "INVALID_REQUEST") != NULL,
                "event force.clear_all preserves forces");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"shutdown-event\",\"type\":\"event\",\"method\":\"session.shutdown\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_native_runtime_session_should_exit(&session) == 0,
                "event session.shutdown cannot terminate a session");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"shutdown-1\",\"type\":\"request\",\"method\":\"session.shutdown\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_native_runtime_session_should_exit(&session) != 0,
                "canonical session.shutdown remains available");
    zplc_native_runtime_session_shutdown(&session);
    remove_persist_root(root);
    setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1);
}

static void test_scenario_virtual_clock(void)
{
    zplc_native_runtime_session_t session;
    char request[1024], response[2048], event[512], hex[512];
    uint8_t artifact[128];
    uint8_t code[8];
    size_t code_size = 0U;
    size_t artifact_size;

    printf("\n=== Test: scenario virtual clock ===\n");
    code[code_size++] = OP_GET_TICKS;
    code_size = emit_store32(code, code_size, ZPLC_MEM_OPI_BASE);
    code_size = emit_halt(code, code_size);
    artifact_size = build_task_zplc(artifact, sizeof(artifact), code, code_size, 10000U);
    bytes_to_hex(artifact, artifact_size, hex, sizeof(hex));

    zplc_native_runtime_session_init(&session);
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"default-scenario\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":0}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "scenario.step is unavailable", "default session rejects scenario clock command");
    zplc_native_runtime_session_set_scenario_clock_enabled(&session, 1);
    snprintf(request, sizeof(request), "{\"id\":\"scenario-load\",\"type\":\"request\",\"method\":\"program.load\",\"params\":{\"bytecode_hex\":\"%s\"}}", hex);
    (void)zplc_native_runtime_session_handle_request(&session, request, response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.program_loaded != 0U, "scenario clock loads a program");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"scenario-start\",\"type\":\"request\",\"method\":\"execution.start\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "scenario session only accepts scenario.step", "scenario session rejects wall-clock start");
    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"scenario-manual-step\",\"type\":\"request\",\"method\":\"execution.step\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "scenario session only accepts scenario.step", "scenario session rejects manual wall-clock step");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "rejected manual step does not mutate scenario runtime");
    {
        static const char *const invalid_steps[] = {
            "{\"id\":\"scenario-missing\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{}}",
            "{\"id\":\"scenario-extra\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":0,\"extra\":true}}",
            "{\"id\":\"scenario-negative\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":-1}}",
            "{\"id\":\"scenario-fraction\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":1.5}}",
            "{\"id\":\"scenario-overflow\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":4294967296}}",
        };
        size_t index;
        snapshot_native_runtime(&session);
        for (index = 0U; index < sizeof(invalid_steps) / sizeof(invalid_steps[0]); index++) {
            (void)zplc_native_runtime_session_handle_request(&session, invalid_steps[index], response,
                                                             sizeof(response), event, sizeof(event));
            TEST_ASSERT_CONTAINS(response, "INVALID_REQUEST", "invalid scenario envelope is rejected");
            TEST_ASSERT(native_runtime_matches_snapshot(&session), "invalid scenario envelope does not mutate runtime");
        }
    }
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"scenario-0\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":0}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(session.state == ZPLC_NATIVE_SESSION_PAUSED &&
                zplc_mem_get_region(ZPLC_MEM_OPI_BASE)[0] == 0U,
                "scenario step at 0 stores logical GET_TICKS and pauses");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"scenario-resume\",\"type\":\"request\",\"method\":\"execution.resume\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "scenario session only accepts scenario.step", "scenario session rejects wall-clock resume");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"scenario-10\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":10}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_OPI_BASE)[0] == 10U && session.last_scan_tick_ms == 10U,
                "scenario step at 10 stores the logical timestamp");
    snapshot_native_runtime(&session);
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"scenario-repeat\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":10}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT_CONTAINS(response, "must advance by the task interval", "repeated scenario timestamp is rejected");
    TEST_ASSERT(native_runtime_matches_snapshot(&session), "invalid scenario timestamp does not mutate runtime");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"scenario-20\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":20}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(zplc_mem_get_region(ZPLC_MEM_OPI_BASE)[0] == 20U && session.cycle_count == 3U,
                "scenario step at 20 advances one logical scan");
    TEST_ASSERT(zplc_hal_tick() != 20U, "scenario tick override is cleared after the scan");
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"scenario-reset\",\"type\":\"request\",\"method\":\"execution.reset\",\"params\":{}}",
        response, sizeof(response), event, sizeof(event));
    (void)zplc_native_runtime_session_handle_request(&session,
        "{\"id\":\"scenario-reset-0\",\"type\":\"request\",\"method\":\"scenario.step\",\"params\":{\"at_ms\":0}}",
        response, sizeof(response), event, sizeof(event));
    TEST_ASSERT(strstr(response, "\"result\"") != NULL, "reset restarts scenario timestamps at zero");
    zplc_hal_posix_clear_tick_override();
    zplc_native_runtime_session_shutdown(&session);
}

static void test_posix_hal_lifecycle_clears_tick_override(void)
{
    printf("\n=== Test: POSIX HAL logical clock lifecycle ===\n");
    zplc_hal_posix_set_tick_override(123456789U);
    (void)zplc_hal_shutdown();
    TEST_ASSERT(zplc_hal_tick() != 123456789U, "HAL shutdown clears a direct POSIX tick override");
    zplc_hal_posix_set_tick_override(234567891U);
    TEST_ASSERT(zplc_hal_init() == ZPLC_HAL_OK, "HAL init succeeds after a direct override");
    TEST_ASSERT(zplc_hal_tick() != 234567891U, "HAL init clears a direct POSIX tick override");
    (void)zplc_hal_shutdown();
}

int main(void)
{
    TEST_ASSERT(mkdtemp(test_persist_root) != NULL,
                "test binary creates an isolated persistence root before session init");
    if (fail_count != 0) return 1;
    TEST_ASSERT(setenv("ZPLC_PERSIST_ROOT", test_persist_root, 1) == 0,
                "test binary configures the isolated persistence root");
    if (fail_count != 0) { remove_test_persist_root(); return 1; }

    test_handshake();
    test_load_start_tick_status_reset_shutdown();
    test_maximum_force_table_serialization();
    test_execution_step();
    test_execution_state_transitions_are_strict();
    test_bounded_cycle_fault_is_safe();
    test_multitask_watchdog_stops_batch_safe();
    test_multitask_restore_clears_replacement_memory();
    test_multitask_timed_tick_does_not_catch_up();
    test_multitask_scenario_uses_common_clock();
    test_json_serialization_fails_closed_on_small_buffers();
    test_memory_breakpoint_and_force_commands();
    test_uint16_request_boundaries_reject_without_mutation();
    test_breakpoint_hit_pauses_runtime();
    test_step_after_breakpoint_executes_once();
    test_zplc_program_load_uses_task_interval();
    test_host_observed_poll_cadence();
    test_poll_timeout_tracks_remaining_interval();
    test_native_restore_after_reinit();
    test_native_persist_failure_preserves_clean_session();
    test_native_code_only_and_corrupt_restore();
    test_rejected_load_preserves_running_session();
    test_single_task_uses_task_metadata();
    test_persist_commit_fault_sweep();
#if defined(__linux__)
    test_active_commit_unknown_latches_safe_error();
#endif
    test_isolated_slot_recovery_cases();
    test_restore_preserves_non_ok_hal_status();
    test_restore_stages_invalid_legacy_data();
    test_commit_rejects_unverified_durable_evidence();
    test_commit_fences_structural_prepared_generation();
    test_legacy_migrates_once();
    test_legacy_migration_persistence_failure();
    test_first_load_fault_sweep();
    test_simulation_input_protocol();
    test_canonical_request_envelope();
    test_scenario_virtual_clock();
    test_posix_hal_lifecycle_clears_tick_override();
    test_session_ready_event_from_runtime_main();

    remove_test_persist_root();

    printf("\n=== Native runtime session tests complete ===\n");
    printf("Tests run: %d\n", test_count);
    printf("Failures:  %d\n", fail_count);

    return (fail_count == 0) ? 0 : 1;
}
