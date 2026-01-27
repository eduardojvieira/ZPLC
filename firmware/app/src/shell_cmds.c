/**
 * @file shell_cmds.c
 * @brief ZPLC Shell Commands for Serial Upload and Debugging
 *
 * SPDX-License-Identifier: MIT
 *
 * This file provides shell commands for loading, running, and debugging ZPLC
 * programs over a serial connection. This enables the "Click-to-Run"
 * workflow from the IDE.
 *
 * Commands:
 *   zplc load <size>   - Prepare to receive <size> bytes of bytecode
 *   zplc data <hex>    - Receive a chunk of hex-encoded bytecode
 *   zplc start         - Start VM execution
 *   zplc stop          - Stop VM execution
 *   zplc status [--json] - Show VM state and statistics (JSON for IDE)
 *   zplc reset         - Reset VM to initial state
 *
 * Debug Commands:
 *   zplc dbg pause     - Pause VM at next cycle boundary
 *   zplc dbg resume    - Resume VM execution
 *   zplc dbg step      - Execute exactly one cycle
 *   zplc dbg peek <addr> [len] - Read memory (hex dump)
 *   zplc dbg poke <addr> <val> - Write byte to IPI memory
 *   zplc dbg info [--json]     - Show detailed VM state (JSON for IDE)
 *
 * System Commands:
 *   zplc sys info [--json] - Show board, version, and capabilities
 *
 * Scheduler Commands (when CONFIG_ZPLC_SCHEDULER=y):
 *   zplc sched status  - Show scheduler statistics
 *   zplc sched tasks   - List all registered tasks
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/sys/reboot.h>
#include <zephyr/version.h>
#include <zplc_core.h>
#include <zplc_hal.h>

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_scheduler.h>
#endif

#include <ctype.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <zplc_debug.h>
#include <zplc_loader.h>

/* ============================================================================
 * JSON Output Helpers (no malloc, uses shell_print directly)
 * ============================================================================
 */

/**
 * @brief Helper structure for building JSON output without dynamic allocation.
 *
 * Uses shell_print for each field. The IDE parses the complete JSON block.
 * All output goes through the shell to maintain compatibility with the
 * existing serial protocol.
 */

/** Print the start of a JSON object */
#define JSON_OBJ_START(sh) shell_fprintf(sh, SHELL_NORMAL, "{")
#define JSON_OBJ_END(sh) shell_fprintf(sh, SHELL_NORMAL, "}")
#define JSON_ARRAY_START(sh) shell_fprintf(sh, SHELL_NORMAL, "[")
#define JSON_ARRAY_END(sh) shell_fprintf(sh, SHELL_NORMAL, "]")
#define JSON_COMMA(sh) shell_fprintf(sh, SHELL_NORMAL, ",")
#define JSON_NEWLINE(sh) shell_fprintf(sh, SHELL_NORMAL, "\n")

/** Print a JSON string field: "key": "value" */
static inline void json_str(const struct shell *sh, const char *key,
                            const char *val, bool comma) {
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":\"%s\"%s", key, val,
                comma ? "," : "");
}

/** Print a JSON integer field: "key": value */
static inline void json_int(const struct shell *sh, const char *key,
                            int32_t val, bool comma) {
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":%d%s", key, val, comma ? "," : "");
}

/** Print a JSON unsigned field: "key": value */
static inline void json_uint(const struct shell *sh, const char *key,
                             uint32_t val, bool comma) {
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":%u%s", key, val, comma ? "," : "");
}

/** Print a JSON boolean field: "key": true/false */
static inline void json_bool(const struct shell *sh, const char *key, bool val,
                             bool comma) {
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":%s%s", key, val ? "true" : "false",
                comma ? "," : "");
}

/** Check if --json flag is present in arguments */
static bool has_json_flag(size_t argc, char **argv) {
  for (size_t i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--json") == 0 || strcmp(argv[i], "-j") == 0) {
      return true;
    }
  }
  return false;
}

/* ============================================================================
 * Mode-specific Definitions
 * ============================================================================
 */

#ifdef CONFIG_ZPLC_SCHEDULER

/*
 * SCHEDULER MODE
 *
 * In scheduler mode, the shell commands provide status info about
 * the scheduler and tasks. Dynamic program loading goes through the
 * scheduler API, not the legacy buffer system.
 */

/** @brief Persistence keys for saving program to NVS */
#define ZPLC_PERSIST_KEY_CODE "code"
#define ZPLC_PERSIST_KEY_LEN "code_len"

/* Local state for dynamic task loading */
static uint8_t shell_program_buffer[0xB000];
static size_t shell_buffer_size = sizeof(shell_program_buffer);
static size_t shell_expected_size = 0;
static size_t shell_received_size = 0;

typedef enum {
  SHELL_STATE_IDLE = 0,
  SHELL_STATE_LOADING,
  SHELL_STATE_READY,
} shell_load_state_t;

static shell_load_state_t shell_load_state = SHELL_STATE_IDLE;

/* Dynamic task ID (for shell-loaded programs) */
static int shell_task_id = -1;

#else /* Legacy mode */

/*
 * LEGACY MODE
 *
 * In legacy mode, shell commands control the single-task execution
 * loop in main.c via shared extern variables.
 */

/** @brief Persistence keys for saving program to NVS */
#define ZPLC_PERSIST_KEY_CODE "code"
#define ZPLC_PERSIST_KEY_LEN "code_len"

/* VM state enum - must match main.c */
typedef enum {
  ZPLC_STATE_IDLE = 0, /* No program loaded or stopped */
  ZPLC_STATE_LOADING,  /* Receiving bytecode */
  ZPLC_STATE_READY,    /* Program loaded, ready to run */
  ZPLC_STATE_RUNNING,  /* VM executing */
  ZPLC_STATE_PAUSED,   /* Paused for debugging */
  ZPLC_STATE_ERROR,    /* Error occurred */
} zplc_runtime_state_t;

/* Functions and variables exposed by main.c (legacy mode only) */
extern uint8_t program_buffer[];
extern size_t program_buffer_size;
extern volatile zplc_runtime_state_t runtime_state;
extern volatile size_t program_expected_size;
extern volatile size_t program_received_size;
extern volatile uint32_t cycle_count;
extern volatile int step_requested;

#endif /* CONFIG_ZPLC_SCHEDULER */

/* ============================================================================
 * Helper Functions
 * ============================================================================
 */

/**
 * @brief Convert a hex character to its nibble value.
 * @return 0-15 on success, -1 on invalid character
 */
static int hex_char_to_nibble(char c) {
  if (c >= '0' && c <= '9')
    return c - '0';
  if (c >= 'a' && c <= 'f')
    return c - 'a' + 10;
  if (c >= 'A' && c <= 'F')
    return c - 'A' + 10;
  return -1;
}

/**
 * @brief Decode a hex string into binary data.
 * @param hex Input hex string (must be even length)
 * @param out Output buffer
 * @param max_out Maximum bytes to write
 * @return Number of bytes decoded, or -1 on error
 */
static int hex_decode(const char *hex, uint8_t *out, size_t max_out) {
  size_t hex_len = strlen(hex);
  size_t out_len = 0;

  /* Hex string must have even length */
  if (hex_len % 2 != 0) {
    return -1;
  }

  for (size_t i = 0; i < hex_len && out_len < max_out; i += 2) {
    int hi = hex_char_to_nibble(hex[i]);
    int lo = hex_char_to_nibble(hex[i + 1]);

    if (hi < 0 || lo < 0) {
      return -1;
    }

    out[out_len++] = (uint8_t)((hi << 4) | lo);
  }

  return (int)out_len;
}

#ifndef CONFIG_ZPLC_SCHEDULER
/**
 * @brief Get human-readable state name (legacy mode).
 */
static const char *state_name(zplc_runtime_state_t state) {
  switch (state) {
  case ZPLC_STATE_IDLE:
    return "IDLE";
  case ZPLC_STATE_LOADING:
    return "LOADING";
  case ZPLC_STATE_READY:
    return "READY";
  case ZPLC_STATE_RUNNING:
    return "RUNNING";
  case ZPLC_STATE_PAUSED:
    return "PAUSED";
  case ZPLC_STATE_ERROR:
    return "ERROR";
  default:
    return "UNKNOWN";
  }
}
#endif

/* ============================================================================
 * Shell Command Handlers - Common
 * ============================================================================
 */

/**
 * @brief Handler for 'zplc version'
 *
 * Shows version information.
 */
static int cmd_zplc_version(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  shell_print(sh, "ZPLC Runtime v%s", zplc_core_version());
#ifdef CONFIG_ZPLC_SCHEDULER
  shell_print(sh, "Mode: Multitask Scheduler");
  shell_print(sh, "Max Tasks: %d", CONFIG_ZPLC_MAX_TASKS);
#else
  shell_print(sh, "Mode: Single Task (Legacy)");
  shell_print(sh, "Buffer: %zu bytes", program_buffer_size);
#endif
  return 0;
}

