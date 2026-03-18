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
#include <zephyr/fs/fs.h>
#ifdef CONFIG_NETWORKING
#include <zephyr/net/net_if.h>
#include <zephyr/net/net_ip.h>
#include <zephyr/net/net_mgmt.h>
#ifdef CONFIG_WIFI
#include <zephyr/net/wifi_mgmt.h>
#endif
#endif
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>

#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_debug.h>
#include "zplc_config.h"
#include "zplc_time.h"

/* zplc_mqtt.c has no standalone header — declare the public symbol here */
extern void zplc_mqtt_request_backoff_reset(void);

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_scheduler.h>
#endif

#include <zephyr/version.h>

#ifdef CONFIG_SOC_SERIES_RP2XXX
#include <hardware/clocks.h>
#define CPU_FREQ_MHZ (clock_get_hz(clk_sys) / 1000000)
#else
/* Use Zephyr's portable runtime clock API for all other SoCs (ESP32-S3, STM32, etc.) */
#include <zephyr/sys_clock.h>
#define CPU_FREQ_MHZ (sys_clock_hw_cycles_per_sec() / 1000000U)
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

#define CERT_STAGING_MAX_BYTES 4096U

static struct {
  bool active;
  size_t expected;
  size_t received;
  char path[32];
  uint8_t data[CERT_STAGING_MAX_BYTES];
} cert_staging;

#ifdef CONFIG_ZPLC_HIL_DEBUG
#define HIL_MAX_WATCHES 8
#define HIL_WATCH_POLL_MS 100

typedef enum {
  HIL_WATCH_BOOL = 0,
  HIL_WATCH_I8,
  HIL_WATCH_I16,
  HIL_WATCH_I32,
  HIL_WATCH_U8,
  HIL_WATCH_U16,
  HIL_WATCH_U32,
  HIL_WATCH_F32,
} hil_watch_type_t;

typedef struct {
  bool active;
  uint16_t addr;
  hil_watch_type_t type;
  char type_name[6];
  uint32_t last_raw;
  bool has_last;
} hil_watch_entry_t;

typedef struct {
  uint32_t raw;
  bool bool_val;
  int32_t i32_val;
  uint32_t u32_val;
  float f32_val;
} hil_watch_value_t;

static hil_watch_entry_t s_hil_watches[HIL_MAX_WATCHES];
static const struct shell *s_hil_shell;

static void hil_watch_work_handler(struct k_work *work);
static K_WORK_DELAYABLE_DEFINE(s_hil_watch_work, hil_watch_work_handler);
#endif

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

#ifdef CONFIG_ZPLC_HIL_DEBUG
static const char *hil_mode_name(hil_mode_t mode) {
  switch (mode) {
  case HIL_MODE_SUMMARY:
    return "summary";
  case HIL_MODE_VERBOSE:
    return "verbose";
  case HIL_MODE_OFF:
  default:
    return "off";
  }
}

#ifdef CONFIG_ZPLC_SCHEDULER
static const char *sched_state_name(zplc_sched_state_t state) {
  switch (state) {
  case ZPLC_SCHED_STATE_IDLE:
    return "idle";
  case ZPLC_SCHED_STATE_RUNNING:
    return "running";
  case ZPLC_SCHED_STATE_PAUSED:
    return "paused";
  case ZPLC_SCHED_STATE_ERROR:
    return "error";
  case ZPLC_SCHED_STATE_UNINIT:
  default:
    return "uninit";
  }
}
#endif

static int hil_parse_watch_type(const char *type, hil_watch_type_t *out_type,
                                size_t *out_size) {
  if (strcmp(type, "bool") == 0) {
    *out_type = HIL_WATCH_BOOL;
    *out_size = 1;
  } else if (strcmp(type, "i8") == 0) {
    *out_type = HIL_WATCH_I8;
    *out_size = 1;
  } else if (strcmp(type, "i16") == 0) {
    *out_type = HIL_WATCH_I16;
    *out_size = 2;
  } else if (strcmp(type, "i32") == 0) {
    *out_type = HIL_WATCH_I32;
    *out_size = 4;
  } else if (strcmp(type, "u8") == 0) {
    *out_type = HIL_WATCH_U8;
    *out_size = 1;
  } else if (strcmp(type, "u16") == 0) {
    *out_type = HIL_WATCH_U16;
    *out_size = 2;
  } else if (strcmp(type, "u32") == 0) {
    *out_type = HIL_WATCH_U32;
    *out_size = 4;
  } else if (strcmp(type, "f32") == 0) {
    *out_type = HIL_WATCH_F32;
    *out_size = 4;
  } else {
    return -EINVAL;
  }

  return 0;
}

static int hil_resolve_mem_ptr(uint16_t addr, size_t width, uint8_t **ptr) {
  uint16_t base;
  uint16_t size;
  uint8_t *region;

  if (addr >= ZPLC_MEM_IPI_BASE &&
      addr + width <= ZPLC_MEM_IPI_BASE + ZPLC_MEM_IPI_SIZE) {
    base = ZPLC_MEM_IPI_BASE;
    size = ZPLC_MEM_IPI_SIZE;
  } else if (addr >= ZPLC_MEM_OPI_BASE &&
             addr + width <= ZPLC_MEM_OPI_BASE + ZPLC_MEM_OPI_SIZE) {
    base = ZPLC_MEM_OPI_BASE;
    size = ZPLC_MEM_OPI_SIZE;
  } else if (addr >= ZPLC_MEM_WORK_BASE &&
             addr + width <= ZPLC_MEM_WORK_BASE + ZPLC_MEM_WORK_SIZE) {
    base = ZPLC_MEM_WORK_BASE;
    size = ZPLC_MEM_WORK_SIZE;
  } else if (addr >= ZPLC_MEM_RETAIN_BASE &&
             addr + width <= ZPLC_MEM_RETAIN_BASE + ZPLC_MEM_RETAIN_SIZE) {
    base = ZPLC_MEM_RETAIN_BASE;
    size = ZPLC_MEM_RETAIN_SIZE;
  } else {
    return -ERANGE;
  }

  region = zplc_mem_get_region(base);
  if (region == NULL || (addr - base) + width > size) {
    return -ERANGE;
  }

  *ptr = region + (addr - base);
  return 0;
}

static int hil_read_watch_value(uint16_t addr, hil_watch_type_t type,
                                hil_watch_value_t *value) {
  uint8_t *ptr = NULL;
  size_t width = 0;
  int rc;

  switch (type) {
  case HIL_WATCH_BOOL:
  case HIL_WATCH_I8:
  case HIL_WATCH_U8:
    width = 1;
    break;
  case HIL_WATCH_I16:
  case HIL_WATCH_U16:
    width = 2;
    break;
  case HIL_WATCH_I32:
  case HIL_WATCH_U32:
  case HIL_WATCH_F32:
    width = 4;
    break;
  default:
    return -EINVAL;
  }

  rc = hil_resolve_mem_ptr(addr, width, &ptr);
  if (rc != 0) {
    return rc;
  }

  memset(value, 0, sizeof(*value));

  switch (type) {
  case HIL_WATCH_BOOL:
    value->raw = ptr[0] ? 1U : 0U;
    value->bool_val = ptr[0] != 0U;
    break;
  case HIL_WATCH_I8:
    value->raw = ptr[0];
    value->i32_val = (int8_t)ptr[0];
    break;
  case HIL_WATCH_U8:
    value->raw = ptr[0];
    value->u32_val = ptr[0];
    break;
  case HIL_WATCH_I16:
    memcpy(&value->raw, ptr, sizeof(uint16_t));
    value->raw &= 0xFFFFU;
    value->i32_val = (int16_t)value->raw;
    break;
  case HIL_WATCH_U16:
    memcpy(&value->raw, ptr, sizeof(uint16_t));
    value->raw &= 0xFFFFU;
    value->u32_val = (uint16_t)value->raw;
    break;
  case HIL_WATCH_I32:
    memcpy(&value->raw, ptr, sizeof(uint32_t));
    value->i32_val = (int32_t)value->raw;
    break;
  case HIL_WATCH_U32:
    memcpy(&value->raw, ptr, sizeof(uint32_t));
    value->u32_val = value->raw;
    break;
  case HIL_WATCH_F32: {
    union {
      uint32_t u32;
      float f32;
    } conv;
    memcpy(&conv.u32, ptr, sizeof(uint32_t));
    value->raw = conv.u32;
    value->f32_val = conv.f32;
    break;
  }
  default:
    return -EINVAL;
  }

  return 0;
}

static void hil_emit_watch_json(const struct shell *sh, uint16_t addr,
                                const char *type_name,
                                const hil_watch_value_t *value,
                                hil_watch_type_t type) {
  switch (type) {
  case HIL_WATCH_BOOL:
    shell_fprintf(sh, SHELL_NORMAL,
                  "{\"t\":\"watch\",\"addr\":%u,\"type\":\"%s\",\"val\":%s}\n",
                  addr, type_name, value->bool_val ? "true" : "false");
    break;
  case HIL_WATCH_I8:
  case HIL_WATCH_I16:
  case HIL_WATCH_I32:
    shell_fprintf(sh, SHELL_NORMAL,
                  "{\"t\":\"watch\",\"addr\":%u,\"type\":\"%s\",\"val\":%d}\n",
                  addr, type_name, value->i32_val);
    break;
  case HIL_WATCH_U8:
  case HIL_WATCH_U16:
  case HIL_WATCH_U32:
    shell_fprintf(sh, SHELL_NORMAL,
                  "{\"t\":\"watch\",\"addr\":%u,\"type\":\"%s\",\"val\":%u}\n",
                  addr, type_name, (unsigned int)value->u32_val);
    break;
  case HIL_WATCH_F32:
    shell_fprintf(sh, SHELL_NORMAL,
                  "{\"t\":\"watch\",\"addr\":%u,\"type\":\"%s\",\"val\":%.6g}\n",
                  addr, type_name, (double)value->f32_val);
    break;
  }
}

