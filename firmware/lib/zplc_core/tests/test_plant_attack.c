/**
 * @file test_plant_attack.c
 * @brief Independent attack tests of the plant I/O mode of the firmware (Task F5 of plan-m6.md; LNK-003, LNK-006,
 *        LNK-007, LNK-008, LNK-010, LNK-011, LNK-015, LNK-017, LNK-018).
 *
 * SPDX-License-Identifier: MIT
 *
 * Written by a reviewer who wrote none of the module. The scenarios are those of the F5 attack list: wrap-around of
 * the sequence, lengths and values that must be refused, the hold and the order of the pin writes on a board whose
 * safe level is 1, an exit in the scan that also faults, the lock the scan failed to try, the engine with two links,
 * a takeover and a stop that cannot be taken, and the scan thread racing the link thread at the latch.
 *
 * Assertions of three kinds: CHECK (a property that holds; a failure fails the run), BLOCKER (a defect of this
 * change that violates the plan; open until fixed, fatal only with ZPLC_ATTACK_STRICT=1, which the second ctest
 * entry sets and expects to fail) and ADVISORY (reported, never fatal). The engine tests run the real module behind
 * a model of the application's lk_plant_* port (static in shell_cmds.c, so not linkable): the model is a line-by-line
 * copy of lk_plant_exit's order (hold, stop, then leave), and what it proves is the order, not the application.
 */

#define _POSIX_C_SOURCE 200809L

#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_exchange.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_plant.h>
#include <zplc_proto_defs.h>
#include <zplc_sched_core.h>
#include <zplc_test_hooks.h>

#include <zplc_bytes.h>
#include <zplc_proto.h>
#include <zplc_proto_dev.h>

static int test_count = 0;
static int fail_count = 0;
static int blocker_open = 0;
static int advisory_open = 0;

#define CHECK(cond, msg)                                      \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    } else {                                                  \
      printf("PASS: %s\n", msg);                              \
    }                                                         \
  } while (0)

/* A confirmed defect of this change: the assertion states what the plan requires and fails until it is fixed. It does
 * not fail the default run (the suite stays buildable and green); ZPLC_ATTACK_STRICT=1 makes every open one fatal. */
#define BLOCKER(cond, msg)                                            \
  do {                                                                \
    test_count++;                                                     \
    if (!(cond)) {                                                    \
      fprintf(stderr, "BLOCKER-OPEN: %s (line %d)\n", msg, __LINE__); \
      blocker_open++;                                                 \
    } else {                                                          \
      printf("PASS: %s\n", msg);                                      \
    }                                                                 \
  } while (0)

/* A weakness that is not a blocker by the severity rule (out of domain, bounded, or the plan is silent). */
#define ADVISORY(cond, msg)                                            \
  do {                                                                 \
    test_count++;                                                      \
    if (!(cond)) {                                                     \
      fprintf(stderr, "ADVISORY-OPEN: %s (line %d)\n", msg, __LINE__); \
      advisory_open++;                                                 \
    } else {                                                           \
      printf("PASS: %s\n", msg);                                       \
    }                                                                  \
  } while (0)

#define ERR_STATE ((int)ZPLC_PROTO_ERR_STATE)

/* ---- the board: DI0 and DI1 are two bits of input byte 0, DO0 and DO1 two bits of output byte 0 ---- */
static const zplc_io_channel_t channels[] = {
    /* id    pin    offset kind                   dir                   bit hal safe req */
    {"DO0", "GP0", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U},
    {"DO1", "GP1", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 1U, 1U, 0U, 1U},
    {"DI0", "GP2", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 0U, 0U, 0U, 1U},
    {"DI1", "GP3", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 1U, 1U, 0U, 1U},
};

static const zplc_io_table_t table = {"plant-sched-board", 0x9A17C0DEU, 1U, 1U, 4U, channels};

static const zplc_io_table_t *cur_table = &table;

const zplc_io_table_t *zplc_io_table(void) { return cur_table; }

/* ---- the pins ---- */
static uint8_t pin_in[2];
static uint8_t pin_out[2];
static unsigned pin_high_writes; /* writes of a high level to an output, since the last reset */
static unsigned pin_reads;       /* reads of an input pin, since the last reset */
static char pin_log[256];        /* the output levels written, one character per write */

zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value) {
  if (channel >= 2U) {
    return ZPLC_HAL_ERROR;
  }
  pin_reads++;
  *value = pin_in[channel];
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value) {
  const size_t used = strlen(pin_log);

  if (channel >= 2U) {
    return ZPLC_HAL_ERROR;
  }
  pin_out[channel] = value;
  if (value != 0U) {
    pin_high_writes++;
  }
  if (used + 2U < sizeof(pin_log)) {
    pin_log[used] = (char)('0' + value);
    pin_log[used + 1U] = '\0';
  }
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
  (void)channel;
  *value = 0U;
  return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value) {
  (void)channel;
  (void)value;
  return ZPLC_HAL_NOT_IMPL;
}

/* The HAL's mutexes are real: the exchange's lock is what keeps a reader of the snapshot from a publication. */
#define MUTEX_POOL 4U
static pthread_mutex_t mutex_pool[MUTEX_POOL] = {PTHREAD_MUTEX_INITIALIZER, PTHREAD_MUTEX_INITIALIZER, PTHREAD_MUTEX_INITIALIZER,
                                                 PTHREAD_MUTEX_INITIALIZER};
static unsigned mutex_next;

zplc_hal_mutex_t zplc_hal_mutex_create(void) { return mutex_next < MUTEX_POOL ? &mutex_pool[mutex_next++] : &mutex_pool[MUTEX_POOL - 1U]; }
zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex) {
  return pthread_mutex_lock((pthread_mutex_t *)mutex) == 0 ? ZPLC_HAL_OK : ZPLC_HAL_ERROR;
}
zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex) {
  (void)mutex;
  return ZPLC_HAL_OK;
}
zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex) {
  return pthread_mutex_unlock((pthread_mutex_t *)mutex) == 0 ? ZPLC_HAL_OK : ZPLC_HAL_ERROR;
}
uint32_t zplc_hal_tick(void) { return 0U; }

#include "../src/hal/common/zplc_io_common.inc"

/* ---- the scheduler port: the Zephyr adapter's phases over the I/O functions of the core ---- */
static pthread_mutex_t image_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t plant_mutex = PTHREAD_MUTEX_INITIALIZER;
static zplc_io_samples_t samples;
static zplc_io_outputs_t outputs;
static uint64_t clock_us;
static unsigned stop_releases_calls;
static volatile uint32_t clock_ms;

static uint64_t p_now(void *ctx) {
  (void)ctx;
  clock_us += 100U;
  return clock_us;
}
static int p_lock_image(void *ctx) {
  (void)ctx;
  return pthread_mutex_lock(&image_mutex);
}
static void p_unlock_image(void *ctx) {
  (void)ctx;
  (void)pthread_mutex_unlock(&image_mutex);
}
static int p_sample(void *ctx) {
  (void)ctx;
  return (int)zplc_io_sample(&samples, NULL);
}
static void p_latch(void *ctx) {
  (void)ctx;
  (void)zplc_exchange_latch();
  zplc_io_apply_samples(&samples);
}
static void p_capture(void *ctx) {
  (void)ctx;
  zplc_io_capture_outputs(&outputs);
}
static void p_publish(void *ctx) {
  (void)ctx;
  zplc_exchange_publish();
}
static int p_write(void *ctx) {
  (void)ctx;
  return (int)zplc_io_write_outputs(&outputs, NULL);
}
static int p_reset_image(void *ctx) {
  int result;

  (void)ctx;
  result = zplc_io_reset_image();
  zplc_exchange_publish();
  return result;
}
static int p_drive_safe(void *ctx) {
  (void)ctx;
  return (int)zplc_io_drive_safe(NULL);
}
static int p_watchdog(void *ctx, zplc_wdt_state_t state) {
  (void)ctx;
  (void)state;
  return 0;
}
static void p_stop_releases(void *ctx) {
  (void)ctx;
  stop_releases_calls++;
}

static const zplc_sched_port_t port = {
    .now_us = p_now,
    .lock_image = p_lock_image,
    .unlock_image = p_unlock_image,
    .sample_inputs = p_sample,
    .latch_inputs = p_latch,
    .capture_outputs = p_capture,
    .publish = p_publish,
    .write_outputs = p_write,
    .reset_image = p_reset_image,
    .drive_safe_pins = p_drive_safe,
    .watchdog_state = p_watchdog,
    .stop_releases = p_stop_releases,
};

static const zplc_sched_plant_t plant_hooks = {
    .latch = zplc_plant_latch,
    .holds_outputs = zplc_plant_holds_outputs,
    .tick = zplc_plant_tick,
    .exit = zplc_plant_exit,
};

