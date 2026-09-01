#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/ztest.h>

#include "program_store.h"
#include <zplc_hal.h>
#include <zplc_isa.h>

#define PROGRAM_CAPACITY 128U
#define WORKSPACE_CAPACITY (PROGRAM_CAPACITY + ZPLC_PROGRAM_STORE_FOOTER_SIZE)
#define RECORD_COUNT 7U

typedef struct {
  const char *key;
  uint8_t data[WORKSPACE_CAPACITY];
  size_t length;
  int present;
} record_t;

static record_t records[RECORD_COUNT];
static int operation;
static int fail_operation;
static const char *fail_load_key;
static const char *fail_save_key;
static int copy_active_then_commit_unknown;
static size_t truncate_read;
static const char *truncate_key;
static uint8_t readback_override[WORKSPACE_CAPACITY];
static size_t readback_override_length;
static struct k_sem first_payload_save_started;
static struct k_sem release_first_payload_save;
static atomic_t payload_save_count;
static atomic_t block_first_payload_save;

typedef struct {
  uint8_t workspace[WORKSPACE_CAPACITY];
  size_t size;
  int result;
  struct k_sem started;
  struct k_sem done;
} commit_thread_t;

K_THREAD_STACK_DEFINE(first_commit_stack, 1024);
K_THREAD_STACK_DEFINE(second_commit_stack, 1024);

static const char *const keys[RECORD_COUNT] = {
  "program_v1_active", "program_v1_slot_a_payload", "program_v1_slot_a_meta",
  "program_v1_slot_b_payload", "program_v1_slot_b_meta", "code_len", "code",
};

static record_t *record_for(const char *key)
{
  size_t index;
  for (index = 0U; index < RECORD_COUNT; ++index) {
    if (strcmp(keys[index], key) == 0)
      return &records[index];
  }
  return NULL;
}

static int next_operation(void)
{
  operation++;
  return fail_operation != 0 && operation == fail_operation;
}

zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data, size_t length)
{
  record_t *record = record_for(key);
  if (next_operation() || (fail_save_key != NULL && strcmp(key, fail_save_key) == 0) ||
      record == NULL || length > sizeof(record->data))
    return ZPLC_HAL_ERROR;
  if (strcmp(key, "program_v1_slot_a_payload") == 0 ||
      strcmp(key, "program_v1_slot_b_payload") == 0) {
    atomic_inc(&payload_save_count);
    if (atomic_cas(&block_first_payload_save, 1, 0)) {
      k_sem_give(&first_payload_save_started);
      if (k_sem_take(&release_first_payload_save, K_SECONDS(1)) != 0)
        return ZPLC_HAL_ERROR;
    }
  }
  memcpy(record->data, data, length);
  record->length = length;
  record->present = 1;
  if (copy_active_then_commit_unknown != 0 &&
      strcmp(key, "program_v1_active") == 0)
    return ZPLC_HAL_COMMIT_UNKNOWN;
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data, size_t length)
{
  record_t *record = record_for(key);
  size_t copied;
  if (next_operation() || (fail_load_key != NULL && strcmp(key, fail_load_key) == 0))
    return ZPLC_HAL_ERROR;
  if (record == NULL || record->present == 0)
    return ZPLC_HAL_NOT_IMPL;
  copied = record->length < length ? record->length : length;
  if (truncate_read != 0U && truncate_key != NULL &&
      strcmp(key, truncate_key) == 0 && copied > truncate_read)
    copied = truncate_read;
  if (readback_override_length != 0U &&
      strcmp(key, "program_v1_slot_a_payload") == 0 &&
      readback_override_length <= length) {
    memcpy(data, readback_override, readback_override_length);
    return ZPLC_HAL_OK;
  }
  memcpy(data, record->data, copied);
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_persist_delete(const char *key)
{
  record_t *record = record_for(key);
  if (next_operation())
    return ZPLC_HAL_ERROR;
  if (record == NULL || record->present == 0)
    return ZPLC_HAL_NOT_IMPL;
  record->present = 0;
  return ZPLC_HAL_OK;
}

void zplc_hal_log(const char *format, ...)
{
  (void)format;
}

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length)
{
  size_t index;
  for (index = 0U; index < length; ++index) {
    uint32_t bit;
    crc ^= data[index];
    for (bit = 0U; bit < 8U; ++bit)
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
  }
  return crc;
}