static int hil_active_watch_count(void) {
  int count = 0;

  for (int i = 0; i < HIL_MAX_WATCHES; i++) {
    if (s_hil_watches[i].active) {
      count++;
    }
  }

  return count;
}

static void hil_watch_poll_once(bool force_emit) {
  if (s_hil_shell == NULL || hil_get_mode() == HIL_MODE_OFF) {
    return;
  }

#ifdef CONFIG_ZPLC_SCHEDULER
  if (zplc_sched_lock(5) != 0) {
    return;
  }
#endif

  for (int i = 0; i < HIL_MAX_WATCHES; i++) {
    hil_watch_value_t value;
    hil_watch_entry_t *watch = &s_hil_watches[i];
    int rc;

    if (!watch->active) {
      continue;
    }

    rc = hil_read_watch_value(watch->addr, watch->type, &value);
    if (rc != 0) {
      continue;
    }

    if (force_emit || !watch->has_last || watch->last_raw != value.raw) {
      hil_emit_watch_json(s_hil_shell, watch->addr, watch->type_name, &value,
                          watch->type);
      watch->last_raw = value.raw;
      watch->has_last = true;
    }
  }

#ifdef CONFIG_ZPLC_SCHEDULER
  (void)zplc_sched_unlock();
#endif
}

static void hil_watch_work_handler(struct k_work *work) {
  ARG_UNUSED(work);

  if (hil_active_watch_count() == 0 || hil_get_mode() == HIL_MODE_OFF) {
    return;
  }

  hil_watch_poll_once(false);
  (void)k_work_reschedule(&s_hil_watch_work, K_MSEC(HIL_WATCH_POLL_MS));
}

static void hil_watch_arm_poll(void) {
  if (hil_active_watch_count() == 0 || hil_get_mode() == HIL_MODE_OFF) {
    (void)k_work_cancel_delayable(&s_hil_watch_work);
    return;
  }

  (void)k_work_reschedule(&s_hil_watch_work, K_MSEC(HIL_WATCH_POLL_MS));
}
#endif

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

static int cmd_zplc_load(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_status(const struct shell *sh, size_t argc, char **argv);
static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv);

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
static int cmd_sched_load(const struct shell *sh, size_t argc, char **argv);
static int cmd_sched_data(const struct shell *sh, size_t argc, char **argv);
static int sched_reset_runtime(bool restart);
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

static int cmd_sched_load(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc sched load <size>");
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
  memset(program_buffer, 0, program_buffer_size);
  program_expected_size = size;
  program_received_size = 0;
  shell_print(sh, "OK: Ready to receive %lu bytes", size);
  return 0;
}

static int cmd_sched_data(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc sched data <hex>");
    return -EINVAL;
  }
  if (program_expected_size == 0) {
    shell_error(sh, "ERROR: Not in loading state (use 'zplc sched load' first)");
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
    int ret = sched_reset_runtime(true);
    if (ret < 0) {
      shell_error(sh, "ERROR: Scheduler load failed (%d)", ret);
      program_expected_size = 0;
      return ret;
    }
    shell_print(sh, "OK: Program loaded and started (%zu bytes)", program_received_size);
    program_expected_size = 0;
  } else {
    shell_print(sh, "OK: Received %d bytes (%zu/%zu)", decoded,
                program_received_size, program_expected_size);
  }
  return 0;
}

static int sched_clear_registered_tasks(void) {
  int first_error = 0;

  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    int rc = zplc_sched_unregister_task(i);
    if (rc < 0 && rc != -2 && first_error == 0) {
      first_error = rc;
    }
  }

  return first_error;
}

static int sched_reset_runtime(bool restart) {
  int rc;

  rc = zplc_sched_stop();
  if (rc < 0) {
    return rc;
  }

  rc = sched_clear_registered_tasks();
  if (rc < 0) {
    return rc;
  }

  if (program_received_size == 0U) {
    return 0;
  }

  rc = zplc_sched_load(program_buffer, program_received_size);
  if (rc < 0) {
    return rc;
  }

  if (restart) {
    rc = zplc_sched_start();
    if (rc < 0) {
      return rc;
    }
  }

  return 0;
}

static int cmd_zplc_load(const struct shell *sh, size_t argc, char **argv) {
  return cmd_sched_load(sh, argc, argv);
}

static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv) {
  return cmd_sched_data(sh, argc, argv);
}

static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  int rc = zplc_sched_start();
  if (rc < 0) {
    shell_error(sh, "ERROR: Scheduler start failed (%d)", rc);
    return rc;
  }

  shell_print(sh, "OK: Scheduler started");
  return 0;
}

static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  int rc = zplc_sched_stop();
  if (rc < 0) {
    shell_error(sh, "ERROR: Scheduler stop failed (%d)", rc);
    return rc;
  }

  shell_print(sh, "OK: Scheduler stopped");
  return 0;
}

static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  int rc = sched_reset_runtime(false);
  if (rc < 0) {
    shell_error(sh, "ERROR: Scheduler reset failed (%d)", rc);
    return rc;
  }

  shell_print(sh, "OK: Scheduler reset");
  return 0;
}

static int cmd_zplc_status(const struct shell *sh, size_t argc, char **argv) {
  return cmd_sched_status(sh, argc, argv);
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

/**
 * @brief Handler for 'zplc dbg mpeek <addr:len,...>'
 *
 * Reads up to MPEEK_MAX_ENTRIES non-contiguous addresses in a single serial
 * round-trip and emits a compact JSON response:
 *   {"t":"mpeek","results":[{"addr":N,"bytes":"HEXHEX"},...]}\n
 *
 * Input format: comma-separated addr:len pairs, e.g.
 *   zplc dbg mpeek 0x2000:2,0x2002:2,0x2004:1
 *
 * Constraints:
 *   - Max MPEEK_MAX_ENTRIES entries per call
 *   - Max MPEEK_MAX_BYTES total bytes across all entries
 *   - Each len 1–256
 *   - Addresses must be in a valid ZPLC memory region
 */
#define MPEEK_MAX_ENTRIES 16
#define MPEEK_MAX_BYTES   256

static int cmd_dbg_mpeek(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "Usage: zplc dbg mpeek <addr:len>[,<addr:len>...]");
    return -EINVAL;
  }

  /* Working storage for parsed entries */
  struct {
    unsigned long addr;
    unsigned long len;
  } entries[MPEEK_MAX_ENTRIES];
  int entry_count = 0;
  unsigned long total_bytes = 0;

  /* Parse comma-separated addr:len pairs from argv[1] */
  char buf[256];
  strncpy(buf, argv[1], sizeof(buf) - 1);
  buf[sizeof(buf) - 1] = '\0';

  char *saveptr = NULL;
  char *token = strtok_r(buf, ",", &saveptr);
  while (token != NULL) {
    if (entry_count >= MPEEK_MAX_ENTRIES) {
      shell_error(sh, "ERROR: Too many entries (max %d)", MPEEK_MAX_ENTRIES);
      return -EINVAL;
    }

    /* Split on ':' to get addr and len */
    char *colon = strchr(token, ':');
    if (colon == NULL) {
      shell_error(sh, "ERROR: Missing ':' in entry '%s'", token);
      return -EINVAL;
    }
    *colon = '\0';

    char *endptr;
    unsigned long addr = strtoul(token, &endptr, 0);
    if (*endptr != '\0') {
      shell_error(sh, "ERROR: Invalid address '%s'", token);
      return -EINVAL;
    }

    unsigned long len = strtoul(colon + 1, &endptr, 0);
    if (*endptr != '\0' || len == 0 || len > 256) {
      shell_error(sh, "ERROR: Invalid length in entry (1-256)");
      return -EINVAL;
    }

    total_bytes += len;
    if (total_bytes > MPEEK_MAX_BYTES) {
      shell_error(sh, "ERROR: Total bytes exceed limit (%d)", MPEEK_MAX_BYTES);
      return -EINVAL;
    }

    entries[entry_count].addr = addr;
    entries[entry_count].len  = len;
    entry_count++;

    token = strtok_r(NULL, ",", &saveptr);
  }

  if (entry_count == 0) {
    shell_error(sh, "ERROR: No entries provided");
    return -EINVAL;
  }

#ifdef CONFIG_ZPLC_SCHEDULER
  if (zplc_sched_lock(5) != 0) {
    shell_error(sh, "ERROR: Could not acquire scheduler lock");
    return -EBUSY;
  }
#endif

  /* Emit JSON response */
  shell_print(sh, "{\"t\":\"mpeek\",\"results\":[");

  for (int i = 0; i < entry_count; i++) {
    unsigned long addr = entries[i].addr;
    unsigned long len  = entries[i].len;

    /* Resolve memory region */
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

    /* Validate bounds */
    if (base == NULL || (uint32_t)offset + (uint32_t)len > (uint32_t)region_size) {
#ifdef CONFIG_ZPLC_SCHEDULER
      (void)zplc_sched_unlock();
#endif
      shell_error(sh, "ERROR: Invalid address or out-of-bounds at 0x%lX", addr);
      return -EINVAL;
    }

    /* Build hex string for the bytes */
    char hex[513]; /* max 256 bytes × 2 hex chars + NUL */
    unsigned int hex_pos = 0;
    for (unsigned long b = 0; b < len; b++) {
      hex_pos += (unsigned int)snprintf(hex + hex_pos, sizeof(hex) - hex_pos,
                                        "%02X", base[offset + b]);
    }
    hex[hex_pos] = '\0';

    bool last = (i == entry_count - 1);
    shell_print(sh, "{\"addr\":%lu,\"bytes\":\"%s\"}%s",
                addr, hex, last ? "" : ",");
  }

  shell_print(sh, "]}");

