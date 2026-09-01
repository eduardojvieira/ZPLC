/**
 * @file program_boot_restore.c
 * @brief Verified, non-starting program restoration at boot.
 */

#include "program_boot_restore.h"

#include <errno.h>
#include <string.h>

#include "program_admission.h"
#include "program_store.h"
#include <zplc_loader.h>

#ifdef CONFIG_ZTEST
static zplc_boot_restore_test_restore_fn test_restore;
static zplc_boot_restore_test_commit_fn test_commit;

void zplc_boot_restore_test_set_store(zplc_boot_restore_test_restore_fn restore,
                                      zplc_boot_restore_test_commit_fn commit) {
  test_restore = restore;
  test_commit = commit;
}
#endif

static zplc_program_store_restore_t boot_store_restore(uint8_t *workspace,
                                                        size_t workspace_capacity,
                                                        size_t *program_size) {
#ifdef CONFIG_ZTEST
  if (test_restore != NULL)
    return test_restore(workspace, workspace_capacity, program_size);
#endif
  return zplc_program_store_restore(workspace, workspace_capacity, program_size);
}

static int boot_store_commit(uint8_t *workspace, size_t program_size,
                             size_t workspace_capacity) {
#ifdef CONFIG_ZTEST
  if (test_commit != NULL)
    return test_commit(workspace, program_size, workspace_capacity);
#endif
  return zplc_program_store_commit(workspace, program_size, workspace_capacity);
}

#ifdef CONFIG_ZPLC_SCHEDULER
#include <zplc_scheduler.h>

static int scheduler_restore_fail(uint8_t *staging, size_t staging_capacity,
                                  uint8_t *resident, size_t resident_capacity,
                                  size_t *resident_size, int result) {
  if (staging != NULL)
    memset(staging, 0, staging_capacity);
  if (resident != NULL)
    memset(resident, 0, resident_capacity);
  if (resident_size != NULL)
    *resident_size = 0U;
  (void)zplc_sched_enter_safe_error();
  return result;
}

int zplc_boot_restore_scheduler(uint8_t *staging, size_t staging_capacity,
                                uint8_t *resident, size_t resident_capacity,
                                size_t *resident_size) {
  zplc_program_store_restore_t restore;
  size_t saved_size = 0U;
  int task_count;

  if (staging == NULL || resident == NULL || resident_size == NULL ||
      staging_capacity < ZPLC_PROGRAM_STORE_FOOTER_SIZE) {
    return scheduler_restore_fail(staging, staging_capacity, resident,
                                  resident_capacity, resident_size,
                                  ZPLC_BOOT_RESTORE_ERROR);
  }
  *resident_size = 0U;
  memset(staging, 0, staging_capacity);
  memset(resident, 0, resident_capacity);
  restore = boot_store_restore(staging, staging_capacity, &saved_size);
  if (restore == ZPLC_PROGRAM_STORE_EMPTY) {
    if (zplc_sched_stop() == 0)
      return ZPLC_BOOT_RESTORE_EMPTY;
    return scheduler_restore_fail(staging, staging_capacity, resident,
                                  resident_capacity, resident_size,
                                  ZPLC_BOOT_RESTORE_ERROR);
  }
  if (restore == ZPLC_PROGRAM_STORE_ERROR || saved_size == 0U ||
      saved_size > resident_capacity)
    return scheduler_restore_fail(staging, staging_capacity, resident,
                                  resident_capacity, resident_size,
                                  ZPLC_BOOT_RESTORE_ERROR);

  /* Validation is deliberately separate from the load commit. Both paths use
   * the canonical verifier, so untrusted persistence cannot bypass it. */
  if (zplc_sched_validate_program(staging, saved_size) != ZPLC_LOADER_OK)
    return scheduler_restore_fail(staging, staging_capacity, resident,
                                  resident_capacity, resident_size,
                                  ZPLC_BOOT_RESTORE_ERROR);
  if (restore == ZPLC_PROGRAM_STORE_LEGACY) {
    int commit = boot_store_commit(staging, saved_size, staging_capacity);

    if (commit == ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN)
      return scheduler_restore_fail(staging, staging_capacity, resident,
                                    resident_capacity, resident_size,
                                    ZPLC_BOOT_RESTORE_COMMIT_UNKNOWN);
    if (commit != ZPLC_PROGRAM_STORE_COMMIT_OK)
      return scheduler_restore_fail(staging, staging_capacity, resident,
                                    resident_capacity, resident_size,
                                    ZPLC_BOOT_RESTORE_ERROR);
  }
  task_count = zplc_sched_load(staging, saved_size);
  if (task_count <= 0 || zplc_sched_stop() != 0)
    return scheduler_restore_fail(staging, staging_capacity, resident,
                                  resident_capacity, resident_size,
                                  ZPLC_BOOT_RESTORE_ERROR);
  memcpy(resident, staging, saved_size);
  *resident_size = saved_size;
  return task_count;
}
#endif

int zplc_boot_restore_legacy_prepare(uint8_t *staging, size_t staging_capacity,
                                     uint8_t *workspace,
                                     size_t workspace_capacity,
                                     size_t *program_size,
                                     uint32_t *scan_interval_ms) {
  zplc_program_store_restore_t restore;
  size_t saved_size = 0U;
  int result;

  if (staging == NULL || workspace == NULL || program_size == NULL ||
      scan_interval_ms == NULL ||
      staging_capacity < ZPLC_PROGRAM_STORE_FOOTER_SIZE) {
    return ZPLC_BOOT_RESTORE_ERROR;
  }
  *program_size = 0U;
  restore = boot_store_restore(staging, staging_capacity, &saved_size);
  if (restore == ZPLC_PROGRAM_STORE_EMPTY)
    return ZPLC_BOOT_RESTORE_EMPTY;
  if (restore == ZPLC_PROGRAM_STORE_ERROR)
    goto reject;
  result = zplc_program_admit_legacy(staging, saved_size, workspace,
                                     workspace_capacity, scan_interval_ms);
  if (result != ZPLC_LOADER_OK)
    goto reject;
  if (restore == ZPLC_PROGRAM_STORE_LEGACY) {
    result = boot_store_commit(staging, saved_size, staging_capacity);
    if (result == ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN) {
      memset(staging, 0, staging_capacity);
      return ZPLC_BOOT_RESTORE_COMMIT_UNKNOWN;
    }
    if (result != ZPLC_PROGRAM_STORE_COMMIT_OK)
      goto reject;
  }
  *program_size = saved_size;
  return ZPLC_BOOT_RESTORE_READY;

reject:
  memset(staging, 0, staging_capacity);
  return ZPLC_BOOT_RESTORE_ERROR;
}
