/*
 * Run-control semantics of the Zephyr scheduler: pause, resume, step and stop.
 *
 * RT-017: a pause keeps the program's image and forces and makes the pins safe.
 * While execution is paused, at a breakpoint or stepping:
 *   - the physical outputs are in their safe state,
 *   - the output image and the force table are kept,
 *   - resume and step continue the interrupted scan from the preserved state.
 *
 * STOP is a different state and keeps its own meaning: outputs safe, output
 * image zeroed, force table cleared, task VMs back at their entry point.
 *
 * The physical output is the emulated LED of native_sim (HAL channel 0). A
 * target without the emulator (qemu_cortex_m3) checks the same behaviour
 * through the process image and the force table only; its physical level is
 * not observed there.
 */
#include <stdbool.h>
#include <string.h>
#include <zephyr/devicetree.h>
#include <zephyr/ztest.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>
#include <zplc_test_hooks.h>

#include "zplc_test_safe.h"

#if DT_NODE_EXISTS(DT_ALIAS(led0))
#if DT_NODE_HAS_COMPAT(DT_GPIO_CTLR(DT_ALIAS(led0), gpios), zephyr_gpio_emul)
#include <zephyr/drivers/gpio/gpio_emul.h>
#define HAVE_EMULATED_OUTPUT 1
#endif
#endif

#ifdef HAVE_EMULATED_OUTPUT
#define LED0_CONTROLLER DEVICE_DT_GET(DT_GPIO_CTLR(DT_ALIAS(led0), gpios))
#define LED0_PIN DT_GPIO_PIN(DT_ALIAS(led0), gpios)
#define assert_physical_output(expected, message) zassert_equal(gpio_emul_output_get(LED0_CONTROLLER, LED0_PIN), (expected), message)
#else
#define assert_physical_output(expected, message) ((void)(expected))
#endif

#define PROGRAM_CAPACITY 192U

/* Interval of the timer driven tests. The scheduler admits at most half of the
 * 1 s watchdog window of the test seam, and a long period keeps the second
 * activation far from the instants the tests observe. */
#define FAST_INTERVAL_US 100000U
#define SLOW_INTERVAL_US 400000U

/* The program writes its progress where the tests can read it back:
 *   WORK[0]  counts how many times the first part of the scan ran;
 *   WORK[1]  system flags the first part saw;
 *   WORK[2]  system flags the remainder saw;
 *   WORK[3]  task id the first part saw;
 *   WORK[4]  task id the remainder saw;
 *   WORK[5]  counter a peer task increments on every scan;
 *   WORK[6]  the peer counter as the remainder saw it;
 *   OPI[0]   value chosen by the test, it carries physical output 0;
 *   OPI[1]   0x77, written by the remainder only.
 * A breakpoint at the first instruction of the remainder splits one scan in
 * two parts, so a scan that restarts instead of continuing counts twice. */
#define WORK_COUNTER (ZPLC_MEM_WORK_BASE + 0U)
#define WORK_FLAGS_FIRST (ZPLC_MEM_WORK_BASE + 1U)
#define WORK_FLAGS_REMAINDER (ZPLC_MEM_WORK_BASE + 2U)
#define WORK_ID_FIRST (ZPLC_MEM_WORK_BASE + 3U)
#define WORK_ID_REMAINDER (ZPLC_MEM_WORK_BASE + 4U)
#define WORK_PEER_COUNT (ZPLC_MEM_WORK_BASE + 5U)
#define WORK_PEER_SEEN (ZPLC_MEM_WORK_BASE + 6U)
#define OPI_BYTE_0 (ZPLC_MEM_OPI_BASE + 0U)
#define OPI_BYTE_1 (ZPLC_MEM_OPI_BASE + 1U)
#define OPI_BYTE_2 (ZPLC_MEM_OPI_BASE + 2U)

#define ADDRESS_LOW(address) ((uint8_t)((address) & 0xFFU))
#define ADDRESS_HIGH(address) ((uint8_t)(((address) >> 8) & 0xFFU))

#define PART_ONE_VALUE_INDEX 22U
#define REMAINDER_PC 26U
#define REMAINDER_VALUE 0x77U
#define UNUSED_FORCED_VALUE 0xC3U
#define TASK_ID 5U
#define PEER_TASK_ID 9U