static uint32_t record_crc(const uint8_t *data, size_t length)
{
  return crc32_update(0xFFFFFFFFU, data, length) ^ 0xFFFFFFFFU;
}

static void put_u16(uint8_t *data, uint16_t value)
{
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void put_u32(uint8_t *data, uint32_t value)
{
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
  data[2] = (uint8_t)(value >> 16);
  data[3] = (uint8_t)(value >> 24);
}

static uint32_t get_u32(const uint8_t *data)
{
  return (uint32_t)data[0] | ((uint32_t)data[1] << 8) |
         ((uint32_t)data[2] << 16) | ((uint32_t)data[3] << 24);
}

static size_t build_program_code(uint8_t *program, const uint8_t *code,
                                 size_t code_size)
{
  size_t total = ZPLC_FILE_HEADER_SIZE + ZPLC_SEGMENT_ENTRY_SIZE + code_size;
  uint32_t crc;
  zassert_true(total <= PROGRAM_CAPACITY, "program too large");
  memset(program, 0, total);
  memcpy(program, "ZPLC", 4U);
  put_u16(program + 4U, ZPLC_VERSION_MAJOR);
  put_u16(program + 6U, ZPLC_VERSION_MINOR);
  put_u32(program + 16U, (uint32_t)code_size);
  put_u16(program + 24U, 0U);
  put_u16(program + 26U, 1U);
  put_u16(program + 32U, ZPLC_SEG_CODE);
  put_u32(program + 36U, (uint32_t)code_size);
  memcpy(program + ZPLC_FILE_HEADER_SIZE + ZPLC_SEGMENT_ENTRY_SIZE, code, code_size);
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  put_u32(program + 12U, crc);
  return total;
}

static size_t build_program(uint8_t *program, uint8_t tag)
{
  const uint8_t code[] = { tag, OP_HALT };
  return build_program_code(program, code, sizeof(code));
}

static size_t build_distinct_program(uint8_t *program)
{
  const uint8_t code[] = { OP_NOP, OP_NOP, OP_HALT };
  return build_program_code(program, code, sizeof(code));
}

static size_t build_control_flow_invalid_program(uint8_t *program)
{
  size_t total = build_program(program, OP_HALT) + 2U;
  uint32_t crc;

  put_u32(program + 16U, 4U);
  put_u32(program + 36U, 4U);
  program[40] = OP_JMP;
  program[41] = 1U;
  program[42] = 0U;
  program[43] = OP_HALT;
  crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, total - 16U) ^ 0xFFFFFFFFU;
  put_u32(program + 12U, crc);
  return total;
}

static uint32_t refresh_program_crc(uint8_t *program, size_t length)
{
  uint32_t crc = crc32_update(0xFFFFFFFFU, program, 12U);
  crc = crc32_update(crc, program + 16U, length - 16U) ^ 0xFFFFFFFFU;
  put_u32(program + 12U, crc);
  return crc;
}

static void reset_store(void)
{
  size_t index;
  memset(records, 0, sizeof(records));
  for (index = 0U; index < RECORD_COUNT; ++index)
    records[index].key = keys[index];
  operation = 0;
  fail_operation = 0;
  fail_load_key = NULL;
  fail_save_key = NULL;
  copy_active_then_commit_unknown = 0;
  truncate_read = 0U;
  truncate_key = NULL;
  readback_override_length = 0U;
  atomic_set(&block_first_payload_save, 0);
  atomic_set(&payload_save_count, 0);
  k_sem_init(&first_payload_save_started, 0U, 1U);
  k_sem_init(&release_first_payload_save, 0U, 1U);
}

static void commit_thread(void *arg1, void *arg2, void *arg3)
{
  commit_thread_t *commit = arg1;
  (void)arg2;
  (void)arg3;
  k_sem_give(&commit->started);
  commit->result = zplc_program_store_commit(commit->workspace, commit->size,
                                              sizeof(commit->workspace));
  k_sem_give(&commit->done);
}

static size_t commit_program(uint8_t tag)
{
  uint8_t workspace[WORKSPACE_CAPACITY];
  size_t size = build_program(workspace, tag);
  zassert_ok(zplc_program_store_commit(workspace, size, sizeof(workspace)), "commit");
  return size;
}

