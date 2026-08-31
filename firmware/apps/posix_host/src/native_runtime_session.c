/**
 * @file native_runtime_session.c
 * @brief Request/response session helpers for the POSIX host runtime.
 *
 * Programs are staged and durably published before they replace the active
 * core/session. Restore always leaves the host session IDLE.
 */

#include "native_runtime_session.h"
#include "native_program_store.h"

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_hal_posix.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

#define ZPLC_NATIVE_PROTOCOL_VERSION "1.0"
#define ZPLC_NATIVE_RUNTIME_KIND "native-posix"
#define ZPLC_NATIVE_RESPONSE_ERR_INVALID_REQUEST -10
#define ZPLC_NATIVE_RESPONSE_ERR_PROGRAM_LOAD -11
#define ZPLC_NATIVE_RESPONSE_ERR_INVALID_STATE -12
#define ZPLC_NATIVE_FIELD_ABSENT 0U
#define ZPLC_NATIVE_FIELD_VALID 1U
#define ZPLC_NATIVE_FIELD_INVALID 2U


typedef struct {
    char id[64];
    char method[64];
    char bytecode_hex[(ZPLC_MEM_CODE_SIZE * 2U) + 1U];
    char input_id[32];
    uint32_t address;
    uint32_t length;
    uint32_t pc;
    uint8_t address_state;
    uint8_t length_state;
    uint8_t pc_state;
    uint32_t program_generation;
    uint8_t has_program_generation;
    uint8_t active;
    uint8_t has_active;
    uint32_t at_ms;
    uint8_t at_ms_state;
} zplc_native_request_t;

static int narrow_uint16(uint32_t value, uint16_t *out)
{
    if (out == NULL || value > UINT16_MAX) {
        return -1;
    }

    *out = (uint16_t)value;
    return 0;
}

static void session_reset_program(zplc_native_runtime_session_t *session)
{
    session->program_loaded = 0U;
    session->cycle_count = 0U;
    session->overrun_count = 0U;
    session->program_size = 0U;
    session->program_format = ZPLC_NATIVE_PROGRAM_NONE;
    session->program_generation = 0U;
    session->simulation_pulse_mask = 0U;
    session->last_scan_tick_ms = 0U;
    session->timed_scan_started = 0U;
    session->missed_interval_count = 0U;
    session->last_dispatch_lateness_ms = 0U;
    session->scenario_timestamp_started = 0U;
    session->scenario_last_timestamp_ms = 0U;
    session->task_count = 0U;
    session->has_task_segment = 0U;
    memset(session->tasks, 0, sizeof(session->tasks));
    memset(session->task_vms, 0, sizeof(session->task_vms));
    memset(session->program, 0, sizeof(session->program));
}

static int session_clear_simulation_pulses(zplc_native_runtime_session_t *session)
{
    uint8_t *ipi;

    if (session == NULL || session->simulation_pulse_mask == 0U) {
        return 0;
    }
    if (zplc_pi_lock() != 0) {
        return -1;
    }
    ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    if (ipi == NULL) {
        zplc_pi_unlock();
        return -1;
    }
    ipi[0] &= (uint8_t)~session->simulation_pulse_mask;
    session->simulation_pulse_mask = 0U;
    zplc_pi_unlock();
    return 0;
}

static void session_reset_observed_cadence(zplc_native_runtime_session_t *session)
{
    session->timed_scan_started = 0U;
    session->missed_interval_count = 0U;
    session->last_dispatch_lateness_ms = 0U;
    session->last_scan_tick_ms = 0U;
}

static void session_reset_scenario_clock(zplc_native_runtime_session_t *session)
{
    session->scenario_timestamp_started = 0U;
    session->scenario_last_timestamp_ms = 0U;
}

/* The POSIX runtime has no physical outputs, but its shared process image and
 * force table must still be de-energized before reporting a failed cycle. */
static void session_apply_safe_state(zplc_native_runtime_session_t *session)
{
    uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    uint8_t *ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);

    zplc_force_clear_all();
    if (opi != NULL) {
        memset(opi, 0, ZPLC_MEM_OPI_SIZE);
    }
    if (ipi != NULL) {
        memset(ipi, 0, ZPLC_MEM_IPI_SIZE);
    }
    if (session != NULL) {
        session->simulation_pulse_mask = 0U;
        session->state = ZPLC_NATIVE_SESSION_ERROR;
    }
}

static int validate_program_artifact(const uint8_t *program, size_t program_size,
                                     zplc_native_program_details_t *details)
{
    return zplc_native_program_describe(program, program_size, details);
}

static void sort_tasks(zplc_task_def_t *tasks, uint8_t count)
{
    uint8_t index;
    for (index = 1U; index < count; ++index) {
        zplc_task_def_t current = tasks[index];
        uint8_t position = index;
        while (position > 0U &&
               (tasks[position - 1U].priority > current.priority ||
                (tasks[position - 1U].priority == current.priority &&
                 tasks[position - 1U].id > current.id))) {
            tasks[position] = tasks[position - 1U];
            --position;
        }
        tasks[position] = current;
    }
}

static int load_program_artifact(zplc_native_runtime_session_t *session,
                                 const uint8_t *program, size_t program_size,
                                 const zplc_native_program_details_t *details,
                                 uint8_t *workspace, size_t workspace_size)
{
    int count;
    uint8_t index;
    uint32_t code_size;

    if (session == NULL || details == NULL || workspace == NULL ||
        workspace_size < ZPLC_LOADER_VERIFY_WORKSPACE_SIZE) return -1;
    if (details->task_count == 1U) {
        zplc_vm_t *vm;
        if (zplc_core_load(program, program_size, workspace, workspace_size) != 0) return -1;
        if (details->has_task_segment != 0U) {
            vm = zplc_core_get_default_vm();
            if (zplc_vm_set_entry(vm, details->tasks[0].entry_point,
                                  zplc_mem_get_code_size() - details->tasks[0].entry_point) != 0) return -1;
            vm->task_id = details->tasks[0].id;
            vm->priority = details->tasks[0].priority;
            vm->stack_limit = details->tasks[0].stack_size;
        }
        session->task_count = 1U;
        session->has_task_segment = details->has_task_segment;
        session->tasks[0] = details->tasks[0];
        return 0;
    }
    /* Match zplc_core_load() replacement semantics before its task-loader commit. */
    zplc_mem_init();
    zplc_force_clear_all();
    count = zplc_core_load_tasks(program, program_size, session->tasks,
                                 ZPLC_LOADER_MAX_TASKS, workspace, workspace_size);
    if (count <= 0 || (uint8_t)count != details->task_count) return -1;
    sort_tasks(session->tasks, (uint8_t)count);
    code_size = zplc_mem_get_code_size();
    for (index = 0U; index < (uint8_t)count; ++index) {
        zplc_vm_t *vm = &session->task_vms[index];
        if (zplc_vm_init(vm) != 0 ||
            zplc_vm_set_entry(vm, session->tasks[index].entry_point,
                              code_size - session->tasks[index].entry_point) != 0) return -1;
        vm->task_id = session->tasks[index].id;
        vm->priority = session->tasks[index].priority;
        vm->stack_limit = session->tasks[index].stack_size;
    }
    session->task_count = (uint8_t)count;
    session->has_task_segment = 1U;
    return 0;
}

