/*
 * The firmware's answer to a processor fault, a stack overflow or a kernel panic (RT-019).
 *
 * The handler of the kernel calls zplc_failsafe_fatal(): the outputs are driven to their safe state, the reason is
 * written to RAM that a reset does not clear, and the board reboots. Here the reboot is intercepted and the
 * output is the emulated LED of native_sim. The next boot reads the record (RT-021) and the runtime stays in STOP;
 * program_boot_restore covers the restore.
 *
 * firmware/tests/failsafe_reboot takes a real fault and a real reboot on qemu_cortex_m3 and reads the record
 * after it. What only a board can show: that the part keeps the RAM across its reset, and that the pins are at
 * their safe level while it resets (HIL-010).
 */

#include <zephyr/devicetree.h>
#include <zephyr/ztest.h>
#include <zplc_core.h>
#include <zplc_failsafe.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
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
#define led_level() gpio_emul_output_get(LED0_CONTROLLER, LED0_PIN)
#endif

static unsigned int reboots;
static int led_when_rebooted;

static void intercepted_reboot(void) {
  reboots++;
#ifdef HAVE_EMULATED_OUTPUT
  led_when_rebooted = led_level();
#endif
}

static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

/* A program that declares nothing is in the core, and so is its absence of a declaration. */
static void suite_after(void *fixture) {
  ARG_UNUSED(fixture);
  (void)zplc_mem_init();
}

static void *suite_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "initialize HAL");
  return NULL;
}

static void suite_teardown(void *fixture) {
  ARG_UNUSED(fixture);
  zplc_failsafe_test_set_reboot(NULL);
  zplc_failsafe_test_set_retained(NULL);
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "shutdown HAL");
}

ZTEST(zplc_failsafe, test_a_fault_drives_the_output_safe_records_the_reason_and_reboots) {
  const zplc_fault_record_t *record;

  reboots = 0U;
  led_when_rebooted = -1;
  zplc_failsafe_test_set_retained(NULL);
  zplc_failsafe_test_set_reboot(intercepted_reboot);
#ifdef HAVE_EMULATED_OUTPUT
  /* The program of the scan that is dying had the output on. */
  zassert_equal(zplc_hal_gpio_write(0U, 1U), ZPLC_HAL_OK, "the output is on");
  zassert_equal(led_level(), 1, "and the pin is high");
#endif

  zplc_failsafe_fatal(5U, 0x0800BEEFU);

  zassert_equal(reboots, 1U, "the board reboots, once");
#ifdef HAVE_EMULATED_OUTPUT
  zassert_equal(led_when_rebooted, 0, "with the pin already at its safe level");
#endif
  record = zplc_failsafe_test_retained();
  zassert_true(zplc_fault_record_valid(record) != 0, "the reason is in RAM, whole");
  zassert_equal(record->kind, (uint8_t)ZPLC_FAULT_PROCESSOR, "a processor fault");
  zassert_equal(record->reason, 5U, "with the kernel's reason");
  zassert_equal(record->pc, 0x0800BEEFU, "and the faulting address");
}

ZTEST(zplc_failsafe, test_the_next_boot_reports_the_fault_once_and_the_runtime_waits_in_stop) {
  const zplc_reset_report_t *report;

  zplc_failsafe_test_set_reboot(intercepted_reboot);
  zplc_failsafe_test_set_retained(NULL);
  zplc_failsafe_fatal(3U, 0x1000U);

  zplc_failsafe_boot();
  report = zplc_failsafe_report();
  zassert_equal(report->cause, ZPLC_RESET_FAULT, "the reset is a fault reset, whatever the part says");
  zassert_equal(report->has_fault, 1U, "and the fault is reported");
  zassert_equal(report->fault.reason, 3U, "with its reason");
  zassert_equal(zplc_reset_may_run(report->cause), 0, "RUN is a person's command");

  zplc_failsafe_boot();
  zassert_equal(zplc_failsafe_report()->has_fault, 0U, "the record was consumed");
  zassert_not_equal(zplc_failsafe_report()->cause, ZPLC_RESET_FAULT, "so the next reset is not called a fault");
}

ZTEST(zplc_failsafe, test_a_second_fault_continues_the_sequence) {
  const zplc_fault_record_t *record;
  uint32_t first;

  zplc_failsafe_test_set_reboot(intercepted_reboot);
  zplc_failsafe_test_set_retained(NULL);
  zplc_failsafe_fatal(1U, 0U);
  first = zplc_failsafe_test_retained()->sequence;
  zplc_failsafe_fatal(2U, 0U);
  record = zplc_failsafe_test_retained();
  zassert_equal(record->sequence, first + 1U, "a record counts the faults the RAM has seen");
  zassert_equal(record->reason, 2U, "and the last one is kept");
}

/* RT-023: the fatal handler drives the pins to the safe state of the program that was running, the value the
 * project declared, and the board's level when it declared nothing. It reads no artifact: the declaration was
 * copied out of it when the program was committed. Fails without zplc_io_drive_safe() reading the declaration:
 * the pin is at the board's level, 0, when the board reboots. */
ZTEST(zplc_failsafe, test_a_fault_drives_the_value_the_program_declared_safe) {
  uint8_t program[96];
  const uint8_t on[] = {ZPLC_TEST_SAFE(0, 0, 1)};
  size_t size = zplc_test_minimal_program(program);

  size = zplc_test_append_safe(program, size, sizeof(program), on, sizeof(on));
  zassert_true(size != 0U, "the artifact is built");
  zassert_ok(zplc_core_init(), "the core starts");
  zassert_ok(zplc_core_load(program, size, workspace, sizeof(workspace)), "a program declaring output 0 is loaded");
  zassert_equal(zplc_core_declared_safe_count(), 1U, "the core holds the declaration");

  reboots = 0U;
  led_when_rebooted = -1;
  zplc_failsafe_test_set_retained(NULL);
  zplc_failsafe_test_set_reboot(intercepted_reboot);
#ifdef HAVE_EMULATED_OUTPUT
  zassert_equal(zplc_hal_gpio_write(0U, 0U), ZPLC_HAL_OK, "the scan that is dying had the output off");
#endif
  zplc_failsafe_fatal(5U, 0x0800BEEFU);
  zassert_equal(reboots, 1U, "the board reboots");
#ifdef HAVE_EMULATED_OUTPUT
  zassert_equal(led_when_rebooted, 1, "with the pin at the value the project declared");
#endif

  size = zplc_test_minimal_program(program);
  zassert_ok(zplc_core_load(program, size, workspace, sizeof(workspace)), "a program declaring nothing replaces it");
  zassert_equal(zplc_core_declared_safe_count(), 0U, "so the declaration is gone");
  led_when_rebooted = -1;
  zplc_failsafe_fatal(5U, 0x0800BEEFU);
#ifdef HAVE_EMULATED_OUTPUT
  zassert_equal(led_when_rebooted, 0, "and a fault leaves the pin at the board's level");
#endif
}

ZTEST_SUITE(zplc_failsafe, NULL, suite_setup, NULL, suite_after, suite_teardown);