/* ---- the plant's hooks: the clock is the test's; the lock is a real one, shared by the scan and the link ---- */
static volatile int lock_fail; /* the link thread holds the plant lock: the scan's try fails */

static int h_lock(void *ctx) {
  (void)ctx;
  if (lock_fail != 0) {
    return -1;
  }
  return pthread_mutex_lock(&plant_mutex);
}
static void h_unlock(void *ctx) {
  (void)ctx;
  (void)pthread_mutex_unlock(&plant_mutex);
}
static uint32_t h_now(void *ctx) {
  (void)ctx;
  return clock_ms;
}

static int ex_lock_image(void) { return 0; }
static void ex_unlock_image(void) {}
static int ex_scan_active(void) { return 1; }

/* ---- the program of the task: echo the input image to the output image (byte 0 and the REAL at byte 4) ---- */
#define TASKS 1U
static zplc_sched_slot_t slots[TASKS];
static zplc_vm_t vms[TASKS];
static zplc_sched_core_t core;

static size_t put_op16(uint8_t *at, uint8_t op, uint16_t addr) {
  at[0] = op;
  at[1] = (uint8_t)addr;
  at[2] = (uint8_t)(addr >> 8);
  return 3U;
}

/* kind 0: echo; kind 1: a VM fault (nothing on the stack to add) */
static void load_program(int kind) {
  uint8_t code[32];
  size_t n = 0U;

  memset(code, OP_NOP, sizeof(code));
  if (kind == 1) {
    code[n++] = OP_ADD;
    code[n++] = OP_HALT;
  } else {
    n += put_op16(code + n, OP_LOAD8, (uint16_t)(ZPLC_MEM_IPI_BASE + 0U));
    n += put_op16(code + n, OP_STORE8, (uint16_t)(ZPLC_MEM_OPI_BASE + 0U));
    n += put_op16(code + n, OP_LOAD32, (uint16_t)(ZPLC_MEM_IPI_BASE + 4U));
    n += put_op16(code + n, OP_STORE32, (uint16_t)(ZPLC_MEM_OPI_BASE + 4U));
    code[n++] = OP_HALT;
  }
  CHECK(zplc_test_load_raw(code, sizeof(code)) == 0, "the program is loaded");
}

/** A fresh runtime: memory, exchange, plant module, scheduler core with one running echo task, pins low. */
static void setup(int kind, int with_hooks) {
  zplc_exchange_hooks_t eh;
  zplc_plant_hooks_t ph;
  zplc_task_def_t def;

  cur_table = &table;
  lock_fail = 0;
  zplc_core_cold_start();
  zplc_force_clear_all();
  CHECK(zplc_core_init() == 0, "the core starts");
  load_program(kind);
  memset(&eh, 0, sizeof(eh));
  eh.lock_image = ex_lock_image;
  eh.unlock_image = ex_unlock_image;
  eh.scan_active = ex_scan_active;
  (void)zplc_exchange_init(&eh);
  memset(&ph, 0, sizeof(ph));
  ph.lock = h_lock;
  ph.unlock = h_unlock;
  ph.now_ms = h_now;
  zplc_plant_init(&ph);
  zplc_sched_core_set_plant(with_hooks != 0 ? &plant_hooks : NULL);
  memset(pin_in, 0, sizeof(pin_in));
  memset(pin_out, 0, sizeof(pin_out));
  pin_high_writes = 0U;
  pin_reads = 0U;
  pin_log[0] = '\0';
  stop_releases_calls = 0U;
  clock_us = 1000000U;
  clock_ms = 1000U;

  memset(slots, 0, sizeof(slots));
  memset(&def, 0, sizeof(def));
  def.id = 1U;
  def.type = ZPLC_TASK_CYCLIC;
  def.priority = 1U;
  def.interval_us = 10000U;
  def.entry_point = 0U;
  def.stack_size = 16U;
  zplc_sched_core_init(&core, slots, TASKS, 0U);
  zplc_vm_init(&vms[0]);
  zplc_vm_set_entry(&vms[0], def.entry_point, 16U);
  vms[0].task_id = def.id;
  (void)zplc_sched_core_add_task(&core, &def, &vms[0]);
  zplc_sched_core_set_running(&core);
}

/** One scan, ten milliseconds after the previous one. */
static int scan_with(const zplc_sched_port_t *p, zplc_sched_scan_report_t *report) {
  uint8_t order[TASKS];
  uint8_t count;
  const uint64_t release = clock_us + 10000U;

  clock_us = release;
  (void)zplc_sched_core_admit(&core, 0U, release, release);
  count = zplc_sched_core_collect(&core, order, TASKS);
  return zplc_sched_core_scan(&core, p, order, count, 0, report);
}

static int scan(zplc_sched_scan_report_t *report) {
  clock_ms += 10U;
  return scan_with(&port, report);
}

/* ---- the plant, as the link engine drives it ---- */
#define T_BOOL(bit) ((uint8_t)((bit) << 2))
#define T_REAL 0x02U

static uint16_t plant_id;
static uint32_t seq;

static uint8_t *ipi(void) { return zplc_mem_get_region(ZPLC_MEM_IPI_BASE); }
static uint8_t *opi(void) { return zplc_mem_get_region(ZPLC_MEM_OPI_BASE); }

/** Entry E1: inputs A (IPI 0.0), B (IPI 0.1), R REAL (IPI 4); outputs O0 (OPI 0.0), O1 (OPI 0.1), OR REAL (OPI 4). */
static int enter_full(uint16_t timeout_ms) {
  const uint8_t req[] = {(uint8_t)timeout_ms,
                         (uint8_t)(timeout_ms >> 8),
                         3U,
                         3U,
                         0U,
                         0U,
                         T_BOOL(0),
                         0U,
                         0U,
                         T_BOOL(1),
                         4U,
                         0U,
                         T_REAL,
                         0U,
                         0U,
                         T_BOOL(0),
                         0U,
                         0U,
                         T_BOOL(1),
                         4U,
                         0U,
                         T_REAL};
  uint8_t rsp[16];
  uint16_t rl = 0U;
  const int rc = zplc_plant_enter(req, (uint16_t)sizeof(req), rsp, &rl);

  plant_id = (uint16_t)((uint16_t)rsp[0] | (uint16_t)((uint16_t)rsp[1] << 8));
  seq = 0U;
  return rc;
}

/** Entry E2: input A only (IPI 0.0); output O0 (OPI 0.0). */
static int enter_a(uint16_t timeout_ms) {
  const uint8_t req[] = {(uint8_t)timeout_ms, (uint8_t)(timeout_ms >> 8), 1U, 1U, 0U, 0U, T_BOOL(0), 0U, 0U, T_BOOL(0)};
  uint8_t rsp[16];
  uint16_t rl = 0U;
  const int rc = zplc_plant_enter(req, (uint16_t)sizeof(req), rsp, &rl);

  plant_id = (uint16_t)((uint16_t)rsp[0] | (uint16_t)((uint16_t)rsp[1] << 8));
  seq = 0U;
  return rc;
}

/** A frame with the next sequence; the REAL is sent for E1 only. The response (status excluded) goes to @p out. */
static int send(uint8_t bitmap, uint32_t real, int has_real, uint8_t *out) {
  uint8_t req[16];
  uint8_t rsp[32];
  uint16_t rl = 0U;
  uint16_t n = 7U;
  int rc;

  seq++;
  req[0] = (uint8_t)plant_id;
  req[1] = (uint8_t)(plant_id >> 8);
  req[2] = (uint8_t)seq;
  req[3] = (uint8_t)(seq >> 8);
  req[4] = (uint8_t)(seq >> 16);
  req[5] = (uint8_t)(seq >> 24);
  req[6] = bitmap;
  if (has_real != 0) {
    req[7] = (uint8_t)real;
    req[8] = (uint8_t)(real >> 8);
    req[9] = (uint8_t)(real >> 16);
    req[10] = (uint8_t)(real >> 24);
    n = 11U;
  }
  rc = zplc_plant_frame(req, n, rsp, &rl);
  if (rc == 0 && out != NULL) {
    memcpy(out, rsp, rl);
  }
  return rc;
}

static int send_a(uint8_t a) { return send(a, 0U, 0, NULL); }

/* ======================================================================================================== */
/* The attack                                                                                               */
/* ======================================================================================================== */

/* The same board with DO1 safe at 1: a glitch to the unsafe level shows as a write of 0 to DO1. */
static const zplc_io_channel_t channels_safe1[] = {
    /* id    pin    offset kind                   dir                   bit hal safe req */
    {"DO0", "GP0", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U},
    {"DO1", "GP1", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 1U, 1U, 1U, 1U},
    {"DI0", "GP2", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 0U, 0U, 0U, 1U},
    {"DI1", "GP3", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 1U, 1U, 0U, 1U},
};
static const zplc_io_table_t table_safe1 = {"plant-attack-board-safe1", 0x9A17C0DFU, 1U, 1U, 4U, channels_safe1};

