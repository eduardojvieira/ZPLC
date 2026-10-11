/**
 * @file zplc_single_task.c
 * @brief The single-task configuration of the scheduler core (RT-018). See zplc_single_task.h.
 *
 * SPDX-License-Identifier: MIT
 */

#include <string.h>

#include "zplc_exchange.h"
#include "zplc_single_task.h"

/* The clock of the single-task runtime is the HAL's tick, in whole milliseconds, like the host runtime's. */
static uint64_t port_now_us(void *ctx) {
  const zplc_single_task_t *single = (const zplc_single_task_t *)ctx;

  if (single->clock_us != NULL) {
    return single->clock_us();
  }
  return (uint64_t)zplc_hal_tick() * 1000U;
}

static int port_sample_inputs(void *ctx) {
  zplc_single_task_t *single = (zplc_single_task_t *)ctx;

  return (int)zplc_io_sample(&single->samples, NULL);
}

static void port_latch_inputs(void *ctx) {
  zplc_single_task_t *single = (zplc_single_task_t *)ctx;

  /* The writes queued by other threads, then the inputs. The exchange is not started in this configuration
   * unless the application started it; then there is nothing to apply. */
  (void)zplc_exchange_latch();
  zplc_io_apply_samples(&single->samples);
}

static void port_capture_outputs(void *ctx) {
  zplc_single_task_t *single = (zplc_single_task_t *)ctx;

  zplc_io_capture_outputs(&single->outputs);
}

static void port_publish(void *ctx) {
  (void)ctx;
  zplc_exchange_publish();
}

static int port_write_outputs(void *ctx) {
  zplc_single_task_t *single = (zplc_single_task_t *)ctx;

  return (int)zplc_io_write_outputs(&single->outputs, NULL);
}

static int port_reset_image(void *ctx) {
  (void)ctx;
  {
    const int result = zplc_io_reset_image();

    zplc_exchange_publish();
    return result;
  }
}

static int port_drive_safe_pins(void *ctx) {
  (void)ctx;
  return (int)zplc_io_drive_safe(NULL);
}

void zplc_single_task_init(zplc_single_task_t *single, uint32_t interval_ms, uint32_t miss_limit) {
  zplc_task_def_t def;

  memset(single, 0, sizeof(*single));
  zplc_sched_core_init(&single->core, single->slot, 1U, miss_limit);
  /* A debugger reads the VM that ended its scan: it stays as the last instruction left it. */
  single->core.keep_halted_vm = 1U;
  memset(&def, 0, sizeof(def));
  def.id = 0U;
  def.type = ZPLC_TASK_CYCLIC;
  def.priority = 0U;
  def.interval_us = (interval_ms != 0U ? interval_ms : 1U) * 1000U;
  def.entry_point = 0U;
  def.stack_size = ZPLC_STACK_MAX_DEPTH;
  (void)zplc_sched_core_add_task(&single->core, &def, zplc_core_get_default_vm());
}

void zplc_single_task_set_interval(zplc_single_task_t *single, uint32_t interval_ms) {
  single->slot[0].task.config.interval_us = (interval_ms != 0U ? interval_ms : 1U) * 1000U;
}

void zplc_single_task_begin(zplc_single_task_t *single) { zplc_sched_core_begin_run(&single->core); }

void zplc_single_task_clear(zplc_single_task_t *single) { zplc_sched_core_reset_counters(&single->core); }

int zplc_single_task_scan(zplc_single_task_t *single, int step_mode, zplc_sched_scan_report_t *report) {
  zplc_sched_port_t port;
  const uint8_t order[1] = {0U};
  zplc_vm_t *vm = zplc_core_get_default_vm();

  memset(&port, 0, sizeof(port));
  port.ctx = single;
  port.now_us = port_now_us;
  port.sample_inputs = port_sample_inputs;
  port.latch_inputs = port_latch_inputs;
  port.capture_outputs = port_capture_outputs;
  port.publish = port_publish;
  port.write_outputs = port_write_outputs;
  port.reset_image = port_reset_image;
  port.drive_safe_pins = port_drive_safe_pins;

  /* A scan that a breakpoint stopped continues from where it stopped when the caller runs or steps again. */
  if (vm != NULL && zplc_vm_is_paused(vm) != 0) {
    (void)zplc_vm_resume(vm);
  }
  /* One release per call: the caller's loop is the timer. A single task counts its deadline from the instant its
   * scan starts, like the host. The release instant is the clock now, so that a trace names it like the
   * multitask runtimes do. */
  (void)zplc_sched_core_set_running(&single->core);
  (void)zplc_sched_core_admit(&single->core, 0, port.now_us(single), ZPLC_SCHED_REF_BATCH_START);
  return zplc_sched_core_scan(&single->core, &port, order, 1U, step_mode, report);
}
