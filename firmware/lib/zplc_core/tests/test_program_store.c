/**
 * @file test_program_store.c
 * @brief The durable program store (RT-028, RT-031, RT-032): the largest artifact and a power cut at every step.
 *        The tests cover chunked payloads, every size up to the code size and a torn write.
 *
 * SPDX-License-Identifier: MIT
 *
 * The store is the one implementation of src/core/zplc_program_store.c over the POSIX HAL, whose persistence is a
 * directory of files. The tests that cut the power use the HAL's injection: from the n-th persistence operation on,
 * every operation fails, as it does when the supply is gone, and a torn write leaves a prefix of the record in the
 * file. After each cut the store is read again with the injection cleared, which is the first boot after the reset.
 *
 * "Complete" is checked byte for byte: what restore returns is either exactly the program that was stored before
 * the deploy or exactly the new one.
 */

#define _POSIX_C_SOURCE 200809L
#define _DARWIN_C_SOURCE 1 /* macOS hides mkdtemp under a strict _POSIX_C_SOURCE */

#include <dirent.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <zplc_bytes.h>
#include <zplc_crc32.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_program_store.h>
#include <zplc_test_hooks.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                       \
  do {                                                                         \
    test_count++;                                                              \
    if (!(cond)) {                                                             \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                  \
      fail_count++;                                                            \
    } else {                                                                   \
      printf("PASS: %s\n", msg);                                               \
    }                                                                          \
  } while (0)

#define MAX_ARTIFACT ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE
#define BUFFER_SIZE (MAX_ARTIFACT + ZPLC_PROGRAM_STORE_FOOTER_SIZE)

static uint8_t scratch[BUFFER_SIZE];
static uint8_t workspace[BUFFER_SIZE];
static uint8_t expect_a[BUFFER_SIZE];
static uint8_t expect_b[BUFFER_SIZE];
static uint8_t candidate[BUFFER_SIZE];
static char root[128];

/* ------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* ------------------------------------------------------------------------- */

/* The admission check the tests give the store: the container CRC-32 convention of the loader (every byte but the
 * word at offset 12) and one rule of the runtime's, so that a program can be inadmissible on purpose. */
static int admit(const uint8_t *artifact, size_t size, void *context) {
  (void)context;
  if (size < ZPLC_FILE_HEADER_SIZE || memcmp(artifact, "ZPLC", 4U) != 0) {
    return -1;
  }
  if (size > ZPLC_FILE_HEADER_SIZE && artifact[ZPLC_FILE_HEADER_SIZE] == 0xEEU) {
    return -2;
  }
  {
    uint32_t crc = zplc_crc32_update(0xFFFFFFFFU, artifact, 12U);

    crc = zplc_crc32_update(crc, artifact + 16U, size - 16U) ^ 0xFFFFFFFFU;
    return crc == zplc_get_u32_le(artifact + 12U) ? 0 : -3;
  }
}

static zplc_pstore_config_t config(uint8_t repair) {
  zplc_pstore_config_t c;

  memset(&c, 0, sizeof(c));
  c.admit = admit;
  c.scratch = scratch;
  c.scratch_capacity = sizeof(scratch);
  c.repair_on_restore = repair;
  return c;
}

static void build(uint8_t *out, size_t size, uint8_t seed) {
  size_t index;
  uint32_t crc;

  memset(out, 0, size);
  memcpy(out, "ZPLC", 4U);
  zplc_put_u16_le(out + 4U, ZPLC_VERSION_MAJOR);
  zplc_put_u16_le(out + 6U, ZPLC_VERSION_MINOR);
  zplc_put_u32_le(out + 16U, (uint32_t)size);
  for (index = ZPLC_FILE_HEADER_SIZE; index < size; index++) {
    out[index] = (uint8_t)(seed + index * 31U + (index >> 8));
  }
  if (size > ZPLC_FILE_HEADER_SIZE && out[ZPLC_FILE_HEADER_SIZE] == 0xEEU) {
    out[ZPLC_FILE_HEADER_SIZE] = 0x11U;
  }
  crc = zplc_crc32_update(0xFFFFFFFFU, out, 12U);
  crc = zplc_crc32_update(crc, out + 16U, size - 16U) ^ 0xFFFFFFFFU;
  zplc_put_u32_le(out + 12U, crc);
}

static void key_path(const char *key, char *out, size_t cap) {
  (void)snprintf(out, cap, "%s/%s.bin", root, key);
}

static void remove_root(void) {
  DIR *directory;
  struct dirent *entry;
  char path[512];

  if (root[0] == '\0') {
    return;
  }
  directory = opendir(root);
  if (directory != NULL) {
    while ((entry = readdir(directory)) != NULL) {
      if (strcmp(entry->d_name, ".") != 0 && strcmp(entry->d_name, "..") != 0) {
        (void)snprintf(path, sizeof(path), "%s/%s", root, entry->d_name);
        (void)unlink(path);
      }
    }
    (void)closedir(directory);
  }
  (void)rmdir(root);
}

static int fresh_root(void) {
  remove_root();
  (void)snprintf(root, sizeof(root), "/tmp/zplc_pstore_XXXXXX");
  if (mkdtemp(root) == NULL) {
    return -1;
  }
  (void)setenv("ZPLC_PERSIST_ROOT", root, 1);
  zplc_hal_persist_test_fail_at(0UL);
  return 0;
}

static int write_file(const char *key, const uint8_t *data, size_t length) {
  char path[256];
  FILE *file;

  key_path(key, path, sizeof(path));
  file = fopen(path, "wb");
  if (file == NULL) {
    return -1;
  }
  if (length != 0U && fwrite(data, 1U, length, file) != length) {
    (void)fclose(file);
    return -1;
  }
  return fclose(file);
}

static int key_exists(const char *key) {
  char path[256];

  key_path(key, path, sizeof(path));
  return access(path, F_OK) == 0;
}

static int commit(const uint8_t *program, size_t size) {
  zplc_pstore_config_t c = config(0U);

  memset(workspace, 0xA5, sizeof(workspace));
  memcpy(workspace, program, size);
  return zplc_pstore_commit(&c, workspace, size, sizeof(workspace));
}

