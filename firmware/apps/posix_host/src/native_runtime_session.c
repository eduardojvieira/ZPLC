/**
 * @file native_runtime_session.c
 * @brief Request/response session helpers for the POSIX host runtime.
 */

#include "native_runtime_session.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

#define ZPLC_NATIVE_PROTOCOL_VERSION "1.0"
#define ZPLC_NATIVE_RUNTIME_KIND "native-posix"
#define ZPLC_NATIVE_RUNTIME_VERSION "1.5.0"
#define ZPLC_NATIVE_RESPONSE_ERR_INVALID_REQUEST -10
#define ZPLC_NATIVE_RESPONSE_ERR_PROGRAM_LOAD -11
#define ZPLC_NATIVE_RESPONSE_ERR_INVALID_STATE -12

typedef struct {
    char id[64];
    char method[64];
    char bytecode_hex[(ZPLC_MEM_CODE_SIZE * 2U) + 1U];
    uint32_t address;
    uint32_t length;
    uint32_t pc;
} zplc_native_request_t;

static int extract_json_uint32(const char *json,
                               const char *key,
                               uint32_t *value)
{
    const char *key_pos;
    const char *colon;
    char *end_ptr;
    unsigned long parsed_value;

    if (json == NULL || key == NULL || value == NULL) {
        return -1;
    }

    key_pos = strstr(json, key);
    if (key_pos == NULL) {
        return -1;
    }

    colon = strchr(key_pos, ':');
    if (colon == NULL) {
        return -1;
    }

    colon++;
    while (*colon != '\0' && isspace((unsigned char)*colon)) {
        colon++;
    }

    parsed_value = strtoul(colon, &end_ptr, 10);
    if (end_ptr == colon) {
        return -1;
    }

    *value = (uint32_t)parsed_value;
    return 0;
}

static void session_reset_program(zplc_native_runtime_session_t *session)
{
    session->program_loaded = 0U;
    session->cycle_count = 0U;
    session->overrun_count = 0U;
    session->program_size = 0U;
    session->program_format = ZPLC_NATIVE_PROGRAM_RAW;
    session->last_scan_tick_ms = 0U;
    memset(session->program, 0, sizeof(session->program));
}

static int is_zplc_binary(const uint8_t *program, size_t program_size)
{
    uint32_t magic;

    if (program == NULL || program_size < ZPLC_FILE_HEADER_SIZE) {
        return 0;
    }

    magic = (uint32_t)program[0]
        | ((uint32_t)program[1] << 8)
        | ((uint32_t)program[2] << 16)
        | ((uint32_t)program[3] << 24);

    return magic == ZPLC_MAGIC;
}

static uint32_t interval_us_to_ms(uint32_t interval_us)
{
    if (interval_us == 0U) {
        return 1U;
    }

    return (interval_us + 999U) / 1000U;
}

static int load_program_artifact(zplc_native_runtime_session_t *session,
                                 const uint8_t *program,
                                 size_t program_size)
{
    zplc_task_def_t tasks[1];
    int task_result;

    if (session == NULL || program == NULL || program_size == 0U) {
        return -1;
    }

    if (is_zplc_binary(program, program_size)) {
        if (zplc_core_load(program, program_size) != 0) {
            return -1;
        }

        task_result = zplc_core_load_tasks(program, program_size, tasks, 1U);
        session->scan_interval_ms = 100U;
        if (task_result > 0) {
            session->scan_interval_ms = interval_us_to_ms(tasks[0].interval_us);
        }
        session->program_format = ZPLC_NATIVE_PROGRAM_ZPLC;
        return 0;
    }

    if (zplc_core_load_raw(program, program_size) != 0) {
        return -1;
    }

    session->scan_interval_ms = 100U;
    session->program_format = ZPLC_NATIVE_PROGRAM_RAW;
    return 0;
}

