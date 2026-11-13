/*
 * Plant I/O mode on the real Zephyr scheduler (LNK-006, LNK-007, LNK-010, LNK-011, LNK-015).
 *
 * A program copies IPI[0] to WORK[0] and writes 0x0F to OPI[0]. The plant binds one BOOL input (IPI[0].0, DI0) and
 * one BOOL output (OPI[0].0, DO0); DI1 to DI3 stay pins. The tests drive frames into the module as the link's port
 * does, and watch the image, the counters, the scheduler state and, on native_sim, the emulated pins.
 *
 * The port of the application (firmware/app/src/shell_cmds.c, lk_plant_exit) is not linked here: leave() below is
 * the same sequence, and the application link test (firmware/tests/app_plant_link) runs the real one.
 *
 * Emulated pins are not hardware. On qemu_cortex_m3 there is no emulator: the cases that need a pin skip.
 */
#include <errno.h>
#include <stdbool.h>
#include <string.h>
#include <zephyr/devicetree.h>
#include <zephyr/kernel.h>
#include <zephyr/spinlock.h>
#include <zephyr/ztest.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_plant.h>
#include <zplc_proto.h>
#include <zplc_proto_dev.h>
#include <zplc_scheduler.h>
#include <zplc_test_hooks.h>

#if DT_NODE_EXISTS(DT_NODELABEL(gpio0)) && DT_NODE_HAS_COMPAT(DT_NODELABEL(gpio0), zephyr_gpio_emul)
#include <zephyr/drivers/gpio/gpio_emul.h>
#include "zplc_io_zephyr.h"
#define HAVE_PINS 1
#define GPIO_CONTROLLER DEVICE_DT_GET(DT_NODELABEL(gpio0))
#endif

#define PROGRAM_CAPACITY 128U
#define INTERVAL_US 20000U
#define OUTPUT_PATTERN 0x0FU
#define WORK_COPY (ZPLC_MEM_WORK_BASE + 0U)
#define ADDRESS_LOW(address) ((uint8_t)((address) & 0xFFU))
#define ADDRESS_HIGH(address) ((uint8_t)(((address) >> 8) & 0xFFU))

