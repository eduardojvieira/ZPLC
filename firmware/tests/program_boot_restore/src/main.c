#include <string.h>

#include <zephyr/devicetree.h>
#include <zephyr/ztest.h>

#include "program_boot_restore.h"
#include "zplc_app_test_hooks.h"
#include <zplc_core.h>
#include <zplc_failsafe.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>
#include <zplc_test_hooks.h>

#include "zplc_test_safe.h"

/* The physical output is the emulated LED of native_sim (HAL channel 0, image byte 0 bit 0). A target without the
 * emulator checks the same through the declaration the core holds and the state of the scheduler. */
#if DT_NODE_EXISTS(DT_ALIAS(led0))
#if DT_NODE_HAS_COMPAT(DT_GPIO_CTLR(DT_ALIAS(led0), gpios), zephyr_gpio_emul)
#include <zephyr/drivers/gpio/gpio_emul.h>
#define HAVE_EMULATED_OUTPUT 1
#endif
#endif

#ifdef HAVE_EMULATED_OUTPUT
#define LED0_CONTROLLER DEVICE_DT_GET(DT_GPIO_CTLR(DT_ALIAS(led0), gpios))
#define LED0_PIN DT_GPIO_PIN(DT_ALIAS(led0), gpios)
#define assert_physical_output(expected, message) \
  zassert_equal(gpio_emul_output_get(LED0_CONTROLLER, LED0_PIN), (expected), message)
#else
#define assert_physical_output(expected, message) ((void)(expected))
#endif

#define PROGRAM_CAPACITY 256U
#define WORKSPACE_CAPACITY (PROGRAM_CAPACITY + ZPLC_PROGRAM_STORE_FOOTER_SIZE)

static uint8_t stored_program[WORKSPACE_CAPACITY];
static size_t stored_size;
static zplc_program_store_restore_t stored_result;
static int stored_commit_result;

static zplc_program_store_restore_t test_store_restore(uint8_t *workspace,
                                                        size_t workspace_capacity,
                                                        size_t *program_size) {
  if (stored_result == ZPLC_PROGRAM_STORE_OK ||
      stored_result == ZPLC_PROGRAM_STORE_LEGACY) {
    if (stored_size > workspace_capacity)
      return ZPLC_PROGRAM_STORE_ERROR;
    memcpy(workspace, stored_program, stored_size);
    *program_size = stored_size;
  } else {
    *program_size = 0U;
  }
  return stored_result;
}

static int test_store_commit(uint8_t *workspace, size_t program_size,
                             size_t workspace_capacity) {
  if (stored_commit_result == ZPLC_PROGRAM_STORE_COMMIT_OK) {
    zassert_true(program_size <= workspace_capacity, "valid migration input");
    memcpy(stored_program, workspace, program_size);
    stored_size = program_size;
    stored_result = ZPLC_PROGRAM_STORE_OK;
  }
  return stored_commit_result;
}

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  size_t index;
  for (index = 0U; index < length; ++index) {
    uint32_t bit;
    crc ^= data[index];
    for (bit = 0U; bit < 8U; ++bit)
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
  }
  return crc;
}

