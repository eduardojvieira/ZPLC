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
#include <zplc_fw_identity.h>
#include <zplc_hal.h>
#include <zplc_hal_posix.h>
#include <zplc_isa.h>
#include <zplc_retain.h>
#include <zplc_scheduler.h>

#define ZPLC_NATIVE_PROTOCOL_VERSION "1.0"
#define ZPLC_NATIVE_RUNTIME_KIND "native-posix"
#define ZPLC_NATIVE_RESPONSE_ERR_INVALID_REQUEST (-10)
#define ZPLC_NATIVE_RESPONSE_ERR_PROGRAM_LOAD (-11)
#define ZPLC_NATIVE_RESPONSE_ERR_INVALID_STATE (-12)
#define ZPLC_NATIVE_FIELD_ABSENT 0U
#define ZPLC_NATIVE_FIELD_VALID 1U
#define ZPLC_NATIVE_FIELD_INVALID 2U

/* RETAIN persistence (RT-025 to RT-027). The interval is the minimum time between
 * periodic saves; 0 turns them off, so only STOP, reset and shutdown save. */
#define ZPLC_NATIVE_RETAIN_INTERVAL_ENV "ZPLC_RETAIN_SAVE_INTERVAL_MS"
#define ZPLC_NATIVE_RETAIN_DEFAULT_INTERVAL_MS 30000UL
#define ZPLC_NATIVE_RETAIN_MIN_INTERVAL_MS 100UL
#define ZPLC_NATIVE_RETAIN_MAX_INTERVAL_MS 86400000UL

/* RT-014: consecutive deadline misses of one task that latch the fault. The default is the one of the scheduler
 * core, and so of the firmware: one late activation is a warning, not a stopped machine. One latches at the first
 * miss; a higher value lets a program run on with the warning raised longer. */
#define ZPLC_NATIVE_DEADLINE_LIMIT_ENV "ZPLC_DEADLINE_MISS_LIMIT"
#define ZPLC_NATIVE_DEADLINE_DEFAULT_LIMIT ((unsigned long)ZPLC_SCHED_DEFAULT_MISS_LIMIT)
#define ZPLC_NATIVE_DEADLINE_MAX_LIMIT 1000000UL

/* What a dispatch returns when a deadline miss reached the limit: below zero like a VM failure, so that every
 * caller drives the outputs safe, and told apart from it by session->fault_reason. */
#define ZPLC_NATIVE_DISPATCH_DEADLINE_FAULT (-1000)
#define ZPLC_NATIVE_ALL_TASKS 0xFFFFFFFFU


