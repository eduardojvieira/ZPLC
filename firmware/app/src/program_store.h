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

/* Finds the rollback of the next commit: the program a commit would fall back to, read and admitted into @p workspace
 * (which is overwritten and needs ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE bytes), or
 * that the store is empty. Call it when an upload starts, with the staging buffer, before the first byte of the new
 * program arrives: that is when the buffer of the code size is free, and it is why the store has none of its own.
 * Returns 0, or ZPLC_PROGRAM_STORE_COMMIT_ERROR when nothing could be found (the backend failed, or records exist and
 * none verifies); the commit that follows then refuses and writes nothing, as it did when it looked for the rollback
 * itself. The commit of a program of the first firmware that restore returned needs no call. */
int zplc_program_store_prepare(uint8_t *workspace, size_t workspace_capacity);

/* workspace must have room for program_size plus ZPLC_PROGRAM_STORE_FOOTER_SIZE;
 * program_size must not exceed ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE. This code
 * only records an already mode-admitted artifact; it never loads a VM. The rollback is the one of the last
 * zplc_program_store_prepare() (or of a restore of the first firmware's program), and is used for one commit. */
int zplc_program_store_commit(uint8_t *workspace, size_t program_size,
                              size_t workspace_capacity);

/* ZPLC_PROGRAM_STORE_UNVERIFIABLE of the core is reported as ZPLC_PROGRAM_STORE_ERROR here: the boot path fails
 * closed for both. */
zplc_program_store_restore_t zplc_program_store_restore(
    uint8_t *workspace, size_t workspace_capacity, size_t *program_size);

#endif /* ZPLC_PROGRAM_STORE_H */