static void put_u16(uint8_t *data, uint16_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void put_u32(uint8_t *data, uint32_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
  data[2] = (uint8_t)(value >> 16);
  data[3] = (uint8_t)(value >> 24);
}

static size_t build_program(uint8_t *program, uint8_t output_value) {
  uint8_t code[] = {OP_PUSH8, output_value, OP_STORE8,
                    (uint8_t)ZPLC_MEM_OPI_BASE,
                    (uint8_t)(ZPLC_MEM_OPI_BASE >> 8), OP_HALT};
  const size_t code_offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t task_offset = code_offset + sizeof(code);
  const size_t total = task_offset + ZPLC_TASK_DEF_SIZE;
  uint32_t crc;

  memset(program, 0, total);
  memcpy(program, "ZPLC", 4U);
  put_u16(program + 4U, ZPLC_VERSION_MAJOR);
  put_u16(program + 6U, ZPLC_VERSION_MINOR);
  put_u32(program + 28U, ZPLC_DRAFT_COUNTER);
  put_u32(program + 16U, sizeof(code));
  put_u32(program + 20U, ZPLC_TASK_DEF_SIZE);
  put_u16(program + 26U, 2U);
  put_u16(program + 32U, ZPLC_SEG_CODE);
  put_u32(program + 36U, sizeof(code));
  put_u16(program + 40U, ZPLC_SEG_TASK);
  put_u32(program + 44U, ZPLC_TASK_DEF_SIZE);
  memcpy(program + code_offset, code, sizeof(code));
  put_u16(program + task_offset, 1U);
  program[task_offset + 2U] = ZPLC_TASK_CYCLIC;
  put_u32(program + task_offset + 4U, 10000U);
  put_u16(program + task_offset + 10U, 32U);
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  put_u32(program + 12U, crc);
  return total;
}

static void refresh_program_crc(uint8_t *program, size_t size) {
  uint32_t crc = crc32_update(0xFFFFFFFFU, program, 12U);

  crc = crc32_update(crc, program + 16U, size - 16U) ^ 0xFFFFFFFFU;
  put_u32(program + 12U, crc);
}

static void boot_setup(void) {
  memset(stored_program, 0, sizeof(stored_program));
  stored_size = 0U;
  stored_result = ZPLC_PROGRAM_STORE_EMPTY;
  stored_commit_result = ZPLC_PROGRAM_STORE_COMMIT_OK;
  zplc_boot_restore_test_set_store(test_store_restore, test_store_commit);
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "HAL init");
  zassert_ok(zplc_core_init(), "core init");
  zassert_ok(zplc_sched_init(), "scheduler init");
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_OK);
}

static void boot_teardown(void) {
  zplc_sched_test_fail_safe_outputs(ZPLC_HAL_OK);
  zplc_boot_restore_test_set_store(NULL, NULL);
  zassert_ok(zplc_sched_shutdown(), "scheduler shutdown");
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "HAL shutdown");
}

/* The staging buffer is the one buffer of the code size: it receives the stored program and keeps it (RT-028). */
static int restore(uint8_t *staging, size_t *program_size) {
  return zplc_boot_restore_scheduler(staging, WORKSPACE_CAPACITY, program_size);
}

ZTEST(program_boot_restore, test_verified_active_is_ready_idle_and_safe) {
  uint8_t staging[WORKSPACE_CAPACITY];
  zplc_task_t task;
  size_t loaded_size;
  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(staging, &loaded_size), 1, "one task restored");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "restore never auto-starts");
  zassert_equal(loaded_size, stored_size, "published after validation");
  zassert_mem_equal(staging, stored_program, stored_size, "the artifact is in the staging buffer");
  zassert_ok(zplc_sched_get_task(0, &task), "read restored task");
  zassert_equal(task.stats.cycle_count, 0U, "restore never executes a cycle");
  zassert_equal(zplc_core_get_opi(0U), 0U, "outputs remain safe");
  zassert_equal(zplc_force_get_count(), 0U, "no forces on boot");
  boot_teardown();
}

/* RT-022, RT-023: a program that declares an output safe at 1 is restored into STOP with that pin high, before
 * any scan, and the restore does not run it. Fails without the load driving the safe state of the program it
 * committed: the pin is where the boot left it. */
ZTEST(program_boot_restore, test_restored_program_puts_its_declared_safe_value_on_the_pin_and_waits_in_stop) {
  uint8_t staging[WORKSPACE_CAPACITY];
  const uint8_t on[] = {ZPLC_TEST_SAFE(0, 0, 1)};
  size_t loaded_size;
  zplc_task_t task;

  boot_setup();
  assert_physical_output(0, "the board is at its own level before any program");
  stored_size = build_program(stored_program, 1U);
  stored_size = zplc_test_append_safe(stored_program, stored_size, sizeof(stored_program), on, sizeof(on));
  zassert_true(stored_size != 0U, "the artifact is built");
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(staging, &loaded_size), 1, "one task restored");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "restore never auto-starts");
  zassert_ok(zplc_sched_get_task(0, &task), "read restored task");
  zassert_equal(task.stats.cycle_count, 0U, "restore never executes a cycle");
  zassert_equal(zplc_core_declared_safe_count(), 1U, "the declaration came back with the program");
  assert_physical_output(1, "the pin is at the declared value in STOP");
  zassert_equal(zplc_core_get_opi(0U), 0U, "while the image of the program stays zero");
  boot_teardown();
}

