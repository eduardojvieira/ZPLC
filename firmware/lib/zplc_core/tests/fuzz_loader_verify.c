/**
 * @file fuzz_loader_verify.c
 * @brief libFuzzer target for zplc_loader_verify (VF-014).
 *
 * SPDX-License-Identifier: MIT
 *
 * Build with -DZPLC_BUILD_FUZZER=ON (Clang); tools/fuzz/run.sh does that, adds
 * the seed corpus and the dictionary, and runs it.
 *
 * The container header carries a CRC32 over the whole file. A byte mutation
 * that does not repair it is rejected by the first check of the verifier, so
 * the custom mutator below restores the CRC (and, half of the time, the size
 * fields that depend on the segment table) after every mutation, and leaves
 * it wrong for one mutation in 32 so that the CRC path itself stays covered.
 *
 * Invariants checked on every input:
 *  - a rejected input leaves the output view untouched;
 *  - an accepted view lies inside the input, within the limits of the
 *    contract (code size, task count, tag count, entry point);
 *  - verification is deterministic: the same input gives the same result and
 *    the same view;
 *  - the CRC covers every byte: one flipped bit of an accepted file is
 *    rejected.
 * Memory errors and undefined behaviour are found by the sanitizers.
 */

#include "fuzz_common.h"

static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

/* What the verifier said, by result code (index = -code): how far mutations get is visible at the end of a run. */
static unsigned long g_results[20];
static unsigned long g_execs;
static int g_started;

static void report_at_exit(void) {
  unsigned i;

  fprintf(stderr, "fuzz_loader_verify: execs=%lu accepted=%lu rejected by code:", g_execs, g_results[0]);
  for (i = 1; i < 20U; i++) {
    if (g_results[i] != 0U) {
      fprintf(stderr, " %d=%lu", -(int)i, g_results[i]);
    }
  }
  fputc('\n', stderr);
}

size_t LLVMFuzzerCustomMutator(uint8_t *data, size_t size, size_t max_size, unsigned int seed);

size_t LLVMFuzzerCustomMutator(uint8_t *data, size_t size, size_t max_size, unsigned int seed) {
  fz_rng_t rng;

  fz_rng_seed(&rng, seed);
  size = LLVMFuzzerMutate(data, size, max_size);
  if (size >= ZPLC_FILE_HEADER_SIZE && fz_below(&rng, 32U) != 0U) {
    if ((fz_rand(&rng) & 1U) != 0U) {
      fz_repair_sizes(data, size);
    }
    fz_repair_crc(data, size);
  }
  return size;
}

static int inside(const uint8_t *part, size_t part_size, const uint8_t *whole, size_t whole_size) {
  return part >= whole && part_size <= whole_size && (size_t)(part - whole) <= whole_size - part_size;
}

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  zplc_program_view_t sentinel;
  zplc_program_view_t view;
  zplc_program_view_t again;
  int result;
  int repeat;

  if (!g_started) {
    g_started = 1;
    atexit(report_at_exit);
  }
  g_execs++;
  memset(&sentinel, 0xA5, sizeof(sentinel));
  memcpy(&view, &sentinel, sizeof(view));
  result = zplc_loader_verify(data, size, workspace, sizeof(workspace), &view);
  if (result <= 0 && result > -20) {
    g_results[-result]++;
  }
  if (result != ZPLC_LOADER_OK) {
    FZ_REQUIRE(result < 0, "a rejection is a negative code");
    FZ_REQUIRE(memcmp(&view, &sentinel, sizeof(view)) == 0, "a rejected input must leave the view untouched");
    return 0;
  }

  FZ_REQUIRE(view.binary == data && view.binary_size == size, "the view names the input");
  FZ_REQUIRE(view.code_size > 0U && view.code_size <= ZPLC_MEM_CODE_SIZE, "code size within the contract");
  FZ_REQUIRE(view.entry_point < view.code_size, "entry point inside the code");
  FZ_REQUIRE(view.code != NULL && inside(view.code, view.code_size, data, size), "code lies inside the file");
  FZ_REQUIRE(view.task_count <= ZPLC_LOADER_MAX_TASKS, "task count within the contract");
  FZ_REQUIRE(view.tag_count <= ZPLC_MAX_TAGS, "tag count within the contract");
  FZ_REQUIRE(view.task_count == 0U || (view.tasks != NULL && inside(view.tasks, (size_t)view.task_count * ZPLC_TASK_DEF_SIZE, data, size)),
             "tasks lie inside the file");
  FZ_REQUIRE(view.tag_count == 0U || (view.tags != NULL && inside(view.tags, (size_t)view.tag_count * ZPLC_TAG_ENTRY_SIZE, data, size)),
             "tags lie inside the file");

  /* Deterministic: same input, same verdict, same view. */
  memset(&again, 0, sizeof(again));
  repeat = zplc_loader_verify(data, size, workspace, sizeof(workspace), &again);
  FZ_REQUIRE(repeat == ZPLC_LOADER_OK && memcmp(&view, &again, sizeof(view)) == 0, "verification is deterministic");

  /* The CRC covers every byte: any single flipped bit of an accepted file is rejected. */
  {
    uint8_t *copy = (uint8_t *)malloc(size);
    size_t position = ((size_t)fz_get32(data + 12) ^ ((size_t)size * 2654435761U)) % size;
    uint8_t bit = (uint8_t)(1U << (position % 8U));

    FZ_REQUIRE(copy != NULL, "allocation");
    memcpy(copy, data, size);
    copy[position] ^= bit;
    memset(&again, 0, sizeof(again));
    FZ_REQUIRE(zplc_loader_verify(copy, size, workspace, sizeof(workspace), &again) != ZPLC_LOADER_OK,
               "a single flipped bit of an accepted file must be rejected");
    free(copy);
  }
  return 0;
}
