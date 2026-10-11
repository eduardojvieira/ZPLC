/*
 * The hardware watchdog of a profile that has one (RT-020).
 *
 * No board of this repository enables the watchdog yet: it is enabled in a profile once that board has a hardware
 * record (HIL-010). This suite drives the scheduler against the model of the part that a test build carries,
 * which expires when it is not fed within the timeout it was armed with, and shows the behaviour a profile with a
 * record will have:
 *
 *   - it is fed from the scan, after the outputs were written, and from nowhere else while the runtime scans: a
 *     scan that stalls lets it expire;
 *   - while the runtime waits (a pause, a breakpoint, a stop under a feeding profile) the control path keeps it
 *     fed, so that a long breakpoint does not reset the board;
 *   - a latched fault leaves it armed and unfed: the board resets into STOP, and the fault is in the record that a
 *     reset does not erase;
 *   - a profile can say another policy for each state, and the timeout follows the task set.
 *
 * What only a board can show: that the part resets within the timeout, that its outputs are safe while it resets
 * and that a stopped counter cannot be restarted (HIL-010).
 */

#include <string.h>
#include <zephyr/ztest.h>
#include <zplc_bytes.h>
#include <zplc_core.h>
#include <zplc_crc32.h>
#include <zplc_failsafe.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_sched_core.h>
#include <zplc_scheduler.h>
#include <zplc_test_hooks.h>

#define PROGRAM_CAPACITY 160U
#define OUTPUT_VALUE 0x5AU

/* The values of zplc_wdt_action_t, for zplc_sched_test_set_watchdog_policy(). */
#define DISARM 0U
#define FEED 1U
#define EXPIRE 2U

/* CODE (PUSH8, STORE8, HALT; or a loop that never ends) and one cyclic TASK of the given interval. */
static size_t build_program(uint8_t *out, uint32_t interval_us, int loop) {
  const size_t code_size = 6U;
  const size_t total = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE + code_size + ZPLC_TASK_DEF_SIZE;
  size_t offset;
  uint32_t crc;

  zassert_true(total <= PROGRAM_CAPACITY, "program buffer overflow");
  memset(out, 0, total);
  memcpy(out, "ZPLC", 4U);
  zplc_put_u16_le(out + 4U, ZPLC_VERSION_MAJOR);
  zplc_put_u16_le(out + 6U, ZPLC_VERSION_MINOR);
  zplc_put_u32_le(out + 16U, (uint32_t)code_size);
  zplc_put_u32_le(out + 20U, ZPLC_TASK_DEF_SIZE);
  zplc_put_u16_le(out + 26U, 2U);
  zplc_put_u32_le(out + 28U, ZPLC_DRAFT_COUNTER);
  offset = ZPLC_FILE_HEADER_SIZE;
  zplc_put_u16_le(out + offset, ZPLC_SEG_CODE);
  zplc_put_u32_le(out + offset + 4U, (uint32_t)code_size);
  offset += ZPLC_SEGMENT_ENTRY_SIZE;
  zplc_put_u16_le(out + offset, ZPLC_SEG_TASK);
  zplc_put_u32_le(out + offset + 4U, ZPLC_TASK_DEF_SIZE);
  offset += ZPLC_SEGMENT_ENTRY_SIZE;
  if (loop != 0) {
    out[offset] = OP_JMP; /* JMP 0 */
    out[offset + 3U] = OP_NOP;
    out[offset + 4U] = OP_NOP;
    out[offset + 5U] = OP_HALT;
  } else {
    out[offset] = OP_PUSH8;
    out[offset + 1U] = OUTPUT_VALUE;
    out[offset + 2U] = OP_STORE8;
    zplc_put_u16_le(out + offset + 3U, ZPLC_MEM_OPI_BASE);
    out[offset + 5U] = OP_HALT;
  }
  offset += code_size;
  zplc_put_u16_le(out + offset, 1U);
  out[offset + 2U] = ZPLC_TASK_CYCLIC;
  zplc_put_u32_le(out + offset + 4U, interval_us);
  zplc_put_u16_le(out + offset + 8U, 0U);
  zplc_put_u16_le(out + offset + 10U, 16U);
  crc = zplc_crc32_update(0xFFFFFFFFU, out, 12U);
  crc = zplc_crc32_update(crc, out + 16U, total - 16U) ^ 0xFFFFFFFFU;
  zplc_put_u32_le(out + 12U, crc);
  return total;
}

