/**
 * @file zplc_failsafe_zephyr.c
 * @brief The Zephyr adapter of the fail-safe runtime: the reset cause, the record of a fault in RAM that a reset
 *        does not clear, and the fatal-error handler (RT-019, RT-021).
 *
 * SPDX-License-Identifier: MIT
 *
 * What a reset cause means and what the record holds is decided in src/core/zplc_failsafe.c, where a host test can
 * state it. This file only reads the hardware and writes the RAM.
 *
 * What only a board can show: that the part keeps `.noinit` RAM across the reset it is rebooted with (every
 * Cortex-M part of this repository does, and QEMU does too), that its reset-cause register reports the cause
 * the code reads, and how long the pins take to reach their safe level in a fault. The host and native_sim tests
 * call zplc_failsafe_fatal() with the reboot intercepted; the qemu_cortex_m3 test of firmware/tests/failsafe_reboot
 * takes a real fault and a real reboot and reads the record after it.
 */

#include <string.h>

#ifdef CONFIG_HWINFO
#include <zephyr/drivers/hwinfo.h>
#else
/* A build without the hardware-information driver reports no cause; the bits are still named here. */
#define RESET_PIN BIT(0)
#define RESET_SOFTWARE BIT(1)
#define RESET_BROWNOUT BIT(2)
#define RESET_POR BIT(3)
#define RESET_WATCHDOG BIT(4)
#define RESET_USER BIT(13)
#define RESET_CPU_LOCKUP BIT(8)
#endif
#include <zephyr/fatal.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/reboot.h>

#include <zplc_failsafe.h>
#include <zplc_hal.h>
#include <zplc_sched_core.h>

/* The record: in RAM the reset does not clear. After a power-on it holds whatever the RAM powered up with, and
 * the magic and the checksum say it is not a record. */
static zplc_fault_record_t retained_record __noinit;

static zplc_reset_report_t boot_report;
/* The sequence number the next record gets: one more than the record the previous run left. */
static uint32_t next_sequence = 1U;

#ifdef CONFIG_ZTEST
static void (*test_reboot)(void);
#endif

/* The generic bits of zephyr/drivers/hwinfo.h, in the neutral bits of the portable decision. */
static uint32_t neutral_bits(uint32_t hw) {
  uint32_t bits = 0U;

  if ((hw & RESET_POR) != 0U) {
    bits |= ZPLC_RESET_BIT_POWER_ON;
  }
  if ((hw & RESET_BROWNOUT) != 0U) {
    bits |= ZPLC_RESET_BIT_BROWN_OUT;
  }
  if ((hw & RESET_PIN) != 0U) {
    bits |= ZPLC_RESET_BIT_PIN;
  }
  if ((hw & (RESET_SOFTWARE | RESET_USER)) != 0U) {
    bits |= ZPLC_RESET_BIT_SOFTWARE;
  }
  if ((hw & RESET_WATCHDOG) != 0U) {
    bits |= ZPLC_RESET_BIT_WATCHDOG;
  }
  if ((hw & RESET_CPU_LOCKUP) != 0U) {
    bits |= ZPLC_RESET_BIT_LOCKUP;
  }
  return bits;
}

void zplc_failsafe_boot(void) {
  uint32_t raw = 0U;
  uint32_t supported = 0U;
  zplc_fault_record_t found;

  memset(&boot_report, 0, sizeof(boot_report));
#ifdef CONFIG_HWINFO
  if (hwinfo_get_reset_cause(&raw) == 0) {
    boot_report.reported = 1U;
  } else {
    raw = 0U;
  }
  if (hwinfo_get_supported_reset_cause(&supported) != 0) {
    supported = 0U;
  }
  /* The register keeps its flags until they are cleared: the next boot must see its own. */
  (void)hwinfo_clear_reset_cause();
#endif

  found = retained_record;
  boot_report.raw_bits = raw;
  boot_report.supported_bits = supported;
  boot_report.cause = zplc_reset_cause_decide(neutral_bits(raw), &found);
  if (zplc_fault_record_valid(&found) != 0) {
    boot_report.has_fault = 1U;
    boot_report.fault = found;
    next_sequence = found.sequence + 1U;
  }
  /* Consumed: it is reported once. */
  memset(&retained_record, 0, sizeof(retained_record));
}

const zplc_reset_report_t *zplc_failsafe_report(void) { return &boot_report; }

void zplc_failsafe_note_scheduler_fault(uint8_t reason, uint16_t task_id) {
  zplc_fault_record_make(&retained_record, ZPLC_FAULT_SCHEDULER, reason, task_id, 0U, next_sequence);
  next_sequence++;
}

void zplc_failsafe_fatal(unsigned int reason, uint32_t pc) {
  /* The pins first: the scan is dead. No lock is taken and nothing is allocated; a driver that is in the middle
   * of a write when the fault happens may refuse, which a hardware watchdog (RT-020) is there to catch. */
  (void)zplc_io_drive_safe(NULL);
  zplc_fault_record_make(&retained_record, ZPLC_FAULT_PROCESSOR, (uint8_t)reason, 0U, pc, next_sequence);
  next_sequence++;
#ifdef CONFIG_ZTEST
  if (test_reboot != NULL) {
    test_reboot();
    return;
  }
#endif
  sys_reboot(SYS_REBOOT_COLD);
}

#ifdef CONFIG_ZTEST
/* Fault injection: the reboot a test intercepts, and the RAM a test sets up as the previous run left it. */
void zplc_failsafe_test_set_reboot(void (*reboot)(void)) { test_reboot = reboot; }

void zplc_failsafe_test_set_retained(const zplc_fault_record_t *record) {
  if (record == NULL) {
    memset(&retained_record, 0, sizeof(retained_record));
  } else {
    retained_record = *record;
  }
}

const zplc_fault_record_t *zplc_failsafe_test_retained(void) { return &retained_record; }
#endif

#if !defined(CONFIG_ZTEST) && defined(CONFIG_ZPLC_FATAL_HANDLER)
/* The handler of the kernel (a processor fault, a stack overflow, a kernel panic, an assertion): the firmware's
 * answer is the safe state, the record and a reboot into STOP. */
FUNC_NORETURN void k_sys_fatal_error_handler(unsigned int reason, const struct arch_esf *esf) {
  uint32_t pc = 0U;

#if defined(CONFIG_CPU_CORTEX_M)
  if (esf != NULL) {
    pc = (uint32_t)esf->basic.pc;
  }
#else
  ARG_UNUSED(esf);
#endif
  zplc_failsafe_fatal(reason, pc);
  /* sys_reboot() does not return; this is for a platform where it could. */
  k_fatal_halt(reason);
  CODE_UNREACHABLE;
}
#endif
