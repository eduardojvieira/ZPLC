#include "program_store.h"

#include <limits.h>
#include <string.h>

#include <zephyr/kernel.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>

#define STORE_ACTIVE "program_v1_active"
#define STORE_LEGACY_CODE "code"
#define STORE_LEGACY_LEN "code_len"
#define STORE_META_SIZE 32U
#define STORE_ACTIVE_SIZE 16U
#define STORE_SLOT_PREPARED 1U
#define STORE_SLOT_COMMITTED 2U

static const char *const payload_keys[] = {"program_v1_slot_a_payload",
                                           "program_v1_slot_b_payload"};
static const char *const meta_keys[] = {"program_v1_slot_a_meta",
                                        "program_v1_slot_b_meta"};

/* This mutex owns complete thread-context store transactions and the verifier
 * scratch, which stays out of target task stacks. */
K_MUTEX_DEFINE(program_store_mutex);
static uint8_t program_store_verify_workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
static zplc_program_view_t program_store_verified_view;
/* The commit mutex owns this second bounded workspace while it verifies a
 * durable rollback artifact without overwriting the incoming candidate. */
static uint8_t program_store_rollback_workspace
    [ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE + ZPLC_PROGRAM_STORE_FOOTER_SIZE];

static uint16_t get_u16(const uint8_t *p) {
  return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}