static int extract_json_string(const char *json,
                               const char *key,
                               char *out,
                               size_t out_size)
{
    const char *key_pos;
    const char *colon;
    const char *quote_start;
    const char *quote_end;
    size_t length;

    if (json == NULL || key == NULL || out == NULL || out_size == 0U) {
        return -1;
    }

    key_pos = strstr(json, key);
    if (key_pos == NULL) {
        return -1;
    }

    colon = strchr(key_pos, ':');
    if (colon == NULL) {
        return -1;
    }

    quote_start = strchr(colon, '"');
    if (quote_start == NULL) {
        return -1;
    }

    quote_start++;
    quote_end = strchr(quote_start, '"');
    if (quote_end == NULL) {
        return -1;
    }

    length = (size_t)(quote_end - quote_start);
    if (length >= out_size) {
        return -1;
    }

    memcpy(out, quote_start, length);
    out[length] = '\0';
    return 0;
}

static int parse_request_line(const char *request_line,
                              zplc_native_request_t *request)
{
    if (request_line == NULL || request == NULL) {
        return -1;
    }

    memset(request, 0, sizeof(*request));

    if (extract_json_string(request_line, "\"id\"", request->id,
                            sizeof(request->id)) != 0) {
        return -1;
    }

    if (extract_json_string(request_line, "\"method\"", request->method,
                            sizeof(request->method)) != 0) {
        return -1;
    }

    (void)extract_json_string(request_line, "\"bytecode_hex\"",
                              request->bytecode_hex,
                              sizeof(request->bytecode_hex));
    if (request->bytecode_hex[0] == '\0') {
        (void)extract_json_string(request_line, "\"bytes_hex\"",
                                  request->bytecode_hex,
                                  sizeof(request->bytecode_hex));
    }
    (void)extract_json_uint32(request_line, "\"address\"", &request->address);
    (void)extract_json_uint32(request_line, "\"length\"", &request->length);
    (void)extract_json_uint32(request_line, "\"pc\"", &request->pc);

    return 0;
}

static int encode_hex_bytes(const uint8_t *bytes,
                            size_t length,
                            char *hex,
                            size_t hex_size)
{
    static const char alphabet[] = "0123456789ABCDEF";
    size_t index;

    if (bytes == NULL || hex == NULL) {
        return -1;
    }

    if (((length * 2U) + 1U) > hex_size) {
        return -1;
    }

    for (index = 0U; index < length; ++index) {
        hex[index * 2U] = alphabet[(bytes[index] >> 4) & 0x0FU];
        hex[(index * 2U) + 1U] = alphabet[bytes[index] & 0x0FU];
    }

    hex[length * 2U] = '\0';
    return 0;
}

static int read_memory_bytes(uint16_t address, uint16_t length, uint8_t *buffer)
{
    uint8_t *region;
    uint16_t offset;
    uint16_t max_length;

    if (buffer == NULL || length == 0U) {
        return -1;
    }

    if (address >= ZPLC_MEM_RETAIN_BASE && address < (ZPLC_MEM_RETAIN_BASE + ZPLC_MEM_RETAIN_SIZE)) {
        region = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
        offset = (uint16_t)(address - ZPLC_MEM_RETAIN_BASE);
        max_length = ZPLC_MEM_RETAIN_SIZE;
    } else if (address >= ZPLC_MEM_WORK_BASE && address < (ZPLC_MEM_WORK_BASE + ZPLC_MEM_WORK_SIZE)) {
        region = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
        offset = (uint16_t)(address - ZPLC_MEM_WORK_BASE);
        max_length = ZPLC_MEM_WORK_SIZE;
    } else if (address >= ZPLC_MEM_OPI_BASE && address < (ZPLC_MEM_OPI_BASE + ZPLC_MEM_OPI_SIZE)) {
        region = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
        offset = (uint16_t)(address - ZPLC_MEM_OPI_BASE);
        max_length = ZPLC_MEM_OPI_SIZE;
    } else {
        region = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
        offset = address;
        max_length = ZPLC_MEM_IPI_SIZE;
    }

    if (region == NULL || (uint32_t)offset + (uint32_t)length > (uint32_t)max_length) {
        return -1;
    }

    memcpy(buffer, &region[offset], length);
    return 0;
}