#ifdef CONFIG_ZPLC_SCHEDULER
  (void)zplc_sched_unlock();
#endif

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
  shell_warn(sh, "WARN: Pause not supported in scheduler mode (use task-level control)");
  return 0;
}

static int cmd_dbg_resume(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_warn(sh, "WARN: Resume not supported in scheduler mode");
  return 0;
}

static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_warn(sh, "WARN: Step not supported in scheduler mode");
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
    shell_error(sh, "ERROR: no VM active");
  } else if (last_err == 0) {
    shell_print(sh, "OK: Breakpoint added at 0x%04X", pc);
  } else {
    const char *err_msg = (last_err == -2) ? "table full" : "already exists";
    shell_error(sh, "ERROR: %s", err_msg);
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
    shell_error(sh, "ERROR: no VM active");
  } else if (last_err == 0) {
    shell_print(sh, "OK: Breakpoint removed at 0x%04X", pc);
  } else {
    shell_error(sh, "ERROR: not found");
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
    shell_error(sh, "ERROR: no VM active");
  } else {
    shell_print(sh, "OK: Breakpoints cleared");
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
  hil_mode_t mode;

  if (argc < 2) {
    hil_set_shell(sh);
    s_hil_shell = sh;
    hil_send_ack("mode", "", false, "usage: hil mode <off|summary|verbose>");
    return -EINVAL;
  }

  if (strcmp(argv[1], "off") == 0) {
    mode = HIL_MODE_OFF;
  } else if (strcmp(argv[1], "summary") == 0) {
    mode = HIL_MODE_SUMMARY;
  } else if (strcmp(argv[1], "verbose") == 0) {
    mode = HIL_MODE_VERBOSE;
  } else {
    hil_set_shell(sh);
    s_hil_shell = sh;
    hil_send_ack("mode", argv[1], false, "invalid mode");
    return -EINVAL;
  }

  s_hil_shell = sh;
  hil_set_shell(sh);
  hil_set_mode(mode);
  hil_send_ack("mode", hil_mode_name(mode), true, NULL);
  hil_watch_arm_poll();
  return 0;
}

static int cmd_hil_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  s_hil_shell = sh;
  hil_set_shell(sh);

#ifdef CONFIG_ZPLC_SCHEDULER
  zplc_sched_stats_t stats;
  zplc_vm_t *vm = NULL;
  uint16_t pc = 0;
  uint16_t sp = 0;
  int rc = zplc_sched_get_stats(&stats);
  if (rc != 0) {
    hil_send_ack("status", "", false, "stats unavailable");
    return rc;
  }

  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    vm = zplc_sched_get_vm_ptr(i);
    if (vm != NULL) {
      pc = zplc_vm_get_pc(vm);
      sp = zplc_vm_get_sp(vm);
      break;
    }
  }

  shell_fprintf(sh, SHELL_NORMAL,
                "{\"t\":\"status\",\"mode\":\"%s\",\"state\":\"%s\",\"pc\":%u,\"sp\":%u,\"cycle\":%u,\"uptime\":%u,\"tasks\":%u}\n",
                hil_mode_name(hil_get_mode()), sched_state_name(zplc_sched_get_state()),
                pc, sp, stats.total_cycles, stats.uptime_ms, stats.active_tasks);
#else
  zplc_vm_t *vm = zplc_core_get_default_vm();
  uint16_t pc = vm ? zplc_vm_get_pc(vm) : 0;
  uint16_t sp = vm ? zplc_vm_get_sp(vm) : 0;
  shell_fprintf(sh, SHELL_NORMAL,
                "{\"t\":\"status\",\"mode\":\"%s\",\"state\":\"%s\",\"pc\":%u,\"sp\":%u,\"cycle\":%u,\"uptime\":%u}\n",
                hil_mode_name(hil_get_mode()), state_name(runtime_state), pc, sp,
                cycle_count, k_uptime_get_32());
#endif

  return 0;
}

static int cmd_hil_watch(const struct shell *sh, size_t argc, char **argv) {
  s_hil_shell = sh;
  hil_set_shell(sh);

  if (argc < 2) {
    hil_send_ack("watch", "", false, "usage: hil watch <add|del|clear|list|poll>");
    return -EINVAL;
  }

  if (strcmp(argv[1], "clear") == 0) {
    memset(s_hil_watches, 0, sizeof(s_hil_watches));
    hil_send_ack("watch", "clear", true, NULL);
    hil_watch_arm_poll();
    return 0;
  }

  if (strcmp(argv[1], "list") == 0) {
    bool first = true;
    shell_fprintf(sh, SHELL_NORMAL,
                  "{\"t\":\"ack\",\"cmd\":\"watch\",\"val\":\"list\",\"ok\":true,\"items\":[");
    for (int i = 0; i < HIL_MAX_WATCHES; i++) {
      if (!s_hil_watches[i].active) {
        continue;
      }
      shell_fprintf(sh, SHELL_NORMAL, "%s{\"addr\":%u,\"type\":\"%s\"}",
                    first ? "" : ",", s_hil_watches[i].addr,
                    s_hil_watches[i].type_name);
      first = false;
    }
    shell_fprintf(sh, SHELL_NORMAL, "]}\n");
    return 0;
  }

  if (strcmp(argv[1], "poll") == 0) {
    hil_send_ack("watch", "poll", true, NULL);
    hil_watch_poll_once(true);
    return 0;
  }

  if (strcmp(argv[1], "add") == 0) {
    unsigned long parsed_addr;
    char *endptr = NULL;
    hil_watch_type_t type;
    size_t width = 0;
    int slot = -1;
    uint8_t *mem_ptr = NULL;

    if (argc < 4) {
      hil_send_ack("watch", "add", false,
                   "usage: hil watch add <addr> <type>");
      return -EINVAL;
    }

    parsed_addr = strtoul(argv[2], &endptr, 0);
    if (endptr == NULL || *endptr != '\0' || parsed_addr > 0xFFFFU) {
      hil_send_ack("watch", argv[2], false, "invalid address");
      return -EINVAL;
    }

    if (hil_parse_watch_type(argv[3], &type, &width) != 0) {
      hil_send_ack("watch", argv[3], false, "invalid type");
      return -EINVAL;
    }

    if (hil_resolve_mem_ptr((uint16_t)parsed_addr, width, &mem_ptr) != 0) {
      hil_send_ack("watch", argv[2], false, "address out of range");
      return -ERANGE;
    }

    for (int i = 0; i < HIL_MAX_WATCHES; i++) {
      if (s_hil_watches[i].active && s_hil_watches[i].addr == (uint16_t)parsed_addr) {
        slot = i;
        break;
      }
      if (!s_hil_watches[i].active && slot < 0) {
        slot = i;
      }
    }

    if (slot < 0) {
      hil_send_ack("watch", argv[2], false, "watch table full");
      return -ENOMEM;
    }

    s_hil_watches[slot].active = true;
    s_hil_watches[slot].addr = (uint16_t)parsed_addr;
    s_hil_watches[slot].type = type;
    strncpy(s_hil_watches[slot].type_name, argv[3],
            sizeof(s_hil_watches[slot].type_name) - 1U);
    s_hil_watches[slot].type_name[sizeof(s_hil_watches[slot].type_name) - 1U] = '\0';
    s_hil_watches[slot].has_last = false;

    hil_send_ack("watch", argv[2], true, NULL);
    hil_watch_poll_once(true);
    hil_watch_arm_poll();
    return 0;
  }

  if (strcmp(argv[1], "del") == 0) {
    unsigned long parsed_addr;
    char *endptr = NULL;

    if (argc < 3) {
      hil_send_ack("watch", "del", false,
                   "usage: hil watch del <addr>");
      return -EINVAL;
    }

    parsed_addr = strtoul(argv[2], &endptr, 0);
    if (endptr == NULL || *endptr != '\0' || parsed_addr > 0xFFFFU) {
      hil_send_ack("watch", argv[2], false, "invalid address");
      return -EINVAL;
    }

    for (int i = 0; i < HIL_MAX_WATCHES; i++) {
      if (s_hil_watches[i].active && s_hil_watches[i].addr == (uint16_t)parsed_addr) {
        memset(&s_hil_watches[i], 0, sizeof(s_hil_watches[i]));
        hil_send_ack("watch", argv[2], true, NULL);
        hil_watch_arm_poll();
        return 0;
      }
    }

    hil_send_ack("watch", argv[2], false, "watch not found");
    return -ENOENT;
  }

  hil_send_ack("watch", argv[1], false, "unknown subcommand");
  return -EINVAL;
}

static int cmd_hil_reset(const struct shell *sh, size_t argc, char **argv) {
  int rc;

  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  s_hil_shell = sh;
  hil_set_shell(sh);

#ifdef CONFIG_ZPLC_SCHEDULER
  rc = sched_reset_runtime(true);
#else
  rc = cmd_zplc_reset(sh, 0, NULL);
  if (rc == 0) {
    rc = cmd_zplc_start(sh, 0, NULL);
  }
#endif

  if (rc != 0) {
    hil_send_ack("reset", "runtime", false, "reset failed");
    return rc;
  }

  hil_send_ack("reset", "runtime", true, NULL);
  hil_watch_poll_once(true);
  return 0;
}
#endif

/* ============================================================================
 * NTP Handlers
 * ============================================================================
 */