static uint32_t get_u32(const uint8_t *p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
         ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static void put_u16(uint8_t *p, uint16_t value) {
  p[0] = (uint8_t)value;
  p[1] = (uint8_t)(value >> 8);
}
static void put_u32(uint8_t *p, uint32_t value) {
  p[0] = (uint8_t)value;
  p[1] = (uint8_t)(value >> 8);
  p[2] = (uint8_t)(value >> 16);
  p[3] = (uint8_t)(value >> 24);
}

static uint32_t crc32(const uint8_t *data, size_t length) {
  uint32_t crc = 0xFFFFFFFFU;
  size_t index;
  for (index = 0U; index < length; ++index) {
    uint32_t bit;
    crc ^= data[index];
    for (bit = 0U; bit < 8U; ++bit)
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
  }
  return crc ^ 0xFFFFFFFFU;
}

static int valid_artifact(const uint8_t *program, size_t length) {
  return zplc_loader_verify(program, length, program_store_verify_workspace,
                            sizeof(program_store_verify_workspace),
                            &program_store_verified_view) == ZPLC_LOADER_OK;
}

static int absent_or_corrupt(zplc_hal_result_t result) {
  return result == ZPLC_HAL_NOT_IMPL || result == ZPLC_HAL_CORRUPT;
}

static int valid_meta(const uint8_t meta[STORE_META_SIZE], unsigned slot,
                      int allow_prepared, uint32_t *generation,
                      uint32_t *length, uint32_t *file_crc) {
  uint8_t state = meta[7];
  if (memcmp(meta, "ZPS1", 4U) != 0 || get_u16(meta + 4U) != 1U ||
      meta[6] != slot ||
      (state != STORE_SLOT_COMMITTED &&
       (allow_prepared == 0 || state != STORE_SLOT_PREPARED)) ||
      get_u32(meta + 8U) == 0U || get_u32(meta + 12U) == 0U ||
      get_u16(meta + 20U) != ZPLC_VERSION_MAJOR ||
      get_u16(meta + 22U) != ZPLC_VERSION_MINOR || get_u32(meta + 24U) != 0U ||
      get_u32(meta + 28U) != crc32(meta, 28U))
    return 0;
  *generation = get_u32(meta + 8U);
  *length = get_u32(meta + 12U);
  if (file_crc != NULL)
    *file_crc = get_u32(meta + 16U);
  return 1;
}

static int read_meta(unsigned slot, int allow_prepared, uint32_t *generation,
                     uint32_t *length, uint32_t *file_crc) {
  uint8_t meta[STORE_META_SIZE];
  zplc_hal_result_t result;
  memset(meta, 0, sizeof(meta));
  result = zplc_hal_persist_load(meta_keys[slot], meta, sizeof(meta));
  if (absent_or_corrupt(result))
    return 1;
  if (result != ZPLC_HAL_OK)
    return -1;
  return valid_meta(meta, slot, allow_prepared, generation, length, file_crc) ? 0 : 1;
}

static int read_active(unsigned *slot, uint32_t *generation) {
  uint8_t active[STORE_ACTIVE_SIZE];
  zplc_hal_result_t result;
  memset(active, 0, sizeof(active));
  result = zplc_hal_persist_load(STORE_ACTIVE, active, sizeof(active));
  if (absent_or_corrupt(result))
    return 1;
  if (result != ZPLC_HAL_OK)
    return -1;
  if (memcmp(active, "ZPA1", 4U) != 0 || get_u16(active + 4U) != 1U ||
      active[6] > 1U || active[7] != 0U || get_u32(active + 8U) == 0U ||
      get_u32(active + 12U) != crc32(active, 12U))
    return 1;
  *slot = active[6];
  *generation = get_u32(active + 8U);
  return 0;
}

static void make_meta(uint8_t meta[STORE_META_SIZE], unsigned slot,
                      uint8_t state, uint32_t generation,
                      const uint8_t *program, size_t length) {
  memset(meta, 0, STORE_META_SIZE);
  memcpy(meta, "ZPS1", 4U);
  put_u16(meta + 4U, 1U);
  meta[6] = (uint8_t)slot;
  meta[7] = state;
  put_u32(meta + 8U, generation);
  put_u32(meta + 12U, (uint32_t)length);
  put_u32(meta + 16U, get_u32(program + 12U));
  put_u16(meta + 20U, ZPLC_VERSION_MAJOR);
  put_u16(meta + 22U, ZPLC_VERSION_MINOR);
  put_u32(meta + 28U, crc32(meta, 28U));
}

static void make_active(uint8_t active[STORE_ACTIVE_SIZE], unsigned slot,
                        uint32_t generation) {
  memset(active, 0, STORE_ACTIVE_SIZE);
  memcpy(active, "ZPA1", 4U);
  put_u16(active + 4U, 1U);
  active[6] = (uint8_t)slot;
  put_u32(active + 8U, generation);
  put_u32(active + 12U, crc32(active, 12U));
}

static int generation_is_newer(uint32_t candidate, uint32_t current) {
  return candidate != current && (uint32_t)(candidate - current) < 0x80000000U;
}

static int read_slot(unsigned slot, int allow_prepared, uint8_t *workspace,
                     size_t workspace_capacity, size_t *program_size,
                     uint32_t *generation) {
  uint32_t length;
  uint32_t header_crc;
  int result = read_meta(slot, allow_prepared, generation, &length, &header_crc);
  zplc_hal_result_t load;
  if (result != 0)
    return result;
  if (length < ZPLC_FILE_HEADER_SIZE ||
      length > workspace_capacity - ZPLC_PROGRAM_STORE_FOOTER_SIZE)
    return 1;
  memset(workspace, 0, (size_t)length + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  load = zplc_hal_persist_load(payload_keys[slot], workspace,
                               (size_t)length + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  if (absent_or_corrupt(load))
    return 1;
  if (load != ZPLC_HAL_OK)
    return -1;
  if (memcmp(workspace + length, "ZPE1", 4U) != 0 ||
      get_u32(workspace + length + 4U) != length ||
      get_u32(workspace + 12U) != header_crc ||
      valid_artifact(workspace, length) == 0)
    return 1;
  *program_size = length;
  return 0;
}

/* Returns 0 for a valid legacy rollback, 1 when it is unavailable/corrupt,
 * and -1 for an I/O failure that must stop a commit before it mutates store. */
static int legacy_rollback_available(void) {
  uint32_t legacy_length = 0U;
  zplc_hal_result_t result;

  result = zplc_hal_persist_load(STORE_LEGACY_LEN, &legacy_length,
                                 sizeof(legacy_length));
  if (absent_or_corrupt(result))
    return 1;
  if (result != ZPLC_HAL_OK)
    return -1;
  if (legacy_length < ZPLC_FILE_HEADER_SIZE ||
      legacy_length > ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE)
    return 1;
  memset(program_store_rollback_workspace, 0, legacy_length);
  result = zplc_hal_persist_load(STORE_LEGACY_CODE,
                                 program_store_rollback_workspace,
                                 legacy_length);
  if (absent_or_corrupt(result))
    return 1;
  if (result != ZPLC_HAL_OK)
    return -1;
  return valid_artifact(program_store_rollback_workspace, legacy_length) != 0
             ? 0
             : 1;
}

/* A record that exists but cannot form a verified rollback is not bootstrap.
 * Probing one byte is enough to distinguish an absent key from durable state;
 * HAL_CORRUPT still counts as durable evidence. */
static int durable_record_exists(const char *key) {
  uint8_t probe = 0U;
  zplc_hal_result_t result = zplc_hal_persist_load(key, &probe, sizeof(probe));

  if (result == ZPLC_HAL_NOT_IMPL)
    return 0;
  if (result == ZPLC_HAL_OK || result == ZPLC_HAL_CORRUPT)
    return 1;
  return -1;
}

static int durable_state_exists(void) {
  static const char *const keys[] = {
      STORE_ACTIVE,
      "program_v1_slot_a_payload",
      "program_v1_slot_a_meta",
      "program_v1_slot_b_payload",
      "program_v1_slot_b_meta",
      STORE_LEGACY_LEN,
      STORE_LEGACY_CODE,
  };
  size_t index;

  for (index = 0U; index < sizeof(keys) / sizeof(keys[0]); ++index) {
    int exists = durable_record_exists(keys[index]);
    if (exists != 0)
      return exists;
  }
  return 0;
}

/* A stale active record may name a corrupt payload.  Its generation still
 * fences a PREPARED replacement: otherwise an interrupted C could look like
 * the old active B after restart. */
static int highest_structural_generation(uint32_t *generation) {
  unsigned active_slot;
  uint32_t candidate;
  uint32_t length;
  int active;
  int meta;

  active = read_active(&active_slot, &candidate);
  if (active < 0)
    return -1;
  if (active == 0)
    *generation = candidate;
  meta = read_meta(0U, 1, &candidate, &length, NULL);
  if (meta < 0)
    return -1;
  if (meta == 0 && (*generation == 0U ||
                    generation_is_newer(candidate, *generation)))
    *generation = candidate;
  meta = read_meta(1U, 1, &candidate, &length, NULL);
  if (meta < 0)
    return -1;
  if (meta == 0 && (*generation == 0U ||
                    generation_is_newer(candidate, *generation)))
    *generation = candidate;
  return 0;
}

/* Determine a real rollback before writing C.  Return 0 with a v1 slot,
 * 1 for an unequivocally empty store, 2 for a verified legacy rollback, and
 * -1 for I/O/corruption states that must fail closed. */
static int discover_rollback_slot(unsigned *slot, uint32_t *generation) {
  unsigned active_slot;
  uint32_t active_generation;
  uint32_t generation_a = 0U, generation_b = 0U;
  size_t length;
  int active, a, b, legacy;

  active = read_active(&active_slot, &active_generation);
  if (active < 0)
    return -1;
  if (active == 0) {
    a = read_slot(active_slot, 1, program_store_rollback_workspace,
                  sizeof(program_store_rollback_workspace), &length,
                  &generation_a);
    if (a < 0)
      return -1;
    if (a == 0 && generation_a == active_generation) {
      *slot = active_slot;
      *generation = active_generation;
      return 0;
    }
  }

  a = read_slot(0U, 0, program_store_rollback_workspace,
                sizeof(program_store_rollback_workspace), &length,
                &generation_a);
  b = read_slot(1U, 0, program_store_rollback_workspace,
                sizeof(program_store_rollback_workspace), &length,
                &generation_b);
  if (a < 0 || b < 0)
    return -1;
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

  legacy = legacy_rollback_available();
  if (legacy < 0)
    return -1;
  if (legacy == 0)
    return 2;
  return durable_state_exists() == 0 ? 1 : -1;
}

static int program_store_commit_locked(uint8_t *workspace, size_t program_size,
                                       size_t workspace_capacity) {
  uint8_t meta[STORE_META_SIZE];
  uint8_t active[STORE_ACTIVE_SIZE];
  uint32_t generation = 0U;
  unsigned prior_slot = 0U;
  unsigned slot;
  uint32_t expected_header_crc;
  int current;
  zplc_hal_result_t result;

  if (workspace == NULL || program_size == 0U ||
      program_size > ZPLC_PROGRAM_STORE_MAX_ARTIFACT_SIZE ||
      workspace_capacity < ZPLC_PROGRAM_STORE_FOOTER_SIZE ||
      program_size > workspace_capacity - ZPLC_PROGRAM_STORE_FOOTER_SIZE ||
      valid_artifact(workspace, program_size) == 0)
    return -1;

  current = discover_rollback_slot(&prior_slot, &generation);
  if (current < 0)
    return -1;
  if (highest_structural_generation(&generation) != 0)
    return -1;
  slot = current == 0 ? prior_slot ^ 1U : 0U;
  generation = generation == UINT32_MAX ? 1U : generation + 1U;
  expected_header_crc = get_u32(workspace + 12U);

  memcpy(workspace + program_size, "ZPE1", 4U);
  put_u32(workspace + program_size + 4U, (uint32_t)program_size);
  result = zplc_hal_persist_save(payload_keys[slot], workspace,
                                 program_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  if (result != ZPLC_HAL_OK)
    return -1;
  memset(workspace, 0, program_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  result = zplc_hal_persist_load(payload_keys[slot], workspace,
                                 program_size + ZPLC_PROGRAM_STORE_FOOTER_SIZE);
  if (result != ZPLC_HAL_OK || memcmp(workspace + program_size, "ZPE1", 4U) != 0 ||
      get_u32(workspace + program_size + 4U) != program_size ||
      get_u32(workspace + 12U) != expected_header_crc ||
      valid_artifact(workspace, program_size) == 0)
    return -1;

  make_meta(meta, slot, STORE_SLOT_PREPARED, generation, workspace, program_size);
  result = zplc_hal_persist_save(meta_keys[slot], meta, sizeof(meta));
  if (result != ZPLC_HAL_OK)
    return -1;
  {
    uint8_t check[STORE_META_SIZE];
    memset(check, 0, sizeof(check));
    result = zplc_hal_persist_load(meta_keys[slot], check, sizeof(check));
    if (result != ZPLC_HAL_OK || memcmp(meta, check, sizeof(meta)) != 0)
      return -1;
  }

  make_active(active, slot, generation);
  if (zplc_hal_persist_save(STORE_ACTIVE, active, sizeof(active)) != ZPLC_HAL_OK)
    return -1;

  make_meta(meta, slot, STORE_SLOT_COMMITTED, generation, workspace, program_size);
  if (zplc_hal_persist_save(meta_keys[slot], meta, sizeof(meta)) != ZPLC_HAL_OK)
    zplc_hal_log("[STORE] Metadata commit deferred after active publish\n");
  (void)zplc_hal_persist_delete(STORE_LEGACY_LEN);
  (void)zplc_hal_persist_delete(STORE_LEGACY_CODE);
  return 0;
}

int zplc_program_store_commit(uint8_t *workspace, size_t program_size,
                              size_t workspace_capacity) {
  int result;

  if (k_mutex_lock(&program_store_mutex, K_FOREVER) != 0)
    return -1;
  result = program_store_commit_locked(workspace, program_size, workspace_capacity);
  k_mutex_unlock(&program_store_mutex);
  return result;
}

static zplc_program_store_restore_t program_store_restore_locked(
    uint8_t *workspace, size_t workspace_capacity, size_t *program_size) {
  unsigned active_slot;
  uint32_t active_generation, generation_a = 0U, generation_b = 0U;
  uint32_t length_a, length_b;
  uint32_t legacy_length = 0U;
  int active, a, b, result;
  zplc_hal_result_t legacy;

  if (workspace == NULL || program_size == NULL ||
      workspace_capacity < ZPLC_PROGRAM_STORE_FOOTER_SIZE)
    return ZPLC_PROGRAM_STORE_ERROR;
  *program_size = 0U;
  active = read_active(&active_slot, &active_generation);
  if (active < 0)
    return ZPLC_PROGRAM_STORE_ERROR;
  if (active == 0) {
    result = read_slot(active_slot, 1, workspace, workspace_capacity, program_size,
                       &generation_a);
    if (result < 0)
      return ZPLC_PROGRAM_STORE_ERROR;
    if (result == 0 && generation_a == active_generation)
      return ZPLC_PROGRAM_STORE_OK;
  }
  a = read_meta(0U, 0, &generation_a, &length_a, NULL);
  b = read_meta(1U, 0, &generation_b, &length_b, NULL);
  if (a < 0 || b < 0)
    return ZPLC_PROGRAM_STORE_ERROR;
  if (a == 0 || b == 0) {
    unsigned slot = (b == 0 && (a != 0 || generation_is_newer(generation_b, generation_a))) ? 1U : 0U;
    uint32_t wanted = slot == 0U ? generation_a : generation_b;
    result = read_slot(slot, 0, workspace, workspace_capacity, program_size, &wanted);
    if (result < 0)
      return ZPLC_PROGRAM_STORE_ERROR;
    if (result == 0)
      return ZPLC_PROGRAM_STORE_OK;
    /* The other committed slot may still be intact. */
    if (a == 0 && b == 0) {
      slot ^= 1U;
      wanted = slot == 0U ? generation_a : generation_b;
      result = read_slot(slot, 0, workspace, workspace_capacity, program_size, &wanted);
      if (result < 0)
        return ZPLC_PROGRAM_STORE_ERROR;
      if (result == 0)
        return ZPLC_PROGRAM_STORE_OK;
    }
  }

  legacy = zplc_hal_persist_load(STORE_LEGACY_LEN, &legacy_length,
                                 sizeof(legacy_length));
  if (legacy == ZPLC_HAL_OK && legacy_length != 0U &&
      legacy_length <= workspace_capacity - ZPLC_PROGRAM_STORE_FOOTER_SIZE) {
    memset(workspace, 0, legacy_length);
    legacy = zplc_hal_persist_load(STORE_LEGACY_CODE, workspace, legacy_length);
    if (legacy == ZPLC_HAL_OK && valid_artifact(workspace, legacy_length) != 0) {
      *program_size = legacy_length;
      return ZPLC_PROGRAM_STORE_LEGACY;
    }
  }
  if (!absent_or_corrupt(legacy) && legacy != ZPLC_HAL_OK)
    return ZPLC_PROGRAM_STORE_ERROR;
  return ZPLC_PROGRAM_STORE_EMPTY;
}

zplc_program_store_restore_t zplc_program_store_restore(
    uint8_t *workspace, size_t workspace_capacity, size_t *program_size) {
  zplc_program_store_restore_t result;

  if (k_mutex_lock(&program_store_mutex, K_FOREVER) != 0)
    return ZPLC_PROGRAM_STORE_ERROR;
  result = program_store_restore_locked(workspace, workspace_capacity, program_size);
  k_mutex_unlock(&program_store_mutex);
  return result;
}