static void clear_scheduler(void) {
  int index;

  zplc_sched_test_set_watchdog_policy(DISARM, FEED, EXPIRE); /* the design default */
  zplc_failsafe_test_set_retained(NULL);
  zassert_ok(zplc_sched_stop(), "stop scheduler");
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    int result = zplc_sched_unregister_task(index);

    zassert_true(result == 0 || result == -2, "unregister task");
  }
}

/* The expiries of the model are counted since the scheduler was initialised: a case counts its own. */
static uint32_t expired_at_load;

static void load(uint32_t interval_us, int loop) {
  uint8_t program[PROGRAM_CAPACITY];
  const size_t size = build_program(program, interval_us, loop);

  clear_scheduler();
  zassert_equal(zplc_sched_load(program, size), 1, "load the task");
  expired_at_load = zplc_sched_test_watchdog_expired_count();
}

static uint32_t expired(void) { return zplc_sched_test_watchdog_expired_count() - expired_at_load; }

static void *suite_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL");
  zassert_ok(zplc_sched_init(), "initialize scheduler");
  return NULL;
}

static void suite_teardown(void *fixture) {
  ARG_UNUSED(fixture);
  clear_scheduler();
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

ZTEST(zplc_scheduler_watchdog, test_a_running_scan_feeds_after_its_commit_and_the_watchdog_never_expires) {
  uint32_t feeds_before;

  load(100000U, 0);
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zassert_ok(zplc_sched_start(), "start");
  zassert_equal(zplc_sched_test_watchdog_timeout_ms(), 1000U, "armed with the profile's timeout");
  k_msleep(2500);
  zassert_equal(expired(), 0U, "a scan that commits feeds in time");
  zassert_true(zplc_sched_test_watchdog_feed_count() - feeds_before >= 10U, "once per scan");
  zassert_ok(zplc_sched_stop(), "stop");
}

ZTEST(zplc_scheduler_watchdog, test_a_stalled_scan_lets_the_watchdog_expire) {
  load(100000U, 0);
  /* The scan reaches the hold after its tasks ran, and does not commit for a second: nothing feeds the part. */
  zplc_sched_test_hold_before_commit();
  zassert_ok(zplc_sched_start(), "start");
  zassert_ok(zplc_sched_test_wait_before_commit(500), "the scan reached the stall");
  k_msleep(1100);
  zassert_true(expired() >= 1U, "the part expired: the board would reset");
  zplc_sched_test_release_before_commit();
  zassert_ok(zplc_sched_stop(), "stop");
}

ZTEST(zplc_scheduler_watchdog, test_a_latched_fault_stays_armed_expires_and_is_recorded) {
  uint32_t disarms_before;
  const zplc_fault_record_t *record;

  load(100000U, 1);
  disarms_before = zplc_sched_test_watchdog_disarm_count();
  zassert_ok(zplc_sched_start(), "start a program whose scan never ends");
  k_msleep(300);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR, "the instruction budget latched a VM fault");
  zassert_equal(zplc_sched_test_watchdog_disarm_count(), disarms_before, "the watchdog was not disarmed");
  zassert_equal(expired(), 0U, "and had not expired yet");
  k_msleep(1500);
  zassert_true(expired() >= 1U, "nothing feeds it, so it expires: the board resets");
  record = zplc_failsafe_test_retained();
  zassert_true(zplc_fault_record_valid(record) != 0, "the fault is in the record that a reset does not erase");
  zassert_equal(record->kind, (uint8_t)ZPLC_FAULT_SCHEDULER, "a scheduler fault");
  zassert_equal(record->reason, (uint8_t)ZPLC_SCHED_FAULT_VM, "with its reason");
  zassert_equal(record->task_id, 1U, "and its task");
}

