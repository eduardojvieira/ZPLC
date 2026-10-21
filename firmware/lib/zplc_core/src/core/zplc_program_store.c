/**
 * @file zplc_program_store.c
 * @brief The durable program store shared by the host and the target (RT-032). See zplc_program_store.h.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_program_store.h"

#include <string.h>

#include "zplc_bytes.h"
#include "zplc_crc32.h"
#include "zplc_hal.h"
#include "zplc_loader.h"

#define STORE_ACTIVE "program_v1_active"
#define STORE_LEGACY_CODE "code"
#define STORE_LEGACY_LEN "code_len"
#define STORE_META_SIZE 32U
#define STORE_ACTIVE_SIZE 16U
#define STORE_SLOT_PREPARED 1U
#define STORE_SLOT_COMMITTED 2U
#define STORE_FORMAT_VERSION 1U

/* The magic words of the three record kinds, as bytes: a string literal copied with memcpy has no terminator. */
static const uint8_t META_MAGIC[4] = {'Z', 'P', 'S', '1'};
static const uint8_t ACTIVE_MAGIC[4] = {'Z', 'P', 'A', '1'};
static const uint8_t FOOTER_MAGIC[4] = {'Z', 'P', 'E', '1'};

static const char *const payload_keys[] = {"program_v1_slot_a_payload", "program_v1_slot_b_payload"};
static const char *const meta_keys[] = {"program_v1_slot_a_meta", "program_v1_slot_b_meta"};

/* ----------------------------------------------------------------------------
 * Payload chunks
 * ----------------------------------------------------------------------------
 */

/* Chunk 0 is the key of the first version of the store; chunk N is that key, "_" and N in decimal. */
static void payload_key(unsigned slot, size_t chunk, char *out) {
  const char *base = payload_keys[slot];
  size_t length = strlen(base);
  char digits[12];
  size_t count = 0U;

  memcpy(out, base, length);
  if (chunk != 0U) {
    out[length++] = '_';
    while (chunk != 0U) {
      digits[count++] = (char)('0' + (chunk % 10U));
      chunk /= 10U;
    }
    while (count != 0U) {
      out[length++] = digits[--count];
    }
  }
  out[length] = '\0';
}

static zplc_hal_result_t payload_save(unsigned slot, const uint8_t *data, size_t total) {
  size_t offset;
  size_t chunk = 0U;

  for (offset = 0U; offset < total; offset += ZPLC_PROGRAM_STORE_CHUNK_SIZE) {
    const size_t remaining = total - offset;
    const size_t length = remaining < ZPLC_PROGRAM_STORE_CHUNK_SIZE ? remaining : ZPLC_PROGRAM_STORE_CHUNK_SIZE;
    char key[ZPLC_PROGRAM_STORE_KEY_MAX];
    zplc_hal_result_t result;

    payload_key(slot, chunk++, key);
    result = zplc_hal_persist_save(key, data + offset, length);
    if (result != ZPLC_HAL_OK) {
      return result;
    }
  }
  return ZPLC_HAL_OK;
}

static int footer_is(const uint8_t *buffer, size_t length) {
  return memcmp(buffer + length, FOOTER_MAGIC, sizeof(FOOTER_MAGIC)) == 0 && zplc_get_u32_le(buffer + length + 4U) == length;
}

/* Loads the payload of a slot into buffer (total bytes, zeroed first by the caller).
 *
 * Chunk 0 is read asking for the whole payload: a store written by the first version holds the payload in that one
 * key, whatever its length, and a chunked payload leaves the rest of the buffer untouched. When the footer is not
 * where the length says, the other chunks are read. A key that is absent or damaged is the result of that key. */
