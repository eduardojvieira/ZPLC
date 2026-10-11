/**
 * @file test_failsafe.c
 * @brief The fail-safe decisions: the reset cause, the record of a fault, the start policy and the watchdog
 *        policy of a profile (RT-019 to RT-022).
 *
 * SPDX-License-Identifier: MIT
 */

#include <stdio.h>
#include <string.h>

#include <zplc_failsafe.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                       \
  do {                                                                         \
    test_count++;                                                              \
    if (!(cond)) {                                                             \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                  \
      fail_count++;                                                            \
    } else {                                                                   \
      printf("PASS: %s\n", msg);                                               \
    }                                                                          \
  } while (0)

static void test_the_record_of_a_fault_is_whole_or_nothing(void) {
  zplc_fault_record_t record;
  char text[48];

  printf("\n=== Test: the record of a fault (RT-019) ===\n");
  zplc_fault_record_make(&record, ZPLC_FAULT_PROCESSOR, 4U, 0U, 0x0800ABCDU, 7U);
  CHECK(sizeof(record) == 24U, "a record is 24 bytes");
  CHECK(zplc_fault_record_valid(&record) == 1, "a record that was made is valid");
  record.pc ^= 1U;
  CHECK(zplc_fault_record_valid(&record) == 0, "one changed bit is not");
  zplc_fault_record_make(&record, ZPLC_FAULT_PROCESSOR, 4U, 0U, 0x0800ABCDU, 7U);
  record.magic = 0U;
  CHECK(zplc_fault_record_valid(&record) == 0, "RAM that does not carry the magic is not a record");
  memset(&record, 0xAA, sizeof(record));
  CHECK(zplc_fault_record_valid(&record) == 0, "garbage is not a record");
  memset(&record, 0, sizeof(record));
  CHECK(zplc_fault_record_valid(&record) == 0, "zeroed RAM is not a record");
  CHECK(zplc_fault_record_valid(NULL) == 0, "no record is no record");
  zplc_fault_record_make(&record, ZPLC_FAULT_NONE, 0U, 0U, 0U, 1U);
  CHECK(zplc_fault_record_valid(&record) == 0, "a record that names no kind is not valid");

  zplc_fault_record_make(&record, ZPLC_FAULT_SCHEDULER, 1U, 3U, 0U, 2U);
  zplc_fault_record_reason_text(&record, text, sizeof(text));
  CHECK(strcmp(text, "deadline_miss") == 0, "a scheduler fault is named by its reason");
  zplc_fault_record_make(&record, ZPLC_FAULT_PROCESSOR, 4U, 0U, 0U, 3U);
  zplc_fault_record_reason_text(&record, text, sizeof(text));
  CHECK(strcmp(text, "processor_fault_4") == 0, "a processor fault by the kernel reason");
}

static void test_reset_cause_decision(void) {
  zplc_fault_record_t record;
  zplc_fault_record_t none;

  printf("\n=== Test: the cause of a reset (RT-021) ===\n");
  memset(&none, 0, sizeof(none));
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_POWER_ON, &none) == ZPLC_RESET_POWER_ON, "power-on");
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_BROWN_OUT, &none) == ZPLC_RESET_BROWN_OUT, "brown-out");
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_PIN, &none) == ZPLC_RESET_PIN, "pin");
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_SOFTWARE, &none) == ZPLC_RESET_SOFTWARE, "software");
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_WATCHDOG, &none) == ZPLC_RESET_WATCHDOG, "watchdog");
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_LOCKUP, &none) == ZPLC_RESET_FAULT, "a lockup is a fault");
  CHECK(zplc_reset_cause_decide(0U, &none) == ZPLC_RESET_UNKNOWN, "no bit is unknown");
  CHECK(zplc_reset_cause_decide(0U, NULL) == ZPLC_RESET_UNKNOWN, "no record is fine");

  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_POWER_ON | ZPLC_RESET_BIT_PIN, &none) == ZPLC_RESET_POWER_ON,
        "a power-on also sets the pin flag: it is a power-on");
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_WATCHDOG | ZPLC_RESET_BIT_PIN, &none) == ZPLC_RESET_WATCHDOG,
        "a watchdog reset drives the reset line: it is a watchdog reset");
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_SOFTWARE | ZPLC_RESET_BIT_PIN, &none) == ZPLC_RESET_SOFTWARE,
        "so does a software reset");
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_BROWN_OUT | ZPLC_RESET_BIT_POWER_ON, &none) == ZPLC_RESET_POWER_ON,
        "power-on is read first");

  zplc_fault_record_make(&record, ZPLC_FAULT_PROCESSOR, 3U, 0U, 0x100U, 1U);
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_SOFTWARE | ZPLC_RESET_BIT_PIN, &record) == ZPLC_RESET_FAULT,
        "a processor fault the firmware rebooted for is a fault reset, though the part says software");
  zplc_fault_record_make(&record, ZPLC_FAULT_SCHEDULER, 1U, 2U, 0U, 1U);
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_WATCHDOG, &record) == ZPLC_RESET_WATCHDOG,
        "a latched scheduler fault that the watchdog reset is a watchdog reset, and the record names the fault");
  memset(&record, 0x5A, sizeof(record));
  CHECK(zplc_reset_cause_decide(ZPLC_RESET_BIT_POWER_ON, &record) == ZPLC_RESET_POWER_ON,
        "RAM that holds garbage after a power-on is not a fault");
  CHECK(strcmp(zplc_reset_cause_name(ZPLC_RESET_BROWN_OUT), "brown_out") == 0 &&
            strcmp(zplc_reset_cause_name(ZPLC_RESET_FAULT), "fault") == 0 &&
            strcmp(zplc_reset_cause_name(ZPLC_RESET_UNKNOWN), "unknown") == 0,
        "the names are those of the status");
}

