/**
 * @file zplc_sched_core.c
 * @brief The portable scheduler core (RT-008, RT-018). See zplc_sched_core.h.
 *
 * SPDX-License-Identifier: MIT
 *
 * No Zephyr or POSIX header is included here: the file is compiled by the portable target of the host build
 * (RT-029) and by every runtime that schedules tasks.
 */

#include <string.h>

#include "zplc_debug.h"
#include "zplc_sched_core.h"

/* ============================================================================
 * Helpers
 * ============================================================================
 */

static unsigned int enter(const zplc_sched_port_t *port) {
  return port->enter != NULL ? port->enter(port->ctx) : 0U;
}

static void leave(const zplc_sched_port_t *port, unsigned int key) {
  if (port->leave != NULL) {
    port->leave(port->ctx, key);
  }
}

static void trace(const zplc_sched_core_t *core, zplc_sched_trace_kind_t kind, uint16_t task_id, uint64_t a,
                  uint64_t b) {
  if (core->trace != NULL) {
    core->trace(core->trace_ctx, kind, task_id, a, b);
  }
}

static void count_up(uint32_t *counter) {
  if (*counter != UINT32_MAX) {
    (*counter)++;
  }
}

static uint32_t clamp_u32(uint64_t value) { return value > UINT32_MAX ? UINT32_MAX : (uint32_t)value; }

const char *zplc_sched_fault_reason_name(zplc_sched_fault_reason_t reason) {
  switch (reason) {
  case ZPLC_SCHED_FAULT_NONE:
    return "none";
  case ZPLC_SCHED_FAULT_DEADLINE_MISS:
    return "deadline_miss";
  case ZPLC_SCHED_FAULT_VM:
    return "vm_fault";
  case ZPLC_SCHED_FAULT_IO:
    return "io_failure";
  case ZPLC_SCHED_FAULT_LOCK:
    return "lock_failure";
  case ZPLC_SCHED_FAULT_RUNTIME:
  default:
    return "runtime_failure";
  }
}

/* ============================================================================
 * Table
 * ============================================================================
 */

void zplc_sched_core_init(zplc_sched_core_t *core, zplc_sched_slot_t *slots, uint8_t capacity, uint32_t miss_limit) {
  if (core == NULL) {
    return;
  }
  memset(core, 0, sizeof(*core));
  if (capacity > ZPLC_SCHED_CORE_MAX_SLOTS) {
    capacity = ZPLC_SCHED_CORE_MAX_SLOTS;
  }
  if (slots != NULL) {
    memset(slots, 0, (size_t)capacity * sizeof(slots[0]));
  } else {
    capacity = 0U;
  }
  core->slot = slots;
  core->capacity = capacity;
  core->miss_limit = miss_limit != 0U ? miss_limit : ZPLC_SCHED_DEFAULT_MISS_LIMIT;
  core->state = ZPLC_SCHED_STATE_IDLE;
}

void zplc_sched_core_set_trace(zplc_sched_core_t *core, zplc_sched_trace_fn fn, void *ctx) {
  core->trace = fn;
  core->trace_ctx = ctx;
}

int zplc_sched_core_add_task(zplc_sched_core_t *core, const zplc_task_def_t *def, zplc_vm_t *vm) {
  uint8_t index;

  if (core == NULL || def == NULL || vm == NULL) {
    return -1;
  }
  for (index = 0U; index < core->capacity; index++) {
    zplc_sched_slot_t *slot = &core->slot[index];

    if (slot->registered == 0U) {
      memset(slot, 0, sizeof(*slot));
      slot->task.config = *def;
      slot->task.state = ZPLC_TASK_STATE_READY;
      slot->vm = vm;
      slot->registered = 1U;
      core->count++;
      return (int)index;
    }
  }
  return -1;
}

int zplc_sched_core_free_slot(const zplc_sched_core_t *core) {
  uint8_t index;

  for (index = 0U; index < core->capacity; index++) {
    if (core->slot[index].registered == 0U) {
      return (int)index;
    }
  }
  return -1;
}

