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
#include "program_store.h"
#include "zplc_config.h"
#include "zplc_time.h"
#include <zephyr/kernel.h>
#include <zplc_core.h>
#include <zplc_debug.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_scheduler.h>
#endif

#include <zephyr/fs/fs.h>

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

/* ============================================================================
 * Configuration
 * ============================================================================
 */

/** @brief Number of GPIO output channels */
#define ZPLC_GPIO_OUTPUT_COUNT 4

/* ============================================================================
 * Program Upload Buffer (shared by legacy and scheduler modes via shell_cmds.c)
 * ============================================================================
 */

/** @brief Static backing store for shell-based bytecode upload */
static uint8_t s_program_buf[ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE];
static uint8_t s_program_staging_buf[ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE];
#ifndef CONFIG_ZPLC_SCHEDULER
static uint8_t s_program_workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
#endif

/** @brief Pointer to the program buffer (extern in shell_cmds.c) */
uint8_t *program_buffer = s_program_buf;
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

static int sync_opi_to_gpio(void) {
  int first_error = 0;
  for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
    uint8_t opi_value = (uint8_t)zplc_core_get_opi(i);
    zplc_hal_result_t result = zplc_hal_gpio_write(i, opi_value & 0x01);
    if (result != ZPLC_HAL_OK && result != ZPLC_HAL_NOT_IMPL &&
        first_error == 0) {
      first_error = (int)result;
    }
  }
  return first_error;
}

/* Caller owns legacy_runtime_lock. Keep the logical process image and every
 * HAL output de-energized together on stop, reset, and VM faults. */
int zplc_legacy_apply_safe_outputs_locked(void) {
  uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
  int first_error = 0;

  zplc_force_clear_all();
  if (opi == NULL) {
    first_error = -1;
  } else {
    memset(opi, 0, ZPLC_MEM_OPI_SIZE);
  }
  for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
    zplc_hal_result_t result = zplc_hal_gpio_write(i, 0U);
    if (result != ZPLC_HAL_OK && result != ZPLC_HAL_NOT_IMPL &&
        first_error == 0) {
      first_error = (int)result;
    }
  }
  return first_error;
}

/**
 * @brief Try to restore a saved program from NVS in legacy mode.
 *
 * @return 0 on success (program restored and ready), or negative on error.
 *         Returns 0 silently if no saved program exists.
 */
static int try_restore_legacy_program(void) {
  size_t saved_len = 0U;
  zplc_program_store_restore_t restore;
  uint32_t restored_scan_interval_ms;
  int ret;

  zplc_hal_log("[RESTORE] Checking for saved program...\n");

  restore = zplc_program_store_restore(program_staging_buffer,
                                       sizeof(s_program_staging_buf), &saved_len);
  if (restore == ZPLC_PROGRAM_STORE_EMPTY) {
    zplc_hal_log("[RESTORE] No saved program found (first boot)\n");
    return 0;
  }
  if (restore == ZPLC_PROGRAM_STORE_ERROR) {
    zplc_hal_log("[RESTORE] Program store unavailable or failed\n");
    return 0;
  }

  ret = zplc_program_admit_legacy(program_staging_buffer, saved_len,
                                  s_program_workspace,
                                  sizeof(s_program_workspace),
                                  &restored_scan_interval_ms);
  if (ret != 0) {
    zplc_hal_log("[RESTORE] Rejected saved .zplc program: %d\n", ret);
    return ret;
  }

  if (restore == ZPLC_PROGRAM_STORE_LEGACY &&
      zplc_program_store_commit(program_staging_buffer, saved_len,
                                sizeof(s_program_staging_buf)) != 0) {
    zplc_hal_log("[RESTORE] Legacy migration failed; keeping outputs safe\n");
    return -EIO;
  }

  k_mutex_lock(&legacy_runtime_lock, K_FOREVER);
  ret = zplc_core_load(program_staging_buffer, saved_len, s_program_workspace,
                       sizeof(s_program_workspace));
  if (ret != 0) {
    k_mutex_unlock(&legacy_runtime_lock);
    zplc_hal_log("[RESTORE] Failed to load verified program into VM: %d\n", ret);
    return ret;
  }

  memcpy(program_buffer, program_staging_buffer, saved_len);
  program_received_size = saved_len;
  legacy_scan_interval_ms = restored_scan_interval_ms;
  step_requested = 0;
  ret = zplc_legacy_apply_safe_outputs_locked();
  runtime_state = ret == 0 ? ZPLC_STATE_READY : ZPLC_STATE_ERROR;
  k_mutex_unlock(&legacy_runtime_lock);
  zplc_legacy_wake();
  if (ret != 0) {
    zplc_hal_log("[RESTORE] Failed to apply safe outputs: %d\n", ret);
    return ret;
  }
  zplc_hal_log("[RESTORE] Restored verified program (%zu bytes); waiting for zplc start\n",
               saved_len);
  return 0;
}

