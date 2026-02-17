/**
 * @file shell_cmds.c
 * @brief ZPLC Shell Commands for Zephyr
 *
 * This file implements the command-line interface for the ZPLC runtime.
 * It uses the Zephyr shell subsystem to provide commands for:
 *   - Loading bytecode (load/data)
 *   - Execution control (start/stop/reset)
 *   - Runtime status inspection
 *   - Debugging (peek/poke/pause/resume/step/bp)
 *   - Hardware features (ADC, GPIO)
 */

#include <zephyr/shell/shell.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/reboot.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/adc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_debug.h>

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_scheduler.h>
#endif

#include <zephyr/version.h>

#ifdef CONFIG_SOC_SERIES_RP2XXX
#include <hardware/clocks.h>
#define CPU_FREQ_MHZ (clock_get_hz(clk_sys) / 1000000)
#else
#define CPU_FREQ_MHZ 125
#endif

typedef enum {
  ZPLC_STATE_IDLE = 0,
  ZPLC_STATE_LOADING,
  ZPLC_STATE_READY,
  ZPLC_STATE_RUNNING,
  ZPLC_STATE_PAUSED,
  ZPLC_STATE_ERROR
} zplc_state_t;

/* ============================================================================
 * Internal State & Helper Functions
 * ============================================================================
 */

/* Runtime state from main.c */
extern zplc_state_t runtime_state;
extern uint32_t cycle_count;
extern uint8_t *program_buffer;
extern size_t program_buffer_size;
extern size_t program_expected_size;
extern size_t program_received_size;
extern uint8_t step_requested;

/**
 * @brief Convert hex string to byte array.
 */
static int hex_decode(const char *hex, uint8_t *out, size_t out_len) {
  size_t len = strlen(hex);
  if (len % 2 != 0 || len / 2 > out_len) {
    return -1;
  }

  for (size_t i = 0; i < len / 2; i++) {
    char buf[3] = {hex[i * 2], hex[i * 2 + 1], '\0'};
    out[i] = (uint8_t)strtoul(buf, NULL, 16);
  }

  return (int)(len / 2);
}

/**
 * @brief Get state name as string.
 */
static const char *state_name(zplc_state_t state) {
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

/* ============================================================================
 * Shell Command Handlers - Global
 * ============================================================================
 */

/**
 * @brief Handler for 'zplc version'
 */
static int cmd_zplc_version(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  shell_print(sh, "ZPLC Runtime v%s", zplc_core_version());
  shell_print(sh, "Build: %s %s", __DATE__, __TIME__);
  return 0;
}

/* ============================================================================
 * JSON Helpers
 * ============================================================================
 */

#define JSON_OBJ_START(sh) shell_fprintf(sh, SHELL_NORMAL, "{")
#define JSON_OBJ_END(sh) shell_fprintf(sh, SHELL_NORMAL, "}")
#define JSON_KEY(sh, key) shell_fprintf(sh, SHELL_NORMAL, "\"%s\":", key)
#define JSON_STR(sh, key, val, comma)                                          \
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":\"%s\"%s", key, val,                 \
                (comma) ? "," : "")
#define JSON_INT(sh, key, val, comma)                                          \
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":%d%s", key, (int)val,                \
                (comma) ? "," : "")
#define JSON_UINT(sh, key, val, comma)                                         \
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":%u%s", key, (unsigned int)val,       \
                (comma) ? "," : "")
#define JSON_BOOL(sh, key, val, comma)                                         \
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":%s%s", key,                          \
                (val) ? "true" : "false", (comma) ? "," : "")
#define JSON_NEWLINE(sh) shell_fprintf(sh, SHELL_NORMAL, "\n")

/* ============================================================================
 * Forward Declarations for Handlers
 * ============================================================================
 */