static const zplc_vm_t *session_focused_vm(const zplc_native_runtime_session_t *session)
{
    return session->task_count > 1U ? &session->task_vms[0] : zplc_core_get_default_vm();
}

static int session_resume_tasks(zplc_native_runtime_session_t *session)
{
    uint8_t index;
    if (session->task_count <= 1U) {
        return zplc_vm_is_paused(zplc_core_get_default_vm()) == 0 ||
               zplc_vm_resume(zplc_core_get_default_vm()) == 0 ? 0 : -1;
    }
    for (index = 0U; index < session->task_count; ++index) {
        if (zplc_vm_is_paused(&session->task_vms[index]) != 0 &&
            zplc_vm_resume(&session->task_vms[index]) != 0) return -1;
    }
    return 0;
}

static int session_dispatch_tasks(zplc_native_runtime_session_t *session)
{
    uint8_t index;
    int result;
    if (session->task_count <= 1U) return zplc_core_run_cycle();
    for (index = 0U; index < session->task_count; ++index) {
        result = zplc_vm_run_cycle(&session->task_vms[index]);
        if (result < 0) return result;
    }
    return 1;
}

static void skip_json_space(const char **cursor)
{
    while (**cursor != '\0' && isspace((unsigned char)**cursor)) {
        (*cursor)++;
    }
}

static int parse_canonical_json_string(const char **cursor, char *out, size_t out_size)
{
    const char *start;
    size_t length;

    skip_json_space(cursor);
    if (**cursor != '"' || out == NULL || out_size == 0U) return -1;
    (*cursor)++;
    start = *cursor;
    while (**cursor != '\0' && **cursor != '"') {
        if (**cursor == '\\' || (unsigned char)**cursor < 0x20U) return -1;
        (*cursor)++;
    }
    if (**cursor != '"') return -1;
    length = (size_t)(*cursor - start);
    if (length >= out_size) return -1;
    memcpy(out, start, length);
    out[length] = '\0';
    (*cursor)++;
    return 0;
}

static int parse_canonical_json_uint32(const char **cursor, uint32_t *value)
{
    unsigned long parsed;
    char *end;

    skip_json_space(cursor);
    if (!isdigit((unsigned char)**cursor)) return -1;
    if (**cursor == '0' && isdigit((unsigned char)(*cursor)[1])) return -1;
    errno = 0;
    parsed = strtoul(*cursor, &end, 10);
    if (end == *cursor || errno == ERANGE || parsed > UINT32_MAX) return -1;
    *cursor = end;
    *value = (uint32_t)parsed;
    return 0;
}

static int parse_canonical_json_bool(const char **cursor, uint8_t *value)
{
    skip_json_space(cursor);
    if (strncmp(*cursor, "true", 4U) == 0) {
        *cursor += 4U;
        *value = 1U;
        return 0;
    }
    if (strncmp(*cursor, "false", 5U) == 0) {
        *cursor += 5U;
        *value = 0U;
        return 0;
    }
    return -1;
}

static int parse_simulation_input_params(const char **cursor,
                                         zplc_native_request_t *request)
{
    uint8_t seen = 0U;

    skip_json_space(cursor);
    if (*(*cursor)++ != '{') return -1;
    for (;;) {
        char key[32];

        skip_json_space(cursor);
        if (**cursor == '}') {
            (*cursor)++;
            break;
        }
        if (parse_canonical_json_string(cursor, key, sizeof(key)) != 0) return -1;
        skip_json_space(cursor);
        if (*(*cursor)++ != ':') return -1;
        if (strcmp(key, "input_id") == 0 && (seen & 0x01U) == 0U) {
            if (parse_canonical_json_string(cursor, request->input_id, sizeof(request->input_id)) != 0) return -1;
            seen |= 0x01U;
        } else if (strcmp(key, "active") == 0 && (seen & 0x02U) == 0U) {
            if (parse_canonical_json_bool(cursor, &request->active) != 0) return -1;
            request->has_active = 1U;
            seen |= 0x02U;
        } else if (strcmp(key, "program_generation") == 0 && (seen & 0x04U) == 0U) {
            if (parse_canonical_json_uint32(cursor, &request->program_generation) != 0) return -1;
            request->has_program_generation = 1U;
            seen |= 0x04U;
        } else {
            return -1;
        }
        skip_json_space(cursor);
        if (**cursor == '}') {
            (*cursor)++;
            break;
        }
        if (*(*cursor)++ != ',') return -1;
    }
    return seen == 0x07U ? 0 : -1;
}

static int parse_canonical_control_params(const char **cursor,
                                          const char *method,
                                          zplc_native_request_t *request)
{
    uint8_t seen = 0U;
    uint8_t required;

    if (strcmp(method, "memory.read") == 0) {
        required = 0x03U;
    } else if (strcmp(method, "program.load") == 0) {
        required = 0x04U;
    } else if (strcmp(method, "memory.write") == 0 ||
               strcmp(method, "force.set") == 0) {
        required = 0x05U;
    } else if (strcmp(method, "breakpoint.add") == 0 ||
               strcmp(method, "breakpoint.remove") == 0) {
        required = 0x08U;
    } else if (strcmp(method, "force.clear") == 0) {
        required = 0x01U;
    } else {
        return -1;
    }

    skip_json_space(cursor);
    if (*(*cursor)++ != '{') return -1;
    for (;;) {
        char key[32];

        skip_json_space(cursor);
        if (**cursor == '}') {
            (*cursor)++;
            break;
        }
        if (parse_canonical_json_string(cursor, key, sizeof(key)) != 0) return -1;
        skip_json_space(cursor);
        if (*(*cursor)++ != ':') return -1;
        if (strcmp(key, "address") == 0 && (required & 0x01U) != 0U && (seen & 0x01U) == 0U) {
            if (parse_canonical_json_uint32(cursor, &request->address) != 0) return -1;
            request->address_state = ZPLC_NATIVE_FIELD_VALID;
            seen |= 0x01U;
        } else if (strcmp(key, "length") == 0 && (required & 0x02U) != 0U && (seen & 0x02U) == 0U) {
            if (parse_canonical_json_uint32(cursor, &request->length) != 0) return -1;
            request->length_state = ZPLC_NATIVE_FIELD_VALID;
            seen |= 0x02U;
        } else if (((strcmp(method, "program.load") == 0 && strcmp(key, "bytecode_hex") == 0) ||
                    (strcmp(method, "program.load") != 0 && strcmp(key, "bytes_hex") == 0)) &&
                   (required & 0x04U) != 0U && (seen & 0x04U) == 0U) {
            if (parse_canonical_json_string(cursor, request->bytecode_hex,
                                            sizeof(request->bytecode_hex)) != 0) return -1;
            seen |= 0x04U;
        } else if (strcmp(key, "pc") == 0 && (required & 0x08U) != 0U && (seen & 0x08U) == 0U) {
            if (parse_canonical_json_uint32(cursor, &request->pc) != 0) return -1;
            request->pc_state = ZPLC_NATIVE_FIELD_VALID;
            seen |= 0x08U;
        } else {
            return -1;
        }
        skip_json_space(cursor);
        if (**cursor == '}') {
            (*cursor)++;
            break;
        }
        if (*(*cursor)++ != ',') return -1;
    }
    return seen == required ? 0 : -1;
}

static int parse_empty_params(const char **cursor)
{
    skip_json_space(cursor);
    if ((*cursor)[0] != '{' || (*cursor)[1] != '}') return -1;
    *cursor += 2U;
    return 0;
}