static const uint8_t program_code[] = {
    OP_LOAD8,
    ADDRESS_LOW(ZPLC_MEM_IPI_BASE),
    ADDRESS_HIGH(ZPLC_MEM_IPI_BASE),
    OP_STORE8,
    ADDRESS_LOW(WORK_COPY),
    ADDRESS_HIGH(WORK_COPY),
    OP_PUSH8,
    OUTPUT_PATTERN,
    OP_STORE8,
    ADDRESS_LOW(ZPLC_MEM_OPI_BASE),
    ADDRESS_HIGH(ZPLC_MEM_OPI_BASE),
    OP_HALT,
};

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  size_t index;

  for (index = 0U; index < length; index++) {
    uint32_t bit;

    crc ^= data[index];
    for (bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static void write_u16_le(uint8_t *data, uint16_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void write_u32_le(uint8_t *data, uint32_t value) {
  write_u16_le(data, (uint16_t)value);
  write_u16_le(data + 2, (uint16_t)(value >> 16));
}

static size_t build_program(uint8_t *program) {
  const size_t code_size = sizeof(program_code);
  const size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t task_offset = code_offset + code_size;
  const size_t total = task_offset + ZPLC_TASK_DEF_SIZE;
  uint8_t *task = program + task_offset;
  uint32_t crc;

  zassert_true(total <= PROGRAM_CAPACITY, "program buffer overflow");
  memset(program, 0, total);
  memcpy(program, "ZPLC", 4U);
  write_u16_le(program + 4U, ZPLC_VERSION_MAJOR);
  write_u16_le(program + 6U, ZPLC_VERSION_MINOR);
  write_u32_le(program + 28U, ZPLC_DRAFT_COUNTER);
  write_u32_le(program + 16U, (uint32_t)code_size);
  write_u32_le(program + 20U, (uint32_t)ZPLC_TASK_DEF_SIZE);
  write_u16_le(program + 26U, 2U);
  write_u16_le(program + 32U, ZPLC_SEG_CODE);
  write_u32_le(program + 36U, (uint32_t)code_size);
  write_u16_le(program + 40U, ZPLC_SEG_TASK);
  write_u32_le(program + 44U, (uint32_t)ZPLC_TASK_DEF_SIZE);
  memcpy(program + code_offset, program_code, code_size);
  write_u16_le(task, 1U);
  task[2] = ZPLC_TASK_CYCLIC;
  task[3] = 1U;
  write_u32_le(task + 4U, INTERVAL_US);
  write_u16_le(task + 8U, 0U);
  write_u16_le(task + 10U, 64U);
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  write_u32_le(program + 12U, crc);
  return total;
}

/* ---- the module's hooks: a try-lock that a test can make busy (the link thread holding it) -------------------- */

static struct k_spinlock plant_spin;
static k_spinlock_key_t plant_key;
static volatile bool link_thread_holds_lock;

static int hook_lock(void *ctx) {
  ARG_UNUSED(ctx);
  if (link_thread_holds_lock) {
    return -EBUSY;
  }
  return k_spin_trylock(&plant_spin, &plant_key) == 0 ? 0 : -EBUSY;
}

static void hook_unlock(void *ctx) {
  ARG_UNUSED(ctx);
  k_spin_unlock(&plant_spin, plant_key);
}

static uint32_t hook_now(void *ctx) {
  ARG_UNUSED(ctx);
  return k_uptime_get_32();
}

static const zplc_plant_hooks_t hooks = {.ctx = NULL, .lock = hook_lock, .unlock = hook_unlock, .now_ms = hook_now};

/* ---- helpers ----------------------------------------------------------------------------------------------- */

static void clear_scheduler(void) {
  int index;

  zassert_ok(zplc_sched_stop(), "stop scheduler");
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    int result = zplc_sched_unregister_task(index);

    zassert_true(result == 0 || result == -2, "unregister task");
  }
}

static uint32_t commits(void) {
  zplc_sched_stats_t stats;

  zassert_ok(zplc_sched_get_stats(&stats), "read the commit count");
  return stats.output_commit_count;
}

static void wait_commits(uint32_t count) {
  const uint32_t target = commits() + count;
  int waited_ms = 0;

  while (commits() < target && waited_ms < 2000) {
    k_msleep(5);
    waited_ms += 5;
  }
  zassert_true(commits() >= target, "the scan keeps committing");
}

static void wait_state(zplc_sched_state_t state) {
  int waited_ms = 0;

  while (zplc_sched_get_state() != state && waited_ms < 2000) {
    k_msleep(5);
    waited_ms += 5;
  }
  zassert_equal(zplc_sched_get_state(), state, "the scheduler reaches the expected state");
}

static uint8_t work0(void) { return zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0]; }

static void run_program(void) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;

  clear_scheduler();
  zplc_force_clear_all();
  size = build_program(program);
  zassert_equal(zplc_sched_load(program, size), 1, "load the program");
  memset(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), 0, 8U);
  zassert_ok(zplc_sched_start(), "start scheduler");
  wait_commits(2U);
}

/* PLANT_ENTER: timeout, one input (IPI[0].0, BOOL), one output (OPI[0].0, BOOL). */
static int plant_enter(uint16_t timeout_ms, uint16_t *id) {
  const uint8_t req[] = {(uint8_t)timeout_ms, (uint8_t)(timeout_ms >> 8), 1U, 1U, 0U, 0U, 0U, 0U, 0U, 0U};
  uint8_t rsp[16];
  uint16_t rsp_len = sizeof(rsp);
  int rc = zplc_plant_enter(req, sizeof(req), rsp, &rsp_len);

  if (rc == 0) {
    *id = (uint16_t)(rsp[0] | (rsp[1] << 8));
  }
  return rc;
}

static uint32_t plant_seq;

static int plant_frame(uint16_t id, bool on) {
  uint8_t req[7];
  uint8_t rsp[32];
  uint16_t rsp_len = sizeof(rsp);

  write_u16_le(req, id);
  write_u32_le(req + 2, ++plant_seq);
  req[6] = on ? 1U : 0U;
  return zplc_plant_frame(req, sizeof(req), rsp, &rsp_len);
}

/* The sequence of lk_plant_exit (firmware/app/src/shell_cmds.c): hold the pins, stop while the mode is still
 * active, then leave the mode. Nothing runs between the mode becoming inactive and the stop. */
static void leave(uint8_t reason) {
  zplc_plant_set_mirror(0U);
  zassert_ok(zplc_sched_stop(), "stop while the mode is still active");
  (void)zplc_plant_exit(reason);
}