int zplc_sched_core_remove_task(zplc_sched_core_t *core, int slot_index) {
  zplc_sched_slot_t *slot;

  if (core == NULL || slot_index < 0 || slot_index >= (int)core->capacity) {
    return -1;
  }
  slot = &core->slot[slot_index];
  if (slot->registered == 0U) {
    return -1;
  }
  slot->task.state = ZPLC_TASK_STATE_IDLE;
  slot->pending = 0U;
  slot->registered = 0U;
  core->count--;
  return 0;
}

/* ============================================================================
 * Admission and order
 * ============================================================================
 */

int zplc_sched_core_admit(zplc_sched_core_t *core, int slot_index, uint64_t release_us, uint64_t deadline_ref_us) {
  zplc_sched_slot_t *slot;

  if (core == NULL || slot_index < 0 || slot_index >= (int)core->capacity) {
    return 0;
  }
  slot = &core->slot[slot_index];
  if (core->fault_latched != 0U || slot->registered == 0U || slot->task.state != ZPLC_TASK_STATE_RUNNING) {
    return 0;
  }
  if (slot->pending != 0U) {
    /* Periodic releases coalesce; the completion of the pending one does the deadline accounting. */
    trace(core, ZPLC_SCHED_TRACE_COALESCE, slot->task.config.id, release_us, 0U);
    return 0;
  }
  slot->release_us = release_us;
  slot->deadline_ref_us = deadline_ref_us;
  slot->pending = 1U;
  trace(core, ZPLC_SCHED_TRACE_ADMIT, slot->task.config.id, release_us, deadline_ref_us);
  return 1;
}

int zplc_sched_core_before(const zplc_sched_slot_t *a, const zplc_sched_slot_t *b) {
  if (a->release_us != b->release_us) {
    return a->release_us < b->release_us;
  }
  if (a->task.config.priority != b->task.config.priority) {
    return a->task.config.priority < b->task.config.priority;
  }
  return a->task.config.id < b->task.config.id;
}

void zplc_sched_core_sort(const zplc_sched_core_t *core, uint8_t *order, uint8_t count) {
  uint8_t index;

  for (index = 1U; index < count; ++index) {
    const uint8_t current = order[index];
    int previous = (int)index - 1;

    while (previous >= 0 && zplc_sched_core_before(&core->slot[current], &core->slot[order[previous]])) {
      order[previous + 1] = order[previous];
      --previous;
    }
    order[previous + 1] = current;
  }
}

uint8_t zplc_sched_core_collect(const zplc_sched_core_t *core, uint8_t *order, uint8_t capacity) {
  uint8_t count = 0U;
  uint8_t index;

  if (!zplc_sched_core_is_running(core)) {
    return 0U;
  }
  for (index = 0U; index < core->capacity && count < capacity; ++index) {
    const zplc_sched_slot_t *slot = &core->slot[index];

    if (slot->registered != 0U && slot->task.state == ZPLC_TASK_STATE_RUNNING && slot->pending != 0U) {
      order[count++] = index;
    }
  }
  zplc_sched_core_sort(core, order, count);
  return count;
}

uint8_t zplc_sched_core_begin_step(zplc_sched_core_t *core, uint64_t release_us, uint8_t *order, uint8_t capacity) {
  uint8_t count = 0U;
  uint8_t index;

  if (core->fault_latched != 0U) {
    return 0U;
  }
  for (index = 0U; index < core->capacity && count < capacity; ++index) {
    zplc_sched_slot_t *slot = &core->slot[index];

    if (slot->registered == 0U ||
        (slot->task.state != ZPLC_TASK_STATE_PAUSED && slot->task.state != ZPLC_TASK_STATE_READY)) {
      continue;
    }
    slot->task.state = ZPLC_TASK_STATE_RUNNING;
    slot->release_us = release_us;
    slot->deadline_ref_us = release_us;
    slot->pending = 1U;
    trace(core, ZPLC_SCHED_TRACE_ADMIT, slot->task.config.id, release_us, release_us);
    order[count++] = index;
  }
  if (count != 0U) {
    core->state = ZPLC_SCHED_STATE_RUNNING;
  }
  zplc_sched_core_sort(core, order, count);
  return count;
}

