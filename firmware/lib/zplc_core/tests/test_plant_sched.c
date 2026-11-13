/**
 * @file test_plant_sched.c
 * @brief Plant I/O mode through the scheduler core: bound inputs, the hold of the pins, the exit rule
 *        (LNK-003, LNK-006, LNK-007, LNK-010, LNK-011, LNK-015, LNK-016, IO-013).
 *
 * SPDX-License-Identifier: MIT
 *
 * A scripted plant (the plant module's public API, as the link engine drives it) runs against the real scheduler
 * core through a test port, the way test_sched_core.c does. The board is the one of this file: two input pins and
 * two output pins that share one image byte, with a recording pin driver. Every observable effect is read from
 * the image, the snapshot (the PLANT_FRAME response), the recorded pin writes, the core state and the counters.
 */

#define _POSIX_C_SOURCE 200809L

#include <pthread.h>
#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_exchange.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_plant.h>
#include <zplc_proto_defs.h>
#include <zplc_sched_core.h>
#include <zplc_test_hooks.h>

#include "zplc_test_safe.h"

static int test_count = 0;
static int fail_count = 0;

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

const zplc_io_table_t *zplc_io_table(void) { return &table; }

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
static int h_lock(void *ctx) {
  (void)ctx;
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

/** The checks every exit shares: stopped, safe, image reset, forces cleared, and no scan after it feeds from anywhere. */
static void check_stopped_safe(uint8_t reason, const char *what) {
  char msg[160];
  zplc_sched_scan_report_t report;
  const uint8_t ipi_before = ipi()[0];
  const unsigned reads_before = pin_reads;
  const size_t writes_before = strlen(pin_log);

  snprintf(msg, sizeof(msg), "%s: the runtime is not running", what);
  CHECK(zplc_sched_core_is_running(&core) == 0, msg);
  snprintf(msg, sizeof(msg), "%s: the mode is inactive and kept the reason", what);
  CHECK(zplc_plant_active() == 0 && zplc_plant_holds_outputs() == 0 && zplc_plant_exit_reason() == reason, msg);
  snprintf(msg, sizeof(msg), "%s: the pins are at the safe level and never went high", what);
  CHECK(pin_out[0] == 0U && pin_out[1] == 0U && pin_high_writes == 0U, msg);
  snprintf(msg, sizeof(msg), "%s: the output image is reset and the forces are cleared", what);
  CHECK(opi()[0] == 0U && opi()[4] == 0U && zplc_force_get_count() == 0U, msg);
  snprintf(msg, sizeof(msg), "%s: a frame is refused with ERR_STATE", what);
  CHECK(send_a(1U) == ERR_STATE, msg);
  (void)scan(&report);
  snprintf(msg, sizeof(msg), "%s: no further scan runs, so no pin is sampled and no plant value is applied", what);
  CHECK(report.committed == 0U && pin_reads == reads_before && ipi()[0] == ipi_before && strlen(pin_log) == writes_before, msg);
}

/** The STOP path of an adapter, as the Zephyr one runs it: admission closed, the image reset, the pins safe. */
static void stop_path(void) {
  zplc_sched_core_set_stopped(&core);
  (void)zplc_sched_core_apply_safe_outputs(&core, &port);
}

/* ---- tests ---- */
static void plant_sched_bound_input_overrides_pin_unbound_follows_pin(void) {
  zplc_sched_scan_report_t report;

  printf("\n=== plant_sched_bound_input_overrides_pin_unbound_follows_pin (LNK-007) ===\n");
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "the plant binds input DI0 only");
  pin_in[0] = 0U;
  pin_in[1] = 1U;
  CHECK(send_a(1U) == 0, "a frame says DI0 is on while its pin reads off");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 1U, "the bound input takes the plant value over its pin");
  CHECK((ipi()[0] & 2U) == 2U, "the unbound input still follows its pin");
  pin_in[0] = 1U;
  pin_in[1] = 0U;
  CHECK(send_a(0U) == 0, "the next frame says DI0 is off while its pin reads on");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 0U && (ipi()[0] & 2U) == 0U, "the plant still wins for DI0, and DI1 followed its pin down");
  CHECK(report.plant_exit == 0U, "no exit fired");
}