static int cmd_ntp_status(const struct shell *sh, size_t argc, char **argv)
{
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);
  bool synced = zplc_time_is_synced();
  int64_t unix_ms = zplc_time_get_unix_ms();
  char server[64];
  zplc_config_get_ntp_server(server, sizeof(server));

  if (json) {
    JSON_OBJ_START(sh);
    JSON_BOOL(sh, "enabled", zplc_config_get_ntp_enabled(), true);
    JSON_BOOL(sh, "synced", synced, true);
    JSON_STR(sh, "server", server, true);
    if (synced && unix_ms > 0) {
      shell_fprintf(sh, SHELL_NORMAL, "\"unix_ms\":%lld", (long long)unix_ms);
    } else {
      shell_fprintf(sh, SHELL_NORMAL, "\"unix_ms\":null");
    }
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  shell_print(sh, "NTP Status:");
  shell_print(sh, "  Enabled: %s", zplc_config_get_ntp_enabled() ? "Yes" : "No");
  shell_print(sh, "  Server:  %s", server);
  shell_print(sh, "  Synced:  %s", synced ? "Yes" : "No");
  if (synced && unix_ms > 0) {
    shell_print(sh, "  Time:    %lld ms (UTC)", (long long)unix_ms);
  } else {
    shell_print(sh, "  Time:    (not synced)");
  }
  return 0;
}

static int cmd_ntp_enable(const struct shell *sh, size_t argc, char **argv)
{
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  zplc_config_set_ntp_enabled(true);
  shell_print(sh, "NTP enabled. Use 'zplc config save' to persist.");
  return 0;
}

static int cmd_ntp_disable(const struct shell *sh, size_t argc, char **argv)
{
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  zplc_config_set_ntp_enabled(false);
  shell_print(sh, "NTP disabled. Use 'zplc config save' to persist.");
  return 0;
}

static int cmd_ntp_server(const struct shell *sh, size_t argc, char **argv)
{
  if (argc < 2) {
    shell_error(sh, "Usage: zplc ntp server <hostname>");
    return -EINVAL;
  }
  zplc_config_set_ntp_server(argv[1]);
  shell_print(sh, "NTP server set to '%s'. Use 'zplc config save' to persist.", argv[1]);
  return 0;
}

static int cmd_ntp_sync(const struct shell *sh, size_t argc, char **argv)
{
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_print(sh, "Triggering NTP re-sync...");
  int ret = zplc_time_resync();
  if (ret == 0) {
    int64_t unix_ms = zplc_time_get_unix_ms();
    shell_print(sh, "OK: NTP synced. Time: %lld ms (UTC)", (long long)unix_ms);
  } else {
    shell_error(sh, "ERROR: NTP sync failed (%d)", ret);
  }
  return ret;
}

/* ============================================================================
 * Configuration Handlers
 * ============================================================================
 */

static int cmd_config_get(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  char buf[96];

  shell_print(sh, "ZPLC Configuration:");
  
  zplc_config_get_hostname(buf, sizeof(buf));
  shell_print(sh, "  Hostname:     %s", buf);

  shell_print(sh, "  DHCP:         %s", zplc_config_get_dhcp() ? "Enabled" : "Disabled");

  shell_print(sh, "  NTP Enabled:  %s", zplc_config_get_ntp_enabled() ? "Yes" : "No");
  zplc_config_get_ntp_server(buf, sizeof(buf));
  shell_print(sh, "  NTP Server:   %s", buf);
  
  zplc_config_get_ip(buf, sizeof(buf));
  shell_print(sh, "  Static IP:    %s", buf);
  
  shell_print(sh, "  Modbus ID:    %u", zplc_config_get_modbus_id());
  shell_print(sh, "  Modbus TCP:   %s", zplc_config_get_modbus_tcp_enabled() ? "Enabled" : "Disabled");
  shell_print(sh, "  Modbus TCP Port: %u", zplc_config_get_modbus_tcp_port());
  shell_print(sh, "  Modbus RTU:   %s", zplc_config_get_modbus_rtu_enabled() ? "Enabled" : "Disabled");
  shell_print(sh, "  Modbus RTU Baud: %u", (unsigned)zplc_config_get_modbus_rtu_baud());
  shell_print(sh, "  Modbus RTU Parity: %u", (unsigned)zplc_config_get_modbus_rtu_parity());
  shell_print(sh, "  Modbus RTU Client: %s", zplc_config_get_modbus_rtu_client_enabled() ? "Enabled" : "Disabled");
  shell_print(sh, "  Modbus RTU Client Slave: %u", (unsigned)zplc_config_get_modbus_rtu_client_slave_id());
  shell_print(sh, "  Modbus RTU Client Poll: %u ms", (unsigned)zplc_config_get_modbus_rtu_client_poll_ms());
  shell_print(sh, "  Modbus TCP Client: %s", zplc_config_get_modbus_tcp_client_enabled() ? "Enabled" : "Disabled");
  zplc_config_get_modbus_tcp_client_host(buf, sizeof(buf));
  shell_print(sh, "  Modbus TCP Client Host: %s", buf);
  shell_print(sh, "  Modbus TCP Client Port: %u", zplc_config_get_modbus_tcp_client_port());
  shell_print(sh, "  Modbus TCP Client Unit: %u", (unsigned)zplc_config_get_modbus_tcp_client_unit_id());
  shell_print(sh, "  Modbus TCP Client Poll: %u ms", (unsigned)zplc_config_get_modbus_tcp_client_poll_ms());
  shell_print(sh, "  Modbus TCP Client Timeout: %u ms", (unsigned)zplc_config_get_modbus_tcp_client_timeout_ms());
  
  zplc_config_get_mqtt_broker(buf, sizeof(buf));
  shell_print(sh, "  MQTT Broker:  %s", buf);

  zplc_config_get_mqtt_client_id(buf, sizeof(buf));
  shell_print(sh, "  MQTT Client ID: %s", (buf[0] != '\0') ? buf : "(hostname)");

  zplc_config_get_mqtt_topic_namespace(buf, sizeof(buf));
  shell_print(sh, "  MQTT Namespace: %s", buf);
  shell_print(sh, "  MQTT Profile: %u", (unsigned)zplc_config_get_mqtt_profile());
  zplc_config_get_mqtt_group_id(buf, sizeof(buf));
  shell_print(sh, "  MQTT Group ID: %s", buf);
  shell_print(sh, "  MQTT Protocol: %u", (unsigned)zplc_config_get_mqtt_protocol());
  shell_print(sh, "  MQTT Transport: %u", (unsigned)zplc_config_get_mqtt_transport());
  
  shell_print(sh, "  MQTT Port:    %u", zplc_config_get_mqtt_port());
  shell_print(sh, "  MQTT Enabled: %s", zplc_config_get_mqtt_enabled() ? "Yes" : "No");
  shell_print(sh, "  MQTT Keepalive: %u s", zplc_config_get_mqtt_keepalive_sec());
  shell_print(sh, "  MQTT Publish Interval: %u ms", (unsigned)zplc_config_get_mqtt_publish_interval_ms());
  shell_print(sh, "  MQTT Publish QoS: %u", (unsigned)zplc_config_get_mqtt_publish_qos());
  shell_print(sh, "  MQTT Subscribe QoS: %u", (unsigned)zplc_config_get_mqtt_subscribe_qos());
  shell_print(sh, "  MQTT Retain: %s", zplc_config_get_mqtt_publish_retain() ? "Yes" : "No");
  shell_print(sh, "  MQTT Clean Session: %s", zplc_config_get_mqtt_clean_session() ? "Yes" : "No");
  shell_print(sh, "  MQTT Session Expiry: %u s", (unsigned)zplc_config_get_mqtt_session_expiry_sec());

  zplc_config_get_mqtt_username(buf, sizeof(buf));
  shell_print(sh, "  MQTT Username: %s", (buf[0] != '\0') ? buf : "(none)");

  shell_print(sh, "  MQTT Security: %u", (unsigned)zplc_config_get_mqtt_security());

  zplc_config_get_mqtt_ca_cert_path(buf, sizeof(buf));
  shell_print(sh, "  MQTT CA Path: %s", buf);

  zplc_config_get_mqtt_client_cert_path(buf, sizeof(buf));
  shell_print(sh, "  MQTT Cert Path: %s", buf);

  zplc_config_get_mqtt_client_key_path(buf, sizeof(buf));
  shell_print(sh, "  MQTT Key Path: %s", buf);

  zplc_config_get_mqtt_websocket_path(buf, sizeof(buf));
  shell_print(sh, "  MQTT WebSocket Path: %s", buf);

  zplc_config_get_mqtt_alpn(buf, sizeof(buf));
  shell_print(sh, "  MQTT ALPN: %s", (buf[0] != '\0') ? buf : "(none)");

  shell_print(sh, "  MQTT LWT Enabled: %s", zplc_config_get_mqtt_lwt_enabled() ? "Yes" : "No");
  zplc_config_get_mqtt_lwt_topic(buf, sizeof(buf));
  shell_print(sh, "  MQTT LWT Topic: %s", (buf[0] != '\0') ? buf : "(auto)");
  zplc_config_get_mqtt_lwt_payload(buf, sizeof(buf));
  shell_print(sh, "  MQTT LWT Payload: %s", (buf[0] != '\0') ? buf : "(none)");
  shell_print(sh, "  MQTT LWT QoS: %u", (unsigned)zplc_config_get_mqtt_lwt_qos());
  shell_print(sh, "  MQTT LWT Retain: %s", zplc_config_get_mqtt_lwt_retain() ? "Yes" : "No");
  shell_print(sh, "  Azure Twin: %s", zplc_config_get_azure_twin_enabled() ? "Enabled" : "Disabled");
  shell_print(sh, "  Azure Direct Methods: %s", zplc_config_get_azure_direct_methods_enabled() ? "Enabled" : "Disabled");
  shell_print(sh, "  Azure C2D: %s", zplc_config_get_azure_c2d_enabled() ? "Enabled" : "Disabled");
  shell_print(sh, "  Azure DPS: %s", zplc_config_get_azure_dps_enabled() ? "Enabled" : "Disabled");
  zplc_config_get_azure_dps_id_scope(buf, sizeof(buf));
  shell_print(sh, "  Azure DPS Scope: %s", buf);
  zplc_config_get_azure_dps_registration_id(buf, sizeof(buf));
  shell_print(sh, "  Azure DPS Registration: %s", buf);
  zplc_config_get_azure_dps_endpoint(buf, sizeof(buf));
  shell_print(sh, "  Azure DPS Endpoint: %s", buf);
  zplc_config_get_azure_event_grid_topic(buf, sizeof(buf));
  shell_print(sh, "  Azure Event Grid Topic: %s", buf);
  zplc_config_get_azure_event_grid_source(buf, sizeof(buf));
  shell_print(sh, "  Azure Event Grid Source: %s", buf);
  zplc_config_get_azure_event_grid_event_type(buf, sizeof(buf));
  shell_print(sh, "  Azure Event Grid Type: %s", buf);
  shell_print(sh, "  AWS Shadow: %s", zplc_config_get_aws_shadow_enabled() ? "Enabled" : "Disabled");
  shell_print(sh, "  AWS Jobs: %s", zplc_config_get_aws_jobs_enabled() ? "Enabled" : "Disabled");
  shell_print(sh, "  AWS Fleet: %s", zplc_config_get_aws_fleet_enabled() ? "Enabled" : "Disabled");
  zplc_config_get_aws_fleet_template_name(buf, sizeof(buf));
  shell_print(sh, "  AWS Fleet Template: %s", buf);
  zplc_config_get_aws_claim_cert_path(buf, sizeof(buf));
  shell_print(sh, "  AWS Claim Cert: %s", buf);
  zplc_config_get_aws_claim_key_path(buf, sizeof(buf));
  shell_print(sh, "  AWS Claim Key: %s", buf);
  
  return 0;
}