/* ============================================================================
 * Shell Command Handlers - Scheduler Mode
 * ============================================================================
 */

#ifdef CONFIG_ZPLC_SCHEDULER

/**
 * @brief Handler for 'zplc load <size>' (scheduler mode)
 */
static int cmd_zplc_load(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc load <size>");
    return -EINVAL;
  }

  char *endptr;
  unsigned long size = strtoul(argv[1], &endptr, 10);

  if (*endptr != '\0' || size == 0) {
    shell_error(sh, "ERROR: Invalid size");
    return -EINVAL;
  }

  if (size > shell_buffer_size) {
    shell_error(sh, "ERROR: Size %lu exceeds buffer (%zu bytes)", size,
                shell_buffer_size);
    return -ENOMEM;
  }

  /* Clear buffer and prepare for loading */
  memset(shell_program_buffer, 0, shell_buffer_size);
  shell_expected_size = size;
  shell_received_size = 0;
  shell_load_state = SHELL_STATE_LOADING;

  shell_print(sh, "OK: Ready to receive %lu bytes", size);
  return 0;
}

/**
 * @brief Handler for 'zplc data <hex>' (scheduler mode)
 */
static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc data <hex>");
    return -EINVAL;
  }

  if (shell_load_state != SHELL_STATE_LOADING) {
    shell_error(sh, "ERROR: Not in loading state (use 'zplc load' first)");
    return -EINVAL;
  }

  const char *hex = argv[1];
  size_t remaining = shell_expected_size - shell_received_size;

  int decoded =
      hex_decode(hex, shell_program_buffer + shell_received_size, remaining);

  if (decoded < 0) {
    shell_error(sh, "ERROR: Invalid hex data");
    shell_load_state = SHELL_STATE_IDLE;
    return -EINVAL;
  }

  shell_received_size += decoded;

  if (shell_received_size >= shell_expected_size) {
    shell_load_state = SHELL_STATE_READY;
    shell_print(sh, "OK: Received %zu/%zu bytes (complete)",
                shell_received_size, shell_expected_size);
  } else {
    shell_print(sh, "OK: Received %zu/%zu bytes", shell_received_size,
                shell_expected_size);
  }

  return 0;
}

/**
 * @brief Handler for 'zplc start' (scheduler mode)
 *
 * Registers the loaded program as a new task and starts it.
 * If the program is a .zplc file with TASK segment, loads all tasks.
 */
static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  if (shell_load_state != SHELL_STATE_READY) {
    shell_error(sh, "ERROR: No program loaded");
    return -EINVAL;
  }

  /* Stop existing tasks */
  if (shell_task_id >= 0) {
    zplc_sched_unregister_task(shell_task_id);
    shell_task_id = -1;
  }
  
  /* Try to load as ZPLC file with tasks */
  int loader_ret = zplc_loader_load(shell_program_buffer, shell_received_size);
  
  if (loader_ret == ZPLC_LOADER_OK) {
      /* Success! Tasks registered by loader. */
      /* Start the scheduler */
      zplc_sched_start();
      
      /* Save program to NVS */
      uint32_t len32 = (uint32_t)shell_received_size;
      zplc_hal_persist_save(ZPLC_PERSIST_KEY_LEN, &len32, sizeof(len32));
      zplc_hal_persist_save(ZPLC_PERSIST_KEY_CODE, shell_program_buffer, shell_received_size);
      
      shell_load_state = SHELL_STATE_IDLE;
      shell_print(sh, "OK: Loaded ZPLC file with tasks");
      return 0;
  } 
  
  /* Not a ZPLC file or magic mismatch? Try legacy mode if magic error */
  if (loader_ret != ZPLC_LOADER_ERR_MAGIC) {
      shell_error(sh, "ERROR: ZPLC Load Failed: %d", loader_ret);
      return loader_ret;
  }

  /* Legacy single-task mode: register raw bytecode as a single task */
  shell_print(sh, "WARN: Raw bytecode detected (Legacy mode)");
  shell_print(sh, "DEBUG: Magic read: %02X %02X %02X %02X",
              shell_program_buffer[0], shell_program_buffer[1],
              shell_program_buffer[2], shell_program_buffer[3]);

  /* Create task definition for shell-loaded program */
  zplc_task_def_t task_def = {
      .id = 99, /* Shell task ID */
      .type = ZPLC_TASK_CYCLIC,
      .priority = 3,
      .interval_us = 50000, /* 50ms - Real-time speed */
      .entry_point = 0,
      .stack_size = 256,    /* Stable stack size */
  };

  /* Register the task */
  shell_task_id = zplc_sched_register_task(&task_def, shell_program_buffer,
                                           shell_received_size);
  if (shell_task_id < 0) {
    shell_error(sh, "ERROR: Failed to register task: %d", shell_task_id);
    return shell_task_id;
  }

  /* Ensure scheduler is running */
  zplc_sched_start();

  /* Save program to NVS for persistence across power cycles */
  {
    uint32_t len32 = (uint32_t)shell_received_size;
    if (zplc_hal_persist_save(ZPLC_PERSIST_KEY_LEN, &len32, sizeof(len32)) ==
            ZPLC_HAL_OK &&
        zplc_hal_persist_save(ZPLC_PERSIST_KEY_CODE, shell_program_buffer,
                              shell_received_size) == ZPLC_HAL_OK) {
      shell_print(sh, "OK: Program retained in Flash");
    } else {
      shell_warn(sh,
                 "WARN: Failed to save program to Flash (will not persist)");
    }
  }

  shell_load_state = SHELL_STATE_IDLE;
  shell_print(sh, "OK: Task started (slot=%d, %zu bytes)", shell_task_id,
              shell_received_size);
  return 0;
}

/**
 * @brief Handler for 'zplc stop' (scheduler mode)
 */
static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  if (shell_task_id >= 0) {
    zplc_sched_unregister_task(shell_task_id);
    shell_task_id = -1;
    shell_print(sh, "OK: Shell task stopped");
  } else {
    shell_print(sh, "OK: No shell task running");
  }

  return 0;
}

/**
 * @brief Handler for 'zplc status [--json]' (scheduler mode)
 *
 * Outputs current VM/scheduler status. With --json flag, outputs
 * machine-readable JSON for IDE integration.
 */
static int cmd_zplc_status(const struct shell *sh, size_t argc, char **argv) {
  zplc_sched_stats_t stats;
  zplc_sched_get_stats(&stats);

  uint32_t uptime_ms = k_uptime_get_32();
  bool is_running = stats.active_tasks > 0;
  const char *state_str = is_running ? "RUNNING" : "IDLE";

  if (has_json_flag(argc, argv)) {
    /* JSON output for IDE */
    JSON_OBJ_START(sh);
    json_str(sh, "state", state_str, true);
    json_uint(sh, "uptime_ms", uptime_ms, true);

    /* Stats object */
    shell_fprintf(sh, SHELL_NORMAL, "\"stats\":{");
    json_uint(sh, "cycles", stats.total_cycles, true);
    json_uint(sh, "overruns", stats.total_overruns, true);
    json_uint(sh, "active_tasks", stats.active_tasks, false);
    shell_fprintf(sh, SHELL_NORMAL, "},");

    /* Tasks array */
    shell_fprintf(sh, SHELL_NORMAL, "\"tasks\":[");
    bool first_task = true;
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
      zplc_task_t task;
      if (zplc_sched_get_task(i, &task) == 0) {
        if (!first_task) {
          JSON_COMMA(sh);
        }
        first_task = false;
        JSON_OBJ_START(sh);
        json_int(sh, "slot", i, true);
        json_int(sh, "id", task.config.id, true);
        json_int(sh, "prio", task.config.priority, true);
        json_uint(sh, "interval_us", task.config.interval_us, true);
        json_uint(sh, "cycles", task.stats.cycle_count, true);
        json_uint(sh, "overruns", task.stats.overrun_count, false);
        JSON_OBJ_END(sh);
      }
    }
    shell_fprintf(sh, SHELL_NORMAL, "],");

    /* Memory usage */
    shell_fprintf(sh, SHELL_NORMAL, "\"memory\":{");
    json_uint(sh, "work_total", CONFIG_ZPLC_WORK_MEMORY_SIZE, true);
    json_uint(sh, "retain_total", CONFIG_ZPLC_RETAIN_MEMORY_SIZE, false);
    shell_fprintf(sh, SHELL_NORMAL, "},");

    /* OPI outputs */
    shell_fprintf(sh, SHELL_NORMAL, "\"opi\":[%u,%u,%u,%u,%u,%u,%u,%u]",
                  zplc_opi_read8(0), zplc_opi_read8(1), zplc_opi_read8(2),
                  zplc_opi_read8(3), zplc_opi_read8(4), zplc_opi_read8(5),
                  zplc_opi_read8(6), zplc_opi_read8(7));

    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  /* Human-readable output */
  shell_print(sh, "=== ZPLC Scheduler Status ===");
  shell_print(sh, "State:          %s", state_str);
  shell_print(sh, "Uptime:         %u ms", uptime_ms);
  shell_print(sh, "Active Tasks:   %u", stats.active_tasks);
  shell_print(sh, "Total Cycles:   %u", stats.total_cycles);
  shell_print(sh, "Total Overruns: %u", stats.total_overruns);
  shell_print(sh, "Shell Task:     %s", shell_task_id >= 0 ? "active" : "none");

  /* Show OPI outputs */
  shell_print(sh, "--- Outputs (OPI) ---");
  shell_print(sh, "OPI[0..3]:  0x%02X 0x%02X 0x%02X 0x%02X", zplc_opi_read8(0),
              zplc_opi_read8(1), zplc_opi_read8(2), zplc_opi_read8(3));

  return 0;
}

