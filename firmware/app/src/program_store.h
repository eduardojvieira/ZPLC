/* Concrete, app-local durable store for admitted .zplc artifacts. */
#ifndef ZPLC_PROGRAM_STORE_H
#define ZPLC_PROGRAM_STORE_H

#include <stddef.h>
#include <stdint.h>

#define ZPLC_PROGRAM_STORE_FOOTER_SIZE 8U
/* The production staging buffers and the store's bounded rollback verifier
 * share this explicit artifact ceiling. */
#define ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE 4096U

typedef enum {
  ZPLC_PROGRAM_STORE_OK = 0,
  ZPLC_PROGRAM_STORE_EMPTY = 1,
  ZPLC_PROGRAM_STORE_LEGACY = 2,
  ZPLC_PROGRAM_STORE_ERROR = -1,
} zplc_program_store_restore_t;

typedef enum {
  ZPLC_PROGRAM_STORE_COMMIT_OK = 0,
  ZPLC_PROGRAM_STORE_COMMIT_ERROR = -1,
  /* The active pointer may already be visible. Callers must fail safe rather
   * than continuing with either in-memory program. */
  ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN = -2,
} zplc_program_store_commit_result_t;

/* workspace must have room for program_size plus ZPLC_PROGRAM_STORE_FOOTER_SIZE;
 * program_size must not exceed ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE. This code
 * only records an already mode-admitted artifact; it never loads a VM. */
int zplc_program_store_commit(uint8_t *workspace, size_t program_size,
                              size_t workspace_capacity);
zplc_program_store_restore_t zplc_program_store_restore(
    uint8_t *workspace, size_t workspace_capacity, size_t *program_size);

#endif /* ZPLC_PROGRAM_STORE_H */