#ifdef HAVE_PINS
static uint8_t channel_pin(const zplc_io_channel_t *channel) {
  zassert_true(channel->hal_channel < zplc_io_gpio_binding_count, "HAL number in range");
  return (uint8_t)zplc_io_gpio_bindings[channel->hal_channel].spec.pin;
}

static unsigned outputs_high(void) {
  unsigned high = 0U;
  size_t index;

  for (index = 0U; index < zplc_io_channel_count(); index++) {
    const zplc_io_channel_t *channel = zplc_io_channel_at(index);

    if (channel->direction == ZPLC_IO_DIR_OUTPUT && channel->kind == ZPLC_IO_KIND_DIGITAL &&
        gpio_emul_output_get(GPIO_CONTROLLER, channel_pin(channel)) != 0) {
      high++;
    }
  }
  return high;
}

/* Input channel `bit` of IPI byte 0 (DI<bit>) driven to `level`. */
static void drive_input(uint8_t bit, int level) {
  size_t index;

  for (index = 0U; index < zplc_io_channel_count(); index++) {
    const zplc_io_channel_t *channel = zplc_io_channel_at(index);

    if (channel->direction == ZPLC_IO_DIR_INPUT && channel->image_offset == 0U && channel->bit == bit) {
      zassert_ok(gpio_emul_input_set(GPIO_CONTROLLER, channel_pin(channel), level), "drive the emulated input pin");
      return;
    }
  }
  zassert_unreachable("input channel not in the table");
}
#define REQUIRE_PINS() ((void)0)
#else
static unsigned outputs_high(void) { return 0U; }
static void drive_input(uint8_t bit, int level) {
  ARG_UNUSED(bit);
  ARG_UNUSED(level);
}
#define REQUIRE_PINS() ztest_test_skip()
#endif

static void assert_pins_safe(const char *message) {
#ifdef HAVE_PINS
  zassert_equal(outputs_high(), 0U, "%s", message);
#else
  ARG_UNUSED(message);
#endif
}

static void *setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL");
  zassert_ok(zplc_sched_init(), "initialize scheduler");
  return NULL;
}

static void before(void *fixture) {
  ARG_UNUSED(fixture);
  clear_scheduler();
  link_thread_holds_lock = false;
  plant_seq = 0U;
  zplc_plant_init(&hooks);
}

static void teardown(void *fixture) {
  ARG_UNUSED(fixture);
  clear_scheduler();
  (void)zplc_plant_exit(ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED);
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

/* ---- the cases --------------------------------------------------------------------------------------------- */

/* The mode is for a run: it is entered while the program runs, and a STOP leaves it with its reason, so an entry
 * never outlives the run. (That the link refuses an entry on a stopped runtime is the check of lk_plant_enter, run
 * by the application link test: "entry refused while stopped".) */
ZTEST(zplc_plant_io, test_enter_requires_running_program) {
  uint16_t id;

  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "no program runs yet");
  run_program();
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_RUNNING, "the program runs");
  zassert_ok(plant_enter(500U, &id), "entry while the program runs");
  zassert_true(zplc_plant_active() != 0, "the mode is active");
  zassert_ok(zplc_sched_stop(), "STOP");
  zassert_equal(zplc_plant_active(), 0, "a STOP ends the mode");
  zassert_equal(zplc_plant_exit_reason(), ZPLC_PROTO_PLANT_EXIT_REASON_RUN_CONTROL, "with the run-control reason");
  zassert_equal(plant_frame(id, true), (int)ZPLC_PROTO_ERR_STATE, "a frame after the stop finds no mode");
}

ZTEST(zplc_plant_io, test_entry_exit_stops_safe) {
  uint16_t id;

  run_program();
  zassert_ok(plant_enter(2000U, &id), "enter");
  zassert_ok(plant_frame(id, true), "a frame");
  wait_commits(3U);
  zassert_equal(zplc_opi_read8(0U), OUTPUT_PATTERN, "the image carries the program's outputs");
  assert_pins_safe("the pins stay safe while the mode is active");
  leave(ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "the program is STOPPED");
  zassert_equal(zplc_plant_active(), 0, "the mode is inactive");
  zassert_equal(zplc_opi_read8(0U), 0U, "the output image is reset");
  assert_pins_safe("the pins are safe after the exit");
  k_msleep(100);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "nothing resumes by itself");
}