static int parse_scenario_step_params(const char **cursor, zplc_native_request_t *request)
{
    char key[16];

    skip_json_space(cursor);
    if (*(*cursor)++ != '{') return -1;
    skip_json_space(cursor);
    if (parse_canonical_json_string(cursor, key, sizeof(key)) != 0 ||
        strcmp(key, "at_ms") != 0) return -1;
    skip_json_space(cursor);
    if (*(*cursor)++ != ':' || parse_canonical_json_uint32(cursor, &request->at_ms) != 0) return -1;
    request->at_ms_state = ZPLC_NATIVE_FIELD_VALID;
    skip_json_space(cursor);
    if (*(*cursor)++ != '}') return -1;
    return 0;
}

static int parse_hello_params(const char **cursor)
{
    char key[32];
    char value[128];
    uint8_t seen = 0U;

    skip_json_space(cursor);
    if (*(*cursor)++ != '{') return -1;
    for (;;) {
        skip_json_space(cursor);
        if (**cursor == '}') { (*cursor)++; break; }
        if (parse_canonical_json_string(cursor, key, sizeof(key)) != 0) return -1;
        skip_json_space(cursor);
        if (*(*cursor)++ != ':' || parse_canonical_json_string(cursor, value, sizeof(value)) != 0 || value[0] == '\0') return -1;
        if (strcmp(key, "client_name") == 0 && (seen & 0x01U) == 0U) seen |= 0x01U;
        else if (strcmp(key, "client_version") == 0 && (seen & 0x02U) == 0U) seen |= 0x02U;
        else if (strcmp(key, "protocol_version") == 0 && (seen & 0x04U) == 0U && strcmp(value, ZPLC_NATIVE_PROTOCOL_VERSION) == 0) seen |= 0x04U;
        else return -1;
        skip_json_space(cursor);
        if (**cursor == '}') { (*cursor)++; break; }
        if (*(*cursor)++ != ',') return -1;
    }
    return seen == 0x07U ? 0 : -1;
}

static int is_empty_params_method(const char *method)
{
    return strcmp(method, "execution.start") == 0 ||
           strcmp(method, "execution.stop") == 0 ||
           strcmp(method, "execution.reset") == 0 ||
           strcmp(method, "execution.pause") == 0 ||
           strcmp(method, "execution.resume") == 0 ||
           strcmp(method, "execution.step") == 0 ||
           strcmp(method, "status.get") == 0 ||
           strcmp(method, "breakpoint.clear") == 0 ||
           strcmp(method, "breakpoint.list") == 0 ||
           strcmp(method, "force.clear_all") == 0 ||
           strcmp(method, "force.list") == 0 ||
           strcmp(method, "session.shutdown") == 0;
}

static int is_control_params_method(const char *method)
{
    return strcmp(method, "program.load") == 0 ||
           strcmp(method, "memory.read") == 0 ||
           strcmp(method, "memory.write") == 0 ||
           strcmp(method, "breakpoint.add") == 0 ||
           strcmp(method, "breakpoint.remove") == 0 ||
           strcmp(method, "force.set") == 0 ||
           strcmp(method, "force.clear") == 0;
}

static int is_safe_request_id(const char *id)
{
    size_t index;
    size_t length;

    if (id == NULL || !isalnum((unsigned char)id[0])) return 0;
    length = strlen(id);
    if (length == 0U || length > 63U) return 0;
    for (index = 1U; index < length; index++) {
        if (!isalnum((unsigned char)id[index]) && id[index] != '.' && id[index] != '_' &&
            id[index] != ':' && id[index] != '-') return 0;
    }
    return 1;
}

static int skip_json_value(const char **cursor)
{
    const char *start;
    int depth = 0;
    int quoted = 0;

    skip_json_space(cursor);
    start = *cursor;
    while (**cursor != '\0') {
        unsigned char character = (unsigned char)**cursor;
        if (quoted != 0) {
            if (character == '\\' || character < 0x20U) return -1;
            if (character == '"') quoted = 0;
        } else if (character == '"') {
            quoted = 1;
        } else if (character == '{' || character == '[') {
            depth++;
        } else if (character == '}' || character == ']') {
            if (depth == 0) break;
            depth--;
            if (depth == 0) { (*cursor)++; break; }
        } else if (depth == 0 && character == ',') {
            break;
        }
        (*cursor)++;
    }
    return *cursor != start && quoted == 0 && depth == 0 ? 0 : -1;
}