#ifndef CONFIG_ZPLC_SCHEDULER
static int cmd_zplc_load(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_status(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv);
#endif

/* Debug Handlers */
static int cmd_dbg_pause(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_resume(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_peek(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_poke(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_info(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_ticks(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_mem(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_task(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_watch(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_timer(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_bp_add(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_bp_remove(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_bp_clear(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_bp_list(const struct shell *sh, size_t argc, char **argv);

/* ADC Handlers */
#ifdef CONFIG_ADC
static int cmd_adc_temp(const struct shell *sh, size_t argc, char **argv);
static int cmd_adc_read(const struct shell *sh, size_t argc, char **argv);
#endif

/* HIL Debug Handlers */
#ifdef CONFIG_ZPLC_HIL_DEBUG
static int cmd_hil_mode(const struct shell *sh, size_t argc, char **argv);
static int cmd_hil_status(const struct shell *sh, size_t argc, char **argv);
static int cmd_hil_watch(const struct shell *sh, size_t argc, char **argv);
static int cmd_hil_reset(const struct shell *sh, size_t argc, char **argv);
#endif

/* Scheduler Handlers */
#ifdef CONFIG_ZPLC_SCHEDULER
static int cmd_sched_status(const struct shell *sh, size_t argc, char **argv);
static int cmd_sched_tasks(const struct shell *sh, size_t argc, char **argv);
static int cmd_sys_info(const struct shell *sh, size_t argc, char **argv);
static int cmd_sys_reboot(const struct shell *sh, size_t argc, char **argv);
#endif

/* ============================================================================
 * Implementation - Command Handlers
 * ============================================================================
 */

#ifdef CONFIG_ZPLC_SCHEDULER

/* ============================================================================
 * Shell Command Handlers - Scheduler Mode
 * ============================================================================
 */

static int cmd_sched_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);

  zplc_sched_stats_t stats;
  zplc_sched_get_stats(&stats);

  if (json) {
    JSON_OBJ_START(sh);
    JSON_STR(sh, "state", state_name((zplc_state_t)zplc_sched_get_state()),
             true);
    JSON_UINT(sh, "uptime_ms", stats.uptime_ms, true);
    JSON_OBJ_START(sh);
    shell_fprintf(sh, SHELL_NORMAL, "\"stats\":");
    JSON_OBJ_START(sh);
    JSON_UINT(sh, "cycles", stats.total_cycles, true);
    JSON_UINT(sh, "overruns", stats.total_overruns, true);
    JSON_UINT(sh, "active_tasks", stats.active_tasks, false);
    JSON_OBJ_END(sh);
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  shell_print(sh, "Scheduler Status:");
  shell_print(sh, "  State:      %s",
              state_name((zplc_state_t)zplc_sched_get_state()));
  shell_print(sh, "  Uptime:     %u ms", stats.uptime_ms);
  shell_print(sh, "  Tasks:      %u active", stats.active_tasks);
  shell_print(sh, "  Tot Cycles: %u", stats.total_cycles);
  shell_print(sh, "  Tot Ovr:    %u", stats.total_overruns);

  return 0;
}

static int cmd_sched_tasks(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  int count = zplc_sched_get_task_count();
  shell_print(sh, "Registered Tasks (%d):", count);
  shell_print(sh, " ID | Prio | Interval | Cycles | Overruns | State");
  shell_print(sh, "----+------+----------+--------+----------+-------");

  for (int i = 0; i < 8; i++) {
    zplc_task_t task;
    if (zplc_sched_get_task(i, &task) == 0) {
      shell_print(sh, " %2d | %4d | %6u us | %6u | %8u | %s", task.config.id,
                  task.config.priority, task.config.interval_us,
                  task.stats.cycle_count, task.stats.overrun_count,
                  state_name((zplc_state_t)task.state));
    }
  }

  return 0;
}

static int cmd_sys_info(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);

  if (json) {
    JSON_OBJ_START(sh);
    JSON_STR(sh, "board", CONFIG_BOARD, true);
    JSON_STR(sh, "zplc_version", zplc_core_version(), true);
    JSON_STR(sh, "zephyr_version", KERNEL_VERSION_STRING, true);
    JSON_UINT(sh, "uptime_ms", k_uptime_get_32(), true);
    JSON_UINT(sh, "cpu_freq_mhz", CPU_FREQ_MHZ, true);

    shell_fprintf(sh, SHELL_NORMAL, "\"capabilities\":");
    JSON_OBJ_START(sh);
    JSON_BOOL(sh, "fpu", true, true);
    JSON_BOOL(sh, "mpu", true, true);
    JSON_BOOL(sh, "scheduler", true, true);
    JSON_INT(sh, "max_tasks", CONFIG_ZPLC_MAX_TASKS, false);
    JSON_OBJ_END(sh);
    shell_fprintf(sh, SHELL_NORMAL, ",");

    shell_fprintf(sh, SHELL_NORMAL, "\"memory\":");
    JSON_OBJ_START(sh);
    JSON_INT(sh, "work_size", ZPLC_MEM_WORK_SIZE, true);
    JSON_INT(sh, "retain_size", ZPLC_MEM_RETAIN_SIZE, true);
    JSON_INT(sh, "ipi_size", ZPLC_MEM_IPI_SIZE, true);
    JSON_INT(sh, "opi_size", ZPLC_MEM_OPI_SIZE, false);
    JSON_OBJ_END(sh);

    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  shell_print(sh, "System Information:");
  shell_print(sh, "  Board:          %s", CONFIG_BOARD);
  shell_print(sh, "  ZPLC Version:   %s", zplc_core_version());
  shell_print(sh, "  Zephyr Version: %s", KERNEL_VERSION_STRING);
  shell_print(sh, "  Uptime:         %u ms", k_uptime_get_32());
  shell_print(sh, "  CPU Freq:       %u MHz", (unsigned int)CPU_FREQ_MHZ);
  shell_print(sh, "  Memory Sizes:   WORK=%d, RETAIN=%d, IPI=%d, OPI=%d",
              ZPLC_MEM_WORK_SIZE, ZPLC_MEM_RETAIN_SIZE, ZPLC_MEM_IPI_SIZE,
              ZPLC_MEM_OPI_SIZE);

  return 0;
}

static int cmd_sys_reboot(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(sh);
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  sys_reboot(SYS_REBOOT_COLD);
  return 0;
}

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

  /* Get memory region pointer */
  uint8_t *base = NULL;
  uint16_t offset = 0;
  uint16_t region_size = 0;

  if (addr < ZPLC_MEM_OPI_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    offset = (uint16_t)addr;
    region_size = ZPLC_MEM_IPI_SIZE;
  } else if (addr < ZPLC_MEM_WORK_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_OPI_BASE);
    region_size = ZPLC_MEM_OPI_SIZE;
  } else if (addr < ZPLC_MEM_RETAIN_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_WORK_BASE);
    region_size = ZPLC_MEM_WORK_SIZE;
  } else {
    base = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_RETAIN_BASE);
    region_size = ZPLC_MEM_RETAIN_SIZE;
  }

  if (base == NULL) {
    shell_error(sh, "ERROR: Invalid memory region");
    return -EINVAL;
  }

  if ((uint32_t)offset + (uint32_t)len > (uint32_t)region_size) {
    shell_error(sh,
                "ERROR: Access out of bounds (offset %u + len %lu > size %u)",
                offset, len, region_size);
    return -EINVAL;
  }

  shell_print(sh, "Memory at 0x%04lX (%lu bytes):", addr, len);

  /* Print in rows of 16 bytes */
  for (unsigned long i = 0; i < len; i += 16) {
    char line[80];
    int pos = 0;
    pos += snprintf(line + pos, sizeof(line) - pos, "%04lX: ", addr + i);
    for (unsigned long j = 0; j < 16 && (i + j) < len; j++) {
      pos += snprintf(line + pos, sizeof(line) - pos, "%02X ", base[offset + i + j]);
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
  uint16_t region_size = 0;

  if (addr < ZPLC_MEM_OPI_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    offset = (uint16_t)addr;
    region_size = ZPLC_MEM_IPI_SIZE;
  } else if (addr < ZPLC_MEM_WORK_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_OPI_BASE);
    region_size = ZPLC_MEM_OPI_SIZE;
  } else if (addr < ZPLC_MEM_RETAIN_BASE) {
    base = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_WORK_BASE);
    region_size = ZPLC_MEM_WORK_SIZE;
  } else {
    base = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    offset = (uint16_t)(addr - ZPLC_MEM_RETAIN_BASE);
    region_size = ZPLC_MEM_RETAIN_SIZE;
  }

  if (base == NULL) {
    shell_error(sh, "ERROR: Invalid memory address");
    return -EINVAL;
  }

  if (offset >= region_size) {
    shell_error(sh, "ERROR: Offset out of bounds (offset %u >= size %u)", offset,
                region_size);
    return -EINVAL;
  }

  base[offset] = (uint8_t)value;
  shell_print(sh, "OK: Wrote 0x%02X to 0x%04lX", (uint8_t)value, addr);

  return 0;
}

static int cmd_dbg_ticks(const struct shell *sh, size_t argc, char **argv) {
  uint32_t ticks = k_uptime_get_32();
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);

  if (json) {
    JSON_OBJ_START(sh);
    JSON_UINT(sh, "ticks", ticks, false);
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
  uint16_t region_size = 0;

  if (strcmp(region_name, "ipi") == 0) {
    base = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
    region_base_addr = ZPLC_MEM_IPI_BASE;
    region_size = ZPLC_MEM_IPI_SIZE;
  } else if (strcmp(region_name, "opi") == 0) {
    base = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    region_base_addr = ZPLC_MEM_OPI_BASE;
    region_size = ZPLC_MEM_OPI_SIZE;
  } else if (strcmp(region_name, "work") == 0) {
    base = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
    region_base_addr = ZPLC_MEM_WORK_BASE;
    region_size = ZPLC_MEM_WORK_SIZE;
  } else if (strcmp(region_name, "retain") == 0) {
    base = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
    region_base_addr = ZPLC_MEM_RETAIN_BASE;
    region_size = ZPLC_MEM_RETAIN_SIZE;
  } else {
    shell_error(sh, "ERROR: Invalid region '%s' (use ipi, opi, work, or retain)",
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

  if (offset >= region_size) {
    shell_error(sh, "ERROR: Offset out of bounds (0x%04lX >= 0x%04X)", offset,
                region_size);
    return -EINVAL;
  }

  shell_print(sh, "--- %s Memory Dump (offset 0x%04lX) ---", region_name,
              offset);

  /* Print 64 bytes in rows of 16 */
  for (int i = 0; i < 64; i += 16) {
    if (offset + i >= region_size)
      break;
    char line[128];
    int pos = 0;

    pos += snprintf(line + pos, sizeof(line) - pos, "%04lX: ",
                    (unsigned long)region_base_addr + offset + i);

    for (int j = 0; j < 16; j++) {
      if (offset + i + j >= region_size)
        break;
      pos += snprintf(line + pos, sizeof(line) - pos, "%02X ",
                      base[offset + i + j]);
    }

    pos += snprintf(line + pos, sizeof(line) - pos, " | ");

    for (int j = 0; j < 16; j++) {
      if (offset + i + j >= region_size)
        break;
      uint8_t c = base[offset + i + j];
      pos += snprintf(line + pos, sizeof(line) - pos, "%c",
                      isprint(c) ? c : '.');
    }

    shell_print(sh, "%s", line);
  }

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
  if (size > program_buffer_size) {
    shell_error(sh, "ERROR: Size %lu exceeds buffer (%zu bytes)", size,
                program_buffer_size);
    return -ENOMEM;
  }
  if (runtime_state == ZPLC_STATE_RUNNING) {
    runtime_state = ZPLC_STATE_IDLE;
    k_msleep(10);
  }
  memset(program_buffer, 0, program_buffer_size);
  program_expected_size = size;
  program_received_size = 0;
  runtime_state = ZPLC_STATE_LOADING;
  shell_print(sh, "OK: Ready to receive %lu bytes", size);
  return 0;
}

static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc data <hex>");
    return -EINVAL;
  }
  if (runtime_state != ZPLC_STATE_LOADING) {
    shell_error(sh, "ERROR: Not in loading state (use 'zplc load' first)");
    return -EINVAL;
  }
  const char *hex = argv[1];
  size_t remaining = program_expected_size - program_received_size;
  int decoded = hex_decode(hex, program_buffer + program_received_size, remaining);
  if (decoded < 0) {
    shell_error(sh, "ERROR: Hex decode failed");
    return -EINVAL;
  }
  program_received_size += decoded;
  if (program_received_size >= program_expected_size) {
    int ret = zplc_core_load_raw(program_buffer, program_received_size);
    if (ret != 0) {
      shell_error(sh, "ERROR: Program load failed (%d)", ret);
      runtime_state = ZPLC_STATE_ERROR;
      return ret;
    }
    runtime_state = ZPLC_STATE_READY;
    shell_print(sh, "OK: Program loaded (%zu bytes)", program_received_size);
  } else {
    shell_print(sh, "OK: Received %d bytes (%zu/%zu)", decoded,
                program_received_size, program_expected_size);
  }
  return 0;
}

static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  if (runtime_state != ZPLC_STATE_READY && runtime_state != ZPLC_STATE_IDLE &&
      runtime_state != ZPLC_STATE_PAUSED) {
    shell_error(sh, "ERROR: Not ready (state=%s)", state_name(runtime_state));
    return -EINVAL;
  }
  if (runtime_state == ZPLC_STATE_READY || runtime_state == ZPLC_STATE_IDLE) {
    cycle_count = 0;
    zplc_vm_t *vm = zplc_core_get_default_vm();
    if (vm) {
      zplc_vm_reset_cycle(vm);
    }
  }
  runtime_state = ZPLC_STATE_RUNNING;
  shell_print(sh, "OK: PLC started");
  return 0;
}

static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  runtime_state = ZPLC_STATE_IDLE;
  shell_print(sh, "OK: PLC stopped");
  return 0;
}

static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  runtime_state = ZPLC_STATE_IDLE;
  cycle_count = 0;
  zplc_core_init();
  if (program_received_size > 0) {
    zplc_core_load_raw(program_buffer, program_received_size);
    runtime_state = ZPLC_STATE_READY;
  }
  shell_print(sh, "OK: Runtime reset");
  return 0;
}

static int cmd_zplc_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);
  zplc_vm_t *vm = zplc_core_get_default_vm();
  if (json) {
    JSON_OBJ_START(sh);
    JSON_STR(sh, "state", state_name(runtime_state), true);
    JSON_UINT(sh, "uptime_ms", k_uptime_get_32(), true);
    shell_fprintf(sh, SHELL_NORMAL, "\"stats\":");
    JSON_OBJ_START(sh);
    JSON_UINT(sh, "cycles", cycle_count, true);
    JSON_UINT(sh, "program_size", program_received_size, false);
    JSON_OBJ_END(sh);
    if (vm) {
      shell_fprintf(sh, SHELL_NORMAL, ",\"vm\":");
      JSON_OBJ_START(sh);
      JSON_UINT(sh, "pc", vm->pc, true);
      JSON_UINT(sh, "sp", vm->sp, true);
      JSON_BOOL(sh, "halted", vm->halted != 0, true);
      JSON_INT(sh, "error", vm->error, false);
      JSON_OBJ_END(sh);
    }
    shell_fprintf(sh, SHELL_NORMAL, ",\"opi\":[");
    uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    for (int i = 0; i < 8; i++) {
      shell_fprintf(sh, SHELL_NORMAL, "%u%s", opi ? opi[i] : 0, (i < 7) ? "," : "");
    }
    shell_fprintf(sh, SHELL_NORMAL, "]");
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }
  shell_print(sh, "ZPLC Status:");
  shell_print(sh, "  State:   %s", state_name(runtime_state));
  shell_print(sh, "  Cycles:  %u", cycle_count);
  shell_print(sh, "  Program: %zu bytes", program_received_size);
  if (vm) {
    shell_print(sh, "  VM:      PC=%04X, SP=%d, Halted=%s, Error=%d", vm->pc,
                vm->sp, vm->halted ? "YES" : "NO", vm->error);
  }
  return 0;
}

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

static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  if (runtime_state == ZPLC_STATE_RUNNING) {
    runtime_state = ZPLC_STATE_PAUSED;
    k_msleep(10);
  }
  if (runtime_state != ZPLC_STATE_PAUSED && runtime_state != ZPLC_STATE_READY) {
    shell_error(sh, "ERROR: Cannot step (state=%s)", state_name(runtime_state));
    return -EINVAL;
  }
  if (runtime_state == ZPLC_STATE_READY) {
    zplc_core_init();
    zplc_core_load_raw(program_buffer, program_received_size);
    cycle_count = 0;
    runtime_state = ZPLC_STATE_PAUSED;
  }
  step_requested = 1;
  shell_print(sh, "OK: Step requested");
  return 0;
}

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
  if (runtime_state == ZPLC_STATE_RUNNING) {
    runtime_state = ZPLC_STATE_IDLE;
    k_msleep(10);
  }
  memset(program_buffer, 0, program_buffer_size);
  program_expected_size = size;
  program_received_size = 0;
  runtime_state = ZPLC_STATE_LOADING;
  shell_print(sh, "OK: Ready to receive %lu bytes", size);
  return 0;
}

static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc data <hex>");
    return -EINVAL;
  }
  if (runtime_state != ZPLC_STATE_LOADING) {
    shell_error(sh, "ERROR: Not in loading state (use 'zplc load' first)");
    return -EINVAL;
  }
  const char *hex = argv[1];
  size_t remaining = program_expected_size - program_received_size;
  int decoded = hex_decode(hex, program_buffer + program_received_size, remaining);
  if (decoded < 0) {
    shell_error(sh, "ERROR: Hex decode failed");
    return -EINVAL;
  }
  program_received_size += decoded;
  if (program_received_size >= program_expected_size) {
    int ret = zplc_core_load_raw(program_buffer, program_received_size);
    if (ret != 0) {
      shell_error(sh, "ERROR: Program load failed (%d)", ret);
      runtime_state = ZPLC_STATE_ERROR;
      return ret;
    }
    runtime_state = ZPLC_STATE_READY;
    shell_print(sh, "OK: Program loaded (%zu bytes)", program_received_size);
  } else {
    shell_print(sh, "OK: Received %d bytes (%zu/%zu)", decoded,
                program_received_size, program_expected_size);
  }
  return 0;
}