static zplc_program_store_restore_t restore(size_t *size) {
  zplc_pstore_config_t c = config(0U);

  memset(workspace, 0x5A, sizeof(workspace));
  return zplc_pstore_restore(&c, workspace, sizeof(workspace), size);
}

/* A deploy the way the firmware makes it (WS-42): the rollback is found while the buffer is free, before the
 * upload, and the commit has no scratch of its own. The buffer is the same one in both steps. */
static zplc_pstore_config_t probed_config(void) {
  zplc_pstore_config_t c = config(0U);

  c.scratch = NULL;
  c.scratch_capacity = 0U;
  return c;
}

static int probe(zplc_pstore_rollback_t *rollback) {
  zplc_pstore_config_t c = probed_config();

  memset(workspace, 0xC3, sizeof(workspace));
  return zplc_pstore_probe(&c, workspace, sizeof(workspace), rollback);
}

static int commit_probed(const zplc_pstore_rollback_t *rollback, const uint8_t *program, size_t size) {
  zplc_pstore_config_t c = probed_config();

  memset(workspace, 0xA5, sizeof(workspace));
  memcpy(workspace, program, size);
  return zplc_pstore_commit_probed(&c, rollback, workspace, size, sizeof(workspace));
}

static int probe_then_commit(const uint8_t *program, size_t size) {
  zplc_pstore_rollback_t rollback;

  (void)probe(&rollback);
  return commit_probed(&rollback, program, size);
}

/* The files of the store, byte for byte, to compare two stores that went through the same steps. */
#define SNAP_FILES 24
#define SNAP_BYTES 4400
struct snapshot {
  size_t count;
  char name[SNAP_FILES][64];
  size_t length[SNAP_FILES];
  uint8_t data[SNAP_FILES][SNAP_BYTES];
};

static int snapshot_name_order(const void *a, const void *b) { return strcmp((const char *)a, (const char *)b); }

static int snapshot_take(struct snapshot *snap) {
  DIR *directory = opendir(root);
  struct dirent *entry;

  snap->count = 0U;
  if (directory == NULL) {
    return -1;
  }
  while ((entry = readdir(directory)) != NULL && snap->count < SNAP_FILES) {
    if (strcmp(entry->d_name, ".") != 0 && strcmp(entry->d_name, "..") != 0) {
      size_t length = strlen(entry->d_name);

      if (length >= sizeof(snap->name[0])) {
        length = sizeof(snap->name[0]) - 1U; /* the names of the store are far shorter */
      }
      memcpy(snap->name[snap->count], entry->d_name, length);
      snap->name[snap->count][length] = '\0';
      snap->count++;
    }
  }
  (void)closedir(directory);
  qsort(snap->name, snap->count, sizeof(snap->name[0]), snapshot_name_order);
  for (size_t i = 0U; i < snap->count; i++) {
    char path[512];
    FILE *file;

    (void)snprintf(path, sizeof(path), "%s/%s", root, snap->name[i]);
    file = fopen(path, "rb");
    if (file == NULL) {
      return -1;
    }
    snap->length[i] = fread(snap->data[i], 1U, SNAP_BYTES, file);
    (void)fclose(file);
  }
  return 0;
}

static int snapshot_same(const struct snapshot *a, const struct snapshot *b) {
  if (a->count != b->count) {
    return 0;
  }
  for (size_t i = 0U; i < a->count; i++) {
    if (strcmp(a->name[i], b->name[i]) != 0 || a->length[i] != b->length[i] ||
        memcmp(a->data[i], b->data[i], a->length[i]) != 0) {
      return 0;
    }
  }
  return 1;
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                       */
/* ------------------------------------------------------------------------- */

/* RT-028: artifacts of every size round-trip, up to the code size. */
static void test_sizes_round_trip(void) {
  const size_t chunk = ZPLC_PROGRAM_STORE_CHUNK_SIZE;
  const size_t footer = ZPLC_PROGRAM_STORE_FOOTER_SIZE;
  const size_t sizes[] = {ZPLC_FILE_HEADER_SIZE,
                          100U,
                          chunk - footer - 1U,
                          chunk - footer,
                          chunk - footer + 1U,
                          chunk,
                          2U * chunk - footer,
                          2U * chunk - footer + 1U,
                          5000U,
                          MAX_ARTIFACT / 2U,
                          MAX_ARTIFACT};
  size_t index;

  printf("\n=== Test: artifacts of every size round-trip, up to the code size (RT-028) ===\n");
  for (index = 0U; index < sizeof(sizes) / sizeof(sizes[0]); index++) {
    const size_t size = sizes[index];
    size_t restored = 0U;
    char message[96];

    (void)snprintf(message, sizeof(message), "an artifact of %zu bytes commits", size);
    CHECK(fresh_root() == 0, "a clean store");
    build(expect_a, size, (uint8_t)index);
    CHECK(commit(expect_a, size) == ZPLC_PROGRAM_STORE_COMMIT_OK, message);
    (void)snprintf(message, sizeof(message), "and restores to the same %zu bytes", size);
    CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == size &&
              memcmp(workspace, expect_a, size) == 0,
          message);
  }

  /* The count of keys follows the size: one chunk is one key, the largest artifact is many. */
  CHECK(fresh_root() == 0, "a clean store");
  build(expect_a, chunk - footer, 1U);
  CHECK(commit(expect_a, chunk - footer) == ZPLC_PROGRAM_STORE_COMMIT_OK &&
            key_exists("program_v1_slot_a_payload") &&
            !key_exists("program_v1_slot_a_payload_1"),
        "an artifact that fits one chunk is stored under the one key of the first version of the store");
  CHECK(fresh_root() == 0, "a clean store");
  build(expect_a, MAX_ARTIFACT, 2U);
  CHECK(commit(expect_a, MAX_ARTIFACT) == ZPLC_PROGRAM_STORE_COMMIT_OK &&
            key_exists("program_v1_slot_a_payload") &&
            key_exists("program_v1_slot_a_payload_1"),
        "the largest artifact is stored in chunks");
}