/* RT-023: a stored program whose declaration is for an output this board does not have is not restored: it is
 * the project of another board. The runtime latches safe like it does for any program it cannot verify. */
ZTEST(program_boot_restore, test_stored_declaration_for_an_output_the_board_lacks_is_not_restored) {
  uint8_t staging[WORKSPACE_CAPACITY];
  const uint8_t nowhere[] = {ZPLC_TEST_SAFE(7, 3, 1)};
  size_t loaded_size = 99U;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_size = zplc_test_append_safe(stored_program, stored_size, sizeof(stored_program), nowhere, sizeof(nowhere));
  zassert_true(stored_size != 0U, "the artifact is built");
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(staging, &loaded_size), ZPLC_BOOT_RESTORE_ERROR, "the program is refused");
  zassert_equal(loaded_size, 0U, "nothing is published");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR, "the runtime latches safe");
  zassert_equal(zplc_core_declared_safe_count(), 0U, "no declaration is in force");
  assert_physical_output(0, "and the pin is at the board's level");
  boot_teardown();
}

ZTEST(program_boot_restore, test_verified_fallback_stays_idle) {
  uint8_t staging[WORKSPACE_CAPACITY];
  uint8_t expected[PROGRAM_CAPACITY];
  size_t loaded_size;
  size_t expected_size;
  boot_setup();
  expected_size = build_program(expected, 1U);
  memcpy(stored_program, expected, expected_size);
  stored_size = expected_size;
  stored_result = ZPLC_PROGRAM_STORE_OK; /* Store has selected verified A. */
  zassert_equal(restore(staging, &loaded_size), 1, "verified fallback restores");
  zassert_equal(loaded_size, expected_size, "fallback size");
  zassert_mem_equal(staging, expected, expected_size, "only verified A published");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "still not running");
  boot_teardown();
}

ZTEST(program_boot_restore, test_invalid_payload_latches_safe_error) {
  uint8_t staging[WORKSPACE_CAPACITY];
  size_t loaded_size = 99U;
  size_t invalid_size;
  boot_setup();
  invalid_size = build_program(stored_program, 1U);
  stored_size = invalid_size;
  stored_program[ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE] = 0xFFU;
  refresh_program_crc(stored_program, invalid_size);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(staging, &loaded_size), ZPLC_BOOT_RESTORE_ERROR,
                "invalid payload rejected");
  zassert_equal(loaded_size, 0U, "nothing published");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR, "safe error");
  zassert_true(zplc_sched_start() != 0, "start rejected after restore fault");
  zassert_equal(zplc_core_get_opi(0U), 0U, "outputs remain safe");
  stored_size = build_program(stored_program, 1U);
  zassert_equal(restore(staging, &loaded_size), 1,
                "verified replacement recovers empty error scheduler");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "recovered idle");
  zassert_ok(zplc_sched_start(), "recovered candidate may start explicitly");
  boot_teardown();
}

ZTEST(program_boot_restore, test_legacy_commit_unknown_latches_safe_error) {
  uint8_t staging[WORKSPACE_CAPACITY];
  size_t loaded_size = 99U;
  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_LEGACY;
  stored_commit_result = ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN;
  zassert_equal(restore(staging, &loaded_size),
                ZPLC_BOOT_RESTORE_COMMIT_UNKNOWN,
                "ambiguous legacy migration fails closed");
  zassert_equal(loaded_size, 0U, "legacy artifact never published");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_ERROR, "safe error");
  zassert_true(zplc_sched_start() != 0, "start remains rejected");
  boot_teardown();
}