/* ============================================================================
 * State
 * ============================================================================
 */

int zplc_sched_core_is_running(const zplc_sched_core_t *core) {
  return core->state == ZPLC_SCHED_STATE_RUNNING && core->fault_latched == 0U;
}

uint8_t zplc_sched_core_set_running(zplc_sched_core_t *core) {
  uint8_t moved = 0U;
  uint8_t index;

  for (index = 0U; index < core->capacity; ++index) {
    zplc_sched_slot_t *slot = &core->slot[index];

    if (slot->registered != 0U &&
        (slot->task.state == ZPLC_TASK_STATE_READY || slot->task.state == ZPLC_TASK_STATE_PAUSED)) {
      slot->task.state = ZPLC_TASK_STATE_RUNNING;
      slot->pending = 0U;
      moved++;
    }
  }
  core->state = ZPLC_SCHED_STATE_RUNNING;
  return moved;
}

void zplc_sched_core_set_paused(zplc_sched_core_t *core) {
  uint8_t index;

  core->state = ZPLC_SCHED_STATE_PAUSED;
  for (index = 0U; index < core->capacity; ++index) {
    zplc_sched_slot_t *slot = &core->slot[index];

    if (slot->registered == 0U) {
      continue;
    }
    if (slot->task.state == ZPLC_TASK_STATE_RUNNING) {
      slot->task.state = ZPLC_TASK_STATE_PAUSED;
    }
    slot->pending = 0U;
  }
}

void zplc_sched_core_set_stopped(zplc_sched_core_t *core) {
  const uint8_t faulted = core->fault_latched;
  uint8_t index;

  if (faulted == 0U) {
    core->state = ZPLC_SCHED_STATE_IDLE;
  }
  for (index = 0U; index < core->capacity; ++index) {
    zplc_sched_slot_t *slot = &core->slot[index];

    if (slot->registered == 0U) {
      continue;
    }
    if (faulted == 0U) {
      slot->task.state = ZPLC_TASK_STATE_READY;
      /* A stopped task has no scan left to continue. */
      slot->first_scan_interrupted = 0U;
    }
    slot->pending = 0U;
  }
}

uint32_t zplc_sched_core_total_misses(const zplc_sched_core_t *core) {
  uint32_t total = 0U;
  uint8_t index;

  for (index = 0U; index < core->capacity; ++index) {
    const zplc_sched_slot_t *slot = &core->slot[index];

    if (slot->registered != 0U) {
      total = clamp_u32((uint64_t)total + slot->task.stats.overrun_count);
    }
  }
  return total;
}

uint32_t zplc_sched_core_consecutive_misses(const zplc_sched_core_t *core) {
  uint32_t longest = 0U;
  uint8_t index;

  for (index = 0U; index < core->capacity; ++index) {
    const zplc_sched_slot_t *slot = &core->slot[index];

    if (slot->registered != 0U && slot->consecutive_misses > longest) {
      longest = slot->consecutive_misses;
    }
  }
  return longest;
}

void zplc_sched_core_reset_counters(zplc_sched_core_t *core) {
  uint8_t index;

  for (index = 0U; index < core->capacity; ++index) {
    zplc_sched_slot_t *slot = &core->slot[index];

    slot->task.stats.overrun_count = 0U;
    slot->consecutive_misses = 0U;
    if (slot->registered != 0U && slot->task.state == ZPLC_TASK_STATE_ERROR) {
      slot->task.state = ZPLC_TASK_STATE_READY;
    }
  }
  if (core->state == ZPLC_SCHED_STATE_ERROR) {
    core->state = ZPLC_SCHED_STATE_IDLE;
  }
  core->last_overrun_us = 0U;
  core->fault_latched = 0U;
  core->fault_reason = (uint8_t)ZPLC_SCHED_FAULT_NONE;
  core->fault_task_id = 0U;
}

void zplc_sched_core_restart_schedule(zplc_sched_core_t *core) {
  uint8_t index;

  for (index = 0U; index < core->capacity; ++index) {
    core->slot[index].consecutive_misses = 0U;
  }
}

