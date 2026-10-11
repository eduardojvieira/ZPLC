/*
 * Non-volatile storage works for every key the runtime uses (IO-008).
 *
 * The keys below are the ones the runtime and the application store through the
 * HAL: the transactional program store (firmware/app/src/program_store.c), the
 * legacy program keys, the RETAIN chunks of the two slots
 * (firmware/lib/zplc_core/include/zplc_retain.h) and the AWS fleet credentials
 * (firmware/app/src/zplc_aws_fleet.c). Each must save, load back what was saved
 * and delete on the real Zephyr HAL over the NVS of the native_sim flash
 * simulator; a key the HAL has no identifier for must answer with an error that
 * the caller sees, not drop the data.
 */
#include <stdio.h>
#include <string.h>
#include <zephyr/ztest.h>
#include <zplc_hal.h>

static const char *const runtime_keys[] = {
    /* legacy program */
    "code_len", "code", "retain",
    /* transactional program store */
    "program_v1_active", "program_v1_slot_a_payload", "program_v1_slot_a_meta",
    "program_v1_slot_b_payload", "program_v1_slot_b_meta",
    /* credentials */
    "aws_cert_pem", "aws_key_pem",
    /* the keys of the device link: sessions (COM-021) and signed programs (COM-026) */
    "link_key", "link_signkey",
};

static void check_round_trip(const char *key, uint8_t seed) {
  uint8_t out[32];
  uint8_t in[32];
  size_t index;

  for (index = 0U; index < sizeof(out); index++) {
    out[index] = (uint8_t)(seed + index);
  }
  zassert_equal(zplc_hal_persist_save(key, out, sizeof(out)), ZPLC_HAL_OK, "save %s", key);
  memset(in, 0, sizeof(in));
  zassert_equal(zplc_hal_persist_load(key, in, sizeof(in)), ZPLC_HAL_OK, "load %s", key);
  zassert_mem_equal(in, out, sizeof(out), "%s reads back what was saved", key);
  zassert_equal(zplc_hal_persist_delete(key), ZPLC_HAL_OK, "delete %s", key);
  zassert_equal(zplc_hal_persist_load(key, in, sizeof(in)), ZPLC_HAL_NOT_IMPL,
                "%s is absent after delete", key);
}

ZTEST(zplc_hal_persist_keys, test_every_key_the_runtime_uses_is_stored_and_read_back) {
  size_t index;

  for (index = 0U; index < ARRAY_SIZE(runtime_keys); index++) {
    check_round_trip(runtime_keys[index], (uint8_t)(index * 7U + 1U));
  }
}

ZTEST(zplc_hal_persist_keys, test_the_retain_chunks_of_both_slots_are_stored) {
  char key[16];
  uint8_t slot;
  uint8_t chunk;

  for (slot = 0U; slot < 2U; slot++) {
    for (chunk = 0U; chunk < 8U; chunk++) {
      (void)snprintf(key, sizeof(key), "retain_%c%u", slot == 0U ? 'a' : 'b', (unsigned)chunk);
      check_round_trip(key, (uint8_t)(slot * 16U + chunk));
    }
  }
}

ZTEST(zplc_hal_persist_keys, test_keys_do_not_share_an_identifier) {
  uint8_t value = 1U;
  uint8_t out = 0U;
  size_t index;

  for (index = 0U; index < ARRAY_SIZE(runtime_keys); index++) {
    value = (uint8_t)(index + 10U);
    zassert_equal(zplc_hal_persist_save(runtime_keys[index], &value, 1U), ZPLC_HAL_OK, "save");
  }
  for (index = 0U; index < ARRAY_SIZE(runtime_keys); index++) {
    zassert_equal(zplc_hal_persist_load(runtime_keys[index], &out, 1U), ZPLC_HAL_OK, "load");
    zassert_equal(out, (uint8_t)(index + 10U), "%s kept its own value", runtime_keys[index]);
  }
  for (index = 0U; index < ARRAY_SIZE(runtime_keys); index++) {
    (void)zplc_hal_persist_delete(runtime_keys[index]);
  }
}

ZTEST(zplc_hal_persist_keys, test_a_key_without_an_identifier_is_an_error_the_caller_sees) {
  uint8_t value = 1U;

  zassert_equal(zplc_hal_persist_save("no_such_key", &value, 1U), ZPLC_HAL_ERROR, "save");
  zassert_equal(zplc_hal_persist_load("no_such_key", &value, 1U), ZPLC_HAL_ERROR, "load");
  zassert_equal(zplc_hal_persist_delete("no_such_key"), ZPLC_HAL_ERROR, "delete");
}

ZTEST_SUITE(zplc_hal_persist_keys, NULL, NULL, NULL, NULL, NULL);
