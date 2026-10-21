/*
 * A real processor fault, a real reboot, and the record after it (RT-019, RT-021).
 *
 * This image is not a ztest: the fatal-error handler under test is the firmware's own. It runs twice in one
 * QEMU session, telling the two runs apart by the record the first one leaves:
 *
 *   phase 1  nothing is recorded: execute an undefined instruction (a usage fault of the processor). The handler
 *            of the firmware drives the outputs safe, writes the record and reboots.
 *   phase 2  the machine was reset by the part: read the reset cause and the record. It must name a fault reset
 *            and the processor fault of phase 1.
 *
 * What this shows: the handler runs on a real fault, the record survives the reboot of the part, and the next
 * boot reads it. What only a board can show: that its reset-cause register agrees, and the level of its pins
 * while it resets (HIL-010).
 */

#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>

#include <zplc_failsafe.h>

int main(void) {
  const zplc_reset_report_t *report;

  zplc_failsafe_boot();
  report = zplc_failsafe_report();

  if (report->has_fault == 0U) {
    printk("FAILSAFE-REBOOT phase 1: a processor fault now\n");
    k_msleep(50);                      /* the console drains before the fault */
    __asm__ volatile(".short 0xde00"); /* UDF #0: undefined on every Thumb part */
    printk("FAILSAFE-REBOOT FAIL: the instruction did not fault\n");
    return 1;
  }

  printk("FAILSAFE-REBOOT phase 2: cause=%s\n", zplc_reset_cause_name(report->cause));
  if (report->fault.kind == (uint8_t)ZPLC_FAULT_PROCESSOR) {
    printk("FAILSAFE-REBOOT phase 2: the record names a processor fault (reason %u, pc 0x%08x)\n", (unsigned int)report->fault.reason,
           (unsigned int)report->fault.pc);
  }
  if (report->cause == ZPLC_RESET_FAULT && report->fault.kind == (uint8_t)ZPLC_FAULT_PROCESSOR && zplc_reset_may_run(report->cause) == 0) {
    printk("FAILSAFE-REBOOT PASS\n");
  } else {
    printk("FAILSAFE-REBOOT FAIL\n");
  }
  return 0;
}