void zplc_sched_core_begin_run(zplc_sched_core_t *core) {
  uint8_t index;

  for (index = 0U; index < core->capacity; ++index) {
    core->slot[index].consecutive_misses = 0U;
    core->slot[index].run_scans = 0U;
    core->slot[index].first_scan_interrupted = 0U;
  }
}

uint64_t zplc_sched_core_overrun_us(uint64_t ref_us, uint64_t end_us, uint32_t interval_us) {
  if (end_us <= ref_us) {
    return 0U;
  }
  return (end_us - ref_us) > interval_us ? (end_us - ref_us) - interval_us : 0U;
}

/* ============================================================================
 * Fault latch and safe state
 * ============================================================================
 */

/* Latches the fault in the state. The first reason is the one that is kept. Critical. */
static void latch_state_locked(zplc_sched_core_t *core, zplc_sched_fault_reason_t reason, uint16_t task_id) {
  uint8_t index;

  if (core->fault_reason == (uint8_t)ZPLC_SCHED_FAULT_NONE) {
    core->fault_reason = (uint8_t)reason;
    core->fault_task_id = task_id;
  }
  core->fault_latched = 1U;
  core->state = ZPLC_SCHED_STATE_ERROR;
  for (index = 0U; index < core->capacity; ++index) {
    zplc_sched_slot_t *slot = &core->slot[index];

    if (slot->registered != 0U) {
      slot->task.state = ZPLC_TASK_STATE_ERROR;
      slot->pending = 0U;
    }
  }
}

int zplc_sched_core_latch_fault_image(zplc_sched_core_t *core, const zplc_sched_port_t *port,
                                      zplc_sched_fault_reason_t reason, uint16_t task_id) {
  unsigned int key = enter(port);

  latch_state_locked(core, reason, task_id);
  leave(port, key);
  trace(core, ZPLC_SCHED_TRACE_FAULT, task_id, (uint64_t)reason, 0U);
  return port->reset_image != NULL ? port->reset_image(port->ctx) : 0;
}

zplc_sched_safe_result_t zplc_sched_core_settle(const zplc_sched_core_t *core, const zplc_sched_port_t *port,
                                                int image_result) {
  zplc_sched_safe_result_t out = {0, 0};
  int pins_result = port->drive_safe_pins != NULL ? port->drive_safe_pins(port->ctx) : 0;

  (void)core;
  out.safe_result = image_result != 0 ? image_result : pins_result;
  if (out.safe_result == 0 && port->disarm_watchdog != NULL) {
    out.watchdog_result = port->disarm_watchdog(port->ctx);
  }
  return out;
}

int zplc_sched_core_lock_failure(zplc_sched_core_t *core, const zplc_sched_port_t *port) {
  unsigned int key = enter(port);
  int safe_result;

  latch_state_locked(core, ZPLC_SCHED_FAULT_LOCK, 0U);
  leave(port, key);
  trace(core, ZPLC_SCHED_TRACE_FAULT, 0U, (uint64_t)ZPLC_SCHED_FAULT_LOCK, 0U);
  if (port->stop_releases != NULL) {
    port->stop_releases(port->ctx);
  }
  safe_result = port->drive_safe_pins != NULL ? port->drive_safe_pins(port->ctx) : 0;
  if (safe_result == 0 && port->disarm_watchdog != NULL) {
    (void)port->disarm_watchdog(port->ctx);
  }
  return ZPLC_SCHED_ERR_LOCK;
}

int zplc_sched_core_fault(zplc_sched_core_t *core, const zplc_sched_port_t *port, zplc_sched_fault_reason_t reason,
                          uint16_t task_id) {
  zplc_sched_safe_result_t settled;
  int image_result;

  if (port->lock_image != NULL && port->lock_image(port->ctx) != 0) {
    return zplc_sched_core_lock_failure(core, port);
  }
  image_result = zplc_sched_core_latch_fault_image(core, port, reason, task_id);
  if (port->unlock_image != NULL) {
    port->unlock_image(port->ctx);
  }
  settled = zplc_sched_core_settle(core, port, image_result);
  return settled.safe_result != 0 ? settled.safe_result : settled.watchdog_result;
}