static int format_breakpoint_list_response(const zplc_native_request_t *request,
                                           char *response,
                                           size_t response_size)
{
    zplc_vm_t *vm;
    uint8_t breakpoint_count;
    int written;
    uint8_t index;

    vm = zplc_core_get_default_vm();
    breakpoint_count = zplc_vm_get_breakpoint_count(vm);
    written = snprintf(response,
                       response_size,
                       "{\"id\":\"%s\",\"type\":\"response\",\"result\":{\"breakpoints\":[",
                       request->id);

    for (index = 0U; index < breakpoint_count && written > 0 && (size_t)written < response_size; ++index) {
        written += snprintf(response + written,
                            response_size - (size_t)written,
                            "%s%u",
                            (index == 0U) ? "" : ",",
                            (unsigned)zplc_vm_get_breakpoint(vm, index));
    }

    if (written > 0 && (size_t)written < response_size) {
        written += snprintf(response + written,
                            response_size - (size_t)written,
                            "]}}");
    }

    return written;
}

static int format_force_list_response(const zplc_native_request_t *request,
                                      char *response,
                                      size_t response_size)
{
    uint8_t index;
    uint8_t force_count;
    int written;

    force_count = zplc_force_get_count();
    written = snprintf(response,
                       response_size,
                       "{\"id\":\"%s\",\"type\":\"response\",\"result\":{\"force_entries\":[",
                       request->id);

    for (index = 0U; index < force_count && written > 0 && (size_t)written < response_size; ++index) {
        uint16_t addr = 0U;
        uint16_t size = 0U;
        uint8_t bytes[16];
        char bytes_hex[33];

        memset(bytes, 0, sizeof(bytes));
        if (zplc_force_get(index, &addr, &size, bytes) != 0) {
            continue;
        }

        if (encode_hex_bytes(bytes, size, bytes_hex, sizeof(bytes_hex)) != 0) {
            continue;
        }

        written += snprintf(response + written,
                            response_size - (size_t)written,
                            "%s{\"address\":%u,\"size\":%u,\"bytes_hex\":\"%s\",\"state\":\"forced\"}",
                            (index == 0U) ? "" : ",",
                            (unsigned)addr,
                            (unsigned)size,
                            bytes_hex);
    }

    if (written > 0 && (size_t)written < response_size) {
        written += snprintf(response + written,
                            response_size - (size_t)written,
                            "]}}");
    }

    return written;
}

static int hex_digit_value(char digit)
{
    if (digit >= '0' && digit <= '9') {
        return digit - '0';
    }

    if (digit >= 'a' && digit <= 'f') {
        return 10 + (digit - 'a');
    }

    if (digit >= 'A' && digit <= 'F') {
        return 10 + (digit - 'A');
    }

    return -1;
}

static int decode_hex_bytes(const char *hex,
                            uint8_t *bytes,
                            size_t bytes_capacity,
                            size_t *bytes_length)
{
    size_t index;
    size_t hex_length;

    if (hex == NULL || bytes == NULL || bytes_length == NULL) {
        return -1;
    }

    hex_length = strlen(hex);
    if ((hex_length % 2U) != 0U) {
        return -1;
    }

    if ((hex_length / 2U) > bytes_capacity) {
        return -1;
    }

    for (index = 0U; index < hex_length; index += 2U) {
        const int high = hex_digit_value(hex[index]);
        const int low = hex_digit_value(hex[index + 1U]);
        if (high < 0 || low < 0) {
            return -1;
        }

        bytes[index / 2U] = (uint8_t)((high << 4) | low);
    }

    *bytes_length = hex_length / 2U;
    return 0;
}