/* RT-028: the largest artifact the store accepts is the configured code size. */
static void test_largest_artifact_is_the_code_size(void) {
  size_t restored = 0U;

  printf("\n=== Test: the largest artifact the store accepts is the configured code size (RT-028) ===\n");
  CHECK(MAX_ARTIFACT == (size_t)ZPLC_MEM_CODE_SIZE, "the limit is the code region of the build");
  CHECK(fresh_root() == 0, "a clean store");
  build(expect_a, MAX_ARTIFACT, 3U);
  CHECK(commit(expect_a, MAX_ARTIFACT) == ZPLC_PROGRAM_STORE_COMMIT_OK, "an artifact of exactly that size commits");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == MAX_ARTIFACT &&
            memcmp(workspace, expect_a, MAX_ARTIFACT) == 0,
        "and restores");

  /* One byte more is refused, and nothing was written for it. */
  CHECK(fresh_root() == 0, "a clean store");
  memset(workspace, 0, sizeof(workspace));
  {
    zplc_pstore_config_t c = config(0U);

    CHECK(zplc_pstore_commit(&c, workspace, MAX_ARTIFACT + 1U, sizeof(workspace)) ==
              ZPLC_PROGRAM_STORE_COMMIT_ERROR,
          "an artifact one byte over the code size is refused");
  }
  CHECK(!key_exists("program_v1_slot_a_payload") && !key_exists("program_v1_active"),
        "and the store holds nothing of it");
}

/* A store written by the first version of the firmware: the whole payload under one key, whatever its length. */
static void write_first_version_store(const uint8_t *program, size_t size, unsigned generation) {
  uint8_t meta[32];
  uint8_t active[16];
  uint8_t *payload = (uint8_t *)malloc(size + 8U);

  memcpy(payload, program, size);
  memcpy(payload + size, "ZPE1", 4U);
  zplc_put_u32_le(payload + size + 4U, (uint32_t)size);
  (void)write_file("program_v1_slot_a_payload", payload, size + 8U);
  free(payload);

  memset(meta, 0, sizeof(meta));
  memcpy(meta, "ZPS1", 4U);
  zplc_put_u16_le(meta + 4U, 1U);
  meta[6] = 0U;
  meta[7] = 2U;
  zplc_put_u32_le(meta + 8U, generation);
  zplc_put_u32_le(meta + 12U, (uint32_t)size);
  zplc_put_u32_le(meta + 16U, zplc_get_u32_le(program + 12U));
  zplc_put_u16_le(meta + 20U, ZPLC_VERSION_MAJOR);
  zplc_put_u16_le(meta + 22U, ZPLC_VERSION_MINOR);
  zplc_put_u32_le(meta + 28U, zplc_crc32(meta, 28U));
  (void)write_file("program_v1_slot_a_meta", meta, sizeof(meta));

  memset(active, 0, sizeof(active));
  memcpy(active, "ZPA1", 4U);
  zplc_put_u16_le(active + 4U, 1U);
  active[6] = 0U;
  zplc_put_u32_le(active + 8U, generation);
  zplc_put_u32_le(active + 12U, zplc_crc32(active, 12U));
  (void)write_file("program_v1_active", active, sizeof(active));
}

static void test_store_of_the_first_version_is_read(void) {
  size_t restored = 0U;

  printf("\n=== Test: a store written by the first version, whole payload under one key, is restored ===\n");
  CHECK(fresh_root() == 0, "a clean store");
  build(expect_a, 3000U, 5U);
  write_first_version_store(expect_a, 3000U, 7U);
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == 3000U &&
            memcmp(workspace, expect_a, 3000U) == 0,
        "a 3000 byte program under one key restores");

  /* A deploy over it goes to the other slot and the old one stays the rollback. */
  build(expect_b, 4000U, 6U);
  CHECK(commit(expect_b, 4000U) == ZPLC_PROGRAM_STORE_COMMIT_OK, "a deploy over it commits");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == 4000U &&
            memcmp(workspace, expect_b, 4000U) == 0,
        "and the new program is the one restored");
  CHECK(key_exists("program_v1_slot_b_payload_1"), "written in chunks, in slot B");
}

static void test_a_to_b_and_back(void) {
  size_t restored = 0U;
  uint8_t damaged[16];

  printf("\n=== Test: slots alternate, and a damaged active record falls back to the newest committed slot ===\n");
  CHECK(fresh_root() == 0, "a clean store");
  build(expect_a, 2500U, 1U);
  build(expect_b, 3500U, 2U);
  CHECK(commit(expect_a, 2500U) == 0 && commit(expect_b, 3500U) == 0, "two deploys");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == 3500U &&
            memcmp(workspace, expect_b, 3500U) == 0,
        "the second is the one restored");
  CHECK(key_exists("program_v1_slot_a_payload_2") && key_exists("program_v1_slot_b_payload_3"),
        "each slot holds its chunks");

  memset(damaged, 0xFF, sizeof(damaged));
  CHECK(write_file("program_v1_active", damaged, sizeof(damaged)) == 0, "the active record is damaged");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == 3500U &&
            memcmp(workspace, expect_b, 3500U) == 0,
        "the newest committed slot is restored without it");

  /* A chunk of the newest slot is damaged: the older program is the rollback. */
  {
    uint8_t chunk[ZPLC_PROGRAM_STORE_CHUNK_SIZE];

    memset(chunk, 0x55, sizeof(chunk));
    CHECK(write_file("program_v1_slot_b_payload_2", chunk, sizeof(chunk)) == 0, "a chunk of slot B is damaged");
    CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == 2500U &&
              memcmp(workspace, expect_a, 2500U) == 0,
          "the older complete program is restored");
  }
}

