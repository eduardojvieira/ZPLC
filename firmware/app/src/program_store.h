/* Concrete, app-local durable store for admitted .zplc artifacts.
 *
 * The store itself is the core's (zplc_program_store.h, RT-032): one implementation for the firmware and the host
 * runtime, over the HAL persistence calls. This file binds it to the firmware: the loader's verification as the
 * admission check, the working buffers, and the mutex that serialises the transactions. */
#ifndef ZPLC_PROGRAM_STORE_H
#define ZPLC_PROGRAM_STORE_H

#include <stddef.h>
#include <stdint.h>

/* ZPLC_PROGRAM_STORE_FOOTER_SIZE, ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE (the configured code size, RT-028) and the
 * result codes of both calls. A workspace needs room for ZPLC_PROGRAM_STORE_FOOTER_SIZE bytes after the artifact. */
#include <zplc_program_store.h>

/* workspace must have room for program_size plus ZPLC_PROGRAM_STORE_FOOTER_SIZE;
 * program_size must not exceed ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE. This code
 * only records an already mode-admitted artifact; it never loads a VM. */
int zplc_program_store_commit(uint8_t *workspace, size_t program_size,
                              size_t workspace_capacity);

/* ZPLC_PROGRAM_STORE_UNVERIFIABLE of the core is reported as ZPLC_PROGRAM_STORE_ERROR here: the boot path fails
 * closed for both. */
zplc_program_store_restore_t zplc_program_store_restore(
    uint8_t *workspace, size_t workspace_capacity, size_t *program_size);

#endif /* ZPLC_PROGRAM_STORE_H */