static int format_status_result(const zplc_native_runtime_session_t *session,
                                char *response,
                                size_t response_size,
                                const char *id)
{
    const char *state;

    if (session == NULL || response == NULL || id == NULL) {
        return -1;
    }

    switch (session->state) {
        case ZPLC_NATIVE_SESSION_RUNNING:
            state = "running";
            break;
        case ZPLC_NATIVE_SESSION_PAUSED:
            state = "paused";
            break;
        case ZPLC_NATIVE_SESSION_ERROR:
            state = "error";
            break;
        case ZPLC_NATIVE_SESSION_IDLE:
        default:
            state = "idle";
            break;
    }

    return snprintf(
        response,
        response_size,
        "{\"id\":\"%s\",\"type\":\"response\",\"result\":{"
        "\"state\":\"%s\",\"uptime_ms\":%u,"
        "\"stats\":{\"cycles\":%u,\"active_tasks\":1,\"overruns\":%u,"
        "\"program_size\":%u},"
        "\"focused_vm\":{\"pc\":%u,\"sp\":%u,\"halted\":%s,\"error\":%u},"
        "\"tasks\":[{\"task_id\":0,\"state\":\"%s\",\"cycles\":%u,\"overruns\":%u,"
        "\"interval_us\":%u,\"priority\":1,\"pc\":%u,\"sp\":%u,\"halted\":%s,\"error\":%u}],"
        "\"opi\":[0,0,0,0],\"force_entries\":[]}}",
        id,
        state,
        session->last_scan_tick_ms,
        session->cycle_count,
        session->overrun_count,
        session->program_size,
        (unsigned)zplc_core_get_pc(),
        (unsigned)zplc_core_get_sp(),
        zplc_core_is_halted() ? "true" : "false",
        (unsigned)zplc_core_get_error(),
        state,
        session->cycle_count,
        session->overrun_count,
        session->scan_interval_ms * 1000U,
        (unsigned)zplc_core_get_pc(),
        (unsigned)zplc_core_get_sp(),
        zplc_core_is_halted() ? "true" : "false",
        (unsigned)zplc_core_get_error());
}

static int format_error_response(const char *id,
                                 const char *code,
                                 const char *message,
                                 char *response,
                                 size_t response_size)
{
    return snprintf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"error\":{"
                    "\"code\":\"%s\",\"message\":\"%s\"}}",
                    id,
                    code,
                    message);
}

static int handle_session_hello(const zplc_native_request_t *request,
                                char *response,
                                size_t response_size)
{
    return snprintf(
        response,
        response_size,
        "{\"id\":\"%s\",\"type\":\"response\",\"result\":{"
        "\"protocol_version\":\"%s\",\"runtime_kind\":\"%s\","
        "\"runtime_version\":\"%s\",\"capability_profile\":{"
        "\"profile_id\":\"native-posix-mvp\",\"features\":["
        "{\"name\":\"pause\",\"status\":\"supported\"},"
        "{\"name\":\"resume\",\"status\":\"supported\"},"
        "{\"name\":\"step\",\"status\":\"supported\"},"
        "{\"name\":\"breakpoints\",\"status\":\"supported\"},"
        "{\"name\":\"tasks\",\"status\":\"degraded\","
        "\"reason\":\"POSIX host MVP reports a synthesized single-task snapshot, not the full Zephyr scheduler state\","
        "\"recommended_action\":\"Use hardware session for authoritative multi-task scheduling\"}]}}}",
        request->id,
        ZPLC_NATIVE_PROTOCOL_VERSION,
        ZPLC_NATIVE_RUNTIME_KIND,
        ZPLC_NATIVE_RUNTIME_VERSION);
}

