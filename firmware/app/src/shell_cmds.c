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

#define _POSIX_C_SOURCE 200809L

#include <zephyr/shell/shell.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/reboot.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/adc.h>
#if defined(CONFIG_FILE_SYSTEM)
#include <zephyr/fs/fs.h>
#endif
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
#include <zplc_failsafe.h>
#include <zplc_fw_identity.h>
#ifdef CONFIG_ZPLC_RETAIN_PERSIST
#include <zplc_retain.h>
#endif
#include "zplc_config.h"
#include "zplc_lock.h"
#include "zplc_parse.h"
#include "zplc_time.h"
#include "program_admission.h"
#include "program_store.h"
#include "program_boot_restore.h"

/* zplc_mqtt.c has no standalone header — declare the public symbol here */
extern void zplc_mqtt_request_backoff_reset(void);

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_sched_core.h>
#include <zplc_scheduler.h>
#include <zplc_exchange.h>
#endif

#ifdef CONFIG_ZPLC_SCHEDULER
/* RT-030: a release of the scheduler lock that fails is reported to the operator; nothing else can be done. */
static void sched_unlock_reported(const struct shell *sh) {
  int rc = zplc_sched_unlock();

  if (rc != 0) {
    shell_error(sh, "ERROR: scheduler lock release failed (%d)", rc);
  }
}
#endif

/* A debug read of PLC memory (RT-010). With the scheduler it comes from the snapshot the scan published at its last
 * commit: whole values, between two scans, and neither the image lock nor a wait for a scan is needed, so nothing
 * is printed with a lock held. The single-task runtime has no scan to publish: its loop is the only other writer
 * and the read is as it always was. Returns 0, or a negative errno when the extent is not inside PLC memory. */
static int dbg_read(uint16_t addr, uint8_t *out, uint16_t size) {
#ifdef CONFIG_ZPLC_SCHEDULER
  return zplc_exchange_read(addr, out, size) == 0 ? 0 : -ERANGE;
#else
  static const uint16_t bases[4] = {ZPLC_MEM_IPI_BASE, ZPLC_MEM_OPI_BASE, ZPLC_MEM_WORK_BASE,
                                    ZPLC_MEM_RETAIN_BASE};
  static const uint32_t sizes[4] = {ZPLC_MEM_IPI_SIZE, ZPLC_MEM_OPI_SIZE, ZPLC_MEM_WORK_SIZE,
                                    ZPLC_MEM_RETAIN_SIZE};

  for (unsigned region = 0U; region < 4U; region++) {
    if (addr >= bases[region] && (uint32_t)(addr - bases[region]) + size <= sizes[region]) {
      const uint8_t *base = zplc_mem_get_region(bases[region]);

      if (base == NULL) {
        return -ERANGE;
      }
      memcpy(out, base + (addr - bases[region]), size);
      return 0;
    }
  }
  return -ERANGE;
#endif
}

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
#ifndef CONFIG_ZPLC_SCHEDULER
extern uint8_t *program_buffer;
#endif
extern size_t program_buffer_size;
extern volatile size_t program_expected_size;
extern volatile size_t program_received_size;
extern uint8_t *program_staging_buffer;
extern volatile size_t program_staging_received_size;

#ifndef CONFIG_ZPLC_SCHEDULER
static uint8_t program_admission_workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
extern struct k_mutex legacy_runtime_lock;
extern uint32_t legacy_scan_interval_ms;
extern void zplc_legacy_wake(void);

/* RT-030: a command that cannot take the runtime lock says so and does nothing. */
static int legacy_lock_take(const struct shell *sh) {
  int rc = zplc_lock_take(&legacy_runtime_lock, "runtime lock");

  if (rc != 0) {
    shell_error(sh, "ERROR: runtime lock unavailable (%d)", rc);
  }
  return rc;
}
/* Implemented in main.c; callers hold legacy_runtime_lock. */
extern int zplc_legacy_apply_safe_outputs_locked(void);
#endif
extern volatile int step_requested;

#if defined(CONFIG_FILE_SYSTEM)
#define CERT_STAGING_MAX_BYTES 4096U
static struct {
  bool active;
  size_t expected;
  size_t received;
  char path[32];
  uint8_t data[CERT_STAGING_MAX_BYTES];
} cert_staging;
#endif

/* ============================================================================
 * Typed reads of PLC memory (zplc dbg watch, zplc dbg timer, HIL watches)
 * ============================================================================
 */

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
  uint32_t raw;
  bool bool_val;
  int32_t i32_val;
  uint32_t u32_val;
  float f32_val;
} hil_watch_value_t;

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

static int hil_read_watch_value(uint16_t addr, hil_watch_type_t type,
                                hil_watch_value_t *value) {
  uint8_t raw_bytes[4] = {0U, 0U, 0U, 0U};
  const uint8_t *ptr = raw_bytes;
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

  rc = dbg_read(addr, raw_bytes, (uint16_t)width);
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
    /* Sign extension of one byte, written without a conversion from signed
     * char. */
    value->i32_val = (int32_t)(ptr[0] ^ 0x80U) - 128;
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
  case HIL_WATCH_F32:
    memcpy(&value->raw, ptr, sizeof(uint32_t));
    memcpy(&value->f32_val, ptr, sizeof(float));
    break;
  default:
    return -EINVAL;
  }

  return 0;
}

#ifdef CONFIG_ZPLC_HIL_DEBUG
#define HIL_MAX_WATCHES 8
#define HIL_WATCH_POLL_MS 100


typedef struct {
  bool active;
  uint16_t addr;
  hil_watch_type_t type;
  char type_name[6];
  uint32_t last_raw;
  bool has_last;
} hil_watch_entry_t;


static hil_watch_entry_t s_hil_watches[HIL_MAX_WATCHES];
static const struct shell *s_hil_shell;

static void hil_watch_work_handler(struct k_work *work);
static K_WORK_DELAYABLE_DEFINE(s_hil_watch_work, hil_watch_work_handler);
#endif

/**
 * @brief Convert hex string to byte array.
 */
static int hex_decode(const char *hex, uint8_t *out, size_t out_len) {
  /* A character that is not a hex digit is an error: it used to decode as 0x00 and be written. */
  int decoded = zplc_hex_decode(hex, out, out_len);
  return decoded < 0 ? -1 : decoded;
}

/**
 * @brief Get state name as string.
 */
#ifndef CONFIG_ZPLC_SCHEDULER
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
#endif

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

static const char *task_state_name(zplc_task_state_t state) {
  switch (state) {
  case ZPLC_TASK_STATE_IDLE:
    return "idle";
  case ZPLC_TASK_STATE_READY:
    return "ready";
  case ZPLC_TASK_STATE_RUNNING:
    return "running";
  case ZPLC_TASK_STATE_PAUSED:
    return "paused";
  case ZPLC_TASK_STATE_ERROR:
    return "error";
  default:
    return "unknown";
  }
}
#endif

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
 * @brief Sink of the identity formatters: each piece goes to the terminal as it is produced, so the shell thread
 * needs no buffer for an identity that carries every build option (REL-023).
 */
static int identity_to_shell(void *context, const char *text) {
  shell_fprintf((const struct shell *)context, SHELL_NORMAL, "%s", text);
  return 0;
}

/**
 * @brief Handler for 'zplc version'
 *
 * The first line is the one the bench tools match. What follows is what this image is: the commit it was built
 * from, the board, the bytecode ABI and the build options. It used to print the compile date and time, which made
 * two builds of one commit differ (REL-023).
 */
static int cmd_zplc_version(const struct shell *sh, size_t argc, char **argv) {
  const zplc_fw_identity_t identity = zplc_fw_identity();

  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  (void)zplc_fw_identity_emit_text(&identity, identity_to_shell, (void *)sh);
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
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":%d%s", key, (int)(val),              \
                (comma) ? "," : "")