ZTEST(zplc_plant_io, test_timeout_stops_safe) {
  uint16_t id;
  uint32_t after;

  run_program();
  zassert_ok(plant_enter(60U, &id), "enter with the shortest useful timeout");
  zassert_ok(plant_frame(id, true), "one frame, then silence");
  wait_state(ZPLC_SCHED_STATE_IDLE);
  zassert_equal(zplc_plant_active(), 0, "the mode is over");
  zassert_equal(zplc_plant_exit_reason(), ZPLC_PROTO_PLANT_EXIT_REASON_TIMEOUT, "for the timeout");
  zassert_equal(zplc_opi_read8(0U), 0U, "the output image is reset");
  assert_pins_safe("the pins are safe");
  after = commits();
  k_msleep(150);
  zassert_equal(commits(), after, "no scan runs after the exit");
  zassert_equal(plant_frame(id, true), (int)ZPLC_PROTO_ERR_STATE, "the mode did not come back");
}

/* ---- the engine: a link that is lost ends the mode through the port ----------------------------------------- */

static unsigned engine_exit_events;
static unsigned engine_exit_calls;
static uint8_t engine_exit_reason;

static int engine_enter(void *c, const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len) {
  ARG_UNUSED(c);
  if (zplc_sched_get_state() != ZPLC_SCHED_STATE_RUNNING) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  return zplc_plant_enter(req, len, rsp, rsp_len);
}

static int engine_frame(void *c, const uint8_t *req, uint16_t len, uint8_t *rsp, uint16_t *rsp_len) {
  ARG_UNUSED(c);
  return zplc_plant_frame(req, len, rsp, rsp_len);
}

static int engine_exit(void *c, uint8_t reason, uint8_t *rsp, uint16_t *rsp_len) {
  ARG_UNUSED(c);
  if (zplc_plant_active() == 0) {
    return (int)ZPLC_PROTO_ERR_STATE;
  }
  engine_exit_calls++;
  engine_exit_reason = reason;
  leave(reason);
  if (rsp != NULL) {
    memset(rsp, 0, 9U);
    rsp[0] = reason;
    *rsp_len = 9U;
  }
  return 0;
}

static int engine_mirror(void *c, uint8_t on, uint8_t *mirror) {
  ARG_UNUSED(c);
  zplc_plant_set_mirror(on);
  *mirror = on;
  return 0;
}

static uint32_t engine_now(void *c) {
  ARG_UNUSED(c);
  return k_uptime_get_32();
}

static int engine_write(void *c, const uint8_t *frame, size_t length) {
  zplc_proto_frame_t f;

  ARG_UNUSED(c);
  if (zplc_proto_parse(frame, length, ZPLC_PROTO_PAYLOAD_MAX, &f) == 0 && f.kind == ZPLC_PROTO_KIND_EVENT &&
      f.message == ZPLC_PROTO_EVT_PLANT_EXIT && f.length == ZPLC_PROTO_EVT_PLANT_EXIT_FIXED) {
    engine_exit_events++;
  }
  return 0;
}

static void engine_send(zplc_proto_link_t *link, uint8_t message, const uint8_t *payload, size_t length, uint32_t sequence) {
  uint8_t frame[ZPLC_PROTO_FRAME_MAX];
  size_t used = zplc_proto_begin(frame, sizeof(frame), ZPLC_PROTO_KIND_REQUEST, message, sequence, payload, (uint16_t)length, 0);

  zplc_proto_link_feed(link, frame, zplc_proto_finish(frame, used, NULL));
}