static int cmd_config_set(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 3) {
    shell_error(sh, "ERROR: Usage: zplc config set <key> <value>");
    shell_print(sh, "Keys: hostname, dhcp, ip, wifi_ssid, wifi_pass, wifi_security, ntp_enabled, ntp_server, modbus_id, modbus_tcp_enabled, modbus_tcp_port, modbus_rtu_enabled, modbus_rtu_baud, modbus_rtu_parity, modbus_rtu_client_enabled, modbus_rtu_client_slave_id, modbus_rtu_client_poll_ms, modbus_tcp_client_enabled, modbus_tcp_client_host, modbus_tcp_client_port, modbus_tcp_client_unit_id, modbus_tcp_client_poll_ms, modbus_tcp_client_timeout_ms, mqtt_enabled, mqtt_broker, mqtt_client_id, mqtt_group_id, mqtt_topic_namespace, mqtt_profile, mqtt_protocol, mqtt_transport, mqtt_port, mqtt_username, mqtt_password, mqtt_keepalive, mqtt_publish_interval, mqtt_publish_qos, mqtt_subscribe_qos, mqtt_publish_retain, mqtt_clean_session, mqtt_session_expiry, mqtt_security, mqtt_websocket_path, mqtt_alpn, mqtt_lwt_enabled, mqtt_lwt_topic, mqtt_lwt_payload, mqtt_lwt_qos, mqtt_lwt_retain, mqtt_ca_cert_path, mqtt_client_cert_path, mqtt_client_key_path, azure_sas_key, azure_sas_expiry_s, azure_twin_enabled, azure_direct_methods_enabled, azure_c2d_enabled, azure_dps_enabled, azure_dps_id_scope, azure_dps_registration_id, azure_dps_endpoint, azure_event_grid_topic, azure_event_grid_source, azure_event_grid_event_type, aws_shadow_enabled, aws_jobs_enabled, aws_fleet_enabled, aws_fleet_template_name, aws_claim_cert_path, aws_claim_key_path");
    return -EINVAL;
  }

  const char *key = argv[1];
  const char *val = argv[2];

  if (strcmp(key, "hostname") == 0) {
    zplc_config_set_hostname(val);
  } else if (strcmp(key, "dhcp") == 0) {
    zplc_config_set_dhcp(strcmp(val, "true") == 0 || strcmp(val, "1") == 0);
  } else if (strcmp(key, "ip") == 0) {
    zplc_config_set_ip(val);
  } else if (strcmp(key, "wifi_ssid") == 0) {
    zplc_config_set_wifi_ssid(val);
  } else if (strcmp(key, "wifi_pass") == 0) {
    zplc_config_set_wifi_pass(val);
  } else if (strcmp(key, "wifi_security") == 0) {
    zplc_config_set_wifi_security((uint8_t)atoi(val));
  } else if (strcmp(key, "ntp_enabled") == 0) {
    zplc_config_set_ntp_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "ntp_server") == 0) {
    zplc_config_set_ntp_server(val);
  } else if (strcmp(key, "modbus_id") == 0) {
    zplc_config_set_modbus_id((uint16_t)atoi(val));
  } else if (strcmp(key, "modbus_tcp_enabled") == 0) {
    zplc_config_set_modbus_tcp_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "modbus_tcp_port") == 0) {
    zplc_config_set_modbus_tcp_port((uint16_t)atoi(val));
  } else if (strcmp(key, "modbus_rtu_enabled") == 0) {
    zplc_config_set_modbus_rtu_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "modbus_rtu_baud") == 0) {
    zplc_config_set_modbus_rtu_baud((uint32_t)strtoul(val, NULL, 10));
  } else if (strcmp(key, "modbus_rtu_parity") == 0) {
    zplc_config_set_modbus_rtu_parity((zplc_modbus_parity_t)atoi(val));
  } else if (strcmp(key, "modbus_rtu_client_enabled") == 0) {
    zplc_config_set_modbus_rtu_client_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "modbus_rtu_client_slave_id") == 0) {
    zplc_config_set_modbus_rtu_client_slave_id((uint8_t)atoi(val));
  } else if (strcmp(key, "modbus_rtu_client_poll_ms") == 0) {
    zplc_config_set_modbus_rtu_client_poll_ms((uint32_t)strtoul(val, NULL, 10));
  } else if (strcmp(key, "modbus_tcp_client_enabled") == 0) {
    zplc_config_set_modbus_tcp_client_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "modbus_tcp_client_host") == 0) {
    zplc_config_set_modbus_tcp_client_host(val);
  } else if (strcmp(key, "modbus_tcp_client_port") == 0) {
    zplc_config_set_modbus_tcp_client_port((uint16_t)atoi(val));
  } else if (strcmp(key, "modbus_tcp_client_unit_id") == 0) {
    zplc_config_set_modbus_tcp_client_unit_id((uint8_t)atoi(val));
  } else if (strcmp(key, "modbus_tcp_client_poll_ms") == 0) {
    zplc_config_set_modbus_tcp_client_poll_ms((uint32_t)strtoul(val, NULL, 10));
  } else if (strcmp(key, "modbus_tcp_client_timeout_ms") == 0) {
    zplc_config_set_modbus_tcp_client_timeout_ms((uint32_t)strtoul(val, NULL, 10));
  } else if (strcmp(key, "mqtt_broker") == 0) {
    zplc_config_set_mqtt_broker(val);
  } else if (strcmp(key, "mqtt_client_id") == 0) {
    zplc_config_set_mqtt_client_id(val);
  } else if (strcmp(key, "mqtt_group_id") == 0) {
    zplc_config_set_mqtt_group_id(val);
  } else if (strcmp(key, "mqtt_topic_namespace") == 0) {
    zplc_config_set_mqtt_topic_namespace(val);
  } else if (strcmp(key, "mqtt_profile") == 0) {
    zplc_config_set_mqtt_profile((zplc_mqtt_profile_t)atoi(val));
  } else if (strcmp(key, "mqtt_protocol") == 0) {
    zplc_config_set_mqtt_protocol((zplc_mqtt_protocol_t)atoi(val));
  } else if (strcmp(key, "mqtt_transport") == 0) {
    zplc_config_set_mqtt_transport((zplc_mqtt_transport_t)atoi(val));
  } else if (strcmp(key, "mqtt_port") == 0) {
    zplc_config_set_mqtt_port((uint16_t)atoi(val));
  } else if (strcmp(key, "mqtt_enabled") == 0) {
    zplc_config_set_mqtt_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "mqtt_username") == 0) {
    zplc_config_set_mqtt_username(val);
  } else if (strcmp(key, "mqtt_password") == 0) {
    zplc_config_set_mqtt_password(val);
  } else if (strcmp(key, "mqtt_keepalive") == 0) {
    zplc_config_set_mqtt_keepalive_sec((uint16_t)atoi(val));
  } else if (strcmp(key, "mqtt_publish_interval") == 0) {
    zplc_config_set_mqtt_publish_interval_ms((uint32_t)strtoul(val, NULL, 10));
  } else if (strcmp(key, "mqtt_publish_qos") == 0) {
    zplc_config_set_mqtt_publish_qos((zplc_mqtt_qos_t)atoi(val));
  } else if (strcmp(key, "mqtt_subscribe_qos") == 0) {
    zplc_config_set_mqtt_subscribe_qos((zplc_mqtt_qos_t)atoi(val));
  } else if (strcmp(key, "mqtt_publish_retain") == 0) {
    zplc_config_set_mqtt_publish_retain(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "mqtt_clean_session") == 0) {
    zplc_config_set_mqtt_clean_session(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "mqtt_session_expiry") == 0) {
    zplc_config_set_mqtt_session_expiry_sec((uint32_t)strtoul(val, NULL, 10));
  } else if (strcmp(key, "mqtt_security") == 0) {
    zplc_config_set_mqtt_security((zplc_mqtt_security_t)atoi(val));
  } else if (strcmp(key, "mqtt_websocket_path") == 0) {
    zplc_config_set_mqtt_websocket_path(val);
  } else if (strcmp(key, "mqtt_alpn") == 0) {
    zplc_config_set_mqtt_alpn(val);
  } else if (strcmp(key, "mqtt_lwt_enabled") == 0) {
    zplc_config_set_mqtt_lwt_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "mqtt_lwt_topic") == 0) {
    zplc_config_set_mqtt_lwt_topic(val);
  } else if (strcmp(key, "mqtt_lwt_payload") == 0) {
    zplc_config_set_mqtt_lwt_payload(val);
  } else if (strcmp(key, "mqtt_lwt_qos") == 0) {
    zplc_config_set_mqtt_lwt_qos((zplc_mqtt_qos_t)atoi(val));
  } else if (strcmp(key, "mqtt_lwt_retain") == 0) {
    zplc_config_set_mqtt_lwt_retain(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "mqtt_ca_cert_path") == 0) {
    zplc_config_set_mqtt_ca_cert_path(val);
  } else if (strcmp(key, "mqtt_client_cert_path") == 0) {
    zplc_config_set_mqtt_client_cert_path(val);
  } else if (strcmp(key, "mqtt_client_key_path") == 0) {
    zplc_config_set_mqtt_client_key_path(val);
  } else if (strcmp(key, "azure_sas_key") == 0) {
    zplc_config_set_azure_sas_key(val);
  } else if (strcmp(key, "azure_sas_expiry_s") == 0) {
    zplc_config_set_azure_sas_expiry_s((uint32_t)strtoul(val, NULL, 10));
  } else if (strcmp(key, "azure_twin_enabled") == 0) {
    zplc_config_set_azure_twin_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "azure_direct_methods_enabled") == 0) {
    zplc_config_set_azure_direct_methods_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "azure_c2d_enabled") == 0) {
    zplc_config_set_azure_c2d_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "azure_dps_enabled") == 0) {
    zplc_config_set_azure_dps_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "azure_dps_id_scope") == 0) {
    zplc_config_set_azure_dps_id_scope(val);
  } else if (strcmp(key, "azure_dps_registration_id") == 0) {
    zplc_config_set_azure_dps_registration_id(val);
  } else if (strcmp(key, "azure_dps_endpoint") == 0) {
    zplc_config_set_azure_dps_endpoint(val);
  } else if (strcmp(key, "azure_event_grid_topic") == 0) {
    zplc_config_set_azure_event_grid_topic(val);
  } else if (strcmp(key, "azure_event_grid_source") == 0) {
    zplc_config_set_azure_event_grid_source(val);
  } else if (strcmp(key, "azure_event_grid_event_type") == 0) {
    zplc_config_set_azure_event_grid_event_type(val);
  } else if (strcmp(key, "aws_shadow_enabled") == 0) {
    zplc_config_set_aws_shadow_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "aws_jobs_enabled") == 0) {
    zplc_config_set_aws_jobs_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "aws_fleet_enabled") == 0) {
    zplc_config_set_aws_fleet_enabled(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
  } else if (strcmp(key, "aws_fleet_template_name") == 0) {
    zplc_config_set_aws_fleet_template_name(val);
  } else if (strcmp(key, "aws_claim_cert_path") == 0) {
    zplc_config_set_aws_claim_cert_path(val);
  } else if (strcmp(key, "aws_claim_key_path") == 0) {
    zplc_config_set_aws_claim_key_path(val);
  } else {
    shell_error(sh, "ERROR: Unknown config key: %s", key);
    return -EINVAL;
  }

  shell_print(sh, "OK: Config updated");
  return 0;
}