#define ERR_BAD ((int)ZPLC_PROTO_ERR_BAD_REQUEST)
#define ERR_RANGE ((int)ZPLC_PROTO_ERR_RANGE)
#define ERR_NOSESSION ((int)ZPLC_PROTO_ERR_NO_SESSION)
#define ERR_BUSY ((int)ZPLC_PROTO_ERR_BUSY)

static uint16_t granted_timeout;

/** Entry with the given counts and descriptors; fills plant_id and granted_timeout. */
static int enter_desc(uint16_t timeout_ms, uint8_t n_in, uint8_t n_out, const uint8_t *desc, uint16_t desc_len) {
  uint8_t req[4 + 3 * 64];
  uint8_t rsp[16];
  uint16_t rl = 0U;
  int rc;

  req[0] = (uint8_t)timeout_ms;
  req[1] = (uint8_t)(timeout_ms >> 8);
  req[2] = n_in;
  req[3] = n_out;
  memcpy(req + 4, desc, desc_len);
  rc = zplc_plant_enter(req, (uint16_t)(4U + desc_len), rsp, &rl);
  if (rc == 0) {
    plant_id = (uint16_t)((uint16_t)rsp[0] | (uint16_t)((uint16_t)rsp[1] << 8));
    granted_timeout = (uint16_t)((uint16_t)rsp[7] | (uint16_t)((uint16_t)rsp[8] << 8));
    seq = 0U;
  }
  return rc;
}

/** A frame for entry E2 (one BOOL input) with an explicit sequence. */
static int send_seq(uint32_t s, uint8_t bitmap) {
  uint8_t req[7];
  uint8_t rsp[32];
  uint16_t rl = 0U;

  req[0] = (uint8_t)plant_id;
  req[1] = (uint8_t)(plant_id >> 8);
  req[2] = (uint8_t)s;
  req[3] = (uint8_t)(s >> 8);
  req[4] = (uint8_t)(s >> 16);
  req[5] = (uint8_t)(s >> 24);
  req[6] = bitmap;
  return zplc_plant_frame(req, 7U, rsp, &rl);
}

/** A frame of any length: the id and the sequence are right, every other byte is @p fill. */
static int send_len(uint16_t len, uint32_t s, uint8_t fill) {
  static uint8_t req[1100];
  uint8_t rsp[160];
  uint16_t rl = 0U;

  memset(req, fill, sizeof(req));
  req[0] = (uint8_t)plant_id;
  req[1] = (uint8_t)(plant_id >> 8);
  req[2] = (uint8_t)s;
  req[3] = (uint8_t)(s >> 8);
  req[4] = (uint8_t)(s >> 16);
  req[5] = (uint8_t)(s >> 24);
  return zplc_plant_frame(req, len, rsp, &rl);
}

static zplc_plant_stats_t stats(void) {
  zplc_plant_stats_t s;

  zplc_plant_get_stats(&s);
  return s;
}

/** The STOP path of an adapter, as the Zephyr one runs it: admission closed, the image reset, the pins safe. */
static void stop_path(void) {
  zplc_sched_core_set_stopped(&core);
  (void)zplc_sched_core_apply_safe_outputs(&core, &port);
}

/* ---- LNK-018: sequence ---- */
static void attack_seq_wraps_around_0x7fffffff(void) {
  printf("\n=== attack_seq_wraps_around_0x7fffffff (LNK-018, R-M6-2) ===\n");
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "entry");
  CHECK(send_seq(0x7FFFFFFEU, 1U) == 0, "the first frame of an entry takes any sequence");
  CHECK(send_seq(0x7FFFFFFFU, 1U) == 0, "0x7FFFFFFF follows 0x7FFFFFFE");
  CHECK(send_seq(0x80000000U, 1U) == 0, "0x80000000 follows 0x7FFFFFFF (the sign bit is not a wrap)");
  CHECK(send_seq(0x7FFFFFFFU, 1U) == ERR_BAD, "0x7FFFFFFF is a replay once 0x80000000 was seen");
  CHECK(send_seq(0x80000000U, 1U) == ERR_BAD, "an equal sequence is a replay");
  CHECK(send_seq(0xFFFFFFFFU, 1U) == 0, "0xFFFFFFFF is 0x7FFFFFFF ahead of 0x80000000: newest");
  CHECK(send_seq(0x00000000U, 1U) == 0, "0 follows 0xFFFFFFFF: the counter wrapped");
  CHECK(send_seq(0xFFFFFFFFU, 1U) == ERR_BAD, "0xFFFFFFFF is old after the wrap");
  CHECK(send_seq(0x80000000U, 1U) == ERR_BAD, "a jump of exactly 2^31 is refused");
  CHECK(send_seq(0x7FFFFFFFU, 1U) == 0, "a jump of 2^31 - 1 is the newest allowed");
  CHECK(stats().rejected == 4U && stats().frames == 6U, "four rejected, six accepted");
  CHECK(zplc_plant_active() == 1, "the rejects were never eight in a row: the mode is still active");
}

/* ---- LNK-018: lengths ---- */
static void attack_frame_lengths(void) {
  const uint16_t lens[] = {0U, 1U, 2U, 5U, 6U, 8U, 9U, 64U, 512U, 1024U};
  zplc_sched_scan_report_t report;
  uint32_t s = 100U;
  size_t i;
  unsigned bad = 0U;

  printf("\n=== attack_frame_lengths (LNK-018, R-M6-2) ===\n");
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "entry E2: in_bytes = 1, so a frame is 7 bytes");
  for (i = 0U; i < sizeof(lens) / sizeof(lens[0]); i++) {
    char msg[96];

    CHECK(send_seq(s++, 1U) == 0, "a good frame sets the input");
    CHECK(send_len(lens[i], s++, 0U) == ERR_BAD, "a frame of the wrong length is BAD_REQUEST");
    bad++;
    (void)scan(&report);
    snprintf(msg, sizeof(msg), "length %u changed no input", (unsigned)lens[i]);
    CHECK((ipi()[0] & 1U) == 1U, msg);
  }
  CHECK(stats().rejected == bad, "every wrong length was counted");
  CHECK(send_len(7U, s++, 1U) == 0, "and the exact length is still accepted");

  setup(0, 1);
  {
    const uint8_t out_only[3] = {0U, 0U, T_BOOL(0)}; /* one output, no input */
    CHECK(enter_desc(500U, 0U, 1U, out_only, 3U) == 0, "an entry with outputs only is legal");
    CHECK(send_len(6U, 1U, 0U) == 0, "its frame is 6 bytes: id and sequence");
    CHECK(send_len(5U, 2U, 0U) == ERR_BAD && send_len(7U, 3U, 0U) == ERR_BAD, "5 and 7 bytes are refused");
  }
}