#define JSON_UINT(sh, key, val, comma)                                         \
  shell_fprintf(sh, SHELL_NORMAL, "\"%s\":%u%s", key, (unsigned int)(val),     \
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
#ifdef CONFIG_ZPLC_SCHEDULER
static int cmd_dbg_peek(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_poke(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_ticks(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_mem(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_force_set(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_force_clear(const struct shell *sh, size_t argc, char **argv);
static int cmd_dbg_force_clear_all(const struct shell *sh, size_t argc,
                                   char **argv);
static int cmd_dbg_force_list(const struct shell *sh, size_t argc, char **argv);
#endif
static int cmd_dbg_info(const struct shell *sh, size_t argc, char **argv);
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
static int sched_reset_runtime(const uint8_t *binary, size_t size);
static int sched_latch_ambiguous_program_publication(void);
static int cmd_sys_info(const struct shell *sh, size_t argc, char **argv);
static int cmd_sys_build(const struct shell *sh, size_t argc, char **argv);
static int cmd_sys_io(const struct shell *sh, size_t argc, char **argv);
static int cmd_sys_reset(const struct shell *sh, size_t argc, char **argv);
static int cmd_sys_reboot(const struct shell *sh, size_t argc, char **argv);
#endif

/* ============================================================================
 * Implementation - Command Handlers
 * ============================================================================
 */

/* CMP-052: a refused upload names both draft numbers; 0 is an artifact built
 * before the counter. Studio shows this text with the upload failure. */
static void print_program_refusal(const struct shell *sh, int code,
                                  const uint8_t *binary, size_t size) {
  if (code == ZPLC_LOADER_ERR_DRAFT) {
    uint32_t built = zplc_loader_artifact_draft_counter(binary, size);

    if (built == 0U) {
      shell_error(sh,
                  "ERROR: Program was built for contract draft none, this "
                  "runtime is draft %u (%d)",
                  (unsigned int)ZPLC_DRAFT_COUNTER, code);
    } else {
      shell_error(sh,
                  "ERROR: Program was built for contract draft %u, this "
                  "runtime is draft %u (%d)",
                  (unsigned int)built, (unsigned int)ZPLC_DRAFT_COUNTER, code);
    }
    return;
  }
  shell_error(sh, "ERROR: Program validation failed (%d)", code);
}

#ifdef CONFIG_ZPLC_SCHEDULER

/* ============================================================================
 * Shell Command Handlers - Scheduler Mode
 * ============================================================================
 */

static bool io_unsupported_any(const zplc_io_unsupported_t *u) { return u->inputs != 0U || u->outputs != 0U; }

static int cmd_sched_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);
  zplc_io_unsupported_t io_unsupported;

  zplc_sched_stats_t stats;
  zplc_sched_get_stats(&stats);

  if (json) {
#ifdef CONFIG_ZPLC_SCHEDULER
    zplc_sched_vm_snapshot_t vm;
    bool have_vm = false;
    for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
      zplc_sched_vm_snapshot_t candidate;
      if (zplc_sched_debug_snapshot(i, &candidate) != 0) {
        continue;
      }

      if (candidate.paused != 0U) {
        vm = candidate;
        have_vm = true;
        break;
      }

      if (!have_vm) {
        vm = candidate;
        have_vm = true;
      }
    }
#endif

    JSON_OBJ_START(sh);
    JSON_STR(sh, "state", sched_state_name(zplc_sched_get_state()), true);
    JSON_UINT(sh, "uptime_ms", stats.uptime_ms, true);
    /* RT-014: the miss count, its run, the limit, the last overrun and the reason of a latched fault; RT-021: why
     * the processor was last reset. The same objects the host runtime reports. */
    shell_fprintf(sh, SHELL_NORMAL,
                  "\"deadline\":{\"warning\":%s,\"misses\":%u,\"consecutive_misses\":%u,\"miss_limit\":%u,"
                  "\"last_overrun_us\":%u},",
                  stats.consecutive_misses != 0U ? "true" : "false", (unsigned int)stats.total_overruns,
                  (unsigned int)stats.consecutive_misses, (unsigned int)stats.miss_limit,
                  (unsigned int)stats.last_overrun_us);
    if (stats.fault_reason == (uint8_t)ZPLC_SCHED_FAULT_NONE) {
      shell_fprintf(sh, SHELL_NORMAL, "\"fault\":{\"reason\":\"none\",\"task_id\":null},");
    } else {
      shell_fprintf(sh, SHELL_NORMAL, "\"fault\":{\"reason\":\"%s\",\"task_id\":%u},",
                    zplc_sched_fault_reason_name((zplc_sched_fault_reason_t)stats.fault_reason),
                    (unsigned int)stats.fault_task_id);
    }
    shell_fprintf(sh, SHELL_NORMAL, "\"reset_cause\":\"%s\",",
                  zplc_reset_cause_name(zplc_failsafe_report()->cause));
    /* COM-014: a standing warning, not an event: present for as long as
     * the session is configured to skip the certificate check. */
    zplc_io_unsupported_get(&io_unsupported);
    shell_fprintf(sh, SHELL_NORMAL, "\"warnings\":[%s%s%s],",
                  zplc_config_mqtt_tls_verify_off() ? "\"mqtt_tls_verify_off\"" : "",
                  (zplc_config_mqtt_tls_verify_off() && io_unsupported_any(&io_unsupported)) ? "," : "",
                  io_unsupported_any(&io_unsupported) ? "\"io_unsupported\"" : "");
    /* IO-007: how many channels, next to the warning that names them */
    shell_fprintf(sh, SHELL_NORMAL, "\"io_unsupported\":{\"inputs\":%u,\"outputs\":%u},",
                  (unsigned int)io_unsupported.inputs, (unsigned int)io_unsupported.outputs);
    shell_fprintf(sh, SHELL_NORMAL, "\"stats\":");
    JSON_OBJ_START(sh);
    JSON_UINT(sh, "cycles", stats.total_cycles, true);
    JSON_UINT(sh, "overruns", stats.total_overruns, true);
    JSON_UINT(sh, "active_tasks", stats.active_tasks, false);
    JSON_OBJ_END(sh);

#ifdef CONFIG_ZPLC_SCHEDULER
    if (have_vm) {
      shell_fprintf(sh, SHELL_NORMAL, ",\"vm\":");
      JSON_OBJ_START(sh);
      JSON_UINT(sh, "pc", vm.pc, true);
      JSON_UINT(sh, "sp", vm.sp, true);
      JSON_BOOL(sh, "halted", vm.halted != 0U, true);
      JSON_INT(sh, "error", vm.error, false);
      JSON_OBJ_END(sh);
    }
#endif

#ifdef CONFIG_ZPLC_RETAIN_PERSIST
    {
      zplc_retain_status_t retain;

      zplc_retain_last_status(&retain);
      shell_fprintf(sh, SHELL_NORMAL, ",\"retain\":");
      JSON_OBJ_START(sh);
      JSON_STR(sh, "reason", zplc_retain_reason_string(retain.reason), true);
      JSON_UINT(sh, "sequence", retain.sequence, true);
      JSON_UINT(sh, "saves", retain.saves, true);
      JSON_UINT(sh, "save_errors", retain.save_errors, false);
      JSON_OBJ_END(sh);
    }
#endif

    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  shell_print(sh, "Scheduler Status:");
  shell_print(sh, "  State:      %s", sched_state_name(zplc_sched_get_state()));
  shell_print(sh, "  Uptime:     %u ms", stats.uptime_ms);
  shell_print(sh, "  Tasks:      %u active", stats.active_tasks);
  shell_print(sh, "  Tot Cycles: %u", stats.total_cycles);
  shell_print(sh, "  Tot Ovr:    %u", stats.total_overruns);
  shell_print(sh, "  Deadline:   %s, run %u of %u, last overrun %u us", stats.consecutive_misses != 0U ? "WARNING" : "ok",
              (unsigned int)stats.consecutive_misses, (unsigned int)stats.miss_limit,
              (unsigned int)stats.last_overrun_us);
  shell_print(sh, "  Fault:      %s", zplc_sched_fault_reason_name((zplc_sched_fault_reason_t)stats.fault_reason));
  shell_print(sh, "  Reset:      %s", zplc_reset_cause_name(zplc_failsafe_report()->cause));
  if (zplc_config_mqtt_tls_verify_off()) {
    shell_warn(sh, "  WARNING: MQTT tls-verify: OFF (the broker certificate "
                   "is not checked)");
  }
  zplc_io_unsupported_get(&io_unsupported);
  if (io_unsupported_any(&io_unsupported)) {
    shell_warn(sh, "  WARNING: I/O not supported by this board, skipped: %u input(s), %u output(s)",
               (unsigned int)io_unsupported.inputs, (unsigned int)io_unsupported.outputs);
  }
#ifdef CONFIG_ZPLC_RETAIN_PERSIST
  {
    zplc_retain_status_t retain;

    zplc_retain_last_status(&retain);
    shell_print(sh, "  Retain:     %s (sequence %u, %u saves, %u errors)",
                zplc_retain_reason_string(retain.reason),
                (unsigned int)retain.sequence, (unsigned int)retain.saves,
                (unsigned int)retain.save_errors);
  }
#endif

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
                  task_state_name(task.state));
    }
  }

  return 0;
}

/* The rollback of the commit that ends an upload is found when the upload starts, in the staging buffer, which is
 * free until the first byte of the new program arrives: the store has no buffer of the code size of its own
 * (RT-028). When nothing can be found the commit that follows refuses and writes nothing. */
static void begin_upload_rollback(void) {
  (void)zplc_program_store_prepare(program_staging_buffer, program_buffer_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
}

static int cmd_sched_load(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc sched load <size>");
    return -EINVAL;
  }
  /* A faulted scheduler may accept a replacement upload.  The completed
   * payload is still canonical-verified before persistence and before
   * zplc_sched_load clears the fault latch, so an invalid replacement cannot
   * revive the runtime. */
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
  /* RT-023: a deploy stops the program that is running before it transfers a byte, and the outputs are at their
   * safe values from then until a person starts the new program: the transfer is not made with the old program
   * driving the pins. A runtime that is already stopped or faulted stays as it is. */
  {
    const int stopped = zplc_sched_stop();

    if (stopped != 0) {
      shell_error(sh, "ERROR: Could not stop the program before the transfer (%d)", stopped);
      return stopped;
    }
  }
  begin_upload_rollback();
  memset(program_staging_buffer, 0, program_buffer_size);
  program_expected_size = size;
  program_staging_received_size = 0;
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
  size_t remaining = program_expected_size - program_staging_received_size;
  int decoded = hex_decode(hex, program_staging_buffer + program_staging_received_size,
                           remaining);
  if (decoded < 0) {
    shell_error(sh, "ERROR: Hex decode failed");
    return -EINVAL;
  }
  program_staging_received_size += decoded;
  if (program_staging_received_size >= program_expected_size) {
#ifdef CONFIG_ZPLC_PROTO_SIGNATURE
    {
      uint8_t signing_key[32];

      /* COM-026: while the device holds a public key, a program that nobody signed does not come in by this door */
      if (zplc_hal_persist_load("link_signkey", signing_key, sizeof(signing_key)) == ZPLC_HAL_OK) {
        shell_error(sh, "ERROR: this device accepts only signed programs; send it through the device link");
        program_expected_size = 0;
        program_staging_received_size = 0;
        memset(program_staging_buffer, 0, program_buffer_size);
        return -EACCES;
      }
    }
#endif
    int validation = zplc_sched_validate_program(program_staging_buffer,
                                                 program_staging_received_size);
    if (validation != ZPLC_LOADER_OK) {
      print_program_refusal(sh, validation, program_staging_buffer,
                            program_staging_received_size);
      program_expected_size = 0;
      program_staging_received_size = 0;
      memset(program_staging_buffer, 0, program_buffer_size);
      return validation;
    }
    int store_result = zplc_program_store_commit(
        program_staging_buffer, program_staging_received_size,
        program_buffer_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
    if (store_result != ZPLC_PROGRAM_STORE_COMMIT_OK) {
      if (store_result == ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN) {
        int safe_result = sched_latch_ambiguous_program_publication();
        shell_error(sh,
                    "ERROR: Active publication outcome unknown; scheduler latched safe (%d)",
                    safe_result);
        return -EIO;
      }
      shell_error(sh, "ERROR: Transactional persistence failed");
      program_expected_size = 0;
      program_staging_received_size = 0;
      memset(program_staging_buffer, 0, program_buffer_size);
      return -EIO;
    }
    int ret = sched_reset_runtime(program_staging_buffer,
                                  program_staging_received_size);
    if (ret < 0) {
      shell_error(sh, "ERROR: Scheduler load failed after persistence (%d)", ret);
      program_expected_size = 0;
      program_received_size = 0U; /* nothing is loaded; a reset has nothing to reload */
      return ret;
    }
    /* The staging buffer now holds the loaded artifact and the store holds the same program: the one copy. */
    program_received_size = program_staging_received_size;
    shell_print(sh, "OK: Program loaded (%zu bytes); use 'zplc start' to execute",
                program_received_size);
    program_expected_size = 0;
    program_staging_received_size = 0;
  } else {
    shell_print(sh, "OK: Received %d bytes (%zu/%zu)", decoded,
                program_staging_received_size, program_expected_size);
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

static int sched_reset_runtime(const uint8_t *binary, size_t size) {
  int rc;

  rc = zplc_sched_stop();
  if (rc < 0) {
    return rc;
  }

  rc = sched_clear_registered_tasks();
  if (rc < 0) {
    return rc;
  }

  if (size == 0U) {
    return 0;
  }

  rc = zplc_sched_load(binary, size);
  if (rc < 0) {
    return rc;
  }

  return 0;
}

/* An ambiguous active-pointer write means neither resident program is trusted
 * for this session. The scheduler owns timer/work shutdown; the shell owns
 * the upload and active-program buffers. */
static int sched_latch_ambiguous_program_publication(void) {
  int safe_result = zplc_sched_enter_safe_error();

  memset(program_staging_buffer, 0,
         program_buffer_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  program_expected_size = 0U;
  program_received_size = 0U;
  program_staging_received_size = 0U;
  return safe_result;
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

/* Reset: the loaded program is reloaded from the program store, which is its only resident copy (RT-028). The
 * staging buffer is the one buffer of the code size, so an upload in progress is cancelled. With no program
 * loaded there is nothing to reload: the scheduler is stopped and its tasks cleared, as before. */
static int sched_reset_loaded_program(void) {
  size_t size = 0U;
  int rc;

  program_expected_size = 0U;
  program_staging_received_size = 0U;
  if (program_received_size == 0U) {
    return sched_reset_runtime(NULL, 0U);
  }
  rc = zplc_program_reload_scheduler(program_staging_buffer,
                                     program_buffer_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE,
                                     &size);
  program_received_size = rc > 0 ? size : 0U;
  return rc < 0 ? rc : 0;
}

static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  int rc = sched_reset_loaded_program();
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
    JSON_STR(sh, "board_profile", CONFIG_BOARD_TARGET, true);
    JSON_STR(sh, "zplc_version", zplc_core_version(), true);
    JSON_STR(sh, "zephyr_version", KERNEL_VERSION_STRING, true);
    JSON_UINT(sh, "uptime_ms", k_uptime_get_32(), true);
    JSON_UINT(sh, "cpu_freq_mhz", CPU_FREQ_MHZ, true);
    JSON_UINT(sh, "device_protocol_version", 1U, true);
    JSON_UINT(sh, "bytecode_abi_major", ZPLC_VERSION_MAJOR, true);
    JSON_UINT(sh, "bytecode_abi_minor", ZPLC_VERSION_MINOR, true);
    JSON_UINT(sh, "draft_counter", ZPLC_DRAFT_COUNTER, true);

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
    JSON_INT(sh, "opi_size", ZPLC_MEM_OPI_SIZE, true);
    /* The largest artifact the program store accepts is the configured code size: one value, advertised here,
     * accepted by 'zplc load' and kept by the store (RT-028). */
    JSON_INT(sh, "code_size", ZPLC_MEM_CODE_SIZE, true);
    JSON_INT(sh, "max_artifact_size", (int)ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE, false);
    JSON_OBJ_END(sh);

    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }

  shell_print(sh, "System Information:");
  shell_print(sh, "  Board:          %s", CONFIG_BOARD);
  shell_print(sh, "  ZPLC Version:   %s", zplc_core_version());
  shell_print(sh, "  Contract Draft: %u", (unsigned int)ZPLC_DRAFT_COUNTER);
  shell_print(sh, "  Commit:         %s%s", ZPLC_FW_COMMIT,
              ZPLC_FW_DIRTY != 0 ? " (dirty)" : "");
  shell_print(sh, "  Options Hash:   %s", ZPLC_FW_OPTIONS_HASH);
  shell_print(sh, "  Zephyr Version: %s", KERNEL_VERSION_STRING);
  shell_print(sh, "  Uptime:         %u ms", k_uptime_get_32());
  shell_print(sh, "  CPU Freq:       %u MHz", (unsigned int)CPU_FREQ_MHZ);
  shell_print(sh, "  Memory Sizes:   WORK=%d, RETAIN=%d, IPI=%d, OPI=%d",
              ZPLC_MEM_WORK_SIZE, ZPLC_MEM_RETAIN_SIZE, ZPLC_MEM_IPI_SIZE,
              ZPLC_MEM_OPI_SIZE);
  shell_print(sh, "  Program Size:   CODE=%d, largest artifact=%u bytes",
              ZPLC_MEM_CODE_SIZE, (unsigned int)ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE);
  shell_print(sh, "  I/O table:      %s, %u channels, hash %08x, %u B in, %u B out",
              zplc_io_table()->board_id,
              (unsigned int)zplc_io_table()->channel_count,
              (unsigned int)zplc_io_table()->description_hash,
              (unsigned int)zplc_io_table()->input_bytes,
              (unsigned int)zplc_io_table()->output_bytes);

  return 0;
}

/**
 * @brief Handler for 'zplc sys build [--json]': which firmware image this is (REL-023).
 *
 * A command of its own and not more keys in `sys info --json`: Studio's handshake parser accepts exactly the keys
 * of that object, so a new key would make every released Studio refuse a device that reports it.
 */
static int cmd_sys_build(const struct shell *sh, size_t argc, char **argv) {
  const zplc_fw_identity_t identity = zplc_fw_identity();

  if (argc > 1 && strcmp(argv[1], "--json") == 0) {
    (void)zplc_fw_identity_emit_json(&identity, identity_to_shell, (void *)sh);
    shell_fprintf(sh, SHELL_NORMAL, "\n");
    return 0;
  }
  (void)zplc_fw_identity_emit_text(&identity, identity_to_shell, (void *)sh);
  return 0;
}

/**
 * @brief Handler for 'zplc sys io [--json]': the identity of the board I/O description this image was built from
 * (IO-004).
 *
 * Studio compares the hash with the description it holds for the board before it deploys a program that uses
 * I/O. A command of its own and not a key of `sys info --json`: Studio's handshake parser accepts exactly the
 * keys of that object, so a new key would make every released Studio refuse a device that reports it.
 */
static int cmd_sys_io(const struct shell *sh, size_t argc, char **argv) {
  const zplc_io_table_t *table = zplc_io_table();
  char io_hash[9];

  (void)snprintf(io_hash, sizeof(io_hash), "%08x", (unsigned int)table->description_hash); /* 8 digits always fit */
  if (argc > 1 && strcmp(argv[1], "--json") == 0) {
    JSON_OBJ_START(sh);
    JSON_UINT(sh, "schema", 1U, true);
    JSON_STR(sh, "board_id", table->board_id, true);
    JSON_STR(sh, "hash", io_hash, true);
    JSON_UINT(sh, "channels", table->channel_count, true);
    JSON_UINT(sh, "input_bytes", table->input_bytes, true);
    JSON_UINT(sh, "output_bytes", table->output_bytes, false);
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }
  shell_print(sh, "I/O description: %s, %u channels, hash %s, %u B in, %u B out", table->board_id,
              (unsigned int)table->channel_count, io_hash, (unsigned int)table->input_bytes,
              (unsigned int)table->output_bytes);
  return 0;
}

/**
 * @brief Handler for 'zplc sys reset [--json]': why the processor was last reset and what the previous run left
 * (RT-019, RT-021).
 *
 * The cause is one of power_on, brown_out, pin, software, watchdog, fault or unknown (a part that does not report
 * one). `fault` is the previous run's own record: a processor fault, a stack overflow or a kernel panic that the
 * firmware handled with the outputs driven safe, or a fault the scheduler latched before a watchdog reset. After
 * any reset the runtime is in STOP: `run_policy` says so (D-13). A command of its own and not keys of
 * `sys info --json`: Studio's handshake parser accepts exactly the keys of that object.
 */
static int cmd_sys_reset(const struct shell *sh, size_t argc, char **argv) {
  const zplc_reset_report_t *report = zplc_failsafe_report();
  const char *cause = zplc_reset_cause_name(report->cause);
  char reason[48];

  zplc_fault_record_reason_text(&report->fault, reason, sizeof(reason));
  if (argc > 1 && strcmp(argv[1], "--json") == 0) {
    JSON_OBJ_START(sh);
    JSON_UINT(sh, "schema", 1U, true);
    JSON_STR(sh, "cause", cause, true);
    JSON_BOOL(sh, "reported", report->reported != 0U, true);
    JSON_UINT(sh, "raw", report->raw_bits, true);
    JSON_UINT(sh, "supported", report->supported_bits, true);
    JSON_STR(sh, "run_policy", zplc_reset_may_run(report->cause) != 0 ? "run" : "stop", true);
    JSON_KEY(sh, "fault");
    if (report->has_fault != 0U) {
      JSON_OBJ_START(sh);
      JSON_STR(sh, "kind", report->fault.kind == (uint8_t)ZPLC_FAULT_SCHEDULER ? "scheduler" : "processor", true);
      JSON_STR(sh, "reason", reason, true);
      JSON_UINT(sh, "task_id", report->fault.task_id, true);
      JSON_UINT(sh, "pc", report->fault.pc, true);
      JSON_UINT(sh, "sequence", report->fault.sequence, false);
      JSON_OBJ_END(sh);
    } else {
      shell_fprintf(sh, SHELL_NORMAL, "null");
    }
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }
  shell_print(sh, "Reset cause:  %s%s", cause, report->reported != 0U ? "" : " (this part does not report one)");
  if (report->has_fault != 0U) {
    shell_print(sh, "Last fault:   %s (%s, task %u, pc 0x%08x)", reason,
                report->fault.kind == (uint8_t)ZPLC_FAULT_SCHEDULER ? "scheduler" : "processor",
                (unsigned int)report->fault.task_id, (unsigned int)report->fault.pc);
  } else {
    shell_print(sh, "Last fault:   none recorded");
  }
  shell_print(sh, "Run policy:   %s: the runtime waits in STOP for a person's RUN command",
              zplc_reset_may_run(report->cause) != 0 ? "run" : "stop");
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

  /* The bytes come from the snapshot of the last commit (RT-010), whole, read once. */
  uint8_t data[256];

  if (addr > 0xFFFFU || dbg_read((uint16_t)addr, data, (uint16_t)len) != 0) {
    shell_error(sh, "ERROR: Access out of bounds (address 0x%lX, length %lu)", addr, len);
    return -EINVAL;
  }

  shell_print(sh, "Memory at 0x%04lX (%lu bytes):", addr, len);

  /* Print in rows of 16 bytes */
  for (unsigned long i = 0; i < len; i += 16) {
    char line[80];
    int pos = 0;
    pos += snprintf(line + pos, sizeof(line) - pos, "%04lX: ", addr + i);
    for (unsigned long j = 0; j < 16 && (i + j) < len; j++) {
      pos += snprintf(line + pos, sizeof(line) - pos, "%02X ", data[i + j]);
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

  /* Every entry is read from one snapshot, then printed with no lock held (RT-010, RT-012). */
  static uint8_t mpeek_data[MPEEK_MAX_BYTES];
  size_t mpeek_used = 0U;
  size_t mpeek_offset[MPEEK_MAX_ENTRIES];

  for (int i = 0; i < entry_count; i++) {
    unsigned long addr = entries[i].addr;
    unsigned long len = entries[i].len;

    if (addr > 0xFFFFU || mpeek_used + len > sizeof(mpeek_data) ||
        dbg_read((uint16_t)addr, &mpeek_data[mpeek_used], (uint16_t)len) != 0) {
      shell_error(sh, "ERROR: Invalid address or out-of-bounds at 0x%lX", addr);
      return -EINVAL;
    }
    mpeek_offset[i] = mpeek_used;
    mpeek_used += len;
  }

  /* Emit JSON response */
  shell_print(sh, "{\"t\":\"mpeek\",\"results\":[");

  for (int i = 0; i < entry_count; i++) {
    unsigned long addr = entries[i].addr;
    unsigned long len  = entries[i].len;

    /* Build hex string for the bytes */
    char hex[513]; /* max 256 bytes × 2 hex chars + NUL */
    unsigned int hex_pos = 0;
    for (unsigned long b = 0; b < len; b++) {
      hex_pos += (unsigned int)snprintf(hex + hex_pos, sizeof(hex) - hex_pos,
                                        "%02X", mpeek_data[mpeek_offset[i] + b]);
    }
    hex[hex_pos] = '\0';

    bool last = (i == entry_count - 1);
    shell_print(sh, "{\"addr\":%lu,\"bytes\":\"%s\"}%s",
                addr, hex, last ? "" : ",");
  }

  shell_print(sh, "]}");

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

  uint8_t byte = (uint8_t)value;
  int rc;

  if (addr > 0xFFFFU) {
    shell_error(sh, "ERROR: Invalid memory address");
    return -EINVAL;
  }
#ifdef CONFIG_ZPLC_SCHEDULER
  /* Like every other external write (RT-010): queued whole, applied by the scan at its next input latch through
   * the force-aware interface, at once when no scan is running. */
  rc = zplc_exchange_write((uint16_t)addr, &byte, 1U);
#else
  rc = zplc_force_write_bytes((uint16_t)addr, &byte, 1U);
#endif

  if (rc != 0) {
    shell_error(sh, "ERROR: Invalid memory address");
    return -EINVAL;
  }

  shell_print(sh, "OK: Wrote 0x%02X to 0x%04lX", (uint8_t)value, addr);

  return 0;
}

static int cmd_dbg_force_set(const struct shell *sh, size_t argc, char **argv) {
  char *endptr;
  unsigned long addr;
  int decoded;
  int rc;
  uint8_t bytes[ZPLC_FORCE_MAX_BYTES];

  if (argc != 3) {
    shell_error(sh, "Usage: zplc dbg force set <addr> <hexbytes>");
    return -EINVAL;
  }

  addr = strtoul(argv[1], &endptr, 0);
  if (*endptr != '\0' || addr > UINT16_MAX) {
    shell_error(sh, "ERROR: Invalid address");
    return -EINVAL;
  }

  decoded = hex_decode(argv[2], bytes, sizeof(bytes));
  if (decoded <= 0) {
    shell_error(sh, "ERROR: Invalid hex payload");
    return -EINVAL;
  }

#ifdef CONFIG_ZPLC_SCHEDULER
  if (zplc_sched_lock(5) != 0) {
    shell_error(sh, "ERROR: Could not acquire scheduler lock");
    return -EBUSY;
  }
#endif

  rc = zplc_force_set_bytes((uint16_t)addr, bytes, (uint16_t)decoded);
#ifdef CONFIG_ZPLC_SCHEDULER
  zplc_exchange_publish(); /* a force changes the memory at once; the snapshot follows (RT-010) */
#endif

#ifdef CONFIG_ZPLC_SCHEDULER
  sched_unlock_reported(sh);
#endif

  if (rc == -2) {
    shell_error(sh, "ERROR: Address range out of bounds");
    return rc;
  }
  if (rc == -3) {
    shell_error(sh, "ERROR: Force range overlaps an existing force entry");
    return rc;
  }
  if (rc == -4) {
    shell_error(sh, "ERROR: Force table full");
    return rc;
  }
  if (rc != 0) {
    shell_error(sh, "ERROR: Failed to set force (%d)", rc);
    return rc;
  }

  shell_print(sh, "OK: Forced %d byte(s) at 0x%04lX", decoded, addr);
  return 0;
}

static int cmd_dbg_force_clear(const struct shell *sh, size_t argc, char **argv) {
  char *endptr;
  unsigned long addr;
  int rc;

  if (argc != 2) {
    shell_error(sh, "Usage: zplc dbg force clear <addr>");
    return -EINVAL;
  }

  addr = strtoul(argv[1], &endptr, 0);
  if (*endptr != '\0' || addr > UINT16_MAX) {
    shell_error(sh, "ERROR: Invalid address");
    return -EINVAL;
  }

#ifdef CONFIG_ZPLC_SCHEDULER
  if (zplc_sched_lock(5) != 0) {
    shell_error(sh, "ERROR: Could not acquire scheduler lock");
    return -EBUSY;
  }
#endif

  rc = zplc_force_clear((uint16_t)addr);
#ifdef CONFIG_ZPLC_SCHEDULER
  zplc_exchange_publish();
#endif

#ifdef CONFIG_ZPLC_SCHEDULER
  sched_unlock_reported(sh);
#endif

  if (rc != 0) {
    shell_error(sh, "ERROR: Force entry not found at 0x%04lX", addr);
    return rc;
  }

  shell_print(sh, "OK: Cleared force at 0x%04lX", addr);
  return 0;
}

static int cmd_dbg_force_clear_all(const struct shell *sh, size_t argc,
                                   char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

#ifdef CONFIG_ZPLC_SCHEDULER
  if (zplc_sched_lock(5) != 0) {
    shell_error(sh, "ERROR: Could not acquire scheduler lock");
    return -EBUSY;
  }
#endif

  zplc_force_clear_all();
#ifdef CONFIG_ZPLC_SCHEDULER
  zplc_exchange_publish();
#endif

#ifdef CONFIG_ZPLC_SCHEDULER
  sched_unlock_reported(sh);
#endif

  shell_print(sh, "OK: Cleared all force entries");
  return 0;
}

static int cmd_dbg_force_list(const struct shell *sh, size_t argc, char **argv) {
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);
  uint8_t count;

#ifdef CONFIG_ZPLC_SCHEDULER
  if (zplc_sched_lock(5) != 0) {
    shell_error(sh, "ERROR: Could not acquire scheduler lock");
    return -EBUSY;
  }
#endif

  count = zplc_force_get_count();

  if (json) {
    JSON_OBJ_START(sh);
    JSON_UINT(sh, "count", count, true);
    shell_fprintf(sh, SHELL_NORMAL, "\"items\":[");

    for (uint8_t i = 0; i < count; i++) {
      uint16_t addr = 0;
      uint16_t size = 0;
      uint8_t bytes[ZPLC_FORCE_MAX_BYTES];
      int rc = zplc_force_get(i, &addr, &size, bytes, sizeof(bytes));

      if (rc != 0) {
        continue;
      }

      if (i > 0U) {
        shell_fprintf(sh, SHELL_NORMAL, ",");
      }

      JSON_OBJ_START(sh);
      JSON_UINT(sh, "addr", addr, true);
      JSON_UINT(sh, "size", size, true);
      JSON_KEY(sh, "bytes");
      shell_fprintf(sh, SHELL_NORMAL, "\"");
      for (uint16_t j = 0; j < size; j++) {
        shell_fprintf(sh, SHELL_NORMAL, "%02X", bytes[j]);
      }
      shell_fprintf(sh, SHELL_NORMAL, "\"");
      JSON_OBJ_END(sh);
    }

    shell_fprintf(sh, SHELL_NORMAL, "]");
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);

#ifdef CONFIG_ZPLC_SCHEDULER
    sched_unlock_reported(sh);
#endif
    return 0;
  }

  if (count == 0U) {
#ifdef CONFIG_ZPLC_SCHEDULER
    sched_unlock_reported(sh);
#endif
    shell_print(sh, "No active force entries");
    return 0;
  }

  shell_print(sh, "Active force entries: %u", count);
  for (uint8_t i = 0; i < count; i++) {
    uint16_t addr = 0;
    uint16_t size = 0;
    uint8_t bytes[ZPLC_FORCE_MAX_BYTES];
    int rc = zplc_force_get(i, &addr, &size, bytes, sizeof(bytes));

    if (rc != 0) {
      continue;
    }

    shell_fprintf(sh, SHELL_NORMAL, "  [%u] 0x%04X (%u byte%s): ", i, addr,
                  size, (size == 1U) ? "" : "s");
    for (uint16_t j = 0; j < size; j++) {
      shell_fprintf(sh, SHELL_NORMAL, "%02X", bytes[j]);
    }
    shell_fprintf(sh, SHELL_NORMAL, "\n");
  }

#ifdef CONFIG_ZPLC_SCHEDULER
  sched_unlock_reported(sh);
#endif

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
    uint32_t parsed_offset = 0U;
    if (zplc_parse_uint(argv[2], 0, 0U, UINT32_MAX, &parsed_offset) != 0) {
      shell_error(sh, "ERROR: Offset must be a whole number, got '%s'", argv[2]);
      return -EINVAL;
    }
    offset = parsed_offset;
  }

  if (offset >= region_size) {
    shell_error(sh, "ERROR: Offset out of bounds (0x%04lX >= 0x%04X)", offset,
                region_size);
    return -EINVAL;
  }

  /* The 64 bytes come from the snapshot of the last commit, read once (RT-010). */
  uint8_t window[64];
  size_t window_size = (size_t)(region_size - offset) < sizeof(window) ? (size_t)(region_size - offset)
                                                                       : sizeof(window);

  if (dbg_read((uint16_t)(region_base_addr + offset), window, (uint16_t)window_size) != 0) {
    shell_error(sh, "ERROR: Offset out of bounds (0x%04lX)", offset);
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
                      window[i + j]);
    }

    pos += snprintf(line + pos, sizeof(line) - pos, " | ");

    for (int j = 0; j < 16; j++) {
      if (offset + i + j >= region_size)
        break;
      uint8_t c = window[i + j];
      pos += snprintf(line + pos, sizeof(line) - pos, "%c",
                      isprint(c) ? c : '.');
    }

    shell_print(sh, "%s", line);
  }

  return 0;
}

static int cmd_dbg_pause(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  const int rc = zplc_sched_pause();
  if (rc < 0) {
    shell_warn(sh, "WARN: Not running (state=%s)",
               sched_state_name(zplc_sched_get_state()));
    return 0;
  }

  shell_print(sh, "OK: Scheduler paused");
  return 0;
}

static int cmd_dbg_resume(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  const int rc = zplc_sched_resume();
  if (rc < 0) {
    shell_warn(sh, "WARN: Not paused (state=%s)",
               sched_state_name(zplc_sched_get_state()));
    return 0;
  }

  shell_print(sh, "OK: Scheduler resumed");
  return 0;
}

static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);

  const int rc = zplc_sched_step();
  if (rc == -1) {
    shell_error(sh, "ERROR: Cannot step (state=%s)",
                sched_state_name(zplc_sched_get_state()));
    return rc;
  }
  if (rc == -2) {
    shell_warn(sh, "WARN: No paused or ready tasks to step");
    return 0;
  }

  shell_print(sh, "OK: Scheduler step complete");
  return 0;
}