static int cmd_config_save(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  int err = zplc_config_save();
  if (err) {
    shell_error(sh, "ERROR: Failed to save config: %d", err);
    return err;
  }
  shell_print(sh, "OK: Config saved");
  return 0;
}

static int cmd_config_reset(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  zplc_config_reset();
  shell_print(sh, "OK: Config reset");
  return 0;
}

static int cmd_net_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

#ifndef CONFIG_NETWORKING
  shell_error(sh, "Networking is disabled in this firmware build");
  return -ENOTSUP;
#else

  struct net_if *iface = net_if_get_default();
  if (iface == NULL) {
    shell_error(sh, "No default network interface");
    return -ENODEV;
  }

  char ip_buf[16] = {0};
  if (zplc_hal_net_get_ip(ip_buf, sizeof(ip_buf)) == ZPLC_HAL_OK && ip_buf[0] != '\0') {
    shell_print(sh, "IP Address: %s", ip_buf);
  } else {
    shell_print(sh, "IP Address: (not assigned yet)");
  }

  shell_print(sh, "Interface: %s", net_if_is_up(iface) ? "up" : "down");

  struct net_if_ipv4 *ipv4 = iface->config.ip.ipv4;
  if (ipv4 != NULL && !net_ipv4_is_addr_unspecified(&ipv4->gw)) {
    char gw_buf[16] = {0};
    net_addr_ntop(AF_INET, &ipv4->gw, gw_buf, sizeof(gw_buf));
    shell_print(sh, "Gateway: %s", gw_buf);
  }

#ifdef CONFIG_WIFI
  struct wifi_iface_status status = {0};
  int rc = net_mgmt(NET_REQUEST_WIFI_IFACE_STATUS, iface, &status, sizeof(status));
  if (rc == 0) {
    shell_print(sh, "WiFi state: %d", status.state);
    if (status.ssid_len > 0U) {
      shell_print(sh, "WiFi SSID: %s", status.ssid);
    } else {
      shell_print(sh, "WiFi SSID: (not connected)");
    }
    shell_print(sh, "WiFi channel: %u", status.channel);
    shell_print(sh, "WiFi RSSI: %d dBm", status.rssi);
    shell_print(sh, "WiFi security: %d", status.security);
  } else {
    shell_print(sh, "WiFi status unavailable (rc=%d)", rc);
  }
#endif

  return 0;
#endif
}

static const char *cert_path_from_kind(const char *kind) {
  if (strcmp(kind, "ca") == 0) return "/lfs/certs/ca.pem";
  if (strcmp(kind, "client") == 0) return "/lfs/certs/client.pem";
  if (strcmp(kind, "key") == 0) return "/lfs/certs/client.key";
  return NULL;
}

static int ensure_certs_dir(void) {
  struct fs_dirent dirent;
  if (fs_stat("/lfs/certs", &dirent) == 0) {
    if (dirent.type == FS_DIR_ENTRY_DIR) {
      return 0;
    }
    return -ENOTDIR;
  }
  return fs_mkdir("/lfs/certs");
}

static int cmd_cert_begin(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 3) {
    shell_error(sh, "ERROR: Usage: zplc cert begin <ca|client|key> <size>");
    return -EINVAL;
  }

  const char *path = cert_path_from_kind(argv[1]);
  if (!path) {
    shell_error(sh, "ERROR: Invalid cert type '%s'", argv[1]);
    return -EINVAL;
  }

  unsigned long size = strtoul(argv[2], NULL, 10);
  if (size == 0U || size > CERT_STAGING_MAX_BYTES) {
    shell_error(sh, "ERROR: Invalid size (1..%u)", CERT_STAGING_MAX_BYTES);
    return -EINVAL;
  }

  cert_staging.active = true;
  cert_staging.expected = (size_t)size;
  cert_staging.received = 0U;
  strncpy(cert_staging.path, path, sizeof(cert_staging.path) - 1U);
  cert_staging.path[sizeof(cert_staging.path) - 1U] = '\0';

  shell_print(sh, "OK: Cert staging started for %s (%lu bytes)", argv[1], size);
  return 0;
}

static int cmd_cert_chunk(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "ERROR: Usage: zplc cert chunk <hex>");
    return -EINVAL;
  }
  if (!cert_staging.active) {
    shell_error(sh, "ERROR: No active cert staging. Run 'zplc cert begin' first");
    return -EINVAL;
  }

  size_t remaining = cert_staging.expected - cert_staging.received;
  int decoded = hex_decode(argv[1], &cert_staging.data[cert_staging.received], remaining);
  if (decoded <= 0) {
    shell_error(sh, "ERROR: Invalid hex chunk");
    return -EINVAL;
  }

  cert_staging.received += (size_t)decoded;
  if (cert_staging.received > cert_staging.expected) {
    shell_error(sh, "ERROR: Too much data (%u > %u)", (unsigned)cert_staging.received,
                (unsigned)cert_staging.expected);
    cert_staging.active = false;
    return -EOVERFLOW;
  }

  shell_print(sh, "OK: Cert chunk accepted (%u/%u)", (unsigned)cert_staging.received,
              (unsigned)cert_staging.expected);
  return 0;
}