ZTEST(program_boot_restore, test_empty_store_keeps_scheduler_safe_and_unloaded) {
  uint8_t staging[WORKSPACE_CAPACITY];
  size_t loaded_size = 99U;

  boot_setup();
  zassert_equal(restore(staging, &loaded_size), ZPLC_BOOT_RESTORE_EMPTY,
                "empty store is an explicit safe boot");
  zassert_equal(loaded_size, 0U, "no program loaded");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "idle safely");
  zassert_equal(zplc_core_get_opi(0U), 0U, "outputs safe");
  zassert_equal(zplc_force_get_count(), 0U, "forces clear");
  zassert_true(zplc_sched_start() != 0, "start rejected without tasks");
  boot_teardown();
}

/* RT-028: the stored program is the only resident copy, so a reload takes everything from the store. */
ZTEST(program_boot_restore, test_reload_takes_the_program_from_the_store_not_from_the_buffer) {
  uint8_t staging[WORKSPACE_CAPACITY];
  size_t loaded_size = 0U;
  zplc_task_t task;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(staging, &loaded_size), 1, "boot restore");
  /* An upload that started and never finished leaves the buffer full of something else. */
  memset(staging, 0xA5, sizeof(staging));
  loaded_size = 0U;
  zassert_equal(zplc_program_reload_scheduler(staging, sizeof(staging), &loaded_size), 1,
                "the program is reloaded from the store");
  zassert_equal(loaded_size, stored_size, "its size");
  zassert_mem_equal(staging, stored_program, stored_size, "restored into the one buffer");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "stopped, never auto-started");
  zassert_ok(zplc_sched_get_task(0, &task), "the task is registered");
  zassert_equal(task.stats.cycle_count, 0U, "nothing ran");
  zassert_ok(zplc_sched_start(), "and it starts when asked");
  boot_teardown();
}

ZTEST(program_boot_restore, test_reload_loads_what_the_store_holds_now) {
  uint8_t staging[WORKSPACE_CAPACITY];
  uint8_t replacement[PROGRAM_CAPACITY];
  size_t replacement_size;
  size_t loaded_size = 0U;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(staging, &loaded_size), 1, "boot restore");
  /* A deploy that committed: the store holds the replacement, and nothing else remembers the old program. */
  replacement_size = build_program(replacement, 2U);
  memset(stored_program, 0, sizeof(stored_program));
  memcpy(stored_program, replacement, replacement_size);
  stored_size = replacement_size;
  zassert_equal(zplc_program_reload_scheduler(staging, sizeof(staging), &loaded_size), 1,
                "reload");
  zassert_equal(loaded_size, replacement_size, "the replacement size");
  zassert_mem_equal(staging, replacement, replacement_size, "the replacement, not the first program");
  boot_teardown();
}

ZTEST(program_boot_restore, test_reload_stops_a_running_scheduler) {
  uint8_t staging[WORKSPACE_CAPACITY];
  size_t loaded_size = 0U;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(staging, &loaded_size), 1, "boot restore");
  zassert_ok(zplc_sched_start(), "start");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_RUNNING, "running");
  zassert_equal(zplc_program_reload_scheduler(staging, sizeof(staging), &loaded_size), 1,
                "reload");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "stopped by the reload");
  zassert_equal(zplc_core_get_opi(0U), 0U, "outputs safe");
  boot_teardown();
}

ZTEST(program_boot_restore, test_reload_failure_latches_nothing_and_leaves_no_program) {
  uint8_t staging[WORKSPACE_CAPACITY];
  size_t loaded_size = 99U;
  size_t index;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(restore(staging, &loaded_size), 1, "boot restore");
  stored_result = ZPLC_PROGRAM_STORE_ERROR; /* the backend cannot be read */
  zassert_true(zplc_program_reload_scheduler(staging, sizeof(staging), &loaded_size) < 0,
               "a store that cannot be read is an error");
  zassert_equal(loaded_size, 0U, "no program is claimed");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE,
                "the scheduler is stopped, not latched");
  zassert_true(zplc_sched_start() != 0, "there is no program to start");
  for (index = 0U; index < sizeof(staging); ++index)
    zassert_equal(staging[index], 0U, "staging is cleared");
  /* The store comes back: the same reload works, the runtime was never latched. */
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_equal(zplc_program_reload_scheduler(staging, sizeof(staging), &loaded_size), 1,
                "reload after the store recovers");
  boot_teardown();
}