#else /* Legacy mode implementations */

/* ============================================================================
 * Shell Command Handlers - Legacy Mode
 * ============================================================================
 */

static int cmd_zplc_load(const struct shell *sh, size_t argc, char **argv) {
  bool faulted;

  if (argc != 2) {
    shell_error(sh, "Usage: zplc load <size>");
    return -EINVAL;
  }
  if (legacy_lock_take(sh) != 0) {
    return -EIO;
  }
  faulted = runtime_state == ZPLC_STATE_ERROR;
  k_mutex_unlock(&legacy_runtime_lock);
  if (faulted) {
    shell_error(sh, "ERROR: Runtime faulted; use 'zplc reset' before loading");
    return -EACCES;
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
  begin_upload_rollback();
  memset(program_staging_buffer, 0, program_buffer_size);
  program_expected_size = size;
  program_staging_received_size = 0;
  shell_print(sh, "OK: Ready to receive %lu bytes", size);
  return 0;
}

static int legacy_validate_program(const uint8_t *binary, size_t size,
                                   uint32_t *scan_interval_ms) {
  return zplc_program_admit_legacy(binary, size, program_admission_workspace,
                                   sizeof(program_admission_workspace),
                                   scan_interval_ms);
}

/* Once active publication is ambiguous, a reset must not revive either
 * resident buffer. This helper serializes the legacy execution loop before
 * invalidating both buffers and leaving outputs de-energized. */
static int legacy_latch_ambiguous_program_publication(void) {
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

static int cmd_zplc_data(const struct shell *sh, size_t argc, char **argv) {
  if (argc != 2) {
    shell_error(sh, "Usage: zplc data <hex>");
    return -EINVAL;
  }
  if (program_expected_size == 0U) {
    shell_error(sh, "ERROR: Not in loading state (use 'zplc load' first)");
    return -EINVAL;
  }
  const char *hex = argv[1];
  size_t remaining = program_expected_size - program_staging_received_size;
  int decoded = hex_decode(hex, program_staging_buffer + program_staging_received_size,
                           remaining);
  if (decoded < 0) {
    shell_error(sh, "ERROR: Hex decode failed");
    return -EINVAL;
  }
  program_staging_received_size += decoded;
  if (program_staging_received_size >= program_expected_size) {
    uint32_t new_scan_interval_ms;
    int ret = legacy_validate_program(program_staging_buffer,
                                      program_staging_received_size,
                                      &new_scan_interval_ms);
    if (ret != 0) {
      print_program_refusal(sh, ret, program_staging_buffer,
                            program_staging_received_size);
      program_expected_size = 0;
      program_staging_received_size = 0;
      memset(program_staging_buffer, 0, program_buffer_size);
      return ret;
    }
    int store_result = zplc_program_store_commit(
        program_staging_buffer, program_staging_received_size,
        program_buffer_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
    if (store_result != ZPLC_PROGRAM_STORE_COMMIT_OK) {
      if (store_result == ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN) {
        int safe_result = legacy_latch_ambiguous_program_publication();
        shell_error(sh,
                    "ERROR: Active publication outcome unknown; runtime latched safe (%d)",
                    safe_result);
        return -EIO;
      }
      shell_error(sh, "ERROR: Transactional persistence failed");
      program_expected_size = 0;
      program_staging_received_size = 0;
      memset(program_staging_buffer, 0, program_buffer_size);
      return -EIO;
    }
    if (legacy_lock_take(sh) != 0) {
      program_expected_size = 0;
      program_staging_received_size = 0;
      return -EIO;
    }
    zplc_state_t old_state = runtime_state;
    runtime_state = ZPLC_STATE_IDLE;
    ret = zplc_core_load(program_staging_buffer, program_staging_received_size,
                         program_admission_workspace,
                         sizeof(program_admission_workspace));
    if (ret != ZPLC_LOADER_OK) {
      runtime_state = old_state;
      k_mutex_unlock(&legacy_runtime_lock);
      zplc_legacy_wake();
      shell_error(sh, "ERROR: Verified program load failed after persistence (%d)", ret);
      program_expected_size = 0;
      return ret;
    }
    memcpy(program_buffer, program_staging_buffer, program_staging_received_size);
    program_received_size = program_staging_received_size;
    legacy_scan_interval_ms = new_scan_interval_ms;
    cycle_count = 0;
    step_requested = 0;
    ret = zplc_legacy_apply_safe_outputs_locked();
    runtime_state = ret == 0 ? ZPLC_STATE_READY : ZPLC_STATE_ERROR;
    k_mutex_unlock(&legacy_runtime_lock);
    zplc_legacy_wake();
    if (ret != 0) {
      shell_error(sh, "ERROR: Failed to apply safe outputs (%d)", ret);
      program_expected_size = 0;
      program_staging_received_size = 0;
      return ret;
    }
    shell_print(sh, "OK: Program loaded (%zu bytes)", program_received_size);
    program_expected_size = 0;
    program_staging_received_size = 0;
  } else {
    shell_print(sh, "OK: Received %d bytes (%zu/%zu)", decoded,
                program_staging_received_size, program_expected_size);
  }
  return 0;
}

static int cmd_zplc_start(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  if (legacy_lock_take(sh) != 0) {
    return -EIO;
  }
  if (runtime_state != ZPLC_STATE_READY && runtime_state != ZPLC_STATE_PAUSED) {
    k_mutex_unlock(&legacy_runtime_lock);
    shell_error(sh, "ERROR: Not ready (state=%s)", state_name(runtime_state));
    return -EINVAL;
  }
  if (runtime_state == ZPLC_STATE_READY) {
    cycle_count = 0;
    zplc_vm_t *vm = zplc_core_get_default_vm();
    if (vm) {
      zplc_vm_reset_cycle(vm);
    }
  }
  step_requested = 0;
  runtime_state = ZPLC_STATE_RUNNING;
  k_mutex_unlock(&legacy_runtime_lock);
  zplc_legacy_wake();
  shell_print(sh, "OK: PLC started");
  return 0;
}

static int cmd_zplc_stop(const struct shell *sh, size_t argc, char **argv) {
  bool was_faulted;

  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  if (legacy_lock_take(sh) != 0) {
    return -EIO;
  }
  was_faulted = runtime_state == ZPLC_STATE_ERROR;
  step_requested = 0;
  {
    int ret = zplc_legacy_apply_safe_outputs_locked();
    runtime_state = ret != 0 || was_faulted ? ZPLC_STATE_ERROR : ZPLC_STATE_IDLE;
    k_mutex_unlock(&legacy_runtime_lock);
    zplc_legacy_wake();
    if (ret != 0) {
      shell_error(sh, "ERROR: Failed to apply safe outputs (%d)", ret);
      return ret;
    }
  }
  if (was_faulted) {
    shell_warn(sh, "Runtime remains faulted; reset or load a valid program");
    return 0;
  }
  shell_print(sh, "OK: PLC stopped");
  return 0;
}

static int cmd_zplc_reset(const struct shell *sh, size_t argc, char **argv) {
  int rc;
  uint32_t restored_scan_interval_ms;

  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  if (legacy_lock_take(sh) != 0) {
    return -EIO;
  }
  step_requested = 0;
  runtime_state = ZPLC_STATE_IDLE;
  cycle_count = 0;
  rc = zplc_legacy_apply_safe_outputs_locked();
  if (rc != 0) {
    runtime_state = ZPLC_STATE_ERROR;
    k_mutex_unlock(&legacy_runtime_lock);
    zplc_legacy_wake();
    shell_error(sh, "ERROR: Failed to apply safe outputs (%d)", rc);
    return rc;
  }

  if (program_received_size > 0) {
    rc = legacy_validate_program(program_buffer, program_received_size,
                                 &restored_scan_interval_ms);
    if (rc != ZPLC_LOADER_OK) {
      runtime_state = ZPLC_STATE_ERROR;
      k_mutex_unlock(&legacy_runtime_lock);
      zplc_legacy_wake();
      shell_error(sh, "ERROR: Active program validation failed (%d)", rc);
      return rc;
    }
    rc = zplc_core_load(program_buffer, program_received_size,
                        program_admission_workspace,
                        sizeof(program_admission_workspace));
    if (rc != ZPLC_LOADER_OK) {
      runtime_state = ZPLC_STATE_ERROR;
      k_mutex_unlock(&legacy_runtime_lock);
      zplc_legacy_wake();
      shell_error(sh, "ERROR: Active program load failed (%d)", rc);
      return rc;
    }
    legacy_scan_interval_ms = restored_scan_interval_ms;
    runtime_state = ZPLC_STATE_READY;
    k_mutex_unlock(&legacy_runtime_lock);
  } else {
    int init_result = zplc_core_init();

    if (init_result != 0) {
      runtime_state = ZPLC_STATE_ERROR;
      k_mutex_unlock(&legacy_runtime_lock);
      zplc_legacy_wake();
      shell_error(sh, "ERROR: Core init failed (%d)", init_result);
      return init_result;
    }
    legacy_scan_interval_ms = 100U;
    k_mutex_unlock(&legacy_runtime_lock);
  }
  zplc_legacy_wake();
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
    uint8_t opi[8] = {0U, 0U, 0U, 0U, 0U, 0U, 0U, 0U};
    (void)dbg_read(ZPLC_MEM_OPI_BASE, opi, (uint16_t)sizeof(opi)); /* RT-010: the last commit */
    for (int i = 0; i < 8; i++) {
      shell_fprintf(sh, SHELL_NORMAL, "%u%s", opi[i], (i < 7) ? "," : "");
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
  if (legacy_lock_take(sh) != 0) {
    return -EIO;
  }
  if (runtime_state != ZPLC_STATE_RUNNING) {
    k_mutex_unlock(&legacy_runtime_lock);
    shell_warn(sh, "WARN: Not running (state=%s)", state_name(runtime_state));
    return 0;
  }
  step_requested = 0;
  runtime_state = ZPLC_STATE_PAUSED;
  k_mutex_unlock(&legacy_runtime_lock);
  zplc_legacy_wake();
  shell_print(sh, "OK: Paused at cycle %u", cycle_count);
  return 0;
}

static int cmd_dbg_resume(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  if (legacy_lock_take(sh) != 0) {
    return -EIO;
  }
  if (runtime_state != ZPLC_STATE_PAUSED) {
    k_mutex_unlock(&legacy_runtime_lock);
    shell_warn(sh, "WARN: Not paused (state=%s)", state_name(runtime_state));
    return 0;
  }
  step_requested = 0;
  runtime_state = ZPLC_STATE_RUNNING;
  k_mutex_unlock(&legacy_runtime_lock);
  zplc_legacy_wake();
  shell_print(sh, "OK: Resumed");
  return 0;
}

static int cmd_dbg_step(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  zplc_state_t observed_state;

  if (legacy_lock_take(sh) != 0) {
    return -EIO;
  }
  observed_state = runtime_state;
  k_mutex_unlock(&legacy_runtime_lock);
  if (observed_state == ZPLC_STATE_READY) {
    int rc = legacy_validate_program(program_buffer, program_received_size, NULL);
    if (rc != ZPLC_LOADER_OK) {
      shell_error(sh, "ERROR: Active program validation failed (%d)", rc);
      return rc;
    }
  }
  if (legacy_lock_take(sh) != 0) {
    return -EIO;
  }
  if (runtime_state == ZPLC_STATE_RUNNING) {
    runtime_state = ZPLC_STATE_PAUSED;
  }
  if (runtime_state != ZPLC_STATE_PAUSED && runtime_state != ZPLC_STATE_READY) {
    k_mutex_unlock(&legacy_runtime_lock);
    shell_error(sh, "ERROR: Cannot step (state=%s)", state_name(runtime_state));
    return -EINVAL;
  }
  if (runtime_state == ZPLC_STATE_READY) {
    cycle_count = 0;
    runtime_state = ZPLC_STATE_PAUSED;
  }
  step_requested = 1;
  k_mutex_unlock(&legacy_runtime_lock);
  zplc_legacy_wake();
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
  uint32_t parsed_pc = 0U;
  if (zplc_parse_uint(argv[1], 0, 0U, UINT16_MAX, &parsed_pc) != 0) {
    shell_error(sh, "ERROR: <pc> must be a whole number from 0 to %u, got '%s'", (unsigned)UINT16_MAX, argv[1]);
    return -EINVAL;
  }
  uint16_t pc = (uint16_t)parsed_pc;
  int last_err = 0;
  bool found = false;

#ifdef CONFIG_ZPLC_SCHEDULER
  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    zplc_sched_vm_snapshot_t snapshot;
    if (zplc_sched_debug_snapshot(i, &snapshot) == 0) {
      found = true;
      int ret = zplc_sched_debug_add_breakpoint(i, pc);
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
  uint32_t parsed_pc = 0U;
  if (zplc_parse_uint(argv[1], 0, 0U, UINT16_MAX, &parsed_pc) != 0) {
    shell_error(sh, "ERROR: <pc> must be a whole number from 0 to %u, got '%s'", (unsigned)UINT16_MAX, argv[1]);
    return -EINVAL;
  }
  uint16_t pc = (uint16_t)parsed_pc;
  int last_err = 0;
  bool found = false;

#ifdef CONFIG_ZPLC_SCHEDULER
  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    zplc_sched_vm_snapshot_t snapshot;
    if (zplc_sched_debug_snapshot(i, &snapshot) == 0) {
      found = true;
      int ret = zplc_sched_debug_remove_breakpoint(i, pc);
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
    zplc_sched_vm_snapshot_t snapshot;
    if (zplc_sched_debug_snapshot(i, &snapshot) == 0) {
      found = true;
      (void)zplc_sched_debug_clear_breakpoints(i);
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
#ifdef CONFIG_ZPLC_SCHEDULER
  zplc_sched_vm_snapshot_t snapshot;
  bool have_snapshot = false;
#else
  zplc_vm_t *vm = NULL;
#endif

#ifdef CONFIG_ZPLC_SCHEDULER
  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    if (zplc_sched_debug_snapshot(i, &snapshot) == 0) {
      have_snapshot = true;
      break;
    }
  }
#else
  vm = zplc_core_get_default_vm();
#endif

  if (
#ifdef CONFIG_ZPLC_SCHEDULER
      !have_snapshot
#else
      !vm
#endif
  ) {
    hil_send_ack("bp", "list", false, "no VM active");
    return 0;
  }

  uint8_t count =
#ifdef CONFIG_ZPLC_SCHEDULER
      snapshot.breakpoint_count;
#else
      zplc_vm_get_breakpoint_count(vm);
#endif
  shell_fprintf(sh, SHELL_NORMAL, "{\"t\":\"ack\",\"cmd\":\"bp\",\"val\":\"list\",\"bps\":[");
  for (uint8_t i = 0; i < count; i++) {
    shell_fprintf(sh, SHELL_NORMAL, "%u%s",
#ifdef CONFIG_ZPLC_SCHEDULER
                  snapshot.breakpoints[i],
#else
                  zplc_vm_get_breakpoint(vm, i),
#endif
                  (i < count - 1) ? "," : "");
  }
  shell_fprintf(sh, SHELL_NORMAL, "],\"ok\":true}\n");

  return 0;
}

static int cmd_dbg_info(const struct shell *sh, size_t argc, char **argv) {
  bool json = (argc > 1 && strcmp(argv[1], "--json") == 0);
#ifdef CONFIG_ZPLC_SCHEDULER
  zplc_sched_stats_t stats;
  zplc_sched_vm_snapshot_t vm;
  bool have_vm = false;
  int paused_task_id = -1;
  zplc_sched_get_stats(&stats);

  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    zplc_sched_vm_snapshot_t candidate;
    if (zplc_sched_debug_snapshot(i, &candidate) != 0) {
      continue;
    }

    if (candidate.paused != 0U) {
      vm = candidate;
      have_vm = true;
      paused_task_id = i;
      break;
    }

    if (!have_vm) {
      vm = candidate;
      have_vm = true;
      paused_task_id = i;
    }
  }

  if (json) {
    JSON_OBJ_START(sh);
    JSON_STR(sh, "state", sched_state_name(zplc_sched_get_state()), true);
    JSON_UINT(sh, "uptime_ms", stats.uptime_ms, true);
    JSON_UINT(sh, "cycles", stats.total_cycles, true);
    JSON_INT(sh, "active_tasks", stats.active_tasks, true);
    if (have_vm) {
      JSON_UINT(sh, "pc", vm.pc, true);
      JSON_UINT(sh, "sp", vm.sp, true);
      JSON_BOOL(sh, "halted", vm.halted != 0U, true);
      JSON_INT(sh, "error", vm.error, true);
      JSON_INT(sh, "task_id", paused_task_id, false);
    } else {
      JSON_UINT(sh, "pc", 0, true);
      JSON_UINT(sh, "sp", 0, true);
      JSON_BOOL(sh, "halted", false, true);
      JSON_INT(sh, "error", 0, true);
      JSON_INT(sh, "task_id", -1, false);
    }
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }
  shell_print(sh, "VM Info (Scheduler Mode):");
  shell_print(sh, "  State:  %s", sched_state_name(zplc_sched_get_state()));
  shell_print(sh, "  Uptime: %u ms", stats.uptime_ms);
  shell_print(sh, "  Cycles: %u", stats.total_cycles);
  shell_print(sh, "  Tasks:  %u", stats.active_tasks);
  if (have_vm) {
    shell_print(sh, "  VM:     PC=%04X, SP=%d, Halted=%s, Error=%d, Task=%d",
                vm.pc, vm.sp, vm.paused != 0U ? "YES" : "NO",
                vm.error, paused_task_id);
  }
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
  uint32_t parsed_id = 0U;
  if (zplc_parse_uint(argv[1], 10, 0U, 65535U, &parsed_id) != 0) {
    shell_error(sh, "ERROR: <id> must be a whole number, got '%s'", argv[1]);
    return -EINVAL;
  }
  int id = (int)parsed_id;
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
    JSON_STR(sh, "state", task_state_name(task.state), true);
    JSON_UINT(sh, "cycles", task.stats.cycle_count, true);
    JSON_UINT(sh, "overruns", task.stats.overrun_count, true);
    JSON_UINT(sh, "interval", task.config.interval_us, false);
    JSON_OBJ_END(sh);
    JSON_NEWLINE(sh);
    return 0;
  }
  shell_print(sh, "Task %d Info:", id);
  shell_print(sh, "  State:    %s", task_state_name(task.state));
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

/**
 * @brief `zplc dbg watch <addr> [type]`: one typed read of PLC memory.
 *
 * The shell has no stream to push changes on; Studio polls this, or reads
 * through mpeek. The value is printed in the type the caller names (default
 * u8) from IPI, OPI, WORK or RETAIN, and an address outside them is refused.
 */
static int cmd_dbg_watch(const struct shell *sh, size_t argc, char **argv) {
  hil_watch_type_t type = HIL_WATCH_U8;
  hil_watch_value_t value;
  const char *type_name = "u8";
  unsigned long addr;
  size_t width = 1U;
  char *endptr;
  int rc;

  if (argc < 2 || argc > 3) {
    shell_error(sh, "Usage: zplc dbg watch <addr> [bool|i8|i16|i32|u8|u16|u32|f32]");
    return -EINVAL;
  }
  addr = strtoul(argv[1], &endptr, 0);
  if (*argv[1] == '\0' || *endptr != '\0' || addr > UINT16_MAX) {
    shell_error(sh, "ERROR: Invalid address");
    return -EINVAL;
  }
  if (argc == 3) {
    type_name = argv[2];
    if (hil_parse_watch_type(type_name, &type, &width) != 0) {
      shell_error(sh, "ERROR: Unknown type '%s'", type_name);
      return -EINVAL;
    }
  }

  /* From the snapshot of the exchange: whole values, no lock held while the text is printed (RT-010). */
  rc = hil_read_watch_value((uint16_t)addr, type, &value);
  if (rc != 0) {
    shell_error(sh, "ERROR: 0x%04lX (%u bytes) is not inside a PLC memory region",
                addr, (unsigned)width);
    return -ERANGE;
  }

  switch (type) {
  case HIL_WATCH_BOOL:
    shell_print(sh, "0x%04lX bool = %s", addr, value.bool_val ? "true" : "false");
    break;
  case HIL_WATCH_I8:
  case HIL_WATCH_I16:
  case HIL_WATCH_I32:
    shell_print(sh, "0x%04lX %s = %d", addr, type_name, (int)value.i32_val);
    break;
  case HIL_WATCH_F32:
    shell_print(sh, "0x%04lX f32 = %.6g", addr, (double)value.f32_val);
    break;
  default:
    shell_print(sh, "0x%04lX %s = %u", addr, type_name,
                (unsigned int)value.u32_val);
    break;
  }
  return 0;
}

/* The TON, TOF and TP instance layout (packages/zplc-compiler stdlib
 * timers.ts): IN +0, Q +1, PT +2 (TIME, 4 bytes), ET +6, running +14. */
#define TIMER_INSTANCE_BYTES 16U

/**
 * @brief `zplc dbg timer <addr>`: the state of one timer instance.
 */
static int cmd_dbg_timer(const struct shell *sh, size_t argc, char **argv) {
  uint8_t raw[TIMER_INSTANCE_BYTES];
  uint32_t pt = 0U;
  uint32_t et = 0U;
  uint8_t in = 0U;
  uint8_t q = 0U;
  uint8_t running = 0U;
  unsigned long addr;
  char *endptr;
  int rc;

  if (argc != 2) {
    shell_error(sh, "Usage: zplc dbg timer <addr>");
    return -EINVAL;
  }
  addr = strtoul(argv[1], &endptr, 0);
  if (*argv[1] == '\0' || *endptr != '\0' || addr > UINT16_MAX) {
    shell_error(sh, "ERROR: Invalid address");
    return -EINVAL;
  }

  /* One read of the whole instance from the snapshot, so IN, Q, PT and ET are of one scan. */
  rc = dbg_read((uint16_t)addr, raw, TIMER_INSTANCE_BYTES);
  if (rc == 0) {
    in = raw[0];
    q = raw[1];
    memcpy(&pt, &raw[2], sizeof(pt));
    memcpy(&et, &raw[6], sizeof(et));
    running = raw[14];
  }
  if (rc != 0) {
    shell_error(sh, "ERROR: 0x%04lX (%u bytes) is not inside a PLC memory region",
                addr, (unsigned)TIMER_INSTANCE_BYTES);
    return -ERANGE;
  }

  shell_print(sh, "Timer at 0x%04lX: IN=%u Q=%u PT=%u ms ET=%u ms running=%u",
              addr, (unsigned)(in != 0U), (unsigned)(q != 0U),
              (unsigned)pt, (unsigned)et, (unsigned)(running != 0U));
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
  uint32_t parsed_channel = 0U;
  if (zplc_parse_uint(argv[1], 10, 0U, 65535U, &parsed_channel) != 0) {
    shell_error(sh, "ERROR: <channel> must be a whole number, got '%s'", argv[1]);
    return -EINVAL;
  }
  int ch = (int)parsed_channel;
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
  zplc_sched_vm_snapshot_t vm;
  uint16_t pc = 0;
  uint16_t sp = 0;
  int rc = zplc_sched_get_stats(&stats);
  if (rc != 0) {
    hil_send_ack("status", "", false, "stats unavailable");
    return rc;
  }

  for (int i = 0; i < CONFIG_ZPLC_MAX_TASKS; i++) {
    if (zplc_sched_debug_snapshot(i, &vm) == 0) {
      pc = vm.pc;
      sp = vm.sp;
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
    uint8_t probe[8];

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

    /* The extent has to lie inside PLC memory; the watch itself reads the snapshot (RT-010). */
    if (width > sizeof(probe) ||
        dbg_read((uint16_t)parsed_addr, probe, (uint16_t)width) != 0) {
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
  rc = sched_reset_loaded_program();
#else
  rc = cmd_zplc_reset(sh, 0, NULL);
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

/** What `config get` shows for a credential: that it is set, never what it is. */
static const char *secret_state(const char *value) {
  return (value[0] != '\0') ? "(set)" : "(not set)";
}

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

  zplc_config_get_wifi_ssid(buf, sizeof(buf));
  shell_print(sh, "  WiFi SSID:    %s", (buf[0] != '\0') ? buf : "(none)");
  shell_print(sh, "  WiFi Security: %u", (unsigned)zplc_config_get_wifi_security());
  /* COM-015: a credential is reported as set or not set, never printed. */
  zplc_config_get_wifi_pass(buf, sizeof(buf));
  shell_print(sh, "  WiFi Password: %s", secret_state(buf));
  
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
  shell_print(sh, "  MQTT Username: %s", secret_state(buf));
  zplc_config_get_mqtt_password(buf, sizeof(buf));
  shell_print(sh, "  MQTT Password: %s", secret_state(buf));

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
  zplc_config_get_azure_sas_key(buf, sizeof(buf));
  shell_print(sh, "  Azure SAS Key: %s", secret_state(buf));
  shell_print(sh, "  Azure SAS Expiry: %u s", (unsigned)zplc_config_get_azure_sas_expiry_s());
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

/* The keys of `zplc config set`: how the value is read, and the setter of zplc_config.c that stores it. One row per
 * key, so that the command is a lookup and the setters keep their own rules (azure_sas_expiry_s clamps, the text
 * setters truncate). The value of a flag is not read the same way by every key: dhcp is true for "true" and "1",
 * the others also for "on", and any other text is false without an error. */
typedef enum {
  CONFIG_KEY_TEXT,
  CONFIG_KEY_CREDENTIAL_PATH,
  CONFIG_KEY_FLAG,
  CONFIG_KEY_FLAG_ON,
  CONFIG_KEY_U8,
  CONFIG_KEY_U16,
  CONFIG_KEY_U32,
  CONFIG_KEY_PARITY,
  CONFIG_KEY_PROFILE,
  CONFIG_KEY_PROTOCOL,
  CONFIG_KEY_TRANSPORT,
  CONFIG_KEY_QOS,
  CONFIG_KEY_SECURITY,
} config_key_kind_t;

union config_setter {
  void (*text)(const char *);
  int (*credential)(const char *);
  void (*flag)(bool);
  void (*u8)(uint8_t);
  void (*u16)(uint16_t);
  void (*u32)(uint32_t);
  void (*parity)(zplc_modbus_parity_t);
  void (*profile)(zplc_mqtt_profile_t);
  void (*protocol)(zplc_mqtt_protocol_t);
  void (*transport)(zplc_mqtt_transport_t);
  void (*qos)(zplc_mqtt_qos_t);
  void (*security)(zplc_mqtt_security_t);
};

/* name, how the value is read, the member of the union and the setter. Three parallel arrays are made from it: one
 * row of a structure would take twelve bytes for nine of data. */
#define CONFIG_KEYS(X) \
  X("hostname", CONFIG_KEY_TEXT, text, zplc_config_set_hostname) \
  X("dhcp", CONFIG_KEY_FLAG, flag, zplc_config_set_dhcp) \
  X("ip", CONFIG_KEY_TEXT, text, zplc_config_set_ip) \
  X("wifi_ssid", CONFIG_KEY_TEXT, text, zplc_config_set_wifi_ssid) \
  X("wifi_pass", CONFIG_KEY_TEXT, text, zplc_config_set_wifi_pass) \
  X("wifi_security", CONFIG_KEY_U8, u8, zplc_config_set_wifi_security) \
  X("ntp_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_ntp_enabled) \
  X("ntp_server", CONFIG_KEY_TEXT, text, zplc_config_set_ntp_server) \
  X("modbus_id", CONFIG_KEY_U16, u16, zplc_config_set_modbus_id) \
  X("modbus_tcp_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_modbus_tcp_enabled) \
  X("modbus_tcp_port", CONFIG_KEY_U16, u16, zplc_config_set_modbus_tcp_port) \
  X("modbus_rtu_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_modbus_rtu_enabled) \
  X("modbus_rtu_baud", CONFIG_KEY_U32, u32, zplc_config_set_modbus_rtu_baud) \
  X("modbus_rtu_parity", CONFIG_KEY_PARITY, parity, zplc_config_set_modbus_rtu_parity) \
  X("modbus_rtu_client_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_modbus_rtu_client_enabled) \
  X("modbus_rtu_client_slave_id", CONFIG_KEY_U8, u8, zplc_config_set_modbus_rtu_client_slave_id) \
  X("modbus_rtu_client_poll_ms", CONFIG_KEY_U32, u32, zplc_config_set_modbus_rtu_client_poll_ms) \
  X("modbus_tcp_client_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_modbus_tcp_client_enabled) \
  X("modbus_tcp_client_host", CONFIG_KEY_TEXT, text, zplc_config_set_modbus_tcp_client_host) \
  X("modbus_tcp_client_port", CONFIG_KEY_U16, u16, zplc_config_set_modbus_tcp_client_port) \
  X("modbus_tcp_client_unit_id", CONFIG_KEY_U8, u8, zplc_config_set_modbus_tcp_client_unit_id) \
  X("modbus_tcp_client_poll_ms", CONFIG_KEY_U32, u32, zplc_config_set_modbus_tcp_client_poll_ms) \
  X("modbus_tcp_client_timeout_ms", CONFIG_KEY_U32, u32, zplc_config_set_modbus_tcp_client_timeout_ms) \
  X("mqtt_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_mqtt_enabled) \
  X("mqtt_broker", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_broker) \
  X("mqtt_client_id", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_client_id) \
  X("mqtt_group_id", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_group_id) \
  X("mqtt_topic_namespace", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_topic_namespace) \
  X("mqtt_profile", CONFIG_KEY_PROFILE, profile, zplc_config_set_mqtt_profile) \
  X("mqtt_protocol", CONFIG_KEY_PROTOCOL, protocol, zplc_config_set_mqtt_protocol) \
  X("mqtt_transport", CONFIG_KEY_TRANSPORT, transport, zplc_config_set_mqtt_transport) \
  X("mqtt_port", CONFIG_KEY_U16, u16, zplc_config_set_mqtt_port) \
  X("mqtt_username", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_username) \
  X("mqtt_password", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_password) \
  X("mqtt_keepalive", CONFIG_KEY_U16, u16, zplc_config_set_mqtt_keepalive_sec) \
  X("mqtt_publish_interval", CONFIG_KEY_U32, u32, zplc_config_set_mqtt_publish_interval_ms) \
  X("mqtt_publish_qos", CONFIG_KEY_QOS, qos, zplc_config_set_mqtt_publish_qos) \
  X("mqtt_subscribe_qos", CONFIG_KEY_QOS, qos, zplc_config_set_mqtt_subscribe_qos) \
  X("mqtt_publish_retain", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_mqtt_publish_retain) \
  X("mqtt_clean_session", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_mqtt_clean_session) \
  X("mqtt_session_expiry", CONFIG_KEY_U32, u32, zplc_config_set_mqtt_session_expiry_sec) \
  X("mqtt_security", CONFIG_KEY_SECURITY, security, zplc_config_set_mqtt_security) \
  X("mqtt_websocket_path", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_websocket_path) \
  X("mqtt_alpn", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_alpn) \
  X("mqtt_lwt_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_mqtt_lwt_enabled) \
  X("mqtt_lwt_topic", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_lwt_topic) \
  X("mqtt_lwt_payload", CONFIG_KEY_TEXT, text, zplc_config_set_mqtt_lwt_payload) \
  X("mqtt_lwt_qos", CONFIG_KEY_QOS, qos, zplc_config_set_mqtt_lwt_qos) \
  X("mqtt_lwt_retain", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_mqtt_lwt_retain) \
  X("mqtt_ca_cert_path", CONFIG_KEY_CREDENTIAL_PATH, credential, zplc_config_set_mqtt_ca_cert_path) \
  X("mqtt_client_cert_path", CONFIG_KEY_CREDENTIAL_PATH, credential, zplc_config_set_mqtt_client_cert_path) \
  X("mqtt_client_key_path", CONFIG_KEY_CREDENTIAL_PATH, credential, zplc_config_set_mqtt_client_key_path) \
  X("azure_sas_key", CONFIG_KEY_TEXT, text, zplc_config_set_azure_sas_key) \
  X("azure_sas_expiry_s", CONFIG_KEY_U32, u32, zplc_config_set_azure_sas_expiry_s) \
  X("azure_twin_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_azure_twin_enabled) \
  X("azure_direct_methods_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_azure_direct_methods_enabled) \
  X("azure_c2d_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_azure_c2d_enabled) \
  X("azure_dps_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_azure_dps_enabled) \
  X("azure_dps_id_scope", CONFIG_KEY_TEXT, text, zplc_config_set_azure_dps_id_scope) \
  X("azure_dps_registration_id", CONFIG_KEY_TEXT, text, zplc_config_set_azure_dps_registration_id) \
  X("azure_dps_endpoint", CONFIG_KEY_TEXT, text, zplc_config_set_azure_dps_endpoint) \
  X("azure_event_grid_topic", CONFIG_KEY_TEXT, text, zplc_config_set_azure_event_grid_topic) \
  X("azure_event_grid_source", CONFIG_KEY_TEXT, text, zplc_config_set_azure_event_grid_source) \
  X("azure_event_grid_event_type", CONFIG_KEY_TEXT, text, zplc_config_set_azure_event_grid_event_type) \
  X("aws_shadow_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_aws_shadow_enabled) \
  X("aws_jobs_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_aws_jobs_enabled) \
  X("aws_fleet_enabled", CONFIG_KEY_FLAG_ON, flag, zplc_config_set_aws_fleet_enabled) \
  X("aws_fleet_template_name", CONFIG_KEY_TEXT, text, zplc_config_set_aws_fleet_template_name) \
  X("aws_claim_cert_path", CONFIG_KEY_CREDENTIAL_PATH, credential, zplc_config_set_aws_claim_cert_path) \
  X("aws_claim_key_path", CONFIG_KEY_CREDENTIAL_PATH, credential, zplc_config_set_aws_claim_key_path)

#define CONFIG_KEY_NAME(name, kind, member, setter) name,
#define CONFIG_KEY_KIND(name, kind, member, setter) (uint8_t)kind,
#define CONFIG_KEY_SETTER(name, kind, member, setter) {.member = setter},

static const char *const config_key_names[] = {CONFIG_KEYS(CONFIG_KEY_NAME)};
static const uint8_t config_key_kinds[] = {CONFIG_KEYS(CONFIG_KEY_KIND)};
static const union config_setter config_key_setters[] = {CONFIG_KEYS(CONFIG_KEY_SETTER)};

static int cmd_config_set(const struct shell *sh, size_t argc, char **argv) {
  /* The shell asks for the key and the value (SHELL_CMD_ARG, 3 mandatory) before it calls this: the check guards a
   * direct call, and the keys are the table above. */
  if (argc < 3) {
    shell_error(sh, "ERROR: Usage: zplc config set <key> <value>");
    return -EINVAL;
  }

  const char *key = argv[1];
  const char *val = argv[2];
  uint32_t number = 0U;

  /* A key that takes a number is parsed and range-checked before anything is stored: port 70000 used to become
   * 4464 through atoi() and a uint16_t cast, and "abc" became 0. */
  int number_rc = zplc_config_parse_number(key, val, &number);
  if (number_rc == -ERANGE || number_rc == -EINVAL) {
    uint32_t max = 0U;
    (void)zplc_config_number_max(key, &max);
    if (number_rc == -ERANGE) {
      shell_error(sh, "ERROR: %s must be a whole number from 0 to %u, got '%s'", key, (unsigned)max, val);
    } else {
      shell_error(sh, "ERROR: %s must be a whole decimal number, got '%s'", key, val);
    }
    return -EINVAL;
  }

  size_t entry = 0U;
  while (entry < ARRAY_SIZE(config_key_names) && strcmp(key, config_key_names[entry]) != 0) {
    entry++;
  }
  if (entry == ARRAY_SIZE(config_key_names)) {
    shell_error(sh, "ERROR: Unknown config key: %s", key);
    return -EINVAL;
  }
  const union config_setter *set = &config_key_setters[entry];

  switch (config_key_kinds[entry]) {
  case CONFIG_KEY_TEXT:
    set->text(val);
    break;
  case CONFIG_KEY_CREDENTIAL_PATH:
    /* IO-008: a certificate or key path is a file, or a credential record of the store; no other record. */
    if (set->credential(val) != 0) {
      shell_error(sh, "ERROR: %s must be a file path, persist://aws_cert_pem or persist://aws_key_pem, got '%s'",
                  key, val);
      return -EINVAL;
    }
    break;
  case CONFIG_KEY_FLAG_ON:
    set->flag(strcmp(val, "true") == 0 || strcmp(val, "1") == 0 || strcmp(val, "on") == 0);
    break;
  case CONFIG_KEY_FLAG:
    set->flag(strcmp(val, "true") == 0 || strcmp(val, "1") == 0);
    break;
  case CONFIG_KEY_U8:
    set->u8((uint8_t)number);
    break;
  case CONFIG_KEY_U16:
    set->u16((uint16_t)number);
    break;
  case CONFIG_KEY_U32:
    set->u32(number);
    break;
  case CONFIG_KEY_PARITY:
    set->parity((zplc_modbus_parity_t)number);
    break;
  case CONFIG_KEY_PROFILE:
    set->profile((zplc_mqtt_profile_t)number);
    break;
  case CONFIG_KEY_PROTOCOL:
    set->protocol((zplc_mqtt_protocol_t)number);
    break;
  case CONFIG_KEY_TRANSPORT:
    set->transport((zplc_mqtt_transport_t)number);
    break;
  case CONFIG_KEY_QOS:
    set->qos((zplc_mqtt_qos_t)number);
    break;
  case CONFIG_KEY_SECURITY:
    if (number == (uint32_t)ZPLC_MQTT_SECURITY_TLS_NO_VERIFY) {
#if defined(CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS)
      /* COM-014: the opt-in is explicit, and it is not silent. */
      shell_warn(sh, "WARNING: TLS certificate verification is OFF; "
                     "the broker is not authenticated. "
                     "'zplc mqtt status' shows tls-verify: OFF.");
#else
      shell_error(sh, "ERROR: this firmware cannot turn TLS certificate "
                      "verification off (CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS "
                      "is not set)");
      return -EPERM;
#endif
    }
    set->security((zplc_mqtt_security_t)number);
    break;
  default:
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
  int err = zplc_config_reset();
  if (err) {
    /* The defaults are in memory; they are not stored (COM-027). */
    shell_error(sh, "ERROR: Config reset in memory but not saved: %d", err);
    return err;
  }
  shell_print(sh, "OK: Config reset and saved");
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

#if defined(CONFIG_FILE_SYSTEM)
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

  uint32_t parsed_size = 0U;
  if (zplc_parse_uint(argv[2], 10, 1U, CERT_STAGING_MAX_BYTES, &parsed_size) != 0) {
    shell_error(sh, "ERROR: Invalid size '%s' (1..%u)", argv[2], CERT_STAGING_MAX_BYTES);
    return -EINVAL;
  }
  unsigned long size = parsed_size;

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
#else
static int cmd_cert_begin(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_error(sh, "ERROR: File system support not enabled in this build");
  return -ENOTSUP;
}

static int cmd_cert_chunk(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_error(sh, "ERROR: File system support not enabled in this build");
  return -ENOTSUP;
}

static int cmd_cert_commit(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_error(sh, "ERROR: File system support not enabled in this build");
  return -ENOTSUP;
}

static int cmd_cert_erase(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_error(sh, "ERROR: File system support not enabled in this build");
  return -ENOTSUP;
}

static int cmd_cert_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  shell_error(sh, "ERROR: File system support not enabled in this build");
  return -ENOTSUP;
}
#endif

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
  if (tag != NULL && zplc_config_get_modbus_tag_override(
                         index, comm_modbus_width(tag->var_type), &addr)) {
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
      JSON_BOOL(sh, "override", tag ? zplc_config_get_modbus_tag_override(
          i, comm_modbus_width(tag->var_type), NULL) : false, false);
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
      bool has_override = zplc_config_get_modbus_tag_override(
          i, comm_modbus_width(tag->var_type), NULL);
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

static int comm_parse_u32(const char *text, uint32_t *out)
{
  char *end = NULL;
  unsigned long value;

  if (text == NULL || *text == '\0' || *text == '-') {
    return -EINVAL;
  }
  errno = 0;
  value = strtoul(text, &end, 10);
  if (errno == ERANGE || end == text || *end != '\0' || value > UINT32_MAX) {
    return -ERANGE;
  }
  *out = (uint32_t)value;
  return 0;
}

static bool comm_modbus_endpoint_valid(uint32_t address, uint16_t width)
{
  return width != 0U && address <= UINT16_MAX &&
         width - 1U <= UINT16_MAX - address;
}

static int cmd_comm_set(const struct shell *sh, size_t argc, char **argv)
{
  if (argc != 4) {
    shell_error(sh, "ERROR: Usage: zplc comm set modbus <index> <address>");
    return -EINVAL;
  }

  if (strcmp(argv[1], "modbus") != 0) {
    shell_error(sh, "ERROR: Only modbus overrides are supported");
    return -EINVAL;
  }

  uint32_t parsed_index;
  uint32_t address;
  int err = comm_parse_u32(argv[2], &parsed_index);
  if (err < 0) {
    shell_error(sh, "ERROR: Index and address must be unsigned decimal values in range");
    return err;
  }
  if (parsed_index > UINT16_MAX) {
    shell_error(sh, "ERROR: Index and address must be unsigned decimal values in range");
    return -ERANGE;
  }
  err = comm_parse_u32(argv[3], &address);
  if (err < 0) {
    shell_error(sh, "ERROR: Index and address must be unsigned decimal values in range");
    return err;
  }
  uint16_t index = (uint16_t)parsed_index;
  const zplc_tag_entry_t *tag = zplc_core_get_tag(index);
  if (!tag || tag->tag_id != ZPLC_TAG_MODBUS) {
    shell_error(sh, "ERROR: Tag index %u is not a Modbus binding", index);
    return -EINVAL;
  }

  uint16_t width = comm_modbus_width(tag->var_type);
  if (!comm_modbus_endpoint_valid(address, width)) {
    shell_error(sh, "ERROR: Modbus server mapping exceeds address 65535");
    return -ERANGE;
  }

  for (uint16_t i = 0U; i < zplc_core_get_tag_count(); i++) {
    const zplc_tag_entry_t *other = zplc_core_get_tag(i);
    if (!other || other->tag_id != ZPLC_TAG_MODBUS || i == index) {
      continue;
    }

    uint32_t other_start = comm_effective_modbus_addr(i, other);
    uint16_t other_width = comm_modbus_width(other->var_type);
    if (!comm_modbus_endpoint_valid(other_start, other_width)) {
      shell_error(sh, "ERROR: Existing Modbus server mapping for tag %u is invalid", i);
      return -ERANGE;
    }
    uint32_t other_end = other_start + other_width - 1U;
    uint32_t new_end = address + width - 1U;
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

  err = zplc_config_set_modbus_tag_override(index, address, width);
  if (err < 0) {
    shell_error(sh, "ERROR: Failed to set override (%d)", err);
    return err;
  }

  shell_print(sh, "OK: Modbus server mapping for tag %u remapped to %lu",
              index, (unsigned long)address);
  return 0;
}

static int cmd_comm_clear(const struct shell *sh, size_t argc, char **argv)
{
  if (argc != 3) {
    shell_error(sh, "ERROR: Usage: zplc comm clear modbus <index>");
    return -EINVAL;
  }

  if (strcmp(argv[1], "modbus") != 0) {
    shell_error(sh, "ERROR: Only modbus overrides are supported");
    return -EINVAL;
  }

  uint32_t parsed_index;
  int parse_err = comm_parse_u32(argv[2], &parsed_index);
  if (parse_err < 0) {
    shell_error(sh, "ERROR: Index must be an unsigned decimal value in range");
    return parse_err;
  }
  if (parsed_index > UINT16_MAX) {
    shell_error(sh, "ERROR: Index must be an unsigned decimal value in range");
    return -ERANGE;
  }
  uint16_t index = (uint16_t)parsed_index;
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
 * The framed device link (COM-019 to COM-025, COM-028)
 * ============================================================================
 *
 * The engine of the protocol (zplc_proto_dev.c) knows nothing of this file: it takes frames, applies the rules of
 * sessions and authentication, and calls the port below. The port is the one place where a frame reaches the
 * scheduler, the force table and the program store, and it does so with the same functions as the commands
 * above, so a program that is loaded through the link is loaded by the same code as one that is loaded through
 * `zplc sched data`.
 *
 * The transport is the shell: one frame per line, in hexadecimal, `zplc link <hex>`; a response or an event is a
 * line `ZF:<hex>`. The text shell stays, as the older protocol and the recovery console.
 */
#ifdef CONFIG_ZPLC_DEVICE_LINK /* depends on the scheduler (Kconfig) */

#include <zplc_crc32.h>
#include <zplc_proto_dev.h>
#include <zplc_sha256.h>
#if defined(CONFIG_CSPRNG_ENABLED)
#include <zephyr/random/random.h>
#endif
#ifdef CONFIG_ZPLC_PROTO_SIGNATURE
#include <zplc_ed25519.h>
#endif

#define LINK_KEY_NAME "link_key"
#define LINK_SIGNING_KEY_NAME "link_signkey"
#define LINK_SERVICE_MS 20

static zplc_proto_dev_t link_dev;
static zplc_proto_link_t link_shell_link;
static zplc_proto_ops_t link_ops;
static bool link_started;
static const struct shell *link_sh;
static uint32_t link_generation;
static char link_line[ZPLC_PROTO_FRAME_MAX * 2U + 4U];

/* A frame arrives as one line of the shell, `zplc link ` and the frame in hexadecimal. The shell drops the
 * characters of a line that does not fit its command buffer (data_insert() in shell_ops.c: a line takes at most
 * CONFIG_SHELL_CMD_BUFF_SIZE - 1 of them) and then runs what is left, so a frame longer than that is never seen
 * whole. The buffer therefore has to hold the largest frame this build accepts; a board that lowers it to save RAM
 * lowers ZPLC_PROTO_PAYLOAD_MAX with it, and the build says so. */
BUILD_ASSERT(CONFIG_SHELL_CMD_BUFF_SIZE >= sizeof("zplc link ") - 1U + 2U * ZPLC_PROTO_FRAME_MAX + 1U,
             "CONFIG_SHELL_CMD_BUFF_SIZE cannot hold a frame of the device link in hexadecimal: raise it or lower "
             "CONFIG_ZPLC_PROTO_PAYLOAD_MAX (2 * (payload + 47) + 11 characters)");
static struct k_work_delayable link_service_work;
static K_MUTEX_DEFINE(link_mutex);

static uint32_t lk_now(void *context) {
  ARG_UNUSED(context);
  return k_uptime_get_32();
}

#if defined(CONFIG_CSPRNG_ENABLED)
static int lk_random(void *context, uint8_t *out, size_t length) {
  ARG_UNUSED(context);
  return sys_csrand_get(out, length);
}
#endif

static int lk_key_load(void *context, uint8_t key[ZPLC_PROTO_KEY_BYTES]) {
  ARG_UNUSED(context);
  return zplc_hal_persist_load(LINK_KEY_NAME, key, ZPLC_PROTO_KEY_BYTES) == ZPLC_HAL_OK ? 0 : 1;
}

static int lk_key_store(void *context, const uint8_t key[ZPLC_PROTO_KEY_BYTES]) {
  ARG_UNUSED(context);
  return zplc_hal_persist_save(LINK_KEY_NAME, key, ZPLC_PROTO_KEY_BYTES) == ZPLC_HAL_OK
             ? 0
             : (int)ZPLC_PROTO_ERR_FAILED;
}

static int lk_key_erase(void *context) {
  ARG_UNUSED(context);
  (void)zplc_hal_persist_delete(LINK_KEY_NAME);
  return 0;
}

#ifdef CONFIG_ZPLC_PROTO_SIGNATURE
static int lk_signing_key_load(void *context, uint8_t key[ZPLC_PROTO_KEY_BYTES]) {
  ARG_UNUSED(context);
  return zplc_hal_persist_load(LINK_SIGNING_KEY_NAME, key, ZPLC_PROTO_KEY_BYTES) == ZPLC_HAL_OK ? 0 : 1;
}

static int lk_signing_key_store(void *context, const uint8_t key[ZPLC_PROTO_KEY_BYTES]) {
  ARG_UNUSED(context);
  return zplc_hal_persist_save(LINK_SIGNING_KEY_NAME, key, ZPLC_PROTO_KEY_BYTES) == ZPLC_HAL_OK
             ? 0
             : (int)ZPLC_PROTO_ERR_FAILED;
}

static int lk_signing_key_erase(void *context) {
  ARG_UNUSED(context);
  (void)zplc_hal_persist_delete(LINK_SIGNING_KEY_NAME);
  return 0;
}

/* The staging buffer holds what the loader is given: the signature is of those bytes. */
static int lk_program_verify(void *context, const uint8_t key[ZPLC_PROTO_KEY_BYTES], const uint8_t signature[64]) {
  ARG_UNUSED(context);
  if (program_expected_size == 0U || program_staging_received_size != program_expected_size) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  return zplc_ed25519_verify(signature, key, program_staging_buffer, program_staging_received_size) == 0
             ? 0
             : (int)ZPLC_PROTO_ERR_SIGNATURE_INVALID;
}
#endif /* CONFIG_ZPLC_PROTO_SIGNATURE */

static int lk_status(void *context, zplc_proto_status_t *status) {
  zplc_sched_stats_t stats;
  zplc_sched_state_t state = zplc_sched_get_state();
  int task;

  ARG_UNUSED(context);
  memset(status, 0, sizeof(*status));
  (void)zplc_sched_get_stats(&stats);
  switch (state) {
  case ZPLC_SCHED_STATE_RUNNING:
    status->state = ZPLC_PROTO_RUN_STATE_RUNNING;
    break;
  case ZPLC_SCHED_STATE_PAUSED:
    status->state = ZPLC_PROTO_RUN_STATE_PAUSED;
    break;
  case ZPLC_SCHED_STATE_ERROR:
    status->state = ZPLC_PROTO_RUN_STATE_FAULT;
    status->fault = ZPLC_PROTO_FAULT_RUNTIME;
    break;
  default:
    status->state = ZPLC_PROTO_RUN_STATE_STOPPED;
    break;
  }
  for (task = 0; task < CONFIG_ZPLC_MAX_TASKS; task++) {
    zplc_sched_vm_snapshot_t vm;

    if (zplc_sched_debug_snapshot(task, &vm) != 0) {
      continue;
    }
    if (vm.error != 0 && state == ZPLC_SCHED_STATE_ERROR) {
      status->fault = ZPLC_PROTO_FAULT_VM;
      status->fault_task = (uint8_t)task;
      status->fault_code = (uint16_t)vm.error;
    }
    if (vm.paused != 0U && state == ZPLC_SCHED_STATE_RUNNING) {
      status->break_hit = 1U; /* a task is held while the scheduler runs: a breakpoint */
      status->break_task = (uint8_t)task;
      status->break_pc = vm.pc;
    }
  }
  status->program_loaded = program_received_size != 0U ? 1U : 0U;
  status->forces = zplc_force_get_count();
  status->cycles = stats.total_cycles;
  status->overruns = stats.total_overruns;
  status->program_size = (uint32_t)program_received_size;
  status->program_generation = link_generation;
  status->uptime_ms = k_uptime_get_32();
  return 0;
}

static int lk_identity(void *context, zplc_proto_identity_t *id) {
  const zplc_fw_identity_t identity = zplc_fw_identity();
  const zplc_io_table_t *table = zplc_io_table();

  ARG_UNUSED(context);
  id->abi_major = (uint16_t)identity.abi_major;
  id->abi_minor = (uint16_t)identity.abi_minor;
  id->draft_counter = identity.draft_counter;
  id->io_hash = table->description_hash;
  id->io_input_bytes = table->input_bytes;
  id->io_output_bytes = table->output_bytes;
  id->io_channels = table->channel_count;
  id->code_size_max = (uint32_t)ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE;
  id->work_size = ZPLC_MEM_WORK_SIZE;
  id->retain_size = ZPLC_MEM_RETAIN_SIZE;
  id->ipi_size = ZPLC_MEM_IPI_SIZE;
  id->opi_size = ZPLC_MEM_OPI_SIZE;
  id->product_version = identity.version;
  id->board = CONFIG_BOARD;
  id->board_profile = identity.board;
  id->io_board_id = table->board_id;
  return 0;
}

/* A read is from the snapshot a scan published: whole values, between two scans (RT-010). */
static int lk_mem_read(void *context, uint16_t address, uint8_t *out, uint16_t length) {
  ARG_UNUSED(context);
  return zplc_exchange_read(address, out, length) == 0 ? 0 : (int)ZPLC_PROTO_ERR_RANGE;
}

static int lk_mem_read_many(void *context, const zplc_proto_extent_t *extents, size_t count, uint8_t *out,
                            uint32_t *scan) {
  zplc_sched_stats_t stats;
  size_t i;
  int result = 0;

  ARG_UNUSED(context);
  if (zplc_exchange_read_lock() != 0) {
    return (int)ZPLC_PROTO_ERR_BUSY;
  }
  /* every extent comes from one publication, which is the scan the counter belongs to */
  (void)zplc_sched_get_stats(&stats);
  *scan = stats.total_cycles;
  for (i = 0U; i < count && result == 0; i++) {
    result = zplc_exchange_read_locked(extents[i].address, out, extents[i].length);
    out += extents[i].length;
  }
  zplc_exchange_read_unlock();
  return result == 0 ? 0 : (int)ZPLC_PROTO_ERR_RANGE;
}

/* One write, queued whole through the exchange and applied at the input latch of the next scan (COM-023). */
static int lk_mem_write(void *context, uint16_t address, const uint8_t *data, uint16_t length) {
  const int rc = zplc_exchange_write(address, data, length);

  ARG_UNUSED(context);
  if (rc == 0) {
    return 0;
  }
  return rc == ZPLC_EXCHANGE_ERR_FULL ? (int)ZPLC_PROTO_ERR_FULL
         : rc == ZPLC_EXCHANGE_ERR_LOCK ? (int)ZPLC_PROTO_ERR_BUSY
                                        : (int)ZPLC_PROTO_ERR_RANGE;
}

static int lk_force_set(void *context, uint16_t address, const uint8_t *data, uint16_t length) {
  int rc;

  ARG_UNUSED(context);
  if (zplc_sched_lock(5) != 0) {
    return (int)ZPLC_PROTO_ERR_BUSY;
  }
  rc = zplc_force_set_bytes(address, data, length);
  zplc_exchange_publish();
  (void)zplc_sched_unlock();
  switch (rc) {
  case 0:
    return 0;
  case -2:
    return (int)ZPLC_PROTO_ERR_RANGE;
  case -4:
    return (int)ZPLC_PROTO_ERR_FULL;
  default:
    return (int)ZPLC_PROTO_ERR_STATE;
  }
}

static int lk_force_clear(void *context, uint16_t address) {
  int rc;

  ARG_UNUSED(context);
  if (zplc_sched_lock(5) != 0) {
    return (int)ZPLC_PROTO_ERR_BUSY;
  }
  rc = zplc_force_clear(address);
  zplc_exchange_publish();
  (void)zplc_sched_unlock();
  return rc == 0 ? 0 : (int)ZPLC_PROTO_ERR_RANGE;
}

static int lk_force_clear_all(void *context) {
  ARG_UNUSED(context);
  if (zplc_sched_lock(5) != 0) {
    return (int)ZPLC_PROTO_ERR_BUSY;
  }
  zplc_force_clear_all();
  zplc_exchange_publish();
  (void)zplc_sched_unlock();
  return 0;
}

static int lk_force_get(void *context, uint8_t index, uint16_t *address, uint16_t *size, uint8_t *data) {
  ARG_UNUSED(context);
  return zplc_force_get(index, address, size, data, ZPLC_FORCE_MAX_BYTES) == 0 ? 0 : (int)ZPLC_PROTO_ERR_FAILED;
}

static int lk_control(int rc) {
  if (rc == 0) {
    return 0;
  }
  return rc == ZPLC_SCHED_ERR_LOCK ? (int)ZPLC_PROTO_ERR_BUSY : (int)ZPLC_PROTO_ERR_STATE;
}

static int lk_run(void *context) {
  ARG_UNUSED(context);
  if (program_received_size == 0U) {
    return (int)ZPLC_PROTO_ERR_STATE; /* nothing to run */
  }
  return lk_control(zplc_sched_start());
}

static int lk_stop(void *context) {
  ARG_UNUSED(context);
  return lk_control(zplc_sched_stop());
}

static int lk_pause(void *context) {
  ARG_UNUSED(context);
  return lk_control(zplc_sched_pause());
}

static int lk_resume(void *context) {
  ARG_UNUSED(context);
  return lk_control(zplc_sched_resume());
}

static int lk_step(void *context) {
  ARG_UNUSED(context);
  return lk_control(zplc_sched_step() == -1 ? -1 : 0);
}

static int lk_reset(void *context) {
  ARG_UNUSED(context);
  return sched_reset_loaded_program() < 0 ? (int)ZPLC_PROTO_ERR_FAILED : 0;
}

static int lk_breakpoint(uint16_t pc, bool add) {
  bool found = false;
  int last = 0;
  int task;

  for (task = 0; task < CONFIG_ZPLC_MAX_TASKS; task++) {
    zplc_sched_vm_snapshot_t vm;

    if (zplc_sched_debug_snapshot(task, &vm) != 0) {
      continue;
    }
    found = true;
    {
      const int rc = add ? zplc_sched_debug_add_breakpoint(task, pc) : zplc_sched_debug_remove_breakpoint(task, pc);

      if (rc < 0) {
        last = rc;
      }
    }
  }
  if (!found) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  return last == 0 ? 0 : (last == -2 ? (int)ZPLC_PROTO_ERR_FULL : (int)ZPLC_PROTO_ERR_STATE);
}

static int lk_bp_add(void *context, uint16_t pc) {
  ARG_UNUSED(context);
  return lk_breakpoint(pc, true);
}

static int lk_bp_remove(void *context, uint16_t pc) {
  ARG_UNUSED(context);
  return lk_breakpoint(pc, false);
}

static int lk_bp_clear(void *context) {
  int task;

  ARG_UNUSED(context);
  for (task = 0; task < CONFIG_ZPLC_MAX_TASKS; task++) {
    (void)zplc_sched_debug_clear_breakpoints(task);
  }
  return 0;
}

static int lk_bp_list(void *context, uint16_t *pcs, size_t capacity, size_t *count) {
  size_t total = 0U;
  int task;

  ARG_UNUSED(context);
  for (task = 0; task < CONFIG_ZPLC_MAX_TASKS; task++) {
    zplc_sched_vm_snapshot_t vm;
    uint8_t i;

    if (zplc_sched_debug_snapshot(task, &vm) != 0) {
      continue;
    }
    for (i = 0U; i < vm.breakpoint_count; i++) {
      size_t seen;
      bool duplicate = false;

      for (seen = 0U; seen < total && seen < capacity; seen++) {
        duplicate = duplicate || pcs[seen] == vm.breakpoints[i];
      }
      if (!duplicate) {
        if (total < capacity) {
          pcs[total] = vm.breakpoints[i];
        }
        total++;
      }
    }
  }
  *count = total;
  return 0;
}

/* The one buffer of the code size is the staging buffer of the shell upload as well: a transfer by the link and a
 * transfer by `zplc sched data` cannot be in progress together, and starting one cancels the other. */
static int lk_program_begin(void *context, uint32_t size) {
  const zplc_sched_state_t state = zplc_sched_get_state();

  ARG_UNUSED(context);
  if (state == ZPLC_SCHED_STATE_RUNNING || state == ZPLC_SCHED_STATE_PAUSED) {
    return (int)ZPLC_PROTO_ERR_STATE; /* a program is replaced while the runtime is stopped */
  }
  if (size > program_buffer_size) {
    return (int)ZPLC_PROTO_ERR_TOO_LARGE;
  }
  begin_upload_rollback();
  memset(program_staging_buffer, 0, program_buffer_size);
  program_expected_size = size;
  program_staging_received_size = 0U;
  return 0;
}

static int lk_program_chunk(void *context, uint32_t offset, const uint8_t *data, uint16_t length) {
  ARG_UNUSED(context);
  if (program_expected_size == 0U || (size_t)offset + length > program_expected_size) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  memcpy(program_staging_buffer + offset, data, length);
  program_staging_received_size = (size_t)offset + length;
  return 0;
}

static void lk_program_forget(void) {
  program_expected_size = 0U;
  program_staging_received_size = 0U;
  memset(program_staging_buffer, 0, program_buffer_size);
}

static int lk_program_commit(void *context, zplc_proto_program_info_t *info) {
  size_t size = program_staging_received_size;
  int rc;

  ARG_UNUSED(context);
  if (program_expected_size == 0U || size != program_expected_size) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  rc = zplc_sched_validate_program(program_staging_buffer, size);
  if (rc != ZPLC_LOADER_OK) {
    lk_program_forget();
    return (int)ZPLC_PROTO_ERR_PROGRAM_INVALID;
  }
  rc = zplc_program_store_commit(program_staging_buffer, size, program_buffer_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  if (rc != ZPLC_PROGRAM_STORE_COMMIT_OK) {
    if (rc == ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN) {
      (void)sched_latch_ambiguous_program_publication();
    } else {
      lk_program_forget();
    }
    return (int)ZPLC_PROTO_ERR_FAILED;
  }
  rc = sched_reset_runtime(program_staging_buffer, size);
  if (rc < 0) {
    program_expected_size = 0U;
    program_received_size = 0U;
    return (int)ZPLC_PROTO_ERR_FAILED;
  }
  program_received_size = size;
  program_expected_size = 0U;
  program_staging_received_size = 0U;
  link_generation++;
  info->loaded = 1U;
  info->size = (uint32_t)size;
  info->crc32 = zplc_crc32(program_staging_buffer, size); /* the copy the runtime executes, as stored */
  info->generation = link_generation;
  return 0;
}

static void lk_program_abort(void *context) {
  ARG_UNUSED(context);
  if (program_expected_size != 0U) {
    lk_program_forget();
  }
}

static int lk_program_info(void *context, zplc_proto_program_info_t *info) {
  ARG_UNUSED(context);
  memset(info, 0, sizeof(*info));
  info->loaded = program_received_size != 0U ? 1U : 0U;
  info->size = (uint32_t)program_received_size;
  info->crc32 = program_received_size != 0U ? zplc_crc32(program_staging_buffer, program_received_size) : 0U;
  info->generation = link_generation;
  return 0;
}

/* The frame goes out as one line in one call: another thread's output does not land inside it. */
static int link_write(void *context, const uint8_t *frame, size_t length) {
  static const char digits[] = "0123456789abcdef";
  size_t i;

  ARG_UNUSED(context);
  if (link_sh == NULL || length * 2U + 4U > sizeof(link_line)) {
    return -1;
  }
  link_line[0] = 'Z';
  link_line[1] = 'F';
  link_line[2] = ':';
  for (i = 0U; i < length; i++) {
    link_line[3U + 2U * i] = digits[frame[i] >> 4];
    link_line[4U + 2U * i] = digits[frame[i] & 0x0FU];
  }
  link_line[3U + 2U * length] = '\0';
  /* A line that starts with a newline, so that an event that lands in the middle of a line of text that another
   * thread is printing (a JSON answer is printed in pieces) is a line of its own that a reader can take out. */
  shell_fprintf(link_sh, SHELL_NORMAL, "\n%s\n", link_line);
  return 0;
}

static void link_service(struct k_work *work) {
  zplc_proto_link_t *links[1] = {&link_shell_link};

  ARG_UNUSED(work);
  if (k_mutex_lock(&link_mutex, K_MSEC(5)) == 0) {
    zplc_proto_dev_service(&link_dev, links, 1U);
    k_mutex_unlock(&link_mutex);
  }
  (void)k_work_reschedule(&link_service_work, K_MSEC(LINK_SERVICE_MS));
}

static void link_start(void) {
  if (link_started) {
    return;
  }
  memset(&link_ops, 0, sizeof(link_ops));
  link_ops.now_ms = lk_now;
#if defined(CONFIG_CSPRNG_ENABLED)
  link_ops.random = lk_random;
  link_ops.key_load = lk_key_load;
  link_ops.key_store = lk_key_store;
  link_ops.key_erase = lk_key_erase;
#else
  /* no cryptographic generator on this board: no authenticated session, and no key to hold (COM-016) */
  (void)lk_key_load;
  (void)lk_key_store;
  (void)lk_key_erase;
#endif
  link_ops.status = lk_status;
  link_ops.identity = lk_identity;
  link_ops.mem_read = lk_mem_read;
  link_ops.mem_read_many = lk_mem_read_many;
  link_ops.mem_write = lk_mem_write;
  link_ops.force_set = lk_force_set;
  link_ops.force_clear = lk_force_clear;
  link_ops.force_clear_all = lk_force_clear_all;
  link_ops.force_get = lk_force_get;
  link_ops.run = lk_run;
  link_ops.stop = lk_stop;
  link_ops.pause = lk_pause;
  link_ops.resume = lk_resume;
  link_ops.step = lk_step;
  link_ops.reset = lk_reset;
  link_ops.bp_add = lk_bp_add;
  link_ops.bp_remove = lk_bp_remove;
  link_ops.bp_clear = lk_bp_clear;
  link_ops.bp_list = lk_bp_list;
  link_ops.program_begin = lk_program_begin;
  link_ops.program_chunk = lk_program_chunk;
  link_ops.program_commit = lk_program_commit;
  link_ops.program_abort = lk_program_abort;
  link_ops.program_info = lk_program_info;
#ifdef CONFIG_ZPLC_PROTO_SIGNATURE
  link_ops.signing_key_load = lk_signing_key_load;
  link_ops.signing_key_store = lk_signing_key_store;
  link_ops.signing_key_erase = lk_signing_key_erase;
  link_ops.program_verify = lk_program_verify;
#endif
  (void)zplc_proto_dev_init(&link_dev, &link_ops, CONFIG_ZPLC_PROTO_SESSION_IDLE_S);
  zplc_proto_link_init(&link_shell_link, &link_dev, ZPLC_PROTO_TRANSPORT_SERIAL, link_write, NULL);
  k_work_init_delayable(&link_service_work, link_service);
  (void)k_work_reschedule(&link_service_work, K_MSEC(LINK_SERVICE_MS));
  link_started = true;
}

/* `zplc link <hex frame>`: one frame of the protocol; the response is a line ZF:<hex>. Nothing is printed for a
 * frame that is not a frame (the counters say what was dropped). */
static int cmd_link(const struct shell *sh, size_t argc, char **argv) {
  uint8_t frame[ZPLC_PROTO_FRAME_MAX];
  int decoded;
  int rc;

  if (argc != 2) {
    shell_error(sh, "Usage: zplc link <hex frame>");
    return -EINVAL;
  }
  decoded = hex_decode(argv[1], frame, sizeof(frame));
  if (decoded <= 0) {
    return -EINVAL;
  }
  k_mutex_lock(&link_mutex, K_FOREVER);
  link_sh = sh;
  link_start();
  rc = zplc_proto_link_feed_frame(&link_shell_link, frame, (size_t)decoded);
  k_mutex_unlock(&link_mutex);
  /* the line of a command is in the buffer of the shell: a key that came in it does not stay there */
  if (decoded > ZPLC_PROTO_OFFSET_MESSAGE && frame[ZPLC_PROTO_OFFSET_MESSAGE] == ZPLC_PROTO_MSG_KEY_SET) {
    zplc_secure_zero(argv[1], strlen(argv[1]));
  }
  zplc_secure_zero(frame, sizeof(frame));
  return rc == 0 ? 0 : -EINVAL;
}

#endif /* CONFIG_ZPLC_DEVICE_LINK */

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

#ifdef CONFIG_ZPLC_SCHEDULER
SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_dbg_force,
    SHELL_CMD_ARG(set, NULL, "Set force bytes: dbg force set <addr> <hexbytes>", cmd_dbg_force_set, 3, 0),
    SHELL_CMD_ARG(clear, NULL, "Clear force entry: dbg force clear <addr>", cmd_dbg_force_clear, 2, 0),
    SHELL_CMD(clear_all, NULL, "Clear all force entries", cmd_dbg_force_clear_all),
    SHELL_CMD_ARG(list, NULL, "List force entries", cmd_dbg_force_list, 1, 1),
    SHELL_SUBCMD_SET_END);
#endif

#ifdef CONFIG_ZPLC_IO_TRACE
#include <zplc_io_trace.h>

/* LRN-024: the per-scan I/O trace of the board (zplc_io_trace.h), for the hardware check of a Learn lesson. Every
 * answer is one JSON object; a trailing --json is accepted, as Studio's JSON commands add it. The trace only reads:
 * none of these commands writes PLC memory, forces, or starts or stops the program. */
static int trace_arg_u32(const char *text, uint32_t *out) {
  char *end = NULL;
  unsigned long value;

  if (text == NULL || text[0] < '0' || text[0] > '9') {
    return -EINVAL;
  }
  value = strtoul(text, &end, 10);
  if (end == NULL || *end != '\0' || value > UINT32_MAX) {
    return -EINVAL;
  }
  *out = (uint32_t)value;
  return 0;
}

static void trace_print_status(const struct shell *sh) {
  zplc_io_trace_status_t status;

  zplc_io_trace_get_status(zplc_io_trace_board(), &status);
  shell_print(sh,
              "{\"t\":\"trace\",\"available\":%s,\"armed\":%s,\"capacity\":%u,\"in_bytes\":%u,\"out_bytes\":%u,"
              "\"written\":%u,\"first\":%u,\"max_io_bytes\":%u,\"buffer_bytes\":%u}",
              status.fed != 0U ? "true" : "false", status.armed != 0U ? "true" : "false",
              (unsigned int)status.capacity, (unsigned int)status.in_bytes, (unsigned int)status.out_bytes,
              (unsigned int)status.written, (unsigned int)status.first, (unsigned int)ZPLC_IO_TRACE_MAX_IO_BYTES,
              (unsigned int)status.storage_size);
}

static int cmd_dbg_trace_status(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  trace_print_status(sh);
  return 0;
}

static int cmd_dbg_trace_arm(const struct shell *sh, size_t argc, char **argv) {
  uint32_t capacity;
  uint32_t in_bytes;
  uint32_t out_bytes;
  int rc;

  ARG_UNUSED(argc);
  if (trace_arg_u32(argv[1], &capacity) != 0 || trace_arg_u32(argv[2], &in_bytes) != 0 ||
      trace_arg_u32(argv[3], &out_bytes) != 0 || in_bytes > ZPLC_IO_TRACE_MAX_IO_BYTES ||
      out_bytes > ZPLC_IO_TRACE_MAX_IO_BYTES) {
    shell_error(sh, "ERROR: usage: dbg trace arm <capacity> <in_bytes> <out_bytes>, at most %u bytes each",
                (unsigned int)ZPLC_IO_TRACE_MAX_IO_BYTES);
    return -EINVAL;
  }
  rc = zplc_io_trace_arm(zplc_io_trace_board(), capacity, (uint16_t)in_bytes, (uint16_t)out_bytes);
  if (rc == ZPLC_IO_TRACE_ERR_UNFED) {
    shell_error(sh, "ERROR: no scheduler feeds the I/O trace on this build");
    return -ENOTSUP;
  }
  if (rc < 0) {
    shell_error(sh, "ERROR: the I/O trace cannot hold that capacity or sample");
    return -EINVAL;
  }
  trace_print_status(sh);
  return 0;
}

/* At most this many samples per dump: one line of about 5 KB with the widest samples. */
#define TRACE_DUMP_MAX 32U

static int cmd_dbg_trace_dump(const struct shell *sh, size_t argc, char **argv) {
  const zplc_io_trace_t *trace = zplc_io_trace_board();
  zplc_io_trace_status_t status;
  zplc_io_trace_sample_t sample;
  uint32_t from;
  uint32_t count;
  uint32_t end;
  uint32_t seq;

  ARG_UNUSED(argc);
  if (trace_arg_u32(argv[1], &from) != 0 || trace_arg_u32(argv[2], &count) != 0 || count == 0U ||
      count > TRACE_DUMP_MAX) {
    shell_error(sh, "ERROR: usage: dbg trace dump <from> <count>, count 1 to %u", (unsigned int)TRACE_DUMP_MAX);
    return -EINVAL;
  }
  zplc_io_trace_get_status(trace, &status);
  /* A reader that fell behind starts at the oldest sample held: the from it gets back says how many it lost. */
  if (from < status.first) {
    from = status.first;
  }
  if (from > status.written) {
    from = status.written;
  }
  end = status.written - from > count ? from + count : status.written;
  shell_fprintf(sh, SHELL_NORMAL, "{\"t\":\"trace_dump\",\"from\":%u,\"samples\":[", (unsigned int)from);
  for (seq = from; seq < end; ++seq) {
    if (zplc_io_trace_get(trace, seq, &sample) != 0) {
      break; /* overwritten while it was read: the next dump starts at the oldest sample held */
    }
    shell_fprintf(sh, SHELL_NORMAL, "%s[%u,%u,\"", seq == from ? "" : ",", (unsigned int)sample.t_us,
                  (unsigned int)sample.batch);
    for (uint32_t b = 0U; b < status.in_bytes; ++b) {
      shell_fprintf(sh, SHELL_NORMAL, "%02X", sample.in[b]);
    }
    shell_fprintf(sh, SHELL_NORMAL, "\",\"");
    for (uint32_t b = 0U; b < status.out_bytes; ++b) {
      shell_fprintf(sh, SHELL_NORMAL, "%02X", sample.out[b]);
    }
    shell_fprintf(sh, SHELL_NORMAL, "\"]");
  }
  shell_fprintf(sh, SHELL_NORMAL, "],\"next\":%u}\n", (unsigned int)seq);
  return 0;
}

static int cmd_dbg_trace_clear(const struct shell *sh, size_t argc, char **argv) {
  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  zplc_io_trace_clear(zplc_io_trace_board());
  trace_print_status(sh);
  return 0;
}

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_dbg_trace,
    SHELL_CMD_ARG(arm, NULL, "Arm the I/O trace: dbg trace arm <capacity> <in_bytes> <out_bytes>", cmd_dbg_trace_arm, 4, 1),
    SHELL_CMD_ARG(status, NULL, "State of the I/O trace (JSON)", cmd_dbg_trace_status, 1, 1),
    SHELL_CMD_ARG(dump, NULL, "Samples of the I/O trace (JSON): dbg trace dump <from> <count>", cmd_dbg_trace_dump, 3, 1),
    SHELL_CMD_ARG(clear, NULL, "Disarm and empty the I/O trace", cmd_dbg_trace_clear, 1, 1),
    SHELL_SUBCMD_SET_END);
#endif

SHELL_STATIC_SUBCMD_SET_CREATE(
    sub_dbg, 
    SHELL_CMD(pause, NULL, "Pause VM execution", cmd_dbg_pause),
    SHELL_CMD(resume, NULL, "Resume VM execution", cmd_dbg_resume),
    SHELL_CMD(step, NULL, "Execute one cycle", cmd_dbg_step),
    SHELL_CMD(bp, &sub_dbg_bp, "Breakpoint management", NULL),
#ifdef CONFIG_ZPLC_SCHEDULER
    SHELL_CMD(force, &sub_dbg_force, "Force value management", NULL),
    SHELL_CMD_ARG(peek, NULL, "Read memory", cmd_dbg_peek, 2, 1),
    SHELL_CMD_ARG(mpeek, NULL, "Multi-read: mpeek addr:len[,addr:len...]", cmd_dbg_mpeek, 2, 0),
    SHELL_CMD_ARG(poke, NULL, "Write memory", cmd_dbg_poke, 3, 0),
    SHELL_CMD_ARG(ticks, NULL, "System tick", cmd_dbg_ticks, 1, 1),
    SHELL_CMD_ARG(mem, NULL, "Dump memory", cmd_dbg_mem, 2, 1),
#endif
    SHELL_CMD_ARG(info, NULL, "VM state", cmd_dbg_info, 1, 1),
    SHELL_CMD_ARG(task, NULL, "Task info", cmd_dbg_task, 2, 1),
    SHELL_CMD_ARG(watch, NULL, "Read a typed value: dbg watch <addr> [type]", cmd_dbg_watch, 2, 1),
    SHELL_CMD_ARG(timer, NULL, "Timer instance state: dbg timer <addr>", cmd_dbg_timer, 2, 0),
#ifdef CONFIG_ZPLC_IO_TRACE
    SHELL_CMD(trace, &sub_dbg_trace, "Per-scan trace of the I/O images (Learn hardware check)", NULL),
#endif
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
    SHELL_CMD_ARG(build, NULL, "Firmware identity: commit, board, ABI, options [--json]", cmd_sys_build, 1, 1),
    SHELL_CMD_ARG(io, NULL, "Identity of the board I/O description [--json]", cmd_sys_io, 1, 1),
    SHELL_CMD_ARG(reset, NULL, "Why the processor was last reset, and the fault it left [--json]", cmd_sys_reset, 1, 1),
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

static const char *tls_verify_name(uint8_t state)
{
    switch (state) {
    case ZPLC_MQTT_TLS_VERIFY_ON:
        return "on";
    case ZPLC_MQTT_TLS_VERIFY_OFF:
        return "OFF";
    default:
        return "n/a";
    }
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
        JSON_STR(sh, "tls_verify", tls_verify_name(status.tls_verify), true);
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
    shell_print(sh, "  tls-verify: %s", tls_verify_name(status.tls_verify));
    if (status.tls_verify == ZPLC_MQTT_TLS_VERIFY_OFF) {
      shell_warn(sh, "  WARNING: the broker certificate is not checked");
    }
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
    SHELL_CMD_ARG(map, NULL, "Show communication bindings and Modbus server mappings", cmd_comm_map, 1, 1),
    SHELL_CMD_ARG(set, NULL, "Override a Modbus server mapping", cmd_comm_set, 4, 0),
    SHELL_CMD_ARG(clear, NULL, "Clear a Modbus server mapping override", cmd_comm_clear, 3, 0),
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
#ifdef CONFIG_ZPLC_DEVICE_LINK /* depends on the scheduler (Kconfig) */
    SHELL_CMD_ARG(link, NULL, "One frame of the device link protocol, in hexadecimal", cmd_link, 2, 0),
#endif
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