static void plant_sched_forced_input_wins(void) {
  zplc_sched_scan_report_t report;
  const uint8_t forced[1] = {0x00U};

  printf("\n=== plant_sched_forced_input_wins (LNK-006) ===\n");
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "the plant binds DI0");
  CHECK(zplc_force_set_bytes((uint16_t)(ZPLC_MEM_IPI_BASE + 0U), forced, 1U) == 0, "the input byte is forced to 0");
  CHECK(send_a(1U) == 0, "a frame says DI0 is on");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 0U, "the forced value is what the image holds");
  CHECK(opi()[0] == 0U, "and what the program saw (granularity: a force owns its whole byte range)");
  CHECK(zplc_force_clear((uint16_t)(ZPLC_MEM_IPI_BASE + 0U)) == 0, "the force is released");
  CHECK(send_a(1U) == 0, "the next frame says DI0 is on");
  (void)scan(&report);
  CHECK((ipi()[0] & 1U) == 1U, "and now the plant value reaches the image");
}

/* the link thread of the whole-frame test */
#define WHOLE_FRAMES 3000U
static volatile int link_done;
static unsigned torn_frames;
static unsigned frames_seen_ok;

static void *link_thread(void *arg) {
  uint32_t k;

  (void)arg;
  for (k = 1U; k <= WHOLE_FRAMES; k++) {
    uint8_t out[32];
    const uint8_t bit = (uint8_t)(k & 1U);
    const uint8_t bitmap = (uint8_t)(bit | (bit << 1));
    uint8_t o0, o1;
    uint32_t real;

    /* A, B and the low bit of R always agree within one frame. */
    if (send(bitmap, 0x3F800000U | k, 1, out) != 0) {
      continue;
    }
    frames_seen_ok++;
    o0 = (uint8_t)(out[13] & 1U);
    o1 = (uint8_t)((out[13] >> 1) & 1U);
    real = (uint32_t)out[14] | ((uint32_t)out[15] << 8) | ((uint32_t)out[16] << 16) | ((uint32_t)out[17] << 24);
    if (o0 != o1 || o0 != (uint8_t)(real & 1U)) {
      torn_frames++;
    }
  }
  link_done = 1;
  return NULL;
}

static void plant_sched_frame_applies_whole_at_one_latch(void) {
  pthread_t thread;
  zplc_sched_scan_report_t report;
  unsigned scans = 0U;

  printf("\n=== plant_sched_frame_applies_whole_at_one_latch (LNK-003) ===\n");
  setup(0, 1);
  CHECK(enter_full(2000U) == 0, "the plant binds three inputs and three outputs");
  link_done = 0;
  torn_frames = 0U;
  frames_seen_ok = 0U;
  (void)pthread_create(&thread, NULL, link_thread, NULL);
  while (link_done == 0 || scans < 50U) {
    (void)scan_with(&port, &report);
    scans++;
  }
  (void)pthread_join(thread, NULL);
  CHECK(frames_seen_ok > 100U && scans > 100U, "the scanner and the link thread ran against each other");
  CHECK(torn_frames == 0U, "the outputs of every response are of one frame: BOOLs and REAL never mixed");
  CHECK((ipi()[0] & 3U) == 0U || (ipi()[0] & 3U) == 3U, "and so is the image the program read");
}

static void plant_sched_pins_safe_image_published(void) {
  zplc_sched_scan_report_t report;
  uint8_t out[32];

  printf("\n=== plant_sched_pins_safe_image_published (LNK-010, R-M6-6, R-M6-7) ===\n");
  setup(0, 1);
  CHECK(enter_full(500U) == 0, "the plant binds the echo inputs and outputs");
  CHECK(send(0x01U, 0x3FC00000U, 1, NULL) == 0, "a frame raises A");
  (void)scan(&report);
  CHECK(report.committed == 1U && report.plant_exit == 0U, "the scan committed");
  CHECK((opi()[0] & 1U) == 1U, "the program raised its output: the image carries it");
  CHECK(send(0x01U, 0x3FC00000U, 1, out) == 0 && (out[13] & 1U) == 1U, "and the next response publishes it to the plant");
  CHECK(pin_out[0] == 0U && pin_high_writes == 0U, "while the pin was written at the safe level");
  CHECK(strlen(pin_log) >= 2U, "the pins were written (held), not skipped");
}