static zplc_hal_result_t payload_load(unsigned slot, uint8_t *buffer, size_t total) {
  const size_t length = total - ZPLC_PROGRAM_STORE_FOOTER_SIZE;
  char key[ZPLC_PROGRAM_STORE_KEY_MAX];
  zplc_hal_result_t result;
  size_t offset;
  size_t chunk = 1U;

  payload_key(slot, 0U, key);
  result = zplc_hal_persist_load(key, buffer, total);
  if (result != ZPLC_HAL_OK) {
    return result;
  }
  if (total <= ZPLC_PROGRAM_STORE_CHUNK_SIZE || footer_is(buffer, length)) {
    return ZPLC_HAL_OK;
  }
  for (offset = ZPLC_PROGRAM_STORE_CHUNK_SIZE; offset < total; offset += ZPLC_PROGRAM_STORE_CHUNK_SIZE) {
    const size_t remaining = total - offset;
    const size_t piece = remaining < ZPLC_PROGRAM_STORE_CHUNK_SIZE ? remaining : ZPLC_PROGRAM_STORE_CHUNK_SIZE;

    payload_key(slot, chunk++, key);
    result = zplc_hal_persist_load(key, buffer + offset, piece);
    if (result != ZPLC_HAL_OK) {
      return result;
    }
  }
  return ZPLC_HAL_OK;
}

/* ----------------------------------------------------------------------------
 * Records
 * ----------------------------------------------------------------------------
 */

static int admits(const zplc_pstore_config_t *config, const uint8_t *program, size_t length) {
  return config->admit(program, length, config->admit_context) == 0;
}

static int absent_or_corrupt(zplc_hal_result_t result) { return result == ZPLC_HAL_NOT_IMPL || result == ZPLC_HAL_CORRUPT; }

static int valid_meta(const uint8_t meta[STORE_META_SIZE], unsigned slot, int allow_prepared, uint32_t *generation, uint32_t *length,
                      uint32_t *file_crc) {
  const uint8_t state = meta[7];

  if (memcmp(meta, META_MAGIC, sizeof(META_MAGIC)) != 0 || zplc_get_u16_le(meta + 4U) != STORE_FORMAT_VERSION || meta[6] != slot ||
      (state != STORE_SLOT_COMMITTED && (allow_prepared == 0 || state != STORE_SLOT_PREPARED)) || zplc_get_u32_le(meta + 8U) == 0U ||
      zplc_get_u32_le(meta + 12U) == 0U || zplc_get_u32_le(meta + 12U) > ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE ||
      zplc_get_u16_le(meta + 20U) != ZPLC_VERSION_MAJOR || zplc_get_u16_le(meta + 22U) != ZPLC_VERSION_MINOR ||
      zplc_get_u32_le(meta + 24U) != 0U || zplc_get_u32_le(meta + 28U) != zplc_crc32(meta, 28U)) {
    return 0;
  }
  *generation = zplc_get_u32_le(meta + 8U);
  *length = zplc_get_u32_le(meta + 12U);
  if (file_crc != NULL) {
    *file_crc = zplc_get_u32_le(meta + 16U);
  }
  return 1;
}

/* 0: a valid record; 1: absent or invalid; -1: the backend failed. */
static int read_meta(unsigned slot, int allow_prepared, uint32_t *generation, uint32_t *length, uint32_t *file_crc) {
  uint8_t meta[STORE_META_SIZE];
  zplc_hal_result_t result;

  memset(meta, 0, sizeof(meta));
  result = zplc_hal_persist_load(meta_keys[slot], meta, sizeof(meta));
  if (absent_or_corrupt(result)) {
    return 1;
  }
  if (result != ZPLC_HAL_OK) {
    return -1;
  }
  return valid_meta(meta, slot, allow_prepared, generation, length, file_crc) ? 0 : 1;
}

static int read_active(unsigned *slot, uint32_t *generation) {
  uint8_t active[STORE_ACTIVE_SIZE];
  zplc_hal_result_t result;

  memset(active, 0, sizeof(active));
  result = zplc_hal_persist_load(STORE_ACTIVE, active, sizeof(active));
  if (absent_or_corrupt(result)) {
    return 1;
  }
  if (result != ZPLC_HAL_OK) {
    return -1;
  }
  if (memcmp(active, ACTIVE_MAGIC, sizeof(ACTIVE_MAGIC)) != 0 || zplc_get_u16_le(active + 4U) != STORE_FORMAT_VERSION || active[6] > 1U ||
      active[7] != 0U || zplc_get_u32_le(active + 8U) == 0U || zplc_get_u32_le(active + 12U) != zplc_crc32(active, 12U)) {
    return 1;
  }
  *slot = active[6];
  *generation = zplc_get_u32_le(active + 8U);
  return 0;
}