static void test_no_reset_leads_to_run(void) {
  int cause;

  printf("\n=== Test: no reset cause leads to RUN (RT-022, D-13) ===\n");
  for (cause = ZPLC_RESET_UNKNOWN; cause <= ZPLC_RESET_FAULT; cause++) {
    CHECK(zplc_reset_may_run((zplc_reset_cause_t)cause) == 0, "a reset does not enter RUN");
  }
  CHECK(zplc_reset_may_run((zplc_reset_cause_t)99) == 0, "nor does a cause nobody knows");
}

static void test_the_watchdog_policy_of_a_profile(void) {
  const zplc_wdt_policy_t standard = zplc_wdt_policy_default();
  zplc_wdt_policy_t feeding;

  printf("\n=== Test: the watchdog policy of a profile (RT-020) ===\n");
  CHECK(zplc_wdt_action(&standard, ZPLC_WDT_STATE_STOP) == ZPLC_WDT_DISARM, "the default disarms in STOP");
  CHECK(zplc_wdt_action(&standard, ZPLC_WDT_STATE_PAUSED) == ZPLC_WDT_FEED,
        "keeps a pause or a breakpoint fed, so that a long one does not reset the board");
  CHECK(zplc_wdt_action(&standard, ZPLC_WDT_STATE_FAULT) == ZPLC_WDT_LET_EXPIRE,
        "and lets a latched fault expire: the board resets into STOP with the cause recorded");

  feeding.stop = (uint8_t)ZPLC_WDT_FEED; /* a watchdog that cannot be stopped */
  feeding.pause = (uint8_t)ZPLC_WDT_DISARM;
  feeding.fault = (uint8_t)ZPLC_WDT_DISARM;
  CHECK(zplc_wdt_action(&feeding, ZPLC_WDT_STATE_STOP) == ZPLC_WDT_FEED, "a profile can feed in STOP");
  CHECK(zplc_wdt_action(&feeding, ZPLC_WDT_STATE_PAUSED) == ZPLC_WDT_DISARM, "disarm in a pause");
  CHECK(zplc_wdt_action(&feeding, ZPLC_WDT_STATE_FAULT) == ZPLC_WDT_DISARM, "and disarm in a fault");

  feeding.stop = 9U;
  feeding.fault = 9U;
  CHECK(zplc_wdt_action(&feeding, ZPLC_WDT_STATE_STOP) == ZPLC_WDT_DISARM &&
            zplc_wdt_action(&feeding, ZPLC_WDT_STATE_FAULT) == ZPLC_WDT_DISARM,
        "a value nobody defined is the safe choice");
  CHECK(zplc_wdt_action(NULL, ZPLC_WDT_STATE_PAUSED) == ZPLC_WDT_DISARM, "no policy disarms");
}

static void test_the_timeout_is_derived_from_the_task_set(void) {
  printf("\n=== Test: the timeout follows the task set (RT-020) ===\n");
  CHECK(zplc_wdt_timeout_for(1000U, 60000U, 10000U) == 1000U, "a 10 ms task keeps the profile's timeout");
  CHECK(zplc_wdt_timeout_for(1000U, 60000U, 499000U) == 1000U, "a task of 499 ms still fits one second");
  CHECK(zplc_wdt_timeout_for(1000U, 60000U, 500000U) == 1001U, "two intervals are not enough: one more millisecond");
  CHECK(zplc_wdt_timeout_for(1000U, 60000U, 10000000U) == 20001U, "a 10 s task needs 20 s");
  CHECK(zplc_wdt_timeout_for(1000U, 60000U, 40000000U) == 0U, "a task of 40 s does not fit a part whose limit is 60 s");
  CHECK(zplc_wdt_timeout_for(1000U, 0U, 40000000U) == 80001U, "a part with no stated limit takes what the tasks need");
  CHECK(zplc_wdt_timeout_for(100U, 60000U, 1000U) == 100U, "a 1 ms task keeps a 100 ms profile");
}

int main(void) {
  printf("==== test_failsafe ====\n");
  test_the_record_of_a_fault_is_whole_or_nothing();
  test_reset_cause_decision();
  test_no_reset_leads_to_run();
  test_the_watchdog_policy_of_a_profile();
  test_the_timeout_is_derived_from_the_task_set();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