static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  if (runtime_state != ZPLC_STATE_READY && runtime_state != ZPLC_STATE_IDLE &&
      runtime_state != ZPLC_STATE_PAUSED) {
    shell_error(sh, "ERROR: Not ready (state=%s)", state_name(runtime_state));
    return -EINVAL;
  }
  if (runtime_state == ZPLC_STATE_READY || runtime_state == ZPLC_STATE_IDLE) {
    cycle_count = 0;
    zplc_vm_t *vm = zplc_core_get_default_vm();
    if (vm) {
      zplc_vm_reset_cycle(vm);
    }
  }
  runtime_state = ZPLC_STATE_RUNNING;
  shell_print(sh, "OK: PLC started");
  return 0;
}

static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  runtime_state = ZPLC_STATE_IDLE;
  shell_print(sh, "OK: PLC stopped");
  return 0;
}

static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  runtime_state = ZPLC_STATE_IDLE;
  cycle_count = 0;
  zplc_core_init();
  if (program_received_size > 0) {
    zplc_core_load_raw(program_buffer, program_received_size);
    runtime_state = ZPLC_STATE_READY;
  }
  shell_print(sh, "OK: Runtime reset");
  return 0;
}

static int cmd_zplc_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);
  zplc_vm_t *vm = zplc_core_get_default_vm();
  if (json) {
    JSON_OBJ_START(sh);
    JSON_STR(sh, "state", state_name(runtime_state), true);
    JSON_UINT(sh, "uptime_ms", k_uptime_get_32(), true);
    shell_fprintf(sh, SHELL_NORMAL, "\"stats\":");
    JSON_OBJ_START(sh);
    JSON_UINT(sh, "cycles", cycle_count, true);
    JSON_UINT(sh, "program_size", program_received_size, false);
    JSON_OBJ_END(sh);
    if (vm) {
      shell_fprintf(sh, SHELL_NORMAL, ",\"vm\":");
      JSON_OBJ_START(sh);
      JSON_UINT(sh, "pc", vm->pc, true);
      JSON_UINT(sh, "sp", vm->sp, true);
      JSON_BOOL(sh, "halted", vm->halted != 0, true);
      JSON_INT(sh, "error", vm->error, false);
      JSON_OBJ_END(sh);
    }
    shell_fprintf(sh, SHELL_NORMAL, ",\"opi\":[");
    uint8_t *opi = zplc_mem_get_region(ZPLC_MEM_OPI_BASE);
    for (int i = 0; i < 8; i++) {
      shell_fprintf(sh, SHELL_NORMAL, "%u%s", opi ? opi[i] : 0, (i < 7) ? "," : "");
    }
    shell_fprintf(sh, SHELL_NORMAL, "]");
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }
  shell_print(sh, "ZPLC Status:");
  shell_print(sh, "  State:   %s", state_name(runtime_state));
  shell_print(sh, "  Cycles:  %u", cycle_count);
  shell_print(sh, "  Program: %zu bytes", program_received_size);
  if (vm) {
    shell_print(sh, "  VM:      PC=%04X, SP=%d, Halted=%s, Error=%d", vm->pc,
                vm->sp, vm->halted ? "YES" : "NO", vm->error);
  }
  return 0;
}

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