static const uint8_t run_control_code[] = {
    OP_LOAD8,
    ADDRESS_LOW(WORK_COUNTER),
    ADDRESS_HIGH(WORK_COUNTER),
    OP_PUSH8,
    1U,
    OP_ADD,
    OP_STORE8,
    ADDRESS_LOW(WORK_COUNTER),
    ADDRESS_HIGH(WORK_COUNTER),
    OP_LOAD8,
    ADDRESS_LOW(ZPLC_SYS_FLAGS),
    ADDRESS_HIGH(ZPLC_SYS_FLAGS),
    OP_STORE8,
    ADDRESS_LOW(WORK_FLAGS_FIRST),
    ADDRESS_HIGH(WORK_FLAGS_FIRST),
    OP_LOAD8,
    ADDRESS_LOW(ZPLC_SYS_TASK_ID),
    ADDRESS_HIGH(ZPLC_SYS_TASK_ID),
    OP_STORE8,
    ADDRESS_LOW(WORK_ID_FIRST),
    ADDRESS_HIGH(WORK_ID_FIRST),
    OP_PUSH8,
    0U, /* PART_ONE_VALUE_INDEX: patched per test */
    OP_STORE8,
    ADDRESS_LOW(OPI_BYTE_0),
    ADDRESS_HIGH(OPI_BYTE_0),
    /* REMAINDER_PC */
    OP_LOAD8,
    ADDRESS_LOW(ZPLC_SYS_FLAGS),
    ADDRESS_HIGH(ZPLC_SYS_FLAGS),
    OP_STORE8,
    ADDRESS_LOW(WORK_FLAGS_REMAINDER),
    ADDRESS_HIGH(WORK_FLAGS_REMAINDER),
    OP_LOAD8,
    ADDRESS_LOW(ZPLC_SYS_TASK_ID),
    ADDRESS_HIGH(ZPLC_SYS_TASK_ID),
    OP_STORE8,
    ADDRESS_LOW(WORK_ID_REMAINDER),
    ADDRESS_HIGH(WORK_ID_REMAINDER),
    OP_LOAD8,
    ADDRESS_LOW(WORK_PEER_COUNT),
    ADDRESS_HIGH(WORK_PEER_COUNT),
    OP_STORE8,
    ADDRESS_LOW(WORK_PEER_SEEN),
    ADDRESS_HIGH(WORK_PEER_SEEN),
    OP_PUSH8,
    REMAINDER_VALUE,
    OP_STORE8,
    ADDRESS_LOW(OPI_BYTE_1),
    ADDRESS_HIGH(OPI_BYTE_1),
    OP_HALT,
};

/* The peer task counts its own scans and stops. */
static const uint8_t peer_code[] = {
    OP_LOAD8,  ADDRESS_LOW(WORK_PEER_COUNT), ADDRESS_HIGH(WORK_PEER_COUNT), OP_PUSH8, 1U, OP_ADD,
    OP_STORE8, ADDRESS_LOW(WORK_PEER_COUNT), ADDRESS_HIGH(WORK_PEER_COUNT), OP_HALT,
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
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
  data[2] = (uint8_t)(value >> 16);
  data[3] = (uint8_t)(value >> 24);
}

/* The task under test starts at the first instruction of the program. With a
 * peer, a second task that is one instruction longer than a no-op sits in slot
 * zero, so it is released and run before the task under test in every batch;
 * the slot of the task under test is returned through `slot`. */