/* RT-031: a power cut at every operation of a first deploy leaves nothing or the program. */
static void test_first_deploy_power_cut_sweep(void) {
  unsigned long operations;
  unsigned long cut;
  int never_garbage = 1;
  int saw_empty = 0;
  int saw_program = 0;
  size_t restored = 0U;

  printf("\n=== Test: a power cut at every operation of a first deploy leaves nothing or the program (RT-031) ===\n");
  build(expect_b, 3100U, 9U);
  CHECK(fresh_root() == 0, "a clean store");
  zplc_hal_persist_test_fail_at(0UL);
  CHECK(commit(expect_b, 3100U) == ZPLC_PROGRAM_STORE_COMMIT_OK, "the deploy, uninterrupted");
  operations = zplc_hal_persist_test_operation_count();
  CHECK(operations > 8UL, "it is many persistence operations (payload chunks, records, reads back)");

  for (cut = 1UL; cut <= operations; cut++) {
    zplc_program_store_restore_t result;

    if (fresh_root() != 0) {
      never_garbage = 0;
      break;
    }
    zplc_hal_persist_test_power_cut_at(cut);
    (void)commit(expect_b, 3100U);
    zplc_hal_persist_test_fail_at(0UL); /* the next boot */
    result = restore(&restored);
    if (result == ZPLC_PROGRAM_STORE_EMPTY) {
      saw_empty = 1;
    } else if (result == ZPLC_PROGRAM_STORE_OK && restored == 3100U &&
               memcmp(workspace, expect_b, 3100U) == 0) {
      saw_program = 1;
    } else {
      never_garbage = 0;
      fprintf(stderr, "first deploy cut at operation %lu restored result %d size %zu\n", cut, (int)result,
              restored);
    }
  }
  CHECK(never_garbage, "every cut leaves an empty store or exactly the new program, never anything else");
  CHECK(saw_empty && saw_program, "and both outcomes occur (before and after the active record)");
}

/* RT-031: a power cut at every operation of a redeploy leaves the old program or the new. */
static void test_redeploy_power_cut_sweep(void) {
  unsigned long operations;
  unsigned long cut;
  int only_old_or_new = 1;
  int saw_old = 0;
  int saw_new = 0;
  int went_back = 0;
  size_t restored = 0U;
  const size_t old_size = 2700U;
  const size_t new_size = 3900U;

  printf("\n=== Test: a power cut at every operation of a redeploy leaves the old program or the new (RT-031) ===\n");
  build(expect_a, old_size, 11U);
  build(expect_b, new_size, 12U);
  CHECK(fresh_root() == 0 && commit(expect_a, old_size) == 0, "the old program is stored");
  zplc_hal_persist_test_fail_at(0UL);
  CHECK(commit(expect_b, new_size) == ZPLC_PROGRAM_STORE_COMMIT_OK, "the redeploy, uninterrupted");
  operations = zplc_hal_persist_test_operation_count();
  CHECK(operations > 10UL, "it is many persistence operations");

  for (cut = 1UL; cut <= operations; cut++) {
    int is_new;
    int is_old;
    zplc_program_store_restore_t result;

    if (fresh_root() != 0 || commit(expect_a, old_size) != 0) {
      only_old_or_new = 0;
      break;
    }
    zplc_hal_persist_test_power_cut_at(cut);
    (void)commit(expect_b, new_size);
    zplc_hal_persist_test_fail_at(0UL);
    result = restore(&restored);
    is_new = result == ZPLC_PROGRAM_STORE_OK && restored == new_size &&
             memcmp(workspace, expect_b, new_size) == 0;
    is_old = result == ZPLC_PROGRAM_STORE_OK && restored == old_size &&
             memcmp(workspace, expect_a, old_size) == 0;
    if (!is_new && !is_old) {
      only_old_or_new = 0;
      fprintf(stderr, "redeploy cut at operation %lu restored result %d size %zu\n", cut, (int)result, restored);
    }
    if (is_old) {
      saw_old = 1;
      if (saw_new) {
        went_back = 1;
      }
    }
    if (is_new) {
      saw_new = 1;
    }
  }
  CHECK(only_old_or_new, "every cut leaves exactly the old program or exactly the new one");
  CHECK(saw_old && saw_new, "both occur: the new program appears when the active record was written");
  CHECK(!went_back, "once a cut leaves the new program, every later cut does too");
}

/* RT-031: a write the power cut in the middle never leaves a mixture. */
static void test_torn_write_sweep(void) {
  unsigned long operations;
  unsigned long at;
  unsigned tears = 0U;
  int only_old_or_new = 1;
  size_t restored = 0U;
  const size_t old_size = 2700U;
  const size_t new_size = 3900U;

  printf("\n=== Test: a write the power cut in the middle never leaves a mixture (RT-031) ===\n");
  build(expect_a, old_size, 21U);
  build(expect_b, new_size, 22U);
  CHECK(fresh_root() == 0 && commit(expect_a, old_size) == 0, "the old program is stored");
  zplc_hal_persist_test_fail_at(0UL);
  CHECK(commit(expect_b, new_size) == 0, "the redeploy, uninterrupted");
  operations = zplc_hal_persist_test_operation_count();

  for (at = 1UL; at <= operations; at++) {
    const size_t prefixes[] = {0U, 1U, 7U, 100U, 513U};
    size_t index;

    for (index = 0U; index < sizeof(prefixes) / sizeof(prefixes[0]); index++) {
      int is_new;
      int is_old;
      zplc_program_store_restore_t result;

      if (fresh_root() != 0 || commit(expect_a, old_size) != 0) {
        only_old_or_new = 0;
        break;
      }
      zplc_hal_persist_test_tear_at(at, prefixes[index]);
      (void)commit(expect_b, new_size);
      if (zplc_hal_persist_test_failure_triggered() == 0) {
        zplc_hal_persist_test_fail_at(0UL);
        break; /* operation `at` is not a save: no torn write to try */
      }
      tears++;
      zplc_hal_persist_test_fail_at(0UL);
      result = restore(&restored);
      is_new = result == ZPLC_PROGRAM_STORE_OK && restored == new_size &&
               memcmp(workspace, expect_b, new_size) == 0;
      is_old = result == ZPLC_PROGRAM_STORE_OK && restored == old_size &&
               memcmp(workspace, expect_a, old_size) == 0;
      if (!is_new && !is_old) {
        only_old_or_new = 0;
        fprintf(stderr, "write torn at operation %lu after %zu bytes restored result %d size %zu\n", at,
                prefixes[index], (int)result, restored);
      }
    }
  }
  CHECK(tears > 20U, "many writes were torn (every save, several prefixes each)");
  CHECK(only_old_or_new, "after every torn write the old program or the new one is restored, byte for byte");
}