static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  if (runtime_state == ZPLC_STATE_RUNNING) {
    runtime_state = ZPLC_STATE_PAUSED;
    k_msleep(10);
  }
  if (runtime_state != ZPLC_STATE_PAUSED && runtime_state != ZPLC_STATE_READY) {
    shell_error(sh, "ERROR: Cannot step (state=%s)", state_name(runtime_state));
    return -EINVAL;
  }
  if (runtime_state == ZPLC_STATE_READY) {
    zplc_core_init();
    zplc_core_load_raw(program_buffer, program_received_size);
    cycle_count = 0;
    runtime_state = ZPLC_STATE_PAUSED;
  }
  step_requested = 1;
  shell_print(sh, "OK: Step requested");
  return 0;
}

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
  for (unsigned long offset = 0; offset < len; offset += 16) {
    char line[80];
    int pos = 0;
    pos += snprintf(line + pos, sizeof(line) - pos, "%04lX: ", addr + offset);
    for (unsigned long i = 0; i < 16 && (offset + i) < len; i++) {
      uint8_t val = 0;
      uint16_t a = (uint16_t)(addr + offset + i);
      if (a < 0x1000) {
        val = zplc_ipi_read8(a);
      } else if (a < 0x2000) {
        val = zplc_opi_read8(a - 0x1000);
      } else if (a < 0x4000) {
        uint8_t *work = zplc_mem_get_region(0x2000);
        if (work) val = work[a - 0x2000];
      } else if (a < 0x5000) {
        uint8_t *retain = zplc_mem_get_region(0x4000);
        if (retain) val = retain[a - 0x4000];
      }
      pos += snprintf(line + pos, sizeof(line) - pos, "%02X ", val);
    }
    shell_print(sh, "%s", line);
  }
  shell_print(sh, "OK: Read %lu bytes at 0x%04lX", len, addr);
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
  if (addr < 0x1000) {
    zplc_ipi_write8((uint16_t)addr, (uint8_t)value);
  } else if (addr >= 0x2000 && addr < 0x4000) {
    uint8_t *work = zplc_mem_get_region(0x2000);
    if (work) work[addr - 0x2000] = (uint8_t)value;
  } else {
    shell_error(sh, "ERROR: Address not writable (only IPI and WORK allowed)");
    return -EINVAL;
  }
  shell_print(sh, "OK: Wrote 0x%02X to 0x%04lX", (uint8_t)value, addr);
  return 0;
}