ZTEST(program_store, test_first_commit_restore_and_a_to_b)
{
  uint8_t workspace[WORKSPACE_CAPACITY];
  size_t restored;
  size_t first;
  reset_store();
  first = commit_program(OP_NOP);
  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored),
                ZPLC_PROGRAM_STORE_OK, "restore A");
  zassert_equal(restored, first, "A size");
  zassert_equal(workspace[40], OP_NOP, "A payload");
  (void)commit_program(OP_HALT);
  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored),
                ZPLC_PROGRAM_STORE_OK, "restore B");
  zassert_equal(workspace[40], OP_HALT, "B payload");
}

ZTEST(program_store, test_second_commit_failure_preserves_a_until_active_publish)
{
  uint8_t candidate[WORKSPACE_CAPACITY];
  uint8_t restored[WORKSPACE_CAPACITY];
  size_t candidate_size;
  size_t restored_size;
  int failure;
  reset_store();
  for (failure = 1; failure <= 16; ++failure) {
    reset_store();
    (void)commit_program(OP_NOP);
    candidate_size = build_program(candidate, OP_HALT);
    fail_operation = failure;
    operation = 0;
    int commit = zplc_program_store_commit(candidate, candidate_size, sizeof(candidate));
    fail_operation = 0;
    zassert_equal(zplc_program_store_restore(restored, sizeof(restored), &restored_size),
                  ZPLC_PROGRAM_STORE_OK, "restart after failure %d", failure);
    zassert_equal(restored[40], commit == 0 ? OP_HALT : OP_NOP,
                  "only published B survives");
  }
}

ZTEST(program_store, test_active_publish_commit_unknown_has_dedicated_result)
{
  uint8_t candidate[WORKSPACE_CAPACITY];
  size_t candidate_size;

  reset_store();
  (void)commit_program(OP_NOP);
  candidate_size = build_program(candidate, OP_HALT);
  copy_active_then_commit_unknown = 1;

  zassert_equal(zplc_program_store_commit(candidate, candidate_size,
                                          sizeof(candidate)),
                ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN,
                "ambiguous active publish must be distinguished");
  zassert_equal(records[0].data[6], 1U,
                "test seam copied the newly visible active pointer");
  zassert_equal(records[4].data[7], 1U,
                "candidate remains prepared when publication is ambiguous");
}

ZTEST(program_store, test_concurrent_commits_serialize_store_transaction)
{
  commit_thread_t first;
  commit_thread_t second;
  struct k_thread first_thread;
  struct k_thread second_thread;
  uint8_t restored[WORKSPACE_CAPACITY];
  size_t restored_size;

  reset_store();
  memset(&first, 0, sizeof(first));
  memset(&second, 0, sizeof(second));
  first.size = build_program(first.workspace, OP_NOP);
  second.size = build_program(second.workspace, OP_HALT);
  k_sem_init(&first.started, 0U, 1U);
  k_sem_init(&first.done, 0U, 1U);
  k_sem_init(&second.started, 0U, 1U);
  k_sem_init(&second.done, 0U, 1U);
  atomic_set(&block_first_payload_save, 1);

  (void)k_thread_create(&first_thread, first_commit_stack,
                        K_THREAD_STACK_SIZEOF(first_commit_stack), commit_thread,
                        &first, NULL, NULL, 5, 0U, K_NO_WAIT);
  zassert_ok(k_sem_take(&first_payload_save_started, K_SECONDS(1)),
             "first commit reached payload save");
  (void)k_thread_create(&second_thread, second_commit_stack,
                        K_THREAD_STACK_SIZEOF(second_commit_stack), commit_thread,
                        &second, NULL, NULL, 5, 0U, K_NO_WAIT);
  zassert_ok(k_sem_take(&second.started, K_SECONDS(1)), "second commit started");
  k_yield();
  zassert_equal(atomic_get(&payload_save_count), 1,
                "second commit must not reach persistence while first is blocked");
  zassert_true(k_sem_take(&second.done, K_NO_WAIT) != 0,
               "second commit must not complete while first holds the store");

  k_sem_give(&release_first_payload_save);
  zassert_ok(k_sem_take(&first.done, K_SECONDS(1)), "first commit completed");
  zassert_ok(k_sem_take(&second.done, K_SECONDS(1)), "second commit completed");
  zassert_ok(k_thread_join(&first_thread, K_SECONDS(1)), "first thread joined");
  zassert_ok(k_thread_join(&second_thread, K_SECONDS(1)), "second thread joined");
  zassert_ok(first.result, "first commit result");
  zassert_ok(second.result, "second commit result");
  zassert_equal(zplc_program_store_restore(restored, sizeof(restored), &restored_size),
                ZPLC_PROGRAM_STORE_OK, "concurrent result restores");
  zassert_equal(restored[40], OP_HALT, "second serialized commit is active");
}