static int handle_program_load(zplc_native_runtime_session_t *session,
                               const zplc_native_request_t *request,
                               char *response,
                               size_t response_size)
{
    size_t program_size;

    if (request->bytecode_hex[0] == '\0') {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "program.load requires bytecode_hex",
                                     response,
                                     response_size);
    }

    if (decode_hex_bytes(request->bytecode_hex,
                         session->program,
                         sizeof(session->program),
                         &program_size) != 0) {
        return format_error_response(request->id,
                                     "PROGRAM_LOAD_FAILED",
                                     "bytecode_hex is not valid uppercase/lowercase hex",
                                     response,
                                     response_size);
    }

    if (zplc_core_init() != 0) {
        session->state = ZPLC_NATIVE_SESSION_ERROR;
        return format_error_response(request->id,
                                     "PROGRAM_LOAD_FAILED",
                                     "zplc_core_init failed",
                                     response,
                                     response_size);
    }

    if (load_program_artifact(session, session->program, program_size) != 0) {
        session->state = ZPLC_NATIVE_SESSION_ERROR;
        return format_error_response(request->id,
                                     "PROGRAM_LOAD_FAILED",
                                     "failed to load program artifact",
                                     response,
                                     response_size);
    }

    session->program_loaded = 1U;
    session->program_size = (uint32_t)program_size;
    session->state = ZPLC_NATIVE_SESSION_IDLE;
    session->cycle_count = 0U;
    session->overrun_count = 0U;

    return snprintf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{"
                    "\"program_size\":%u}}",
                    request->id,
                    (unsigned)program_size);
}

static int handle_start(zplc_native_runtime_session_t *session,
                        const zplc_native_request_t *request,
                        char *response,
                        size_t response_size)
{
    if (session->program_loaded == 0U) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "program not loaded",
                                     response,
                                     response_size);
    }

    if (zplc_vm_is_paused(zplc_core_get_default_vm()) != 0) {
        (void)zplc_vm_resume(zplc_core_get_default_vm());
    }

    session->state = ZPLC_NATIVE_SESSION_RUNNING;
    return snprintf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{}}",
                    request->id);
}

static int handle_stop_or_reset(zplc_native_runtime_session_t *session,
                                const zplc_native_request_t *request,
                                char *response,
                                size_t response_size,
                                int reset_program)
{
    session->state = ZPLC_NATIVE_SESSION_IDLE;

    if (reset_program != 0 && session->program_loaded != 0U) {
        if (load_program_artifact(session, session->program, session->program_size) != 0) {
            session->state = ZPLC_NATIVE_SESSION_ERROR;
            return format_error_response(request->id,
                                         "RUNTIME_FAILURE",
                                         "failed to reset loaded program",
                                         response,
                                         response_size);
        }
        session->cycle_count = 0U;
        session->overrun_count = 0U;
    }

    return snprintf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{}}",
                    request->id);
}

static int handle_step(zplc_native_runtime_session_t *session,
                       const zplc_native_request_t *request,
                       char *response,
                       size_t response_size,
                       char *event,
                       size_t event_size)
{
    int run_result;

    if (session->program_loaded == 0U) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "program not loaded",
                                     response,
                                     response_size);
    }

    run_result = zplc_core_run_cycle();
    if (run_result < 0) {
        session->state = ZPLC_NATIVE_SESSION_ERROR;
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "zplc_core_run_cycle failed",
                                     response,
                                     response_size);
    }

    session->cycle_count += 1U;
    session->state = ZPLC_NATIVE_SESSION_PAUSED;

    if (event != NULL && event_size > 0U) {
        (void)snprintf(event,
                       event_size,
                       "{\"type\":\"event\",\"method\":\"step.completed\",\"params\":{"
                       "\"pc\":%u}}",
                       (unsigned)zplc_core_get_pc());
    }

    return format_status_result(session, response, response_size, request->id);
}

static int handle_memory_read(const zplc_native_request_t *request,
                              char *response,
                              size_t response_size)
{
    uint8_t bytes[64];
    char bytes_hex[129];

    if (request->length == 0U || request->length > sizeof(bytes)) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.read length must be between 1 and 64",
                                     response,
                                     response_size);
    }

    if (read_memory_bytes((uint16_t)request->address,
                          (uint16_t)request->length,
                          bytes) != 0 ||
        encode_hex_bytes(bytes, request->length, bytes_hex, sizeof(bytes_hex)) != 0) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.read address range is invalid",
                                     response,
                                     response_size);
    }

    return snprintf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{\"bytes_hex\":\"%s\"}}",
                    request->id,
                    bytes_hex);
}