#endif /* CONFIG_ZPLC_SCHEDULER */

/* ============================================================================
 * Breakpoint Commands (Common)
 * ============================================================================
 */

static int cmd_dbg_bp_add(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc dbg bp add <pc>");
    return -EINVAL;
  }
  uint16_t pc = (uint16_t)strtoul(argv[1], NULL, 0);
  int last_err = 0;
  bool found = false;

#ifdef CONFIG_ZPLC_SCHEDULER
  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    zplc_vm_t *vm = zplc_sched_get_vm_ptr(i);
    if (vm) {
      found = true;
      int ret = zplc_vm_add_breakpoint(vm, pc);
      if (ret < 0)
        last_err = ret;
    }
  }
#else
  zplc_vm_t *vm = zplc_core_get_default_vm();
  if (vm) {
    found = true;
    last_err = zplc_vm_add_breakpoint(vm, pc);
  }
#endif

  if (!found) {
    hil_send_ack("bp", "add", false, "no VM active");
  } else if (last_err == 0) {
    char val[16];
    snprintf(val, sizeof(val), "add:%u", pc);
    hil_send_ack("bp", val, true, NULL);
  } else {
    const char *err_msg = (last_err == -2) ? "table full" : "already exists";
    hil_send_ack("bp", "add", false, err_msg);
  }
  return 0;
}