static int parse_canonical_request(const char *line, zplc_native_request_t *request)
{
    const char *cursor = line;
    const char *params = NULL;
    const char *params_end = NULL;
    uint8_t seen = 0U;

    if (line == NULL || request == NULL) return -1;
    memset(request, 0, sizeof(*request));
    skip_json_space(&cursor);
    if (*cursor++ != '{') return -1;
    for (;;) {
        char key[16];
        char type[16];

        skip_json_space(&cursor);
        if (*cursor == '}') { cursor++; break; }
        if (parse_canonical_json_string(&cursor, key, sizeof(key)) != 0) return -1;
        skip_json_space(&cursor);
        if (*cursor++ != ':') return -1;
        if (strcmp(key, "id") == 0 && (seen & 0x01U) == 0U) {
            if (parse_canonical_json_string(&cursor, request->id, sizeof(request->id)) != 0 || !is_safe_request_id(request->id)) return -1;
            seen |= 0x01U;
        } else if (strcmp(key, "type") == 0 && (seen & 0x02U) == 0U) {
            if (parse_canonical_json_string(&cursor, type, sizeof(type)) != 0 || strcmp(type, "request") != 0) return -1;
            seen |= 0x02U;
        } else if (strcmp(key, "method") == 0 && (seen & 0x04U) == 0U) {
            if (parse_canonical_json_string(&cursor, request->method, sizeof(request->method)) != 0) return -1;
            seen |= 0x04U;
        } else if (strcmp(key, "params") == 0 && (seen & 0x08U) == 0U) {
            params = cursor;
            if (*params != '{') return -1;
            if (skip_json_value(&cursor) != 0) return -1;
            params_end = cursor;
            seen |= 0x08U;
        } else return -1;
        skip_json_space(&cursor);
        if (*cursor == '}') { cursor++; break; }
        if (*cursor++ != ',') return -1;
    }
    skip_json_space(&cursor);
    if (seen != 0x0FU || params == NULL || params_end == NULL || *cursor != '\0') return -1;
    cursor = params;
    if (strcmp(request->method, "session.hello") == 0) {
        if (parse_hello_params(&cursor) != 0) return -1;
    } else if (strcmp(request->method, "simulation.input.set") == 0) {
        if (parse_simulation_input_params(&cursor, request) != 0) return -1;
    } else if (strcmp(request->method, "scenario.step") == 0) {
        if (parse_scenario_step_params(&cursor, request) != 0) return -1;
    } else if (is_control_params_method(request->method)) {
        if (parse_canonical_control_params(&cursor, request->method, request) != 0) return -1;
    } else if (is_empty_params_method(request->method)) {
        if (parse_empty_params(&cursor) != 0) return -1;
    } else if (parse_empty_params(&cursor) != 0) {
        return -1;
    }
    skip_json_space(&cursor);
    return cursor == params_end ? 0 : -1;
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

static int format_failed(char *response, size_t response_size);
static int append_jsonf(char *response, size_t response_size, size_t *used,
                        const char *format, ...);

static int format_breakpoint_list_response(const zplc_native_request_t *request,
                                           char *response,
                                           size_t response_size)
{
    zplc_vm_t *vm;
    uint8_t breakpoint_count;
    size_t used = 0U;
    uint8_t index;

    vm = zplc_core_get_default_vm();
    breakpoint_count = zplc_vm_get_breakpoint_count(vm);
    if (response == NULL || response_size == 0U || request == NULL ||
        append_jsonf(response, response_size, &used,
                     "{\"id\":\"%s\",\"type\":\"response\",\"result\":{\"breakpoints\":[", request->id) != 0) return format_failed(response, response_size);
    for (index = 0U; index < breakpoint_count; ++index)
        if (append_jsonf(response, response_size, &used, "%s%u", index == 0U ? "" : ",", (unsigned)zplc_vm_get_breakpoint(vm, index)) != 0) return format_failed(response, response_size);
    return append_jsonf(response, response_size, &used, "]}}") == 0 ? (int)used : format_failed(response, response_size);
}

static int format_failed(char *response, size_t response_size)
{
    if (response != NULL && response_size > 0U) {
        response[0] = '\0';
    }
    return -1;
}

static int format_jsonf(char *response, size_t response_size, const char *format, ...)
{
    va_list args;
    int written;
    if (response == NULL || response_size == 0U || format == NULL) return format_failed(response, response_size);
    va_start(args, format);
    written = vsnprintf(response, response_size, format, args);
    va_end(args);
    if (written < 0 || (size_t)written >= response_size) return format_failed(response, response_size);
    return written;
}

static int append_jsonf(char *response, size_t response_size, size_t *used,
                        const char *format, ...)
{
    va_list args;
    int written;

    if (response == NULL || used == NULL || format == NULL || *used >= response_size) {
        return format_failed(response, response_size);
    }

    va_start(args, format);
    written = vsnprintf(response + *used, response_size - *used, format, args);
    va_end(args);
    if (written < 0 || (size_t)written >= response_size - *used) {
        return format_failed(response, response_size);
    }

    *used += (size_t)written;
    return 0;
}

static int append_force_entries(char *response, size_t response_size, size_t *used)
{
    uint8_t index;
    const uint8_t force_count = zplc_force_get_count();

    if (append_jsonf(response, response_size, used, "[") != 0) {
        return -1;
    }
    for (index = 0U; index < force_count; ++index) {
        uint16_t addr = 0U;
        uint16_t size = 0U;
        uint8_t bytes[ZPLC_FORCE_MAX_BYTES];
        char bytes_hex[(ZPLC_FORCE_MAX_BYTES * 2U) + 1U];

        if (zplc_force_get(index, &addr, &size, bytes, sizeof(bytes)) != 0 ||
            encode_hex_bytes(bytes, size, bytes_hex, sizeof(bytes_hex)) != 0 ||
            append_jsonf(response, response_size, used,
                         "%s{\"address\":%u,\"size\":%u,\"bytes_hex\":\"%s\",\"state\":\"forced\"}",
                         index == 0U ? "" : ",", (unsigned)addr,
                         (unsigned)size, bytes_hex) != 0) {
            return format_failed(response, response_size);
        }
    }
    return append_jsonf(response, response_size, used, "]");
}

static int format_force_list_response(const zplc_native_request_t *request,
                                      char *response,
                                      size_t response_size)
{
    size_t used = 0U;

    if (request == NULL || response == NULL || response_size == 0U) {
        return format_failed(response, response_size);
    }
    response[0] = '\0';
    if (append_jsonf(response, response_size, &used,
                     "{\"id\":\"%s\",\"type\":\"response\",\"result\":{\"force_entries\":",
                     request->id) != 0 ||
        append_force_entries(response, response_size, &used) != 0 ||
        append_jsonf(response, response_size, &used, "}}") != 0) {
        return format_failed(response, response_size);
    }
    return (int)used;
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

static int append_status_payload(const zplc_native_runtime_session_t *session,
                                 char *response,
                                 size_t response_size,
                                 size_t *used)
{
    const char *state;
    const uint8_t *opi;
    const uint8_t *ipi;
    const zplc_vm_t *focused_vm;
    uint8_t index;

    if (session == NULL || response == NULL || used == NULL) {
        return format_failed(response, response_size);
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

    opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    focused_vm = session_focused_vm(session);
    if (opi == NULL || ipi == NULL ||
        append_jsonf(response, response_size, used,
        "{"
        "\"state\":\"%s\",\"uptime_ms\":%u,\"program_generation\":%u,"
        "\"stats\":{\"cycles\":%u,\"active_tasks\":%u,\"overruns\":%u,"
        "\"program_size\":%u},"
        "\"host_cadence\":{\"kind\":\"observed_poll_cadence\",\"missed_intervals\":%u,"
        "\"last_dispatch_lateness_ms\":%u},"
        "\"focused_vm\":{\"pc\":%u,\"sp\":%u,\"halted\":%s,\"error\":%u},\"tasks\":[",
        state,
        session->last_scan_tick_ms,
        session->program_generation,
        session->cycle_count,
        session->task_count,
        session->overrun_count,
        session->program_size,
        session->missed_interval_count,
        session->last_dispatch_lateness_ms,
        (unsigned)focused_vm->pc, (unsigned)focused_vm->sp,
        focused_vm->halted != 0U ? "true" : "false", (unsigned)focused_vm->error) != 0) {
        return format_failed(response, response_size);
    }
    for (index = 0U; index < session->task_count; ++index) {
        const zplc_vm_t *vm = session->task_count > 1U ? &session->task_vms[index] : zplc_core_get_default_vm();
        if (append_jsonf(response, response_size, used,
                         "%s{\"task_id\":%u,\"state\":\"%s\",\"cycles\":%u,\"overruns\":%u,\"interval_us\":%u,\"priority\":%u,\"pc\":%u,\"sp\":%u,\"halted\":%s,\"error\":%u}",
                         index == 0U ? "" : ",", (unsigned)session->tasks[index].id, state,
                         session->cycle_count, session->overrun_count,
                         session->tasks[index].interval_us, session->tasks[index].priority,
                         (unsigned)vm->pc, (unsigned)vm->sp, vm->halted != 0U ? "true" : "false",
                         (unsigned)vm->error) != 0) return format_failed(response, response_size);
    }
    if (append_jsonf(response, response_size, used, "],\"opi\":[") != 0) return format_failed(response, response_size);
    for (index = 0U; index < 8U; ++index) {
        if (append_jsonf(response, response_size, used, "%s%u",
                         index == 0U ? "" : ",", (unsigned)opi[index]) != 0) {
            return format_failed(response, response_size);
        }
    }
    if (append_jsonf(response, response_size, used, "],\"ipi\":[") != 0) {
        return format_failed(response, response_size);
    }
    for (index = 0U; index < 8U; ++index) {
        if (append_jsonf(response, response_size, used, "%s%u",
                         index == 0U ? "" : ",", (unsigned)ipi[index]) != 0) {
            return format_failed(response, response_size);
        }
    }
    if (append_jsonf(response, response_size, used, "],\"force_entries\":") != 0 ||
        append_force_entries(response, response_size, used) != 0 ||
        append_jsonf(response, response_size, used, "}") != 0) {
        return format_failed(response, response_size);
    }
    return 0;
}

static int format_status_result(const zplc_native_runtime_session_t *session,
                                char *response,
                                size_t response_size,
                                const char *id)
{
    size_t used = 0U;

    if (response == NULL || id == NULL || response_size == 0U) {
        return format_failed(response, response_size);
    }
    response[0] = '\0';
    if (append_jsonf(response, response_size, &used,
                     "{\"id\":\"%s\",\"type\":\"response\",\"result\":", id) != 0 ||
        append_status_payload(session, response, response_size, &used) != 0 ||
        append_jsonf(response, response_size, &used, "}") != 0) {
        return format_failed(response, response_size);
    }
    return (int)used;
}

static int format_status_event(const zplc_native_runtime_session_t *session,
                               char *event,
                               size_t event_size)
{
    size_t used = 0U;

    if (event == NULL || event_size == 0U) {
        return format_failed(event, event_size);
    }
    event[0] = '\0';
    if (append_jsonf(event, event_size, &used,
                     "{\"type\":\"event\",\"method\":\"status.changed\",\"params\":") != 0 ||
        append_status_payload(session, event, event_size, &used) != 0 ||
        append_jsonf(event, event_size, &used, "}") != 0) {
        return format_failed(event, event_size);
    }
    return (int)used;
}

static int format_error_response(const char *id,
                                 const char *code,
                                 const char *message,
                                 char *response,
                                 size_t response_size)
{
    return format_jsonf(response,
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
    return format_jsonf(
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
        "{\"name\":\"simulation-inputs\",\"status\":\"supported\"},"
        "{\"name\":\"tasks\",\"status\":\"degraded\","
        "\"reason\":\"POSIX host supports only homogeneous cyclic task sets; multi-rate, event, and Zephyr scheduling remain unavailable\","
        "\"recommended_action\":\"Use hardware session for authoritative multi-task scheduling\"}]}}}",
        request->id,
        ZPLC_NATIVE_PROTOCOL_VERSION,
        ZPLC_NATIVE_RUNTIME_KIND,
        zplc_core_version());
}

static int handle_program_load(zplc_native_runtime_session_t *session,
                               const zplc_native_request_t *request,
                               char *response,
                               size_t response_size)
{
    uint8_t *candidate;
    uint8_t *workspace;
    size_t program_size;
    zplc_native_program_details_t details;
    int commit_result;

    /* Loading is an IDLE-only replacement operation.  In particular, ERROR
     * remains latched until an explicit reset so unknown persistence cannot be
     * bypassed by another candidate. */
    if (session->state != ZPLC_NATIVE_SESSION_IDLE) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "program.load requires an idle runtime",
                                     response,
                                     response_size);
    }
    if (session->program_generation == UINT32_MAX) {
        return format_error_response(request->id, "GENERATION_EXHAUSTED",
                                     "program generation is exhausted; restart the session",
                                     response, response_size);
    }

    if (request->bytecode_hex[0] == '\0') {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "program.load requires bytecode_hex",
                                     response,
                                     response_size);
    }

    candidate = malloc(sizeof(session->program));
    if (candidate == NULL) {
        return format_error_response(request->id,
                                     "PROGRAM_LOAD_FAILED",
                                     "unable to allocate program staging buffer",
                                     response,
                                     response_size);
    }
    if (decode_hex_bytes(request->bytecode_hex,
                         candidate,
                         sizeof(session->program),
                         &program_size) != 0) {
        free(candidate);
        return format_error_response(request->id,
                                     "PROGRAM_LOAD_FAILED",
                                     "bytecode_hex is not valid uppercase/lowercase hex",
                                     response,
                                     response_size);
    }

    if (validate_program_artifact(candidate, program_size, &details) != 0) {
        free(candidate);
        return format_error_response(request->id,
                                     "PROGRAM_LOAD_FAILED",
                                     "failed to load program artifact",
                                     response,
                                     response_size);
    }

    /* Own every activation resource before active becomes authoritative. */
    workspace = (uint8_t *)malloc(ZPLC_LOADER_VERIFY_WORKSPACE_SIZE);
    if (workspace == NULL) {
        free(candidate);
        return format_error_response(request->id, "PROGRAM_LOAD_FAILED",
                                     "unable to allocate program verifier workspace",
                                     response, response_size);
    }

    commit_result = zplc_native_program_store_commit(candidate, program_size);
    if (commit_result == ZPLC_NATIVE_PROGRAM_STORE_COMMIT_UNKNOWN) {
        free(workspace);
        free(candidate);
        session_reset_program(session);
        session_apply_safe_state(session);
        return format_error_response(request->id,
                                     "COMMIT_UNKNOWN",
                                     "program publication durability is unknown; reset then load explicitly or restart",
                                     response,
                                     response_size);
    }
    if (commit_result != ZPLC_NATIVE_PROGRAM_STORE_OK) {
        free(workspace);
        free(candidate);
        return format_error_response(request->id,
                                     "PROGRAM_LOAD_FAILED",
                                     "program persistence commit failed",
                                     response,
                                     response_size);
    }

    if (load_program_artifact(session, candidate, program_size, &details, workspace,
                              ZPLC_LOADER_VERIFY_WORKSPACE_SIZE) != 0) {
        free(workspace);
        free(candidate);
        session_reset_program(session);
        session_apply_safe_state(session);
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "durable program could not be activated",
                                     response,
                                     response_size);
    }

    memcpy(session->program, candidate, program_size);
    free(workspace);
    free(candidate);
    session->program_loaded = 1U;
    session->program_size = (uint32_t)program_size;
    session->program_format = ZPLC_NATIVE_PROGRAM_ZPLC;
    session->program_generation += 1U;
    session->scan_interval_ms = details.scan_interval_ms;
    session->state = ZPLC_NATIVE_SESSION_IDLE;
    session->cycle_count = 0U;
    session->overrun_count = 0U;
    session->simulation_pulse_mask = 0U;
    session_reset_observed_cadence(session);
    session_reset_scenario_clock(session);
    if (zplc_pi_lock() != 0) {
        session_apply_safe_state(session);
        return format_error_response(request->id, "RUNTIME_FAILURE",
                                     "unable to clear process image for replacement",
                                     response, response_size);
    }
    {
        uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
        uint8_t *ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
        zplc_force_clear_all();
        if (opi != NULL) memset(opi, 0, ZPLC_MEM_OPI_SIZE);
        if (ipi != NULL) memset(ipi, 0, ZPLC_MEM_IPI_SIZE);
    }
    zplc_pi_unlock();

    return format_jsonf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{"
                    "\"program_size\":%u,\"program_generation\":%u}}",
                    request->id,
                    (unsigned)program_size, (unsigned)session->program_generation);
}