ZTEST(program_boot_restore, test_reload_of_a_payload_that_fails_verification_is_refused) {
  uint8_t staging[WORKSPACE_CAPACITY];
  size_t loaded_size = 99U;
  size_t invalid_size;

  boot_setup();
  invalid_size = build_program(stored_program, 1U);
  stored_size = invalid_size;
  stored_program[ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE] = 0xFFU;
  refresh_program_crc(stored_program, invalid_size);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  zassert_true(zplc_program_reload_scheduler(staging, sizeof(staging), &loaded_size) < 0,
               "the verifier refuses it");
  zassert_equal(loaded_size, 0U, "nothing loaded");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "stopped, not latched");
  boot_teardown();
}

ZTEST(program_boot_restore, test_reload_of_an_empty_store_loads_nothing) {
  uint8_t staging[WORKSPACE_CAPACITY];
  size_t loaded_size = 99U;

  boot_setup();
  memset(staging, 0xA5, sizeof(staging));
  zassert_equal(zplc_program_reload_scheduler(staging, sizeof(staging), &loaded_size), 0,
                "an empty store is not an error");
  zassert_equal(loaded_size, 0U, "no program");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "idle");
  boot_teardown();
}

ZTEST(program_boot_restore, test_legacy_prepare_confirms_migration_before_ready) {
  uint8_t staging[WORKSPACE_CAPACITY];
  uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  size_t program_size = 99U;
  uint32_t interval_ms = 0U;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_LEGACY;
  zassert_equal(zplc_boot_restore_legacy_prepare(
                    staging, sizeof(staging), workspace, sizeof(workspace),
                    &program_size, &interval_ms),
                ZPLC_BOOT_RESTORE_READY, "confirmed migration is ready");
  zassert_equal(program_size, stored_size, "legacy artifact size");
  zassert_equal(interval_ms, 10U, "legacy interval in milliseconds");
  zassert_equal(stored_result, ZPLC_PROGRAM_STORE_OK,
                "migration is committed before publication");
  boot_teardown();
}

ZTEST(program_boot_restore, test_legacy_prepare_commit_unknown_clears_staging) {
  uint8_t staging[WORKSPACE_CAPACITY];
  uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  size_t program_size = 99U;
  uint32_t interval_ms = 0U;
  size_t index;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_LEGACY;
  stored_commit_result = ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN;
  memset(staging, 0xA5, sizeof(staging));
  zassert_equal(zplc_boot_restore_legacy_prepare(
                    staging, sizeof(staging), workspace, sizeof(workspace),
                    &program_size, &interval_ms),
                ZPLC_BOOT_RESTORE_COMMIT_UNKNOWN,
                "ambiguous publication stays distinguishable");
  zassert_equal(program_size, 0U, "nothing published");
  for (index = 0U; index < sizeof(staging); ++index)
    zassert_equal(staging[index], 0U, "staging is cleared");
  boot_teardown();
}

/*
 * RT-021, RT-022 (decision D-13, option A): whatever the reset left, the runtime restores the stored program into
 * STOP with the outputs at their safe values and does not scan until a person starts it. The previous run's record
 * is what the reset left: a processor fault the firmware rebooted for, a fault the scheduler latched before its
 * watchdog reset the part, or nothing (a power-on).
 */