ZTEST(program_store, test_semantically_invalid_candidate_never_persists_or_publishes)
{
  uint8_t candidate[WORKSPACE_CAPACITY];
  uint8_t restored[WORKSPACE_CAPACITY];
  record_t before[RECORD_COUNT];
  size_t restored_size;
  size_t candidate_size;

  reset_store();
  (void)commit_program(OP_NOP);
  memcpy(before, records, sizeof(before));
  candidate_size = build_control_flow_invalid_program(candidate);

  zassert_true(zplc_program_store_commit(candidate, candidate_size, sizeof(candidate)) != 0,
               "control-flow-invalid candidate must fail closed");
  zassert_mem_equal(records, before, sizeof(records),
                    "invalid candidate must not mutate durable records");
  zassert_equal(zplc_program_store_restore(restored, sizeof(restored), &restored_size),
                ZPLC_PROGRAM_STORE_OK, "prior A remains restorable");
  zassert_equal(restored[40], OP_NOP, "invalid candidate was not published");
}

ZTEST(program_store, test_semantically_invalid_readback_falls_back_to_a)
{
  uint8_t workspace[WORKSPACE_CAPACITY];
  size_t restored_size;
  uint32_t crc;

  reset_store();
  (void)commit_program(OP_NOP);
  (void)commit_program(OP_HALT);
  records[3].data[41] = 0x04U; /* Unknown opcode; footer and length stay valid. */
  crc = refresh_program_crc(records[3].data, records[3].length - ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  put_u32(records[4].data + 16U, crc);
  put_u32(records[4].data + 28U, record_crc(records[4].data, 28U));

  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored_size),
                ZPLC_PROGRAM_STORE_OK, "semantic corruption falls back");
  zassert_equal(workspace[40], OP_NOP, "prior A remains restorable");
}