/* ---- R-M6-1 and R-M6-4: timeout field, empty directions ---- */
static void attack_entry_timeout_and_counts(void) {
  const uint8_t one_in[3] = {0U, 0U, T_BOOL(0)};
  const uint8_t two[6] = {0U, 0U, T_BOOL(0), 0U, 0U, T_BOOL(0)};
  const uint16_t asks[] = {0U, 49U, 50U, 2000U, 2001U, 0xFFFFU};
  const uint16_t want[] = {50U, 50U, 50U, 2000U, 2000U, 2000U};
  size_t i;

  printf("\n=== attack_entry_timeout_and_counts (R-M6-1, R-M6-4) ===\n");
  setup(0, 1);
  for (i = 0U; i < sizeof(asks) / sizeof(asks[0]); i++) {
    char msg[96];

    CHECK(enter_desc(asks[i], 1U, 1U, two, 6U) == 0, "the entry is accepted whatever the timeout asked");
    snprintf(msg, sizeof(msg), "timeout %u is granted as %u", (unsigned)asks[i], (unsigned)want[i]);
    CHECK(granted_timeout == want[i], msg);
    CHECK(zplc_plant_exit(0U) == 0, "closed");
  }
  CHECK(enter_desc(500U, 0U, 1U, one_in, 3U) == 0, "n_in = 0, n_out = 1: outputs only");
  CHECK(zplc_plant_exit(0U) == 0, "closed");
  CHECK(enter_desc(500U, 1U, 0U, one_in, 3U) == 0, "n_in = 1, n_out = 0: inputs only");
  CHECK(zplc_plant_exit(0U) == 0, "closed");
  CHECK(enter_desc(500U, 33U, 0U, one_in, 3U) == ERR_BAD, "n_in above the slot limit is BAD_REQUEST (the lengths cannot add up either)");
  /* The plan (F5 list): "one with neither is BAD_REQUEST". R-M6-1 does not list it; the mode is harmless but empty. */
  ADVISORY(enter_desc(500U, 0U, 0U, one_in, 0U) == ERR_BAD, "an entry with neither inputs nor outputs is BAD_REQUEST (plan F5 text)");
  (void)zplc_plant_exit(0U);

  setup(0, 1);
  CHECK(enter_desc(100U, 1U, 1U, two, 6U) == 0 && granted_timeout == 100U, "entry with 100 ms");
  CHECK(send_seq(1U, 1U) == 0, "frame at t0");
  clock_ms += 100U;
  CHECK(zplc_plant_tick() == 0, "age == timeout does not fire");
  clock_ms += 1U;
  CHECK(zplc_plant_tick() == 1 && zplc_plant_exit_reason() == (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_TIMEOUT,
        "timeout + 1 ms fires TIMEOUT");
}

/* ---- LNK-018: values ---- */
static void attack_real_values_and_padding(void) {
  const struct {
    uint32_t bits;
    int accepted;
    const char *name;
  } reals[] = {
      {0x7FA00000U, 0, "a signalling NaN"},
      {0x7FC00000U, 0, "a quiet NaN"},
      {0xFFC00001U, 0, "a negative NaN with payload"},
      {0x7F800000U, 0, "+infinity"},
      {0xFF800000U, 0, "-infinity"},
      {0x7F800001U, 0, "the smallest signalling NaN"},
      {0x00000001U, 1, "the smallest denormal"},
      {0x007FFFFFU, 1, "the largest denormal"},
      {0x80000000U, 1, "negative zero"},
      {0x7F7FFFFFU, 1, "the largest finite"},
      {0xFF7FFFFFU, 1, "the most negative finite"},
  };
  zplc_sched_scan_report_t report;
  size_t i;

  printf("\n=== attack_real_values_and_padding (LNK-018, R-M6-2) ===\n");
  setup(0, 1);
  CHECK(enter_full(500U) == 0, "entry E1: two BOOL inputs and a REAL");
  CHECK(send(0x03U, 0x3F800000U, 1, NULL) == 0, "a good frame");
  for (i = 0U; i < sizeof(reals) / sizeof(reals[0]); i++) {
    char msg[128];
    const int rc = send(0x00U, reals[i].bits, 1, NULL);

    snprintf(msg, sizeof(msg), "%s is %s", reals[i].name, reals[i].accepted != 0 ? "accepted" : "refused");
    CHECK((rc == 0) == (reals[i].accepted != 0), msg);
    (void)scan(&report);
    if (reals[i].accepted != 0) {
      const uint8_t *p = ipi() + 4;
      const uint32_t got = (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
      snprintf(msg, sizeof(msg), "%s reaches the image bit for bit", reals[i].name);
      CHECK(got == reals[i].bits, msg);
    } else {
      snprintf(msg, sizeof(msg), "%s changed no input", reals[i].name);
      CHECK((ipi()[0] & 3U) == 3U, msg);
      CHECK(send(0x03U, 0x3F800000U, 1, NULL) == 0, "a good frame between the refusals");
    }
  }
  CHECK(send(0x04U, 0x3F800000U, 1, NULL) == ERR_BAD, "padding bit 2 of the bitmap set is refused");
  CHECK(send(0x80U, 0x3F800000U, 1, NULL) == ERR_BAD, "padding bit 7 of the bitmap set is refused");
  CHECK(send(0x03U, 0x3F800000U, 1, NULL) == 0, "and the clean bitmap is accepted");

  {
    /* Nine BOOLs: a two byte bitmap whose seven top bits are padding. Eight BOOLs: no padding at all. */
    uint8_t d9[27 + 3];
    uint8_t req[16];
    uint8_t rsp[16];
    uint16_t rl = 0U;
    int b;

    setup(0, 1);
    for (b = 0; b < 9; b++) {
      d9[b * 3] = (uint8_t)(b / 8);
      d9[b * 3 + 1] = 0U;
      d9[b * 3 + 2] = (uint8_t)T_BOOL(b % 8);
    }
    d9[27] = 0U;
    d9[28] = 0U;
    d9[29] = T_BOOL(0);
    CHECK(enter_desc(500U, 9U, 1U, d9, 30U) == 0, "entry with nine BOOL inputs over two bytes");
    memset(req, 0, sizeof(req));
    req[0] = (uint8_t)plant_id;
    req[1] = (uint8_t)(plant_id >> 8);
    req[2] = 1U;
    req[6] = 0xFFU;
    req[7] = 0x01U;
    CHECK(zplc_plant_frame(req, 8U, rsp, &rl) == 0, "all nine set: 0xFF 0x01");
    req[2] = 2U;
    req[7] = 0x03U;
    CHECK(zplc_plant_frame(req, 8U, rsp, &rl) == ERR_BAD, "bit 9 (padding of the second byte) set is refused");
    req[2] = 3U;
    req[6] = 0x00U;
    req[7] = 0x80U;
    CHECK(zplc_plant_frame(req, 8U, rsp, &rl) == ERR_BAD, "bit 15 set is refused");
    req[2] = 4U;
    req[7] = 0x00U;
    CHECK(zplc_plant_frame(req, 8U, rsp, &rl) == 0, "all clear is accepted");
  }
  {
    uint8_t d8[24 + 3];
    uint8_t req[8];
    uint8_t rsp[16];
    uint16_t rl = 0U;
    int b;

    setup(0, 1);
    for (b = 0; b < 8; b++) {
      d8[b * 3] = 0U;
      d8[b * 3 + 1] = 0U;
      d8[b * 3 + 2] = (uint8_t)T_BOOL(b);
    }
    d8[24] = 0U;
    d8[25] = 0U;
    d8[26] = T_BOOL(0);
    CHECK(enter_desc(500U, 8U, 1U, d8, 27U) == 0, "entry with eight BOOL inputs: a one byte bitmap with no padding");
    memset(req, 0, sizeof(req));
    req[0] = (uint8_t)plant_id;
    req[1] = (uint8_t)(plant_id >> 8);
    req[2] = 1U;
    req[6] = 0xFFU;
    CHECK(zplc_plant_frame(req, 7U, rsp, &rl) == 0, "0xFF is a legal bitmap of eight BOOLs");
  }
}

/* ---- LNK-006: forces around the entry ---- */
static void attack_forced_input_before_entry_and_after(void) {
  zplc_sched_scan_report_t report;
  const uint8_t forced[1] = {0x00U};
  int k;

  printf("\n=== attack_forced_input_before_entry_and_after (LNK-006) ===\n");
  setup(0, 1);
  CHECK(zplc_force_set_bytes((uint16_t)(ZPLC_MEM_IPI_BASE + 0U), forced, 1U) == 0, "the input byte is forced before the entry");
  CHECK(enter_a(500U) == 0, "entry");
  pin_in[1] = 1U;
  for (k = 0; k < 5; k++) {
    CHECK(send_a(1U) == 0, "a frame says DI0 is on");
    (void)scan(&report);
    CHECK((ipi()[0] & 3U) == 0U, "the forced byte holds, for the bound bit and for the pin bit of its byte");
  }
  CHECK(zplc_force_get_count() == 1U, "entering and frames did not touch the force table");
  CHECK(zplc_force_clear((uint16_t)(ZPLC_MEM_IPI_BASE + 0U)) == 0, "the force is cleared while the mode runs");
  CHECK(send_a(1U) == 0, "next frame");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 1U, "the plant value reaches the image on the next scan");
  CHECK(zplc_force_set_bytes((uint16_t)(ZPLC_MEM_IPI_BASE + 0U), forced, 1U) == 0, "a force set while the mode runs");
  CHECK(send_a(1U) == 0, "next frame");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 0U, "wins at once");
  stop_path();
  CHECK(zplc_force_get_count() == 0U, "the exit clears the forces with the run (RT-017)");
}

