#include "program_store.h"

#include <zephyr/kernel.h>
#include <zplc_loader.h>

#include "zplc_lock.h"

/* This mutex owns complete thread-context store transactions and the verifier
 * scratch, which stays out of target task stacks. */
K_MUTEX_DEFINE(program_store_mutex);
static uint8_t program_store_verify_workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
static zplc_program_view_t program_store_verified_view;
/* The commit mutex owns this second bounded workspace while the store verifies a durable rollback artifact
 * without overwriting the incoming candidate. It is as large as the largest artifact (RT-028). */
static uint8_t program_store_rollback_workspace
    [ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE];

static int admit_with_loader(const uint8_t *program, size_t length,
                             void *context) {
  (void)context;
  return zplc_loader_verify(program, length, program_store_verify_workspace,
                            sizeof(program_store_verify_workspace),
                            &program_store_verified_view) == ZPLC_LOADER_OK
             ? 0
             : -1;
}

static const zplc_pstore_config_t store_config = {
    .admit = admit_with_loader,
    .admit_context = NULL,
    .scratch = program_store_rollback_workspace,
    .scratch_capacity = sizeof(program_store_rollback_workspace),
    .repair_on_restore = 0U,
};

int zplc_program_store_commit(uint8_t *workspace, size_t program_size,
                              size_t workspace_capacity) {
  int result;

  if (zplc_lock_take(&program_store_mutex, "program store lock") != 0)
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  result = zplc_pstore_commit(&store_config, workspace, program_size,
                              workspace_capacity);
  k_mutex_unlock(&program_store_mutex);
  return result;
}

zplc_program_store_restore_t zplc_program_store_restore(
    uint8_t *workspace, size_t workspace_capacity, size_t *program_size) {
  zplc_program_store_restore_t result;

  if (zplc_lock_take(&program_store_mutex, "program store lock") != 0)
    return ZPLC_PROGRAM_STORE_ERROR;
  result = zplc_pstore_restore(&store_config, workspace, workspace_capacity,
                               program_size);
  k_mutex_unlock(&program_store_mutex);
  return result == ZPLC_PROGRAM_STORE_UNVERIFIABLE ? ZPLC_PROGRAM_STORE_ERROR
                                                   : result;
}