/* The slot a deploy overwrites held an older program, so a deploy cut in the middle leaves chunks of two programs
 * in it next to the metadata of the older one. It is never restored: the test loses the other program as well, so
 * that the half-written slot is the only candidate left, and then it must be reported as unverifiable (or be exactly
 * one of the two programs, when the cut left it whole). */
/* RT-031: a slot half rewritten is never restored, even when it is all that is left. */
static void test_a_mixture_of_two_programs_is_never_restored(void) {
  const size_t sizes[3] = {2900U, 3300U, 4100U};
  unsigned long operations;
  unsigned long point;
  unsigned variant;
  int never_a_mixture = 1;
  unsigned cases = 0U;
  size_t restored = 0U;

  printf("\n=== Test: a slot half rewritten is never restored, even when it is all that is left (RT-031) ===\n");
  build(expect_a, sizes[0], 51U);
  build(expect_b, sizes[1], 52U);
  CHECK(fresh_root() == 0 && commit(expect_a, sizes[0]) == 0 && commit(expect_b, sizes[1]) == 0,
        "two programs are stored, the second in slot B and active");
  {
    uint8_t third[BUFFER_SIZE];

    build(third, sizes[2], 53U);
    zplc_hal_persist_test_fail_at(0UL);
    CHECK(commit(third, sizes[2]) == 0, "the third deploy, uninterrupted, goes to slot A");
    operations = zplc_hal_persist_test_operation_count();
  }

  for (point = 1UL; point <= operations; point++) {
    for (variant = 0U; variant < 3U; variant++) {
      static uint8_t third[BUFFER_SIZE];
      uint8_t chunk[ZPLC_PROGRAM_STORE_CHUNK_SIZE];
      zplc_program_store_restore_t result;
      int matches_first;
      int matches_third;

      if (fresh_root() != 0 || commit(expect_a, sizes[0]) != 0 || commit(expect_b, sizes[1]) != 0) {
        never_a_mixture = 0;
        break;
      }
      build(third, sizes[2], 53U);
      if (variant == 0U) {
        zplc_hal_persist_test_power_cut_at(point);
      } else {
        zplc_hal_persist_test_tear_at(point, variant == 1U ? 9U : 700U);
      }
      (void)commit(third, sizes[2]);
      if (variant != 0U && zplc_hal_persist_test_failure_triggered() == 0) {
        zplc_hal_persist_test_fail_at(0UL);
        continue; /* not a save */
      }
      zplc_hal_persist_test_fail_at(0UL);
      cases++;

      /* The program that was active is lost: its first chunk and the active record go. */
      memset(chunk, 0x5C, sizeof(chunk));
      (void)write_file("program_v1_slot_b_payload", chunk, sizeof(chunk));
      (void)write_file("program_v1_active", chunk, 16U);

      result = restore(&restored);
      matches_first = result == ZPLC_PROGRAM_STORE_OK && restored == sizes[0] &&
                      memcmp(workspace, expect_a, sizes[0]) == 0;
      matches_third = result == ZPLC_PROGRAM_STORE_OK && restored == sizes[2] &&
                      memcmp(workspace, third, sizes[2]) == 0;
      if (!matches_first && !matches_third && result != ZPLC_PROGRAM_STORE_UNVERIFIABLE) {
        never_a_mixture = 0;
        fprintf(stderr, "variant %u at operation %lu restored result %d size %zu\n", variant, point, (int)result,
                restored);
      }
    }
  }
  CHECK(cases > 40U, "many interrupted deploys were tried (cuts and torn writes at every operation)");
  CHECK(never_a_mixture, "each restored exactly one of the two programs or reported the store unverifiable");
}

static void test_unverifiable_state_is_not_empty(void) {
  size_t restored = 0U;
  uint8_t junk[32];

  printf("\n=== Test: records that verify as nothing are not an empty store ===\n");
  CHECK(fresh_root() == 0, "a clean store");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_EMPTY && restored == 0U, "a store that never held a program is empty");

  memset(junk, 0xCC, sizeof(junk));
  CHECK(write_file("program_v1_slot_a_meta", junk, sizeof(junk)) == 0, "a damaged metadata record exists");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_UNVERIFIABLE, "restore says unverifiable, not empty");
  build(expect_a, 500U, 3U);
  CHECK(commit(expect_a, 500U) == ZPLC_PROGRAM_STORE_COMMIT_ERROR, "and a deploy refuses to write over the evidence");
  CHECK(key_exists("program_v1_slot_a_meta") && !key_exists("program_v1_active"), "which is still there");

  /* A payload with nothing else next to it is an interrupted first deploy, which is an empty store. */
  CHECK(fresh_root() == 0, "a clean store");
  CHECK(write_file("program_v1_slot_a_payload", junk, sizeof(junk)) == 0, "a payload alone");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_EMPTY, "is an empty store");
  CHECK(commit(expect_a, 500U) == ZPLC_PROGRAM_STORE_COMMIT_OK, "and a deploy goes through");
}

static void test_legacy_program(void) {
  size_t restored = 0U;
  uint32_t length = 700U;
  uint8_t length_bytes[4];

  printf("\n=== Test: the single-key program of the first firmware is read and migrated by a commit ===\n");
  CHECK(fresh_root() == 0, "a clean store");
  build(expect_a, 700U, 31U);
  zplc_put_u32_le(length_bytes, length);
  CHECK(write_file("code_len", length_bytes, 4U) == 0 && write_file("code", expect_a, 700U) == 0,
        "the legacy keys hold a program");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_LEGACY && restored == 700U &&
            memcmp(workspace, expect_a, 700U) == 0,
        "restore returns it as legacy");
  CHECK(commit(expect_a, 700U) == ZPLC_PROGRAM_STORE_COMMIT_OK, "committing it migrates it");
  CHECK(!key_exists("code") && !key_exists("code_len"), "and the legacy keys are gone");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == 700U, "after which it restores from a slot");
}