/* ---- LNK-010, R-M6-6: the order and the count of the pin writes ---- */
static void attack_pin_writes_during_hold_never_glitch(void) {
  zplc_sched_scan_report_t report;
  size_t i;
  size_t at;
  int k;

  printf("\n=== attack_pin_writes_during_hold_never_glitch (LNK-010, R-M6-6) ===\n");
  setup(0, 1);
  cur_table = &table_safe1;
  CHECK(enter_full(500U) == 0, "entry E1 on a board whose DO1 is safe at 1");
  pin_log[0] = '\0';
  for (k = 0; k < 5; k++) {
    CHECK(send(0x01U, 0x3F800000U, 1, NULL) == 0, "A on, B off: the program raises DO0 and drops DO1");
    (void)scan(&report);
  }
  CHECK((opi()[0] & 3U) == 1U, "the image carries the program's outputs: DO0 = 1, DO1 = 0");
  CHECK(strcmp(pin_log, "0101010101") == 0, "ten writes in five scans, exactly two per scan, always DO0 = 0 then DO1 = 1");

  zplc_plant_set_mirror(1U);
  pin_log[0] = '\0';
  CHECK(send(0x01U, 0x3F800000U, 1, NULL) == 0, "frame");
  (void)scan(&report);
  CHECK(strcmp(pin_log, "10") == 0, "mirror on: the pins follow the image (DO0 = 1, DO1 = 0), two writes");
  zplc_plant_set_mirror(0U);
  pin_log[0] = '\0';
  CHECK(send(0x01U, 0x3F800000U, 1, NULL) == 0, "frame");
  (void)scan(&report);
  CHECK(strcmp(pin_log, "01") == 0, "mirror off: the very next commit is the safe level, two writes");

  /* mirror on, then the exit rule fires in the same scan as the mirror is set again */
  zplc_plant_set_mirror(1U);
  CHECK(send(0x01U, 0x3F800000U, 1, NULL) == 0, "frame");
  (void)scan(&report);
  CHECK(pin_out[0] == 1U && pin_out[1] == 0U, "mirrored: DO0 high, DO1 at the unsafe level");
  clock_ms += 600U;
  zplc_plant_set_mirror(1U);
  pin_log[0] = '\0';
  (void)scan(&report);
  CHECK(report.plant_exit == 1U && report.committed == 1U, "the scan that fires the exit still commits");
  CHECK(strcmp(pin_log, "01") == 0, "its commit is held: the safe level, DO1 never written to 0");
  stop_path();
  CHECK(strcmp(pin_log, "0101") == 0, "the stop adds one more safe drive and nothing else");
  at = strlen(pin_log);
  for (i = 0U; i < at; i++) {
    CHECK(pin_log[i] == ((i % 2U) == 0U ? '0' : '1'), "every write after the exit rule fired is the safe level");
  }
  CHECK(pin_out[0] == 0U && pin_out[1] == 1U, "the pins rest at the safe levels");
  CHECK(zplc_plant_exit_reason() == (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_TIMEOUT, "and the reason kept is TIMEOUT");
}

/* ---- LNK-011: the exit in the scan that also faults ---- */
static void attack_exit_and_fault_in_one_scan(void) {
  zplc_sched_scan_report_t report;
  int mirror;

  printf("\n=== attack_exit_and_fault_in_one_scan (LNK-011, R-M6-5) ===\n");
  for (mirror = 0; mirror < 2; mirror++) {
    setup(1, 1);
    CHECK(enter_a(100U) == 0, "entry; the program faults on its first scan");
    if (mirror != 0) {
      zplc_plant_set_mirror(1U);
    }
    clock_ms += 500U;
    pin_high_writes = 0U;
    (void)scan(&report);
    CHECK(report.faulted == 1U && report.plant_exit == 0U, "the scan faulted; the fault, not the report, ends the mode");
    CHECK(zplc_sched_core_is_running(&core) == 0, "the runtime is not running");
    CHECK(zplc_plant_active() == 0 && zplc_plant_holds_outputs() == 0, "the mode is inactive");
    CHECK(zplc_plant_exit_reason() == (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_TIMEOUT ||
              zplc_plant_exit_reason() == (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_FAULT,
          "the reason is TIMEOUT (it fired first) or FAULT");
    CHECK(pin_high_writes == 0U && pin_out[0] == 0U && pin_out[1] == 0U, "no pin went high and both rest at safe");
    CHECK(opi()[0] == 0U && opi()[4] == 0U, "the output image is reset");
    CHECK(send_a(1U) == ERR_STATE, "a frame is refused");
    CHECK(stop_releases_calls >= 1U, "the stop-side release ran");
  }
}

/* ---- LNK-011 window: scans between the exit rule and the stop ---- */
static void attack_scan_between_fire_and_stop(void) {
  zplc_sched_scan_report_t report;
  int k;

  printf("\n=== attack_scan_between_fire_and_stop (LNK-011, R-M6-5) ===\n");
  /* TIMEOUT: the firing scan latched plant values (before its tick); the next scan, before the deferred stop ran, did not. */
  setup(0, 1);
  CHECK(enter_a(100U) == 0, "entry");
  pin_in[0] = 1U;
  CHECK(send_a(0U) == 0, "the plant says DI0 is off while its pin reads on");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 0U, "plant value in the image");
  clock_ms += 200U;
  (void)scan(&report);
  CHECK(report.plant_exit == 1U && (ipi()[0] & 1U) == 0U && pin_high_writes == 0U, "the firing scan: plant value, outputs held");
  (void)scan(&report);
  ADVISORY((ipi()[0] & 1U) == 0U, "a scan after the exit rule fired and before the stop does not feed the bound input from its pin");
  CHECK(pin_high_writes == 0U, "but the outputs stay held in that window");
  stop_path();

  /* PROTOCOL: eight rejected frames fire the rule on the link thread between scans: the firing scan has no plant values. */
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "entry");
  pin_in[0] = 1U;
  CHECK(send_a(0U) == 0, "the plant says DI0 is off while its pin reads on");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 0U, "plant value in the image");
  for (k = 0; k < 8; k++) {
    CHECK(send_len(3U, 50U + (uint32_t)k, 0U) == ERR_BAD, "a malformed frame");
  }
  CHECK(zplc_plant_holds_outputs() == 1 && zplc_plant_exit_reason() == (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_PROTOCOL,
        "eight in a row fire PROTOCOL");
  CHECK(send_a(0U) == ERR_STATE, "a good frame after it is refused");
  (void)scan(&report);
  CHECK(report.plant_exit == 1U, "the next scan reports the exit");
  ADVISORY((ipi()[0] & 1U) == 0U, "the scan that reports a PROTOCOL exit still runs on the plant value, not the pin");
  stop_path();
}

/* ---- R-M6-3, LNK-007, LNK-015: the lock the scan failed to try ---- */
static void attack_latch_lock_miss_does_not_hand_the_input_back_to_the_pin(void) {
  zplc_sched_scan_report_t report;

  printf("\n=== attack_latch_lock_miss_does_not_hand_the_input_back_to_the_pin (R-M6-3, LNK-007, LNK-015) ===\n");
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "entry binds DI0, whose board pin reads off");
  pin_in[0] = 0U;
  CHECK(send_a(1U) == 0, "the plant says DI0 is on");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 1U && (opi()[0] & 1U) == 1U, "scan 1: the image and the program's output carry the plant value");
  lock_fail = 1; /* the link thread holds the plant lock at the instant of the scan's latch */
  (void)scan(&report);
  lock_fail = 0;
  CHECK(report.faulted == 0U, "the scan was not delayed or faulted by the lock");
  BLOCKER((ipi()[0] & 1U) == 1U, "R-M6-3: a latch that misses the lock goes on with the values already in the image (DI0 stays on)");
  BLOCKER((opi()[0] & 1U) == 1U, "the program does not see its bound input fall to the pin level for one scan");
  CHECK(stats().late >= 1U, "the scan was counted late");
  CHECK(send_a(1U) == 0, "the next frame is accepted");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 1U, "and the next scan has the plant value again");
}

/* ---- R-M6-1, R-M6-2: a new entry owns nothing of the old one ---- */
static void attack_reentry_owns_nothing_of_the_previous_entry(void) {
  zplc_sched_scan_report_t report;
  uint16_t first;
  unsigned i;
  uint16_t last = 0U;
  int ok = 1;

  printf("\n=== attack_reentry_owns_nothing_of_the_previous_entry (R-M6-1, R-M6-2) ===\n");
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "entry");
  first = plant_id;
  pin_in[0] = 0U;
  CHECK(send_a(1U) == 0, "a frame sets DI0 on");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 1U, "applied");
  zplc_sched_core_set_stopped(&core);
  (void)zplc_sched_core_apply_safe_outputs(&core, &port);
  CHECK(zplc_plant_active() == 0, "left");
  zplc_sched_core_set_running(&core);
  CHECK(enter_a(500U) == 0 && plant_id != first, "a second entry has a new plant id");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 0U, "before its first frame nothing of the old staging is applied: the pin value stands");
  CHECK(stats().frames == 0U && stats().rejected == 0U && stats().late >= 1U, "counters restarted, the empty latch counted late");
  {
    const uint16_t keep = plant_id;
    plant_id = first;
    CHECK(send_seq(1U, 1U) == ERR_BAD, "a frame of the old plant id is refused");
    plant_id = keep;
  }
  CHECK(send_seq(1U, 1U) == 0, "sequence 1 is new again for the new entry");
  /* ids: never 0, strictly consecutive, wrap */
  setup(0, 1);
  for (i = 0U; i < 70000U; i++) {
    if (enter_a(500U) != 0) {
      ok = 0;
      break;
    }
    if (plant_id == 0U || (last != 0U && plant_id != (uint16_t)(last + 1U) && !(last == 0xFFFFU && plant_id == 1U))) {
      ok = 0;
    }
    last = plant_id;
    (void)zplc_plant_exit(0U);
  }
  CHECK(ok == 1, "70000 entries: the plant id is never 0 and wraps 0xFFFF to 1");
}

