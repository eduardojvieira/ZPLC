/**
 * @file program_admission.h
 * @brief Admission policy for the legacy single-task runtime.
 */

#ifndef ZPLC_PROGRAM_ADMISSION_H
#define ZPLC_PROGRAM_ADMISSION_H

#include <stddef.h>
#include <stdint.h>

/**
 * Verify a .zplc artifact for the legacy runtime without changing core state.
 *
 * The legacy runtime supports either no TASK segment entries (the file entry
 * point is used) or one cyclic TASK entry. EVENT and INIT tasks require the
 * scheduler and are rejected here. On success, @p scan_interval_ms receives
 * the exact cyclic interval in milliseconds, or the 100 ms legacy default;
 * it may be NULL for validation-only callers.
 */
int zplc_program_admit_legacy(const uint8_t *binary, size_t size,
                              uint8_t *workspace, size_t workspace_size,
                              uint32_t *scan_interval_ms);

#endif /* ZPLC_PROGRAM_ADMISSION_H */