static int cmd_dbg_bp_remove(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc dbg bp remove <pc>");
    return -EINVAL;
  }
  uint16_t pc = (uint16_t)strtoul(argv[1], NULL, 0);
  int last_err = 0;
  bool found = false;

#ifdef CONFIG_ZPLC_SCHEDULER
  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    zplc_vm_t *vm = zplc_sched_get_vm_ptr(i);
    if (vm) {
      found = true;
      int ret = zplc_vm_remove_breakpoint(vm, pc);
      if (ret < 0)
        last_err = ret;
    }
  }
#else
  zplc_vm_t *vm = zplc_core_get_default_vm();
  if (vm) {
    found = true;
    last_err = zplc_vm_remove_breakpoint(vm, pc);
  }
#endif

  if (!found) {
    hil_send_ack("bp", "remove", false, "no VM active");
  } else if (last_err == 0) {
    char val[16];
    snprintf(val, sizeof(val), "remove:%u", pc);
    hil_send_ack("bp", val, true, NULL);
  } else {
    hil_send_ack("bp", "remove", false, "not found");
  }
  return 0;
}

static int cmd_dbg_bp_clear(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  bool found = false;

#ifdef CONFIG_ZPLC_SCHEDULER
  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    zplc_vm_t *vm = zplc_sched_get_vm_ptr(i);
    if (vm) {
      found = true;
      zplc_vm_clear_breakpoints(vm);
    }
  }
#else
  zplc_vm_t *vm = zplc_core_get_default_vm();
  if (vm) {
    found = true;
    zplc_vm_clear_breakpoints(vm);
  }
#endif

  if (!found) {
    hil_send_ack("bp", "clear", false, "no VM active");
  } else {
    hil_send_ack("bp", "clear", true, NULL);
  }
  return 0;
}

static int cmd_dbg_bp_list(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  zplc_vm_t *vm = NULL;

#ifdef CONFIG_ZPLC_SCHEDULER
  for (int i = 0; i < 8; i++) {
    vm = zplc_sched_get_vm_ptr(i);
    if (vm) break;
  }
#else
  vm = zplc_core_get_default_vm();
#endif

  if (!vm) {
    hil_send_ack("bp", "list", false, "no VM active");
    return 0;
  }

  uint8_t count = zplc_vm_get_breakpoint_count(vm);
  shell_fprintf(sh, SHELL_NORMAL, "{\"t\":\"ack\",\"cmd\":\"bp\",\"val\":\"list\",\"bps\":[");
  for (uint8_t i = 0; i < count; i++) {
    shell_fprintf(sh, SHELL_NORMAL, "%u%s", zplc_vm_get_breakpoint(vm, i), (i < count - 1) ? "," : "");
  }
  shell_fprintf(sh, SHELL_NORMAL, "],\"ok\":true}\n");

  return 0;
}