static void test_inadmissible_programs_never_persist(void) {
  size_t restored = 0U;

  printf("\n=== Test: a program the admission check refuses is never written, and never restored ===\n");
  CHECK(fresh_root() == 0, "a clean store");
  build(expect_a, 400U, 41U);
  expect_a[ZPLC_FILE_HEADER_SIZE] = 0xEEU;
  {
    uint32_t crc = zplc_crc32_update(0xFFFFFFFFU, expect_a, 12U);

    crc = zplc_crc32_update(crc, expect_a + 16U, 400U - 16U) ^ 0xFFFFFFFFU;
    zplc_put_u32_le(expect_a + 12U, crc);
  }
  CHECK(commit(expect_a, 400U) == ZPLC_PROGRAM_STORE_COMMIT_ERROR, "the commit is refused");
  CHECK(!key_exists("program_v1_slot_a_payload") && !key_exists("program_v1_active"), "nothing was written");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_EMPTY, "the store is still empty");

  /* A stored program the check no longer admits (a runtime that became stricter) is not restored. */
  CHECK(fresh_root() == 0, "a clean store");
  build(expect_b, 400U, 42U);
  CHECK(commit(expect_b, 400U) == 0, "a good program is stored");
  {
    uint8_t payload[400U + 8U];
    char path[256];
    FILE *file;

    key_path("program_v1_slot_a_payload", path, sizeof(path));
    file = fopen(path, "rb");
    CHECK(file != NULL && fread(payload, 1U, sizeof(payload), file) == sizeof(payload), "the payload is read");
    if (file != NULL) {
      (void)fclose(file);
    }
    payload[ZPLC_FILE_HEADER_SIZE] ^= 0x01U; /* one flipped bit: the CRC-32 of the artifact no longer matches */
    CHECK(write_file("program_v1_slot_a_payload", payload, sizeof(payload)) == 0, "a bit of the payload flips");
  }
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_UNVERIFIABLE && restored == 0U,
        "the damaged program is not restored, and the store says it cannot verify what it holds");
}

/* ------------------------------------------------------------------------- */
/* The rollback found before the upload (WS-42)                                */
/* ------------------------------------------------------------------------- */

enum { STATE_EMPTY, STATE_ONE, STATE_TWO, STATE_ACTIVE_DAMAGED, STATE_NEWER_PAYLOAD_DAMAGED, STATE_BOTH_DAMAGED,
       STATE_LEGACY, STATE_LEGACY_AND_DAMAGED_V1, STATE_ORPHAN_PAYLOAD, STATE_ONLY_PAYLOAD_DAMAGED, STATE_COUNT };

static int make_state(int state) {
  uint8_t damaged[32];
  uint8_t length[4];

  memset(damaged, 0xCC, sizeof(damaged));
  if (fresh_root() != 0) {
    return -1;
  }
  build(expect_a, 2500U, 51U);
  build(expect_b, 3500U, 52U);
  switch (state) {
  case STATE_EMPTY:
    return 0;
  case STATE_ONE:
    return commit(expect_a, 2500U);
  case STATE_TWO:
    return commit(expect_a, 2500U) == 0 ? commit(expect_b, 3500U) : -1;
  case STATE_ACTIVE_DAMAGED:
    return commit(expect_a, 2500U) == 0 && commit(expect_b, 3500U) == 0
               ? write_file("program_v1_active", damaged, sizeof(damaged))
               : -1;
  case STATE_NEWER_PAYLOAD_DAMAGED:
    return commit(expect_a, 2500U) == 0 && commit(expect_b, 3500U) == 0
               ? write_file("program_v1_slot_b_payload_2", damaged, sizeof(damaged))
               : -1;
  case STATE_BOTH_DAMAGED:
    return write_file("program_v1_slot_a_meta", damaged, sizeof(damaged));
  case STATE_LEGACY:
    zplc_put_u32_le(length, 2500U);
    return write_file("code_len", length, 4U) == 0 && write_file("code", expect_a, 2500U) == 0 ? 0 : -1;
  case STATE_LEGACY_AND_DAMAGED_V1:
    zplc_put_u32_le(length, 2500U);
    return write_file("code_len", length, 4U) == 0 && write_file("code", expect_a, 2500U) == 0 &&
                   write_file("program_v1_slot_a_meta", damaged, sizeof(damaged)) == 0
               ? 0
               : -1;
  case STATE_ORPHAN_PAYLOAD:
    return write_file("program_v1_slot_a_payload", damaged, sizeof(damaged));
  case STATE_ONLY_PAYLOAD_DAMAGED:
    return commit(expect_a, 2500U) == 0 ? write_file("program_v1_slot_a_payload_1", damaged, sizeof(damaged)) : -1;
  default:
    return -1;
  }
}

/* The commit that finds its rollback at the start of the upload is the commit that finds it at the end of it: the
 * same answer, and the very same bytes in the store, for every state a store can be in. */
static void test_probed_commit_is_the_commit_for_every_state(void) {
  static struct snapshot with_scratch;
  static struct snapshot probed;
  int state;
  int same = 1;
  int same_answer = 1;
  int refused = 0;

  printf("\n=== Test: finding the rollback before the upload gives the commit it would have given (WS-42) ===\n");
  build(candidate, 800U, 61U);
  for (state = 0; state < STATE_COUNT; state++) {
    int plain;
    int early;
    size_t restored_plain = 0U;
    size_t restored_probed = 0U;
    zplc_program_store_restore_t result_plain;
    zplc_program_store_restore_t result_probed;

    CHECK(make_state(state) == 0, "the store is made");
    plain = commit(candidate, 800U);
    CHECK(snapshot_take(&with_scratch) == 0, "its files are read");
    result_plain = restore(&restored_plain);

    CHECK(make_state(state) == 0, "the same store is made again");
    early = probe_then_commit(candidate, 800U);
    CHECK(snapshot_take(&probed) == 0, "its files are read");
    result_probed = restore(&restored_probed);

    if (plain != early || result_plain != result_probed || restored_plain != restored_probed) {
      same_answer = 0;
      fprintf(stderr, "state %d: commit %d / %d, restore %d / %d\n", state, plain, early, (int)result_plain,
              (int)result_probed);
    }
    if (!snapshot_same(&with_scratch, &probed)) {
      same = 0;
      fprintf(stderr, "state %d: the files differ\n", state);
    }
    refused += plain != ZPLC_PROGRAM_STORE_COMMIT_OK;
  }
  CHECK(same_answer, "the commit, and what restore finds afterwards, are the same in every state");
  CHECK(same, "and so are the files of the store, byte for byte");
  CHECK(refused == 2, "two states refuse a deploy (damaged records, and nothing verifiable behind them), the rest take it");
}