static int handle_memory_write(const zplc_native_request_t *request,
                               char *response,
                               size_t response_size)
{
    uint8_t bytes[64];
    size_t bytes_length;

    if (request->bytecode_hex[0] == '\0') {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.write requires bytes_hex",
                                     response,
                                     response_size);
    }

    if (decode_hex_bytes(request->bytecode_hex, bytes, sizeof(bytes), &bytes_length) != 0 ||
        zplc_force_write_bytes((uint16_t)request->address, bytes, (uint16_t)bytes_length) != 0) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.write address or bytes are invalid",
                                     response,
                                     response_size);
    }

    return snprintf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{}}",
                    request->id);
}

static int handle_breakpoint_add(const zplc_native_request_t *request,
                                 char *response,
                                 size_t response_size)
{
    zplc_vm_t *vm = zplc_core_get_default_vm();

    if (zplc_vm_add_breakpoint(vm, (uint16_t)request->pc) < 0) {
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "breakpoint.add failed",
                                     response,
                                     response_size);
    }

    return format_breakpoint_list_response(request, response, response_size);
}

static int handle_breakpoint_remove(const zplc_native_request_t *request,
                                    char *response,
                                    size_t response_size)
{
    zplc_vm_t *vm = zplc_core_get_default_vm();

    if (zplc_vm_remove_breakpoint(vm, (uint16_t)request->pc) < 0) {
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "breakpoint.remove failed",
                                     response,
                                     response_size);
    }

    return format_breakpoint_list_response(request, response, response_size);
}

static int handle_breakpoint_clear(const zplc_native_request_t *request,
                                   char *response,
                                   size_t response_size)
{
    zplc_vm_t *vm = zplc_core_get_default_vm();

    if (zplc_vm_clear_breakpoints(vm) != 0) {
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "breakpoint.clear failed",
                                     response,
                                     response_size);
    }

    return format_breakpoint_list_response(request, response, response_size);
}

static int handle_force_set(const zplc_native_request_t *request,
                            char *response,
                            size_t response_size)
{
    uint8_t bytes[16];
    size_t bytes_length;

    if (decode_hex_bytes(request->bytecode_hex, bytes, sizeof(bytes), &bytes_length) != 0 ||
        zplc_force_set_bytes((uint16_t)request->address, bytes, (uint16_t)bytes_length) != 0) {
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "force.set failed",
                                     response,
                                     response_size);
    }

    return format_force_list_response(request, response, response_size);
}

static int handle_force_clear(const zplc_native_request_t *request,
                              char *response,
                              size_t response_size)
{
    if (zplc_force_clear((uint16_t)request->address) != 0) {
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "force.clear failed",
                                     response,
                                     response_size);
    }

    return format_force_list_response(request, response, response_size);
}

static int handle_force_clear_all(const zplc_native_request_t *request,
                                  char *response,
                                  size_t response_size)
{
    zplc_force_clear_all();
    return format_force_list_response(request, response, response_size);
}

void zplc_native_runtime_session_init(zplc_native_runtime_session_t *session)
{
    if (session == NULL) {
        return;
    }

    memset(session, 0, sizeof(*session));
    session->state = ZPLC_NATIVE_SESSION_IDLE;
    session->scan_interval_ms = 100U;
    zplc_core_init();
}

void zplc_native_runtime_session_shutdown(zplc_native_runtime_session_t *session)
{
    if (session == NULL) {
        return;
    }

    zplc_core_shutdown();
    session_reset_program(session);
    session->state = ZPLC_NATIVE_SESSION_IDLE;
}