/**
 * @brief Handler for 'zplc reset' (scheduler mode)
 */
static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  /* Stop all tasks */
  zplc_sched_stop();

  /* Unregister all tasks to get a clean slate */
  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    zplc_sched_unregister_task(i);
  }

  /* Clear shell state */
  shell_task_id = -1;
  shell_load_state = SHELL_STATE_IDLE;
  shell_expected_size = 0;
  shell_received_size = 0;

  /* Clear memory */
  zplc_mem_init();

  /* Turn off all outputs */
  for (int i = 0; i < 4; i++) {
    zplc_hal_gpio_write(i, 0);
  }

  shell_print(sh, "OK: Reset complete");
  return 0;
}

/**
 * @brief Handler for 'zplc sched status'
 */
static int cmd_sched_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  zplc_sched_stats_t stats;
  zplc_sched_get_stats(&stats);

  shell_print(sh, "=== Scheduler Statistics ===");
  shell_print(sh, "Active Tasks:   %u / %d", stats.active_tasks,
              CONFIG_ZPLC_MAX_TASKS);
  shell_print(sh, "Total Cycles:   %u", stats.total_cycles);
  shell_print(sh, "Total Overruns: %u", stats.total_overruns);
  shell_print(sh, "Uptime:         %u ms", k_uptime_get_32());

  return 0;
}

/**
 * @brief Handler for 'zplc sched tasks'
 */
static int cmd_sched_tasks(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  shell_print(sh, "=== Registered Tasks ===");
  shell_print(sh, "Slot  ID    Prio  Interval   Cycles    Overruns");
  shell_print(sh, "----  ----  ----  ---------  --------  --------");

  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    zplc_task_t task;
    if (zplc_sched_get_task(i, &task) == 0) {
      shell_print(sh, "%4d  %4d  %4d  %7u us  %8u  %8u", i, task.config.id,
                  task.config.priority, task.config.interval_us,
                  task.stats.cycle_count, task.stats.overrun_count);
    }
  }

  return 0;
}

/* Scheduler subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_sched,
    SHELL_CMD(status, NULL, "Show scheduler statistics", cmd_sched_status),
    SHELL_CMD(tasks, NULL, "List registered tasks", cmd_sched_tasks),
    SHELL_SUBCMD_SET_END);

/* ============================================================================
 * Persistence Command Handlers
 * ============================================================================
 */

/**
 * @brief Handler for 'zplc persist clear'
 *
 * Erases the saved program from Flash/NVS so it won't auto-load on next boot.
 */
static int cmd_persist_clear(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  zplc_hal_result_t ret1, ret2;

  /* Delete both code and length keys */
  ret1 = zplc_hal_persist_delete(ZPLC_PERSIST_KEY_CODE);
  ret2 = zplc_hal_persist_delete(ZPLC_PERSIST_KEY_LEN);

  if (ret1 == ZPLC_HAL_OK || ret2 == ZPLC_HAL_OK) {
    shell_print(sh, "OK: Cleared saved program from Flash");
  } else if (ret1 == ZPLC_HAL_NOT_IMPL && ret2 == ZPLC_HAL_NOT_IMPL) {
    shell_print(sh, "OK: No saved program found");
  } else {
    shell_error(sh, "ERROR: Failed to clear persistence");
    return -EIO;
  }

  return 0;
}

/**
 * @brief Handler for 'zplc persist info'
 *
 * Shows information about saved program in Flash/NVS.
 */
static int cmd_persist_info(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  uint32_t saved_len = 0;
  zplc_hal_result_t ret;

  ret = zplc_hal_persist_load(ZPLC_PERSIST_KEY_LEN, &saved_len,
                              sizeof(saved_len));

  if (ret == ZPLC_HAL_OK && saved_len > 0) {
    shell_print(sh, "Saved program: %u bytes", saved_len);
    shell_print(sh, "Will auto-load on next boot");
  } else {
    shell_print(sh, "No saved program in Flash");
  }

  return 0;
}

/* Persist subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_persist,
    SHELL_CMD(clear, NULL, "Erase saved program from Flash", cmd_persist_clear),
    SHELL_CMD(info, NULL, "Show saved program info", cmd_persist_info),
    SHELL_SUBCMD_SET_END);

/* ============================================================================
 * System Information Commands
 * ============================================================================
 */

/**
 * @brief Handler for 'zplc sys reboot'
 *
 * Performs a system reset. This is useful for recovering from error states
 * or applying configuration changes that require a restart.
 */
static int cmd_sys_reboot(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  shell_print(sh, "OK: Rebooting system...");

  /* Flush shell output before reboot */
  k_msleep(100);

  /* Perform system reset */
  sys_reboot(SYS_REBOOT_COLD);

  /* Should never reach here */
  return 0;
}

/**
 * @brief Handler for 'zplc sys info [--json]'
 *
 * Shows board name, ZPLC version, Zephyr version, clock speed, and
 * capabilities.
 */
static int cmd_sys_info(const struct shell *sh, size_t argc, char **argv) {
  uint32_t uptime_ms = k_uptime_get_32();

  /* Get CPU frequency if available */
  uint32_t cpu_freq_mhz = 0;
#ifdef CONFIG_SYS_CLOCK_HW_CYCLES_PER_SEC
  cpu_freq_mhz = CONFIG_SYS_CLOCK_HW_CYCLES_PER_SEC / 1000000;
#endif

  /* Detect capabilities */
  bool has_fpu = false;
#ifdef CONFIG_FPU
  has_fpu = true;
#endif

  bool has_mpu = false;
#ifdef CONFIG_ARM_MPU
  has_mpu = true;
#endif

  if (has_json_flag(argc, argv)) {
    /* JSON output for IDE */
    JSON_OBJ_START(sh);
    json_str(sh, "board", CONFIG_BOARD, true);
    json_str(sh, "zplc_version", zplc_core_version(), true);
    json_str(sh, "zephyr_version", KERNEL_VERSION_STRING, true);
    json_uint(sh, "uptime_ms", uptime_ms, true);
    json_uint(sh, "cpu_freq_mhz", cpu_freq_mhz, true);

    /* Capabilities object */
    shell_fprintf(sh, SHELL_NORMAL, "\"capabilities\":{");
    json_bool(sh, "fpu", has_fpu, true);
    json_bool(sh, "mpu", has_mpu, true);
    json_bool(sh, "scheduler", true, true); /* Always true in scheduler mode */
    json_int(sh, "max_tasks", CONFIG_ZPLC_MAX_TASKS, false);
    shell_fprintf(sh, SHELL_NORMAL, "},");

    /* Memory configuration */
    shell_fprintf(sh, SHELL_NORMAL, "\"memory\":{");
    json_uint(sh, "work_size", CONFIG_ZPLC_WORK_MEMORY_SIZE, true);
    json_uint(sh, "retain_size", CONFIG_ZPLC_RETAIN_MEMORY_SIZE, true);
    json_uint(sh, "ipi_size", 4096, true); /* Fixed in ZPLC */
    json_uint(sh, "opi_size", 4096, false);
    shell_fprintf(sh, SHELL_NORMAL, "}");

    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  /* Human-readable output */
  shell_print(sh, "=== ZPLC System Information ===");
  shell_print(sh, "Board:          %s", CONFIG_BOARD);
  shell_print(sh, "ZPLC Version:   %s", zplc_core_version());
  shell_print(sh, "Zephyr Version: %s", KERNEL_VERSION_STRING);
  shell_print(sh, "Uptime:         %u ms", uptime_ms);
  shell_print(sh, "CPU Frequency:  %u MHz", cpu_freq_mhz);
  shell_print(sh, "--- Capabilities ---");
  shell_print(sh, "FPU:            %s", has_fpu ? "yes" : "no");
  shell_print(sh, "MPU:            %s", has_mpu ? "yes" : "no");
  shell_print(sh, "Scheduler:      enabled (max %d tasks)",
              CONFIG_ZPLC_MAX_TASKS);
  shell_print(sh, "--- Memory ---");
  shell_print(sh, "Work Memory:    %d bytes", CONFIG_ZPLC_WORK_MEMORY_SIZE);
  shell_print(sh, "Retain Memory:  %d bytes", CONFIG_ZPLC_RETAIN_MEMORY_SIZE);

  return 0;
}

/* System subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(sub_sys,
                               SHELL_CMD_ARG(info, NULL,
                                             "Show system information [--json]",
                                             cmd_sys_info, 1, 1),
                               SHELL_CMD(reboot, NULL, "Reboot the system",
                                         cmd_sys_reboot),
                               SHELL_SUBCMD_SET_END);

/* Debug commands - scheduler mode (simplified) */
static int cmd_dbg_peek(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc dbg peek <addr> [len]");
    return -EINVAL;
  }

  char *endptr;
  unsigned long addr = strtoul(argv[1], &endptr, 0);
  if (*endptr != '\0') {
    shell_error(sh, "ERROR: Invalid address");
    return -EINVAL;
  }

  unsigned long len = 16;
  if (argc >= 3) {
    len = strtoul(argv[2], &endptr, 0);
    if (*endptr != '\0' || len == 0 || len > 256) {
      shell_error(sh, "ERROR: Invalid length (1-256)");
      return -EINVAL;
    }
  }

  shell_print(sh, "Memory at 0x%04lX (%lu bytes):", addr, len);

  /* Get memory region pointer */
  uint8_t *base = NULL;
  uint16_t offset = 0;

  if (addr < ZPLC_MEM_OPI_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    offset = (uint16_t)addr;
  } else if (addr < ZPLC_MEM_WORK_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_OPI_BASE);
  } else if (addr < ZPLC_MEM_RETAIN_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_WORK_BASE);
  } else {
    base = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_RETAIN_BASE);
  }

  if (base == NULL) {
    shell_error(sh, "ERROR: Invalid memory region");
    return -EINVAL;
  }

  /* Print in rows of 16 bytes */
  for (unsigned long i = 0; i < len; i += 16) {
    char line[80];
    int pos = 0;

    pos += snprintf(line + pos, sizeof(line) - pos, "%04lX: ", addr + i);

    for (unsigned long j = 0; j < 16 && (i + j) < len; j++) {
      pos += snprintf(line + pos, sizeof(line) - pos, "%02X ",
                      base[offset + i + j]);
    }

    shell_print(sh, "%s", line);
  }

  return 0;
}