int zplc_sched_core_apply_safe_outputs(zplc_sched_core_t *core, const zplc_sched_port_t *port) {
  int image_result = 0;
  int pins_result;
  int result;

  if (port->lock_image != NULL && port->lock_image(port->ctx) != 0) {
    return zplc_sched_core_lock_failure(core, port);
  }
  if (port->reset_image != NULL) {
    image_result = port->reset_image(port->ctx);
  }
  if (port->unlock_image != NULL) {
    port->unlock_image(port->ctx);
  }
  pins_result = port->drive_safe_pins != NULL ? port->drive_safe_pins(port->ctx) : 0;
  result = image_result != 0 ? image_result : pins_result;
  if (result != 0) {
    (void)zplc_sched_core_fault(core, port, ZPLC_SCHED_FAULT_IO, 0U);
  }
  return result;
}

int zplc_sched_core_drive_safe_outputs(zplc_sched_core_t *core, const zplc_sched_port_t *port) {
  int result = port->drive_safe_pins != NULL ? port->drive_safe_pins(port->ctx) : 0;

  if (result != 0) {
    (void)zplc_sched_core_fault(core, port, ZPLC_SCHED_FAULT_IO, 0U);
  }
  return result;
}

/* ============================================================================
 * Scan
 * ============================================================================
 */

/* The system registers at the end of the input image: the time of the scan before it, the clock and the flags. */
static void write_system_registers(const zplc_sched_core_t *core, uint16_t task_id, uint32_t cycle_time_us,
                                   uint32_t uptime_ms, int first_scan) {
  uint8_t flags = 0U;

  (void)zplc_ipi_write32(ZPLC_SYS_REG_OFFSET, cycle_time_us);
  (void)zplc_ipi_write32(ZPLC_SYS_REG_OFFSET + 4U, uptime_ms);
  (void)zplc_ipi_write8(ZPLC_SYS_REG_OFFSET + 8U, (uint8_t)task_id);
  if (first_scan != 0) {
    flags |= ZPLC_SYS_FLAG_FIRST_SCAN;
  }
  if (core->state == ZPLC_SCHED_STATE_RUNNING) {
    flags |= ZPLC_SYS_FLAG_RUNNING;
  }
  (void)zplc_ipi_write8(ZPLC_SYS_REG_OFFSET + 9U, flags);
}

/*
 * Runs one part of one task's scan. Image lock held. Returns the VM result (negative: the task failed), or
 * ZPLC_VM_PAUSED when a breakpoint stopped it. *latched is set when this part's deadline miss reached the limit.
 *
 * The clock is read once after the part ends: a part starts where the one before it ended, and the first starts
 * at the instant the batch did. The duration of a part therefore includes the little between two tasks, and the
 * clock is read once per task and not twice.
 */
