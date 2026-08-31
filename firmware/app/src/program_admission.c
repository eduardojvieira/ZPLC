/**
 * @file program_admission.c
 * @brief Pure legacy .zplc admission policy.
 */

#include "program_admission.h"

#include <zplc_isa.h>
#include <zplc_loader.h>

int zplc_program_admit_legacy(const uint8_t *binary, size_t size,
                              uint8_t *workspace, size_t workspace_size,
                              uint32_t *scan_interval_ms) {
  zplc_program_view_t view;
  uint32_t candidate_interval_ms = 100U;
  int result =
      zplc_loader_verify(binary, size, workspace, workspace_size, &view);

  if (result != ZPLC_LOADER_OK) {
    return result;
  }
  if (view.task_count > 1U) {
    return ZPLC_LOADER_ERR_TASK;
  }
  if (view.task_count == 1U) {
    const uint8_t *task = view.tasks;
    uint32_t interval_us;

    if (task[2U] != ZPLC_TASK_CYCLIC) {
      return ZPLC_LOADER_ERR_TASK;
    }
    interval_us = (uint32_t)task[4U] | ((uint32_t)task[5U] << 8U) |
                  ((uint32_t)task[6U] << 16U) | ((uint32_t)task[7U] << 24U);
    if (interval_us < 1000U || interval_us > 3600000000U ||
        (interval_us % 1000U) != 0U) {
      return ZPLC_LOADER_ERR_TASK;
    }
    candidate_interval_ms = interval_us / 1000U;
  }
  if (scan_interval_ms != NULL) {
    *scan_interval_ms = candidate_interval_ms;
  }
  return ZPLC_LOADER_OK;
}