static void plant_sched_mirror_on_pins_follow_image(void) {
  zplc_sched_scan_report_t report;

  printf("\n=== plant_sched_mirror_on_pins_follow_image (LNK-010) ===\n");
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "the plant binds DI0");
  CHECK(send_a(1U) == 0, "a frame raises A");
  (void)scan(&report);
  CHECK(pin_out[0] == 0U, "with mirror off the pin is safe");
  zplc_plant_set_mirror(1U);
  CHECK(send_a(1U) == 0, "the plant keeps feeding");
  (void)scan(&report);
  CHECK(pin_out[0] == 1U, "with mirror on the pin follows the image");
  CHECK((opi()[0] & 1U) == 1U, "turning mirror on changed no image byte");
}

static void plant_sched_mirror_off_again_returns_to_safe_next_commit(void) {
  zplc_sched_scan_report_t report;

  printf("\n=== plant_sched_mirror_off_again_returns_to_safe_next_commit (R-M6-6) ===\n");
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "the plant binds DI0");
  zplc_plant_set_mirror(1U);
  CHECK(send_a(1U) == 0, "a frame raises A");
  (void)scan(&report);
  CHECK(pin_out[0] == 1U, "mirrored: the pin is high");
  zplc_plant_set_mirror(0U);
  CHECK(pin_out[0] == 1U, "turning mirror off writes no pin by itself");
  CHECK(send_a(1U) == 0, "the plant keeps feeding");
  (void)scan(&report);
  CHECK(pin_out[0] == 0U, "the next commit drives the pin back to the safe level");
  CHECK((opi()[0] & 1U) == 1U, "while the image still carries the program's output");
}

static void exit_reason_stops_safe_via_engine(uint8_t reason, const char *what) {
  zplc_sched_scan_report_t report;
  const uint8_t value[2] = {0xABU, 0xCDU};

  setup(0, 1);
  CHECK(enter_a(500U) == 0, "the plant binds DI0");
  CHECK(zplc_force_set_bytes((uint16_t)(ZPLC_MEM_WORK_BASE + 0x40U), value, 2U) == 0, "a force is set");
  CHECK(send_a(1U) == 0, "a frame raises A");
  (void)scan(&report);
  CHECK((opi()[0] & 1U) == 1U, "the program drives its output in the image");
  /* The engine performs the exit itself; the adapter then stops through its STOP path. */
  CHECK(zplc_plant_exit(reason) == 0, "the exit is performed once");
  stop_path();
  check_stopped_safe(reason, what);
  CHECK(zplc_plant_exit(reason) == ERR_STATE, "a second exit reports the state and changes nothing");
}

