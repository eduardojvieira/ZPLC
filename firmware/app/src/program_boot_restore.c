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
/* The seam is declared in tests/include/zplc_app_test_hooks.h, not in program_boot_restore.h (RT-033). */
typedef zplc_program_store_restore_t (*zplc_boot_restore_test_restore_fn)(
    uint8_t *workspace, size_t workspace_capacity, size_t *program_size);
typedef int (*zplc_boot_restore_test_commit_fn)(uint8_t *workspace,
                                                size_t program_size,
                                                size_t workspace_capacity);
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
                                  size_t *program_size, int result, int latch) {
  if (staging != NULL)
    memset(staging, 0, staging_capacity);
  if (program_size != NULL)
    *program_size = 0U;
  if (latch != 0)
    (void)zplc_sched_enter_safe_error();
  return result;
}

/* Restore the stored program into staging, verify it and load it into the scheduler, stopped. A failure
 * clears staging; it latches the scheduler safe when @p latch is set (a boot that cannot trust what it found). */
static int restore_scheduler(uint8_t *staging, size_t staging_capacity,
                             size_t *program_size, int latch) {
  zplc_program_store_restore_t restore;
  size_t saved_size = 0U;
  int task_count;

  if (staging == NULL || program_size == NULL ||
      staging_capacity < ZPLC_PROGRAM_STORE_FOOTER_SIZE) {
    return scheduler_restore_fail(staging, staging_capacity, program_size,
                                  ZPLC_BOOT_RESTORE_ERROR, latch);
  }
  *program_size = 0U;
  memset(staging, 0, staging_capacity);
  restore = boot_store_restore(staging, staging_capacity, &saved_size);
  if (restore == ZPLC_PROGRAM_STORE_EMPTY) {
    if (zplc_sched_stop() == 0)
      return ZPLC_BOOT_RESTORE_EMPTY;
    return scheduler_restore_fail(staging, staging_capacity, program_size,
                                  ZPLC_BOOT_RESTORE_ERROR, latch);
  }
  if (restore == ZPLC_PROGRAM_STORE_ERROR || saved_size == 0U ||
      saved_size > staging_capacity - ZPLC_PROGRAM_STORE_FOOTER_SIZE)
    return scheduler_restore_fail(staging, staging_capacity, program_size,
                                  ZPLC_BOOT_RESTORE_ERROR, latch);

  /* Validation is deliberately separate from the load commit. Both paths use
   * the canonical verifier, so untrusted persistence cannot bypass it. */
  if (zplc_sched_validate_program(staging, saved_size) != ZPLC_LOADER_OK)
    return scheduler_restore_fail(staging, staging_capacity, program_size,
                                  ZPLC_BOOT_RESTORE_ERROR, latch);
  if (restore == ZPLC_PROGRAM_STORE_LEGACY) {
    int commit = boot_store_commit(staging, saved_size, staging_capacity);

    if (commit == ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN)
      return scheduler_restore_fail(staging, staging_capacity, program_size,
                                    ZPLC_BOOT_RESTORE_COMMIT_UNKNOWN, latch);
    if (commit != ZPLC_PROGRAM_STORE_COMMIT_OK)
      return scheduler_restore_fail(staging, staging_capacity, program_size,
                                    ZPLC_BOOT_RESTORE_ERROR, latch);
  }
  /* The commit of a legacy migration used staging as its workspace and read the artifact back into it. */
  task_count = zplc_sched_load(staging, saved_size);
  if (task_count <= 0 || zplc_sched_stop() != 0)
    return scheduler_restore_fail(staging, staging_capacity, program_size,
                                  ZPLC_BOOT_RESTORE_ERROR, latch);
  *program_size = saved_size;
  return task_count;
}

int zplc_boot_restore_scheduler(uint8_t *staging, size_t staging_capacity,
                                size_t *program_size) {
  return restore_scheduler(staging, staging_capacity, program_size, 1);
}

int zplc_program_reload_scheduler(uint8_t *staging, size_t staging_capacity,
                                  size_t *program_size) {
  int first_error = 0;
  int rc = zplc_sched_stop();

  if (rc < 0)
    return scheduler_restore_fail(staging, staging_capacity, program_size, rc, 0);
  for (int task = 0; task < CONFIG_ZPLC_MAX_TASKS; task++) {
    rc = zplc_sched_unregister_task(task);
    if (rc < 0 && rc != -2 && first_error == 0)
      first_error = rc;
  }
  if (first_error != 0)
    return scheduler_restore_fail(staging, staging_capacity, program_size,
                                  first_error, 0);
  return restore_scheduler(staging, staging_capacity, program_size, 0);
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