static void make_meta(uint8_t meta[STORE_META_SIZE], unsigned slot, uint8_t state, uint32_t generation, const uint8_t *program,
                      size_t length) {
  memset(meta, 0, STORE_META_SIZE);
  memcpy(meta, META_MAGIC, sizeof(META_MAGIC));
  zplc_put_u16_le(meta + 4U, STORE_FORMAT_VERSION);
  meta[6] = (uint8_t)slot;
  meta[7] = state;
  zplc_put_u32_le(meta + 8U, generation);
  zplc_put_u32_le(meta + 12U, (uint32_t)length);
  zplc_put_u32_le(meta + 16U, zplc_get_u32_le(program + 12U));
  zplc_put_u16_le(meta + 20U, ZPLC_VERSION_MAJOR);
  zplc_put_u16_le(meta + 22U, ZPLC_VERSION_MINOR);
  zplc_put_u32_le(meta + 28U, zplc_crc32(meta, 28U));
}

static void make_active(uint8_t active[STORE_ACTIVE_SIZE], unsigned slot, uint32_t generation) {
  memset(active, 0, STORE_ACTIVE_SIZE);
  memcpy(active, ACTIVE_MAGIC, sizeof(ACTIVE_MAGIC));
  zplc_put_u16_le(active + 4U, STORE_FORMAT_VERSION);
  active[6] = (uint8_t)slot;
  zplc_put_u32_le(active + 8U, generation);
  zplc_put_u32_le(active + 12U, zplc_crc32(active, 12U));
}

/* Serial-number arithmetic: the generation wraps, and 0 is never a generation. */
static int generation_is_newer(uint32_t candidate, uint32_t current) { return candidate != current && candidate - current < 0x80000000U; }

/* 0: the slot holds a program that its record and the admission check accept; 1: it does not; -1: backend failure.
 * The buffer needs length + footer bytes; it is cleared first so that a short read cannot pass for a long one. */