static void test_probe_writes_nothing(void) {
  static struct snapshot before;
  static struct snapshot after;
  zplc_pstore_rollback_t rollback;
  int state;
  int unchanged = 1;

  printf("\n=== Test: finding the rollback reads the store and writes nothing (WS-42) ===\n");
  for (state = 0; state < STATE_COUNT; state++) {
    CHECK(make_state(state) == 0, "the store is made");
    CHECK(snapshot_take(&before) == 0, "its files are read");
    zplc_hal_persist_test_fail_at(0UL);
    (void)probe(&rollback);
    CHECK(snapshot_take(&after) == 0, "and again after the probe");
    unchanged = unchanged && snapshot_same(&before, &after);
  }
  CHECK(unchanged, "no file of the store changed in any state");
}

static void test_probed_commit_refuses_a_store_that_changed_since_the_probe(void) {
  static struct snapshot before;
  static struct snapshot after;
  zplc_pstore_rollback_t rollback;
  size_t restored = 0U;

  printf("\n=== Test: a rollback found for another store is not used (WS-42) ===\n");
  build(expect_a, 1200U, 71U);
  build(expect_b, 1700U, 72U);
  CHECK(fresh_root() == 0 && commit(expect_a, 1200U) == 0, "a program is stored");
  CHECK(probe(&rollback) == 0 && rollback.kind == ZPLC_PSTORE_ROLLBACK_SLOT, "its slot is the rollback");

  /* Another deploy goes in between (this is what the single writer of the records does). */
  CHECK(commit(expect_b, 1700U) == 0, "a second deploy commits");
  CHECK(snapshot_take(&before) == 0, "the files are read");
  CHECK(commit_probed(&rollback, expect_a, 1200U) == ZPLC_PROGRAM_STORE_COMMIT_ERROR,
        "the old answer is refused");
  CHECK(snapshot_take(&after) == 0 && snapshot_same(&before, &after), "and nothing was written");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == 1700U && memcmp(workspace, expect_b, 1700U) == 0,
        "the program of the second deploy is the one stored");

  /* A new answer is the right one. */
  CHECK(probe(&rollback) == 0 && commit_probed(&rollback, expect_a, 1200U) == ZPLC_PROGRAM_STORE_COMMIT_OK,
        "a rollback found again is accepted");
  /* An answer is for one commit: after it the records are another's, and the digest says so. */
  CHECK(commit_probed(&rollback, expect_b, 1700U) == ZPLC_PROGRAM_STORE_COMMIT_ERROR, "and used once");
}

static void test_a_store_that_cannot_be_verified_gives_no_rollback(void) {
  static struct snapshot before;
  static struct snapshot after;
  zplc_pstore_rollback_t rollback;
  zplc_pstore_rollback_t none;

  printf("\n=== Test: records that verify as nothing give no rollback, and a commit does not write (WS-42) ===\n");
  memset(&none, 0, sizeof(none));
  build(candidate, 500U, 81U);
  CHECK(make_state(STATE_BOTH_DAMAGED) == 0, "a store with a damaged record and nothing behind it");
  CHECK(snapshot_take(&before) == 0, "its files are read");
  CHECK(probe(&rollback) == ZPLC_PROGRAM_STORE_COMMIT_ERROR && rollback.kind == ZPLC_PSTORE_ROLLBACK_NONE,
        "the probe finds no rollback");
  CHECK(commit_probed(&rollback, candidate, 500U) == ZPLC_PROGRAM_STORE_COMMIT_ERROR, "a commit with it refuses");
  CHECK(commit_probed(&none, candidate, 500U) == ZPLC_PROGRAM_STORE_COMMIT_ERROR,
        "so does a commit with no answer at all (a zeroed one)");
  CHECK(snapshot_take(&after) == 0 && snapshot_same(&before, &after), "and the evidence is still there");

  /* An answer that says nothing was found is never used, even for a store whose records are what it was read from. */
  CHECK(fresh_root() == 0 && probe(&rollback) == 0 && rollback.kind == ZPLC_PSTORE_ROLLBACK_EMPTY,
        "an empty store has an empty rollback");
  rollback.kind = ZPLC_PSTORE_ROLLBACK_NONE;
  CHECK(commit_probed(&rollback, candidate, 500U) == ZPLC_PROGRAM_STORE_COMMIT_ERROR,
        "and 'nothing found' is refused by its kind, not by the records");
  CHECK(!key_exists("program_v1_slot_a_payload") && !key_exists("program_v1_active"), "nothing was written");
}

/* RT-031 with the rollback found at the start of the upload: a power cut at every operation leaves the old program or the new. */
static void test_probed_redeploy_power_cut_sweep(void) {
  unsigned long operations;
  unsigned long cut;
  int only_old_or_new = 1;
  int saw_old = 0;
  int saw_new = 0;
  int went_back = 0;
  size_t restored = 0U;
  const size_t old_size = 2700U;
  const size_t new_size = 3900U;

  printf("\n=== Test: a power cut at every operation of a probed redeploy leaves the old program or the new (RT-031) ===\n");
  build(expect_a, old_size, 11U);
  build(expect_b, new_size, 12U);
  CHECK(fresh_root() == 0 && commit(expect_a, old_size) == 0, "the old program is stored");
  zplc_hal_persist_test_fail_at(0UL);
  CHECK(probe_then_commit(expect_b, new_size) == ZPLC_PROGRAM_STORE_COMMIT_OK, "the redeploy, uninterrupted");
  operations = zplc_hal_persist_test_operation_count();
  CHECK(operations > 10UL, "it is many persistence operations");

  for (cut = 1UL; cut <= operations; cut++) {
    int is_new;
    int is_old;
    zplc_program_store_restore_t result;

    if (fresh_root() != 0 || commit(expect_a, old_size) != 0) {
      only_old_or_new = 0;
      break;
    }
    zplc_hal_persist_test_power_cut_at(cut);
    (void)probe_then_commit(expect_b, new_size);
    zplc_hal_persist_test_fail_at(0UL);
    result = restore(&restored);
    is_new = result == ZPLC_PROGRAM_STORE_OK && restored == new_size && memcmp(workspace, expect_b, new_size) == 0;
    is_old = result == ZPLC_PROGRAM_STORE_OK && restored == old_size && memcmp(workspace, expect_a, old_size) == 0;
    if (!is_new && !is_old) {
      only_old_or_new = 0;
      fprintf(stderr, "probed redeploy cut at operation %lu restored result %d size %zu\n", cut, (int)result,
              restored);
    }
    if (is_old) {
      saw_old = 1;
      went_back = went_back || saw_new;
    }
    saw_new = saw_new || is_new;
  }
  CHECK(only_old_or_new, "every cut leaves exactly the old program or exactly the new one");
  CHECK(saw_old && saw_new, "both occur");
  CHECK(!went_back, "once a cut leaves the new program, every later cut does too");
}