static size_t build_run_control_program(uint8_t *program, uint32_t interval_us, uint8_t part_one_value, bool peer, int *slot) {
  const size_t main_size = sizeof(run_control_code);
  const size_t code_size = main_size + (peer ? sizeof(peer_code) : 0U);
  const size_t task_count = peer ? 2U : 1U;
  const size_t task_bytes = task_count * ZPLC_TASK_DEF_SIZE;
  const size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t task_offset = code_offset + code_size;
  const size_t total = task_offset + task_bytes;
  uint8_t *task = program + task_offset;
  uint32_t crc;

  zassert_true(total <= PROGRAM_CAPACITY, "program buffer overflow");
  zassert_equal(run_control_code[PART_ONE_VALUE_INDEX - 1U], OP_PUSH8, "part one value index must follow its push");
  zassert_equal(run_control_code[REMAINDER_PC], OP_LOAD8, "remainder must start at its first load");
  memset(program, 0, total);
  memcpy(program, "ZPLC", 4U);
  write_u16_le(program + 4U, ZPLC_VERSION_MAJOR);
  write_u16_le(program + 6U, ZPLC_VERSION_MINOR);
  write_u32_le(program + 28U, ZPLC_DRAFT_COUNTER);
  write_u32_le(program + 16U, (uint32_t)code_size);
  write_u32_le(program + 20U, (uint32_t)task_bytes);
  write_u16_le(program + 26U, 2U);
  write_u16_le(program + 32U, ZPLC_SEG_CODE);
  write_u32_le(program + 36U, (uint32_t)code_size);
  write_u16_le(program + 40U, ZPLC_SEG_TASK);
  write_u32_le(program + 44U, (uint32_t)task_bytes);
  memcpy(program + code_offset, run_control_code, main_size);
  program[code_offset + PART_ONE_VALUE_INDEX] = part_one_value;
  if (peer) {
    memcpy(program + code_offset + main_size, peer_code, sizeof(peer_code));
    write_u16_le(task, PEER_TASK_ID);
    task[2] = ZPLC_TASK_CYCLIC;
    task[3] = 0U;
    write_u32_le(task + 4U, interval_us);
    write_u16_le(task + 8U, (uint16_t)main_size);
    write_u16_le(task + 10U, 64U);
    task += ZPLC_TASK_DEF_SIZE;
  }
  write_u16_le(task, TASK_ID);
  task[2] = ZPLC_TASK_CYCLIC;
  task[3] = 1U;
  write_u32_le(task + 4U, interval_us);
  write_u16_le(task + 8U, 0U);
  write_u16_le(task + 10U, 64U);
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  write_u32_le(program + 12U, crc);
  *slot = peer ? 1 : 0;
  return total;
}

static void clear_scheduler(void) {
  int index;

  zassert_ok(zplc_sched_stop(), "stop scheduler");
  for (index = 0; index < CONFIG_ZPLC_MAX_TASKS; index++) {
    int result = zplc_sched_unregister_task(index);

    zassert_true(result == 0 || result == -2, "unregister task");
  }
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "scheduler must be idle");
}

static uint8_t work_byte(uint16_t offset) { return zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[offset]; }

/* Loads the program and returns the slot of the task under test. */
static int load_run_control_program(uint32_t interval_us, uint8_t part_one_value, bool peer) {
  uint8_t program[PROGRAM_CAPACITY];
  size_t size;
  int slot;

  clear_scheduler();
  zplc_force_clear_all();
  size = build_run_control_program(program, interval_us, part_one_value, peer, &slot);
  zassert_equal(zplc_sched_load(program, size), peer ? 2 : 1, "load run-control program");
  memset(zplc_mem_get_region(ZPLC_MEM_WORK_BASE), 0, 8U);
  memset(zplc_mem_get_region(ZPLC_MEM_OPI_BASE), 0, 8U);
  return slot;
}

static void force_unused_output_byte(void) {
  const uint8_t forced = UNUSED_FORCED_VALUE;

  zassert_ok(zplc_force_set_bytes(OPI_BYTE_2, &forced, 1U), "force an output byte the program never writes");
}

static void assert_force_kept(uint16_t address, uint8_t value) {
  uint16_t entry_address = 0U;
  uint16_t entry_size = 0U;
  uint8_t entry_value = 0U;

  zassert_equal(zplc_force_get_count(), 1U, "the force table must be kept");
  zassert_ok(zplc_force_get(0U, &entry_address, &entry_size, &entry_value, sizeof(entry_value)), "read the force entry");
  zassert_equal(entry_address, address, "force entry address changed");
  zassert_equal(entry_size, 1U, "force entry size changed");
  zassert_equal(entry_value, value, "force entry value changed");
}

/* The coordinator announces PAUSED and applies the safe outputs under the
 * memory lock. A debug snapshot takes that lock, so once it returns the pause
 * is complete. */
static void wait_until_paused(int slot, zplc_sched_vm_snapshot_t *snapshot) {
  int waited_ms = 0;

  while (zplc_sched_get_state() != ZPLC_SCHED_STATE_PAUSED && waited_ms < 2000) {
    k_msleep(5);
    waited_ms += 5;
  }
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_PAUSED, "scheduler did not pause");
  zassert_ok(zplc_sched_debug_snapshot(slot, snapshot), "snapshot paused task");
}

static void wait_for_output_commit(uint32_t after_count) {
  zplc_sched_stats_t stats;
  int waited_ms = 0;

  do {
    zassert_ok(zplc_sched_get_stats(&stats), "read commit count");
    if (stats.output_commit_count > after_count) {
      return;
    }
    k_msleep(5);
    waited_ms += 5;
  } while (waited_ms < 2000);
  zassert_unreachable("no output commit after resume");
}

static void *scheduler_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL");
  zassert_ok(zplc_sched_init(), "initialize scheduler");
  return NULL;
}