static int handle_simulation_input_set(zplc_native_runtime_session_t *session,
                                       const zplc_native_request_t *request,
                                       char *response, size_t response_size)
{
    uint8_t bit;
    uint8_t *ipi;

    if (request->has_active == 0U || request->has_program_generation == 0U ||
        request->program_generation == 0U || request->input_id[0] == '\0') {
        return format_error_response(request->id, "INVALID_REQUEST",
                                     "simulation.input.set requires input_id, active, and program_generation",
                                     response, response_size);
    }
    if (strcmp(request->input_id, "motor.start") == 0) bit = 0U;
    else if (strcmp(request->input_id, "motor.stop") == 0) bit = 1U;
    else if (strcmp(request->input_id, "motor.estop") == 0) bit = 2U;
    else return format_error_response(request->id, "INVALID_REQUEST", "unknown simulation input", response, response_size);
    if (session->program_loaded == 0U ||
        (session->state != ZPLC_NATIVE_SESSION_RUNNING && session->state != ZPLC_NATIVE_SESSION_PAUSED)) {
        return format_error_response(request->id, "INVALID_STATE", "simulation input requires a running or paused program", response, response_size);
    }
    if (request->program_generation != session->program_generation) {
        return format_error_response(request->id, "STALE_PROGRAM", "simulation input program generation does not match", response, response_size);
    }
    if (zplc_pi_lock() != 0) {
        return format_error_response(request->id, "RUNTIME_FAILURE", "unable to lock process image", response, response_size);
    }
    if (zplc_force_get_count() != 0U || (ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE)) == NULL) {
        zplc_pi_unlock();
        return format_error_response(request->id, zplc_force_get_count() != 0U ? "FORCE_ACTIVE" : "RUNTIME_FAILURE",
                                     zplc_force_get_count() != 0U ? "simulation input rejected while forces are active" : "input process image is unavailable", response, response_size);
    }
    if (request->active != 0U) {
        ipi[0] |= (uint8_t)(1U << bit);
        if (bit < 2U) session->simulation_pulse_mask |= (uint8_t)(1U << bit);
    } else {
        ipi[0] &= (uint8_t)~(uint8_t)(1U << bit);
        if (bit < 2U) session->simulation_pulse_mask &= (uint8_t)~(uint8_t)(1U << bit);
    }
    zplc_pi_unlock();
    return format_jsonf(response, response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{"
                    "\"input_id\":\"%s\",\"active\":%s,\"program_generation\":%u,"
                    "\"cycle_count_at_apply\":%u,\"state\":\"staged\"}}",
                    request->id, request->input_id, request->active != 0U ? "true" : "false",
                    (unsigned)session->program_generation, (unsigned)session->cycle_count);
}