static int read_slot(const zplc_pstore_config_t *config, unsigned slot, int allow_prepared, uint8_t *buffer, size_t capacity,
                     size_t *program_size, uint32_t *generation) {
  uint32_t length;
  uint32_t header_crc;
  int result = read_meta(slot, allow_prepared, generation, &length, &header_crc);
  zplc_hal_result_t load;

  if (result != 0) {
    return result;
  }
  if (length < ZPLC_FILE_HEADER_SIZE || length > capacity - ZPLC_PROGRAM_STORE_FOOTER_SIZE) {
    return 1;
  }
  memset(buffer, 0, (size_t)length + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  load = payload_load(slot, buffer, (size_t)length + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  if (absent_or_corrupt(load)) {
    return 1;
  }
  if (load != ZPLC_HAL_OK) {
    return -1;
  }
  if (!footer_is(buffer, length) || zplc_get_u32_le(buffer + 12U) != header_crc || !admits(config, buffer, length)) {
    return 1;
  }
  *program_size = length;
  return 0;
}

/* Returns 0 for a valid legacy rollback, 1 when it is unavailable or corrupt, and -1 for an I/O failure that must
 * stop a commit before it mutates the store. */
static int legacy_rollback_available(const zplc_pstore_config_t *config) {
  uint32_t legacy_length = 0U;
  zplc_hal_result_t result;

  result = zplc_hal_persist_load(STORE_LEGACY_LEN, &legacy_length, sizeof(legacy_length));
  if (absent_or_corrupt(result)) {
    return 1;
  }
  if (result != ZPLC_HAL_OK) {
    return -1;
  }
  if (legacy_length < ZPLC_FILE_HEADER_SIZE || legacy_length > config->scratch_capacity - ZPLC_PROGRAM_STORE_FOOTER_SIZE ||
      legacy_length > ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE) {
    return 1;
  }
  memset(config->scratch, 0, legacy_length);
  result = zplc_hal_persist_load(STORE_LEGACY_CODE, config->scratch, legacy_length);
  if (absent_or_corrupt(result)) {
    return 1;
  }
  if (result != ZPLC_HAL_OK) {
    return -1;
  }
  return admits(config, config->scratch, legacy_length) ? 0 : 1;
}

/* A record that exists but cannot form a verified rollback is not bootstrap. Probing one byte is enough to
 * distinguish an absent key from durable state; a damaged one still counts as durable evidence. */
static int durable_record_exists(const char *key) {
  uint8_t probe = 0U;
  zplc_hal_result_t result = zplc_hal_persist_load(key, &probe, sizeof(probe));

  if (result == ZPLC_HAL_NOT_IMPL) {
    return 0;
  }
  if (result == ZPLC_HAL_OK || result == ZPLC_HAL_CORRUPT) {
    return 1;
  }
  return -1;
}

/* Durable evidence of a program: an active record, a metadata record or the legacy keys, valid or not. A payload
 * with none of them next to it is not: the metadata is written after the payload, so it is an interrupted first
 * publication, nothing that was ever the program to restore and nothing a new commit could destroy. */
static int durable_state_exists(void) {
  static const char *const record_keys[] = {
      STORE_ACTIVE, "program_v1_slot_a_meta", "program_v1_slot_b_meta", STORE_LEGACY_LEN, STORE_LEGACY_CODE,
  };
  size_t index;

  for (index = 0U; index < sizeof(record_keys) / sizeof(record_keys[0]); ++index) {
    int exists = durable_record_exists(record_keys[index]);

    if (exists != 0) {
      return exists;
    }
  }
  return 0;
}

/* A stale active record may name a corrupt payload. Its generation still fences a PREPARED replacement: otherwise
 * an interrupted C could look like the old active B after restart. */
static int highest_structural_generation(uint32_t *generation) {
  unsigned active_slot;
  uint32_t candidate;
  uint32_t length;
  int active;
  int meta;

  active = read_active(&active_slot, &candidate);
  if (active < 0) {
    return -1;
  }
  if (active == 0) {
    *generation = candidate;
  }
  meta = read_meta(0U, 1, &candidate, &length, NULL);
  if (meta < 0) {
    return -1;
  }
  if (meta == 0 && (*generation == 0U || generation_is_newer(candidate, *generation))) {
    *generation = candidate;
  }
  meta = read_meta(1U, 1, &candidate, &length, NULL);
  if (meta < 0) {
    return -1;
  }
  if (meta == 0 && (*generation == 0U || generation_is_newer(candidate, *generation))) {
    *generation = candidate;
  }
  return 0;
}

/* Determine a real rollback before writing C. Returns 0 with a v1 slot, 1 for an unequivocally empty store, 2 for a
 * verified legacy rollback, and -1 for I/O or corruption states that must fail closed. */
static int discover_rollback_slot(const zplc_pstore_config_t *config, unsigned *slot, uint32_t *generation) {
  unsigned active_slot;
  uint32_t active_generation;
  uint32_t generation_a = 0U;
  uint32_t generation_b = 0U;
  size_t length;
  int active;
  int a;
  int b;
  int legacy;

  active = read_active(&active_slot, &active_generation);
  if (active < 0) {
    return -1;
  }
  if (active == 0) {
    a = read_slot(config, active_slot, 1, config->scratch, config->scratch_capacity, &length, &generation_a);
    if (a < 0) {
      return -1;
    }
    if (a == 0 && generation_a == active_generation) {
      *slot = active_slot;
      *generation = active_generation;
      return 0;
    }
  }

  a = read_slot(config, 0U, 0, config->scratch, config->scratch_capacity, &length, &generation_a);
  b = read_slot(config, 1U, 0, config->scratch, config->scratch_capacity, &length, &generation_b);
  if (a < 0 || b < 0) {
    return -1;
  }
  if (a == 0 || b == 0) {
    if (b == 0 && (a != 0 || generation_is_newer(generation_b, generation_a))) {
      *slot = 1U;
      *generation = generation_b;
    } else {
      *slot = 0U;
      *generation = generation_a;
    }
    return 0;
  }

  legacy = legacy_rollback_available(config);
  if (legacy < 0) {
    return -1;
  }
  if (legacy == 0) {
    return 2;
  }
  return durable_state_exists() == 0 ? 1 : -1;
}

/* ----------------------------------------------------------------------------
 * Commit
 * ----------------------------------------------------------------------------
 */

/* What a commit does once it knows which slot is the rollback: write the new program to the other slot (or slot 0
 * when there is none), read it back, verify it, prepare, publish, commit the metadata. `current` is the result of
 * discover_rollback_slot() (0: a v1 slot, with its number and generation; 1: an empty store; 2: a verified legacy
 * program). The caller has admitted the artifact. */
static int commit_after_discovery(const zplc_pstore_config_t *config, int current, unsigned prior_slot, uint32_t generation,
                                  uint8_t *workspace, size_t program_size) {
  uint8_t meta[STORE_META_SIZE];
  uint8_t active[STORE_ACTIVE_SIZE];
  unsigned slot;
  uint32_t expected_header_crc;
  size_t total;
  zplc_hal_result_t result;

  if (highest_structural_generation(&generation) != 0) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }
  slot = current == 0 ? prior_slot ^ 1U : 0U;
  generation = generation == UINT32_MAX ? 1U : generation + 1U;
  expected_header_crc = zplc_get_u32_le(workspace + 12U);
  total = program_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE;

  memcpy(workspace + program_size, FOOTER_MAGIC, sizeof(FOOTER_MAGIC));
  zplc_put_u32_le(workspace + program_size + 4U, (uint32_t)program_size);
  result = payload_save(slot, workspace, total);
  if (result != ZPLC_HAL_OK) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }
  memset(workspace, 0, total);
  result = payload_load(slot, workspace, total);
  if (result != ZPLC_HAL_OK || !footer_is(workspace, program_size) || zplc_get_u32_le(workspace + 12U) != expected_header_crc ||
      !admits(config, workspace, program_size)) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }

  make_meta(meta, slot, STORE_SLOT_PREPARED, generation, workspace, program_size);
  result = zplc_hal_persist_save(meta_keys[slot], meta, sizeof(meta));
  if (result != ZPLC_HAL_OK) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }
  {
    uint8_t check[STORE_META_SIZE];

    memset(check, 0, sizeof(check));
    result = zplc_hal_persist_load(meta_keys[slot], check, sizeof(check));
    if (result != ZPLC_HAL_OK || memcmp(meta, check, sizeof(meta)) != 0) {
      return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
    }
  }

  make_active(active, slot, generation);
  result = zplc_hal_persist_save(STORE_ACTIVE, active, sizeof(active));
  if (result == ZPLC_HAL_COMMIT_UNKNOWN) {
    return ZPLC_PROGRAM_STORE_COMMIT_UNKNOWN;
  }
  if (result != ZPLC_HAL_OK) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }

  make_meta(meta, slot, STORE_SLOT_COMMITTED, generation, workspace, program_size);
  if (zplc_hal_persist_save(meta_keys[slot], meta, sizeof(meta)) != ZPLC_HAL_OK) {
    zplc_hal_log("[STORE] Metadata commit deferred after active publish\n");
  }
  (void)zplc_hal_persist_delete(STORE_LEGACY_LEN);
  (void)zplc_hal_persist_delete(STORE_LEGACY_CODE);
  return ZPLC_PROGRAM_STORE_COMMIT_OK;
}