/* ---- mirror and the exit rule ---- */
static void attack_mirror_rules(void) {
  zplc_sched_scan_report_t report;
  int k;

  printf("\n=== attack_mirror_rules (LNK-010, D-16) ===\n");
  setup(0, 1);
  zplc_plant_set_mirror(1U);
  CHECK(zplc_plant_holds_outputs() == 0 && zplc_plant_active() == 0, "mirror on while no mode is active is ignored");
  CHECK(enter_a(500U) == 0, "entry");
  CHECK(zplc_plant_holds_outputs() == 1, "mirror is off at entry, whatever was asked before");
  zplc_plant_set_mirror(1U);
  CHECK(zplc_plant_holds_outputs() == 0, "a person turns it on");
  CHECK(zplc_plant_exit(0U) == 0 && enter_a(500U) == 0 && zplc_plant_holds_outputs() == 1, "a new entry starts with mirror off again");
  zplc_plant_set_mirror(1U);
  clock_ms += 600U;
  CHECK(zplc_plant_tick() == 1, "the rule fires");
  CHECK(zplc_plant_holds_outputs() == 1, "hold is unconditional once fired, mirror or not");
  zplc_plant_set_mirror(1U);
  CHECK(zplc_plant_holds_outputs() == 1, "turning mirror on after the rule fired changes nothing");
  (void)zplc_plant_exit(1U);

  /* seven rejects, a good frame, seven rejects: no exit; eight: PROTOCOL */
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "entry");
  for (k = 0; k < 7; k++) {
    CHECK(send_len(3U, 1U + (uint32_t)k, 0U) == ERR_BAD, "reject");
  }
  CHECK(send_seq(10U, 1U) == 0, "a good frame resets the run of rejects");
  for (k = 0; k < 7; k++) {
    CHECK(send_len(3U, 20U + (uint32_t)k, 0U) == ERR_BAD, "reject");
  }
  CHECK(zplc_plant_tick() == 0 && zplc_plant_holds_outputs() == 1, "fourteen rejects in two runs of seven: no exit");
  CHECK(send_len(3U, 40U, 0U) == ERR_BAD, "the eighth in a row");
  CHECK(zplc_plant_tick() == 1 && zplc_plant_exit_reason() == (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_PROTOCOL, "PROTOCOL");
  (void)scan(&report);

  /* rejected frames never refresh the age */
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "entry, 500 ms");
  CHECK(send_seq(1U, 1U) == 0, "a good frame at t0");
  for (k = 0; k < 6; k++) {
    clock_ms += 90U;
    CHECK(send_len(3U, 100U + (uint32_t)k, 0U) == ERR_BAD, "a reject every 90 ms");
    (void)zplc_plant_tick();
    if (k == 4) {
      CHECK(zplc_plant_holds_outputs() == 1, "(the rejects continue)");
    }
  }
  CHECK(zplc_plant_tick() == 1 && zplc_plant_exit_reason() == (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_TIMEOUT,
        "540 ms after the last good frame the timeout fired although frames kept coming");
}

/* ---- LNK-003, LNK-015: the scan thread and the link thread racing at the latch ---- */
#define RACE_FRAMES 4000U
static volatile int race_done;
static unsigned race_accepted;

static void *race_link_thread(void *arg) {
  uint32_t k;

  (void)arg;
  for (k = 1U; k <= RACE_FRAMES; k++) {
    uint8_t rsp[32];
    const uint8_t bit = (uint8_t)(k & 1U);

    if (send((uint8_t)(bit | (bit << 1)), 0x3F800000U | k, 1, rsp) == 0) {
      race_accepted++;
    }
    if ((k % 7U) == 0U) {
      zplc_plant_set_mirror((uint8_t)(k & 1U)); /* a person toggling mirroring */
    }
    if ((k % 11U) == 0U) {
      zplc_plant_stats_t s;
      zplc_plant_get_stats(&s);
    }
  }
  race_done = 1;
  return NULL;
}

static void attack_latch_race_never_tears_an_image(void) {
  pthread_t thread;
  zplc_sched_scan_report_t report;
  unsigned scans = 0U;
  unsigned torn = 0U;
  unsigned seen = 0U;

  printf("\n=== attack_latch_race_never_tears_an_image (LNK-003, LNK-015; run under ThreadSanitizer too) ===\n");
  setup(0, 1);
  CHECK(enter_full(2000U) == 0, "entry E1, 2 s timeout");
  race_done = 0;
  race_accepted = 0U;
  CHECK(pthread_create(&thread, NULL, race_link_thread, NULL) == 0, "the link thread starts");
  while (race_done == 0 && scans < 400000U) {
    uint32_t real;
    const uint8_t b0 = ipi()[0];

    (void)b0;
    (void)scan(&report);
    scans++;
    if (stats().frames != 0U) {
      real = (uint32_t)ipi()[4] | ((uint32_t)ipi()[5] << 8) | ((uint32_t)ipi()[6] << 16) | ((uint32_t)ipi()[7] << 24);
      seen++;
      /* A, B and the low bit of R always agree inside one frame; the image is the scan thread's own. */
      if (((ipi()[0] & 1U) != ((ipi()[0] >> 1) & 1U)) || ((ipi()[0] & 1U) != (real & 1U))) {
        torn++;
      }
    }
    if (report.plant_exit != 0U || zplc_plant_active() == 0) {
      break;
    }
  }
  (void)pthread_join(thread, NULL);
  CHECK(scans > 0U && seen > 0U, "scans ran while frames flowed");
  CHECK(torn == 0U, "no scan ever saw half of a frame (A, B and the REAL always from one frame)");
  CHECK(report.faulted == 0U, "no scan faulted");
}

/* ---- the engine with the real module behind a model of the application's port ---- */
static int model_stop_busy;
static unsigned model_exit_calls;

static int m_enter(void *c, const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rl) {
  (void)c;
  if (zplc_sched_core_is_running(&core) == 0) {
    return ERR_STATE;
  }
  return zplc_plant_enter(req, len, rsp, rl);
}
static int m_frame(void *c, const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rl) {
  (void)c;
  return zplc_plant_frame(req, len, rsp, rl);
}
/* lk_plant_exit: hold first (mirror off), stop while the mode is still active, then leave; BUSY when the stop is refused. */
static int m_exit(void *c, uint8_t reason, uint8_t *rsp, uint16_t *rl) {
  zplc_plant_stats_t s;

  (void)c;
  model_exit_calls++;
  if (zplc_plant_active() == 0) {
    return ERR_STATE;
  }
  zplc_plant_get_stats(&s);
  zplc_plant_set_mirror(0U);
  if (model_stop_busy != 0 && zplc_sched_core_is_running(&core) != 0) {
    return ERR_BUSY;
  }
  stop_path();
  (void)zplc_plant_exit(reason);
  if (rsp != NULL && rl != NULL && *rl >= 9U) {
    rsp[0] = reason;
    zplc_put_u32_le(rsp + 1, s.frames);
    rsp[5] = (uint8_t)s.late;
    rsp[6] = (uint8_t)(s.late >> 8);
    rsp[7] = (uint8_t)s.rejected;
    rsp[8] = (uint8_t)(s.rejected >> 8);
    *rl = 9U;
  }
  return 0;
}
static int m_mirror(void *c, uint8_t on, uint8_t *mirror) {
  (void)c;
  if (zplc_plant_active() == 0) {
    return ERR_STATE;
  }
  zplc_plant_set_mirror(on);
  *mirror = zplc_plant_holds_outputs() == 0 ? 1U : 0U;
  return 0;
}
static int m_status(void *c, uint8_t *rsp, uint16_t *rl) {
  (void)c;
  memset(rsp, 0, 14U);
  *rl = 14U;
  return 0;
}
static uint32_t m_now(void *c) {
  (void)c;
  return clock_ms;
}
static int m_random(void *c, uint8_t *out, size_t n) {
  size_t i;

  (void)c;
  for (i = 0U; i < n; i++) {
    out[i] = (uint8_t)(i * 7U + 3U);
  }
  return 0;
}
static int m_key_load(void *c, uint8_t key[32]) {
  (void)c;
  (void)key;
  return 1;
}
static int m_key_store(void *c, const uint8_t key[32]) {
  (void)c;
  (void)key;
  return 0;
}
static int m_key_erase(void *c) {
  (void)c;
  return 0;
}

