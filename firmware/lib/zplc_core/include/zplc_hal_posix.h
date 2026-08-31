/**
 * @file zplc_hal_posix.h
 * @brief POSIX-only logical clock seam for deterministic host scenarios.
 *
 * The override is process-global because the native POSIX simulator currently
 * owns one VM/session on one thread. If concurrent sessions are introduced,
 * move this clock into the VM/session context rather than adding locking here.
 */

#ifndef ZPLC_HAL_POSIX_H
#define ZPLC_HAL_POSIX_H

#include <stdint.h>

void zplc_hal_posix_set_tick_override(uint32_t tick_ms);
void zplc_hal_posix_clear_tick_override(void);

#endif /* ZPLC_HAL_POSIX_H */
