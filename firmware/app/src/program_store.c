#include "program_store.h"

#include <string.h>

#include <zephyr/kernel.h>
#include <zplc_loader.h>
#include <zplc_verify_scratch.h>

#include "zplc_lock.h"

/* This mutex owns complete thread-context store transactions. The verifier scratch is the image's one, taken for
 * each admission check and given back before the next store operation (zplc_verify_scratch.h): it is a leaf lock
 * below this mutex, as it is below the scheduler's control lock. */
K_MUTEX_DEFINE(program_store_mutex);
static zplc_program_view_t program_store_verified_view;
/* There is no second buffer of the code size for the rollback check. The store finds the rollback when an upload
 * starts, in the staging buffer while it is free (zplc_program_store_prepare), and the commit checks that the records
 * it was read from are the ones it commits over (zplc_pstore_commit_probed). Zero is "nothing found", which a commit
 * refuses. The mutex owns it. */
static zplc_pstore_rollback_t program_store_rollback;

static int admit_with_loader(const uint8_t *program, size_t length,
                             void *context) {
  uint8_t *workspace = zplc_verify_scratch_take();
  int result;

  (void)context;
  if (workspace == NULL) {
    return -1;
  }
  result = zplc_loader_verify(program, length, workspace,
                              ZPLC_LOADER_VERIFY_WORKSPACE_SIZE,
                              &program_store_verified_view);
  zplc_verify_scratch_give();
  return result == ZPLC_LOADER_OK ? 0 : -1;
}

static const zplc_pstore_config_t store_config = {
    .admit = admit_with_loader,
    .admit_context = NULL,
    .scratch = NULL,
    .scratch_capacity = 0U,
    .repair_on_restore = 0U,
};

int zplc_program_store_prepare(uint8_t *workspace, size_t workspace_capacity) {
  int result;

  if (zplc_lock_take(&program_store_mutex, "program store lock") != 0)
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  result = zplc_pstore_probe(&store_config, workspace, workspace_capacity,
                             &program_store_rollback);
  k_mutex_unlock(&program_store_mutex);
  return result;
}

int zplc_program_store_commit(uint8_t *workspace, size_t program_size,
                              size_t workspace_capacity) {
  int result;

  if (zplc_lock_take(&program_store_mutex, "program store lock") != 0)
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  result = zplc_pstore_commit_probed(&store_config, &program_store_rollback,
                                     workspace, program_size,
                                     workspace_capacity);
  /* An answer is for one commit: after it, whatever its result, the records are another's. */
  memset(&program_store_rollback, 0, sizeof(program_store_rollback));
  k_mutex_unlock(&program_store_mutex);
  return result;
}

zplc_program_store_restore_t zplc_program_store_restore(
    uint8_t *workspace, size_t workspace_capacity, size_t *program_size) {
  zplc_program_store_restore_t result;

  if (zplc_lock_take(&program_store_mutex, "program store lock") != 0)
    return ZPLC_PROGRAM_STORE_ERROR;
  /* A program of the first firmware is read and admitted into the caller's buffer, and the commit that migrates it
   * has no upload in front of it to find its rollback: the restore leaves it. */
  result = zplc_pstore_restore_probed(&store_config, workspace,
                                      workspace_capacity, program_size,
                                      &program_store_rollback);
  k_mutex_unlock(&program_store_mutex);
  return result == ZPLC_PROGRAM_STORE_UNVERIFIABLE ? ZPLC_PROGRAM_STORE_ERROR
                                                   : result;
}