static void plant_exit_reason_closed_stops_safe(void) {
  printf("\n=== plant_exit_reason_closed_stops_safe ===\n");
  exit_reason_stops_safe_via_engine((uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED, "closed");
}

static void plant_exit_reason_session_end_stops_safe(void) {
  printf("\n=== plant_exit_reason_session_end_stops_safe ===\n");
  exit_reason_stops_safe_via_engine((uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_SESSION_END, "session end");
}

static void plant_exit_reason_link_lost_stops_safe(void) {
  printf("\n=== plant_exit_reason_link_lost_stops_safe ===\n");
  exit_reason_stops_safe_via_engine((uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_LINK_LOST, "link lost");
}

static void plant_exit_reason_timeout_stops_safe(void) {
  zplc_sched_scan_report_t report;
  const uint8_t value[2] = {0xABU, 0xCDU};
  unsigned fired_at = 0U;
  unsigned i;

  printf("\n=== plant_exit_reason_timeout_stops_safe (R-M6-4, R-M6-5) ===\n");
  setup(0, 1);
  CHECK(enter_a(100U) == 0, "the plant binds DI0 with a timeout of 100 ms");
  CHECK(zplc_force_set_bytes((uint16_t)(ZPLC_MEM_WORK_BASE + 0x40U), value, 2U) == 0, "a force is set");
  CHECK(send_a(1U) == 0, "a frame raises A");
  for (i = 1U; i <= 20U && fired_at == 0U; i++) {
    (void)scan(&report);
    if (report.plant_exit != 0U) {
      fired_at = i;
    }
  }
  CHECK(fired_at > 0U, "the silence fires the exit rule in a scan");
  CHECK(report.plant_exit == 1U && report.committed == 1U, "the scan that fired it committed and reports the exit");
  CHECK(pin_out[0] == 0U && pin_high_writes == 0U, "its pins were held at the safe level");
  CHECK(zplc_plant_active() == 1 && zplc_plant_holds_outputs() == 1, "the mode stays active, held, until the stop completes it");
  CHECK(stop_releases_calls >= 1U, "no further release is armed");
  CHECK(send_a(1U) == ERR_STATE, "a frame after the rule fired is refused");
  stop_path();
  check_stopped_safe((uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_TIMEOUT, "timeout");
}

static void plant_exit_reason_run_control_stops_safe(void) {
  zplc_sched_scan_report_t report;
  const uint8_t value[2] = {0xABU, 0xCDU};

  printf("\n=== plant_exit_reason_run_control_stops_safe (R-M6-5) ===\n");
  setup(0, 1);
  CHECK(enter_a(500U) == 0, "the plant binds DI0");
  CHECK(zplc_force_set_bytes((uint16_t)(ZPLC_MEM_WORK_BASE + 0x40U), value, 2U) == 0, "a force is set");
  CHECK(send_a(1U) == 0, "a frame raises A");
  (void)scan(&report);
  stop_path();
  check_stopped_safe((uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_RUN_CONTROL, "run control");
}

static void plant_exit_reason_fault_stops_safe(void) {
  zplc_sched_scan_report_t report;
  const uint8_t value[2] = {0xABU, 0xCDU};

  printf("\n=== plant_exit_reason_fault_stops_safe (R-M6-5) ===\n");
  setup(1, 1);
  CHECK(enter_a(500U) == 0, "the plant binds DI0 under a program that faults");
  CHECK(zplc_force_set_bytes((uint16_t)(ZPLC_MEM_WORK_BASE + 0x40U), value, 2U) == 0, "a force is set");
  CHECK(send_a(1U) == 0, "a frame raises A");
  CHECK(scan(&report) != 0 && report.faulted == 1U, "the scan faults");
  CHECK(report.plant_exit == 0U, "the fault ended the mode itself");
  check_stopped_safe((uint8_t)ZPLC_PROTO_PLANT_EXIT_REASON_FAULT, "fault");
}

static void plant_sched_stale_values_never_exceed_timeout_plus_one_scan(void) {
  zplc_sched_scan_report_t report;
  const uint32_t timeout = 100U;
  uint32_t frame_at;
  uint32_t fired_at = 0U;
  unsigned i;

  printf("\n=== plant_sched_stale_values_never_exceed_timeout_plus_one_scan (R-M6-4) ===\n");
  setup(0, 1);
  CHECK(enter_a((uint16_t)timeout) == 0, "the plant binds DI0 with a timeout of 100 ms");
  CHECK(send_a(1U) == 0, "one frame raises A");
  frame_at = clock_ms;
  for (i = 0U; i < 40U && fired_at == 0U; i++) {
    (void)scan(&report);
    if (report.plant_exit != 0U) {
      fired_at = clock_ms;
    } else if ((ipi()[0] & 1U) != 1U) {
      CHECK(0, "until the rule fires the last value is what the program reads");
    }
  }
  CHECK(fired_at != 0U, "the rule fires");
  CHECK(fired_at - frame_at > timeout, "not before the timeout");
  CHECK(fired_at - frame_at <= timeout + 10U, "and at most one scan after it");
}

static void run_scenario(int with_hooks, char *log, size_t log_size, uint8_t *image) {
  zplc_sched_scan_report_t report;
  unsigned i;

  memset(&report, 0, sizeof(report));
  setup(0, with_hooks);
  for (i = 0U; i < 6U; i++) {
    pin_in[0] = (uint8_t)(i & 1U);
    pin_in[1] = (uint8_t)((i >> 1) & 1U);
    (void)scan_with(&port, &report);
    image[i * 2U] = ipi()[0];
    image[i * 2U + 1U] = opi()[0];
  }
  snprintf(log, log_size, "%s|%u|%u|%d", pin_log, pin_reads, stop_releases_calls, (int)report.committed);
}

static void plant_sched_without_plant_is_unchanged(void) {
  char with_log[300], without_log[300];
  uint8_t with_image[12], without_image[12];
  zplc_sched_scan_report_t report;
  uint8_t followed = 0U;
  unsigned i;

  printf("\n=== plant_sched_without_plant_is_unchanged (IO-013) ===\n");
  run_scenario(1, with_log, sizeof(with_log), with_image);
  run_scenario(0, without_log, sizeof(without_log), without_image);
  CHECK(strcmp(with_log, without_log) == 0,
        "with the hooks installed and the mode inactive, the pins are written and read as without them");
  CHECK(memcmp(with_image, without_image, sizeof(with_image)) == 0, "and so are the input and output images of every scan");
  for (i = 0U; i < 6U; i++) {
    followed |= with_image[i * 2U + 1U];
  }
  CHECK(followed != 0U && strchr(with_log, '1') != NULL, "the pins did follow the image: the scenario is not trivially empty");
  setup(0, 1);
  (void)scan(&report);
  CHECK(report.plant_exit == 0U && zplc_plant_active() == 0, "an inactive mode never reports an exit");
}

static void plant_sched_declared_safe_level_is_used(void) {
  static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  uint8_t file[256];
  const uint8_t entries[] = {ZPLC_TEST_SAFE(0U, 1U, 1U)};
  size_t length;
  zplc_io_outputs_t image;

  printf("\n=== plant_sched_declared_safe_level_is_used (R-M6-6) ===\n");
  setup(0, 1);
  length = zplc_test_minimal_program(file);
  length = zplc_test_append_safe(file, length, sizeof(file), entries, sizeof(entries));
  CHECK(zplc_core_load(file, length, workspace, sizeof(workspace)) == 0, "a program declaring DO1 safe at 1 is loaded");
  CHECK(enter_a(500U) == 0, "the plant is entered");
  memset(&image, 0, sizeof(image));
  pin_log[0] = '\0';
  CHECK(zplc_io_write_outputs(&image, NULL) == ZPLC_HAL_OK, "the held commit is written");
  CHECK(pin_out[0] == 0U && pin_out[1] == 1U, "the held pins carry the declared level: DO0 off, DO1 on");
}

int main(void) {
  printf("==== test_plant_sched ====\n");
  plant_sched_bound_input_overrides_pin_unbound_follows_pin();
  plant_sched_forced_input_wins();
  plant_sched_frame_applies_whole_at_one_latch();
  plant_sched_pins_safe_image_published();
  plant_sched_mirror_on_pins_follow_image();
  plant_sched_mirror_off_again_returns_to_safe_next_commit();
  plant_exit_reason_closed_stops_safe();
  plant_exit_reason_timeout_stops_safe();
  plant_exit_reason_session_end_stops_safe();
  plant_exit_reason_link_lost_stops_safe();
  plant_exit_reason_run_control_stops_safe();
  plant_exit_reason_fault_stops_safe();
  plant_sched_stale_values_never_exceed_timeout_plus_one_scan();
  plant_sched_without_plant_is_unchanged();
  plant_sched_declared_safe_level_is_used();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
