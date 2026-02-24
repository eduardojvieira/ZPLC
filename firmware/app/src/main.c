/**
 * @file main.c
 * @brief ZPLC Zephyr Runtime - Production Firmware
 *
 * SPDX-License-Identifier: MIT
 *
 * This is the main entry point for the ZPLC runtime on Zephyr OS.
 * On boot, it attempts to restore a previously saved program from Flash.
 * If no program is found, it waits for shell commands to load one.
 */

#include <zephyr/kernel.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_debug.h>
#include "zplc_config.h"

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_scheduler.h>
#endif

#include <string.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(main, LOG_LEVEL_INF);

/* ============================================================================
 * Configuration
 * ============================================================================
 */

/** @brief Number of GPIO output channels */
#define ZPLC_GPIO_OUTPUT_COUNT 4

/* ============================================================================
 * Legacy Single-Task Mode (when scheduler is disabled)
 * ============================================================================
 */

#ifndef CONFIG_ZPLC_SCHEDULER

/** @brief Program buffer for dynamic loading */
uint8_t program_buffer[4096];
size_t program_buffer_size = 4096;
volatile size_t program_expected_size = 0;
volatile size_t program_received_size = 0;
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

static void sync_opi_to_gpio(void) {
  for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
    uint8_t opi_value = (uint8_t)zplc_core_get_opi(i);
    zplc_hal_gpio_write(i, opi_value & 0x01);
  }
}

static int run_legacy_mode(void) {
  int ret;
  uint32_t tick_start, tick_end, elapsed;
  int instructions_executed;

  zplc_hal_log("[LEGACY] Single-task mode (scheduler disabled)\n");
  zplc_hal_log("[LEGACY] Waiting for program via shell. Use 'zplc help'.\n");

  /* Wait for a program to be loaded via shell */
  while (runtime_state == ZPLC_STATE_IDLE) {
    k_msleep(100);
  }

  /* Main execution loop */
  while (1) {
    tick_start = zplc_hal_tick();

    if (runtime_state == ZPLC_STATE_RUNNING) {
      instructions_executed = zplc_core_run_cycle();

      if (instructions_executed < 0) {
        zplc_hal_log("[ERR] Cycle %u: VM error %d\n", cycle_count,
                     zplc_core_get_error());
        runtime_state = ZPLC_STATE_ERROR;
      }

      sync_opi_to_gpio();

      if (cycle_count % 50 == 0) {
        zplc_hal_log("[RUN] Cycle %u: OPI[0]=%u\n", cycle_count,
                     (uint8_t)zplc_core_get_opi(0));
      }

      cycle_count++;
    }

    tick_end = zplc_hal_tick();
    elapsed = tick_end - tick_start;

    if (elapsed < 100) {
      zplc_hal_sleep(100 - elapsed);
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

/** @brief Persistence keys for saving program to NVS */
#define ZPLC_PERSIST_KEY_CODE "code"
#define ZPLC_PERSIST_KEY_LEN "code_len"

/** @brief Buffer for restored program (shared with shell) */
static uint8_t restored_program_buffer[0xB000];

/**
 * @brief Sync OPI to GPIO (called periodically from main thread)
 */
static void sync_opi_to_gpio(void) {
  for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
    uint8_t opi_value = zplc_opi_read8((uint16_t)i);
    zplc_hal_gpio_write(i, opi_value & 0x01);
  }
}

/**
 * @brief Try to restore a saved program from NVS.
 *
 * This function attempts to load a previously saved ZPLC program from
 * Flash storage. If successful, it registers the program with the
 * scheduler and starts execution.
 *
 * @return Number of tasks loaded (>0), 0 if no saved program, or negative
 * error.
 */
static int try_restore_saved_program(void) {
  uint32_t saved_len = 0;
  int ret;
  int task_count;

  zplc_hal_log("[RESTORE] Checking for saved program...\n");

  /* First, try to load the program length */
  ret = zplc_hal_persist_load(ZPLC_PERSIST_KEY_LEN, &saved_len,
                              sizeof(saved_len));
  if (ret != ZPLC_HAL_OK) {
    zplc_hal_log("[RESTORE] No saved program found (first boot)\n");
    return 0;
  }

  /* Validate the saved length */
  if (saved_len == 0 || saved_len > sizeof(restored_program_buffer)) {
    zplc_hal_log("[RESTORE] Invalid saved length: %u\n", saved_len);
    return 0;
  }

  /* Load the program bytecode */
  ret = zplc_hal_persist_load(ZPLC_PERSIST_KEY_CODE, restored_program_buffer,
                              saved_len);
  if (ret != ZPLC_HAL_OK) {
    zplc_hal_log("[RESTORE] Failed to load program bytecode\n");
    return 0;
  }

  zplc_hal_log("[RESTORE] Loaded %u bytes from Flash\n", saved_len);

  /* Validate the header - check for ZPLC magic */
  if (saved_len >= 4 && restored_program_buffer[0] == 'Z' &&
      restored_program_buffer[1] == 'P' && restored_program_buffer[2] == 'L' &&
      restored_program_buffer[3] == 'C') {

    /* It's a .zplc file with TASK segment - use zplc_sched_load */
    task_count = zplc_sched_load(restored_program_buffer, saved_len);

    if (task_count < 0) {
      zplc_hal_log("[RESTORE] Failed to parse .zplc file: %d\n", task_count);
      return task_count;
    }

    if (task_count == 0) {
      zplc_hal_log("[RESTORE] No tasks found in .zplc file\n");
      return 0;
    }

    /* Start the scheduler */
    zplc_sched_start();

    zplc_hal_log("[RESTORE] Restored %d tasks from Flash\n", task_count);
    return task_count;
  }

  /* Otherwise, treat as raw bytecode - register as single task */
  zplc_task_def_t task_def = {
      .id = 100, /* Restored task ID */
      .type = ZPLC_TASK_CYCLIC,
      .priority = 3,
      .interval_us = 500000, /* Slower default for restored tasks */
      .entry_point = 0,
      .stack_size = 256,      /* Set to 256 for stability */
  };

  ret = zplc_sched_register_task(&task_def, restored_program_buffer, saved_len);
  if (ret < 0) {
    zplc_hal_log("[RESTORE] Failed to register restored task: %d\n", ret);
    return ret;
  }

  /* Start the scheduler */
  zplc_sched_start();

  zplc_hal_log("[RESTORE] Restored raw program (%u bytes) as task\n",
               saved_len);
  return 1;
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

  /* Try to restore a previously saved program from NVS - DISABLED FOR DEBUGGING */
  // restored_tasks = try_restore_saved_program();
  restored_tasks = 0;

  if (restored_tasks > 0) {
    zplc_hal_log("[SCHED] Program restored from Flash. Running.\n");
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

  zplc_hal_log("[INIT] Starting Modbus TCP Server...\n");
  zplc_modbus_init();

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