static int cmd_dbg_poke(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 3) {
    shell_error(sh, "Usage: zplc dbg poke <addr> <value>");
    return -EINVAL;
  }

  char *endptr;
  unsigned long addr = strtoul(argv[1], &endptr, 0);
  if (*endptr != '\0') {
    shell_error(sh, "ERROR: Invalid address");
    return -EINVAL;
  }

  unsigned long value = strtoul(argv[2], &endptr, 0);
  if (*endptr != '\0' || value > 255) {
    shell_error(sh, "ERROR: Invalid value (0-255)");
    return -EINVAL;
  }

  /* Get memory region pointer */
  uint8_t *base = NULL;
  uint16_t offset = 0;

  if (addr < ZPLC_MEM_OPI_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    offset = (uint16_t)addr;
  } else if (addr < ZPLC_MEM_WORK_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_OPI_BASE);
  } else if (addr < ZPLC_MEM_RETAIN_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_WORK_BASE);
  } else {
    base = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_RETAIN_BASE);
  }

  if (base == NULL) {
    shell_error(sh, "ERROR: Invalid memory address");
    return -EINVAL;
  }

  base[offset] = (uint8_t)value;
  shell_print(sh, "OK: Wrote 0x%02X to 0x%04lX", (uint8_t)value, addr);

  return 0;
}

static int cmd_dbg_ticks(const struct shell *sh, size_t argc, char **argv) {
  uint32_t ticks = k_uptime_get_32();

  if (has_json_flag(argc, argv)) {
    JSON_OBJ_START(sh);
    json_uint(sh, "ticks", ticks, false);
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  shell_print(sh, "Ticks: %u ms", ticks);
  return 0;
}

static int cmd_dbg_mem(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc dbg mem <ipi|opi|work|retain> [offset]");
    return -EINVAL;
  }

  uint8_t *base = NULL;
  const char *region_name = argv[1];
  uint16_t region_base_addr = 0;

  if (strcmp(region_name, "ipi") == 0) {
    base = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    region_base_addr = ZPLC_MEM_IPI_BASE;
  } else if (strcmp(region_name, "opi") == 0) {
    base = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    region_base_addr = ZPLC_MEM_OPI_BASE;
  } else if (strcmp(region_name, "work") == 0) {
    base = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    region_base_addr = ZPLC_MEM_WORK_BASE;
  } else if (strcmp(region_name, "retain") == 0) {
    base = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    region_base_addr = ZPLC_MEM_RETAIN_BASE;
  } else {
    shell_error(sh,
                "ERROR: Invalid region '%s' (use ipi, opi, work, or retain)",
                region_name);
    return -EINVAL;
  }

  if (base == NULL) {
    shell_error(sh, "ERROR: Memory region not available");
    return -ENOMEM;
  }

  unsigned long offset = 0;
  if (argc >= 3) {
    offset = strtoul(argv[2], NULL, 0);
  }

  shell_print(sh, "--- %s Memory Dump (offset 0x%04lX) ---", region_name,
              offset);

  /* Print 64 bytes in rows of 16 */
  for (int i = 0; i < 64; i += 16) {
    char line[128];
    int pos = 0;

    pos += snprintf(line + pos, sizeof(line) - pos,
                    "%04lX: ", (unsigned long)region_base_addr + offset + i);

    /* Hex part */
    for (int j = 0; j < 16; j++) {
      pos += snprintf(line + pos, sizeof(line) - pos, "%02X ",
                      base[offset + i + j]);
    }

    pos += snprintf(line + pos, sizeof(line) - pos, " | ");

    /* ASCII part */
    for (int j = 0; j < 16; j++) {
      uint8_t c = base[offset + i + j];
      pos +=
          snprintf(line + pos, sizeof(line) - pos, "%c", isprint(c) ? c : '.');
    }

    shell_print(sh, "%s", line);
  }

  return 0;
}

static int cmd_dbg_task(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc dbg task <id>");
    return -EINVAL;
  }

  uint8_t id = (uint8_t)atoi(argv[1]);
  zplc_task_t task;

  if (zplc_sched_get_task(id, &task) != 0) {
    shell_error(sh, "ERROR: Task %d not found", id);
    return -EINVAL;
  }

  if (has_json_flag(argc, argv)) {
    JSON_OBJ_START(sh);
    json_int(sh, "id", id, true);
    json_uint(sh, "interval_us", task.config.interval_us, true);
    json_int(sh, "priority", task.config.priority, true);
    json_uint(sh, "cycles", task.stats.cycle_count, true);
    json_uint(sh, "last_cycle_us", task.stats.last_exec_time_us, true);
    json_uint(sh, "entry_point", task.config.entry_point, false);
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  shell_print(sh, "Task %d:", id);
  shell_print(sh, "  Interval:   %u us", task.config.interval_us);
  shell_print(sh, "  Priority:   %d", task.config.priority);
  shell_print(sh, "  Cycles:     %u", task.stats.cycle_count);
  shell_print(sh, "  Last Cycle: %u us", task.stats.last_exec_time_us);
  shell_print(sh, "  Entry:      0x%04X", task.config.entry_point);

  return 0;
}

static int cmd_dbg_watch(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh,
                "Usage: zplc dbg watch <addr> [u8|u16|u32|i8|i16|i32|bool]");
    return -EINVAL;
  }

  unsigned long addr = strtoul(argv[1], NULL, 0);
  const char *type = (argc >= 3) ? argv[2] : "u8";

  /* We reuse DBG peek logic to get the base and offset */
  uint8_t *base = NULL;
  uint16_t offset = 0;

  if (addr < ZPLC_MEM_OPI_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    offset = (uint16_t)addr;
  } else if (addr < ZPLC_MEM_WORK_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_OPI_BASE);
  } else if (addr < ZPLC_MEM_RETAIN_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_WORK_BASE);
  } else {
    base = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_RETAIN_BASE);
  }

  if (base == NULL) {
    shell_error(sh, "ERROR: Invalid memory address");
    return -EINVAL;
  }

  uint8_t *ptr = base + offset;

  if (strcmp(type, "u8") == 0) {
    shell_print(sh, "0x%04lX (U8): %u (0x%02X)", addr, *ptr, *ptr);
  } else if (strcmp(type, "u16") == 0) {
    uint16_t val = ((uint16_t)ptr[1] << 8) | ptr[0];
    shell_print(sh, "0x%04lX (U16): %u (0x%04X)", addr, val, val);
  } else if (strcmp(type, "u32") == 0) {
    uint32_t val = ((uint32_t)ptr[3] << 24) | ((uint32_t)ptr[2] << 16) |
                   ((uint32_t)ptr[1] << 8) | ptr[0];
    shell_print(sh, "0x%04lX (U32): %u (0x%08X)", addr, val, val);
  } else if (strcmp(type, "i8") == 0) {
    shell_print(sh, "0x%04lX (I8): %d", addr, (int8_t)*ptr);
  } else if (strcmp(type, "i16") == 0) {
    int16_t val = (int16_t)(((uint16_t)ptr[1] << 8) | ptr[0]);
    shell_print(sh, "0x%04lX (I16): %d", addr, val);
  } else if (strcmp(type, "i32") == 0) {
    int32_t val =
        (int32_t)(((uint32_t)ptr[3] << 24) | ((uint32_t)ptr[2] << 16) |
                  ((uint32_t)ptr[1] << 8) | ptr[0]);
    shell_print(sh, "0x%04lX (I32): %d", addr, val);
  } else if (strcmp(type, "bool") == 0) {
    shell_print(sh, "0x%04lX (BOOL): %s", addr, *ptr ? "TRUE" : "FALSE");
  } else {
    shell_error(sh, "ERROR: Invalid type '%s'", type);
    return -EINVAL;
  }

  return 0;
}