static int run_task(zplc_sched_core_t *core, const zplc_sched_port_t *port, zplc_sched_slot_t *slot, int step_mode,
                    uint64_t start_us, uint64_t batch_start_us, uint64_t *ended_us, int *latched,
                    zplc_sched_scan_report_t *report) {
  zplc_vm_t *vm = slot->vm;
  const uint16_t task_id = slot->task.config.id;
  uint64_t end_us;
  uint64_t ref_us;
  uint32_t exec_us;
  uint64_t over_us = 0U;
  int result;
  int first_scan;
  int continuing;
  int breakpoint;
  int forced = 0;
  unsigned int key;

  *latched = 0;

  /* A breakpoint interrupted the previous scan and a resume or a step armed it: zplc_vm_run_cycle() continues it
   * from the preserved pc and stacks instead of starting a new scan. The remainder belongs to the scan it
   * started in and keeps that scan's first-scan flag, however many parts the scan has. */
  continuing = vm->scan_resumed != 0U && vm->paused == 0U && vm->halted == 0U;
  first_scan = continuing ? slot->first_scan_interrupted != 0U : slot->run_scans == 0U;

  /* Every part of a scan writes its own task id, even when another task ran in between in the same batch. */
  write_system_registers(core, task_id, slot->task.stats.last_exec_time_us, clamp_u32(start_us / 1000U), first_scan);

  result = zplc_vm_run_cycle(vm);
  breakpoint = zplc_vm_is_paused(vm) != 0;
  slot->first_scan_interrupted = (breakpoint != 0 && first_scan != 0) ? 1U : 0U;

  end_us = port->now_us(port->ctx);
  *ended_us = end_us;
  exec_us = clamp_u32(end_us > start_us ? end_us - start_us : 0U);
  ref_us = slot->deadline_ref_us == ZPLC_SCHED_REF_BATCH_START ? batch_start_us : slot->deadline_ref_us;

  /* A debugger step and a scan that stopped at a breakpoint are not checked (RT-017). */
  if (step_mode == 0 && breakpoint == 0) {
    over_us = zplc_sched_core_overrun_us(ref_us, end_us, slot->task.config.interval_us);
    if (port->probe != NULL && port->probe(port->ctx, ZPLC_SCHED_PROBE_FORCE_MISS, task_id) != 0) {
      forced = 1;
    }
  }

  key = enter(port);
  count_up(&slot->task.stats.cycle_count);
  count_up(&slot->run_scans);
  slot->task.stats.last_exec_time_us = exec_us;
  if (exec_us > slot->task.stats.max_exec_time_us) {
    slot->task.stats.max_exec_time_us = exec_us;
  }
  if (slot->task.stats.avg_exec_time_us == 0U) {
    slot->task.stats.avg_exec_time_us = exec_us;
  } else {
    slot->task.stats.avg_exec_time_us =
        (uint32_t)(((uint64_t)slot->task.stats.avg_exec_time_us * 7U + exec_us) / 8U);
  }
  if (step_mode == 0 && breakpoint == 0) {
    if (over_us != 0U || forced != 0) {
      count_up(&slot->task.stats.overrun_count);
      count_up(&slot->consecutive_misses);
      core->last_overrun_us = clamp_u32(over_us != 0U ? over_us : 1U);
      if (slot->consecutive_misses >= core->miss_limit) {
        *latched = 1;
      }
    } else {
      slot->consecutive_misses = 0U;
    }
  }
  leave(port, key);

  trace(core, ZPLC_SCHED_TRACE_TASK, task_id, exec_us, breakpoint != 0 ? 1U : 0U);
  if (over_us != 0U || forced != 0) {
    trace(core, ZPLC_SCHED_TRACE_MISS, task_id, over_us != 0U ? over_us : 1U, slot->consecutive_misses);
    if (*latched == 0) {
      report->warning_task = task_id;
    }
  }
  hil_trace_task((uint8_t)task_id, clamp_u32(start_us / 1000U), clamp_u32(end_us / 1000U), exec_us,
                 over_us != 0U || forced != 0);

  if (result >= 0 && vm->error == ZPLC_VM_HALTED && step_mode == 0 && core->keep_halted_vm == 0U) {
    zplc_vm_reset_cycle(vm);
    result = 0;
  }
  if (result < 0) {
    report->error_task = task_id;
    report->error_code = vm->error;
    return result;
  }
  if (breakpoint != 0) {
    report->paused_task = task_id;
    report->paused_pc = zplc_vm_get_pc(vm);
    return ZPLC_VM_PAUSED;
  }
  return result;
}