static int cmd_cert_commit(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  if (!cert_staging.active) {
    shell_error(sh, "ERROR: No active cert staging");
    return -EINVAL;
  }
  if (cert_staging.received != cert_staging.expected) {
    shell_error(sh, "ERROR: Incomplete data (%u/%u)", (unsigned)cert_staging.received,
                (unsigned)cert_staging.expected);
    return -EINVAL;
  }

  int err = ensure_certs_dir();
  if (err && err != -EEXIST) {
    shell_error(sh, "ERROR: Failed to create cert dir (%d)", err);
    cert_staging.active = false;
    return err;
  }

  struct fs_file_t file;
  fs_file_t_init(&file);
  err = fs_open(&file, cert_staging.path, FS_O_CREATE | FS_O_WRITE | FS_O_TRUNC);
  if (err < 0) {
    shell_error(sh, "ERROR: Failed to open cert file (%d)", err);
    cert_staging.active = false;
    return err;
  }

  ssize_t wr = fs_write(&file, cert_staging.data, cert_staging.received);
  fs_close(&file);

  if (wr < 0 || (size_t)wr != cert_staging.received) {
    shell_error(sh, "ERROR: Failed to write cert file (%d)", (int)wr);
    cert_staging.active = false;
    return -EIO;
  }

  shell_print(sh, "OK: Certificate committed to %s (%u bytes)", cert_staging.path,
              (unsigned)cert_staging.received);
  cert_staging.active = false;
  return 0;
}

static int cmd_cert_erase(const struct shell *sh, size_t argc, char **argv) {
  if (argc < 2) {
    shell_error(sh, "ERROR: Usage: zplc cert erase <ca|client|key>");
    return -EINVAL;
  }

  const char *path = cert_path_from_kind(argv[1]);
  if (!path) {
    shell_error(sh, "ERROR: Invalid cert type '%s'", argv[1]);
    return -EINVAL;
  }

  int err = fs_unlink(path);
  if (err == -ENOENT) {
    shell_print(sh, "OK: Certificate not present (%s)", path);
    return 0;
  }
  if (err < 0) {
    shell_error(sh, "ERROR: Failed to erase cert (%d)", err);
    return err;
  }

  shell_print(sh, "OK: Erased certificate %s", path);
  return 0;
}

static int cmd_cert_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  const char *paths[] = {"/lfs/certs/ca.pem", "/lfs/certs/client.pem", "/lfs/certs/client.key"};
  const char *names[] = {"CA", "CLIENT", "KEY"};

  for (size_t i = 0; i < 3U; i++) {
    struct fs_dirent dirent;
    int err = fs_stat(paths[i], &dirent);
    if (err == 0 && dirent.type == FS_DIR_ENTRY_FILE) {
      shell_print(sh, "OK: %s present (%u bytes)", names[i], (unsigned)dirent.size);
    } else {
      shell_print(sh, "WARN: %s missing", names[i]);
    }
  }

  return 0;
}

static const char *comm_tag_name(uint8_t tag_id)
{
  switch (tag_id) {
  case ZPLC_TAG_PUBLISH:
    return "publish";
  case ZPLC_TAG_MODBUS:
    return "modbus";
  case ZPLC_TAG_SUBSCRIBE:
    return "subscribe";
  default:
    return "unknown";
  }
}

static const char *comm_type_name(uint8_t var_type)
{
  switch (var_type) {
  case ZPLC_TYPE_BOOL:
    return "BOOL";
  case ZPLC_TYPE_INT:
    return "INT";
  case ZPLC_TYPE_UINT:
    return "UINT";
  case ZPLC_TYPE_WORD:
    return "WORD";
  case ZPLC_TYPE_DINT:
    return "DINT";
  case ZPLC_TYPE_UDINT:
    return "UDINT";
  case ZPLC_TYPE_DWORD:
    return "DWORD";
  case ZPLC_TYPE_REAL:
    return "REAL";
  default:
    return "UNKNOWN";
  }
}

static uint16_t comm_modbus_width(uint8_t var_type)
{
  switch (var_type) {
  case ZPLC_TYPE_REAL:
  case ZPLC_TYPE_DINT:
  case ZPLC_TYPE_UDINT:
  case ZPLC_TYPE_DWORD:
    return 2U;
  default:
    return 1U;
  }
}

static uint32_t comm_effective_modbus_addr(uint16_t index,
                                           const zplc_tag_entry_t *tag)
{
  uint32_t addr = 0U;
  if (zplc_config_get_modbus_tag_override(index, &addr)) {
    return addr;
  }

  return tag ? tag->value : 0U;
}

static int cmd_comm_map(const struct shell *sh, size_t argc, char **argv)
{
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);
  uint16_t count = zplc_core_get_tag_count();

  if (json) {
    JSON_OBJ_START(sh);
    JSON_UINT(sh, "count", count, true);
    shell_fprintf(sh, SHELL_NORMAL, "\"entries\":[");
    for (uint16_t i = 0U; i < count; i++) {
      const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
      uint32_t effective = (tag && tag->tag_id == ZPLC_TAG_MODBUS)
                               ? comm_effective_modbus_addr(i, tag)
                               : (tag ? tag->value : 0U);
      if (i > 0U) {
        shell_fprintf(sh, SHELL_NORMAL, ",");
      }
      JSON_OBJ_START(sh);
      JSON_UINT(sh, "index", i, true);
      JSON_STR(sh, "kind", tag ? comm_tag_name(tag->tag_id) : "unknown", true);
      JSON_STR(sh, "type", tag ? comm_type_name(tag->var_type) : "UNKNOWN", true);
      JSON_UINT(sh, "var_addr", tag ? tag->var_addr : 0U, true);
      JSON_UINT(sh, "width", tag ? comm_modbus_width(tag->var_type) : 0U, true);
      JSON_UINT(sh, "value", tag ? tag->value : 0U, true);
      JSON_UINT(sh, "effective_value", effective, true);
      JSON_BOOL(sh, "override", tag ? zplc_config_get_modbus_tag_override(i, NULL) : false, false);
      JSON_OBJ_END(sh);
    }
    shell_fprintf(sh, SHELL_NORMAL, "]");
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  shell_print(sh, "Communication Map (%u entries):", count);
  for (uint16_t i = 0U; i < count; i++) {
    const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
    if (!tag) {
      continue;
    }

    if (tag->tag_id == ZPLC_TAG_MODBUS) {
      bool has_override = zplc_config_get_modbus_tag_override(i, NULL);
      shell_print(sh,
                  "  [%u] %-9s addr=%lu%s var=0x%04x type=%s",
                  i,
                  comm_tag_name(tag->tag_id),
                  (unsigned long)comm_effective_modbus_addr(i, tag),
                  has_override ? " (override)" : "",
                  tag->var_addr,
                  comm_type_name(tag->var_type));
      continue;
    }

    shell_print(sh,
                "  [%u] %-9s value=%lu var=0x%04x type=%s",
                i,
                comm_tag_name(tag->tag_id),
                (unsigned long)tag->value,
                tag->var_addr,
                comm_type_name(tag->var_type));
  }

  return 0;
}

static int cmd_comm_set(const struct shell *sh, size_t argc, char **argv)
{
  if (argc < 4) {
    shell_error(sh, "ERROR: Usage: zplc comm set modbus <index> <address>");
    return -EINVAL;
  }

  if (strcmp(argv[1], "modbus") != 0) {
    shell_error(sh, "ERROR: Only modbus overrides are supported");
    return -EINVAL;
  }

  uint16_t index = (uint16_t)strtoul(argv[2], NULL, 10);
  uint32_t address = (uint32_t)strtoul(argv[3], NULL, 10);
  const zplc_tag_entry_t *tag = zplc_core_get_tag(index);
  if (!tag || tag->tag_id != ZPLC_TAG_MODBUS) {
    shell_error(sh, "ERROR: Tag index %u is not a Modbus binding", index);
    return -EINVAL;
  }

  for (uint16_t i = 0U; i < zplc_core_get_tag_count(); i++) {
    const zplc_tag_entry_t *other = zplc_core_get_tag(i);
    if (!other || other->tag_id != ZPLC_TAG_MODBUS || i == index) {
      continue;
    }

    uint32_t other_start = comm_effective_modbus_addr(i, other);
    uint32_t other_end = other_start + comm_modbus_width(other->var_type) - 1U;
    uint32_t new_end = address + comm_modbus_width(tag->var_type) - 1U;
    if (!(new_end < other_start || address > other_end)) {
      shell_error(sh, "ERROR: Modbus range %lu-%lu overlaps tag %u (%lu-%lu)",
                  (unsigned long)address,
                  (unsigned long)new_end,
                  i,
                  (unsigned long)other_start,
                  (unsigned long)other_end);
      return -EEXIST;
    }
  }

  int err = zplc_config_set_modbus_tag_override(index, address);
  if (err < 0) {
    shell_error(sh, "ERROR: Failed to set override (%d)", err);
    return err;
  }

  shell_print(sh, "OK: Modbus tag %u remapped to %lu",
              index, (unsigned long)address);
  return 0;
}

static int cmd_comm_clear(const struct shell *sh, size_t argc, char **argv)
{
  if (argc < 3) {
    shell_error(sh, "ERROR: Usage: zplc comm clear modbus <index>");
    return -EINVAL;
  }

  if (strcmp(argv[1], "modbus") != 0) {
    shell_error(sh, "ERROR: Only modbus overrides are supported");
    return -EINVAL;
  }

  uint16_t index = (uint16_t)strtoul(argv[2], NULL, 10);
  int err = zplc_config_clear_modbus_tag_override(index);
  if (err < 0) {
    shell_error(sh, "ERROR: Failed to clear override (%d)", err);
    return err;
  }

  shell_print(sh, "OK: Cleared Modbus override for tag %u", index);
  return 0;
}

/* ============================================================================
 * WiFi Commands
 * ============================================================================
 */