static int cmd_dbg_timer(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc dbg timer <addr>");
    return -EINVAL;
  }

  unsigned long addr = strtoul(argv[1], NULL, 0);

  uint8_t *base = NULL;
  uint16_t offset = 0;

  /* Timers are usually in WORK or RETAIN memory */
  if (addr >= ZPLC_MEM_WORK_BASE && addr < ZPLC_MEM_RETAIN_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_WORK_BASE);
  } else if (addr >= ZPLC_MEM_RETAIN_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_RETAIN_BASE);
  } else {
    shell_error(sh, "ERROR: Timers must be in WORK or RETAIN memory");
    return -EINVAL;
  }

  if (base == NULL) {
    shell_error(sh, "ERROR: Memory region not available");
    return -EINVAL;
  }

  uint8_t *ptr = base + offset;

  /* Timer layout (17 bytes):
   * [0] IN (bool)
   * [1] Q (bool)
   * [2-3] reserved
   * [4-7] PT (u32)
   * [8-11] ET (u32)
   * [12-15] _start (u32)
   * [16] _running (bool)
   */
  bool in = ptr[0] != 0;
  bool q = ptr[1] != 0;
  uint32_t pt = ((uint32_t)ptr[7] << 24) | ((uint32_t)ptr[6] << 16) |
                ((uint32_t)ptr[5] << 8) | ptr[4];
  uint32_t et = ((uint32_t)ptr[11] << 24) | ((uint32_t)ptr[10] << 16) |
                ((uint32_t)ptr[9] << 8) | ptr[8];
  uint32_t start = ((uint32_t)ptr[15] << 24) | ((uint32_t)ptr[14] << 16) |
                   ((uint32_t)ptr[13] << 8) | ptr[12];
  bool running = ptr[16] != 0;

  shell_print(sh, "Timer at 0x%04lX:", addr);
  shell_print(sh, "  IN:      %s", in ? "ON" : "OFF");
  shell_print(sh, "  Q:       %s", q ? "ON" : "OFF");
  shell_print(sh, "  PT:      %u ms", pt);
  shell_print(sh, "  ET:      %u ms", et);
  shell_print(sh, "  _start:  %u ms", start);
  shell_print(sh, "  _active: %s", running ? "YES" : "NO");

  return 0;
}

static int cmd_dbg_info(const struct shell *sh, size_t argc, char **argv) {
  zplc_sched_stats_t stats;
  zplc_sched_get_stats(&stats);

  uint32_t uptime_ms = k_uptime_get_32();
  bool is_running = stats.active_tasks > 0;

  if (has_json_flag(argc, argv)) {
    /* JSON output for IDE */
    JSON_OBJ_START(sh);
    json_str(sh, "state", is_running ? "RUNNING" : "IDLE", true);
    json_uint(sh, "uptime_ms", uptime_ms, true);
    json_uint(sh, "cycles", stats.total_cycles, true);
    json_uint(sh, "active_tasks", stats.active_tasks, true);
    json_uint(sh, "overruns", stats.total_overruns, true);
    json_bool(sh, "halted", !is_running, true);
    json_int(sh, "error", 0, true);

    /* OPI outputs as array */
    shell_fprintf(sh, SHELL_NORMAL, "\"opi\":[%u,%u,%u,%u,%u,%u,%u,%u],",
                  zplc_opi_read8(0), zplc_opi_read8(1), zplc_opi_read8(2),
                  zplc_opi_read8(3), zplc_opi_read8(4), zplc_opi_read8(5),
                  zplc_opi_read8(6), zplc_opi_read8(7));

    /* IPI inputs (first 8 bytes) */
    shell_fprintf(sh, SHELL_NORMAL, "\"ipi\":[%u,%u,%u,%u,%u,%u,%u,%u]",
                  zplc_ipi_read8(0), zplc_ipi_read8(1), zplc_ipi_read8(2),
                  zplc_ipi_read8(3), zplc_ipi_read8(4), zplc_ipi_read8(5),
                  zplc_ipi_read8(6), zplc_ipi_read8(7));

    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  /* Human-readable output */
  shell_print(sh, "=== Debug Info (Scheduler Mode) ===");
  shell_print(sh, "State:        %s", is_running ? "RUNNING" : "IDLE");
  shell_print(sh, "Active Tasks: %u", stats.active_tasks);
  shell_print(sh, "Total Cycles: %u", stats.total_cycles);
  shell_print(sh, "Overruns:     %u", stats.total_overruns);
  shell_print(sh, "Uptime:       %u ms", uptime_ms);

  /* Show OPI bytes 0-7 */
  shell_print(sh, "OPI[0..7]: %02X %02X %02X %02X %02X %02X %02X %02X",
              zplc_opi_read8(0), zplc_opi_read8(1), zplc_opi_read8(2),
              zplc_opi_read8(3), zplc_opi_read8(4), zplc_opi_read8(5),
              zplc_opi_read8(6), zplc_opi_read8(7));

  return 0;
}

/* Stub commands for scheduler mode (pause/resume/step not applicable) */
static int cmd_dbg_pause(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_print(
      sh,
      "WARN: Pause not supported in scheduler mode (use task-level control)");
  return 0;
}

static int cmd_dbg_resume(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_print(sh, "WARN: Resume not supported in scheduler mode");
  return 0;
}

static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_print(sh, "WARN: Step not supported in scheduler mode");
  return 0;
}

#else /* Legacy mode implementations */

/* ============================================================================
 * Shell Command Handlers - Legacy Mode
 * ============================================================================
 */

/**
 * @brief Handler for 'zplc load <size>'
 *
 * Prepares the system to receive bytecode of the specified size.
 */
static int cmd_zplc_load(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc load <size>");
    return -EINVAL;
  }

  /* Parse size */
  char *endptr;
  unsigned long size = strtoul(argv[1], &endptr, 10);

  if (*endptr != '\0' || size == 0) {
    shell_error(sh, "ERROR: Invalid size");
    return -EINVAL;
  }

  if (size > program_buffer_size) {
    shell_error(sh, "ERROR: Size %lu exceeds buffer (%zu bytes)", size,
                program_buffer_size);
    return -ENOMEM;
  }

  /* Stop any running program first */
  if (runtime_state == ZPLC_STATE_RUNNING) {
    runtime_state = ZPLC_STATE_IDLE;
    k_msleep(10); /* Let main loop notice */
  }

  /* Clear buffer and prepare for loading */
  memset(program_buffer, 0, program_buffer_size);
  program_expected_size = size;
  program_received_size = 0;
  runtime_state = ZPLC_STATE_LOADING;

  shell_print(sh, "OK: Ready to receive %lu bytes", size);
  return 0;
}

/**
 * @brief Handler for 'zplc data <hex>'
 *
 * Receives a chunk of hex-encoded bytecode and appends to the buffer.
 * Multiple data commands can be used to send larger programs.
 */
static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc data <hex>");
    return -EINVAL;
  }

  if (runtime_state != ZPLC_STATE_LOADING) {
    shell_error(sh, "ERROR: Not in loading state (use 'zplc load' first)");
    return -EINVAL;
  }

  /* Decode hex data */
  const char *hex = argv[1];
  size_t remaining = program_expected_size - program_received_size;

  int decoded =
      hex_decode(hex, program_buffer + program_received_size, remaining);

  if (decoded < 0) {
    shell_error(sh, "ERROR: Invalid hex data");
    runtime_state = ZPLC_STATE_ERROR;
    return -EINVAL;
  }

  program_received_size += decoded;

  /* Check if complete */
  if (program_received_size >= program_expected_size) {
    runtime_state = ZPLC_STATE_READY;
    shell_print(sh, "OK: Received %zu/%zu bytes (complete)",
                program_received_size, program_expected_size);
  } else {
    shell_print(sh, "OK: Received %zu/%zu bytes", program_received_size,
                program_expected_size);
  }

  return 0;
}

/**
 * @brief Handler for 'zplc start'
 *
 * Loads the received bytecode into the VM and starts execution.
 */