ZTEST(zplc_scheduler_watchdog, test_a_pause_keeps_the_watchdog_fed_from_the_control_path) {
  uint32_t feeds_before;
  uint32_t disarms_before;

  load(100000U, 0);
  zassert_ok(zplc_sched_start(), "start");
  k_msleep(300);
  zassert_ok(zplc_sched_pause(), "pause");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  disarms_before = zplc_sched_test_watchdog_disarm_count();
  k_msleep(3200);
  zassert_equal(expired(), 0U, "a long breakpoint does not reset the board");
  zassert_true(zplc_sched_test_watchdog_feed_count() - feeds_before >= 6U, "the control path fed it while paused");
  zassert_equal(zplc_sched_test_watchdog_disarm_count(), disarms_before, "and did not disarm it");
  zassert_ok(zplc_sched_resume(), "resume");
  k_msleep(1200);
  zassert_equal(expired(), 0U, "the scan feeds again after the resume");
  zassert_ok(zplc_sched_stop(), "stop");
  disarms_before = zplc_sched_test_watchdog_disarm_count();
  k_msleep(1500);
  zassert_equal(expired(), 0U, "STOP disarms it under the default policy");
  zassert_true(disarms_before >= 1U, "the disarm happened");
}

ZTEST(zplc_scheduler_watchdog, test_a_profile_that_disarms_in_a_pause_has_no_feeder_there) {
  uint32_t feeds_before;

  load(100000U, 0);
  zplc_sched_test_set_watchdog_policy(DISARM, DISARM, EXPIRE);
  zassert_ok(zplc_sched_start(), "start");
  k_msleep(300);
  feeds_before = zplc_sched_test_watchdog_feed_count();
  zassert_ok(zplc_sched_pause(), "pause");
  k_msleep(1500);
  zassert_equal(zplc_sched_test_watchdog_feed_count(), feeds_before, "nothing feeds a paused runtime");
  zassert_equal(expired(), 0U, "and the part is disarmed, so it does not expire");
  zassert_ok(zplc_sched_stop(), "stop");
}

ZTEST(zplc_scheduler_watchdog, test_a_part_that_cannot_be_stopped_is_fed_in_stop) {
  uint32_t feeds_before;

  load(100000U, 0);
  zplc_sched_test_set_watchdog_policy(FEED, FEED, EXPIRE);
  zassert_ok(zplc_sched_start(), "start");
  k_msleep(300);
  zassert_ok(zplc_sched_stop(), "stop");
  feeds_before = zplc_sched_test_watchdog_feed_count();
  k_msleep(2500);
  zassert_equal(expired(), 0U, "a feeding profile stays armed and fed in STOP");
  zassert_true(zplc_sched_test_watchdog_feed_count() - feeds_before >= 6U, "by the control path");
  zassert_ok(zplc_sched_shutdown(), "a scheduler that is shut down stops feeding and disarms");
  zassert_ok(zplc_sched_init(), "initialize again");
  k_msleep(1500);
  /* The count is the model's own since init, and init began it again. */
  zassert_equal(zplc_sched_test_watchdog_expired_count(), 0U, "nothing is armed after the shutdown");
}

ZTEST(zplc_scheduler_watchdog, test_a_profile_that_disarms_in_a_fault_does_not_expire) {
  load(100000U, 1);
  zplc_sched_test_set_watchdog_policy(DISARM, FEED, DISARM);
  zassert_ok(zplc_sched_start(), "start");
  k_msleep(300);
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR, "the fault latched");
  k_msleep(1500);
  zassert_equal(expired(), 0U, "the profile disarmed it");
}

ZTEST(zplc_scheduler_watchdog, test_the_timeout_follows_the_task_set_and_a_set_that_does_not_fit_is_refused) {
  load(400000U, 0);
  zassert_ok(zplc_sched_start(), "a 400 ms task fits the 1 s timeout");
  zassert_equal(zplc_sched_test_watchdog_timeout_ms(), 1000U, "which is the profile's");
  zassert_ok(zplc_sched_stop(), "stop");

  load(600000U, 0);
  zassert_equal(zplc_sched_start(), -3, "a 600 ms task needs 1201 ms, which this part cannot be given");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "and the runtime stays in STOP");
  zassert_equal(zplc_opi_read8(0U), 0U, "with its outputs safe");
}

ZTEST_SUITE(zplc_scheduler_watchdog, NULL, suite_setup, NULL, NULL, suite_teardown);