static int handle_start(zplc_native_runtime_session_t *session,
                        const zplc_native_request_t *request,
                        char *response,
                        size_t response_size)
{
    if (session->scenario_clock_enabled != 0U) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "scenario session only accepts scenario.step",
                                     response, response_size);
    }
    if (session->program_loaded == 0U) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "program not loaded",
                                     response,
                                     response_size);
    }

    if (session->state == ZPLC_NATIVE_SESSION_ERROR) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "runtime is faulted; reset before start",
                                     response,
                                     response_size);
    }

    if (session->state != ZPLC_NATIVE_SESSION_IDLE) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "runtime is not idle; stop or reset before start",
                                     response,
                                     response_size);
    }

    if (session_resume_tasks(session) != 0) return format_error_response(request->id, "RUNTIME_FAILURE", "failed to resume task before start", response, response_size);

    session->timed_scan_started = 0U;
    session->last_dispatch_lateness_ms = 0U;
    session->state = ZPLC_NATIVE_SESSION_RUNNING;
    return format_jsonf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{}}",
                    request->id);
}

static int handle_pause(zplc_native_runtime_session_t *session,
                        const zplc_native_request_t *request,
                        char *response,
                        size_t response_size)
{
    if (session->program_loaded == 0U) {
        return format_error_response(request->id, "INVALID_STATE", "program not loaded",
                                     response, response_size);
    }
    if (session->state == ZPLC_NATIVE_SESSION_ERROR) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "runtime is faulted; reset before pause",
                                     response, response_size);
    }
    if (session->state != ZPLC_NATIVE_SESSION_RUNNING) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "runtime is not running; start before pause",
                                     response, response_size);
    }

    session->state = ZPLC_NATIVE_SESSION_PAUSED;
    return format_jsonf(response, response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{}}",
                    request->id);
}

static int handle_resume(zplc_native_runtime_session_t *session,
                         const zplc_native_request_t *request,
                         char *response,
                         size_t response_size)
{
    if (session->scenario_clock_enabled != 0U) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "scenario session only accepts scenario.step",
                                     response, response_size);
    }
    if (session->program_loaded == 0U) {
        return format_error_response(request->id, "INVALID_STATE", "program not loaded",
                                     response, response_size);
    }
    if (session->state == ZPLC_NATIVE_SESSION_ERROR) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "runtime is faulted; reset before resume",
                                     response, response_size);
    }
    if (session->state != ZPLC_NATIVE_SESSION_PAUSED) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "runtime is not paused; pause before resume",
                                     response, response_size);
    }

    if (session_resume_tasks(session) != 0) return format_error_response(request->id, "RUNTIME_FAILURE", "failed to resume task before resume", response, response_size);
    session->timed_scan_started = 0U;
    session->last_dispatch_lateness_ms = 0U;
    session->state = ZPLC_NATIVE_SESSION_RUNNING;
    return format_jsonf(response, response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{}}",
                    request->id);
}

static int handle_stop_or_reset(zplc_native_runtime_session_t *session,
                                const zplc_native_request_t *request,
                                char *response,
                                size_t response_size,
                                int reset_program)
{
    if (reset_program != 0 && session->program_loaded != 0U) {
        zplc_native_program_details_t details;
        uint8_t *workspace;
        if (session->program_generation == UINT32_MAX) {
            session_reset_program(session);
            session_apply_safe_state(session);
            return format_error_response(request->id, "GENERATION_EXHAUSTED",
                                         "program generation is exhausted; restart the session",
                                         response, response_size);
        }
        if (validate_program_artifact(session->program, session->program_size,
                                      &details) != 0) {
            session_apply_safe_state(session);
            return format_error_response(request->id,
                                         "RUNTIME_FAILURE",
                                         "failed to reset loaded program",
                                         response,
                                         response_size);
        }
        workspace = (uint8_t *)malloc(ZPLC_LOADER_VERIFY_WORKSPACE_SIZE);
        if (workspace == NULL ||
            load_program_artifact(session, session->program, session->program_size, &details, workspace,
                                  ZPLC_LOADER_VERIFY_WORKSPACE_SIZE) != 0) {
            free(workspace);
            session_apply_safe_state(session);
            return format_error_response(request->id,
                                         "RUNTIME_FAILURE",
                                         "failed to reset loaded program",
                                         response,
                                         response_size);
        }
        free(workspace);
        session->scan_interval_ms = details.scan_interval_ms;
        session->cycle_count = 0U;
        session->overrun_count = 0U;
        session->program_generation += 1U;
        session_reset_scenario_clock(session);
    }
    if (reset_program != 0) {
        session_reset_observed_cadence(session);
    }

    zplc_force_clear_all();
    session->simulation_pulse_mask = 0U;
    {
        uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
        uint8_t *ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
        if (opi != NULL) {
            memset(opi, 0, ZPLC_MEM_OPI_SIZE);
        }
        if (ipi != NULL) {
            memset(ipi, 0, ZPLC_MEM_IPI_SIZE);
        }
    }
    if (reset_program != 0 || session->state != ZPLC_NATIVE_SESSION_ERROR) {
        session->state = ZPLC_NATIVE_SESSION_IDLE;
    }

    return format_jsonf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{\"program_generation\":%u}}",
                    request->id, (unsigned)session->program_generation);
}

