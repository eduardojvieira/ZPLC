/**
 * @file zplc_failsafe.c
 * @brief Fail-safe decisions of the runtime (RT-019 to RT-022). See zplc_failsafe.h.
 *
 * SPDX-License-Identifier: MIT
 */

#include <stdio.h>
#include <string.h>

#include "zplc_crc32.h"
#include "zplc_failsafe.h"
#include "zplc_sched_core.h"

const char *zplc_reset_cause_name(zplc_reset_cause_t cause) {
  switch (cause) {
  case ZPLC_RESET_POWER_ON:
    return "power_on";
  case ZPLC_RESET_BROWN_OUT:
    return "brown_out";
  case ZPLC_RESET_PIN:
    return "pin";
  case ZPLC_RESET_SOFTWARE:
    return "software";
  case ZPLC_RESET_WATCHDOG:
    return "watchdog";
  case ZPLC_RESET_FAULT:
    return "fault";
  case ZPLC_RESET_UNKNOWN:
  default:
    return "unknown";
  }
}

static uint32_t record_checksum(const zplc_fault_record_t *record) {
  return zplc_crc32_update(0xFFFFFFFFU, (const uint8_t *)record, offsetof(zplc_fault_record_t, crc)) ^ 0xFFFFFFFFU;
}

void zplc_fault_record_make(zplc_fault_record_t *record, zplc_fault_kind_t kind, uint8_t reason, uint16_t task_id,
                            uint32_t pc, uint32_t sequence) {
  memset(record, 0, sizeof(*record));
  record->magic = ZPLC_FAULT_RECORD_MAGIC;
  record->version = ZPLC_FAULT_RECORD_VERSION;
  record->kind = (uint8_t)kind;
  record->reason = reason;
  record->task_id = task_id;
  record->pc = pc;
  record->sequence = sequence;
  record->crc = record_checksum(record);
}

int zplc_fault_record_valid(const zplc_fault_record_t *record) {
  if (record == NULL || record->magic != ZPLC_FAULT_RECORD_MAGIC || record->version != ZPLC_FAULT_RECORD_VERSION) {
    return 0;
  }
  if (record->kind != (uint8_t)ZPLC_FAULT_PROCESSOR && record->kind != (uint8_t)ZPLC_FAULT_SCHEDULER) {
    return 0;
  }
  return record->crc == record_checksum(record);
}

void zplc_fault_record_reason_text(const zplc_fault_record_t *record, char *out, size_t size) {
  if (out == NULL || size == 0U) {
    return;
  }
  if (record == NULL || zplc_fault_record_valid(record) == 0) {
    (void)snprintf(out, size, "none");
  } else if (record->kind == (uint8_t)ZPLC_FAULT_SCHEDULER) {
    (void)snprintf(out, size, "%s", zplc_sched_fault_reason_name((zplc_sched_fault_reason_t)record->reason));
  } else {
    (void)snprintf(out, size, "processor_fault_%u", (unsigned)record->reason);
  }
}

zplc_reset_cause_t zplc_reset_cause_decide(uint32_t bits, const zplc_fault_record_t *record) {
  if (record != NULL && zplc_fault_record_valid(record) != 0 && record->kind == (uint8_t)ZPLC_FAULT_PROCESSOR) {
    return ZPLC_RESET_FAULT;
  }
  if ((bits & ZPLC_RESET_BIT_POWER_ON) != 0U) {
    return ZPLC_RESET_POWER_ON;
  }
  if ((bits & ZPLC_RESET_BIT_BROWN_OUT) != 0U) {
    return ZPLC_RESET_BROWN_OUT;
  }
  if ((bits & ZPLC_RESET_BIT_WATCHDOG) != 0U) {
    return ZPLC_RESET_WATCHDOG;
  }
  if ((bits & ZPLC_RESET_BIT_LOCKUP) != 0U) {
    return ZPLC_RESET_FAULT;
  }
  if ((bits & ZPLC_RESET_BIT_SOFTWARE) != 0U) {
    return ZPLC_RESET_SOFTWARE;
  }
  if ((bits & ZPLC_RESET_BIT_PIN) != 0U) {
    return ZPLC_RESET_PIN;
  }
  return ZPLC_RESET_UNKNOWN;
}

int zplc_reset_may_run(zplc_reset_cause_t cause) {
  (void)cause;
  return 0; /* D-13 option A: RUN is a person's command, after any reset */
}

zplc_wdt_policy_t zplc_wdt_policy_default(void) {
  zplc_wdt_policy_t policy;

  policy.stop = (uint8_t)ZPLC_WDT_DISARM;
  policy.pause = (uint8_t)ZPLC_WDT_FEED;
  policy.fault = (uint8_t)ZPLC_WDT_LET_EXPIRE;
  return policy;
}

zplc_wdt_action_t zplc_wdt_action(const zplc_wdt_policy_t *policy, zplc_wdt_state_t state) {
  uint8_t choice;

  if (policy == NULL) {
    return ZPLC_WDT_DISARM;
  }
  switch (state) {
  case ZPLC_WDT_STATE_STOP:
    choice = policy->stop;
    return choice == (uint8_t)ZPLC_WDT_FEED ? ZPLC_WDT_FEED : ZPLC_WDT_DISARM;
  case ZPLC_WDT_STATE_PAUSED:
    choice = policy->pause;
    return choice == (uint8_t)ZPLC_WDT_FEED ? ZPLC_WDT_FEED : ZPLC_WDT_DISARM;
  case ZPLC_WDT_STATE_FAULT:
  default:
    choice = policy->fault;
    return choice == (uint8_t)ZPLC_WDT_LET_EXPIRE ? ZPLC_WDT_LET_EXPIRE : ZPLC_WDT_DISARM;
  }
}

uint32_t zplc_wdt_timeout_for(uint32_t profile_ms, uint32_t hardware_max_ms, uint32_t longest_interval_us) {
  /* More than two intervals, to a whole millisecond: a scan that is a whole interval late has not yet caused a
   * reset, and the fault latch (not the watchdog) is what stops a scan that does not fit. */
  const uint64_t needed_ms = ((uint64_t)longest_interval_us * 2U + 999U) / 1000U + 1U;
  uint64_t timeout_ms = profile_ms;

  if (needed_ms > timeout_ms) {
    timeout_ms = needed_ms;
  }
  if (hardware_max_ms != 0U && timeout_ms > hardware_max_ms) {
    return 0U;
  }
  return timeout_ms > UINT32_MAX ? 0U : (uint32_t)timeout_ms;
}
