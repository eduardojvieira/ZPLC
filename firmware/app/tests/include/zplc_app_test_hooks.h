/**
 * @file zplc_app_test_hooks.h
 * @brief Test-only entry points of the Zephyr application (RT-033).
 *
 * SPDX-License-Identifier: MIT
 *
 * No header of firmware/app declares these functions; their definitions are behind CONFIG_ZTEST. A Zephyr suite
 * that needs one includes this header (include directory firmware/app/tests/include). The suites that own the
 * hooks also compile a file that includes the product header and redeclares each name as a type: a hook that
 * comes back into a product header stops that file from compiling.
 */

#ifndef ZPLC_APP_TEST_HOOKS_H
#define ZPLC_APP_TEST_HOOKS_H

#include <stddef.h>
#include <stdint.h>

#include "program_store.h"

#ifdef CONFIG_ZTEST

/** @brief Called by zplc_config.c between the two steps of publishing a Modbus tag override. */
void zplc_config_test_set_modbus_override_publish_hook(void (*hook)(void));

/** @brief Makes the settings store fail with `error` once `entries` entries are written (-1: never) (COM-027). */
void zplc_config_test_fail_store_after(int entries, int error);
/** @brief Number of persisted settings. */
size_t zplc_config_test_row_count(void);
/** @brief The name and current value of persisted setting `index`; NULL past the end. */
const char *zplc_config_test_row(size_t index, uint8_t *value, size_t *length);

typedef zplc_program_store_restore_t (*zplc_boot_restore_test_restore_fn)(uint8_t *workspace, size_t workspace_capacity,
                                                                          size_t *program_size);
typedef int (*zplc_boot_restore_test_commit_fn)(uint8_t *workspace, size_t program_size, size_t workspace_capacity);

/** @brief Replace the program store behind the boot restore (NULL, NULL restores the real one). */
void zplc_boot_restore_test_set_store(zplc_boot_restore_test_restore_fn restore, zplc_boot_restore_test_commit_fn commit);

#endif /* CONFIG_ZTEST */

#endif /* ZPLC_APP_TEST_HOOKS_H */