static int cmd_dbg_info(const struct shell *sh, size_t argc, char **argv) {
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);
#ifdef CONFIG_ZPLC_SCHEDULER
  zplc_sched_stats_t stats;
  zplc_sched_get_stats(&stats);
  if (json) {
    JSON_OBJ_START(sh);
    JSON_STR(sh, "state", state_name((zplc_state_t)zplc_sched_get_state()), true);
    JSON_UINT(sh, "uptime_ms", stats.uptime_ms, true);
    JSON_UINT(sh, "cycles", stats.total_cycles, true);
    JSON_INT(sh, "active_tasks", stats.active_tasks, false);
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }
  shell_print(sh, "VM Info (Scheduler Mode):");
  shell_print(sh, "  State:  %s", state_name((zplc_state_t)zplc_sched_get_state()));
  shell_print(sh, "  Uptime: %u ms", stats.uptime_ms);
  shell_print(sh, "  Cycles: %u", stats.total_cycles);
  shell_print(sh, "  Tasks:  %u", stats.active_tasks);
#else
  zplc_vm_t *vm = zplc_core_get_default_vm();
  if (json) {
    JSON_OBJ_START(sh);
    JSON_STR(sh, "state", state_name(runtime_state), true);
    JSON_UINT(sh, "cycles", cycle_count, true);
    if (vm) {
      JSON_UINT(sh, "pc", vm->pc, true);
      JSON_UINT(sh, "sp", vm->sp, true);
      JSON_BOOL(sh, "halted", vm->halted != 0, true);
      JSON_INT(sh, "error", vm->error, false);
    }
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }
  shell_print(sh, "VM Info (Legacy Mode):");
  shell_print(sh, "  State:  %s", state_name(runtime_state));
  shell_print(sh, "  Cycles: %u", cycle_count);
  if (vm) {
    shell_print(sh, "  PC:     %04X", vm->pc);
    shell_print(sh, "  SP:     %d", vm->sp);
    shell_print(sh, "  Halted: %s", vm->halted ? "YES" : "NO");
    shell_print(sh, "  Error:  %d", vm->error);
  }
#endif
  return 0;
}

static int cmd_dbg_task(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: dbg task <id> [--json]");
    return -EINVAL;
  }
  int id = atoi(argv[1]);
  bool json = (argc > 2 && strcmp(argv[2], "--json") == 0);
#ifdef CONFIG_ZPLC_SCHEDULER
  zplc_task_t task;
  if (zplc_sched_get_task(id, &task) != 0) {
    shell_error(sh, "ERROR: Task %d not found", id);
    return -EINVAL;
  }
  if (json) {
    JSON_OBJ_START(sh);
    JSON_INT(sh, "id", task.config.id, true);
    JSON_STR(sh, "state", state_name((zplc_state_t)task.state), true);
    JSON_UINT(sh, "cycles", task.stats.cycle_count, true);
    JSON_UINT(sh, "overruns", task.stats.overrun_count, true);
    JSON_UINT(sh, "interval", task.config.interval_us, false);
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }
  shell_print(sh, "Task %d Info:", id);
  shell_print(sh, "  State:    %s", state_name((zplc_state_t)task.state));
  shell_print(sh, "  Interval: %u us", task.config.interval_us);
  shell_print(sh, "  Cycles:   %u", task.stats.cycle_count);
  shell_print(sh, "  Overruns: %u", task.stats.overrun_count);
#else
  ARG_UNUSED(id);
  ARG_UNUSED(json);
  shell_print(sh, "Tasks not supported in legacy mode");
#endif
  return 0;
}

static int cmd_dbg_watch(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: dbg watch <addr> [type]");
    return -EINVAL;
  }
  shell_print(sh, "Watch functionality not yet implemented in shell");
  return 0;
}

static int cmd_dbg_timer(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: dbg timer <addr>");
    return -EINVAL;
  }
  shell_print(sh, "Timer inspection not yet implemented");
  return 0;
}

/* ============================================================================
 * ADC Handlers
 * ============================================================================
 */

#ifdef CONFIG_ADC
static int32_t adc_raw_to_celsius(uint16_t raw) {
  float voltage = (float)raw * 3.3f / 4095.0f;
  float celsius = 27.0f - (voltage - 0.706f) / 0.001721f;
  return (int32_t)celsius;
}

static int cmd_adc_temp(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  uint16_t raw;
  if (zplc_hal_adc_read(4, &raw) != ZPLC_HAL_OK) {
    shell_error(sh, "ERROR: Failed to read temperature sensor");
    return -EIO;
  }
  int32_t temp = adc_raw_to_celsius(raw);
  shell_print(sh, "Temperature: %d C (raw: %u)", temp, raw);
  return 0;
}

static int cmd_adc_read(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: adc read <channel>");
    return -EINVAL;
  }
  int ch = atoi(argv[1]);
  uint16_t val;
  if (zplc_hal_adc_read(ch, &val) != ZPLC_HAL_OK) {
    shell_error(sh, "ERROR: Failed to read ADC channel %d", ch);
    return -EIO;
  }
  shell_print(sh, "ADC Channel %d: %u", ch, val);
  return 0;
}
#endif

/* ============================================================================
 * HIL Debug Handlers
 * ============================================================================
 */