static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  if (runtime_state == ZPLC_STATE_RUNNING) {
    shell_warn(sh, "WARN: Already running");
    return 0;
  }

  if (runtime_state != ZPLC_STATE_READY) {
    shell_error(sh, "ERROR: No program loaded (state=%s)",
                state_name(runtime_state));
    return -EINVAL;
  }

  /* Re-initialize the VM core */
  int ret = zplc_core_init();
  if (ret != 0) {
    shell_error(sh, "ERROR: Core init failed (%d)", ret);
    runtime_state = ZPLC_STATE_ERROR;
    return ret;
  }

  /* Load the program */
  ret = zplc_core_load_raw(program_buffer, program_received_size);
  if (ret != 0) {
    shell_error(sh, "ERROR: Load failed (%d)", ret);
    runtime_state = ZPLC_STATE_ERROR;
    return ret;
  }

  /* Reset cycle count and start */
  cycle_count = 0;
  runtime_state = ZPLC_STATE_RUNNING;

  /* Save program to NVS for persistence across power cycles */
  {
    uint32_t len32 = (uint32_t)program_received_size;
    if (zplc_hal_persist_save(ZPLC_PERSIST_KEY_LEN, &len32, sizeof(len32)) ==
            ZPLC_HAL_OK &&
        zplc_hal_persist_save(ZPLC_PERSIST_KEY_CODE, program_buffer,
                              program_received_size) == ZPLC_HAL_OK) {
      shell_print(sh, "OK: Program retained in Flash");
    } else {
      shell_warn(sh,
                 "WARN: Failed to save program to Flash (will not persist)");
    }
  }

  shell_print(sh, "OK: Started (%zu bytes loaded)", program_received_size);
  return 0;
}

/**
 * @brief Handler for 'zplc stop'
 *
 * Stops VM execution.
 */
static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  if (runtime_state != ZPLC_STATE_RUNNING) {
    shell_warn(sh, "WARN: Not running (state=%s)", state_name(runtime_state));
    return 0;
  }

  runtime_state = ZPLC_STATE_IDLE;

  /* Turn off all outputs for safety */
  for (int i = 0; i < 4; i++) {
    zplc_hal_gpio_write(i, 0);
  }

  shell_print(sh, "OK: Stopped");
  return 0;
}

/**
 * @brief Handler for 'zplc status [--json]' (legacy mode)
 *
 * Displays current VM state and statistics.
 */
static int cmd_zplc_status(const struct shell *sh, size_t argc, char **argv) {
  const zplc_vm_state_t *vm = zplc_core_get_state();
  uint32_t uptime_ms = k_uptime_get_32();
  const char *state_str = state_name(runtime_state);
  bool is_halted = zplc_core_is_halted();
  int32_t vm_error = zplc_core_get_error();

  if (has_json_flag(argc, argv)) {
    /* JSON output for IDE */
    JSON_OBJ_START(sh);
    json_str(sh, "state", state_str, true);
    json_uint(sh, "uptime_ms", uptime_ms, true);

    /* Stats */
    shell_fprintf(sh, SHELL_NORMAL, "\"stats\":{");
    json_uint(sh, "cycles", cycle_count, true);
    json_uint(sh, "program_size", (uint32_t)program_received_size, false);
    shell_fprintf(sh, SHELL_NORMAL, "},");

    /* VM State */
    shell_fprintf(sh, SHELL_NORMAL, "\"vm\":{");
    json_uint(sh, "pc", vm->pc, true);
    json_uint(sh, "sp", vm->sp, true);
    json_bool(sh, "halted", is_halted, true);
    json_int(sh, "error", vm_error, false);
    shell_fprintf(sh, SHELL_NORMAL, "},");

    /* OPI outputs */
    shell_fprintf(sh, SHELL_NORMAL, "\"opi\":[%u,%u,%u,%u,%u,%u,%u,%u]",
                  (uint8_t)zplc_core_get_opi(0), (uint8_t)zplc_core_get_opi(1),
                  (uint8_t)zplc_core_get_opi(2), (uint8_t)zplc_core_get_opi(3),
                  (uint8_t)zplc_core_get_opi(4), (uint8_t)zplc_core_get_opi(5),
                  (uint8_t)zplc_core_get_opi(6), (uint8_t)zplc_core_get_opi(7));

    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  /* Human-readable output */
  shell_print(sh, "=== ZPLC Runtime Status ===");
  shell_print(sh, "State:      %s", state_str);
  shell_print(sh, "Cycles:     %u", cycle_count);
  shell_print(sh, "Program:    %zu bytes", program_received_size);

  if (runtime_state == ZPLC_STATE_RUNNING ||
      runtime_state == ZPLC_STATE_READY) {
    shell_print(sh, "--- VM State ---");
    shell_print(sh, "PC:         %u", vm->pc);
    shell_print(sh, "SP:         %u", vm->sp);
    shell_print(sh, "Halted:     %s", is_halted ? "yes" : "no");
    shell_print(sh, "Error:      %d", vm_error);

    /* Show OPI output bytes */
    shell_print(sh, "--- Outputs ---");
    shell_print(sh, "OPI[0..3]:  0x%02X 0x%02X 0x%02X 0x%02X",
                (uint8_t)zplc_core_get_opi(0), (uint8_t)zplc_core_get_opi(1),
                (uint8_t)zplc_core_get_opi(2), (uint8_t)zplc_core_get_opi(3));
  }

  return 0;
}

/**
 * @brief Handler for 'zplc reset'
 *
 * Resets the VM to initial state.
 */
static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  /* Stop if running */
  runtime_state = ZPLC_STATE_IDLE;

  /* Clear program buffer */
  memset(program_buffer, 0, program_buffer_size);
  program_expected_size = 0;
  program_received_size = 0;
  cycle_count = 0;

  /* Turn off all outputs */
  for (int i = 0; i < 4; i++) {
    zplc_hal_gpio_write(i, 0);
  }

  /* Re-init core */
  zplc_core_init();

  shell_print(sh, "OK: Reset complete");
  return 0;
}

/* ============================================================================
 * Debug Command Handlers - Legacy Mode
 * ============================================================================
 */

/**
 * @brief Handler for 'zplc dbg pause'
 *
 * Pauses VM execution at the next cycle boundary.
 */
static int cmd_dbg_pause(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  if (runtime_state != ZPLC_STATE_RUNNING) {
    shell_warn(sh, "WARN: Not running (state=%s)", state_name(runtime_state));
    return 0;
  }

  runtime_state = ZPLC_STATE_PAUSED;
  shell_print(sh, "OK: Paused at cycle %u", cycle_count);
  return 0;
}

/**
 * @brief Handler for 'zplc dbg resume'
 *
 * Resumes VM execution from paused state.
 */
static int cmd_dbg_resume(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  if (runtime_state != ZPLC_STATE_PAUSED) {
    shell_warn(sh, "WARN: Not paused (state=%s)", state_name(runtime_state));
    return 0;
  }

  runtime_state = ZPLC_STATE_RUNNING;
  shell_print(sh, "OK: Resumed");
  return 0;
}

/**
 * @brief Handler for 'zplc dbg step'
 *
 * Executes exactly one PLC cycle while paused.
 */
static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  if (runtime_state == ZPLC_STATE_RUNNING) {
    /* Auto-pause first */
    runtime_state = ZPLC_STATE_PAUSED;
    k_msleep(10); /* Let main loop notice */
  }

  if (runtime_state != ZPLC_STATE_PAUSED && runtime_state != ZPLC_STATE_READY) {
    shell_error(sh, "ERROR: Cannot step (state=%s)", state_name(runtime_state));
    return -EINVAL;
  }

  /* If READY, transition to PAUSED first */
  if (runtime_state == ZPLC_STATE_READY) {
    /* Re-initialize and load */
    int ret = zplc_core_init();
    if (ret != 0) {
      shell_error(sh, "ERROR: Core init failed (%d)", ret);
      return ret;
    }
    ret = zplc_core_load_raw(program_buffer, program_received_size);
    if (ret != 0) {
      shell_error(sh, "ERROR: Load failed (%d)", ret);
      return ret;
    }
    cycle_count = 0;
    runtime_state = ZPLC_STATE_PAUSED;
  }

  /* Request a single step */
  step_requested = 1;
  shell_print(sh, "OK: Step requested");
  return 0;
}

/**
 * @brief Handler for 'zplc dbg peek <addr> [len]'
 *
 * Reads memory from the VM and displays as hex.
 * Default length is 16 bytes.
 */