static void scheduler_teardown(void *fixture) {
  ARG_UNUSED(fixture);
  clear_scheduler();
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

/* RT-017: a breakpoint pause keeps the image and forces; resume continues.
 * Fails without the fix: the pause zeroes the output image and the force table,
 * so the resumed scan finishes on a blank image and the output stays off. */
ZTEST(zplc_scheduler_run_control, test_breakpoint_pause_keeps_image_and_resume_drives_it_again) {
  int slot;
  zplc_sched_vm_snapshot_t snapshot;
  zplc_sched_stats_t before_resume;

  slot = load_run_control_program(FAST_INTERVAL_US, 0x01U, false);
  force_unused_output_byte();
  zassert_ok(zplc_sched_debug_add_breakpoint(slot, REMAINDER_PC), "break at the remainder of the scan");
  zassert_ok(zplc_sched_start(), "start scheduler");
  wait_until_paused(slot, &snapshot);

  zassert_true(snapshot.paused != 0U, "the scan is interrupted");
  zassert_equal(snapshot.pc, REMAINDER_PC, "paused at the breakpoint");
  zassert_equal(work_byte(0U), 1U, "the first part ran once");
  assert_physical_output(0, "physical output must be safe while paused");
  zassert_equal(zplc_opi_read8(0U), 0x01U, "paused output image keeps what the scan wrote");
  zassert_equal(zplc_opi_read8(1U), 0U, "the remainder has not run");
  zassert_equal(zplc_opi_read8(2U), UNUSED_FORCED_VALUE, "forced byte stays in the paused image");
  assert_force_kept(OPI_BYTE_2, UNUSED_FORCED_VALUE);

  /* Resume. The outputs are not driven by the resume itself: the first normal
   * commit does it, from the preserved image, after the scan has finished. */
  zassert_ok(zplc_sched_debug_remove_breakpoint(slot, REMAINDER_PC), "remove the breakpoint");
  zassert_ok(zplc_sched_get_stats(&before_resume), "read resume baseline");
  zplc_sched_test_hold_before_commit();
  zassert_ok(zplc_sched_resume(), "resume scheduler");
  zassert_ok(zplc_sched_test_wait_before_commit(1000), "resumed scan did not reach its commit");
  assert_physical_output(0, "resume must not energize outputs before commit");
  zassert_equal(work_byte(0U), 1U, "the interrupted scan continued instead of restarting");
  zassert_equal(zplc_opi_read8(0U), 0x01U, "preserved image is unchanged");
  zassert_equal(zplc_opi_read8(1U), REMAINDER_VALUE, "the remainder of the scan wrote its output");
  zassert_equal(work_byte(2U), work_byte(1U), "both parts of the scan saw the same system flags");
  zassert_true((work_byte(1U) & ZPLC_SYS_FLAG_FIRST_SCAN) != 0U, "an interrupted first scan stays a first scan");
  zplc_sched_test_release_before_commit();
  wait_for_output_commit(before_resume.output_commit_count);
  assert_physical_output(1, "commit drives the output from the kept image");
  assert_force_kept(OPI_BYTE_2, UNUSED_FORCED_VALUE);
  zassert_equal(zplc_opi_read8(2U), UNUSED_FORCED_VALUE, "forced byte survives the resumed scan");
}

/* RT-017: a force is kept while paused and reaches the pins after resume.
 * The program writes 0 to output 0 while the table forces it on: the output is
 * safe while paused and follows the force, not the program, once the scan is
 * committed after resume. */
ZTEST(zplc_scheduler_run_control, test_force_is_kept_while_paused_and_applied_after_resume) {
  int slot;
  const uint8_t forced_on = 0x01U;
  zplc_sched_vm_snapshot_t snapshot;
  zplc_sched_stats_t before_resume;

  slot = load_run_control_program(FAST_INTERVAL_US, 0x00U, false);
  zassert_ok(zplc_force_set_bytes(OPI_BYTE_0, &forced_on, 1U), "force output 0 on");
  zassert_ok(zplc_sched_debug_add_breakpoint(slot, REMAINDER_PC), "break at the remainder of the scan");
  zassert_ok(zplc_sched_start(), "start scheduler");
  wait_until_paused(slot, &snapshot);

  assert_physical_output(0, "a forced output is still safe while paused");
  zassert_equal(zplc_opi_read8(0U), forced_on, "the force wins over the program in the paused image");
  assert_force_kept(OPI_BYTE_0, forced_on);

  zassert_ok(zplc_sched_debug_remove_breakpoint(slot, REMAINDER_PC), "remove the breakpoint");
  zassert_ok(zplc_sched_get_stats(&before_resume), "read resume baseline");
  zassert_ok(zplc_sched_resume(), "resume scheduler");
  wait_for_output_commit(before_resume.output_commit_count);
  assert_physical_output(1, "forced output is applied after resume");
  assert_force_kept(OPI_BYTE_0, forced_on);
  zassert_equal(zplc_opi_read8(0U), forced_on, "force still masks the program");
}

/* RT-017: the pause command keeps the image and forces with the pins safe.
 * The shell `zplc dbg pause` lands between scans: the image and the forces
 * stay, the physical output is safe. */
ZTEST(zplc_scheduler_run_control, test_external_pause_keeps_image_and_forces_with_safe_output) {
  int slot;
  zplc_sched_stats_t before_resume;
  int waited_ms = 0;

  slot = load_run_control_program(FAST_INTERVAL_US, 0x01U, false);
  force_unused_output_byte();
  zassert_ok(zplc_sched_start(), "start scheduler");
  while (work_byte(0U) == 0U && waited_ms < 2000) {
    k_msleep(5);
    waited_ms += 5;
  }
  wait_for_output_commit(0U);
  zassert_ok(zplc_sched_pause(), "pause scheduler");

  assert_physical_output(0, "physical output must be safe while paused");
  zassert_equal(zplc_opi_read8(0U), 0x01U, "pause keeps the output image");
  zassert_equal(zplc_opi_read8(1U), REMAINDER_VALUE, "pause keeps every byte of the output image");
  zassert_equal(zplc_opi_read8(2U), UNUSED_FORCED_VALUE, "pause keeps the forced byte");
  assert_force_kept(OPI_BYTE_2, UNUSED_FORCED_VALUE);

  zassert_ok(zplc_sched_get_stats(&before_resume), "read resume baseline");
  zassert_ok(zplc_sched_resume(), "resume scheduler");
  wait_for_output_commit(before_resume.output_commit_count);
  assert_physical_output(1, "resume drives the output from the kept image");
}

/* RT-017: a step keeps the image and forces and leaves the pins safe.
 * A stepped scan is committed, the runtime is then paused, so the physical
 * output is safe and the image shows the stepped scan. */
ZTEST(zplc_scheduler_run_control, test_step_keeps_image_and_forces_with_safe_output) {
  int slot;
  slot = load_run_control_program(FAST_INTERVAL_US, 0x01U, false);
  force_unused_output_byte();

  zassert_ok(zplc_sched_step(), "step one scan");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_PAUSED, "step leaves the scheduler paused");
  assert_physical_output(0, "physical output must be safe after a step");
  zassert_equal(work_byte(0U), 1U, "the scan ran once");
  zassert_equal(zplc_opi_read8(0U), 0x01U, "the stepped scan stays visible in the output image");
  zassert_equal(zplc_opi_read8(1U), REMAINDER_VALUE, "the whole scan wrote its outputs");
  assert_force_kept(OPI_BYTE_2, UNUSED_FORCED_VALUE);
}