#ifdef CONFIG_ZPLC_HIL_DEBUG
static int cmd_hil_mode(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: hil mode <off|summary|verbose>");
    return -EINVAL;
  }
  shell_print(sh, "HIL mode set to %s", argv[1]);
  return 0;
}

static int cmd_hil_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(sh);
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  return 0;
}

static int cmd_hil_watch(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(sh);
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  return 0;
}

static int cmd_hil_reset(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(sh);
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  return 0;
}
#endif

/* ============================================================================
 * Shell Command Registration
 * ============================================================================
 */

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_dbg_bp,
    SHELL_CMD_ARG(add, NULL, "Add breakpoint: dbg bp add <pc>", cmd_dbg_bp_add, 2, 0),
    SHELL_CMD_ARG(remove, NULL, "Remove breakpoint: dbg bp remove <pc>", cmd_dbg_bp_remove, 2, 0),
    SHELL_CMD(clear, NULL, "Clear all breakpoints", cmd_dbg_bp_clear),
    SHELL_CMD(list, NULL, "List active breakpoints", cmd_dbg_bp_list),
    SHELL_SUBCMD_SET_END);

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_dbg, 
    SHELL_CMD(pause, NULL, "Pause VM execution", cmd_dbg_pause),
    SHELL_CMD(resume, NULL, "Resume VM execution", cmd_dbg_resume),
    SHELL_CMD(step, NULL, "Execute one cycle", cmd_dbg_step),
    SHELL_CMD(bp, &sub_dbg_bp, "Breakpoint management", NULL),
    SHELL_CMD_ARG(peek, NULL, "Read memory", cmd_dbg_peek, 2, 1),
    SHELL_CMD_ARG(poke, NULL, "Write memory", cmd_dbg_poke, 3, 0),
    SHELL_CMD_ARG(info, NULL, "VM state", cmd_dbg_info, 1, 1),
    SHELL_CMD_ARG(ticks, NULL, "System tick", cmd_dbg_ticks, 1, 1),
    SHELL_CMD_ARG(mem, NULL, "Dump memory", cmd_dbg_mem, 2, 1),
    SHELL_CMD_ARG(task, NULL, "Task info", cmd_dbg_task, 2, 1),
    SHELL_CMD_ARG(watch, NULL, "Watch memory", cmd_dbg_watch, 2, 1),
    SHELL_CMD_ARG(timer, NULL, "Timer state", cmd_dbg_timer, 2, 0),
    SHELL_SUBCMD_SET_END);

#ifdef CONFIG_ZPLC_SCHEDULER
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_sched,
    SHELL_CMD_ARG(status, NULL, "Scheduler status", cmd_sched_status, 1, 1),
    SHELL_CMD(tasks, NULL, "List tasks", cmd_sched_tasks),
    SHELL_SUBCMD_SET_END);

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_sys,
    SHELL_CMD_ARG(info, NULL, "System information", cmd_sys_info, 1, 1),
    SHELL_CMD(reboot, NULL, "Reboot", cmd_sys_reboot),
    SHELL_SUBCMD_SET_END);
#endif

#ifdef CONFIG_ADC
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_adc,
    SHELL_CMD(temp, NULL, "Read temperature", cmd_adc_temp),
    SHELL_CMD_ARG(read, NULL, "Read ADC", cmd_adc_read, 2, 0),
    SHELL_SUBCMD_SET_END);
#endif

#ifdef CONFIG_ZPLC_HIL_DEBUG
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_hil,
    SHELL_CMD_ARG(mode, NULL, "Set debug mode", cmd_hil_mode, 2, 0),
    SHELL_CMD(status, NULL, "Show status", cmd_hil_status),
    SHELL_CMD_ARG(watch, NULL, "Manage watches", cmd_hil_watch, 2, 1),
    SHELL_CMD(reset, NULL, "Reset VM", cmd_hil_reset),
    SHELL_SUBCMD_SET_END);
#endif

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_zplc,
#ifndef CONFIG_ZPLC_SCHEDULER
    SHELL_CMD_ARG(load, NULL, "Prepare load", cmd_zplc_load, 2, 0),
    SHELL_CMD_ARG(data, NULL, "Receive data", cmd_zplc_data, 2, 0),
    SHELL_CMD(start, NULL, "Start execution", cmd_zplc_start),
    SHELL_CMD(stop, NULL, "Stop execution", cmd_zplc_stop),
    SHELL_CMD_ARG(status, NULL, "Runtime status", cmd_zplc_status, 1, 1),
    SHELL_CMD(reset, NULL, "Reset VM", cmd_zplc_reset),
#endif
    SHELL_CMD(version, NULL, "Version info", cmd_zplc_version),
    SHELL_CMD(dbg, &sub_dbg, "Debug commands", NULL),
#ifdef CONFIG_ZPLC_SCHEDULER
    SHELL_CMD(sched, &sub_sched, "Scheduler commands", NULL),
    SHELL_CMD(sys, &sub_sys, "System commands", NULL),
#endif
#ifdef CONFIG_ADC
    SHELL_CMD(adc, &sub_adc, "ADC commands", NULL),
#endif
#ifdef CONFIG_ZPLC_HIL_DEBUG
    SHELL_CMD(hil, &sub_hil, "HIL commands", NULL),
#endif
    SHELL_SUBCMD_SET_END);

SHELL_CMD_REGISTER(zplc, &sub_zplc, "ZPLC runtime commands", NULL);