static int cmd_wifi_connect(const struct shell *sh, size_t argc, char **argv)
{
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

#ifndef CONFIG_WIFI
  shell_error(sh, "ERROR: WiFi not enabled in this build");
  return -ENOTSUP;
#else
  char ssid[64] = {0};
  char pass[64] = {0};
  uint8_t security = 0;

  zplc_config_get_wifi_ssid(ssid, sizeof(ssid));
  zplc_config_get_wifi_pass(pass, sizeof(pass));
  security = zplc_config_get_wifi_security();

  if (ssid[0] == '\0') {
    shell_error(sh, "ERROR: No SSID configured (use zplc config set wifi_ssid)");
    return -EINVAL;
  }

  struct net_if *iface = net_if_get_default();
  if (iface == NULL) {
    shell_error(sh, "ERROR: No network interface available");
    return -ENODEV;
  }

  struct wifi_connect_req_params params = {0};
  params.ssid        = (const uint8_t *)ssid;
  params.ssid_length = (uint8_t)strlen(ssid);
  params.security    = (enum wifi_security_type)security;

  if (security != WIFI_SECURITY_TYPE_NONE && pass[0] != '\0') {
    params.psk        = (const uint8_t *)pass;
    params.psk_length = (uint8_t)strlen(pass);
  }

  params.channel = WIFI_CHANNEL_ANY;
  params.band    = WIFI_FREQ_BAND_UNKNOWN;
  params.mfp     = WIFI_MFP_OPTIONAL;

  int rc = net_mgmt(NET_REQUEST_WIFI_CONNECT, iface, &params, sizeof(params));
  if (rc == 0 || rc == -EALREADY) {
    shell_print(sh, "OK: WiFi connect requested for SSID '%s'", ssid);
  } else {
    shell_print(sh, "WARN: WiFi connect request returned %d for SSID '%s'",
                rc, ssid);
  }
  return 0;
#endif /* CONFIG_WIFI */
}

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
    SHELL_CMD_ARG(mpeek, NULL, "Multi-read: mpeek addr:len[,addr:len...]", cmd_dbg_mpeek, 2, 0),
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
    SHELL_CMD_ARG(load, NULL, "Prepare program load: sched load <size>", cmd_sched_load, 2, 0),
    SHELL_CMD_ARG(data, NULL, "Receive program data (hex): sched data <hex>", cmd_sched_data, 2, 0),
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
    SHELL_CMD_ARG(watch, NULL, "Manage watches", cmd_hil_watch, 2, 2),
    SHELL_CMD(reset, NULL, "Reset VM", cmd_hil_reset),
    SHELL_SUBCMD_SET_END);
#endif

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_config,
    SHELL_CMD(get, NULL, "Show current configuration", cmd_config_get),
    SHELL_CMD_ARG(set, NULL, "Set configuration value", cmd_config_set, 3, 0),
    SHELL_CMD(save, NULL, "Persist configuration to flash", cmd_config_save),
    SHELL_CMD(reset, NULL, "Reset configuration to defaults", cmd_config_reset),
    SHELL_SUBCMD_SET_END);

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_cert,
    SHELL_CMD_ARG(begin, NULL, "Begin cert upload: cert begin <ca|client|key> <size>", cmd_cert_begin, 3, 0),
    SHELL_CMD_ARG(chunk, NULL, "Upload cert chunk in hex", cmd_cert_chunk, 2, 0),
    SHELL_CMD(commit, NULL, "Commit staged certificate", cmd_cert_commit),
    SHELL_CMD_ARG(erase, NULL, "Erase certificate: cert erase <ca|client|key>", cmd_cert_erase, 2, 0),
    SHELL_CMD(status, NULL, "Show cert presence/size", cmd_cert_status),
    SHELL_SUBCMD_SET_END);

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_net,
    SHELL_CMD(status, NULL, "Show network status (IP/WiFi)", cmd_net_status),
    SHELL_SUBCMD_SET_END);

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_wifi,
    SHELL_CMD(connect, NULL, "Connect using stored credentials", cmd_wifi_connect),
    SHELL_SUBCMD_SET_END);

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_ntp,
    SHELL_CMD_ARG(status, NULL, "Show NTP sync status", cmd_ntp_status, 1, 1),
    SHELL_CMD(enable, NULL, "Enable NTP time sync", cmd_ntp_enable),
    SHELL_CMD(disable, NULL, "Disable NTP time sync", cmd_ntp_disable),
    SHELL_CMD_ARG(server, NULL, "Set NTP server: ntp server <hostname>", cmd_ntp_server, 2, 0),
    SHELL_CMD(sync, NULL, "Force NTP re-sync now", cmd_ntp_sync),
    SHELL_SUBCMD_SET_END);

static int cmd_mqtt_reset_backoff(const struct shell *sh, size_t argc, char **argv)
{
    ARG_UNUSED(argc);
    ARG_UNUSED(argv);
    zplc_mqtt_request_backoff_reset();
    shell_print(sh, "OK: MQTT backoff reset");
    return 0;
}

static int cmd_mqtt_status(const struct shell *sh, size_t argc, char **argv)
{
    bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);
    zplc_mqtt_status_t status;
    zplc_mqtt_get_status(&status);

    if (json) {
        JSON_OBJ_START(sh);
        JSON_BOOL(sh, "connected", status.connected, true);
        JSON_BOOL(sh, "subscribed", status.subscribed, true);
        JSON_BOOL(sh, "session_present", status.session_present, true);
        JSON_UINT(sh, "profile", status.profile, true);
        JSON_UINT(sh, "protocol", status.protocol, true);
        JSON_UINT(sh, "transport", status.transport, true);
        JSON_UINT(sh, "publish_qos", status.publish_qos, true);
        JSON_UINT(sh, "subscribe_qos", status.subscribe_qos, true);
        JSON_BOOL(sh, "retain_enabled", status.retain_enabled, true);
        JSON_BOOL(sh, "lwt_enabled", status.lwt_enabled, true);
        JSON_INT(sh, "last_error", status.last_error, true);
        JSON_UINT(sh, "last_publish_ms", status.last_publish_ms, true);
        JSON_UINT(sh, "reconnect_backoff_s", status.reconnect_backoff_s, true);
        JSON_STR(sh, "broker", status.broker, true);
        JSON_STR(sh, "client_id", status.client_id, false);
        JSON_OBJ_END(sh);
        JSON_NEWLINE(sh);
        return 0;
    }

    shell_print(sh, "MQTT Status:");
    shell_print(sh, "  Connected: %s", status.connected ? "Yes" : "No");
    shell_print(sh, "  Subscribed: %s", status.subscribed ? "Yes" : "No");
    shell_print(sh, "  Session Present: %s", status.session_present ? "Yes" : "No");
    shell_print(sh, "  Profile: %u", status.profile);
    shell_print(sh, "  Protocol: %u", status.protocol);
    shell_print(sh, "  Transport: %u", status.transport);
    shell_print(sh, "  Publish QoS: %u", status.publish_qos);
    shell_print(sh, "  Subscribe QoS: %u", status.subscribe_qos);
    shell_print(sh, "  Retain Enabled: %s", status.retain_enabled ? "Yes" : "No");
    shell_print(sh, "  LWT Enabled: %s", status.lwt_enabled ? "Yes" : "No");
    shell_print(sh, "  Last Error: %d", status.last_error);
    shell_print(sh, "  Last Publish: %u ms", (unsigned)status.last_publish_ms);
    shell_print(sh, "  Reconnect Backoff: %u s", (unsigned)status.reconnect_backoff_s);
    shell_print(sh, "  Broker: %s", status.broker);
    shell_print(sh, "  Client ID: %s", status.client_id);
    return 0;
}

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_mqtt,
    SHELL_CMD_ARG(status, NULL, "Show MQTT runtime status", cmd_mqtt_status, 1, 1),
    SHELL_CMD(reset_backoff, NULL, "Reset MQTT reconnect backoff to initial value", cmd_mqtt_reset_backoff),
    SHELL_SUBCMD_SET_END);

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_comm,
    SHELL_CMD_ARG(map, NULL, "Show effective communication map", cmd_comm_map, 1, 1),
    SHELL_CMD_ARG(set, NULL, "Override communication binding", cmd_comm_set, 4, 0),
    SHELL_CMD_ARG(clear, NULL, "Clear communication override", cmd_comm_clear, 3, 0),
    SHELL_SUBCMD_SET_END);

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_zplc,
    SHELL_CMD_ARG(load, NULL, "Prepare load", cmd_zplc_load, 2, 0),
    SHELL_CMD_ARG(data, NULL, "Receive data", cmd_zplc_data, 2, 0),
    SHELL_CMD(start, NULL, "Start execution", cmd_zplc_start),
    SHELL_CMD(stop, NULL, "Stop execution", cmd_zplc_stop),
    SHELL_CMD_ARG(status, NULL, "Runtime status", cmd_zplc_status, 1, 1),
    SHELL_CMD(reset, NULL, "Reset VM", cmd_zplc_reset),
    SHELL_CMD(version, NULL, "Version info", cmd_zplc_version),
    SHELL_CMD(dbg, &sub_dbg, "Debug commands", NULL),
    SHELL_CMD(config, &sub_config, "Configuration commands", NULL),
    SHELL_CMD(cert, &sub_cert, "Certificate management", NULL),
    SHELL_CMD(net, &sub_net, "Network diagnostics", NULL),
    SHELL_CMD(wifi, &sub_wifi, "WiFi management", NULL),
    SHELL_CMD(ntp, &sub_ntp, "NTP time synchronization", NULL),
    SHELL_CMD(mqtt, &sub_mqtt, "MQTT client commands", NULL),
    SHELL_CMD(comm, &sub_comm, "Communication map and overrides", NULL),
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