/* RT-017: step from a breakpoint finishes the interrupted scan.
 * It pauses at the cycle boundary; from the boundary a step runs one scan.
 * Fails without the fix: the second step restarts the scan from the entry
 * point and stops at the same breakpoint again. */
ZTEST(zplc_scheduler_run_control, test_step_from_breakpoint_finishes_the_interrupted_scan) {
  int slot;
  zplc_sched_vm_snapshot_t snapshot;

  slot = load_run_control_program(FAST_INTERVAL_US, 0x01U, false);
  zassert_ok(zplc_sched_debug_add_breakpoint(slot, REMAINDER_PC), "break at the remainder of the scan");

  zassert_ok(zplc_sched_step(), "first step stops at the breakpoint");
  zassert_ok(zplc_sched_debug_snapshot(slot, &snapshot), "snapshot first step");
  zassert_true(snapshot.paused != 0U, "first step stops mid-scan");
  zassert_equal(snapshot.pc, REMAINDER_PC, "first step stops at the break");
  zassert_equal(work_byte(0U), 1U, "first part ran once");
  zassert_equal(zplc_opi_read8(1U), 0U, "remainder has not run");

  zassert_ok(zplc_sched_step(), "second step finishes the scan");
  zassert_ok(zplc_sched_debug_snapshot(slot, &snapshot), "snapshot second step");
  zassert_equal(snapshot.paused, 0U, "second step ends at the cycle boundary, not at the break");
  zassert_equal(work_byte(0U), 1U, "the first part did not run again");
  zassert_equal(zplc_opi_read8(1U), REMAINDER_VALUE, "the remainder of the interrupted scan ran");
  zassert_equal(work_byte(2U), work_byte(1U), "both parts of the scan saw the same system flags");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_PAUSED, "step leaves the scheduler paused");

  zassert_ok(zplc_sched_step(), "third step runs one scan");
  zassert_ok(zplc_sched_debug_snapshot(slot, &snapshot), "snapshot third step");
  zassert_equal(work_byte(0U), 2U, "the new scan started from the entry point");
  zassert_true(snapshot.paused != 0U, "the new scan stops at the break again");
  zassert_equal(snapshot.pc, REMAINDER_PC, "third step stops at the break");
}

