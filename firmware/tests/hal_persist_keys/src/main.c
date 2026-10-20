/*
 * Non-volatile storage works for every key the runtime uses (IO-008).
 *
 * The keys below are the ones the runtime and the application store through the
 * HAL: the transactional program store (firmware/lib/zplc_core/src/core/zplc_program_store.c)
 * with the chunks of both slots, the legacy program keys, the RETAIN chunks of the
 * two slots (firmware/lib/zplc_core/include/zplc_retain.h), the device settings
 * "cfg_00".."cfg_99" (firmware/app/src/zplc_config.c), the AWS fleet credentials
 * (firmware/app/src/zplc_aws_fleet.c) and the keys of the device link
 * (firmware/app/src/shell_cmds.c). Each must save, load back what was saved
 * and delete on the real Zephyr HAL over the NVS of the native_sim flash
 * simulator; a key the HAL has no identifier for must answer with an error that
 * the caller sees, not drop the data.
 */
#include <stdio.h>
#include <string.h>
#include <zephyr/fs/fs.h>
#include <zephyr/storage/flash_map.h>
#include <zephyr/ztest.h>
#include <zplc_hal.h>
#include <zplc_program_store.h>

#include "zplc_config.h"

static const char *const runtime_keys[] = {
    /* legacy program */
    "code_len", "code", "retain",
    /* transactional program store, with the first chunk after the payload key of each slot */
    "program_v1_active", "program_v1_slot_a_payload", "program_v1_slot_a_meta",
    "program_v1_slot_b_payload", "program_v1_slot_b_meta",
    "program_v1_slot_a_payload_1", "program_v1_slot_b_payload_1",
    /* the first and the last device setting */
    "cfg_00", "cfg_99",
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
  static const char *const unknown[] = {
      "no_such_key", "cfg_1", "cfg_100", "cfg_0a", "retain_a8", "retain_c0",
      "program_v1_slot_a_payload_0", "program_v1_slot_a_payload_01", "program_v1_slot_c_payload_1",
  };
  char past_the_last_chunk[40];
  uint8_t value = 1U;
  size_t index;

  for (index = 0U; index < ARRAY_SIZE(unknown); index++) {
    zassert_equal(zplc_hal_persist_save(unknown[index], &value, 1U), ZPLC_HAL_ERROR, "save %s", unknown[index]);
    zassert_equal(zplc_hal_persist_load(unknown[index], &value, 1U), ZPLC_HAL_ERROR, "load %s", unknown[index]);
    zassert_equal(zplc_hal_persist_delete(unknown[index]), ZPLC_HAL_ERROR, "delete %s", unknown[index]);
  }
  (void)snprintf(past_the_last_chunk, sizeof(past_the_last_chunk), "program_v1_slot_b_payload_%u",
                 (unsigned)ZPLC_PROGRAM_STORE_MAX_CHUNKS);
  zassert_equal(zplc_hal_persist_save(past_the_last_chunk, &value, 1U), ZPLC_HAL_ERROR, "%s", past_the_last_chunk);
}