ZTEST(zplc_plant_io, test_link_loss_by_proto_link_lost_stops_safe) {
  static zplc_proto_dev_t dev;
  static zplc_proto_ops_t ops;
  static zplc_proto_link_t link;
  uint8_t open[ZPLC_PROTO_SESSION_OPEN_REQ_FIXED];
  uint8_t mask[4];
  const uint8_t enter[] = {0xF4U, 0x01U, 1U, 1U, 0U, 0U, 0U, 0U, 0U, 0U};
  zplc_proto_link_t *links[1] = {&link};
  uint8_t frame[7];
  uint32_t seq = 1U;

  engine_exit_events = 0U;
  engine_exit_calls = 0U;
  memset(&ops, 0, sizeof(ops));
  ops.now_ms = engine_now;
  ops.plant_enter = engine_enter;
  ops.plant_frame = engine_frame;
  ops.plant_exit = engine_exit;
  ops.plant_mirror = engine_mirror;
  zassert_ok(zplc_proto_dev_init(&dev, &ops, 30U), "the engine starts");
  zplc_proto_link_init(&link, &dev, ZPLC_PROTO_TRANSPORT_SERIAL, engine_write, NULL);

  run_program();
  memset(open, 0, sizeof(open));
  memcpy(open + ZPLC_PROTO_SESSION_OPEN_REQ_NAME_OFF, "test", 4U);
  engine_send(&link, ZPLC_PROTO_MSG_SESSION_OPEN, open, sizeof(open), seq++);
  write_u32_le(mask, (uint32_t)ZPLC_PROTO_EVTMASK_PLANT);
  engine_send(&link, ZPLC_PROTO_MSG_EVENTS_SET, mask, sizeof(mask), seq++);
  engine_send(&link, ZPLC_PROTO_MSG_PLANT_ENTER, enter, sizeof(enter), seq++);
  zassert_true(zplc_plant_active() != 0, "the engine entered the mode for the session");
  write_u16_le(frame, 1U);
  write_u32_le(frame + 2, 1U);
  frame[6] = 1U;
  engine_send(&link, ZPLC_PROTO_MSG_PLANT_FRAME, frame, sizeof(frame), seq++);
  plant_seq = 1U;
  wait_commits(2U);

  zplc_proto_link_lost(&link);
  zplc_proto_dev_service(&dev, links, 1U);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "a lost link stops the program");
  zassert_equal(zplc_plant_active(), 0, "the mode is over");
  zassert_equal(zplc_opi_read8(0U), 0U, "the output image is reset");
  assert_pins_safe("the pins are safe");
  zassert_equal(engine_exit_calls, 1U, "the engine asked the port to leave the mode once");
  zassert_equal(engine_exit_reason, ZPLC_PROTO_PLANT_EXIT_REASON_LINK_LOST, "for LINK_LOST");
  zassert_equal(engine_exit_events, 0U, "and a lost link has no one to be told");
}

/* ---- the pins and the image --------------------------------------------------------------------------------- */

ZTEST(zplc_plant_io, test_hold_on_gpio_emul) {
  uint16_t id;

  REQUIRE_PINS();
  run_program();
  zassert_ok(plant_enter(2000U, &id), "enter");
  zassert_ok(plant_frame(id, false), "a frame");
  wait_commits(3U);
  zassert_equal(zplc_opi_read8(0U), OUTPUT_PATTERN, "the image bit of every output is set");
  zassert_equal(outputs_high(), 0U, "and the emulated pins stay at the safe level");
  zplc_plant_set_mirror(1U);
  wait_commits(3U);
  zassert_equal(outputs_high(), 4U, "mirror on: the pins follow the image");
  zplc_plant_set_mirror(0U);
  wait_commits(3U);
  zassert_equal(outputs_high(), 0U, "mirror off: the pins are safe again, and the image is untouched");
  zassert_equal(zplc_opi_read8(0U), OUTPUT_PATTERN, "the image still carries the program's outputs");
}

ZTEST(zplc_plant_io, test_forced_input_wins) {
  const uint8_t forced = 0xA4U; /* bit 0 clear: the plant says 1, the force says 0 */
  uint16_t id;

  run_program();
  zassert_ok(zplc_force_set_bytes(ZPLC_MEM_IPI_BASE, &forced, 1U), "force the input byte");
  zassert_ok(plant_enter(2000U, &id), "enter");
  zassert_ok(plant_frame(id, true), "the plant sets the bound input");
  wait_commits(3U);
  zassert_equal(work0(), forced, "the forced value is what the program reads");
}

ZTEST(zplc_plant_io, test_bound_input_from_plant_pin_input_from_pin) {
  uint16_t id;

  REQUIRE_PINS();
  run_program();
  drive_input(0U, 1);
  drive_input(1U, 1);
  zassert_ok(plant_enter(2000U, &id), "enter");
  zassert_ok(plant_frame(id, false), "the plant says DI0 is low");
  wait_commits(3U);
  zassert_equal(work0() & 0x03U, 0x02U, "DI0 takes the plant value over its pin, DI1 follows its pin");
  drive_input(0U, 0);
  drive_input(1U, 0);
  zassert_ok(plant_frame(id, true), "the plant says DI0 is high");
  wait_commits(3U);
  zassert_equal(work0() & 0x03U, 0x01U, "DI0 is high with its pin low, DI1 low");
}