static void boot_after_reset_that_left(const zplc_fault_record_t *record, int expect_fault_reset,
                                       int expect_fault) {
  uint8_t staging[WORKSPACE_CAPACITY];
  const zplc_reset_report_t *report;
  zplc_task_t task;
  size_t loaded_size;

  boot_setup();
  stored_size = build_program(stored_program, 1U);
  stored_result = ZPLC_PROGRAM_STORE_OK;
  /* The program of the previous run had left an output on: the image of the new run has nothing in it. */
  zplc_mem_get_region(ZPLC_MEM_OPI_BASE)[0] = 0xA5U;
  zplc_failsafe_test_set_retained(record);
  zplc_failsafe_boot();
  report = zplc_failsafe_report();
  /* native_sim reports a power-on at its first boot and nothing after the cause was cleared: what is asserted is
   * the one cause that the record decides. */
  zassert_equal(report->cause == ZPLC_RESET_FAULT, expect_fault_reset != 0, "the cause the previous run left");
  zassert_equal(report->has_fault != 0U, expect_fault != 0, "and its fault, when there was one");
  zassert_equal(zplc_reset_may_run(report->cause), 0, "no cause may run on its own");

  zassert_equal(restore(staging, &loaded_size), 1, "the stored program is restored");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "into STOP");
  zassert_equal(zplc_core_get_opi(0U), 0U, "with the outputs at their safe values");
  k_msleep(120); /* a dozen of the 10 ms task's intervals: nothing releases a scan */
  zassert_ok(zplc_sched_get_task(0, &task), "read the restored task");
  zassert_equal(task.stats.cycle_count, 0U, "no scan ran");
  zassert_equal(zplc_sched_get_state(), ZPLC_SCHED_STATE_IDLE, "and the runtime is still in STOP");
  zassert_ok(zplc_sched_start(), "a person's command starts it");
  boot_teardown();
}

ZTEST(program_boot_restore, test_a_power_on_restores_into_stop) {
  boot_after_reset_that_left(NULL, 0, 0);
}

ZTEST(program_boot_restore, test_a_processor_fault_restores_into_stop_and_shows_the_reason) {
  zplc_fault_record_t record;

  zplc_fault_record_make(&record, ZPLC_FAULT_PROCESSOR, 4U, 0U, 0x08001234U, 3U);
  boot_after_reset_that_left(&record, 1, 1);
  zassert_equal(zplc_failsafe_report()->fault.reason, 4U, "the kernel's reason is in the report");
  zassert_equal(zplc_failsafe_report()->fault.pc, 0x08001234U, "and the program counter");
}

ZTEST(program_boot_restore, test_a_latched_scheduler_fault_that_a_watchdog_reset_survives_is_shown) {
  zplc_fault_record_t record;

  zplc_fault_record_make(&record, ZPLC_FAULT_SCHEDULER, (uint8_t)1U, 2U, 0U, 9U);
  /* A watchdog reset: the cause is what the part says, not a fault of the processor; the record is reported with it. */
  boot_after_reset_that_left(&record, 0, 1);
  zassert_equal(zplc_failsafe_report()->fault.kind, (uint8_t)ZPLC_FAULT_SCHEDULER, "a scheduler fault");
  zassert_equal(zplc_failsafe_report()->fault.task_id, 2U, "of task 2");
}

ZTEST(program_boot_restore, test_the_record_is_reported_once_and_garbage_is_nothing) {
  zplc_fault_record_t record;

  zplc_fault_record_make(&record, ZPLC_FAULT_PROCESSOR, 3U, 0U, 0U, 1U);
  zplc_failsafe_test_set_retained(&record);
  zplc_failsafe_boot();
  zassert_equal(zplc_failsafe_report()->has_fault, 1U, "the record is found");
  zplc_failsafe_boot();
  zassert_equal(zplc_failsafe_report()->has_fault, 0U, "and consumed: the next boot does not see it again");
  memset(&record, 0xC3, sizeof(record));
  zplc_failsafe_test_set_retained(&record);
  zplc_failsafe_boot();
  zassert_equal(zplc_failsafe_report()->has_fault, 0U, "RAM that holds anything else is not a record");
  zassert_not_equal(zplc_failsafe_report()->cause, ZPLC_RESET_FAULT, "and not a fault");
}

ZTEST_SUITE(program_boot_restore, NULL, NULL, NULL, NULL, NULL);