/* ---- IO-008: every program chunk of both slots and every device setting has an identifier of its own ---- */
ZTEST(zplc_hal_persist_keys, test_the_program_chunks_and_the_device_settings_are_stored_apart) {
  char key[40];
  uint8_t value;
  uint8_t out = 0U;
  unsigned slot;
  unsigned index;

  for (slot = 0U; slot < 2U; slot++) {
    for (index = 1U; index < ZPLC_PROGRAM_STORE_MAX_CHUNKS; index++) {
      (void)snprintf(key, sizeof(key), "program_v1_slot_%c_payload_%u", slot == 0U ? 'a' : 'b', index);
      value = (uint8_t)(slot * 64U + index);
      zassert_equal(zplc_hal_persist_save(key, &value, 1U), ZPLC_HAL_OK, "save %s", key);
    }
  }
  for (index = 0U; index < 100U; index++) {
    (void)snprintf(key, sizeof(key), "cfg_%02u", index);
    value = (uint8_t)(128U + index);
    zassert_equal(zplc_hal_persist_save(key, &value, 1U), ZPLC_HAL_OK, "save %s", key);
  }

  for (slot = 0U; slot < 2U; slot++) {
    for (index = 1U; index < ZPLC_PROGRAM_STORE_MAX_CHUNKS; index++) {
      (void)snprintf(key, sizeof(key), "program_v1_slot_%c_payload_%u", slot == 0U ? 'a' : 'b', index);
      zassert_equal(zplc_hal_persist_load(key, &out, 1U), ZPLC_HAL_OK, "load %s", key);
      zassert_equal(out, (uint8_t)(slot * 64U + index), "%s kept its own value", key);
      zassert_equal(zplc_hal_persist_delete(key), ZPLC_HAL_OK, "delete %s", key);
    }
  }
  for (index = 0U; index < 100U; index++) {
    (void)snprintf(key, sizeof(key), "cfg_%02u", index);
    zassert_equal(zplc_hal_persist_load(key, &out, 1U), ZPLC_HAL_OK, "load %s", key);
    zassert_equal(out, (uint8_t)(128U + index), "%s kept its own value", key);
    zassert_equal(zplc_hal_persist_delete(key), ZPLC_HAL_OK, "delete %s", key);
  }
}

/* ---- IO-008: the settings file system mounts on its own partition and the NVS records stay intact beside it ---- */
ZTEST(zplc_hal_persist_keys, test_the_settings_file_system_and_the_records_keep_each_other) {
  static const char probe[] = "/lfs/io008.bin";
  struct fs_statvfs volume;
  struct fs_dirent entry;
  struct fs_file_t file;
  uint8_t record[32];
  uint8_t back[32];
  uint8_t block[512];
  size_t index;

  for (index = 0U; index < sizeof(record); index++) {
    record[index] = (uint8_t)(0xA5U ^ index);
  }
  zassert_equal(zplc_hal_persist_save("code", record, sizeof(record)), ZPLC_HAL_OK, "save before the mount");

  zassert_ok(zplc_config_init(), "config init");
  zassert_ok(fs_statvfs("/lfs", &volume), "zplc_config_init() mounts the settings file system");
  zassert_equal((uint64_t)volume.f_frsize * volume.f_blocks, (uint64_t)PARTITION_SIZE(storage_partition),
                "the settings file system is storage_partition");

  memset(block, 0x5A, sizeof(block));
  fs_file_t_init(&file);
  zassert_ok(fs_open(&file, probe, FS_O_CREATE | FS_O_WRITE | FS_O_TRUNC), "open a file");
  for (index = 0U; index < 8U; index++) {
    zassert_equal(fs_write(&file, block, sizeof(block)), (ssize_t)sizeof(block), "write the file");
  }
  zassert_ok(fs_close(&file), "close the file");

  memset(back, 0, sizeof(back));
  zassert_equal(zplc_hal_persist_load("code", back, sizeof(back)), ZPLC_HAL_OK, "the record survives the file system");
  zassert_mem_equal(back, record, sizeof(record), "and reads back unchanged");

  record[0] ^= 0xFFU;
  zassert_equal(zplc_hal_persist_save("code", record, sizeof(record)), ZPLC_HAL_OK, "a record written after the file");
  zassert_ok(fs_stat(probe, &entry), "the file survives the record");
  zassert_equal(entry.size, 8U * sizeof(block), "with its size");
  fs_file_t_init(&file);
  zassert_ok(fs_open(&file, probe, FS_O_READ), "reopen the file");
  zassert_equal(fs_read(&file, back, sizeof(back)), (ssize_t)sizeof(back), "read the file");
  zassert_ok(fs_close(&file), "close the file");
  zassert_mem_equal(back, block, sizeof(back), "and its bytes");

  zassert_ok(fs_unlink(probe), "remove the file");
  zassert_equal(zplc_hal_persist_delete("code"), ZPLC_HAL_OK, "remove the record");
}

ZTEST_SUITE(zplc_hal_persist_keys, NULL, NULL, NULL, NULL, NULL);