static int cmd_dbg_peek(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc dbg peek <addr> [len]");
    return -EINVAL;
  }

  /* Parse address */
  char *endptr;
  unsigned long addr = strtoul(argv[1], &endptr, 0);
  if (*endptr != '\0') {
    shell_error(sh, "ERROR: Invalid address");
    return -EINVAL;
  }

  /* Parse optional length (default 16) */
  unsigned long len = 16;
  if (argc >= 3) {
    len = strtoul(argv[2], &endptr, 0);
    if (*endptr != '\0' || len == 0 || len > 256) {
      shell_error(sh, "ERROR: Invalid length (1-256)");
      return -EINVAL;
    }
  }

  /* Read and display memory using OPI/IPI access based on address */
  shell_print(sh, "Memory at 0x%04lX (%lu bytes):", addr, len);

  /* Print in rows of 16 bytes */
  for (unsigned long offset = 0; offset < len; offset += 16) {
    char line[80];
    int pos = 0;

    pos += snprintf(line + pos, sizeof(line) - pos, "%04lX: ", addr + offset);

    for (unsigned long i = 0; i < 16 && (offset + i) < len; i++) {
      uint32_t val = 0;
      uint16_t a = (uint16_t)(addr + offset + i);

      /* Use core API to read from different memory regions */
      if (a >= 0x1000 && a < 0x2000) {
        /* OPI region */
        val = zplc_core_get_opi(a - 0x1000);
      } else {
        /* For other regions, we'd need direct access */
        /* For now, just show OPI and return 0 for others */
        val = 0;
      }

      pos += snprintf(line + pos, sizeof(line) - pos, "%02X ", (uint8_t)val);
    }

    shell_print(sh, "%s", line);
  }

  return 0;
}

/**
 * @brief Handler for 'zplc dbg poke <addr> <value>'
 *
 * Writes a byte value to memory (useful for forcing I/O values).
 */
static int cmd_dbg_poke(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 3) {
    shell_error(sh, "Usage: zplc dbg poke <addr> <value>");
    return -EINVAL;
  }

  /* Parse address */
  char *endptr;
  unsigned long addr = strtoul(argv[1], &endptr, 0);
  if (*endptr != '\0') {
    shell_error(sh, "ERROR: Invalid address");
    return -EINVAL;
  }

  /* Parse value */
  unsigned long value = strtoul(argv[2], &endptr, 0);
  if (*endptr != '\0' || value > 255) {
    shell_error(sh, "ERROR: Invalid value (0-255)");
    return -EINVAL;
  }

  /* Write to appropriate region */
  if (addr < 0x1000) {
    /* IPI region - use set_ipi */
    int ret = zplc_core_set_ipi((uint16_t)addr, (uint32_t)value);
    if (ret < 0) {
      shell_error(sh, "ERROR: Write failed");
      return -EINVAL;
    }
  } else {
    shell_error(sh, "ERROR: Can only poke IPI region (0x0000-0x0FFF)");
    return -EINVAL;
  }

  shell_print(sh, "OK: Wrote 0x%02X to 0x%04lX", (uint8_t)value, addr);
  return 0;
}

/**
 * @brief Handler for 'zplc dbg info'
 *
 * Shows detailed VM state for debugging.
 */
/**
 * @brief Handler for 'zplc dbg info [--json]' (legacy mode)
 *
 * Shows detailed VM state for debugging.
 */
static int cmd_dbg_info(const struct shell *sh, size_t argc, char **argv) {
  const zplc_vm_state_t *vm = zplc_core_get_state();
  uint32_t uptime_ms = k_uptime_get_32();
  const char *state_str = state_name(runtime_state);
  bool is_halted = zplc_core_is_halted();
  int32_t vm_error = zplc_core_get_error();

  if (has_json_flag(argc, argv)) {
    /* JSON output for IDE */
    JSON_OBJ_START(sh);
    json_str(sh, "state", state_str, true);
    json_uint(sh, "uptime_ms", uptime_ms, true);
    json_uint(sh, "cycles", cycle_count, true);
    json_uint(sh, "pc", vm->pc, true);
    json_uint(sh, "sp", vm->sp, true);
    json_bool(sh, "halted", is_halted, true);
    json_int(sh, "error", vm_error, true);

    /* Stack top if available */
    if (vm->sp > 0) {
      json_uint(sh, "tos", zplc_core_get_stack(vm->sp - 1), true);
    }

    /* OPI outputs */
    shell_fprintf(sh, SHELL_NORMAL, "\"opi\":[%u,%u,%u,%u,%u,%u,%u,%u],",
                  (uint8_t)zplc_core_get_opi(0), (uint8_t)zplc_core_get_opi(1),
                  (uint8_t)zplc_core_get_opi(2), (uint8_t)zplc_core_get_opi(3),
                  (uint8_t)zplc_core_get_opi(4), (uint8_t)zplc_core_get_opi(5),
                  (uint8_t)zplc_core_get_opi(6), (uint8_t)zplc_core_get_opi(7));

    /* IPI inputs */
    shell_fprintf(sh, SHELL_NORMAL, "\"ipi\":[%u,%u,%u,%u,%u,%u,%u,%u]",
                  (uint8_t)zplc_core_get_ipi(0), (uint8_t)zplc_core_get_ipi(1),
                  (uint8_t)zplc_core_get_ipi(2), (uint8_t)zplc_core_get_ipi(3),
                  (uint8_t)zplc_core_get_ipi(4), (uint8_t)zplc_core_get_ipi(5),
                  (uint8_t)zplc_core_get_ipi(6), (uint8_t)zplc_core_get_ipi(7));

    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  /* Human-readable output */
  shell_print(sh, "=== Debug Info ===");
  shell_print(sh, "State:   %s", state_str);
  shell_print(sh, "Cycles:  %u", cycle_count);
  shell_print(sh, "PC:      0x%04X", vm->pc);
  shell_print(sh, "SP:      %u", vm->sp);
  shell_print(sh, "Halted:  %s", is_halted ? "yes" : "no");
  shell_print(sh, "Error:   %d", vm_error);

  /* Show stack top */
  if (vm->sp > 0) {
    shell_print(sh, "TOS:     0x%08X (%u)", zplc_core_get_stack(vm->sp - 1),
                zplc_core_get_stack(vm->sp - 1));
  }

  /* Show OPI bytes 0-7 */
  shell_print(sh, "OPI[0..7]: %02X %02X %02X %02X %02X %02X %02X %02X",
              (uint8_t)zplc_core_get_opi(0), (uint8_t)zplc_core_get_opi(1),
              (uint8_t)zplc_core_get_opi(2), (uint8_t)zplc_core_get_opi(3),
              (uint8_t)zplc_core_get_opi(4), (uint8_t)zplc_core_get_opi(5),
              (uint8_t)zplc_core_get_opi(6), (uint8_t)zplc_core_get_opi(7));

  return 0;
}

#endif /* CONFIG_ZPLC_SCHEDULER */

/* ============================================================================
 * ADC Commands (Analog Input Test)
 * ============================================================================
 */

#ifdef CONFIG_ADC

/**
 * @brief Convert raw ADC value to temperature in Celsius.
 *
 * The RP2040 internal temperature sensor has a voltage output:
 *   T = 27 - (V - 0.706) / 0.001721
 *
 * Where V is in volts. With 12-bit ADC and 3.3V reference:
 *   V = (raw * 3.3) / 4096
 */
static int32_t adc_raw_to_celsius(uint16_t raw) {
  /* Convert to millivolts: (raw * 3300) / 4096 */
  int32_t mv = (raw * 3300) / 4096;

  /* T = 27 - (V - 0.706) / 0.001721
   * T = 27 - (mV/1000 - 0.706) * 581
   * T = 27 - (mV - 706) * 581 / 1000
   * T = 27 - (mV - 706) * 0.581
   */
  int32_t temp_c = 27 - ((mv - 706) * 581) / 1000;
  return temp_c;
}

/**
 * @brief Handler for 'zplc adc temp' - Read internal temperature sensor
 *
 * RP2040 internal temperature sensor is on ADC channel 4.
 * Formula: T = 27 - (V - 0.706) / 0.001721
 * With 12-bit ADC and 3.3V reference: V = raw * 3.3 / 4096
 */
static int cmd_adc_temp(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  /* RP2040 temperature sensor is on ADC channel 4 */
  uint16_t raw_value = 0;
  zplc_hal_result_t ret = zplc_hal_adc_read(4, &raw_value);

  if (ret != ZPLC_HAL_OK) {
    shell_error(sh, "ERROR: ADC read failed (%d)", ret);
    return -EIO;
  }

  /* Convert raw to millivolts: (raw * 3300) / 4096 */
  int32_t mv = (raw_value * 3300) / 4096;

  /* Convert to temperature using RP2040 formula:
   * T = 27 - (V - 0.706) / 0.001721
   * T = 27 - ((mV/1000) - 0.706) / 0.001721
   * T = 27 - (mV - 706) / 1.721
   * Multiply by 1000 to avoid floats: T = 27000 - (mV - 706) * 581 / 1000
   */
  int32_t temp_c = 27 - ((mv - 706) * 1000) / 1721;

  shell_print(sh, "Temperature Sensor (ADC Channel 4):");
  shell_print(sh, "  Raw:    %u (0x%04X)", raw_value, raw_value);
  shell_print(sh, "  Voltage: %d.%03d V", mv / 1000, mv % 1000);
  shell_print(sh, "  Temp:   %d C", temp_c);

  return 0;
}

/**
 * @brief Handler for 'zplc adc read <channel>' - Read raw ADC value
 */
static int cmd_adc_read(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc adc read <channel>");
    return -EINVAL;
  }

  char *endptr;
  unsigned long channel = strtoul(argv[1], &endptr, 0);
  if (*endptr != '\0') {
    shell_error(sh, "ERROR: Invalid channel number");
    return -EINVAL;
  }

  uint16_t raw_value = 0;
  zplc_hal_result_t ret = zplc_hal_adc_read((uint8_t)channel, &raw_value);

  if (ret != ZPLC_HAL_OK) {
    shell_error(sh, "ERROR: ADC read failed (%d)", ret);
    return -EIO;
  }

  int32_t mv = (raw_value * 3300) / 4096;

  shell_print(sh, "ADC Channel %lu:", channel);
  shell_print(sh, "  Raw:    %u (0x%04X)", raw_value, raw_value);
  shell_print(sh, "  Voltage: %d.%03d V", mv / 1000, mv % 1000);

  return 0;
}

