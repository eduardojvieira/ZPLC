/* Internal, concrete two-slot persistence for native .zplc artifacts. */
#ifndef ZPLC_NATIVE_PROGRAM_STORE_H
#define ZPLC_NATIVE_PROGRAM_STORE_H

#include <stddef.h>
#include <stdint.h>

#include <zplc_core.h>
#include <zplc_loader.h>

typedef struct {
  /* What zplc_loader_verify() answered; ZPLC_LOADER_ERR_DRAFT lets the caller say which draft. */
  int loader_result;
  uint8_t task_count;
  uint8_t has_task_segment;
  /* 1 when the tasks have more than one distinct interval (RT-015). */
  uint8_t multirate;
  /* The interval of the tasks, or the greatest common divisor of their intervals when multirate. */
  uint32_t scan_interval_ms;
  zplc_task_def_t tasks[ZPLC_LOADER_MAX_TASKS];
} zplc_native_program_details_t;

/* Internal policy shared by request admission, slots, and legacy migration. */
int zplc_native_program_validate(const uint8_t *program, size_t program_size, uint32_t *scan_interval_ms);
int zplc_native_program_describe(const uint8_t *program, size_t program_size, zplc_native_program_details_t *details);

/* Commit results distinguish clean pre-publication failure from an active
 * pointer that became visible without confirmed durability. */
#define ZPLC_NATIVE_PROGRAM_STORE_OK 0
#define ZPLC_NATIVE_PROGRAM_STORE_NO_PROGRAM 1
#define ZPLC_NATIVE_PROGRAM_STORE_ERROR (-1)
#define ZPLC_NATIVE_PROGRAM_STORE_COMMIT_UNKNOWN (-2)

int zplc_native_program_store_commit(const uint8_t *program, size_t program_size);
int zplc_native_program_store_restore(uint8_t *program, size_t capacity, size_t *program_size);

#endif
