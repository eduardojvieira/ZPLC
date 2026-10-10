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
/* Restores only to the scheduler's IDLE/READY state. It never starts tasks.
 *
 * The stored program is the only resident copy of the artifact (RT-028): the runtime keeps no second buffer of
 * the code size. @p staging receives the artifact (and keeps it on return); @p program_size is the artifact
 * length, or 0 when nothing is loaded. Returns the task count (> 0), 0 for an empty store, or a negative error
 * (the runtime is then latched safe and staging is cleared). */
int zplc_boot_restore_scheduler(uint8_t *staging, size_t staging_capacity,
                                size_t *program_size);

/* Reloads the stored program into the scheduler: the shell's reset. Stops the scheduler, clears its tasks,
 * restores the stored program into @p staging, verifies and loads it, and stops. An upload that was in
 * progress in @p staging is gone: staging is the one buffer of the code size.
 *
 * Returns the task count (> 0), 0 when the store is empty, or a negative error. A failure latches nothing: the
 * scheduler is left stopped with no program, and staging is cleared. */
int zplc_program_reload_scheduler(uint8_t *staging, size_t staging_capacity,
                                  size_t *program_size);
#endif

/* Restores, verifies, and confirms legacy migration before the caller loads
 * the VM or publishes its resident buffer. */
int zplc_boot_restore_legacy_prepare(uint8_t *staging, size_t staging_capacity,
                                     uint8_t *workspace,
                                     size_t workspace_capacity,
                                     size_t *program_size,
                                     uint32_t *scan_interval_ms);

#endif /* ZPLC_PROGRAM_BOOT_RESTORE_H */