static int handle_step(zplc_native_runtime_session_t *session,
                       const zplc_native_request_t *request,
                       char *response,
                       size_t response_size,
                       char *event,
                       size_t event_size)
{
    int run_result;

    if (session->scenario_clock_enabled != 0U) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "scenario session only accepts scenario.step",
                                     response, response_size);
    }

    if (session->program_loaded == 0U) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "program not loaded",
                                     response,
                                     response_size);
    }

    if (session->state == ZPLC_NATIVE_SESSION_ERROR) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "runtime is faulted; reset before step",
                                     response,
                                     response_size);
    }

    if (session->state == ZPLC_NATIVE_SESSION_RUNNING) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "runtime is running; pause before step",
                                     response,
                                     response_size);
    }
    if (session->state != ZPLC_NATIVE_SESSION_IDLE &&
        session->state != ZPLC_NATIVE_SESSION_PAUSED) {
        return format_error_response(request->id,
                                     "INVALID_STATE",
                                     "runtime is not idle or paused; reset before step",
                                     response,
                                     response_size);
    }

    if (session_resume_tasks(session) != 0) {
        session_apply_safe_state(session);
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "failed to resume paused vm before step",
                                     response,
                                     response_size);
    }

    run_result = session_dispatch_tasks(session);
    if (run_result < 0) {
        session_apply_safe_state(session);
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "zplc_core_run_cycle failed",
                                     response,
                                     response_size);
    }

    if (session_clear_simulation_pulses(session) != 0) {
        session_apply_safe_state(session);
        return format_error_response(request->id, "RUNTIME_FAILURE",
                                     "failed to clear simulation input pulse",
                                     response, response_size);
    }

    session->cycle_count += 1U;
    session->state = ZPLC_NATIVE_SESSION_PAUSED;

    if (event != NULL && event_size > 0U) {
        (void)format_jsonf(event,
                       event_size,
                       "{\"type\":\"event\",\"method\":\"step.completed\",\"params\":{"
                       "\"pc\":%u}}",
                       (unsigned)session_focused_vm(session)->pc);
    }

    return format_status_result(session, response, response_size, request->id);
}

static int handle_scenario_step(zplc_native_runtime_session_t *session,
                                const zplc_native_request_t *request,
                                char *response,
                                size_t response_size,
                                char *event,
                                size_t event_size)
{
    int run_result;
    uint32_t expected_at_ms;

    if (session->scenario_clock_enabled == 0U) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "scenario.step is unavailable for this session",
                                     response, response_size);
    }
    if (request->at_ms_state != ZPLC_NATIVE_FIELD_VALID) {
        return format_error_response(request->id, "INVALID_REQUEST",
                                     "scenario.step requires at_ms", response, response_size);
    }
    if (session->program_loaded == 0U) {
        return format_error_response(request->id, "INVALID_STATE", "program not loaded",
                                     response, response_size);
    }
    if (session->state == ZPLC_NATIVE_SESSION_ERROR) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "runtime is faulted; reset before step", response, response_size);
    }
    if (session->state != ZPLC_NATIVE_SESSION_IDLE && session->state != ZPLC_NATIVE_SESSION_PAUSED) {
        return format_error_response(request->id, "INVALID_STATE",
                                     "runtime is not idle or paused; reset before step", response, response_size);
    }
    if (session->scenario_timestamp_started == 0U) {
        if (request->at_ms != 0U) {
            return format_error_response(request->id, "INVALID_REQUEST",
                                         "first scenario at_ms must be 0", response, response_size);
        }
    } else {
        if (session->scan_interval_ms == 0U ||
            session->scenario_last_timestamp_ms > UINT32_MAX - session->scan_interval_ms) {
            return format_error_response(request->id, "INVALID_STATE",
                                         "scenario timestamp cannot advance safely", response, response_size);
        }
        expected_at_ms = session->scenario_last_timestamp_ms + session->scan_interval_ms;
        if (request->at_ms != expected_at_ms) {
            return format_error_response(request->id, "INVALID_REQUEST",
                                         "scenario at_ms must advance by the task interval", response, response_size);
        }
    }

    if (session_resume_tasks(session) != 0) {
        session_apply_safe_state(session);
        return format_error_response(request->id, "RUNTIME_FAILURE",
                                     "failed to resume paused vm before step", response, response_size);
    }

    zplc_hal_posix_set_tick_override(request->at_ms);
    run_result = session_dispatch_tasks(session);
    zplc_hal_posix_clear_tick_override();
    if (run_result < 0) {
        session_apply_safe_state(session);
        return format_error_response(request->id, "RUNTIME_FAILURE",
                                     "zplc_core_run_cycle failed", response, response_size);
    }
    if (session_clear_simulation_pulses(session) != 0) {
        session_apply_safe_state(session);
        return format_error_response(request->id, "RUNTIME_FAILURE",
                                     "failed to clear simulation input pulse", response, response_size);
    }

    session->scenario_timestamp_started = 1U;
    session->scenario_last_timestamp_ms = request->at_ms;
    session->last_scan_tick_ms = request->at_ms;
    session->cycle_count += 1U;
    session->state = ZPLC_NATIVE_SESSION_PAUSED;
    if (event != NULL && event_size > 0U) {
        (void)format_jsonf(event, event_size,
                       "{\"type\":\"event\",\"method\":\"step.completed\",\"params\":{\"pc\":%u}}",
                       (unsigned)session_focused_vm(session)->pc);
    }
    return format_status_result(session, response, response_size, request->id);
}

static int handle_memory_read(const zplc_native_request_t *request,
                              char *response,
                              size_t response_size)
{
    uint8_t bytes[64];
    char bytes_hex[129];
    uint16_t address;

    if (request->address_state != ZPLC_NATIVE_FIELD_VALID ||
        request->length_state != ZPLC_NATIVE_FIELD_VALID ||
        request->length == 0U || request->length > sizeof(bytes)) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.read length must be between 1 and 64",
                                     response,
                                     response_size);
    }

    if (narrow_uint16(request->address, &address) != 0) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.read address must fit uint16",
                                     response,
                                     response_size);
    }

    if (read_memory_bytes(address,
                          (uint16_t)request->length,
                          bytes) != 0 ||
        encode_hex_bytes(bytes, request->length, bytes_hex, sizeof(bytes_hex)) != 0) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.read address range is invalid",
                                     response,
                                     response_size);
    }

    return format_jsonf(response,
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
    uint16_t address;

    if (request->bytecode_hex[0] == '\0') {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.write requires bytes_hex",
                                     response,
                                     response_size);
    }

    if (request->address_state != ZPLC_NATIVE_FIELD_VALID) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.write address must be a uint32",
                                     response,
                                     response_size);
    }

    if (decode_hex_bytes(request->bytecode_hex, bytes, sizeof(bytes), &bytes_length) != 0 ||
        narrow_uint16(request->address, &address) != 0 ||
        zplc_force_write_bytes(address, bytes, (uint16_t)bytes_length) != 0) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "memory.write address or bytes are invalid",
                                     response,
                                     response_size);
    }

    return format_jsonf(response,
                    response_size,
                    "{\"id\":\"%s\",\"type\":\"response\",\"result\":{}}",
                    request->id);
}