/* RT-017: STOP drops a scan that a resume armed and no task has consumed.
 * Fails without the fix: STOP leaves the task VM marked as resumed, so the
 * next step continues the scan that STOP was meant to abandon. */
ZTEST(zplc_scheduler_run_control, test_stop_after_resume_abandons_the_scan) {
  int slot;
  zplc_sched_vm_snapshot_t snapshot;

  slot = load_run_control_program(SLOW_INTERVAL_US, 0x01U, false);
  zassert_ok(zplc_sched_debug_add_breakpoint(slot, REMAINDER_PC), "break at the remainder of the scan");
  zassert_ok(zplc_sched_step(), "step to the breakpoint");
  zassert_equal(work_byte(0U), 1U, "first part ran once");
  zassert_ok(zplc_sched_debug_remove_breakpoint(slot, REMAINDER_PC), "remove the breakpoint");

  zassert_ok(zplc_sched_resume(), "resume arms the interrupted scan");
  zassert_ok(zplc_sched_stop(), "stop before any task ran");

  zassert_ok(zplc_sched_step(), "step after stop");
  zassert_ok(zplc_sched_debug_snapshot(slot, &snapshot), "snapshot after step");
  zassert_equal(snapshot.paused, 0U, "no scan is left interrupted");
  zassert_equal(work_byte(0U), 2U, "step after stop starts a new scan from the entry point");
  zassert_equal(zplc_opi_read8(1U), REMAINDER_VALUE, "the new scan ran to its end");
}

/* STOP while paused at a breakpoint: outputs safe, image zeroed, forces
 * cleared, task VM back at its entry point. The breakpoint table stays.
 * Fails without the fix: the task VM stays paused at the breakpoint. */
ZTEST(zplc_scheduler_run_control, test_stop_while_paused_resets_the_task_vm) {
  int slot;
  zplc_sched_vm_snapshot_t snapshot;

  slot = load_run_control_program(FAST_INTERVAL_US, 0x01U, false);
  force_unused_output_byte();
  zassert_ok(zplc_sched_debug_add_breakpoint(slot, REMAINDER_PC), "break at the remainder of the scan");
  zassert_ok(zplc_sched_step(), "step to the breakpoint");
  zassert_equal(zplc_opi_read8(0U), 0x01U, "image is kept while paused");
  assert_force_kept(OPI_BYTE_2, UNUSED_FORCED_VALUE);

  zassert_ok(zplc_sched_stop(), "stop scheduler");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "stop leaves the scheduler idle");
  assert_physical_output(0, "physical output must be safe after stop");
  zassert_equal(zplc_opi_read8(0U), 0U, "stop zeroes the output image");
  zassert_equal(zplc_opi_read8(1U), 0U, "stop zeroes every output byte");
  zassert_equal(zplc_opi_read8(2U), 0U, "stop zeroes the forced byte");
  zassert_equal(zplc_force_get_count(), 0U, "stop clears the force table");
  zassert_ok(zplc_sched_debug_snapshot(slot, &snapshot), "snapshot after stop");
  zassert_equal(snapshot.paused, 0U, "stop ends the interrupted scan");
  zassert_equal(snapshot.pc, 0U, "stop returns the task to its entry point");
  zassert_equal(snapshot.sp, 0U, "stop empties the task stack");
  zassert_equal(snapshot.breakpoint_count, 1U, "stop keeps the breakpoints");
}

/* A breakpoint on the first instruction of a task fires on the first scan
 * after a resume from a pause that landed between scans. Resume only arms the
 * "skip one breakpoint" mark of a VM that is stopped at a breakpoint.
 * Fails without the fix: the first scan after the resume runs through. */