int zplc_native_runtime_session_handle_request(zplc_native_runtime_session_t *session,
                                               const char *request_line,
                                               char *response,
                                               size_t response_size,
                                               char *event,
                                               size_t event_size)
{
    zplc_native_request_t request;

    if (session == NULL || request_line == NULL || response == NULL || response_size == 0U) {
        return ZPLC_NATIVE_RESPONSE_ERR_INVALID_REQUEST;
    }

    response[0] = '\0';
    if (event != NULL && event_size > 0U) {
        event[0] = '\0';
    }

    if (parse_request_line(request_line, &request) != 0) {
        return format_error_response("unknown",
                                     "INVALID_REQUEST",
                                     "unable to parse request envelope",
                                     response,
                                     response_size);
    }

    if (strcmp(request.method, "session.hello") == 0) {
        return handle_session_hello(&request, response, response_size);
    }

    if (strcmp(request.method, "program.load") == 0) {
        return handle_program_load(session, &request, response, response_size);
    }

    if (strcmp(request.method, "execution.start") == 0) {
        return handle_start(session, &request, response, response_size);
    }

    if (strcmp(request.method, "execution.stop") == 0) {
        return handle_stop_or_reset(session, &request, response, response_size, 0);
    }

    if (strcmp(request.method, "execution.reset") == 0) {
        return handle_stop_or_reset(session, &request, response, response_size, 1);
    }

    if (strcmp(request.method, "execution.pause") == 0) {
        session->state = ZPLC_NATIVE_SESSION_PAUSED;
        return snprintf(response,
                        response_size,
                        "{\"id\":\"%s\",\"type\":\"response\",\"result\":{}}",
                        request.id);
    }

    if (strcmp(request.method, "execution.resume") == 0) {
        return handle_start(session, &request, response, response_size);
    }

    if (strcmp(request.method, "execution.step") == 0) {
        return handle_step(session,
                           &request,
                           response,
                           response_size,
                           event,
                           event_size);
    }

    if (strcmp(request.method, "status.get") == 0) {
        return format_status_result(session, response, response_size, request.id);
    }

    if (strcmp(request.method, "memory.read") == 0) {
        return handle_memory_read(&request, response, response_size);
    }

    if (strcmp(request.method, "memory.write") == 0) {
        return handle_memory_write(&request, response, response_size);
    }

    if (strcmp(request.method, "breakpoint.add") == 0) {
        return handle_breakpoint_add(&request, response, response_size);
    }

    if (strcmp(request.method, "breakpoint.remove") == 0) {
        return handle_breakpoint_remove(&request, response, response_size);
    }

    if (strcmp(request.method, "breakpoint.clear") == 0) {
        return handle_breakpoint_clear(&request, response, response_size);
    }

    if (strcmp(request.method, "breakpoint.list") == 0) {
        return format_breakpoint_list_response(&request, response, response_size);
    }

    if (strcmp(request.method, "force.set") == 0) {
        return handle_force_set(&request, response, response_size);
    }

    if (strcmp(request.method, "force.clear") == 0) {
        return handle_force_clear(&request, response, response_size);
    }

    if (strcmp(request.method, "force.clear_all") == 0) {
        return handle_force_clear_all(&request, response, response_size);
    }

    if (strcmp(request.method, "force.list") == 0) {
        return format_force_list_response(&request, response, response_size);
    }

    if (strcmp(request.method, "session.shutdown") == 0) {
        session->should_exit = 1U;
        return snprintf(response,
                        response_size,
                        "{\"id\":\"%s\",\"type\":\"response\",\"result\":{}}",
                        request.id);
    }

    return format_error_response(request.id,
                                 "INVALID_REQUEST",
                                 "method is not implemented in the POSIX host MVP",
                                 response,
                                 response_size);
}