static zplc_proto_dev_t dev;
static zplc_proto_ops_t ops;

static void engine_reset(void) {
  setup(0, 1);
  model_stop_busy = 0;
  model_exit_calls = 0U;
  memset(&ops, 0, sizeof(ops));
  ops.now_ms = m_now;
  ops.random = m_random;
  ops.key_load = m_key_load;
  ops.key_store = m_key_store;
  ops.key_erase = m_key_erase;
  ops.plant_enter = m_enter;
  ops.plant_frame = m_frame;
  ops.plant_exit = m_exit;
  ops.plant_mirror = m_mirror;
  ops.plant_status = m_status;
  CHECK(zplc_proto_dev_init(&dev, &ops, 30U) == 0, "the engine starts over the real module");
}

typedef struct {
  zplc_proto_link_t link;
  uint8_t kind[8];
  uint8_t message[8];
  uint8_t payload[8][ZPLC_PROTO_PAYLOAD_MAX];
  size_t length[8];
  size_t count;
  uint32_t next_sequence;
} client_t;

static int client_write(void *context, const uint8_t *frame, size_t length) {
  client_t *c = (client_t *)context;
  zplc_proto_frame_t f;

  if (zplc_proto_parse(frame, length, ZPLC_PROTO_PAYLOAD_MAX, &f) == 0 && c->count < 8U) {
    c->kind[c->count] = f.kind;
    c->message[c->count] = f.message;
    c->length[c->count] = f.length;
    memcpy(c->payload[c->count], f.payload, f.length);
    c->count++;
  }
  return 0;
}

static void client_init(client_t *c) {
  memset(c, 0, sizeof(*c));
  zplc_proto_link_init(&c->link, &dev, ZPLC_PROTO_TRANSPORT_SERIAL, client_write, c);
  c->next_sequence = 1U;
}

/** Send a request; returns the status of the response, -1 when none came. */
static int ask(client_t *c, uint8_t message, const uint8_t *payload, size_t length) {
  uint8_t frame[ZPLC_PROTO_FRAME_MAX];
  size_t used;
  size_t total;
  size_t i;

  c->count = 0U;
  used = zplc_proto_begin(frame, sizeof(frame), ZPLC_PROTO_KIND_REQUEST, message, c->next_sequence++, payload, (uint16_t)length, 0);
  total = zplc_proto_finish(frame, used, NULL);
  zplc_proto_link_feed(&c->link, frame, total);
  for (i = c->count; i > 0U; i--) {
    if (c->kind[i - 1U] == ZPLC_PROTO_KIND_RESPONSE && c->length[i - 1U] > 0U) {
      return (int)c->payload[i - 1U][0];
    }
  }
  return -1;
}

static int open_session(client_t *c, uint8_t flags) {
  uint8_t payload[ZPLC_PROTO_SESSION_OPEN_REQ_FIXED];

  memset(payload, 0, sizeof(payload));
  payload[ZPLC_PROTO_SESSION_OPEN_REQ_FLAGS_OFF] = flags;
  memcpy(payload + ZPLC_PROTO_SESSION_OPEN_REQ_NAME_OFF, "attack", 6U);
  return ask(c, ZPLC_PROTO_MSG_SESSION_OPEN, payload, sizeof(payload));
}

/** ENTER for entry E2 over the engine; the plant id of the response is returned in *id. */
static int engine_enter(client_t *c, uint16_t *id) {
  const uint8_t req[10] = {0xF4U, 0x01U, 1U, 1U, 0U, 0U, T_BOOL(0), 0U, 0U, T_BOOL(0)};
  const int rc = ask(c, ZPLC_PROTO_MSG_PLANT_ENTER, req, sizeof(req));

  if (rc == 0 && c->length[c->count - 1U] >= 3U) {
    *id = (uint16_t)((uint16_t)c->payload[c->count - 1U][1] | (uint16_t)((uint16_t)c->payload[c->count - 1U][2] << 8));
  }
  return rc;
}

static int engine_frame(client_t *c, uint16_t id, uint32_t s, uint8_t bitmap) {
  uint8_t req[7];

  req[0] = (uint8_t)id;
  req[1] = (uint8_t)(id >> 8);
  req[2] = (uint8_t)s;
  req[3] = (uint8_t)(s >> 8);
  req[4] = (uint8_t)(s >> 16);
  req[5] = (uint8_t)(s >> 24);
  req[6] = bitmap;
  return ask(c, ZPLC_PROTO_MSG_PLANT_FRAME, req, sizeof(req));
}

static void attack_engine_takeover_then_enter(void) {
  client_t a, b;
  uint16_t id_a = 0U, id_b = 0U;

  printf("\n=== attack_engine_takeover_then_enter (COM-020, LNK-011, LNK-008) ===\n");
  engine_reset();
  client_init(&a);
  client_init(&b);
  CHECK(open_session(&a, 0U) == 0, "link A opens a session");
  CHECK(engine_enter(&a, &id_a) == 0 && zplc_plant_active() == 1, "A enters the mode");
  CHECK(engine_frame(&a, id_a, 1U, 1U) == 0, "A feeds it");
  CHECK(open_session(&b, 1U) == 0, "link B takes the session over (a person at the cable)");
  CHECK(zplc_plant_active() == 0 && zplc_sched_core_is_running(&core) == 0, "A's mode ended with the session: stopped");
  CHECK(pin_out[0] == 0U && pin_out[1] == 0U && opi()[0] == 0U, "the outputs are safe");
  CHECK(engine_enter(&b, &id_b) == ERR_STATE, "B's ENTER right after the takeover meets a stopped runtime: STATE, a person runs it first");
  zplc_sched_core_set_running(&core);
  CHECK(engine_enter(&b, &id_b) == 0 && id_b != id_a, "after RUN, B enters with a new plant id");
  CHECK(engine_frame(&b, id_a, 5U, 1U) == ERR_BAD, "A's old plant id is refused on B's session");
  CHECK(engine_frame(&a, id_b, 9U, 1U) == ERR_NOSESSION, "A, no longer the owner, cannot feed B's mode");
  CHECK(engine_frame(&b, id_b, 1U, 1U) == 0, "B feeds it");
}

static void attack_engine_two_links_alternating(void) {
  client_t a, b;
  uint16_t id = 0U;
  uint8_t one = 1U;
  uint32_t s;
  zplc_plant_stats_t before;

  printf("\n=== attack_engine_two_links_alternating (COM-020, LNK-018) ===\n");
  engine_reset();
  client_init(&a);
  client_init(&b);
  CHECK(open_session(&a, 0U) == 0, "A has the session");
  CHECK(engine_enter(&a, &id) == 0, "A enters");
  CHECK(open_session(&b, 0U) == (int)ZPLC_PROTO_ERR_SESSION_BUSY, "B cannot open a second session without a takeover");
  for (s = 1U; s <= 6U; s++) {
    CHECK(engine_frame(&a, id, s, 1U) == 0, "A's frame is accepted");
    CHECK(engine_frame(&b, id, s + 100U, 0U) == ERR_NOSESSION, "B's frame, right after, has no session");
    CHECK(ask(&b, ZPLC_PROTO_MSG_PLANT_MIRROR, &one, 1U) == ERR_NOSESSION, "nor does B's mirror request");
    CHECK(ask(&b, ZPLC_PROTO_MSG_PLANT_EXIT, NULL, 0U) == ERR_NOSESSION, "nor its exit");
  }
  before = stats();
  CHECK(before.frames == 6U && before.rejected == 0U, "six frames of A, none of B reached the module");
  CHECK(zplc_plant_holds_outputs() == 1, "mirror stayed off");
}