ZTEST(zplc_scheduler_run_control, test_resume_from_external_pause_keeps_entry_breakpoint_armed) {
  int slot;
  zplc_sched_vm_snapshot_t snapshot;
  uint8_t scans_before_resume;
  int waited_ms = 0;

  slot = load_run_control_program(FAST_INTERVAL_US, 0x01U, false);
  zassert_ok(zplc_sched_start(), "start scheduler");
  while (work_byte(0U) == 0U && waited_ms < 2000) {
    k_msleep(5);
    waited_ms += 5;
  }
  zassert_ok(zplc_sched_pause(), "pause between scans");
  scans_before_resume = work_byte(0U);
  zassert_true(scans_before_resume > 0U, "the program ran before the pause");

  zassert_ok(zplc_sched_debug_add_breakpoint(slot, 0U), "break at the entry point");
  zassert_ok(zplc_sched_resume(), "resume scheduler");
  wait_until_paused(slot, &snapshot);

  zassert_true(snapshot.paused != 0U, "entry breakpoint stops the scan");
  zassert_equal(snapshot.pc, 0U, "stopped at the entry point");
  zassert_equal(work_byte(0U), scans_before_resume, "no instruction ran after the resume");
}

/* RT-017: an interrupted scan keeps its task id and first-scan flag.
 * Another task runs between its two parts: the peer sits ahead of it in every
 * batch and rewrites the task id register before the remainder continues. */
ZTEST(zplc_scheduler_run_control, test_interrupted_scan_keeps_its_task_id_and_first_scan_flag) {
  int slot;
  zplc_sched_vm_snapshot_t snapshot;
  zplc_sched_stats_t before_resume;
  uint8_t peer_count_at_break;

  slot = load_run_control_program(FAST_INTERVAL_US, 0x01U, true);
  zassert_equal(slot, 1, "the task under test follows the peer");
  zassert_ok(zplc_sched_debug_add_breakpoint(slot, REMAINDER_PC), "break at the remainder of the scan");
  zassert_ok(zplc_sched_start(), "start scheduler");
  wait_until_paused(slot, &snapshot);
  zassert_equal(snapshot.pc, REMAINDER_PC, "paused at the breakpoint");
  zassert_equal(work_byte(3U), TASK_ID, "first part saw its task id");
  peer_count_at_break = work_byte(5U);

  zassert_ok(zplc_sched_debug_remove_breakpoint(slot, REMAINDER_PC), "remove the breakpoint");
  zassert_ok(zplc_sched_get_stats(&before_resume), "read resume baseline");
  zplc_sched_test_hold_before_commit();
  zassert_ok(zplc_sched_resume(), "resume scheduler");
  zassert_ok(zplc_sched_test_wait_before_commit(1000), "resumed batch did not reach its commit");
  zassert_equal(work_byte(6U), (uint8_t)(peer_count_at_break + 1U), "the peer ran between the two parts of the scan");
  zassert_equal(work_byte(4U), TASK_ID, "the remainder still sees the id of its own task");
  zassert_equal(work_byte(2U), work_byte(1U), "both parts of the scan saw the same system flags");
  zassert_true((work_byte(2U) & ZPLC_SYS_FLAG_FIRST_SCAN) != 0U, "the remainder of the first scan sees the first-scan flag");
  zplc_sched_test_release_before_commit();
  wait_for_output_commit(before_resume.output_commit_count);
}

/* RT-023: the safe value a project declares is the level of the pin from the load that committed the program,
 * through STOP and a pause. The output the tests watch is output 0 (image byte 0, bit 0).
 * Fails without the declaration being read where the safe level is chosen: the pin goes to the board's level, 0.
 * Fails without the load driving the safe state: the pin keeps the level it had until the first stop. */
#define DECLARED_SAFE_CAPACITY (PROGRAM_CAPACITY + 16U)

static size_t build_declaring_program(uint8_t *program, const uint8_t *entries, size_t entries_size, uint8_t part_one_value) {
  int slot;
  const size_t size = build_run_control_program(program, FAST_INTERVAL_US, part_one_value, false, &slot);

  return entries == NULL ? size : zplc_test_append_safe(program, size, DECLARED_SAFE_CAPACITY, entries, entries_size);
}