static int artifact_fits(size_t program_size, size_t workspace_capacity) {
  return program_size != 0U && program_size <= ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE &&
         workspace_capacity >= ZPLC_PROGRAM_STORE_FOOTER_SIZE && program_size <= workspace_capacity - ZPLC_PROGRAM_STORE_FOOTER_SIZE &&
         program_size >= ZPLC_FILE_HEADER_SIZE;
}

int zplc_pstore_commit(const zplc_pstore_config_t *config, uint8_t *workspace, size_t program_size, size_t workspace_capacity) {
  uint32_t generation = 0U;
  unsigned prior_slot = 0U;
  int current;

  if (config == NULL || config->admit == NULL || config->scratch == NULL ||
      config->scratch_capacity < ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE || workspace == NULL ||
      !artifact_fits(program_size, workspace_capacity) || !admits(config, workspace, program_size)) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }

  current = discover_rollback_slot(config, &prior_slot, &generation);
  if (current < 0) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }
  return commit_after_discovery(config, current, prior_slot, generation, workspace, program_size);
}

/* ----------------------------------------------------------------------------
 * The rollback found before the upload
 * ----------------------------------------------------------------------------
 */

/* A digest of everything discover_rollback_slot() reads from the store that is not a payload: the active record,
 * both metadata records, the length key of the first version, and what the backend answered for each of those and
 * for the program key of the first version. Two equal digests mean that no record changed in between, which is all a
 * commit can be disturbed by (it is the only writer). A record carries its own CRC-32, so a CRC-32 over the records
 * would be the same for every valid one: the digest is FNV-1a. */