int zplc_sched_core_scan(zplc_sched_core_t *core, const zplc_sched_port_t *port, const uint8_t *order, uint8_t count,
                         int step_mode, zplc_sched_scan_report_t *report) {
  zplc_sched_scan_report_t local;
  int result = 0;
  int faulted = 0;
  int paused = 0;
  int commit_requested = 0;
  int image_fault_result = 0;
  int sample_result = 0;
  int pause_safe_result = 0;
  zplc_sched_fault_reason_t fault_reason = ZPLC_SCHED_FAULT_RUNTIME;
  uint16_t fault_task = 0U;
  uint64_t batch_start_us = 0U;
  uint64_t cursor_us = 0U;
  unsigned int key;
  uint8_t index;
  int running;

  if (report == NULL) {
    report = &local;
  }
  memset(report, 0, sizeof(*report));
  report->error_task = -1;
  report->paused_task = -1;
  report->deadline_task = -1;
  report->warning_task = -1;

  if (count == 0U) {
    return 0;
  }

  /* Phase 1: nothing is read for a runtime that is not running or has faulted. */
  key = enter(port);
  running = zplc_sched_core_is_running(core);
  leave(port, key);
  if (running == 0) {
    return 0;
  }
  if (port->sample_inputs != NULL) {
    sample_result = port->sample_inputs(port->ctx);
  }

  /* Phase 2: the image lock is held; no hardware I/O and no log line runs here (RT-012). */
  if (port->lock_image != NULL && port->lock_image(port->ctx) != 0) {
    /* No scan can run without the image lock: the runtime goes to its safe state. */
    report->faulted = 1U;
    return zplc_sched_core_lock_failure(core, port);
  }
  key = enter(port);
  running = zplc_sched_core_is_running(core);
  leave(port, key);
  if (running == 0) {
    if (port->unlock_image != NULL) {
      port->unlock_image(port->ctx);
    }
    return 0;
  }

  if (sample_result != 0) {
    result = sample_result;
    fault_reason = ZPLC_SCHED_FAULT_IO;
    image_fault_result = zplc_sched_core_latch_fault_image(core, port, fault_reason, 0U);
    faulted = 1;
  } else {
    if (port->latch_inputs != NULL) {
      port->latch_inputs(port->ctx);
    }
    count_up(&core->input_latch_count);
    count_up(&core->batch_count);
    trace(core, ZPLC_SCHED_TRACE_LATCH, 0U, core->batch_count, 0U);
    for (index = 0U; index < count; ++index) {
      trace(core, ZPLC_SCHED_TRACE_ORDER, core->slot[order[index]].task.config.id, index, 0U);
    }
    batch_start_us = port->now_us(port->ctx);
    cursor_us = batch_start_us;
  }

  for (index = 0U; faulted == 0 && index < count; ++index) {
    zplc_sched_slot_t *slot = &core->slot[order[index]];
    int latched = 0;
    int admitted;
    int task_result;

    key = enter(port);
    admitted = zplc_sched_core_is_running(core) && slot->registered != 0U &&
               slot->task.state == ZPLC_TASK_STATE_RUNNING;
    leave(port, key);
    if (admitted == 0) {
      continue;
    }

    task_result = run_task(core, port, slot, step_mode, cursor_us, batch_start_us, &cursor_us, &latched, report);
    key = enter(port);
    slot->pending = 0U;
    leave(port, key);

    if (task_result < 0 || latched != 0) {
      if (task_result < 0) {
        result = task_result;
        fault_reason = ZPLC_SCHED_FAULT_VM;
      } else {
        result = ZPLC_SCHED_ERR_DEADLINE;
        fault_reason = ZPLC_SCHED_FAULT_DEADLINE_MISS;
        report->deadline_task = slot->task.config.id;
      }
      fault_task = slot->task.config.id;
      image_fault_result = zplc_sched_core_latch_fault_image(core, port, fault_reason, fault_task);
      faulted = 1;
      break;
    }
    if (task_result == ZPLC_VM_PAUSED) {
      paused = 1;
      break;
    }
  }

  if (step_mode != 0 && faulted == 0) {
    paused = 1;
  }

  if (faulted == 0 && port->probe != NULL) {
    (void)port->probe(port->ctx, ZPLC_SCHED_PROBE_BEFORE_COMMIT, 0U);
  }

  if (faulted == 0) {
    int commit_allowed;

    /* The image lock keeps a stop or a pause from closing admission before the image is captured. */
    key = enter(port);
    commit_allowed = zplc_sched_core_is_running(core);
    leave(port, key);
    if (commit_allowed != 0) {
      if (port->capture_outputs != NULL) {
        port->capture_outputs(port->ctx);
      }
      commit_requested = 1;
    }
  }
  /* The snapshot is this scan's image: whole, between two scans (RT-010). */
  if (port->publish != NULL) {
    port->publish(port->ctx);
  }
  if (port->unlock_image != NULL) {
    port->unlock_image(port->ctx);
  }

  /* Phase 3: the physical outputs, with the image lock released. A stop, a pause or a fault that arrived
   * meanwhile has the last word: the state is read again under the output lock. */
  if (commit_requested != 0) {
    int commit_failed = 0;
    zplc_sched_fault_reason_t commit_reason = ZPLC_SCHED_FAULT_IO;

    if (port->lock_io != NULL && port->lock_io(port->ctx) != 0) {
      commit_failed = 1;
      commit_reason = ZPLC_SCHED_FAULT_LOCK;
      result = ZPLC_SCHED_ERR_LOCK;
    } else {
      int commit_allowed;

      key = enter(port);
      commit_allowed = zplc_sched_core_is_running(core);
      leave(port, key);
      if (commit_allowed != 0) {
        int write_result = 0;

        if (port->probe != NULL) {
          (void)port->probe(port->ctx, ZPLC_SCHED_PROBE_BEFORE_OUTPUT_WRITE, 0U);
        }
        if (port->write_outputs != NULL) {
          write_result = port->write_outputs(port->ctx);
        }
        if (write_result == 0) {
          key = enter(port);
          count_up(&core->output_commit_count);
          leave(port, key);
          report->committed = 1U;
          trace(core, ZPLC_SCHED_TRACE_COMMIT, 0U, core->output_commit_count, 0U);
          if (paused == 0 && port->feed_watchdog != NULL && port->feed_watchdog(port->ctx) != 0) {
            result = ZPLC_SCHED_ERR_IO;
            commit_failed = 1;
          }
        } else {
          result = write_result;
          commit_failed = 1;
        }
      }
      if (port->unlock_io != NULL) {
        port->unlock_io(port->ctx);
      }
    }
    if (commit_failed != 0) {
      faulted = 1;
      (void)zplc_sched_core_fault(core, port, commit_reason, 0U);
    }
  }

  if (faulted != 0 && commit_requested == 0) {
    /* The scan itself faulted: the image was reset under the lock; the pins and the watchdog follow it. */
    (void)zplc_sched_core_settle(core, port, image_fault_result);
  }

  /* A breakpoint or a step pauses the runtime (RT-017). The batch has just committed its image to the pins; the
   * pause drives them back to the safe level and keeps the output image and the force table, so a resume or a
   * step continues from them. The pins are driven first and PAUSED is announced after: a thread that sees PAUSED
   * never sees a pin that still holds the committed image. */
  if (paused != 0 && faulted == 0) {
    if (port->drive_safe_pins != NULL) {
      pause_safe_result = port->drive_safe_pins(port->ctx);
    }
    key = enter(port);
    if (zplc_sched_core_is_running(core)) {
      zplc_sched_core_set_paused(core);
    }
    leave(port, key);
    trace(core, ZPLC_SCHED_TRACE_PAUSE, 0U, 0U, 0U);
    if (pause_safe_result != 0) {
      (void)zplc_sched_core_fault(core, port, ZPLC_SCHED_FAULT_IO, 0U);
    }
  }

  report->faulted = core->fault_latched;
  report->paused = (uint8_t)(paused != 0 && faulted == 0);

  if (faulted != 0) {
    if (port->stop_releases != NULL) {
      port->stop_releases(port->ctx);
    }
    return result;
  }
  if (paused != 0) {
    if (port->stop_releases != NULL) {
      port->stop_releases(port->ctx);
    }
    if (pause_safe_result == 0 && port->disarm_watchdog != NULL && port->disarm_watchdog(port->ctx) != 0) {
      (void)zplc_sched_core_fault(core, port, ZPLC_SCHED_FAULT_IO, 0U);
      report->faulted = 1U;
      result = ZPLC_SCHED_ERR_IO;
    }
  }
  return result;
}
