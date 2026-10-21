#include "native_program_store.h"

#include <stdlib.h>
#include <string.h>

#include <zplc_bytes.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>
#include <zplc_program_store.h>

static uint32_t gcd_u32(uint32_t a, uint32_t b) {
  while (b != 0U) {
    uint32_t rest = a % b;
    a = b;
    b = rest;
  }
  return a;
}

int zplc_native_program_describe(const uint8_t *program, size_t program_size, zplc_native_program_details_t *details) {
  uint8_t *workspace;
  zplc_program_view_t view;
  int result;
  if (details == NULL)
    return -1;
  memset(details, 0, sizeof(*details));
  if (program == NULL || program_size == 0U)
    return -1;
  workspace = (uint8_t *)malloc(ZPLC_LOADER_VERIFY_WORKSPACE_SIZE);
  if (workspace == NULL)
    return -1;
  result = zplc_loader_verify(program, program_size, workspace, ZPLC_LOADER_VERIFY_WORKSPACE_SIZE, &view);
  details->loader_result = result;
  if (result == ZPLC_LOADER_OK) {
    if (view.task_count == 0U) {
      details->task_count = 1U;
      details->scan_interval_ms = 100U;
      details->tasks[0].id = 0U;
      details->tasks[0].type = ZPLC_TASK_CYCLIC;
      details->tasks[0].priority = 1U;
      details->tasks[0].interval_us = 100000U;
      details->tasks[0].stack_size = ZPLC_STACK_MAX_DEPTH;
    } else if (view.task_count <= ZPLC_LOADER_MAX_TASKS) {
      uint32_t index;
      uint32_t interval_us = 0U;
      uint32_t common_ms = 0U;
      for (index = 0U; index < view.task_count; ++index) {
        const uint8_t *task = view.tasks + (size_t)index * ZPLC_TASK_DEF_SIZE;
        zplc_task_def_t *definition = &details->tasks[index];
        definition->id = zplc_get_u16_le(task);
        definition->type = task[2U];
        definition->priority = task[3U];
        definition->interval_us = zplc_get_u32_le(task + 4U);
        definition->entry_point = zplc_get_u16_le(task + 8U);
        definition->stack_size = zplc_get_u16_le(task + 10U);
        if (definition->type != ZPLC_TASK_CYCLIC || definition->interval_us < 1000U || definition->interval_us > 3600000000U ||
            definition->interval_us % 1000U != 0U || definition->entry_point >= view.code_size) {
          result = -1;
          break;
        }
        /* RT-015: every task keeps its own interval; the greatest common divisor is the step that hits every release. */
        if (index != 0U && definition->interval_us != interval_us)
          details->multirate = 1U;
        interval_us = definition->interval_us;
        common_ms = gcd_u32(common_ms, interval_us / 1000U);
      }
      if (result == ZPLC_LOADER_OK) {
        details->task_count = (uint8_t)view.task_count;
        details->has_task_segment = 1U;
        details->scan_interval_ms = common_ms;
      }
    } else {
      result = -1;
    }
  }
  free(workspace);
  return result == ZPLC_LOADER_OK ? 0 : -1;
}

int zplc_native_program_validate(const uint8_t *program, size_t program_size, uint32_t *scan_interval_ms) {
  zplc_native_program_details_t details;
  if (scan_interval_ms == NULL || zplc_native_program_describe(program, program_size, &details) != 0)
    return -1;
  *scan_interval_ms = details.scan_interval_ms;
  return 0;
}

/* The admission the store applies to every program it writes, reads back or restores: the loader's verification
 * and the task rules of the native runtime. */
static int admit_native(const uint8_t *program, size_t program_size, void *context) {
  uint32_t scan_interval_ms;

  (void)context;
  return zplc_native_program_validate(program, program_size, &scan_interval_ms);
}

int zplc_native_program_store_commit(const uint8_t *program, size_t program_size) {
  zplc_pstore_config_t config;
  uint8_t *workspace;
  uint8_t *scratch;
  int result;

  if (program == NULL || program_size == 0U || program_size > ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE)
    return -1;
  workspace = (uint8_t *)malloc(program_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  scratch = (uint8_t *)malloc(ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  if (workspace == NULL || scratch == NULL) {
    free(workspace);
    free(scratch);
    return -1;
  }
  memcpy(workspace, program, program_size);
  memset(&config, 0, sizeof(config));
  config.admit = admit_native;
  config.scratch = scratch;
  config.scratch_capacity = ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE;
  result = zplc_pstore_commit(&config, workspace, program_size, program_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  free(workspace);
  free(scratch);
  if (result == ZPLC_PROGRAM_STORE_COMMIT_OK)
    return ZPLC_NATIVE_PROGRAM_STORE_OK;
  if (result == ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN)
    return ZPLC_NATIVE_PROGRAM_STORE_COMMIT_UNKNOWN;
  return ZPLC_NATIVE_PROGRAM_STORE_ERROR;
}

int zplc_native_program_store_restore(uint8_t *program, size_t capacity, size_t *program_size) {
  zplc_pstore_config_t config;
  uint8_t *staged;
  size_t restored = 0U;
  zplc_program_store_restore_t result;

  if (program == NULL || program_size == NULL)
    return -1;
  *program_size = 0U;
  /* The program is read into a buffer of its own and copied out only when it is whole: a failed restore never
     * writes into the caller's buffer. */
  staged = (uint8_t *)malloc(ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  if (staged == NULL)
    return -1;
  memset(&config, 0, sizeof(config));
  config.admit = admit_native;
  /* A restore that found the program in the newest slot, or behind a record that was not committed, writes the
     * records of that slot as the committed ones: a host restart does not repeat the work. */
  config.repair_on_restore = 1U;
  result = zplc_pstore_restore(&config, staged, ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE, &restored);
  if (result == ZPLC_PROGRAM_STORE_LEGACY) {
    /* The program of the first version of the runtime: stored in the slots, then the legacy keys are removed. */
    if (restored > capacity || zplc_native_program_store_commit(staged, restored) != ZPLC_NATIVE_PROGRAM_STORE_OK) {
      free(staged);
      return -1;
    }
    result = ZPLC_PROGRAM_STORE_OK;
  }
  if (result == ZPLC_PROGRAM_STORE_OK && restored <= capacity) {
    memcpy(program, staged, restored);
    free(staged);
    *program_size = restored;
    return 0;
  }
  free(staged);
  if (result == ZPLC_PROGRAM_STORE_ERROR || result == ZPLC_PROGRAM_STORE_OK)
    return -1;
  /* EMPTY, and records that verify as nothing: this runtime starts without a program. */
  return ZPLC_NATIVE_PROGRAM_STORE_NO_PROGRAM;
}