static void attack_engine_lengths_and_floor(void) {
  client_t a;
  uint16_t id = 0U;
  static uint8_t big[ZPLC_PROTO_PAYLOAD_MAX];
  uint8_t two[2] = {1U, 1U};
  uint8_t three = 2U;
  int rc;

  printf("\n=== attack_engine_lengths_and_floor (LNK-018) ===\n");
  engine_reset();
  client_init(&a);
  CHECK(open_session(&a, 0U) == 0, "session");
  CHECK(engine_enter(&a, &id) == 0, "enter");
  CHECK(engine_frame(&a, id, 1U, 1U) == 0, "a good frame");
  CHECK(ask(&a, ZPLC_PROTO_MSG_PLANT_FRAME, NULL, 0U) != 0, "a frame of length 0 is not accepted");
  CHECK(ask(&a, ZPLC_PROTO_MSG_PLANT_FRAME, two, 1U) != 0, "a frame of length 1 is not accepted");
  memset(big, 0, sizeof(big));
  big[0] = (uint8_t)id;
  big[1] = (uint8_t)(id >> 8);
  big[2] = 2U;
  CHECK(ask(&a, ZPLC_PROTO_MSG_PLANT_FRAME, big, sizeof(big)) != 0, "a frame of the engine's largest payload is not accepted");
  CHECK(stats().frames == 1U, "none of them reached the staging");
  rc = ask(&a, ZPLC_PROTO_MSG_PLANT_MIRROR, NULL, 0U);
  CHECK(rc != 0, "PLANT_MIRROR with no payload byte is not answered OK (no stale byte is read as the flag)");
  CHECK(zplc_plant_holds_outputs() == 1, "mirror is still off");
  rc = ask(&a, ZPLC_PROTO_MSG_PLANT_MIRROR, &three, 1U);
  CHECK(rc == ERR_BAD, "enable = 2 is BAD_REQUEST");
  CHECK(ask(&a, ZPLC_PROTO_MSG_PLANT_MIRROR, two, 2U) != 0 || zplc_plant_holds_outputs() == 1,
        "a two byte mirror payload does not turn mirror on by accident");
  CHECK(ask(&a, ZPLC_PROTO_MSG_PLANT_STATUS, NULL, 0U) == 0, "status answers");
  CHECK(ask(&a, ZPLC_PROTO_MSG_PLANT_EXIT, NULL, 0U) == 0 && zplc_plant_active() == 0, "exit closes the mode");
  CHECK(ask(&a, ZPLC_PROTO_MSG_PLANT_EXIT, NULL, 0U) == ERR_STATE, "a second exit is STATE: the event is posted once");
}

static void attack_engine_frame_during_a_run_control_change(void) {
  client_t a;
  uint16_t id = 0U;
  zplc_sched_scan_report_t report;

  printf("\n=== attack_engine_frame_during_a_run_control_change (R-M6-5) ===\n");
  engine_reset();
  client_init(&a);
  CHECK(open_session(&a, 0U) == 0 && engine_enter(&a, &id) == 0, "session and entry");
  CHECK(engine_frame(&a, id, 1U, 1U) == 0, "a frame");
  /* a program load (or STOP, RESET, a pause) arrives: the scheduler core ends the mode with RUN_CONTROL */
  zplc_sched_core_set_stopped(&core);
  (void)zplc_sched_core_apply_safe_outputs(&core, &port);
  CHECK(zplc_plant_active() == 0 && zplc_plant_exit_reason() == (uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_RUN_CONTROL,
        "the mode ended with RUN_CONTROL");
  CHECK(engine_frame(&a, id, 2U, 1U) == ERR_STATE, "the frame that arrives during the change is refused");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 0U && report.committed == 0U, "and no scan applies it");
  CHECK(ask(&a, ZPLC_PROTO_MSG_PLANT_EXIT, NULL, 0U) == ERR_STATE, "a person's exit after it is STATE");
}

/* ---- LNK-017: a response that cannot fit the link ---- */
static void attack_engine_response_larger_than_the_negotiated_payload(void) {
  client_t a;
  uint8_t req[4 + 3 + 3 * 32];
  uint8_t hello[3] = {1U, 0x80U,
                      0x00U}; /* a client that asks for a 128 byte payload: the entry (103 bytes) fits, the response (142) does not */
  uint8_t frame[7];
  unsigned i;
  int enter_rc;
  int frame_rc;

  printf("\n=== attack_engine_response_larger_than_the_negotiated_payload (LNK-017, LNK-018) ===\n");
  engine_reset();
  client_init(&a);
  CHECK(ask(&a, ZPLC_PROTO_MSG_HELLO, hello, sizeof(hello)) == 0, "hello negotiates a 128 byte payload");
  CHECK(open_session(&a, 0U) == 0, "session");
  /* one BOOL input, thirty-two REAL outputs: the PLANT_FRAME response is 1 + 13 + 128 bytes */
  req[0] = 0xF4U;
  req[1] = 0x01U;
  req[2] = 1U;
  req[3] = 32U;
  req[4] = 0U;
  req[5] = 0U;
  req[6] = T_BOOL(0);
  for (i = 0U; i < 32U; i++) {
    req[7 + 3 * i] = (uint8_t)(4U * i);
    req[8 + 3 * i] = 0U;
    req[9 + 3 * i] = 0x02U;
  }
  enter_rc = ask(&a, ZPLC_PROTO_MSG_PLANT_ENTER, req, sizeof(req));
  plant_id = (uint16_t)((uint16_t)a.payload[a.count - 1U][1] | (uint16_t)((uint16_t)a.payload[a.count - 1U][2] << 8));
  frame[0] = (uint8_t)plant_id;
  frame[1] = (uint8_t)(plant_id >> 8);
  frame[2] = 1U;
  frame[3] = 0U;
  frame[4] = 0U;
  frame[5] = 0U;
  frame[6] = 1U;
  frame_rc = ask(&a, ZPLC_PROTO_MSG_PLANT_FRAME, frame, sizeof(frame));
  /* The entry is granted, the frame is staged and counted, and every response is FAILED: the plant never gets its outputs,
   * while its frames keep the timeout alive. The entry should have been refused (RANGE or TOO_LARGE). */
  ADVISORY(enter_rc != 0 || frame_rc == 0,
           "an entry whose frame response cannot fit the negotiated payload is refused at entry, not failed at every frame");
  ADVISORY(!(frame_rc != 0 && stats().frames == 1U), "a frame whose response failed was not applied");
}

static void attack_engine_exit_orphaned_when_the_stop_is_refused(void) {
  client_t a, b;
  uint16_t id = 0U;
  uint8_t on = 1U;
  uint8_t pins_unsafe;

  printf("\n=== attack_engine_exit_orphaned_when_the_stop_is_refused (COM-020, LNK-008, LNK-010) ===\n");
  engine_reset();
  client_init(&a);
  client_init(&b);
  CHECK(open_session(&a, 0U) == 0 && engine_enter(&a, &id) == 0, "A has a session and an entry");
  model_stop_busy = 1; /* zplc_sched_stop answers ERR_LOCK for the whole 100 ms of retries (a program load holds the control lock) */
  CHECK(ask(&a, ZPLC_PROTO_MSG_SESSION_CLOSE, NULL, 0U) == 0, "A closes its session");
  CHECK(zplc_proto_session_is_open(&dev) == 0, "the session is gone");
  CHECK(zplc_plant_active() == 1 && zplc_plant_holds_outputs() == 1,
        "the stop was refused: the mode stays active and held (the documented fallback)");
  CHECK(open_session(&b, 0U) == 0, "B opens a new session");
  /* ADVISORY: the mode outlived its session (COM-020) for at most the staleness bound; in that window another session
   * can drive it. Mirroring is a person's choice per session (D-16): B did not enter this mode. */
  ADVISORY(ask(&b, ZPLC_PROTO_MSG_PLANT_MIRROR, &on, 1U) != 0, "a session that did not enter the mode cannot turn its mirror on");
  pins_unsafe = (uint8_t)(zplc_plant_holds_outputs() == 0 ? 1U : 0U);
  ADVISORY(pins_unsafe == 0U, "the orphaned mode still holds the outputs");
  model_stop_busy = 0;
}

int main(void) {
  const char *strict = getenv("ZPLC_ATTACK_STRICT");

  printf("==== test_plant_attack ====\n");
  attack_seq_wraps_around_0x7fffffff();
  attack_frame_lengths();
  attack_entry_timeout_and_counts();
  attack_real_values_and_padding();
  attack_forced_input_before_entry_and_after();
  attack_pin_writes_during_hold_never_glitch();
  attack_exit_and_fault_in_one_scan();
  attack_scan_between_fire_and_stop();
  attack_latch_lock_miss_does_not_hand_the_input_back_to_the_pin();
  attack_reentry_owns_nothing_of_the_previous_entry();
  attack_mirror_rules();
  attack_latch_race_never_tears_an_image();
  attack_engine_takeover_then_enter();
  attack_engine_two_links_alternating();
  attack_engine_lengths_and_floor();
  attack_engine_frame_during_a_run_control_change();
  attack_engine_response_larger_than_the_negotiated_payload();
  attack_engine_exit_orphaned_when_the_stop_is_refused();
  printf("\n%d checks, %d failed, %d blockers open, %d advisories open\n", test_count, fail_count, blocker_open, advisory_open);
  if (fail_count != 0) {
    return 1;
  }
  return (strict != NULL && strict[0] == '1' && blocker_open != 0) ? 1 : 0;
}