int zplc_native_runtime_session_tick(zplc_native_runtime_session_t *session,
                                     uint32_t now_ms,
                                     char *event,
                                     size_t event_size)
{
    int run_result;

    if (session == NULL) {
        return -1;
    }

    if (event != NULL && event_size > 0U) {
        event[0] = '\0';
    }

    if (session->state != ZPLC_NATIVE_SESSION_RUNNING || session->program_loaded == 0U) {
        return 0;
    }

    if ((now_ms - session->last_scan_tick_ms) < session->scan_interval_ms) {
        return 0;
    }

    run_result = zplc_core_run_cycle();
    session->last_scan_tick_ms = now_ms;
    if (run_result < 0) {
        session->state = ZPLC_NATIVE_SESSION_ERROR;
        if (event != NULL && event_size > 0U) {
            (void)snprintf(event,
                           event_size,
                           "{\"type\":\"event\",\"method\":\"runtime.error\",\"params\":{"
                           "\"code\":\"RUNTIME_FAILURE\","
                           "\"message\":\"zplc_core_run_cycle failed\"}}}");
        }
        return ZPLC_NATIVE_RESPONSE_ERR_INVALID_STATE;
    }

    if (run_result > 0) {
        session->cycle_count += 1U;
    }

    if (zplc_vm_is_paused(zplc_core_get_default_vm()) != 0) {
        session->state = ZPLC_NATIVE_SESSION_PAUSED;
    }

    if (event != NULL && event_size > 0U) {
        (void)snprintf(event,
                       event_size,
                       "{\"type\":\"event\",\"method\":\"status.changed\",\"params\":{"
                       "\"state\":\"%s\",\"uptime_ms\":%u,"
                       "\"stats\":{\"cycles\":%u,\"active_tasks\":1,\"overruns\":%u,"
                       "\"program_size\":%u},"
                       "\"focused_vm\":{\"pc\":%u,\"sp\":%u,\"halted\":%s,\"error\":%u},"
                       "\"tasks\":[{\"task_id\":0,\"state\":\"%s\",\"cycles\":%u,\"overruns\":%u,"
                       "\"interval_us\":%u,\"priority\":1,\"pc\":%u,\"sp\":%u,\"halted\":%s,\"error\":%u}],"
                       "\"opi\":[0,0,0,0],\"force_entries\":[]}}",
                       session->state == ZPLC_NATIVE_SESSION_PAUSED ? "paused" : "running",
                       now_ms,
                       session->cycle_count,
                       session->overrun_count,
                       session->program_size,
                       (unsigned)zplc_core_get_pc(),
                       (unsigned)zplc_core_get_sp(),
                       zplc_core_is_halted() ? "true" : "false",
                       (unsigned)zplc_core_get_error(),
                       session->state == ZPLC_NATIVE_SESSION_PAUSED ? "paused" : "running",
                       session->cycle_count,
                       session->overrun_count,
                       session->scan_interval_ms * 1000U,
                       (unsigned)zplc_core_get_pc(),
                       (unsigned)zplc_core_get_sp(),
                       zplc_core_is_halted() ? "true" : "false",
                       (unsigned)zplc_core_get_error());
    }

    return 0;
}

uint32_t zplc_native_runtime_session_poll_timeout_ms(
    const zplc_native_runtime_session_t *session,
    uint32_t now_ms,
    uint32_t max_timeout_ms)
{
    uint32_t elapsed_ms;
    uint32_t remaining_ms;

    if (session == NULL || max_timeout_ms == 0U) {
        return 0U;
    }

    if (session->state != ZPLC_NATIVE_SESSION_RUNNING ||
        session->program_loaded == 0U ||
        session->scan_interval_ms == 0U) {
        return max_timeout_ms;
    }

    elapsed_ms = now_ms - session->last_scan_tick_ms;
    if (elapsed_ms >= session->scan_interval_ms) {
        return 0U;
    }

    remaining_ms = session->scan_interval_ms - elapsed_ms;
    if (remaining_ms < max_timeout_ms) {
        return remaining_ms;
    }

    return max_timeout_ms;
}

int zplc_native_runtime_session_should_exit(
    const zplc_native_runtime_session_t *session)
{
    if (session == NULL) {
        return 1;
    }

    return session->should_exit != 0U;
}