ZTEST(program_store, test_active_semantic_corruption_does_not_destroy_valid_rollback_before_publish)
{
  uint8_t candidate[WORKSPACE_CAPACITY];
  uint8_t restored[WORKSPACE_CAPACITY];
  uint8_t a_payload[WORKSPACE_CAPACITY];
  uint8_t a_meta[32U];
  size_t candidate_size;
  size_t restored_size;
  size_t a_payload_size;
  size_t a_meta_size;
  uint32_t crc;

  reset_store();
  (void)commit_program(OP_NOP);
  (void)commit_program(OP_HALT);
  /* B remains structurally coherent and active, but its bytecode is invalid. */
  records[3].data[41] = 0x04U;
  crc = refresh_program_crc(records[3].data, records[3].length - ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  put_u32(records[4].data + 16U, crc);
  put_u32(records[4].data + 28U, record_crc(records[4].data, 28U));
  a_payload_size = records[1].length;
  a_meta_size = records[2].length;
  zassert_true(a_meta_size <= sizeof(a_meta), "metadata snapshot capacity");
  memcpy(a_payload, records[1].data, a_payload_size);
  memcpy(a_meta, records[2].data, a_meta_size);

  candidate_size = build_distinct_program(candidate);
  fail_save_key = "program_v1_active"; /* Interrupt exactly before active publish. */
  zassert_true(zplc_program_store_commit(candidate, candidate_size, sizeof(candidate)) != 0,
               "C must not publish when active write fails");
  fail_save_key = NULL;

  zassert_equal(records[0].data[6], 1U, "old active remains B");
  zassert_equal(get_u32(records[0].data + 8U), 2U,
                "old active generation remains 2");
  zassert_equal(records[2].data[7], 2U, "A stays committed during C");
  zassert_equal(get_u32(records[4].data + 8U), 3U,
                "interrupted C must not share B's active generation");
  zassert_equal(records[4].data[7], 1U, "interrupted C remains prepared in B");
  zassert_equal(records[1].length, a_payload_size, "A payload length unchanged");
  zassert_equal(records[2].length, a_meta_size, "A metadata length unchanged");
  zassert_mem_equal(records[1].data, a_payload, a_payload_size,
                    "C reused corrupt B, not A payload");
  zassert_mem_equal(records[2].data, a_meta, a_meta_size,
                    "C did not mutate A metadata");
  zassert_equal(zplc_program_store_restore(restored, sizeof(restored), &restored_size),
                ZPLC_PROGRAM_STORE_OK, "A must remain restorable after interrupted C");
  zassert_equal(restored_size, a_payload_size - ZPLC_PROGRAM_STORE_FOOTER_SIZE,
                "restore returns A artifact size");
  zassert_mem_equal(restored, a_payload, restored_size,
                    "restore must return A, never prepared C");
}

ZTEST(program_store, test_active_semantic_corruption_reuses_corrupt_slot_for_successful_commit)
{
  uint8_t candidate[WORKSPACE_CAPACITY];
  uint8_t expected[WORKSPACE_CAPACITY];
  uint8_t restored[WORKSPACE_CAPACITY];
  size_t candidate_size;
  size_t restored_size;
  uint32_t crc;

  reset_store();
  (void)commit_program(OP_NOP);
  (void)commit_program(OP_HALT);
  records[3].data[41] = 0x04U;
  crc = refresh_program_crc(records[3].data, records[3].length - ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  put_u32(records[4].data + 16U, crc);
  put_u32(records[4].data + 28U, record_crc(records[4].data, 28U));

  candidate_size = build_distinct_program(candidate);
  memcpy(expected, candidate, candidate_size);
  zassert_ok(zplc_program_store_commit(candidate, candidate_size, sizeof(candidate)),
             "C can replace semantically corrupt B");
  zassert_equal(zplc_program_store_restore(restored, sizeof(restored), &restored_size),
                ZPLC_PROGRAM_STORE_OK, "C restores after publication");
  zassert_equal(restored_size, candidate_size, "new C size restores");
  zassert_mem_equal(restored, expected, candidate_size, "new distinct C is active");
}

ZTEST(program_store, test_rollback_discovery_io_error_writes_nothing)
{
  uint8_t candidate[WORKSPACE_CAPACITY];
  record_t before[RECORD_COUNT];
  size_t candidate_size;

  reset_store();
  (void)commit_program(OP_NOP);
  (void)commit_program(OP_HALT);
  memcpy(before, records, sizeof(before));
  candidate_size = build_program(candidate, OP_NOP);
  fail_load_key = "program_v1_slot_b_payload";

  zassert_true(zplc_program_store_commit(candidate, candidate_size, sizeof(candidate)) != 0,
               "rollback discovery I/O failure must fail closed");
  zassert_mem_equal(records, before, sizeof(records),
                    "discovery failure must occur before any durable write");
}

ZTEST(program_store, test_empty_store_still_accepts_first_commit)
{
  uint8_t candidate[WORKSPACE_CAPACITY];
  uint8_t restored[WORKSPACE_CAPACITY];
  size_t candidate_size;
  size_t restored_size;

  reset_store();
  candidate_size = build_program(candidate, OP_NOP);
  zassert_ok(zplc_program_store_commit(candidate, candidate_size, sizeof(candidate)),
             "empty store first commit");
  zassert_equal(zplc_program_store_restore(restored, sizeof(restored), &restored_size),
                ZPLC_PROGRAM_STORE_OK, "first commit restores");
  zassert_equal(restored[40], OP_NOP, "first artifact payload");
}

ZTEST(program_store, test_corrupt_durable_state_never_bootstraps_over_evidence)
{
  uint8_t candidate[WORKSPACE_CAPACITY];
  record_t before[RECORD_COUNT];
  size_t candidate_size;

  reset_store();
  memset(records[0].data, 0, sizeof(records[0].data));
  records[0].data[0] = 'X';
  records[0].length = 16U;
  records[0].present = 1;
  memcpy(before, records, sizeof(before));
  candidate_size = build_program(candidate, OP_NOP);

  zassert_true(zplc_program_store_commit(candidate, candidate_size, sizeof(candidate)) != 0,
               "corrupt durable state must not become a fresh store");
  zassert_mem_equal(records, before, sizeof(records),
                    "failed bootstrap must preserve durable evidence");
}

ZTEST(program_store, test_active_corruption_prepared_and_truncation)
{
  uint8_t workspace[WORKSPACE_CAPACITY];
  size_t restored;
  reset_store();
  (void)commit_program(OP_NOP);
  (void)commit_program(OP_HALT);
  records[0].data[0] ^= 1U;
  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored),
                ZPLC_PROGRAM_STORE_OK, "committed fallback");
  zassert_equal(workspace[40], OP_HALT, "newest committed fallback");
  reset_store();
  (void)commit_program(OP_NOP);
  records[0].present = 0;
  records[2].data[7] = 1U; /* PREPARED is ignored without active. */
  put_u32(records[2].data + 28U, record_crc(records[2].data, 28U));
  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored),
                ZPLC_PROGRAM_STORE_EMPTY, "orphan prepared ignored");
  reset_store();
  (void)commit_program(OP_NOP);
  records[2].data[7] = 1U;
  put_u32(records[2].data + 28U, record_crc(records[2].data, 28U));
  /* Existing active directly names this PREPARED slot. */
  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored),
                ZPLC_PROGRAM_STORE_OK, "active prepared accepted");
  reset_store();
  (void)commit_program(OP_NOP);
  (void)commit_program(OP_HALT);
  truncate_read = 2U;
  truncate_key = "program_v1_slot_b_payload";
  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored),
                ZPLC_PROGRAM_STORE_OK, "truncated envelope falls back");
  zassert_equal(workspace[40], OP_NOP, "intact slot survives truncation");
}