static int handle_breakpoint_add(const zplc_native_request_t *request,
                                 char *response,
                                 size_t response_size)
{
    zplc_vm_t *vm = zplc_core_get_default_vm();
    uint16_t pc;

    if (request->pc_state != ZPLC_NATIVE_FIELD_VALID || narrow_uint16(request->pc, &pc) != 0) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "breakpoint.add pc must fit uint16",
                                     response,
                                     response_size);
    }

    if (zplc_vm_add_breakpoint(vm, pc) < 0) {
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
    uint16_t pc;

    if (request->pc_state != ZPLC_NATIVE_FIELD_VALID || narrow_uint16(request->pc, &pc) != 0) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "breakpoint.remove pc must fit uint16",
                                     response,
                                     response_size);
    }

    if (zplc_vm_remove_breakpoint(vm, pc) < 0) {
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
    uint8_t bytes[ZPLC_FORCE_MAX_BYTES];
    size_t bytes_length;
    uint16_t address;

    if (decode_hex_bytes(request->bytecode_hex, bytes, sizeof(bytes), &bytes_length) != 0) {
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "force.set failed",
                                     response,
                                     response_size);
    }

    if (request->address_state != ZPLC_NATIVE_FIELD_VALID ||
        narrow_uint16(request->address, &address) != 0) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "force.set address must fit uint16",
                                     response,
                                     response_size);
    }

    if (zplc_force_set_bytes(address, bytes, (uint16_t)bytes_length) != 0) {
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
    uint16_t address;

    if (request->address_state != ZPLC_NATIVE_FIELD_VALID ||
        narrow_uint16(request->address, &address) != 0) {
        return format_error_response(request->id,
                                     "INVALID_REQUEST",
                                     "force.clear address must fit uint16",
                                     response,
                                     response_size);
    }

    if (zplc_force_clear(address) != 0) {
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
    size_t saved_len = 0U;
    uint8_t *workspace;

    if (session == NULL) {
        return;
    }

    memset(session, 0, sizeof(*session));
    zplc_hal_posix_clear_tick_override();
    session->state = ZPLC_NATIVE_SESSION_IDLE;
    session->scan_interval_ms = 100U;
    zplc_core_init();

    if (zplc_native_program_store_restore(session->program, sizeof(session->program),
                                          &saved_len) == 0) {
        zplc_native_program_details_t details;
        workspace = (uint8_t *)malloc(ZPLC_LOADER_VERIFY_WORKSPACE_SIZE);
        if (workspace != NULL &&
            validate_program_artifact(session->program, saved_len, &details) == 0 &&
            load_program_artifact(session, session->program, saved_len, &details, workspace,
                                  ZPLC_LOADER_VERIFY_WORKSPACE_SIZE) == 0) {
            session->program_loaded = 1U;
            session->program_size = (uint32_t)saved_len;
            session->program_format = ZPLC_NATIVE_PROGRAM_ZPLC;
            session->scan_interval_ms = details.scan_interval_ms;
            session->program_generation = 1U;
        } else {
            session_reset_program(session);
        }
        free(workspace);
    }
}

void zplc_native_runtime_session_set_scenario_clock_enabled(
    zplc_native_runtime_session_t *session,
    int enabled)
{
    if (session == NULL) return;
    session->scenario_clock_enabled = enabled != 0 ? 1U : 0U;
    session_reset_scenario_clock(session);
}

void zplc_native_runtime_session_shutdown(zplc_native_runtime_session_t *session)
{
    if (session == NULL) {
        return;
    }

    zplc_force_clear_all();
    zplc_hal_posix_clear_tick_override();
    {
        uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
        uint8_t *ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
        if (opi != NULL) {
            memset(opi, 0, ZPLC_MEM_OPI_SIZE);
        }
        if (ipi != NULL) {
            memset(ipi, 0, ZPLC_MEM_IPI_SIZE);
        }
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

    if (parse_canonical_request(request_line, &request) != 0) {
        return format_error_response("unknown",
                                     "INVALID_REQUEST",
                                     "unable to parse request envelope",
                                     response,
                                     response_size);
    }

    if (strcmp(request.method, "session.hello") == 0) {
        return handle_session_hello(&request, response, response_size);
    }

    if (session->task_count > 1U && strncmp(request.method, "breakpoint.", 11U) == 0) {
        return format_error_response(request.id, "INVALID_STATE",
                                     "breakpoint operation requires an unambiguous task", response,
                                     response_size);
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
        return handle_pause(session, &request, response, response_size);
    }

    if (strcmp(request.method, "execution.resume") == 0) {
        return handle_resume(session, &request, response, response_size);
    }

    if (strcmp(request.method, "execution.step") == 0) {
        return handle_step(session,
                           &request,
                           response,
                           response_size,
                           event,
                           event_size);
    }

    if (strcmp(request.method, "scenario.step") == 0) {
        return handle_scenario_step(session, &request, response, response_size, event, event_size);
    }

    if (strcmp(request.method, "status.get") == 0) {
        return format_status_result(session, response, response_size, request.id);
    }

    if (strcmp(request.method, "simulation.input.set") == 0) {
        return handle_simulation_input_set(session, &request, response, response_size);
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
        return format_jsonf(response,
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
    uint32_t elapsed_ms;
    uint32_t missed_intervals;

    if (session == NULL) {
        return -1;
    }

    if (event != NULL && event_size > 0U) {
        event[0] = '\0';
    }

    if (session->state != ZPLC_NATIVE_SESSION_RUNNING || session->program_loaded == 0U) {
        return 0;
    }

    elapsed_ms = now_ms - session->last_scan_tick_ms;
    if (elapsed_ms < session->scan_interval_ms) {
        return 0;
    }

    if (session->timed_scan_started != 0U && session->scan_interval_ms != 0U) {
        missed_intervals = (elapsed_ms / session->scan_interval_ms) - 1U;
        if (missed_intervals > UINT32_MAX - session->missed_interval_count) {
            session->missed_interval_count = UINT32_MAX;
        } else {
            session->missed_interval_count += missed_intervals;
        }
        session->last_dispatch_lateness_ms = elapsed_ms - session->scan_interval_ms;
    } else {
        session->last_dispatch_lateness_ms = 0U;
    }
    session->timed_scan_started = 1U;

    run_result = session_dispatch_tasks(session);
    session->last_scan_tick_ms = now_ms;
    if (run_result < 0) {
        session_apply_safe_state(session);
        if (event != NULL && event_size > 0U) {
            (void)format_jsonf(event,
                           event_size,
                           "{\"type\":\"event\",\"method\":\"runtime.error\",\"params\":{"
                           "\"code\":\"RUNTIME_FAILURE\","
                           "\"message\":\"zplc_core_run_cycle failed\"}}");
        }
        return ZPLC_NATIVE_RESPONSE_ERR_INVALID_STATE;
    }

    if (session_clear_simulation_pulses(session) != 0) {
        session_apply_safe_state(session);
        if (event != NULL && event_size > 0U) {
            (void)format_jsonf(event, event_size,
                           "{\"type\":\"event\",\"method\":\"runtime.error\",\"params\":{"
                           "\"code\":\"RUNTIME_FAILURE\","
                           "\"message\":\"failed to clear simulation input pulse\"}}");
        }
        return ZPLC_NATIVE_RESPONSE_ERR_INVALID_STATE;
    }

    if (run_result > 0) {
        session->cycle_count += 1U;
    }

    if (session_focused_vm(session)->paused != 0U) {
        session->state = ZPLC_NATIVE_SESSION_PAUSED;
    }

    if (event != NULL && event_size > 0U &&
        format_status_event(session, event, event_size) < 0) {
        return -1;
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