typedef struct {
    char id[64];
    char method[64];
    char bytecode_hex[(ZPLC_MEM_CODE_SIZE * 2U) + 1U];
    /* program.load only: the hex string's length as sent, kept when it is too long for bytecode_hex. */
    size_t bytecode_hex_length;
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

static int retain_lock(void)
{
    return zplc_pi_lock();
}

static void retain_unlock(void)
{
    zplc_pi_unlock();
}

static uint32_t retain_interval_ms(void)
{
    const char *text = getenv(ZPLC_NATIVE_RETAIN_INTERVAL_ENV);
    char *end = NULL;
    unsigned long value;

    if (text == NULL || text[0] == '\0') {
        return (uint32_t)ZPLC_NATIVE_RETAIN_DEFAULT_INTERVAL_MS;
    }
    value = strtoul(text, &end, 10);
    if (end == text || *end != '\0' ||
        (value != 0UL && value < ZPLC_NATIVE_RETAIN_MIN_INTERVAL_MS) ||
        value > ZPLC_NATIVE_RETAIN_MAX_INTERVAL_MS) {
        (void)fprintf(stderr,
                      "[native-sim] ignoring %s=%s: use 0 or %lu..%lu milliseconds\n",
                      ZPLC_NATIVE_RETAIN_INTERVAL_ENV, text,
                      ZPLC_NATIVE_RETAIN_MIN_INTERVAL_MS, ZPLC_NATIVE_RETAIN_MAX_INTERVAL_MS);
        return (uint32_t)ZPLC_NATIVE_RETAIN_DEFAULT_INTERVAL_MS;
    }
    return (uint32_t)value;
}

static uint32_t deadline_miss_limit(void)
{
    const char *text = getenv(ZPLC_NATIVE_DEADLINE_LIMIT_ENV);
    char *end = NULL;
    unsigned long value;

    if (text == NULL || text[0] == '\0') {
        return (uint32_t)ZPLC_NATIVE_DEADLINE_DEFAULT_LIMIT;
    }
    value = strtoul(text, &end, 10);
    if (end == text || *end != '\0' || value < 1UL || value > ZPLC_NATIVE_DEADLINE_MAX_LIMIT) {
        (void)fprintf(stderr, "[native-sim] ignoring %s=%s: use 1..%lu consecutive misses\n",
                      ZPLC_NATIVE_DEADLINE_LIMIT_ENV, text, ZPLC_NATIVE_DEADLINE_MAX_LIMIT);
        return (uint32_t)ZPLC_NATIVE_DEADLINE_DEFAULT_LIMIT;
    }
    return (uint32_t)value;
}

static void session_retain_configure(void)
{
    zplc_retain_config_t config;

    memset(&config, 0, sizeof(config));
    config.region = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    config.region_size = ZPLC_MEM_RETAIN_SIZE;
    config.lock = retain_lock;
    config.unlock = retain_unlock;
    config.min_interval_ms = retain_interval_ms();
    (void)zplc_retain_init(&config);
}

/* The program is loaded (the core zeroed its memory): bring back its values, or
 * leave the region initialised and let the status say why. */
static void session_retain_restore(const uint8_t *artifact, size_t size)
{
    zplc_retain_identity_t identity;

    if (zplc_retain_identity_from_artifact(artifact, size, &identity) == 0) {
        (void)zplc_retain_restore(&identity, zplc_hal_tick());
    }
}

static void session_retain_save(const zplc_native_runtime_session_t *session, uint32_t now_ms,
                                zplc_retain_save_mode_t mode)
{
    zplc_retain_identity_t identity;

    if (session->program_loaded != 0U &&
        zplc_retain_identity_from_artifact(session->program, session->program_size, &identity) == 0) {
        (void)zplc_retain_save(&identity, now_ms, mode);
    }
}

static void session_retain_cold_reset(const zplc_native_runtime_session_t *session)
{
    zplc_retain_identity_t identity;

    if (session->program_loaded != 0U &&
        zplc_retain_identity_from_artifact(session->program, session->program_size, &identity) == 0) {
        (void)zplc_retain_cold_reset(&identity, zplc_hal_tick());
    }
}

/* The counts of a run: scans of the session and of each task, deadline misses and a latched fault. */
static void session_reset_counters(zplc_native_runtime_session_t *session)
{
    session->cycle_count = 0U;
    session->overrun_count = 0U;
    session->last_overrun_us = 0U;
    session->fault_reason = ZPLC_NATIVE_FAULT_NONE;
    session->fault_task_id = 0U;
    memset(session->task_cycles, 0, sizeof(session->task_cycles));
    memset(session->task_misses, 0, sizeof(session->task_misses));
    memset(session->task_consecutive_misses, 0, sizeof(session->task_consecutive_misses));
    memset(session->task_next_release_ms, 0, sizeof(session->task_next_release_ms));
    zplc_sched_core_reset_counters(&session->core);
}

static void session_reset_program(zplc_native_runtime_session_t *session)
{
    session->program_loaded = 0U;
    session_reset_counters(session);
    session->multirate = 0U;
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
        if (session->fault_reason == ZPLC_NATIVE_FAULT_NONE) {
            session->fault_reason = ZPLC_NATIVE_FAULT_RUNTIME;
        }
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

static int load_program_tasks(zplc_native_runtime_session_t *session,
                              const uint8_t *program, size_t program_size,
                              const zplc_native_program_details_t *details,
                              uint8_t *workspace, size_t workspace_size)
{
    int count;
    uint8_t index;
    uint32_t code_size;

    if (session == NULL || details == NULL || workspace == NULL ||
        workspace_size < ZPLC_LOADER_VERIFY_WORKSPACE_SIZE) return -1;
    session->multirate = details->multirate;
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
    /* zplc_core_load_tasks() is a cold start (RT-016): the same replacement semantics as zplc_core_load(). */
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

/* The tasks of the program the session activated are the tasks of the scheduler core. */
static int load_program_artifact(zplc_native_runtime_session_t *session,
                                 const uint8_t *program, size_t program_size,
                                 const zplc_native_program_details_t *details,
                                 uint8_t *workspace, size_t workspace_size)
{
    uint8_t index;

    if (load_program_tasks(session, program, program_size, details, workspace, workspace_size) != 0) return -1;
    zplc_sched_core_init(&session->core, session->core_slots, ZPLC_LOADER_MAX_TASKS, session->deadline_miss_limit);
    /* A debugger reads a task that ended its scan: its VM stays as the last instruction left it. */
    session->core.keep_halted_vm = 1U;
    for (index = 0U; index < session->task_count; ++index) {
        zplc_vm_t *vm = session->task_count > 1U ? &session->task_vms[index] : zplc_core_get_default_vm();

        if (zplc_sched_core_add_task(&session->core, &session->tasks[index], vm) != (int)index) return -1;
    }
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

/* The tasks of one batch, in the order they run. */
typedef struct {
    uint8_t index[ZPLC_LOADER_MAX_TASKS];
    uint8_t count;
} session_batch_t;

static uint32_t session_clock_ms(const zplc_native_runtime_session_t *session)
{
    return session->clock_ms != NULL ? session->clock_ms() : zplc_hal_tick();
}

static uint32_t session_task_interval_ms(const zplc_native_runtime_session_t *session, uint8_t index)
{
    return session->tasks[index].interval_us / 1000U;
}

/* How long ago the next release of a task was due; negative while it is still ahead (32-bit milliseconds). */
static int32_t session_overdue_ms(const zplc_native_runtime_session_t *session, uint8_t index, uint32_t now_ms)
{
    return (int32_t)(now_ms - session->task_next_release_ms[index]);
}

/* RT-015: the tasks whose release is due. The first scan after a start or a resume releases every task: a common
 * start. After it each task keeps the grid of its own interval. */
static uint32_t session_due_tasks(const zplc_native_runtime_session_t *session, uint32_t now_ms,
                                  int first_release)
{
    uint32_t due = 0U;
    uint8_t index;

    for (index = 0U; index < session->task_count; ++index) {
        if (first_release != 0 || session_overdue_ms(session, index, now_ms) >= 0) {
            due |= (uint32_t)1U << index;
        }
    }
    return due;
}

/* The order of a batch is the one of the target scheduler, because it is the same code: the task released earlier
 * first, then the lower priority number, then the lower task id. The session says when each due task was released:
 * the instant the host dispatches it, or, when the host was late for a task of its own interval, the grid point it
 * was due at, so that the task that waited longer runs first. */
static void session_plan_batch(zplc_native_runtime_session_t *session, uint32_t due, uint32_t now_ms,
                               int first_release, session_batch_t *batch)
{
    uint8_t index;

    session->core.slot = session->core_slots;
    session->core.miss_limit = session->deadline_miss_limit != 0U ? session->deadline_miss_limit : 1U;
    (void)zplc_sched_core_set_running(&session->core);
    for (index = 0U; index < session->task_count; ++index) {
        uint64_t release_us = (uint64_t)now_ms * 1000U;

        if ((due & ((uint32_t)1U << index)) == 0U) {
            continue;
        }
        if (session->multirate != 0U && first_release == 0) {
            release_us -= (uint64_t)(uint32_t)session_overdue_ms(session, index, now_ms) * 1000U;
        }
        /* The host has no timer: a scan's deadline counts from the instant the batch starts. */
        (void)zplc_sched_core_admit(&session->core, (int)index, release_us, ZPLC_SCHED_REF_BATCH_START);
    }
    batch->count = zplc_sched_core_collect(&session->core, batch->index, ZPLC_LOADER_MAX_TASKS);
}

/* The batch was dispatched at now_ms. A task's next release is its next grid point after now_ms: releases the host
 * was too late for are skipped, not run in a burst. */
static void session_mark_released(zplc_native_runtime_session_t *session, const session_batch_t *batch,
                                  uint32_t now_ms, int first_release)
{
    uint8_t position;

    for (position = 0U; position < batch->count; ++position) {
        const uint8_t index = batch->index[position];
        const uint32_t interval_ms = session_task_interval_ms(session, index);

        if (first_release != 0) {
            session->task_next_release_ms[index] = now_ms + interval_ms;
        } else {
            const uint32_t late_ms = (uint32_t)session_overdue_ms(session, index, now_ms);

            session->task_next_release_ms[index] += (late_ms / interval_ms + 1U) * interval_ms;
        }
    }
}

/* The host has no pins and no locks: what the core needs of the platform is a clock and the safe state of the image. */
static uint64_t session_port_now_us(void *ctx)
{
    return (uint64_t)session_clock_ms((const zplc_native_runtime_session_t *)ctx) * 1000U;
}

static int session_port_reset_image(void *ctx)
{
    uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    uint8_t *ipi = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);

    (void)ctx;
    zplc_force_clear_all();
    if (opi != NULL) memset(opi, 0, ZPLC_MEM_OPI_SIZE);
    if (ipi != NULL) memset(ipi, 0, ZPLC_MEM_IPI_SIZE);
    return 0;
}

static zplc_native_fault_reason_t session_fault_reason_of(uint8_t reason)
{
    switch ((zplc_sched_fault_reason_t)reason) {
        case ZPLC_SCHED_FAULT_NONE: return ZPLC_NATIVE_FAULT_NONE;
        case ZPLC_SCHED_FAULT_DEADLINE_MISS: return ZPLC_NATIVE_FAULT_DEADLINE_MISS;
        case ZPLC_SCHED_FAULT_VM: return ZPLC_NATIVE_FAULT_VM;
        default: return ZPLC_NATIVE_FAULT_RUNTIME;
    }
}

/* What the status reports follows the core: the misses of each task, the run of them, the last overrun, and the fault. */
static void session_follow_core(zplc_native_runtime_session_t *session)
{
    uint8_t index;

    session->overrun_count = zplc_sched_core_total_misses(&session->core);
    session->last_overrun_us = session->core.last_overrun_us;
    for (index = 0U; index < session->task_count; ++index) {
        session->task_misses[index] = session->core_slots[index].task.stats.overrun_count;
        session->task_consecutive_misses[index] = session->core_slots[index].consecutive_misses;
    }
    if (session->core.fault_latched != 0U) {
        session->fault_reason = session_fault_reason_of(session->core.fault_reason);
        session->fault_task_id = session->core.fault_task_id;
    }
}

/* Runs the tasks of a batch one after the other, to completion: no task preempts another. The input image does not
 * change while they run (requests and ticks share one thread), which is the latch of RT-009, and the output image
 * is the process image itself, so a task that is not in the batch keeps what it wrote. Returns below zero when a task
 * failed or a deadline miss latched the fault; a debugger step (@p step_mode) has no deadline (RT-017). */
static int session_run_batch(zplc_native_runtime_session_t *session, const session_batch_t *batch, int step_mode)
{
    zplc_sched_port_t port;
    zplc_sched_scan_report_t report;
    int result;

    memset(&port, 0, sizeof(port));
    port.ctx = session;
    port.now_us = session_port_now_us;
    port.reset_image = session_port_reset_image;
    result = zplc_sched_core_scan(&session->core, &port, batch->index, batch->count, step_mode, &report);
    session_follow_core(session);
    if (result == ZPLC_SCHED_ERR_DEADLINE) {
        return ZPLC_NATIVE_DISPATCH_DEADLINE_FAULT;
    }
    return result < 0 ? result : 1;
}

/* A dispatch that stopped at a breakpoint did not finish its scan. Such a scan
 * is neither counted nor allowed to consume the staged input pulses: the rest
 * of it runs on resume or step, and the pulse must last until that scan ends. */
static int session_complete_scan(zplc_native_runtime_session_t *session, const session_batch_t *batch)
{
    uint8_t position;

    if (session_focused_vm(session)->paused != 0U) return 0;
    if (session_clear_simulation_pulses(session) != 0) return -1;
    session->cycle_count += 1U;
    for (position = 0U; position < batch->count; ++position) {
        session->task_cycles[batch->index[position]] += 1U;
    }
    return 0;
}

/* A start and a resume begin a new run of the schedule: the next scan releases every task, and a run of
 * deadline misses does not carry over. */
static void session_restart_schedule(zplc_native_runtime_session_t *session)
{
    session->timed_scan_started = 0U;
    session->last_dispatch_lateness_ms = 0U;
    memset(session->task_consecutive_misses, 0, sizeof(session->task_consecutive_misses));
    zplc_sched_core_restart_schedule(&session->core);
}

/* Stop and reset begin from a cycle boundary: drop a scan that a breakpoint
 * interrupted (or that resume armed but no tick has run yet). */
static void session_abandon_interrupted_scans(zplc_native_runtime_session_t *session)
{
    uint8_t index;
    uint8_t count = session->task_count > 1U ? session->task_count : 1U;

    for (index = 0U; index < count; ++index) {
        zplc_vm_t *vm = session->task_count > 1U ? &session->task_vms[index]
                                                  : zplc_core_get_default_vm();
        if (vm->paused != 0U || vm->scan_resumed != 0U) zplc_vm_reset_cycle(vm);
    }
    /* A stopped task has no scan left to continue, and its first scan is still to come. */
    zplc_sched_core_set_stopped(&session->core);
}

static void skip_json_space(const char **cursor)
{
    while (**cursor != '\0' && isspace((unsigned char)**cursor)) {
        (*cursor)++;
    }
}

/* Walk past one string that has no escapes or control characters; report where it starts and how long it is. */
static int scan_canonical_json_string(const char **cursor, const char **start, size_t *length)
{
    skip_json_space(cursor);
    if (**cursor != '"') return -1;
    (*cursor)++;
    *start = *cursor;
    while (**cursor != '\0' && **cursor != '"') {
        if (**cursor == '\\' || (unsigned char)**cursor < 0x20U) return -1;
        (*cursor)++;
    }
    if (**cursor != '"') return -1;
    *length = (size_t)(*cursor - *start);
    (*cursor)++;
    return 0;
}

static int parse_canonical_json_string(const char **cursor, char *out, size_t out_size)
{
    const char *start;
    size_t length;

    if (out == NULL || out_size == 0U) return -1;
    if (scan_canonical_json_string(cursor, &start, &length) != 0 || length >= out_size) return -1;
    memcpy(out, start, length);
    out[length] = '\0';
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

/*
 * The hex field of a control request. program.load measures a string too long for
 * bytecode_hex instead of rejecting the whole request, so that the handler can
 * tell the caller how large its program is; any other method still rejects it.
 */
static int parse_canonical_hex_param(const char **cursor,
                                     const char *method,
                                     zplc_native_request_t *request)
{
    const char *start;
    size_t length;

    if (strcmp(method, "program.load") != 0) {
        return parse_canonical_json_string(cursor, request->bytecode_hex, sizeof(request->bytecode_hex));
    }
    if (scan_canonical_json_string(cursor, &start, &length) != 0) return -1;
    request->bytecode_hex_length = length;
    if (length < sizeof(request->bytecode_hex)) {
        memcpy(request->bytecode_hex, start, length);
        request->bytecode_hex[length] = '\0';
    }
    return 0;
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
            if (parse_canonical_hex_param(cursor, method, request) != 0) return -1;
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
        } else {
            return -1;
        }
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

static const char *fault_reason_string(zplc_native_fault_reason_t reason)
{
    switch (reason) {
        case ZPLC_NATIVE_FAULT_NONE:
            return "none";
        case ZPLC_NATIVE_FAULT_DEADLINE_MISS:
            return "deadline_miss";
        case ZPLC_NATIVE_FAULT_VM:
            return "vm_fault";
        case ZPLC_NATIVE_FAULT_RUNTIME:
        default:
            return "runtime_failure";
    }
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
    zplc_retain_status_t retain;
    char saved_at[16];
    char fault_task[8];
    uint32_t consecutive_misses = 0U;
    uint8_t index;

    if (session == NULL || response == NULL || used == NULL) {
        return format_failed(response, response_size);
    }
    for (index = 0U; index < session->task_count; ++index) {
        if (session->task_consecutive_misses[index] > consecutive_misses) {
            consecutive_misses = session->task_consecutive_misses[index];
        }
    }
    if (session->fault_reason == ZPLC_NATIVE_FAULT_NONE) {
        (void)snprintf(fault_task, sizeof(fault_task), "null");
    } else {
        (void)snprintf(fault_task, sizeof(fault_task), "%u", (unsigned)session->fault_task_id);
    }
    zplc_retain_last_status(&retain);
    if (retain.saves == 0U) {
        (void)snprintf(saved_at, sizeof(saved_at), "null");
    } else {
        (void)snprintf(saved_at, sizeof(saved_at), "%u", (unsigned)retain.saved_at_ms);
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
        "\"deadline\":{\"warning\":%s,\"misses\":%u,\"consecutive_misses\":%u,\"miss_limit\":%u,"
        "\"last_overrun_us\":%u},"
        "\"fault\":{\"reason\":\"%s\",\"task_id\":%s},"
        "\"retain\":{\"reason\":\"%s\",\"restored\":%s,\"sequence\":%u,\"saves\":%u,"
        "\"save_errors\":%u,\"saved_at_ms\":%s},"
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
        consecutive_misses != 0U ? "true" : "false",
        (unsigned)session->overrun_count, (unsigned)consecutive_misses,
        (unsigned)session->deadline_miss_limit, (unsigned)session->last_overrun_us,
        fault_reason_string(session->fault_reason), fault_task,
        zplc_retain_reason_string(retain.reason),
        retain.reason == ZPLC_RETAIN_RESTORED ? "true" : "false",
        (unsigned)retain.sequence, (unsigned)retain.saves, (unsigned)retain.save_errors, saved_at,
        (unsigned)focused_vm->pc, (unsigned)focused_vm->sp,
        focused_vm->halted != 0U ? "true" : "false", (unsigned)focused_vm->error) != 0) {
        return format_failed(response, response_size);
    }
    for (index = 0U; index < session->task_count; ++index) {
        const zplc_vm_t *vm = session->task_count > 1U ? &session->task_vms[index] : zplc_core_get_default_vm();
        if (append_jsonf(response, response_size, used,
                         "%s{\"task_id\":%u,\"state\":\"%s\",\"cycles\":%u,\"overruns\":%u,\"interval_us\":%u,\"priority\":%u,\"pc\":%u,\"sp\":%u,\"halted\":%s,\"error\":%u}",
                         index == 0U ? "" : ",", (unsigned)session->tasks[index].id, state,
                         session->task_cycles[index], session->task_misses[index],
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
    /* REL-023: which build this is. A formatter that cannot fit reports null rather than half an identity. */
    const zplc_fw_identity_t identity = zplc_fw_identity();
    char build[512];

    if (zplc_fw_identity_json(&identity, build, sizeof(build)) < 0) {
        (void)snprintf(build, sizeof(build), "null");
    }
    return format_jsonf(
        response,
        response_size,
        "{\"id\":\"%s\",\"type\":\"response\",\"result\":{"
        "\"protocol_version\":\"%s\",\"runtime_kind\":\"%s\","
        "\"runtime_version\":\"%s\",\"draft_counter\":%u,\"build\":%s,\"capability_profile\":{"
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
        zplc_core_version(),
        (unsigned)ZPLC_DRAFT_COUNTER,
        build);
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

    if (request->bytecode_hex_length > (size_t)ZPLC_MEM_CODE_SIZE * 2U) {
        /* Too long for bytecode_hex, so not copied: say how large it is, not that the request is broken. */
        char message[128];

        (void)snprintf(message, sizeof(message),
                       "the program is %u bytes, but the native simulation loads at most %u bytes",
                       (unsigned)((request->bytecode_hex_length + 1U) / 2U),
                       (unsigned)ZPLC_MEM_CODE_SIZE);
        return format_error_response(request->id, "PROGRAM_LOAD_FAILED", message, response, response_size);
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
        if (details.loader_result == ZPLC_LOADER_ERR_DRAFT) {
            /* CMP-052: say which draft the program was built for; 0 is an artifact without a counter. */
            char message[128];
            const uint32_t built = zplc_loader_artifact_draft_counter(candidate, program_size);

            if (built == 0U) {
                (void)snprintf(message, sizeof(message),
                               "Program was built for contract draft none, this runtime is draft %u",
                               (unsigned)ZPLC_DRAFT_COUNTER);
            } else {
                (void)snprintf(message, sizeof(message),
                               "Program was built for contract draft %u, this runtime is draft %u",
                               (unsigned)built, (unsigned)ZPLC_DRAFT_COUNTER);
            }
            free(candidate);
            return format_error_response(request->id, "PROGRAM_LOAD_FAILED", message, response, response_size);
        }
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
    session_retain_restore(candidate, program_size);
    free(candidate);
    session->program_loaded = 1U;
    session->program_size = (uint32_t)program_size;
    session->program_format = ZPLC_NATIVE_PROGRAM_ZPLC;
    session->program_generation += 1U;
    session->scan_interval_ms = details.scan_interval_ms;
    session->state = ZPLC_NATIVE_SESSION_IDLE;
    session_reset_counters(session);
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
    ipi = zplc_force_get_count() != 0U ? NULL : zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    if (ipi == NULL) {
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

    session_restart_schedule(session);
    zplc_sched_core_begin_run(&session->core);
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
    session_restart_schedule(session);
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
    const int was_faulted = session->state == ZPLC_NATIVE_SESSION_ERROR;

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
        session_reset_counters(session);
        session->program_generation += 1U;
        session_reset_scenario_clock(session);
    }
    if (reset_program != 0) {
        session_reset_observed_cadence(session);
    }

    if (session->program_loaded != 0U) {
        session_abandon_interrupted_scans(session);
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
        session->fault_reason = ZPLC_NATIVE_FAULT_NONE;
        session->fault_task_id = 0U;
    }
    if (reset_program != 0) {
        /* Reset is a cold restart: the stored values must not come back. */
        session_retain_cold_reset(session);
    } else if (!was_faulted) {
        /* STOP: the values of the last complete scan are what a restart sees. */
        session_retain_save(session, zplc_hal_tick(), ZPLC_RETAIN_SAVE_FORCED);
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
    session_batch_t batch;
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

    /* A step is one batch of every task, whatever its interval, and no deadline applies to it (RT-017). */
    session_plan_batch(session, ZPLC_NATIVE_ALL_TASKS, 0U, 1, &batch);
    run_result = session_run_batch(session, &batch, 1);
    if (run_result < 0) {
        session_apply_safe_state(session);
        return format_error_response(request->id,
                                     "RUNTIME_FAILURE",
                                     "zplc_core_run_cycle failed",
                                     response,
                                     response_size);
    }

    if (session_complete_scan(session, &batch) != 0) {
        session_apply_safe_state(session);
        return format_error_response(request->id, "RUNTIME_FAILURE",
                                     "failed to clear simulation input pulse",
                                     response, response_size);
    }

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
    session_batch_t batch;
    uint32_t due;
    int first_release;
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

    /* The first step releases every task; after it each task is released at its own interval (RT-015). A step at
     * which no task is due runs no batch: the images and the scan counts stay as they are. */
    first_release = session->scenario_timestamp_started == 0U;
    due = session->multirate != 0U ? session_due_tasks(session, request->at_ms, first_release)
                                    : ZPLC_NATIVE_ALL_TASKS;
    session_plan_batch(session, due, request->at_ms, first_release, &batch);
    if (due != 0U) {
        zplc_hal_posix_set_tick_override(request->at_ms);
        run_result = session_run_batch(session, &batch, 0);
        zplc_hal_posix_clear_tick_override();
        if (run_result < 0) {
            session_apply_safe_state(session);
            return format_error_response(request->id,
                                         session->fault_reason == ZPLC_NATIVE_FAULT_DEADLINE_MISS
                                             ? "DEADLINE_MISS" : "RUNTIME_FAILURE",
                                         session->fault_reason == ZPLC_NATIVE_FAULT_DEADLINE_MISS
                                             ? "a task reached the limit of consecutive deadline misses"
                                             : "zplc_core_run_cycle failed",
                                         response, response_size);
        }
        if (session_complete_scan(session, &batch) != 0) {
            session_apply_safe_state(session);
            return format_error_response(request->id, "RUNTIME_FAILURE",
                                         "failed to clear simulation input pulse", response, response_size);
        }
        if (session->multirate != 0U) {
            session_mark_released(session, &batch, request->at_ms, first_release);
        }
    }

    session->scenario_timestamp_started = 1U;
    session->scenario_last_timestamp_ms = request->at_ms;
    session->last_scan_tick_ms = request->at_ms;
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
    session->deadline_miss_limit = deadline_miss_limit();
    if (zplc_core_init() != 0) {
        /* No process-image lock: the session cannot run a program (RT-030). */
        session->state = ZPLC_NATIVE_SESSION_ERROR;
        return;
    }
    session_retain_configure();

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
            session_retain_restore(session->program, saved_len);
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

    /* A clean shutdown keeps the values of the last complete scan, like a STOP. */
    if (session->state != ZPLC_NATIVE_SESSION_ERROR) {
        session_retain_save(session, zplc_hal_tick(), ZPLC_RETAIN_SAVE_FORCED);
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

/* RT-015: how late the host dispatched this batch, over the tasks that are in it. Each task counts the releases it
 * skipped (no catch-up); the batch reports the largest, as a set of tasks of one interval always has. The first
 * scan after a start has no release to be late for. */
static void session_note_multirate_cadence(zplc_native_runtime_session_t *session, uint32_t now_ms, uint32_t due)
{
    uint32_t lateness_ms = 0U;
    uint32_t missed = 0U;
    uint8_t index;

    if (session->timed_scan_started != 0U) {
        for (index = 0U; index < session->task_count; ++index) {
            uint32_t interval_ms;
            uint32_t late_ms;

            if ((due & ((uint32_t)1U << index)) == 0U) {
                continue;
            }
            interval_ms = session_task_interval_ms(session, index);
            late_ms = (uint32_t)session_overdue_ms(session, index, now_ms);
            if (late_ms > lateness_ms) {
                lateness_ms = late_ms;
            }
            if (late_ms / interval_ms > missed) {
                missed = late_ms / interval_ms;
            }
        }
        if (missed > UINT32_MAX - session->missed_interval_count) {
            session->missed_interval_count = UINT32_MAX;
        } else {
            session->missed_interval_count += missed;
        }
    }
    session->last_dispatch_lateness_ms = lateness_ms;
}

int zplc_native_runtime_session_tick(zplc_native_runtime_session_t *session,
                                     uint32_t now_ms,
                                     char *event,
                                     size_t event_size)
{
    session_batch_t batch;
    int run_result;
    int first_release;
    uint32_t due;
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

    first_release = session->timed_scan_started == 0U;
    if (session->multirate != 0U) {
        /* Each task is released at its own interval; the tasks due now are one batch. */
        due = session_due_tasks(session, now_ms, first_release);
        if (due == 0U) {
            return 0;
        }
        session_note_multirate_cadence(session, now_ms, due);
    } else {
        due = ZPLC_NATIVE_ALL_TASKS;
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
    }
    session->timed_scan_started = 1U;

    session_plan_batch(session, due, now_ms, first_release, &batch);
    run_result = session_run_batch(session, &batch, 0);
    session->last_scan_tick_ms = now_ms;
    if (session->multirate != 0U) {
        session_mark_released(session, &batch, now_ms, first_release);
    }
    if (run_result < 0) {
        const int deadline = session->fault_reason == ZPLC_NATIVE_FAULT_DEADLINE_MISS;

        session_apply_safe_state(session);
        if (event != NULL && event_size > 0U) {
            if (deadline != 0) {
                (void)format_jsonf(event,
                               event_size,
                               "{\"type\":\"event\",\"method\":\"runtime.error\",\"params\":{"
                               "\"code\":\"DEADLINE_MISS\","
                               "\"message\":\"task %u reached the limit of %u consecutive deadline misses\"}}",
                               (unsigned)session->fault_task_id, (unsigned)session->deadline_miss_limit);
            } else {
                (void)format_jsonf(event,
                               event_size,
                               "{\"type\":\"event\",\"method\":\"runtime.error\",\"params\":{"
                               "\"code\":\"RUNTIME_FAILURE\","
                               "\"message\":\"zplc_core_run_cycle failed\"}}");
            }
        }
        return ZPLC_NATIVE_RESPONSE_ERR_INVALID_STATE;
    }

    if (session_complete_scan(session, &batch) != 0) {
        session_apply_safe_state(session);
        if (event != NULL && event_size > 0U) {
            (void)format_jsonf(event, event_size,
                           "{\"type\":\"event\",\"method\":\"runtime.error\",\"params\":{"
                           "\"code\":\"RUNTIME_FAILURE\","
                           "\"message\":\"failed to clear simulation input pulse\"}}");
        }
        return ZPLC_NATIVE_RESPONSE_ERR_INVALID_STATE;
    }

    if (session_focused_vm(session)->paused != 0U) {
        session->state = ZPLC_NATIVE_SESSION_PAUSED;
    } else {
        /* A scan boundary: the region is consistent. The module skips the call
         * inside the interval and when nothing changed (flash wear, RT-026). */
        session_retain_save(session, now_ms, ZPLC_RETAIN_SAVE_PERIODIC);
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

    if (session->multirate != 0U) {
        /* The wait is the time to the nearest release of any task; before the first scan every task is due. */
        uint8_t index;

        if (session->timed_scan_started == 0U) {
            return 0U;
        }
        remaining_ms = max_timeout_ms;
        for (index = 0U; index < session->task_count; ++index) {
            if (session_overdue_ms(session, index, now_ms) >= 0) {
                return 0U;
            }
            if (session->task_next_release_ms[index] - now_ms < remaining_ms) {
                remaining_ms = session->task_next_release_ms[index] - now_ms;
            }
        }
        return remaining_ms;
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
