/**
 * @file program_boot_restore.h
 * @brief Fail-closed boot restoration of persisted PLC programs.
 */

#ifndef ZPLC_PROGRAM_BOOT_RESTORE_H
#define ZPLC_PROGRAM_BOOT_RESTORE_H

#include <stddef.h>
#include <stdint.h>

#include "program_store.h"

typedef enum {
  ZPLC_BOOT_RESTORE_EMPTY = 0,
  ZPLC_BOOT_RESTORE_READY = 1,
  ZPLC_BOOT_RESTORE_ERROR = -1,
  ZPLC_BOOT_RESTORE_COMMIT_UNKNOWN = -2,
} zplc_boot_restore_result_t;

#ifdef CONFIG_ZPLC_SCHEDULER
/* Restores only to the scheduler's IDLE/READY state. It never starts tasks. */
int zplc_boot_restore_scheduler(uint8_t *staging, size_t staging_capacity,
                                uint8_t *resident, size_t resident_capacity,
                                size_t *resident_size);
#endif

/* Restores, verifies, and confirms legacy migration before the caller loads
 * the VM or publishes its resident buffer. */
int zplc_boot_restore_legacy_prepare(uint8_t *staging, size_t staging_capacity,
                                     uint8_t *workspace,
                                     size_t workspace_capacity,
                                     size_t *program_size,
                                     uint32_t *scan_interval_ms);

#ifdef CONFIG_ZTEST
typedef zplc_program_store_restore_t (*zplc_boot_restore_test_restore_fn)(
    uint8_t *workspace, size_t workspace_capacity, size_t *program_size);
typedef int (*zplc_boot_restore_test_commit_fn)(uint8_t *workspace,
                                                size_t program_size,
                                                size_t workspace_capacity);
void zplc_boot_restore_test_set_store(zplc_boot_restore_test_restore_fn restore,
                                      zplc_boot_restore_test_commit_fn commit);
#endif

#endif /* ZPLC_PROGRAM_BOOT_RESTORE_H */
