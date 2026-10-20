/**
 * @file main.c
 * @brief ZPLC Zephyr Runtime - Production Firmware
 *
 * SPDX-License-Identifier: MIT
 *
 * This is the main entry point for the ZPLC runtime on Zephyr OS.
 * On boot, it attempts to restore a previously saved program from Flash
 * in both scheduler and legacy single-task modes.
 * If no program is found, it waits for shell commands to load one.
 */

#include "zplc_comm_modbus_handler.h"
#include "program_admission.h"
#include "program_boot_restore.h"
#include "program_store.h"
#include "runtime_boot.h"
#include "zplc_config.h"
#include "zplc_lock.h"
#include "zplc_time.h"
#include "zplc_wifi_boot.h"
#include "zplc_wifi_link.h"
#include <zephyr/kernel.h>
#include <zplc_core.h>
#include <zplc_fw_identity.h>
#include <zplc_debug.h>
#include <zplc_failsafe.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>
#include <zplc_single_task.h>

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_scheduler.h>
#endif

#include <zephyr/fs/fs.h>
#ifdef CONFIG_WIFI
#include <zephyr/net/net_if.h>
#include <zephyr/net/wifi_mgmt.h>
#endif

#include "zplc_comm_cloud_handler.h"
#include "zplc_comm_modbus_handler.h"
#include "zplc_comm_mqtt_handler.h"
#include "zplc_config.h"
#include "zplc_time.h"
#include <zplc_core.h>

#include <errno.h>
#include <string.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_main, LOG_LEVEL_INF);

/* RT-013: the scan coordinator outranks every communication, logging and shell thread. The threads of this
 * application and the shell and log overrides are checked by zplc_config_check.h; these are the two Zephyr
 * subsystems whose default priority is cooperative and so outranks every preemptible thread. */
#ifdef CONFIG_ZPLC_SCHEDULER
BUILD_ASSERT(!IS_ENABLED(CONFIG_NETWORKING) ||
                 IS_ENABLED(CONFIG_NET_TC_THREAD_PREEMPTIVE),
             "the network RX/TX threads must be preemptible: a cooperative "
             "thread outranks the scan coordinator (CONFIG_NET_TC_THREAD_PREEMPTIVE=y)");
BUILD_ASSERT(CONFIG_SYSTEM_WORKQUEUE_PRIORITY > ZPLC_SCAN_COORDINATOR_PRIORITY,
             "the system work queue must run below the scan coordinator "
             "(CONFIG_SYSTEM_WORKQUEUE_PRIORITY)");
#endif

/* ============================================================================
 * Configuration
 * ============================================================================
 */

/* ============================================================================
 * Program Upload Buffer (shared by legacy and scheduler modes via shell_cmds.c)
 * ============================================================================
 */

/* Static backing store for shell-based bytecode upload. The scheduler build keeps ONE buffer of the code size:
 * the staging buffer receives an upload, is the workspace the program store commits from and restores into, and
 * holds the loaded artifact afterwards. The stored program is the resident copy: a reset reloads it from the store
 * (RT-028). The single-task build keeps a resident copy of its own. */
static uint8_t s_program_staging_buf[ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE];
#ifndef CONFIG_ZPLC_SCHEDULER
static uint8_t s_program_buf[ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE];
static uint8_t s_program_workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

/** @brief Pointer to the resident program buffer (extern in shell_cmds.c, single-task build) */
uint8_t *program_buffer = s_program_buf;
#endif
size_t program_buffer_size = ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE;
volatile size_t program_expected_size = 0;
volatile size_t program_received_size = 0;
uint8_t *program_staging_buffer = s_program_staging_buf;
volatile size_t program_staging_received_size = 0;

/* ============================================================================
 * Legacy Single-Task Mode (when scheduler is disabled)
 * ============================================================================
 */

#ifndef CONFIG_ZPLC_SCHEDULER
volatile uint32_t cycle_count = 0;
volatile int step_requested = 0;

typedef enum {
  ZPLC_STATE_IDLE = 0,
  ZPLC_STATE_LOADING,
  ZPLC_STATE_READY,
  ZPLC_STATE_RUNNING,
  ZPLC_STATE_PAUSED,
  ZPLC_STATE_ERROR,
} zplc_runtime_state_t;

