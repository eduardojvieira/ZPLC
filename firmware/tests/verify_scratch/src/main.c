/*
 * The one verifier workspace of the image (WS-42).
 *
 * The scheduler's admission of a program (zplc_sched_validate_program, zplc_sched_load) and the admission check of
 * the program store both run the loader's verifier, which needs a caller-owned workspace. They used to own one
 * each; they share one now, and this suite proves the rule that makes that safe: while a caller owns the scratch,
 * no other verification runs, and it runs to the same verdict when the scratch is given back.
 *
 * The programs are real: the loader verifies each of them, on the Zephyr HAL and NVS over the flash simulator.
 */
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/ztest.h>

#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>
#include <zplc_scheduler.h>
#include <zplc_verify_scratch.h>

#include "program_store.h"

#define PROGRAM_CAPACITY 128U
#define CANARY 0xA5U
/* How long a thread that must wait is given to prove that it does not. A verification takes microseconds. */
#define WAIT_MS 200

/* As large as the code region, like the staging buffer of the firmware: the rollback is found in it (WS-42). */
static uint8_t store_workspace[ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE];
static size_t program_size;
static uint8_t program[PROGRAM_CAPACITY];

K_THREAD_STACK_DEFINE(taker_stack, 4096);
static struct k_thread taker;
K_SEM_DEFINE(taker_started, 0, 1);
K_SEM_DEFINE(taker_done, 0, 1);
static atomic_t taker_finished;
static int taker_result;
static int taker_mode;

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  size_t index;

  for (index = 0U; index < length; index++) {
    uint32_t bit;

    crc ^= data[index];
    for (bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static void put_u16(uint8_t *data, uint16_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void put_u32(uint8_t *data, uint32_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
  data[2] = (uint8_t)(value >> 16);
  data[3] = (uint8_t)(value >> 24);
}

/* One cyclic task of 10 ms over six bytes of code: PUSH8 <value>, STORE8 OPI, HALT. */
static size_t build_program(uint8_t *out, uint8_t value) {
  const size_t code_size = 6U;
  const size_t task_bytes = ZPLC_TASK_DEF_SIZE;
  const size_t header = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t total = header + code_size + task_bytes;
  uint8_t *code = out + header;
  uint8_t *task = code + code_size;
  uint32_t crc;

  memset(out, 0, total);
  memcpy(out, "ZPLC", 4U);
  put_u16(out + 4U, ZPLC_VERSION_MAJOR);
  put_u16(out + 6U, ZPLC_VERSION_MINOR);
  put_u32(out + 28U, ZPLC_DRAFT_COUNTER);
  put_u32(out + 16U, (uint32_t)code_size);
  put_u32(out + 20U, (uint32_t)task_bytes);
  put_u16(out + 26U, 2U);
  put_u16(out + 32U, ZPLC_SEG_CODE);
  put_u32(out + 36U, (uint32_t)code_size);
  put_u16(out + 40U, ZPLC_SEG_TASK);
  put_u32(out + 44U, (uint32_t)task_bytes);
  code[0] = OP_PUSH8;
  code[1] = value;
  code[2] = OP_STORE8;
  put_u16(code + 3U, ZPLC_MEM_OPI_BASE);
  code[5] = OP_HALT;
  put_u16(task, 0U);
  task[2] = ZPLC_TASK_CYCLIC;
  task[3] = 1U;
  put_u32(task + 4U, 10000U);
  put_u16(task + 8U, 0U);
  put_u16(task + 10U, 64U);
  crc = crc32_update(0xFFFFFFFFU, out, 12U);
  crc = crc32_update(crc, out + 16U, total - 16U) ^ 0xFFFFFFFFU;
  put_u32(out + 12U, crc);
  return total;
}

enum { VALIDATE = 0, COMMIT = 1 };

static void taker_entry(void *a, void *b, void *c) {
  ARG_UNUSED(a);
  ARG_UNUSED(b);
  ARG_UNUSED(c);
  k_sem_give(&taker_started);
  if (taker_mode == VALIDATE) {
    taker_result = zplc_sched_validate_program(program, program_size);
  } else {
    (void)zplc_program_store_prepare(store_workspace, sizeof(store_workspace));
    memset(store_workspace, 0, sizeof(store_workspace));
    memcpy(store_workspace, program, program_size);
    taker_result = zplc_program_store_commit(store_workspace, program_size, sizeof(store_workspace));
  }
  atomic_set(&taker_finished, 1);
  k_sem_give(&taker_done);
}

/* Starts the work in a thread of lower priority than the test, which runs it when the test sleeps. */
static void start_taker(int mode) {
  k_sem_reset(&taker_started);
  k_sem_reset(&taker_done);
  atomic_set(&taker_finished, 0);
  taker_result = -99;
  taker_mode = mode;
  (void)k_thread_create(&taker, taker_stack, K_THREAD_STACK_SIZEOF(taker_stack), taker_entry, NULL, NULL, NULL, K_PRIO_PREEMPT(8), 0U,
                        K_NO_WAIT);
  zassert_ok(k_sem_take(&taker_started, K_MSEC(WAIT_MS)), "the thread did not start");
}

static void *suite_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "HAL init");
  zassert_ok(zplc_sched_init(), "scheduler init");
  program_size = build_program(program, 0x11U);
  return NULL;
}

ZTEST(verify_scratch, test_every_taker_gets_the_same_buffer) {
  uint8_t *first = zplc_verify_scratch_take();
  uint8_t *second;

  zassert_not_null(first, "the scratch can be taken");
  zplc_verify_scratch_give();
  second = zplc_verify_scratch_take();
  zassert_equal(first, second, "there is one buffer, not one per caller");
  zplc_verify_scratch_give();
}

ZTEST(verify_scratch, test_the_scratch_is_the_size_the_verifier_needs) {
  uint8_t *scratch = zplc_verify_scratch_take();

  zassert_not_null(scratch, "the scratch can be taken");
  /* The verifier refuses a workspace smaller than ZPLC_LOADER_VERIFY_WORKSPACE_SIZE, so a full-size write to the
   * scratch is also a bounds check of the object the lock hands out. */
  memset(scratch, CANARY, ZPLC_LOADER_VERIFY_WORKSPACE_SIZE);
  zassert_equal(scratch[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE - 1U], CANARY, "the last byte is the caller's");
  zplc_verify_scratch_give();
}

ZTEST(verify_scratch, test_scheduler_admission_waits_for_the_owner_of_the_scratch) {
  uint8_t *scratch = zplc_verify_scratch_take();
  size_t index;

  zassert_not_null(scratch, "the scratch can be taken");
  memset(scratch, CANARY, ZPLC_LOADER_VERIFY_WORKSPACE_SIZE);
  start_taker(VALIDATE);

  /* The thread runs while this one sleeps. A verification takes microseconds, so a thread that is not blocked has
   * finished, and has overwritten the canary, long before the sleep ends. */
  k_sleep(K_MSEC(WAIT_MS));
  zassert_false(atomic_get(&taker_finished), "the scheduler verified while the scratch was owned");
  for (index = 0U; index < ZPLC_LOADER_VERIFY_WORKSPACE_SIZE; index++) {
    zassert_equal(scratch[index], CANARY, "the owner's bytes changed at %u", (unsigned)index);
  }

  zplc_verify_scratch_give();
  zassert_ok(k_sem_take(&taker_done, K_MSEC(WAIT_MS)), "the admission did not continue when the scratch was given");
  zassert_ok(k_thread_join(&taker, K_MSEC(WAIT_MS)), "the thread ends");
  zassert_equal(taker_result, ZPLC_LOADER_OK, "and it verified to the verdict it has alone");
}

ZTEST(verify_scratch, test_program_store_admission_waits_for_the_owner_of_the_scratch) {
  uint8_t *scratch = zplc_verify_scratch_take();
  size_t index;

  zassert_not_null(scratch, "the scratch can be taken");
  memset(scratch, CANARY, ZPLC_LOADER_VERIFY_WORKSPACE_SIZE);
  start_taker(COMMIT);

  k_sleep(K_MSEC(WAIT_MS));
  zassert_false(atomic_get(&taker_finished), "the store verified while the scratch was owned");
  for (index = 0U; index < ZPLC_LOADER_VERIFY_WORKSPACE_SIZE; index++) {
    zassert_equal(scratch[index], CANARY, "the owner's bytes changed at %u", (unsigned)index);
  }

  zplc_verify_scratch_give();
  zassert_ok(k_sem_take(&taker_done, K_MSEC(WAIT_MS)), "the commit did not continue when the scratch was given");
  zassert_ok(k_thread_join(&taker, K_MSEC(WAIT_MS)), "the thread ends");
  zassert_equal(taker_result, ZPLC_PROGRAM_STORE_COMMIT_OK, "and it committed");
}

ZTEST(verify_scratch, test_a_commit_and_a_validation_one_after_the_other_agree_with_each_alone) {
  size_t restored = 0U;
  zplc_program_store_restore_t result;

  zassert_equal(zplc_sched_validate_program(program, program_size), ZPLC_LOADER_OK, "valid alone");
  (void)zplc_program_store_prepare(store_workspace, sizeof(store_workspace));
  memset(store_workspace, 0, sizeof(store_workspace));
  memcpy(store_workspace, program, program_size);
  zassert_equal(zplc_program_store_commit(store_workspace, program_size, sizeof(store_workspace)), ZPLC_PROGRAM_STORE_COMMIT_OK, "commits");
  zassert_equal(zplc_sched_validate_program(program, program_size), ZPLC_LOADER_OK, "valid after a commit");

  /* A damaged artifact is refused by both, and the refusal leaves the scratch free for the next one. */
  program[program_size - 1U] ^= 0xFFU;
  zassert_not_equal(zplc_sched_validate_program(program, program_size), ZPLC_LOADER_OK, "damaged is refused");
  (void)zplc_program_store_prepare(store_workspace, sizeof(store_workspace));
  memset(store_workspace, 0, sizeof(store_workspace));
  memcpy(store_workspace, program, program_size);
  zassert_not_equal(zplc_program_store_commit(store_workspace, program_size, sizeof(store_workspace)), ZPLC_PROGRAM_STORE_COMMIT_OK,
                    "a damaged artifact is not committed");
  program[program_size - 1U] ^= 0xFFU;
  zassert_equal(zplc_sched_validate_program(program, program_size), ZPLC_LOADER_OK, "valid again");

  memset(store_workspace, 0x5A, sizeof(store_workspace));
  result = zplc_program_store_restore(store_workspace, sizeof(store_workspace), &restored);
  zassert_equal(result, ZPLC_PROGRAM_STORE_OK, "the committed program is the one stored");
  zassert_equal(restored, program_size, "at its size");
}

ZTEST_SUITE(verify_scratch, NULL, suite_setup, NULL, NULL, NULL);
