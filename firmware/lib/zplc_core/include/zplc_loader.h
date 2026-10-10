/**
 * @file zplc_loader.h
 * @brief ZPLC Binary File Loader
 *
 * Verifies the structural and bytecode integrity of .zplc files without
 * changing runtime state. The current v1 subset accepts flags=0 and CODE,
 * TASK, and TAGS segments only. The returned view borrows the input buffer.
 */

#ifndef ZPLC_LOADER_H
#define ZPLC_LOADER_H

#include <stddef.h>
#include <stdint.h>

#include "zplc_isa.h"

/* >>> GENERATED (tools/contract/generate.py): loader-errors. Do not edit. >>> */
/* Error Codes */
/** @brief Verified */
#define ZPLC_LOADER_OK 0
/** @brief Wrong magic number */
#define ZPLC_LOADER_ERR_MAGIC -1
/** @brief ISA version differs from the loader version */
#define ZPLC_LOADER_ERR_VERSION -2
/** @brief A size or count field is inconsistent with the file, or a reserved word is not zero */
#define ZPLC_LOADER_ERR_SIZE -3
/** @brief No CODE segment */
#define ZPLC_LOADER_ERR_NO_CODE -4
/** @brief CRC32 mismatch */
#define ZPLC_LOADER_ERR_CRC32 -6
/** @brief Header flags are not supported */
#define ZPLC_LOADER_ERR_FLAGS -7
/** @brief Segment table entry is invalid, repeated or of an unsupported type */
#define ZPLC_LOADER_ERR_SEGMENT -8
/** @brief Entry point is not an instruction boundary */
#define ZPLC_LOADER_ERR_ENTRY_POINT -9
/** @brief Verifier workspace is missing or too small */
#define ZPLC_LOADER_ERR_WORKSPACE -10
/** @brief Unknown opcode or truncated instruction */
#define ZPLC_LOADER_ERR_OPCODE -11
/** @brief Jump target is not an instruction boundary, or the code falls through its end */
#define ZPLC_LOADER_ERR_CONTROL_FLOW -12
/** @brief Static memory access outside the writable regions */
#define ZPLC_LOADER_ERR_MEMORY -13
/** @brief Task definition is invalid or there are too many tasks */
#define ZPLC_LOADER_ERR_TASK -14
/** @brief Tag entry is invalid */
#define ZPLC_LOADER_ERR_TAGS -15
/** @brief Communication function-block kind is NONE or at or above the kind limit */
#define ZPLC_LOADER_ERR_COMM -16
/* <<< END GENERATED: loader-errors <<< */

/* Artifact-wide v1 admission limit. This intentionally does not depend on
 * scheduler headers: individual runtimes can impose a lower operational
 * limit after verification. */
/* >>> GENERATED (tools/contract/generate.py): loader-max-tasks. Do not edit. >>> */
#define ZPLC_LOADER_MAX_TASKS 16U
/* <<< END GENERATED: loader-max-tasks <<< */

/* One bit per CODE byte records instruction boundaries and control-flow
 * targets. Callers provide this transient storage; task uniqueness is bounded
 * by ZPLC_LOADER_MAX_TASKS and needs no bitmap. */
#define ZPLC_LOADER_VERIFY_WORKSPACE_SIZE ((ZPLC_MEM_CODE_SIZE + 7U) / 8U)

typedef struct {
    uint16_t type;
    uint16_t flags;
    const uint8_t *data;
    uint32_t size;
} zplc_program_segment_t;

typedef struct {
    const uint8_t *binary;
    size_t binary_size;
    const uint8_t *code;
    uint32_t code_size;
    const uint8_t *tasks;
    uint32_t task_count;
    const uint8_t *tags;
    uint32_t tag_count;
    uint16_t entry_point;
    uint32_t flags;
    uint16_t segment_count;
    zplc_program_segment_t segments[3];
} zplc_program_view_t;

/**
 * @brief Verify the supported structural and semantic v1 ZPLC subset.
 *
 * This does not load or authorize a runtime. Product load paths remain a
 * separate integration gate.
 *
 * @param data Pointer to the file data
 * @param len Length of the data in bytes
 * @param workspace Caller-owned transient scratch of at least
 *        ZPLC_LOADER_VERIFY_WORKSPACE_SIZE bytes
 * @param workspace_size Size of @p workspace in bytes
 * @param out Destination for the verified view; untouched on failure
 * @return 0 on success, negative error code on failure. The view remains
 *         valid only while @p data remains valid.
 *
 * @pre @p workspace, @p out, and data[0..len) do not overlap.
 */
int zplc_loader_verify(const uint8_t *data, size_t len, uint8_t *workspace,
                       size_t workspace_size, zplc_program_view_t *out);

#endif /* ZPLC_LOADER_H */