volatile zplc_runtime_state_t runtime_state = ZPLC_STATE_IDLE;
K_MUTEX_DEFINE(legacy_runtime_lock);
K_SEM_DEFINE(legacy_runtime_wake, 0, 1);
uint32_t legacy_scan_interval_ms = 100U;

void zplc_legacy_wake(void) { k_sem_give(&legacy_runtime_wake); }

/* The one-task configuration of the scheduler core (RT-018): the scan of this runtime is the core's, with the same
 * input latch, deadline check, fault latch and safe state as the multitask scheduler. The loop below only releases
 * the task once per interval and keeps the run states. */
static zplc_single_task_t single_task;

/* Caller owns legacy_runtime_lock. Keep the logical process image and every
 * HAL output de-energized together on stop, reset, and VM faults. */
int zplc_legacy_apply_safe_outputs_locked(void) {
  /* The forces and the output image, then the pins at the safe level of the board description. */
  const int image_result = zplc_io_reset_image();
  const zplc_hal_result_t pins_result = zplc_io_drive_safe(NULL);

  return image_result != 0 ? image_result : (int)pins_result;
}

static int legacy_latch_boot_restore_failure(void) {
  int safe_result;
  int init_result;

  if (zplc_lock_take(&legacy_runtime_lock, "runtime lock") != 0) {
    return -EIO;
  }
  step_requested = 0;
  init_result = zplc_core_init();
  safe_result = zplc_legacy_apply_safe_outputs_locked();
  if (safe_result == 0 && init_result != 0) {
    safe_result = init_result;
  }
  runtime_state = ZPLC_STATE_ERROR;
  memset(program_buffer, 0, program_buffer_size);
  memset(program_staging_buffer, 0,
         program_buffer_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  program_expected_size = 0U;
  program_received_size = 0U;
  program_staging_received_size = 0U;
  k_mutex_unlock(&legacy_runtime_lock);
  zplc_legacy_wake();
  return safe_result;
}

/**
 * @brief Try to restore a saved program from NVS in legacy mode.
 *
 * @return 0 on success (program restored and ready), or negative on error.
 *         Returns 0 silently if no saved program exists.
 */
static int try_restore_legacy_program(void) {
  size_t saved_len = 0U;
  uint32_t restored_scan_interval_ms;
  int result;
  int ret;

  zplc_hal_log("[RESTORE] Checking for saved program...\n");

  result = zplc_boot_restore_legacy_prepare(
      program_staging_buffer, sizeof(s_program_staging_buf), s_program_workspace,
      sizeof(s_program_workspace), &saved_len, &restored_scan_interval_ms);
  if (result == ZPLC_BOOT_RESTORE_EMPTY) {
    if (zplc_lock_take(&legacy_runtime_lock, "runtime lock") != 0) {
      return -EIO;
    }
    ret = zplc_legacy_apply_safe_outputs_locked();
    if (ret != 0)
      runtime_state = ZPLC_STATE_ERROR;
    k_mutex_unlock(&legacy_runtime_lock);
    zplc_legacy_wake();
    if (ret != 0)
      return ret;
    zplc_hal_log("[RESTORE] No saved program found (first boot)\n");
    return 0;
  }
  if (result != ZPLC_BOOT_RESTORE_READY) {
    (void)legacy_latch_boot_restore_failure();
    zplc_hal_log("[RESTORE] Rejected or ambiguous saved program; runtime latched safe\n");
    return -EIO;
  }

  if (zplc_lock_take(&legacy_runtime_lock, "runtime lock") != 0) {
    (void)legacy_latch_boot_restore_failure();
    return -EIO;
  }
  ret = zplc_core_load(program_staging_buffer, saved_len, s_program_workspace,
                       sizeof(s_program_workspace));
  if (ret != 0) {
    k_mutex_unlock(&legacy_runtime_lock);
    (void)legacy_latch_boot_restore_failure();
    zplc_hal_log("[RESTORE] Failed to load verified program into VM: %d\n", ret);
    return ret;
  }

  memcpy(program_buffer, program_staging_buffer, saved_len);
  program_received_size = saved_len;
  legacy_scan_interval_ms = restored_scan_interval_ms;
  step_requested = 0;
  ret = zplc_legacy_apply_safe_outputs_locked();
  if (ret == 0) {
    runtime_state = ZPLC_STATE_READY;
  } else {
    runtime_state = ZPLC_STATE_ERROR;
  }
  k_mutex_unlock(&legacy_runtime_lock);
  zplc_legacy_wake();
  if (ret != 0) {
    /* The verified payload was copied before the physical safe-output
     * operation.  Do not leave that resident program recoverable when the
     * safe state itself could not be established. */
    (void)legacy_latch_boot_restore_failure();
    zplc_hal_log("[RESTORE] Failed to apply safe outputs: %d\n", ret);
    return ret;
  }
  zplc_hal_log("[RESTORE] Restored verified program (%zu bytes); waiting for zplc start\n",
               saved_len);
  return 0;
}

/* Restores the stored program into STOP (RT-022). A rejected program latches the runtime safe; the runtime still
 * started, so this is not a boot failure. */
static int boot_runtime_legacy(void) {
  int ret;

  zplc_hal_log("[LEGACY] Single-task mode (scheduler disabled)\n");

  /* Try to restore a previously saved program from NVS */
  ret = try_restore_legacy_program();
  if (ret == 0 && runtime_state == ZPLC_STATE_READY) {
    zplc_hal_log("[LEGACY] Program restored from Flash. Waiting for 'zplc start'.\n");
  } else {
    zplc_hal_log("[LEGACY] Waiting for program via shell. Use 'zplc help'.\n");
  }
  return 0;
}

static int run_legacy_mode(void) {
  uint32_t tick_start, tick_end, elapsed;
  uint32_t scan_interval_ms;

  zplc_single_task_init(&single_task, legacy_scan_interval_ms, ZPLC_SCHED_DEFAULT_MISS_LIMIT);

/* Main execution loop */
  while (1) {
    bool executed_cycle = false;
    bool wait_for_next_cycle = false;

    if (zplc_lock_take(&legacy_runtime_lock, "runtime lock") != 0) {
      /* Without the lock the loop cannot tell what the runtime is doing: the pins go safe and it tries again. */
      (void)zplc_io_drive_safe(NULL);
      k_msleep(100);
      continue;
    }
    /* A pending step is meaningful only while paused. */
    if (runtime_state == ZPLC_STATE_RUNNING) {
      step_requested = 0;
    }
    if (runtime_state == ZPLC_STATE_RUNNING ||
        (runtime_state == ZPLC_STATE_PAUSED && step_requested != 0)) {
      const bool stepping = runtime_state == ZPLC_STATE_PAUSED;
      zplc_sched_scan_report_t report;
      int scan_result;

      tick_start = zplc_hal_tick();
      if (stepping) {
        step_requested = 0;
      }
      if (cycle_count == 0U) {
        /* A start from READY or a reset: the first scan of a run, with nothing latched or counted before it. */
        zplc_single_task_clear(&single_task);
        zplc_single_task_begin(&single_task);
      }
      zplc_single_task_set_interval(&single_task, legacy_scan_interval_ms);
      scan_result = zplc_single_task_scan(&single_task, stepping ? 1 : 0, &report);

      if (scan_result < 0) {
        /* The image was reset and the pins driven safe by the core before it returned. */
        zplc_hal_log("[ERR] Cycle %u: scan failed %d (VM error %d)\n", cycle_count, scan_result,
                     zplc_core_get_error());
        runtime_state = ZPLC_STATE_ERROR;
      } else if (report.paused != 0U) {
        /* A breakpoint or a step: the pins are safe, the image and the forces stay (RT-017). */
        runtime_state = ZPLC_STATE_PAUSED;
      }
      if (report.warning_task >= 0) {
        zplc_hal_log("[WARN] Cycle %u: deadline missed (%u of %u in a row)\n", cycle_count,
                     (unsigned)single_task.slot[0].consecutive_misses, (unsigned)single_task.core.miss_limit);
      }

      if (cycle_count % 50 == 0) {
        zplc_hal_log("[RUN] Cycle %u: OPI[0]=%u\n", cycle_count,
                     (uint8_t)zplc_core_get_opi(0));
      }

      cycle_count++;
      executed_cycle = true;
      wait_for_next_cycle = runtime_state == ZPLC_STATE_RUNNING;
      scan_interval_ms = legacy_scan_interval_ms;
    }
    k_mutex_unlock(&legacy_runtime_lock);

    if (!executed_cycle) {
      (void)k_sem_take(&legacy_runtime_wake, K_FOREVER);
      continue;
    }
    if (wait_for_next_cycle) {
      tick_end = zplc_hal_tick();
      elapsed = tick_end - tick_start;
      (void)k_sem_take(&legacy_runtime_wake,
                       elapsed < scan_interval_ms
                           ? K_MSEC(scan_interval_ms - elapsed)
                           : K_NO_WAIT);
    }
  }

  return 0;
}

#endif /* !CONFIG_ZPLC_SCHEDULER */

/* ============================================================================
 * Scheduler Mode
 * ============================================================================
 */

#ifdef CONFIG_ZPLC_SCHEDULER

/**
 * @brief Try to restore a saved program from NVS.
 *
 * This function attempts to load a previously saved ZPLC program from
 * Flash storage. If successful, it registers the program with the
 * scheduler in READY state. Execution requires an explicit shell start.
 *
 * @return Number of tasks loaded (>0), 0 if no saved program, or negative
 * error.
 */
static int boot_runtime_scheduler(void) {
  int ret;
  int restored_tasks;
  size_t restored_size = 0U;

  zplc_hal_log("[SCHED] Multitask scheduler mode\n");

  /* Initialize scheduler */
  ret = zplc_sched_init();
  if (ret != 0) {
    zplc_hal_log("[SCHED] ERROR: Scheduler init failed: %d\n", ret);
    return ret;
  }

  /* Try to restore a previously saved program from NVS */
  restored_tasks = zplc_boot_restore_scheduler(
      program_staging_buffer, sizeof(s_program_staging_buf), &restored_size);
  program_received_size = restored_size;

  if (restored_tasks > 0) {
    zplc_hal_log("[SCHED] Program restored from Flash. Waiting for 'zplc start'.\n");
  } else if (restored_tasks == 0) {
    zplc_hal_log("[SCHED] Scheduler ready. Waiting for shell commands.\n");
    zplc_hal_log("[SCHED] Use 'zplc load <size>' then 'zplc data <hex>' to "
                 "load a program.\n");
    zplc_hal_log("[SCHED] Use 'zplc start' to begin execution.\n");
  } else {
    zplc_hal_log("[SCHED] ERROR: Saved program rejected; runtime is latched safe.\n");
    zplc_hal_log("[SCHED] Upload a verified replacement with 'zplc load <size>' "
                 "then 'zplc data <hex>'.\n");
  }

  zplc_hal_log("[SCHED] Shell available. Use 'zplc help' for commands.\n");
  return 0;
}

static int run_scheduler_mode(void) {
  while (1) {
    k_msleep(1000);
  }

  return 0;
}

#endif /* CONFIG_ZPLC_SCHEDULER */

/* ============================================================================
 * Main Entry Point
 * ============================================================================
 */

/* ============================================================================
 * Start-up plan (RT-024)
 * ============================================================================
 *
 * The runtime starts first: hardware, core, the scheduler with the program store and the restore of the stored
 * program into STOP. The shell, which is the control link, is started by Zephyr before main(). Only then do the
 * network and cloud services start, each of them allowed to fail: a service that does not come up is logged and
 * the runtime that is already up keeps running. zplc_boot_run() refuses a plan that starts a service before a
 * runtime step, and logs every step, so the boot log shows the order that ran.
 */

static int boot_hal(void) {
  int ret = zplc_hal_init();

  if (ret != ZPLC_HAL_OK) {
    zplc_hal_log("[INIT] ERROR: HAL init failed: %d\n", ret);
    return ret != 0 ? ret : -EIO;
  }
  return 0;
}

/* RT-021, RT-022: why the processor was reset, and what the previous run left. Whatever the cause, the runtime
 * restores the stored program into STOP and waits for a person's RUN command (D-13 option A): there is nothing in
 * the boot path that could start a scan, and zplc_reset_may_run() is the one place that says so. */
static int boot_reset_cause(void) {
  const zplc_reset_report_t *report;
  char reason[48];

  zplc_failsafe_boot();
  report = zplc_failsafe_report();
  zplc_hal_log("[RESET] Cause: %s%s\n", zplc_reset_cause_name(report->cause),
               report->reported != 0U ? "" : " (this part does not report one)");
  if (report->has_fault != 0U) {
    zplc_fault_record_reason_text(&report->fault, reason, sizeof(reason));
    zplc_hal_log("[RESET] The previous run stopped on a fault: %s (task %u, pc 0x%08x)\n", reason,
                 (unsigned int)report->fault.task_id, (unsigned int)report->fault.pc);
  }
  zplc_hal_log("[RESET] The runtime %s: RUN waits for a person's command\n",
               zplc_reset_may_run(report->cause) != 0 ? "may run" : "stays in STOP");
  return 0;
}

static int boot_core(void) {
  int ret = zplc_core_init();

  if (ret != 0) {
    zplc_hal_log("[INIT] ERROR: Core init failed: %d\n", ret);
  }
  return ret;
}

#ifdef CONFIG_ZPLC_SCHEDULER
#define boot_runtime boot_runtime_scheduler
#else
#define boot_runtime boot_runtime_legacy
#endif

static int boot_config(void) {
  zplc_config_init();
  return 0;
}

#include "zplc_wifi_boot.inc"

static int boot_network(void) {
  char ip_buf[16];
  zplc_hal_result_t result = zplc_hal_net_init();

  /* HIL-010.32: with credentials stored, the board joins by itself and again after a drop, in a work item. */
  zplc_wifi_boot_start();

  if (zplc_hal_net_get_ip(ip_buf, sizeof(ip_buf)) == ZPLC_HAL_OK) {
    zplc_hal_log("[INIT] IP Address: %s\n", ip_buf);
  } else {
    zplc_hal_log("[INIT] Networking active (DHCP pending...)\n");
  }
  return result == ZPLC_HAL_OK || result == ZPLC_HAL_NOT_IMPL ? 0 : -EIO;
}

static int boot_time(void) {
  zplc_hal_log("[INIT] Synchronizing RTC via SNTP...\n");
  return zplc_time_init();
}

static int boot_fieldbus(void) {
#ifdef CONFIG_MODBUS
  int result;
  int handler;

  zplc_hal_log("[INIT] Starting Modbus communication services...\n");
  result = zplc_modbus_init();
  handler = zplc_comm_modbus_handler_init();
  if (handler != 0) {
    zplc_hal_log("[INIT] ERROR: Modbus Handler init failed: %d\n", handler);
  }
  return result != 0 ? result : handler;
#else
  zplc_hal_log("[INIT] Modbus features disabled for this board build.\n");
  return 0;
#endif
}

static int boot_cloud(void) {
#ifdef CONFIG_MQTT_LIB
  int result;
  int rc;

  zplc_hal_log("[INIT] Starting MQTT Client...\n");
  result = zplc_mqtt_init();
  if (result != 0) {
    zplc_hal_log("[INIT] ERROR: MQTT init failed: %d\n", result);
    return result;
  }

  if (zplc_config_get_mqtt_enabled()) {
    rc = zplc_comm_mqtt_handler_init();
    if (rc != 0) {
      zplc_hal_log("[INIT] ERROR: MQTT Handler init failed: %d\n", rc);
      result = rc;
    }
    rc = zplc_comm_cloud_handler_init();
    if (rc != 0) {
      zplc_hal_log("[INIT] ERROR: Cloud Handler init failed: %d\n", rc);
      if (result == 0) {
        result = rc;
      }
    }
  }

  (void)zplc_azure_dps_provision();
  (void)zplc_aws_fleet_provision();
  return result;
#else
  zplc_hal_log("[INIT] MQTT/Cloud features disabled for this board build.\n");
  return 0;
#endif
}

static const zplc_boot_step_t boot_runtime_steps[] = {
    {"hal", ZPLC_BOOT_RUNTIME, boot_hal},
    {"reset cause", ZPLC_BOOT_RUNTIME, boot_reset_cause},
    {"core", ZPLC_BOOT_RUNTIME, boot_core},
    {"scheduler and stored program", ZPLC_BOOT_RUNTIME, boot_runtime},
};

static const zplc_boot_step_t boot_service_steps[] = {
    {"configuration", ZPLC_BOOT_SERVICE, boot_config},
    {"network", ZPLC_BOOT_SERVICE, boot_network},
    {"time", ZPLC_BOOT_SERVICE, boot_time},
    {"fieldbus", ZPLC_BOOT_SERVICE, boot_fieldbus},
    {"cloud", ZPLC_BOOT_SERVICE, boot_cloud},
};

static void start_services(void) {
  zplc_boot_report_t report;

  (void)zplc_boot_run(boot_service_steps, ARRAY_SIZE(boot_service_steps), &report);
  zplc_hal_log("[INIT] Services started (%u of %u failed). Shell ready. Use 'zplc help' for commands.\n\n",
               (unsigned)report.service_failures,
               (unsigned)ARRAY_SIZE(boot_service_steps));
#ifdef CONFIG_ZPLC_HIL_DEBUG
#ifdef CONFIG_ZPLC_SCHEDULER
  hil_send_ready(zplc_core_version(), "sched,hil");
#else
  hil_send_ready(zplc_core_version(), "hil");
#endif
#endif
}

#ifndef CONFIG_ZPLC_SCHEDULER
/* The legacy runtime is the main thread's scan loop, which the services must not delay: they start on a thread of
 * their own, at the priority of the other communication threads. */
static void services_thread_entry(void *arg1, void *arg2, void *arg3) {
  ARG_UNUSED(arg1);
  ARG_UNUSED(arg2);
  ARG_UNUSED(arg3);
  start_services();
}

K_THREAD_STACK_DEFINE(services_thread_stack, 4096);
static struct k_thread services_thread;
#endif

int main(void) {
  zplc_boot_report_t report;
  int ret;

  /* ===== Banner ===== */
  zplc_hal_log("\n");
  zplc_hal_log("================================================\n");
  zplc_hal_log("  ZPLC Runtime - Zephyr Target\n");
  zplc_hal_log("  Core Version: %s\n", zplc_core_version());
  zplc_hal_log("  Commit:       %s%s\n", ZPLC_FW_COMMIT,
               ZPLC_FW_DIRTY != 0 ? " (dirty)" : "");
#ifdef CONFIG_ZPLC_SCHEDULER
  zplc_hal_log("  Mode: Multitask Scheduler\n");
#else
  zplc_hal_log("  Mode: Single Task (Legacy)\n");
#endif
  zplc_hal_log("================================================\n");
  zplc_hal_log("  Stack Depth:  %d\n", ZPLC_STACK_MAX_DEPTH);
  zplc_hal_log("  Call Depth:   %d\n", ZPLC_CALL_STACK_MAX);
  zplc_hal_log("  Work Memory:  %u bytes\n", (unsigned)ZPLC_MEM_WORK_SIZE);
  zplc_hal_log("  Code Max:     %u bytes\n", (unsigned)ZPLC_MEM_CODE_SIZE);
  zplc_hal_log("================================================\n\n");

  /* ===== The runtime ===== */
  ret = zplc_boot_run(boot_runtime_steps, ARRAY_SIZE(boot_runtime_steps), &report);
  if (ret != 0) {
    return ret;
  }

  /* ===== The services, and then the run loop ===== */
#ifdef CONFIG_ZPLC_SCHEDULER
  start_services();
  return run_scheduler_mode();
#else
  (void)k_thread_create(&services_thread, services_thread_stack,
                        K_THREAD_STACK_SIZEOF(services_thread_stack),
                        services_thread_entry, NULL, NULL, NULL,
                        K_PRIO_PREEMPT(ZPLC_COMM_THREAD_PRIORITY), 0, K_NO_WAIT);
  return run_legacy_mode();
#endif
}