/* LNK-015: a link thread that holds the plant lock does not hold the scan. */
ZTEST(zplc_plant_io, test_scan_never_blocked_by_link_thread) {
  zplc_plant_stats_t before_stats;
  zplc_plant_stats_t after_stats;
  uint32_t before;
  uint16_t id;

  run_program();
  zassert_ok(plant_enter(2000U, &id), "enter");
  zassert_ok(plant_frame(id, true), "a frame");
  wait_commits(2U);
  zplc_plant_get_stats(&before_stats);
  before = commits();
  link_thread_holds_lock = true;
  k_msleep(300);
  link_thread_holds_lock = false;
  zassert_true(commits() >= before + 5U, "the scans kept their period with the lock held");
  zplc_plant_get_stats(&after_stats);
  zassert_true(after_stats.late >= before_stats.late + 5U, "and each of them counted as late");
  zassert_true(zplc_plant_active() != 0, "the mode is still active");
}

/* LNK-011: the window between the exit of the engine and the stop of the scheduler. A scan is parked just before it
 * writes the pins (the probe sits before the hold decision). The wrong order, the mode leaving first, lets that scan
 * drive the pins from the image and the next ones read the pins. The order of lk_plant_exit, hold the pins, stop
 * while the mode is active, leave afterwards, keeps both: the pins stay safe and the bound input keeps the plant's
 * value for every scan that runs before the stop completes. */
ZTEST(zplc_plant_io, test_exit_window_no_scan_drives_pins_or_reads_them) {
  uint16_t id;

  REQUIRE_PINS();

  /* the wrong order, to show that the observation can see the window */
  run_program();
  drive_input(0U, 1);
  zassert_ok(plant_enter(2000U, &id), "enter");
  zassert_ok(plant_frame(id, false), "DI0 is low for the plant, high on its pin");
  wait_commits(3U);
  zassert_equal(work0() & 0x01U, 0U, "the program reads the plant's DI0");
  zassert_equal(outputs_high(), 0U, "the pins are safe");
  zplc_sched_test_hold_output_write();
  zassert_ok(zplc_sched_test_wait_output_write(1000), "a scan is parked before its pin writes");
  (void)zplc_plant_exit(ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED);
  {
    const uint32_t parked = commits();

    zplc_sched_test_release_output_write();
    wait_commits(3U);
    zassert_true(commits() > parked, "the parked scan finished");
    zassert_equal(outputs_high(), 4U, "mode left first: the scan drove the pins from the image");
    zassert_equal(work0() & 0x01U, 1U, "and the program runs on the pin input again");
  }

  /* the order of the application, with the pins energized before the exit begins */
  run_program();
  zassert_ok(plant_enter(2000U, &id), "enter again");
  zassert_ok(plant_frame(id, false), "DI0 low for the plant");
  zplc_plant_set_mirror(1U);
  wait_commits(3U);
  zassert_equal(outputs_high(), 4U, "mirror on: the pins follow the image");
  zplc_sched_test_hold_output_write();
  zassert_ok(zplc_sched_test_wait_output_write(1000), "a scan is parked before its pin writes");
  zplc_plant_set_mirror(0U); /* first step of the exit of the port */
  zassert_true(zplc_plant_active() != 0 && zplc_plant_holds_outputs() != 0, "the mode is active and holds the pins");
  {
    const uint32_t parked = commits();

    zplc_sched_test_release_output_write();
    {
      int waited_ms = 0;

      while (commits() < parked + 3U && waited_ms < 2000) {
        k_msleep(5);
        waited_ms += 5;
      }
    }
    zassert_true(commits() >= parked + 3U, "scans ran before the stop");
    zassert_equal(outputs_high(), 0U, "no scan before the stop drove a pin from the image");
    zassert_equal(work0() & 0x01U, 0U, "and none ran on the pin input");
  }
  zassert_ok(zplc_sched_stop(), "the stop");
  (void)zplc_plant_exit(ZPLC_PROTO_PLANT_EXIT_REASON_CLOSED);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "stopped");
  assert_pins_safe("safe after the exit");
}

ZTEST_SUITE(zplc_plant_io, NULL, setup, before, NULL, teardown);