static int records_digest(uint32_t *digest) {
  static const char *const keys[] = {STORE_ACTIVE, "program_v1_slot_a_meta", "program_v1_slot_b_meta", STORE_LEGACY_LEN, STORE_LEGACY_CODE};
  uint32_t hash = 2166136261U;
  size_t index;

  for (index = 0U; index < sizeof(keys) / sizeof(keys[0]); index++) {
    uint8_t record[STORE_META_SIZE + 1U];
    size_t byte;
    zplc_hal_result_t result;

    memset(record, 0, sizeof(record));
    /* The last key is the whole program of the first version: it is asked for one byte, which says that it is there
     * (an answer of "too large" is that too) and does not need a buffer of its size. */
    result = zplc_hal_persist_load(keys[index], record + 1U, index + 1U < sizeof(keys) / sizeof(keys[0]) ? STORE_META_SIZE : 1U);
    if (result != ZPLC_HAL_OK && !absent_or_corrupt(result)) {
      return -1;
    }
    record[0] = (uint8_t)result;
    for (byte = 0U; byte < sizeof(record); byte++) {
      hash = (hash ^ record[byte]) * 16777619U;
    }
  }
  *digest = hash;
  return 0;
}

static void rollback_clear(zplc_pstore_rollback_t *rollback) { memset(rollback, 0, sizeof(*rollback)); }

int zplc_pstore_probe(const zplc_pstore_config_t *config, uint8_t *buffer, size_t capacity, zplc_pstore_rollback_t *rollback) {
  zplc_pstore_config_t local;
  unsigned slot = 0U;
  uint32_t generation = 0U;
  int found;

  if (rollback == NULL) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }
  rollback_clear(rollback);
  if (config == NULL || config->admit == NULL || buffer == NULL ||
      capacity < ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }
  local = *config;
  local.scratch = buffer;
  local.scratch_capacity = capacity;
  found = discover_rollback_slot(&local, &slot, &generation);
  if (found < 0 || records_digest(&rollback->digest) != 0) {
    rollback_clear(rollback);
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }
  rollback->kind = found == 0 ? ZPLC_PSTORE_ROLLBACK_SLOT : (found == 1 ? ZPLC_PSTORE_ROLLBACK_EMPTY : ZPLC_PSTORE_ROLLBACK_LEGACY);
  rollback->slot = (uint8_t)slot;
  rollback->generation = generation;
  return 0;
}