ZTEST(program_store, test_legacy_migration_capacity_and_io_failure)
{
  uint8_t workspace[WORKSPACE_CAPACITY];
  uint8_t tiny[ZPLC_PROGRAM_STORE_FOOTER_SIZE];
  size_t size;
  size_t restored;
  reset_store();
  size = build_program(workspace, OP_NOP);
  put_u32(records[5].data, (uint32_t)size);
  records[5].length = sizeof(uint32_t);
  records[5].present = 1;
  memcpy(records[6].data, workspace, size);
  records[6].length = size;
  records[6].present = 1;
  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored),
                ZPLC_PROGRAM_STORE_LEGACY, "legacy staged");
  zassert_true(records[5].present != 0 && records[6].present != 0,
               "restore does not delete legacy");
  zassert_ok(zplc_program_store_commit(workspace, restored, sizeof(workspace)), "migrate");
  zassert_false(records[5].present != 0 || records[6].present != 0,
                "migration deletes legacy after publication");
  zassert_true(zplc_program_store_commit(workspace, restored, sizeof(tiny)) != 0,
               "capacity fails closed");
  fail_operation = 1;
  operation = 0;
  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored),
                ZPLC_PROGRAM_STORE_ERROR, "I/O fails closed");
}

ZTEST(program_store, test_short_metadata_length_and_coherent_readback_fail_closed)
{
  uint8_t workspace[WORKSPACE_CAPACITY];
  uint8_t candidate[WORKSPACE_CAPACITY];
  size_t size;
  size_t restored;

  reset_store();
  (void)commit_program(OP_NOP);
  records[2].data[12] = 1U; /* Valid metadata CRC, invalid artifact length. */
  records[2].data[13] = 0U;
  records[2].data[14] = 0U;
  records[2].data[15] = 0U;
  put_u32(records[2].data + 28U, record_crc(records[2].data, 28U));
  zassert_equal(zplc_program_store_restore(workspace, sizeof(workspace), &restored),
                ZPLC_PROGRAM_STORE_ERROR, "short metadata must fail closed");

  reset_store();
  size = build_program(candidate, OP_HALT);
  memcpy(readback_override, candidate, size);
  memcpy(readback_override + size, "ZPE1", 4U);
  put_u32(readback_override + size + 4U, (uint32_t)size);
  readback_override_length = size + ZPLC_PROGRAM_STORE_FOOTER_SIZE;
  zassert_true(zplc_program_store_commit(workspace, build_program(workspace, OP_NOP),
                                         sizeof(workspace)) != 0,
               "coherent wrong readback must fail");
}

ZTEST_SUITE(program_store, NULL, NULL, NULL, NULL, NULL);
