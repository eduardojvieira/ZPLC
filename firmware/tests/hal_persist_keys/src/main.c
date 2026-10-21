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
#include <errno.h>
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
    "code_len",
    "code",
    "retain",
    /* transactional program store, with the first chunk after the payload key of each slot */
    "program_v1_active",
    "program_v1_slot_a_payload",
    "program_v1_slot_a_meta",
    "program_v1_slot_b_payload",
    "program_v1_slot_b_meta",
    "program_v1_slot_a_payload_1",
    "program_v1_slot_b_payload_1",
    /* the first and the last device setting */
    "cfg_00",
    "cfg_99",
    /* credentials */
    "aws_cert_pem",
    "aws_key_pem",
    /* the keys of the device link: sessions (COM-021) and signed programs (COM-026) */
    "link_key",
    "link_signkey",
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
  zassert_equal(zplc_hal_persist_load(key, in, sizeof(in)), ZPLC_HAL_NOT_IMPL, "%s is absent after delete", key);
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
      "no_such_key",
      "cfg_1",
      "cfg_100",
      "cfg_0a",
      "retain_a8",
      "retain_c0",
      "program_v1_slot_a_payload_0",
      "program_v1_slot_a_payload_01",
      "program_v1_slot_c_payload_1",
  };
  char past_the_last_chunk[40];
  uint8_t value = 1U;
  size_t index;

  for (index = 0U; index < ARRAY_SIZE(unknown); index++) {
    zassert_equal(zplc_hal_persist_save(unknown[index], &value, 1U), ZPLC_HAL_ERROR, "save %s", unknown[index]);
    zassert_equal(zplc_hal_persist_load(unknown[index], &value, 1U), ZPLC_HAL_ERROR, "load %s", unknown[index]);
    zassert_equal(zplc_hal_persist_delete(unknown[index]), ZPLC_HAL_ERROR, "delete %s", unknown[index]);
  }
  (void)snprintf(past_the_last_chunk, sizeof(past_the_last_chunk), "program_v1_slot_b_payload_%u", (unsigned)ZPLC_PROGRAM_STORE_MAX_CHUNKS);
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

/* The table of the stored settings, from zplc_config.c (built with CONFIG_ZTEST). */
size_t zplc_config_test_row_count(void);
const char *zplc_config_test_row(size_t index, uint8_t *value, size_t *length);

struct credential_path_setting {
  const char *name;
  int (*set)(const char *path);
  void (*get)(char *buf, size_t len);
};

static const struct credential_path_setting credential_paths[] = {
    {"mqtt_ca_cert_path", zplc_config_set_mqtt_ca_cert_path, zplc_config_get_mqtt_ca_cert_path},
    {"mqtt_client_cert_path", zplc_config_set_mqtt_client_cert_path, zplc_config_get_mqtt_client_cert_path},
    {"mqtt_client_key_path", zplc_config_set_mqtt_client_key_path, zplc_config_get_mqtt_client_key_path},
    {"aws_claim_cert_path", zplc_config_set_aws_claim_cert_path, zplc_config_get_aws_claim_cert_path},
    {"aws_claim_key_path", zplc_config_set_aws_claim_key_path, zplc_config_get_aws_claim_key_path},
};

/* ---- IO-008: a certificate path names a file or a credential record of the store, never another record ---- */
ZTEST(zplc_hal_persist_keys, test_a_certificate_path_cannot_name_a_record_that_is_not_a_credential) {
  static const char *const refused[] = {"persist://link_key", "persist://link_signkey", "persist://code",
                                        "persist://cfg_07",   "persist://retain_a0",    "persist://no_such_key"};
  static const char *const accepted[] = {"persist://aws_cert_pem", "persist://aws_key_pem", "/lfs/certs/ca.pem", ""};
  char path[96];
  size_t setting;
  size_t index;

  for (setting = 0U; setting < ARRAY_SIZE(credential_paths); setting++) {
    const struct credential_path_setting *s = &credential_paths[setting];

    for (index = 0U; index < ARRAY_SIZE(accepted); index++) {
      zassert_ok(s->set(accepted[index]), "%s takes %s", s->name, accepted[index]);
      s->get(path, sizeof(path));
      zassert_str_equal(path, accepted[index], "%s takes %s", s->name, accepted[index]);
    }
    zassert_ok(s->set("/lfs/certs/kept.pem"), "%s takes a file", s->name);
    for (index = 0U; index < ARRAY_SIZE(refused); index++) {
      zassert_equal(s->set(refused[index]), -EINVAL, "%s refuses %s", s->name, refused[index]);
      s->get(path, sizeof(path));
      zassert_str_equal(path, "/lfs/certs/kept.pem", "%s refuses %s and keeps its value", s->name, refused[index]);
    }
  }
}

/* ---- IO-008: a stored certificate path that names another record is not applied at the next start ---- */
ZTEST(zplc_hal_persist_keys, test_a_stored_certificate_path_naming_another_record_is_not_applied) {
  static const char name[] = "mqtt_client_key_path";
  static const char value[] = "persist://link_signkey";
  uint8_t record[3U + sizeof(name) + sizeof(value)];
  uint8_t row_value[600];
  size_t row_length;
  char key[8];
  char path[96];
  size_t index;

  for (index = 0U; index < zplc_config_test_row_count(); index++) {
    if (strcmp(zplc_config_test_row(index, row_value, &row_length), name) == 0) {
      break;
    }
  }
  zassert_true(index < zplc_config_test_row_count(), "the setting is stored");

  /* The record of zplc_config.c: name length, name, value length (little-endian), value. */
  record[0] = (uint8_t)(sizeof(name) - 1U);
  memcpy(&record[1], name, sizeof(name) - 1U);
  record[sizeof(name)] = (uint8_t)(sizeof(value) - 1U);
  record[sizeof(name) + 1U] = 0U;
  memcpy(&record[sizeof(name) + 2U], value, sizeof(value) - 1U);
  (void)snprintf(key, sizeof(key), "cfg_%02u", (unsigned)index);
  zassert_equal(zplc_hal_persist_save(key, record, sizeof(name) + 1U + sizeof(value)), ZPLC_HAL_OK, "store it");

  zassert_ok(zplc_config_init(), "a restart reads the stored settings");
  zplc_config_get_mqtt_client_key_path(path, sizeof(path));
  zassert_str_equal(path, "/lfs/certs/client.key", "the stored record name is refused and the default stays");
  zassert_equal(zplc_hal_persist_delete(key), ZPLC_HAL_OK, "remove it");
}

ZTEST_SUITE(zplc_hal_persist_keys, NULL, NULL, NULL, NULL, NULL);
