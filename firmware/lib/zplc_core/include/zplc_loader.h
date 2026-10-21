/**
 * @file zplc_loader.h
 * @brief ZPLC Binary File Loader
 *
 * Verifies the structural and bytecode integrity of .zplc files without
 * changing runtime state. The current v1 subset accepts flags=0 and CODE,
 * TASK, TAGS, BUILD and SAFE segments only. The returned view borrows the
 * input buffer.
 */

#ifndef ZPLC_LOADER_H
#define ZPLC_LOADER_H

#include <stddef.h>
#include <stdint.h>

#include "zplc_isa.h"

/* clang-format off */
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
/** @brief Communication function-block kind is NONE or at or above the kind limit, or a block at a statically known address does not fit one memory region */
#define ZPLC_LOADER_ERR_COMM -16
/** @brief Draft contract counter of the artifact differs from the loader's, or the artifact has none */
#define ZPLC_LOADER_ERR_DRAFT -17
/** @brief The evaluation stack can underflow, or exceed the depth the task declares, on some path, or the verifier cannot prove that it cannot */
#define ZPLC_LOADER_ERR_STACK -18
/** @brief A declared safe value is invalid: the segment is not whole entries, an entry names no bit of the output image or a value other than 0 or 1, an output is declared twice, or there are too many */
#define ZPLC_LOADER_ERR_SAFE -19
/* <<< END GENERATED: loader-errors <<< */
/* clang-format on */

/* Artifact-wide v1 admission limit. This intentionally does not depend on
 * scheduler headers: individual runtimes can impose a lower operational
 * limit after verification. */
/* clang-format off */
/* >>> GENERATED (tools/contract/generate.py): loader-max-tasks. Do not edit. >>> */
#define ZPLC_LOADER_MAX_TASKS 16U
/** @brief Most outputs one artifact may declare a safe value for, in the SAFE segment (loader). */
#define ZPLC_LOADER_MAX_SAFE 64U
/* <<< END GENERATED: loader-max-tasks <<< */
/* clang-format on */

/* Transient storage of the verifier, provided by the caller. It holds, for
 * the largest CODE the runtime accepts (ZPLC_MEM_CODE_SIZE):
 *   - one bit per CODE byte: the control-flow targets and entry points;
 *   - a rank index over those bits (16 bits per 128 CODE bytes);
 *   - the stack depth interval at each target (2 bytes), and a pending bit;
 *   - one record per subroutine entry for the stack-effect summaries (RT-003).
 * The verifier tracks at most ZPLC_VERIFY_MAX_LEADERS targets (one per 16 CODE
 * bytes, and a margin) and ZPLC_VERIFY_MAX_FRAMES subroutine entries (one per
 * 128 CODE bytes, and a margin); an artifact with more is refused with
 * ZPLC_LOADER_ERR_WORKSPACE. Compiled programs use a fraction of both.
 * Its work is bounded: it is charged one unit for each instruction it decodes
 * and control-flow edge it follows, and one for each eight bytes of a table
 * it scans, probes or clears, and when the charge reaches
 * ZPLC_VERIFY_STEPS_PER_BYTE units per CODE byte (and 4096) it stops and the
 * artifact is refused with ZPLC_LOADER_ERR_STACK. A compiled program uses a
 * few percent of that. The stack depth it follows is bounded by
 * ZPLC_VERIFY_MAX_DEPTH values (a deeper stack is refused with
 * ZPLC_LOADER_ERR_STACK even where the runtime would allow it).
 * Task uniqueness is bounded by ZPLC_LOADER_MAX_TASKS and needs no bitmap. */
/* clang-format off */
/* >>> GENERATED (tools/contract/generate.py): loader-verified-depth. Do not edit. >>> */
/* Deepest evaluation stack the loader proves for a task. A program that needs more is refused, whatever the target stack allows; the compiler fails the build above it (CMP-050). */
#define ZPLC_VERIFY_MAX_DEPTH 127
/* <<< END GENERATED: loader-verified-depth <<< */
/* clang-format on */
#define ZPLC_VERIFY_MAX_LEADERS ((ZPLC_MEM_CODE_SIZE) / 16U + 64U)
#define ZPLC_VERIFY_MAX_FRAMES ((ZPLC_MEM_CODE_SIZE) / 128U + 32U)
#define ZPLC_VERIFY_FRAME_BYTES 7U
#define ZPLC_VERIFY_STEPS_PER_BYTE 64U
#define ZPLC_LOADER_VERIFY_WORKSPACE_SIZE                                                                        \
  (((ZPLC_MEM_CODE_SIZE + 7U) / 8U) + 2U * ((ZPLC_MEM_CODE_SIZE + 127U) / 128U) + 2U * ZPLC_VERIFY_MAX_LEADERS + \
   (ZPLC_VERIFY_MAX_LEADERS + 7U) / 8U + ZPLC_VERIFY_MAX_FRAMES * ZPLC_VERIFY_FRAME_BYTES)

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
  zplc_program_segment_t segments[5];
  /** Build identity of the artifact (CMP-056); 0 when it carries none. */
  uint32_t build_id;
  /** Declared safe values of digital outputs (RT-023): safe_count entries of
     *  ZPLC_SAFE_ENTRY_SIZE bytes, each checked to name one bit of the output
     *  image, with the value 0 or 1, once. NULL and 0 when the artifact
     *  declares none: every output is then off in the safe state. */
  const uint8_t *safe;
  uint32_t safe_count;
} zplc_program_view_t;

/**
 * @brief Verify the supported structural and semantic v1 ZPLC subset.
 *
 * Besides the structure of the file, the code is verified statically: every
 * jump lands on an instruction, every direct memory access and every block of
 * a communication opcode at a statically known address lies inside the
 * regions of PLC memory (ZPLC_LOADER_ERR_MEMORY, ZPLC_LOADER_ERR_COMM), and
 * no path from an entry point (the header's, and each task's) can underflow
 * the evaluation stack or exceed the depth the task declares
 * (ZPLC_LOADER_ERR_STACK). The stack check follows every path, joins the
 * depths where paths meet, and treats a call by the effect of the callee on
 * the stack; it refuses what it cannot prove, among it recursion, and what
 * takes more work to prove than its bound (see ZPLC_VERIFY_STEPS_PER_BYTE).
 * Calls nested deeper than the call stack of the VM (ZPLC_CALL_STACK_MAX, 32
 * by default) are refused with ZPLC_LOADER_ERR_STACK as well: the run would
 * end in the VM fault CALL_OVERFLOW.
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
int zplc_loader_verify(const uint8_t *data, size_t len, uint8_t *workspace, size_t workspace_size, zplc_program_view_t *out);

/**
 * @brief Draft contract counter recorded in an artifact header (CMP-052).
 *
 * Reads header word 28 and nothing else. The magic, the CRC and the rest of
 * the artifact are not checked, so a caller can show the number of an artifact
 * that zplc_loader_verify() refused with ZPLC_LOADER_ERR_DRAFT ("built for
 * draft N, this runtime is draft ZPLC_DRAFT_COUNTER").
 *
 * @param data Pointer to the file data, may be NULL
 * @param len Length of the data in bytes
 * @return The counter, or 0 when @p data is NULL or shorter than a header.
 *         0 is also what an artifact built before the counter carries.
 */
uint32_t zplc_loader_artifact_draft_counter(const uint8_t *data, size_t len);

#endif /* ZPLC_LOADER_H */