zplc_program_store_restore_t zplc_pstore_restore_probed(const zplc_pstore_config_t *config, uint8_t *workspace, size_t workspace_capacity,
                                                        size_t *program_size, zplc_pstore_rollback_t *rollback) {
  zplc_program_store_restore_t result;

  result = zplc_pstore_restore(config, workspace, workspace_capacity, program_size);
  if (rollback != NULL) {
    rollback_clear(rollback);
    /* The program of the first version was read and admitted into the caller's buffer just now: it is the
     * rollback of the commit that migrates it, and nothing else of the store is needed to know that. */
    if (result == ZPLC_PROGRAM_STORE_LEGACY) {
      if (records_digest(&rollback->digest) == 0) {
        rollback->kind = ZPLC_PSTORE_ROLLBACK_LEGACY;
      } else {
        rollback_clear(rollback);
      }
    }
  }
  return result;
}

int zplc_pstore_commit_probed(const zplc_pstore_config_t *config, const zplc_pstore_rollback_t *rollback, uint8_t *workspace,
                              size_t program_size, size_t workspace_capacity) {
  uint32_t digest;
  int current;

  if (config == NULL || config->admit == NULL || rollback == NULL || workspace == NULL ||
      !artifact_fits(program_size, workspace_capacity) || !admits(config, workspace, program_size)) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR;
  }
  if (rollback->kind < ZPLC_PSTORE_ROLLBACK_SLOT || rollback->kind > ZPLC_PSTORE_ROLLBACK_LEGACY) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR; /* nothing was found, or it was found unverifiable: fail closed */
  }
  /* the kinds are in the order of discover_rollback_slot()'s answers: a slot, an empty store, the first version */
  current = (int)rollback->kind - (int)ZPLC_PSTORE_ROLLBACK_SLOT;
  if (records_digest(&digest) != 0 || digest != rollback->digest) {
    return ZPLC_PROGRAM_STORE_COMMIT_ERROR; /* the store changed since the rollback was found */
  }
  return commit_after_discovery(config, current, rollback->slot, rollback->generation, workspace, program_size);
}

/* ----------------------------------------------------------------------------
 * Restore
 * ----------------------------------------------------------------------------
 */

/* A lone valid PREPARED record is an interrupted first publication, not a corrupt active program. It has no
 * resident payload authority at boot. */
static int only_orphan_prepared_slots(void) {
  uint32_t generation;
  uint32_t length;
  unsigned active_slot;
  int active;
  int active_exists;
  int a;
  int b;

  active = read_active(&active_slot, &generation);
  if (active != 1) {
    return active < 0 ? -1 : 0;
  }
  active_exists = durable_record_exists(STORE_ACTIVE);
  if (active_exists < 0) {
    return -1;
  }
  if (active_exists != 0) {
    return 0;
  }
  a = read_meta(0U, 0, &generation, &length, NULL);
  b = read_meta(1U, 0, &generation, &length, NULL);
  if (a < 0 || b < 0) {
    return -1;
  }
  if (a == 0 || b == 0) {
    return 0;
  }
  a = read_meta(0U, 1, &generation, &length, NULL);
  b = read_meta(1U, 1, &generation, &length, NULL);
  if (a < 0 || b < 0) {
    return -1;
  }
  return a == 0 || b == 0;
}

/* Rewrites the records of the slot just restored as the committed ones; a failure is not a restore failure. */
static void repair_records(unsigned slot, uint32_t generation, const uint8_t *program, size_t length) {
  uint8_t active[STORE_ACTIVE_SIZE];
  uint8_t meta[STORE_META_SIZE];

  make_active(active, slot, generation);
  make_meta(meta, slot, STORE_SLOT_COMMITTED, generation, program, length);
  if (zplc_hal_persist_save(STORE_ACTIVE, active, sizeof(active)) != ZPLC_HAL_OK ||
      zplc_hal_persist_save(meta_keys[slot], meta, sizeof(meta)) != ZPLC_HAL_OK) {
    zplc_hal_log("[STORE] Recovery record repair deferred\n");
  }
}