static int run_legacy_mode(void) {
  int ret;
  uint32_t tick_start, tick_end, elapsed;
  uint32_t scan_interval_ms;
  int instructions_executed;

  zplc_hal_log("[LEGACY] Single-task mode (scheduler disabled)\n");

  /* Try to restore a previously saved program from NVS */
  ret = try_restore_legacy_program();
  if (ret == 0 && runtime_state == ZPLC_STATE_READY) {
    zplc_hal_log("[LEGACY] Program restored from Flash. Waiting for 'zplc start'.\n");
  } else {
    zplc_hal_log("[LEGACY] Waiting for program via shell. Use 'zplc help'.\n");
  }

  /* Main execution loop */
  while (1) {
    bool executed_cycle = false;
    bool wait_for_next_cycle = false;

    k_mutex_lock(&legacy_runtime_lock, K_FOREVER);
    /* A pending step is meaningful only while paused. */
    if (runtime_state == ZPLC_STATE_RUNNING) {
      step_requested = 0;
    }
    if (runtime_state == ZPLC_STATE_RUNNING ||
        (runtime_state == ZPLC_STATE_PAUSED && step_requested != 0)) {
      tick_start = zplc_hal_tick();
      if (runtime_state == ZPLC_STATE_PAUSED) {
        step_requested = 0;
      }
      instructions_executed = zplc_core_run_cycle();

      if (instructions_executed < 0) {
        zplc_hal_log("[ERR] Cycle %u: VM error %d\n", cycle_count,
                     zplc_core_get_error());
        ret = zplc_legacy_apply_safe_outputs_locked();
        runtime_state = ZPLC_STATE_ERROR;
        if (ret != 0) {
          zplc_hal_log("[ERR] Failed to apply safe outputs: %d\n", ret);
        }
      } else {
        ret = sync_opi_to_gpio();
        if (ret != 0) {
          zplc_hal_log("[ERR] Failed to synchronize outputs: %d\n", ret);
          ret = zplc_legacy_apply_safe_outputs_locked();
          runtime_state = ZPLC_STATE_ERROR;
          if (ret != 0) {
            zplc_hal_log("[ERR] Failed to apply safe outputs: %d\n", ret);
          }
        }
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
static int try_restore_saved_program(void) {
  size_t saved_len = 0U;
  zplc_program_store_restore_t restore;
  int ret;
  int task_count;

  zplc_hal_log("[RESTORE] Checking for saved program...\n");

  restore = zplc_program_store_restore(program_staging_buffer,
                                       sizeof(s_program_staging_buf), &saved_len);
  if (restore == ZPLC_PROGRAM_STORE_EMPTY) {
    zplc_hal_log("[RESTORE] No saved program found (first boot)\n");
    return 0;
  }
  if (restore == ZPLC_PROGRAM_STORE_ERROR) {
    zplc_hal_log("[RESTORE] Program store unavailable or failed\n");
    return 0;
  }

  zplc_hal_log("[RESTORE] Loaded %zu bytes from Flash\n", saved_len);

  /* Validate the header - check for ZPLC magic */
  if (saved_len >= 4 && program_staging_buffer[0] == 'Z' &&
      program_staging_buffer[1] == 'P' && program_staging_buffer[2] == 'L' &&
      program_staging_buffer[3] == 'C') {

    /* It's a .zplc file with TASK segment - use zplc_sched_load */
    ret = zplc_sched_validate_program(program_staging_buffer, saved_len);
    if (ret != ZPLC_LOADER_OK) {
      zplc_hal_log("[RESTORE] Rejected saved .zplc program: %d\n", ret);
      return ret;
    }
    if (restore == ZPLC_PROGRAM_STORE_LEGACY &&
        zplc_program_store_commit(program_staging_buffer, saved_len,
                                  sizeof(s_program_staging_buf)) != 0) {
      zplc_hal_log("[RESTORE] Legacy migration failed; keeping outputs safe\n");
      return -EIO;
    }
    task_count = zplc_sched_load(program_staging_buffer, saved_len);

    if (task_count < 0) {
      zplc_hal_log("[RESTORE] Failed to parse .zplc file: %d\n", task_count);
      return task_count;
    }

    if (task_count == 0) {
      zplc_hal_log("[RESTORE] No tasks found in .zplc file\n");
      return 0;
    }

    memcpy(program_buffer, program_staging_buffer, saved_len);
    program_received_size = saved_len;

    zplc_hal_log("[RESTORE] Restored %d tasks from Flash; waiting for zplc start\n",
                 task_count);
    return task_count;
  }

  zplc_hal_log("[RESTORE] Rejected saved payload without .zplc header\n");
  return -EINVAL;
}

static int run_scheduler_mode(void) {
  int ret;
  int restored_tasks;

  zplc_hal_log("[SCHED] Multitask scheduler mode\n");

  /* Initialize scheduler */
  ret = zplc_sched_init();
  if (ret != 0) {
    zplc_hal_log("[SCHED] ERROR: Scheduler init failed: %d\n", ret);
    return ret;
  }

  /* Try to restore a previously saved program from NVS */
  restored_tasks = try_restore_saved_program();

  if (restored_tasks > 0) {
    zplc_hal_log("[SCHED] Program restored from Flash. Waiting for 'zplc start'.\n");
  } else {
    zplc_hal_log("[SCHED] Scheduler ready. Waiting for shell commands.\n");
    zplc_hal_log("[SCHED] Use 'zplc load <size>' then 'zplc data <hex>' to "
                 "load a program.\n");
    zplc_hal_log("[SCHED] Use 'zplc start' to begin execution.\n");
  }

  zplc_hal_log("[SCHED] Shell available. Use 'zplc help' for commands.\n");

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

int main(void) {
  int ret;
  int rc;

  /* ===== Banner ===== */
  zplc_hal_log("\n");
  zplc_hal_log("================================================\n");
  zplc_hal_log("  ZPLC Runtime - Zephyr Target\n");
  zplc_hal_log("  Core Version: %s\n", zplc_core_version());
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

  /* ===== System Initialization ===== */
  zplc_hal_log("[INIT] Initializing HAL...\n");
  ret = zplc_hal_init();
  if (ret != ZPLC_HAL_OK) {
    zplc_hal_log("[INIT] ERROR: HAL init failed: %d\n", ret);
    return ret;
  }

  zplc_hal_log("[INIT] Initializing VM Core...\n");
  ret = zplc_core_init();
  if (ret != 0) {
    zplc_hal_log("[INIT] ERROR: Core init failed: %d\n", ret);
    return ret;
  }

  /* ===== Industrial Networking Foundation (Phase 1.4.1) ===== */
  zplc_hal_log("[INIT] Initializing Configuration Manager...\n");
  zplc_config_init();

  zplc_hal_log("[INIT] Initializing Networking HAL...\n");
  zplc_hal_net_init();

  char ip_buf[16];
  if (zplc_hal_net_get_ip(ip_buf, sizeof(ip_buf)) == ZPLC_HAL_OK) {
    zplc_hal_log("[INIT] IP Address: %s\n", ip_buf);
  } else {
    zplc_hal_log("[INIT] Networking active (DHCP pending...)\n");
  }

  zplc_hal_log("[INIT] Synchronizing RTC via SNTP...\n");
  zplc_time_init();

#ifdef CONFIG_MODBUS
  zplc_hal_log("[INIT] Starting Modbus communication services...\n");
  zplc_modbus_init();
  rc = zplc_comm_modbus_handler_init();
  if (rc != 0) {
    zplc_hal_log("[INIT] ERROR: Modbus Handler init failed: %d\n", rc);
  }
#else
  zplc_hal_log("[INIT] Modbus features disabled for this board build.\n");
#endif

#ifdef CONFIG_MQTT_LIB
  zplc_hal_log("[INIT] Starting MQTT Client...\n");
  ret = zplc_mqtt_init();
  if (ret != 0) {
    zplc_hal_log("[INIT] ERROR: MQTT init failed: %d\n", ret);
    return ret;
  }

  if (zplc_config_get_mqtt_enabled()) {
    rc = zplc_comm_mqtt_handler_init();
    if (rc != 0) {
      zplc_hal_log("[INIT] ERROR: MQTT Handler init failed: %d\n", rc);
    }
    rc = zplc_comm_cloud_handler_init();
    if (rc != 0) {
      zplc_hal_log("[INIT] ERROR: Cloud Handler init failed: %d\n", rc);
    }
  }

  (void)zplc_azure_dps_provision();
  (void)zplc_aws_fleet_provision();
#else
  zplc_hal_log("[INIT] MQTT/Cloud features disabled for this board build.\n");
#endif

  zplc_hal_log("[INIT] Shell ready. Use 'zplc help' for commands.\n\n");

#ifdef CONFIG_ZPLC_HIL_DEBUG
#ifdef CONFIG_ZPLC_SCHEDULER
  hil_send_ready(zplc_core_version(), "sched,hil");
#else
  hil_send_ready(zplc_core_version(), "hil");
#endif
#endif

  /* ===== Run appropriate mode ===== */
#ifdef CONFIG_ZPLC_SCHEDULER
  return run_scheduler_mode();
#else
  return run_legacy_mode();
#endif
}