/* ADC subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_adc,
    SHELL_CMD(temp, NULL, "Read internal temperature sensor", cmd_adc_temp),
    SHELL_CMD_ARG(read, NULL, "Read ADC channel: adc read <channel>",
                  cmd_adc_read, 2, 0),
    SHELL_SUBCMD_SET_END);

#endif /* CONFIG_ADC */

/* ============================================================================
 * HIL Debug Commands
 * ============================================================================
 */

#ifdef CONFIG_ZPLC_HIL_DEBUG

/** @brief Cycle counter for HIL status reporting */
static uint32_t cycle_count = 0;

/**
 * @brief Handler for 'zplc hil mode <off|summary|verbose>'
 */
static int cmd_hil_mode(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc hil mode <off|summary|verbose>");
    return -EINVAL;
  }

  hil_mode_t mode = HIL_MODE_OFF;
  const char *mode_str = argv[1];

  if (strcmp(mode_str, "off") == 0) {
    mode = HIL_MODE_OFF;
  } else if (strcmp(mode_str, "summary") == 0) {
    mode = HIL_MODE_SUMMARY;
  } else if (strcmp(mode_str, "verbose") == 0) {
    mode = HIL_MODE_VERBOSE;
  } else {
    shell_error(sh, "Invalid mode. Use: off, summary, verbose");
    hil_send_ack("mode", mode_str, false, "Invalid mode");
    return -EINVAL;
  }

  hil_set_shell(sh);
  hil_set_mode(mode);
  hil_send_ack("mode", mode_str, true, NULL);
  
  return 0;
}

/**
 * @brief Handler for 'zplc hil status'
 */
static int cmd_hil_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  hil_mode_t mode = hil_get_mode();
  const char *mode_str = "unknown";
  
  switch (mode) {
    case HIL_MODE_OFF: mode_str = "off"; break;
    case HIL_MODE_SUMMARY: mode_str = "summary"; break;
    case HIL_MODE_VERBOSE: mode_str = "verbose"; break;
  }

  /* Output status as JSON */
  shell_fprintf(sh, SHELL_NORMAL, 
                "{\"t\":\"status\",\"mode\":\"%s\",\"cycles\":%u,\"uptime\":%u}\r\n",
                mode_str, cycle_count, k_uptime_get_32());
  
  return 0;
}

/**
 * @brief Handler for 'zplc hil watch <add|del|clear> [args]'
 */
static int cmd_hil_watch(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc hil watch <add|del|clear>");
    return -EINVAL;
  }

  const char *subcmd = argv[1];

  if (strcmp(subcmd, "clear") == 0) {
    /* TODO: Implement clear logic in debug.c if needed, or just ack for now */
    hil_send_ack("watch", "clear", true, NULL);
    return 0;
  }

  if (strcmp(subcmd, "add") == 0) {
    if (argc < 4) {
      shell_error(sh, "Usage: zplc hil watch add <addr> <type>");
      return -EINVAL;
    }
    
    char *endptr;
    unsigned long addr = strtoul(argv[2], &endptr, 0);
    const char *type = argv[3];
    
    if (*endptr != '\0') {
       hil_send_ack("watch", "add", false, "Invalid address");
       return -EINVAL;
    }

    char val_str[32];
    snprintf(val_str, sizeof(val_str), "%lu:%s", addr, type);
    hil_send_ack("watch", val_str, true, NULL);
    return 0;
  }
  
  if (strcmp(subcmd, "del") == 0) {
    if (argc < 3) {
      shell_error(sh, "Usage: zplc hil watch del <addr>");
      return -EINVAL;
    }
    hil_send_ack("watch", argv[2], true, NULL);
    return 0;
  }

  hil_send_ack("watch", subcmd, false, "Unknown subcommand");
  return -EINVAL;
}

/**
 * @brief Handler for 'zplc hil reset'
 */
static int cmd_hil_reset(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  /* Reuse the standard reset logic */
  zplc_core_init();
  cycle_count = 0;
  /* Reset runtime state if in legacy mode, 
     but HIL usually runs alongside scheduler so maybe just init core */
  
  hil_send_ack("reset", "ok", true, NULL);
  return 0;
}

/* HIL subcommands */
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_hil,
    SHELL_CMD_ARG(mode, NULL, "Set debug mode: mode <off|summary|verbose>",
                  cmd_hil_mode, 2, 0),
    SHELL_CMD(status, NULL, "Show HIL status", cmd_hil_status),
    SHELL_CMD_ARG(watch, NULL, "Manage watches: watch <add|del|clear>",
                  cmd_hil_watch, 2, 2),
    SHELL_CMD(reset, NULL, "Reset VM", cmd_hil_reset),
    SHELL_SUBCMD_SET_END);

#endif /* CONFIG_ZPLC_HIL_DEBUG */

/* ============================================================================
 * Shell Command Registration

 * ============================================================================
 */

/* Debug subcommands under 'zplc dbg' */
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_dbg, SHELL_CMD(pause, NULL, "Pause VM execution", cmd_dbg_pause),
    SHELL_CMD(resume, NULL, "Resume VM execution", cmd_dbg_resume),
    SHELL_CMD(step, NULL, "Execute one cycle", cmd_dbg_step),
    SHELL_CMD_ARG(peek, NULL, "Read memory: dbg peek <addr> [len]",
                  cmd_dbg_peek, 2, 1),
    SHELL_CMD_ARG(poke, NULL, "Write memory: dbg poke <addr> <value>",
                  cmd_dbg_poke, 3, 0),
    SHELL_CMD_ARG(info, NULL, "Show detailed VM state [--json]", cmd_dbg_info,
                  1, 1),
    SHELL_CMD_ARG(ticks, NULL, "Show current system tick (ms) [--json]",
                  cmd_dbg_ticks, 1, 1),
    SHELL_CMD_ARG(mem, NULL,
                  "Dump memory region: dbg mem <ipi|opi|work|retain> [offset]",
                  cmd_dbg_mem, 2, 1),
    SHELL_CMD_ARG(
        task, NULL,
        "Show detailed info for a specific task: dbg task <id> [--json]",
        cmd_dbg_task, 2, 1),
    SHELL_CMD_ARG(watch, NULL, "Watch memory address: dbg watch <addr> [type]",
                  cmd_dbg_watch, 2, 1),
    SHELL_CMD_ARG(timer, NULL, "Inspect timer state: dbg timer <addr>",
                  cmd_dbg_timer, 2, 0),
    SHELL_SUBCMD_SET_END);

/* Subcommands under 'zplc' */
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_zplc,
    SHELL_CMD_ARG(load, NULL,
                  "Prepare to receive <size> bytes: zplc load <size>",
                  cmd_zplc_load, 2, 0),
    SHELL_CMD_ARG(data, NULL, "Receive hex-encoded chunk: zplc data <hex>",
                  cmd_zplc_data, 2, 0),
    SHELL_CMD(start, NULL, "Start VM execution", cmd_zplc_start),
    SHELL_CMD(stop, NULL, "Stop VM execution", cmd_zplc_stop),
    SHELL_CMD_ARG(status, NULL, "Show runtime status [--json]", cmd_zplc_status,
                  1, 1),
    SHELL_CMD(reset, NULL, "Reset VM to initial state", cmd_zplc_reset),
    SHELL_CMD(version, NULL, "Show version info", cmd_zplc_version),
    SHELL_CMD(dbg, &sub_dbg,
              "Debug commands (pause/resume/step/peek/poke/info)", NULL),
#ifdef CONFIG_ZPLC_SCHEDULER
    SHELL_CMD(sched, &sub_sched, "Scheduler commands (status/tasks)", NULL),
    SHELL_CMD(persist, &sub_persist, "Persistence commands (clear/info)", NULL),
    SHELL_CMD(sys, &sub_sys, "System information (info)", NULL),
#endif
#ifdef CONFIG_ADC
    SHELL_CMD(adc, &sub_adc, "ADC commands (temp/read)", NULL),
#endif
#ifdef CONFIG_ZPLC_HIL_DEBUG
    SHELL_CMD(hil, &sub_hil, "HIL Debug commands (mode/status/watch/reset)", NULL),
#endif
    SHELL_SUBCMD_SET_END);

/* Root 'zplc' command */
SHELL_CMD_REGISTER(zplc, &sub_zplc, "ZPLC runtime commands", NULL);