zplc_program_store_restore_t zplc_pstore_restore(const zplc_pstore_config_t *config, uint8_t *workspace, size_t workspace_capacity,
                                                 size_t *program_size) {
  unsigned active_slot;
  uint32_t active_generation;
  uint32_t generation_a = 0U;
  uint32_t generation_b = 0U;
  uint32_t length_a;
  uint32_t length_b;
  uint32_t legacy_length = 0U;
  int active;
  int a;
  int b;
  int result;
  zplc_hal_result_t legacy;
  int orphan_prepared;

  if (config == NULL || config->admit == NULL || workspace == NULL || program_size == NULL ||
      workspace_capacity < ZPLC_PROGRAM_STORE_FOOTER_SIZE) {
    return ZPLC_PROGRAM_STORE_ERROR;
  }
  *program_size = 0U;
  active = read_active(&active_slot, &active_generation);
  if (active < 0) {
    return ZPLC_PROGRAM_STORE_ERROR;
  }
  if (active == 0) {
    result = read_slot(config, active_slot, 1, workspace, workspace_capacity, program_size, &generation_a);
    if (result < 0) {
      return ZPLC_PROGRAM_STORE_ERROR;
    }
    if (result == 0 && generation_a == active_generation) {
      if (config->repair_on_restore != 0U) {
        repair_records(active_slot, generation_a, workspace, *program_size);
      }
      return ZPLC_PROGRAM_STORE_OK;
    }
    *program_size = 0U;
  }
  a = read_meta(0U, 0, &generation_a, &length_a, NULL);
  b = read_meta(1U, 0, &generation_b, &length_b, NULL);
  if (a < 0 || b < 0) {
    return ZPLC_PROGRAM_STORE_ERROR;
  }
  if (a == 0 || b == 0) {
    unsigned slot = (b == 0 && (a != 0 || generation_is_newer(generation_b, generation_a))) ? 1U : 0U;
    uint32_t wanted = slot == 0U ? generation_a : generation_b;

    result = read_slot(config, slot, 0, workspace, workspace_capacity, program_size, &wanted);
    if (result < 0) {
      return ZPLC_PROGRAM_STORE_ERROR;
    }
    if (result == 0) {
      if (config->repair_on_restore != 0U) {
        repair_records(slot, wanted, workspace, *program_size);
      }
      return ZPLC_PROGRAM_STORE_OK;
    }
    /* The other committed slot may still be intact. */
    if (a == 0 && b == 0) {
      slot ^= 1U;
      wanted = slot == 0U ? generation_a : generation_b;
      result = read_slot(config, slot, 0, workspace, workspace_capacity, program_size, &wanted);
      if (result < 0) {
        return ZPLC_PROGRAM_STORE_ERROR;
      }
      if (result == 0) {
        if (config->repair_on_restore != 0U) {
          repair_records(slot, wanted, workspace, *program_size);
        }
        return ZPLC_PROGRAM_STORE_OK;
      }
    }
    *program_size = 0U;
  }

  legacy = zplc_hal_persist_load(STORE_LEGACY_LEN, &legacy_length, sizeof(legacy_length));
  if (legacy == ZPLC_HAL_OK && legacy_length != 0U && legacy_length <= workspace_capacity - ZPLC_PROGRAM_STORE_FOOTER_SIZE &&
      legacy_length <= ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE) {
    memset(workspace, 0, legacy_length);
    legacy = zplc_hal_persist_load(STORE_LEGACY_CODE, workspace, legacy_length);
    if (legacy == ZPLC_HAL_OK && admits(config, workspace, legacy_length)) {
      *program_size = legacy_length;
      return ZPLC_PROGRAM_STORE_LEGACY;
    }
  }
  if (!absent_or_corrupt(legacy) && legacy != ZPLC_HAL_OK) {
    return ZPLC_PROGRAM_STORE_ERROR;
  }
  orphan_prepared = only_orphan_prepared_slots();
  if (orphan_prepared < 0) {
    return ZPLC_PROGRAM_STORE_ERROR;
  }
  if (orphan_prepared != 0) {
    return ZPLC_PROGRAM_STORE_EMPTY;
  }
  /* A blank device is different from durable data that cannot be verified. The boot path must not silently treat
   * the latter as a first boot. */
  return durable_state_exists() == 0 ? ZPLC_PROGRAM_STORE_EMPTY : ZPLC_PROGRAM_STORE_UNVERIFIABLE;
}