/* The same, with a torn write: every save of the deploy cut in the middle. */
static void test_probed_torn_write_sweep(void) {
  unsigned long operations;
  unsigned long at;
  unsigned tears = 0U;
  int only_old_or_new = 1;
  size_t restored = 0U;
  const size_t old_size = 2700U;
  const size_t new_size = 3900U;

  printf("\n=== Test: a torn write at every save of a probed redeploy leaves the old program or the new (RT-031) ===\n");
  build(expect_a, old_size, 21U);
  build(expect_b, new_size, 22U);
  CHECK(fresh_root() == 0 && commit(expect_a, old_size) == 0, "the old program is stored");
  zplc_hal_persist_test_fail_at(0UL);
  CHECK(probe_then_commit(expect_b, new_size) == 0, "the redeploy, uninterrupted");
  operations = zplc_hal_persist_test_operation_count();

  for (at = 1UL; at <= operations; at++) {
    const size_t prefixes[] = {0U, 1U, 7U, 100U, 513U};
    size_t index;

    for (index = 0U; index < sizeof(prefixes) / sizeof(prefixes[0]); index++) {
      zplc_program_store_restore_t result;
      int is_new;
      int is_old;

      if (fresh_root() != 0 || commit(expect_a, old_size) != 0) {
        only_old_or_new = 0;
        break;
      }
      zplc_hal_persist_test_tear_at(at, prefixes[index]);
      (void)probe_then_commit(expect_b, new_size);
      if (zplc_hal_persist_test_failure_triggered() == 0) {
        zplc_hal_persist_test_fail_at(0UL);
        break; /* operation `at` is not a save: no torn write to try */
      }
      tears++;
      zplc_hal_persist_test_fail_at(0UL);
      result = restore(&restored);
      is_new = result == ZPLC_PROGRAM_STORE_OK && restored == new_size && memcmp(workspace, expect_b, new_size) == 0;
      is_old = result == ZPLC_PROGRAM_STORE_OK && restored == old_size && memcmp(workspace, expect_a, old_size) == 0;
      if (!is_new && !is_old) {
        only_old_or_new = 0;
        fprintf(stderr, "write torn at operation %lu after %zu bytes restored result %d size %zu\n", at,
                prefixes[index], (int)result, restored);
      }
    }
  }
  CHECK(tears > 20U, "many writes were torn (every save, several prefixes each)");
  CHECK(only_old_or_new, "after every torn write the old program or the new one is restored, byte for byte");
}

static void test_the_legacy_rollback_comes_with_the_restore(void) {
  zplc_pstore_config_t c = probed_config();
  zplc_pstore_rollback_t rollback;
  size_t restored = 0U;

  printf("\n=== Test: the program of the first firmware is its own rollback when it migrates (WS-42) ===\n");
  CHECK(make_state(STATE_LEGACY) == 0, "a store that holds the single-key program");
  memset(workspace, 0x5A, sizeof(workspace));
  CHECK(zplc_pstore_restore_probed(&c, workspace, sizeof(workspace), &restored, &rollback) ==
                ZPLC_PROGRAM_STORE_LEGACY &&
            restored == 2500U && rollback.kind == ZPLC_PSTORE_ROLLBACK_LEGACY,
        "restore returns it with its rollback");
  CHECK(zplc_pstore_commit_probed(&c, &rollback, workspace, 2500U, sizeof(workspace)) ==
            ZPLC_PROGRAM_STORE_COMMIT_OK,
        "committing it migrates it with no scratch");
  CHECK(!key_exists("code") && !key_exists("code_len"), "and the legacy keys are gone");
  CHECK(restore(&restored) == ZPLC_PROGRAM_STORE_OK && restored == 2500U, "after which it restores from a slot");

  /* Any other result leaves no answer: the upload finds its own. */
  CHECK(zplc_pstore_restore_probed(&c, workspace, sizeof(workspace), &restored, &rollback) ==
                ZPLC_PROGRAM_STORE_OK &&
            rollback.kind == ZPLC_PSTORE_ROLLBACK_NONE,
        "a restore of a slot gives none");
}

int main(void) {
  root[0] = '\0';
  test_sizes_round_trip();
  test_largest_artifact_is_the_code_size();
  test_store_of_the_first_version_is_read();
  test_a_to_b_and_back();
  test_first_deploy_power_cut_sweep();
  test_redeploy_power_cut_sweep();
  test_torn_write_sweep();
  test_a_mixture_of_two_programs_is_never_restored();
  test_unverifiable_state_is_not_empty();
  test_legacy_program();
  test_inadmissible_programs_never_persist();
  test_probed_commit_is_the_commit_for_every_state();
  test_probe_writes_nothing();
  test_probed_commit_refuses_a_store_that_changed_since_the_probe();
  test_a_store_that_cannot_be_verified_gives_no_rollback();
  test_probed_redeploy_power_cut_sweep();
  test_probed_torn_write_sweep();
  test_the_legacy_rollback_comes_with_the_restore();
  remove_root();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