ZTEST(zplc_scheduler_run_control, test_declared_safe_value_is_on_the_pin_from_load_and_in_stop) {
  const uint8_t on[] = {ZPLC_TEST_SAFE(0, 0, 1)};
  uint8_t program[DECLARED_SAFE_CAPACITY];
  size_t size;

  clear_scheduler();
  zplc_force_clear_all();
  assert_physical_output(0, "the pin is safe before any program");
  size = build_declaring_program(program, on, sizeof(on), 0x00U);
  zassert_true(size != 0U, "the artifact is built");
  zassert_ok(zplc_sched_validate_program(program, size), "a declaration for an output of the board is admitted");
  zassert_equal(zplc_sched_load(program, size), 1, "the program is loaded");
  zassert_equal(zplc_core_declared_safe_count(), 1U, "the core holds the declaration");
  assert_physical_output(1, "the declared value is on the pin before the first scan");
  zassert_equal(zplc_opi_read8(0U), 0U, "while the output image is the program's logical state, still zero");

  zassert_ok(zplc_sched_start(), "start scheduler");
  k_msleep(2U * FAST_INTERVAL_US / 1000U + 50U);
  assert_physical_output(0, "while the program runs the pin follows the program, which writes 0");
  zassert_ok(zplc_sched_stop(), "stop scheduler");
  assert_physical_output(1, "STOP puts the declared value on the pin, not the board's");
  zassert_equal(zplc_opi_read8(0U), 0U, "and the image is zeroed");
}

ZTEST(zplc_scheduler_run_control, test_declared_safe_value_is_on_the_pin_while_paused) {
  const uint8_t on[] = {ZPLC_TEST_SAFE(0, 0, 1)};
  uint8_t program[DECLARED_SAFE_CAPACITY];
  zplc_sched_vm_snapshot_t snapshot;
  size_t size;

  clear_scheduler();
  zplc_force_clear_all();
  size = build_declaring_program(program, on, sizeof(on), 0x00U);
  zassert_equal(zplc_sched_load(program, size), 1, "the program is loaded");
  zassert_ok(zplc_sched_debug_add_breakpoint(0, REMAINDER_PC), "break at the remainder of the scan");
  zassert_ok(zplc_sched_start(), "start scheduler");
  wait_until_paused(0, &snapshot);
  zassert_equal(zplc_opi_read8(0U), 0U, "the paused image keeps what the scan wrote: 0");
  assert_physical_output(1, "a pause drives the declared value");
  zassert_ok(zplc_sched_debug_remove_breakpoint(0, REMAINDER_PC), "remove the breakpoint");
  zassert_ok(zplc_sched_stop(), "stop scheduler");
}

ZTEST(zplc_scheduler_run_control, test_a_program_that_declares_nothing_replaces_the_declaration) {
  const uint8_t on[] = {ZPLC_TEST_SAFE(0, 0, 1)};
  uint8_t program[DECLARED_SAFE_CAPACITY];
  size_t size;

  clear_scheduler();
  zplc_force_clear_all();
  size = build_declaring_program(program, on, sizeof(on), 0x00U);
  zassert_equal(zplc_sched_load(program, size), 1, "a program declaring output 0 is loaded");
  assert_physical_output(1, "its declared value is on the pin");
  clear_scheduler();
  size = build_declaring_program(program, NULL, 0U, 0x00U);
  zassert_equal(zplc_sched_load(program, size), 1, "a program declaring nothing replaces it");
  zassert_equal(zplc_core_declared_safe_count(), 0U, "the declaration of the replaced program is gone");
  assert_physical_output(0, "the pin is at the board's level again, from the load");
}

ZTEST(zplc_scheduler_run_control, test_a_declaration_for_an_output_the_board_does_not_have_is_refused) {
  const uint8_t nowhere[] = {ZPLC_TEST_SAFE(7, 3, 1)};
  const uint8_t on[] = {ZPLC_TEST_SAFE(0, 0, 1)};
  uint8_t program[DECLARED_SAFE_CAPACITY];
  size_t size;

  clear_scheduler();
  zplc_force_clear_all();
  size = build_declaring_program(program, on, sizeof(on), 0x00U);
  zassert_equal(zplc_sched_load(program, size), 1, "a program declaring output 0 is loaded");
  clear_scheduler();

  size = build_declaring_program(program, nowhere, sizeof(nowhere), 0x00U);
  zassert_true(size != 0U, "the artifact is built");
  zassert_equal(zplc_sched_validate_program(program, size), ZPLC_LOADER_ERR_SAFE,
                "the declaration of an output that is not on this board is named as such");
  zassert_equal(zplc_sched_load(program, size), -3, "the load is refused");
  zassert_equal(zplc_core_declared_safe_count(), 1U, "and the program that was there is untouched");
}

ZTEST_SUITE(zplc_scheduler_run_control, NULL, scheduler_setup, NULL, NULL, scheduler_teardown);
