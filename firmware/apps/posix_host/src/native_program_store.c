#include "native_program_store.h"

#include <stdlib.h>
#include <string.h>

#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>

#define STORE_SLOT_PAYLOAD_A "program_v1_slot_a_payload"
#define STORE_SLOT_META_A "program_v1_slot_a_meta"
#define STORE_SLOT_PAYLOAD_B "program_v1_slot_b_payload"
#define STORE_SLOT_META_B "program_v1_slot_b_meta"
#define STORE_ACTIVE "program_v1_active"
#define STORE_LEGACY_LEN "code_len"
#define STORE_LEGACY_CODE "code"
#define STORE_META_SIZE 32U
#define STORE_ACTIVE_SIZE 16U
#define STORE_FOOTER_SIZE 8U

static const char *const payload_keys[] = { STORE_SLOT_PAYLOAD_A, STORE_SLOT_PAYLOAD_B };
static const char *const meta_keys[] = { STORE_SLOT_META_A, STORE_SLOT_META_B };

static uint16_t get_u16(const uint8_t *p) { return (uint16_t)p[0] | ((uint16_t)p[1] << 8); }
static uint32_t get_u32(const uint8_t *p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }
static void put_u16(uint8_t *p, uint16_t value) { p[0] = (uint8_t)value; p[1] = (uint8_t)(value >> 8); }
static void put_u32(uint8_t *p, uint32_t value) { p[0] = (uint8_t)value; p[1] = (uint8_t)(value >> 8); p[2] = (uint8_t)(value >> 16); p[3] = (uint8_t)(value >> 24); }

static uint32_t crc32(const uint8_t *data, size_t len)
{
    uint32_t crc = 0xFFFFFFFFU;
    size_t index;
    for (index = 0U; index < len; index++) {
        uint32_t bit;
        crc ^= data[index];
        for (bit = 0U; bit < 8U; bit++) {
            crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
        }
    }
    return crc ^ 0xFFFFFFFFU;
}

int zplc_native_program_describe(const uint8_t *program, size_t program_size,
                                 zplc_native_program_details_t *details)
{
    uint8_t *workspace;
    zplc_program_view_t view;
    int result;
    if (program == NULL || program_size == 0U || details == NULL) return -1;
    memset(details, 0, sizeof(*details));
    workspace = (uint8_t *)malloc(ZPLC_LOADER_VERIFY_WORKSPACE_SIZE);
    if (workspace == NULL) return -1;
    result = zplc_loader_verify(program, program_size, workspace,
                                ZPLC_LOADER_VERIFY_WORKSPACE_SIZE, &view);
    if (result == ZPLC_LOADER_OK) {
        if (view.task_count == 0U) {
            details->task_count = 1U;
            details->scan_interval_ms = 100U;
            details->tasks[0].id = 0U;
            details->tasks[0].type = ZPLC_TASK_CYCLIC;
            details->tasks[0].priority = 1U;
            details->tasks[0].interval_us = 100000U;
            details->tasks[0].stack_size = ZPLC_STACK_MAX_DEPTH;
        } else if (view.task_count <= ZPLC_LOADER_MAX_TASKS) {
            uint32_t index;
            uint32_t interval_us = 0U;
            for (index = 0U; index < view.task_count; ++index) {
                const uint8_t *task = view.tasks + index * ZPLC_TASK_DEF_SIZE;
                zplc_task_def_t *definition = &details->tasks[index];
                definition->id = get_u16(task);
                definition->type = task[2U];
                definition->priority = task[3U];
                definition->interval_us = get_u32(task + 4U);
                definition->entry_point = get_u16(task + 8U);
                definition->stack_size = get_u16(task + 10U);
                if (definition->type != ZPLC_TASK_CYCLIC ||
                    definition->interval_us < 1000U ||
                    definition->interval_us > 3600000000U ||
                    definition->interval_us % 1000U != 0U ||
                    definition->entry_point >= view.code_size ||
                    (index != 0U && definition->interval_us != interval_us)) {
                    result = -1;
                    break;
                }
                interval_us = definition->interval_us;
            }
            if (result == ZPLC_LOADER_OK) {
                details->task_count = (uint8_t)view.task_count;
                details->has_task_segment = 1U;
                details->scan_interval_ms = interval_us / 1000U;
            }
        } else result = -1;
    }
    free(workspace);
    return result == ZPLC_LOADER_OK ? 0 : -1;
}

int zplc_native_program_validate(const uint8_t *program, size_t program_size,
                                 uint32_t *scan_interval_ms)
{
    zplc_native_program_details_t details;
    if (scan_interval_ms == NULL ||
        zplc_native_program_describe(program, program_size, &details) != 0) return -1;
    *scan_interval_ms = details.scan_interval_ms;
    return 0;
}

static int valid_meta(const uint8_t meta[STORE_META_SIZE], unsigned slot,
                      int allow_prepared, uint32_t *generation, uint32_t *length)
{
    if (memcmp(meta, "ZPS1", 4U) != 0 || get_u16(meta + 4U) != 1U ||
        meta[6] != slot || (meta[7] != 2U && (allow_prepared == 0 || meta[7] != 1U)) ||
        get_u32(meta + 8U) == 0U || get_u32(meta + 12U) == 0U ||
        get_u32(meta + 12U) > ZPLC_MEM_CODE_SIZE ||
        get_u16(meta + 20U) != ZPLC_VERSION_MAJOR || get_u16(meta + 22U) != ZPLC_VERSION_MINOR ||
        get_u32(meta + 24U) != 0U || get_u32(meta + 28U) != crc32(meta, 28U)) return 0;
    *generation = get_u32(meta + 8U);
    *length = get_u32(meta + 12U);
    return 1;
}

static int absent_or_corrupt(zplc_hal_result_t result)
{
    return result == ZPLC_HAL_NOT_IMPL || result == ZPLC_HAL_CORRUPT;
}

/* A structurally valid meta record fences generation reuse even if its
 * payload is no longer a usable rollback. */
static int read_meta(unsigned slot, int allow_prepared, uint32_t *generation,
                     uint32_t *length, uint32_t *header_crc)
{
    uint8_t meta[STORE_META_SIZE];
    zplc_hal_result_t result;
    if (slot > 1U || generation == NULL || length == NULL) return -1;
    memset(meta, 0, sizeof(meta));
    result = zplc_hal_persist_load(meta_keys[slot], meta, sizeof(meta));
    if (absent_or_corrupt(result)) return 1;
    if (result != ZPLC_HAL_OK) return -1;
    if (valid_meta(meta, slot, allow_prepared, generation, length) == 0) return 1;
    if (header_crc != NULL) *header_crc = get_u32(meta + 16U);
    return 0;
}

static int read_slot(unsigned slot, int allow_prepared, uint8_t *program,
                     size_t capacity, size_t *program_size, uint32_t *generation)
{
    uint8_t *envelope;
    uint32_t length, header_crc;
    int meta_result;
    zplc_hal_result_t result;
    if (slot > 1U || program == NULL || program_size == NULL || generation == NULL) return -1;
    meta_result = read_meta(slot, allow_prepared, generation, &length, &header_crc);
    if (meta_result != 0) return meta_result < 0 ? -1 : 1;
    if (length > capacity) return 1;
    envelope = (uint8_t *)calloc(1U, (size_t)length + STORE_FOOTER_SIZE);
    if (envelope == NULL) return -1;
    result = zplc_hal_persist_load(payload_keys[slot], envelope, (size_t)length + STORE_FOOTER_SIZE);
    if (absent_or_corrupt(result)) { free(envelope); return 1; }
    if (result != ZPLC_HAL_OK || memcmp(envelope + length, "ZPE1", 4U) != 0 ||
        get_u32(envelope + length + 4U) != length ||
        header_crc != get_u32(envelope + 12U) ||
        zplc_native_program_validate(envelope, length, &(uint32_t){0U}) != 0) {
        free(envelope); return result == ZPLC_HAL_OK ? 1 : -1;
    }
    memcpy(program, envelope, length);
    free(envelope);
    *program_size = length;
    return 0;
}

static void make_meta(uint8_t meta[STORE_META_SIZE], unsigned slot, uint8_t state,
                      uint32_t generation, const uint8_t *program, size_t length)
{
    memset(meta, 0, STORE_META_SIZE);
    memcpy(meta, "ZPS1", 4U); put_u16(meta + 4U, 1U); meta[6] = (uint8_t)slot; meta[7] = state;
    put_u32(meta + 8U, generation); put_u32(meta + 12U, (uint32_t)length);
    put_u32(meta + 16U, get_u32(program + 12U)); put_u16(meta + 20U, ZPLC_VERSION_MAJOR);
    put_u16(meta + 22U, ZPLC_VERSION_MINOR); put_u32(meta + 28U, crc32(meta, 28U));
}

static void make_active(uint8_t active[STORE_ACTIVE_SIZE], unsigned slot, uint32_t generation)
{
    memset(active, 0, STORE_ACTIVE_SIZE); memcpy(active, "ZPA1", 4U); put_u16(active + 4U, 1U);
    active[6] = (uint8_t)slot; put_u32(active + 8U, generation); put_u32(active + 12U, crc32(active, 12U));
}

static int read_active(unsigned *slot, uint32_t *generation)
{
    uint8_t active[STORE_ACTIVE_SIZE];
    zplc_hal_result_t result;
    memset(active, 0, sizeof(active));
    result = zplc_hal_persist_load(STORE_ACTIVE, active, sizeof(active));
    if (absent_or_corrupt(result)) return 1;
    if (result != ZPLC_HAL_OK) return -1;
    if (memcmp(active, "ZPA1", 4U) != 0 || get_u16(active + 4U) != 1U ||
        active[6] > 1U || active[7] != 0U || get_u32(active + 8U) == 0U ||
        get_u32(active + 12U) != crc32(active, 12U)) return 1;
    *slot = active[6]; *generation = get_u32(active + 8U); return 0;
}

static uint32_t next_generation(uint32_t current) { return current == UINT32_MAX ? 1U : current + 1U; }
static int generation_is_newer(uint32_t candidate, uint32_t current)
{
    return candidate != current && (uint32_t)(candidate - current) < 0x80000000U;
}

/* Returns 0 for a valid legacy rollback, 1 for unavailable/corrupt data,
 * and -1 for an I/O failure that must stop commit before any mutation. */
static int legacy_rollback_available(void)
{
    uint32_t length = 0U, scan_interval_ms;
    uint8_t *legacy;
    zplc_hal_result_t result;

    result = zplc_hal_persist_load(STORE_LEGACY_LEN, &length, sizeof(length));
    if (absent_or_corrupt(result)) return 1;
    if (result != ZPLC_HAL_OK) return -1;
    if (length == 0U || length > ZPLC_MEM_CODE_SIZE) return 1;
    legacy = (uint8_t *)malloc(length);
    if (legacy == NULL) return -1;
    result = zplc_hal_persist_load(STORE_LEGACY_CODE, legacy, length);
    if (absent_or_corrupt(result)) { free(legacy); return 1; }
    if (result != ZPLC_HAL_OK) { free(legacy); return -1; }
    result = zplc_native_program_validate(legacy, length, &scan_interval_ms) == 0 ? ZPLC_HAL_OK : ZPLC_HAL_CORRUPT;
    free(legacy);
    return result == ZPLC_HAL_OK ? 0 : 1;
}

/* Existing but corrupt records are durable evidence, never an empty store. */
static int durable_record_exists(const char *key)
{
    uint8_t probe = 0U;
    zplc_hal_result_t result = zplc_hal_persist_load(key, &probe, sizeof(probe));
    if (result == ZPLC_HAL_NOT_IMPL) return 0;
    if (result == ZPLC_HAL_OK || result == ZPLC_HAL_CORRUPT) return 1;
    return -1;
}

static int durable_state_exists(void)
{
    static const char *const keys[] = {
        STORE_ACTIVE, STORE_SLOT_PAYLOAD_A, STORE_SLOT_META_A,
        STORE_SLOT_PAYLOAD_B, STORE_SLOT_META_B, STORE_LEGACY_LEN,
        STORE_LEGACY_CODE
    };
    size_t index;
    for (index = 0U; index < sizeof(keys) / sizeof(keys[0]); index++) {
        int exists = durable_record_exists(keys[index]);
        if (exists != 0) return exists;
    }
    return 0;
}

static int highest_structural_generation(uint32_t *generation)
{
    unsigned active_slot;
    uint32_t candidate, length;
    int result;
    if (generation == NULL) return -1;
    result = read_active(&active_slot, &candidate);
    if (result < 0) return -1;
    if (result == 0 && (*generation == 0U || generation_is_newer(candidate, *generation))) *generation = candidate;
    result = read_meta(0U, 1, &candidate, &length, NULL);
    if (result < 0) return -1;
    if (result == 0 && (*generation == 0U || generation_is_newer(candidate, *generation))) *generation = candidate;
    result = read_meta(1U, 1, &candidate, &length, NULL);
    if (result < 0) return -1;
    if (result == 0 && (*generation == 0U || generation_is_newer(candidate, *generation))) *generation = candidate;
    return 0;
}

/* Return 0 with a v1 rollback, 1 for an unequivocally empty store, 2 for a
 * verified legacy rollback, and -1 for any state that must fail closed. */
static int discover_rollback_slot(unsigned *slot, uint32_t *generation)
{
    uint8_t *scratch;
    unsigned active_slot;
    uint32_t active_generation, generation_a = 0U, generation_b = 0U;
    size_t size_a = 0U, size_b = 0U;
    int active, a, b, legacy;

    scratch = (uint8_t *)malloc(ZPLC_MEM_CODE_SIZE);
    if (scratch == NULL) return -1;
    active = read_active(&active_slot, &active_generation);
    if (active < 0) { free(scratch); return -1; }
    if (active == 0) {
        a = read_slot(active_slot, 1, scratch, ZPLC_MEM_CODE_SIZE, &size_a, &generation_a);
        if (a < 0) { free(scratch); return -1; }
        if (a == 0 && generation_a == active_generation) {
            *slot = active_slot; *generation = active_generation;
            free(scratch); return 0;
        }
    }
    a = read_slot(0U, 0, scratch, ZPLC_MEM_CODE_SIZE, &size_a, &generation_a);
    b = read_slot(1U, 0, scratch, ZPLC_MEM_CODE_SIZE, &size_b, &generation_b);
    free(scratch);
    if (a < 0 || b < 0) return -1;
    if (a == 0 || b == 0) {
        if (b == 0 && (a != 0 || generation_is_newer(generation_b, generation_a) != 0)) {
            *slot = 1U; *generation = generation_b;
        } else { *slot = 0U; *generation = generation_a; }
        return 0;
    }
    legacy = legacy_rollback_available();
    if (legacy < 0) return -1;
    if (legacy == 0) return 2;
    return durable_state_exists() == 0 ? 1 : -1;
}

/* 0 current found, 1 none/corrupt, -1 I/O. prepared is admitted only when
 * the active record directly names it. */
static int find_current(unsigned *slot, uint32_t *generation, int *from_active)
{
    uint8_t *scratch;
    unsigned active_slot;
    uint32_t active_generation, gen_a = 0U, gen_b = 0U;
    size_t size_a = 0U, size_b = 0U;
    int active, a, b;
    scratch = (uint8_t *)malloc(ZPLC_MEM_CODE_SIZE);
    if (scratch == NULL) return -1;
    active = read_active(&active_slot, &active_generation);
    if (active < 0) { free(scratch); return -1; }
    if (active == 0) {
        a = read_slot(active_slot, 1, scratch, ZPLC_MEM_CODE_SIZE, &size_a, &gen_a);
        if (a < 0) { free(scratch); return -1; }
        if (a == 0 && gen_a == active_generation) {
            *slot = active_slot; *generation = gen_a; *from_active = 1;
            free(scratch); return 0;
        }
    }
    a = read_slot(0U, 0, scratch, ZPLC_MEM_CODE_SIZE, &size_a, &gen_a);
    b = read_slot(1U, 0, scratch, ZPLC_MEM_CODE_SIZE, &size_b, &gen_b);
    free(scratch);
    if (a < 0 || b < 0) return -1;
    if (a != 0 && b != 0) return 1;
    if (b == 0 && (a != 0 || generation_is_newer(gen_b, gen_a) != 0)) {
        *slot = 1U; *generation = gen_b;
    } else { *slot = 0U; *generation = gen_a; }
    *from_active = 0;
    return 0;
}

static void repair_current(unsigned slot, uint32_t generation,
                           const uint8_t *program, size_t length)
{
    uint8_t active[STORE_ACTIVE_SIZE], meta[STORE_META_SIZE];
    make_active(active, slot, generation);
    make_meta(meta, slot, 2U, generation, program, length);
    if (zplc_hal_persist_save(STORE_ACTIVE, active, sizeof(active)) != ZPLC_HAL_OK ||
        zplc_hal_persist_save(meta_keys[slot], meta, sizeof(meta)) != ZPLC_HAL_OK) {
        zplc_hal_log("[native] program recovery record repair deferred\n");
    }
}

int zplc_native_program_store_commit(const uint8_t *program, size_t program_size)
{
    uint8_t meta[STORE_META_SIZE], active[STORE_ACTIVE_SIZE];
    uint8_t *envelope, *check;
    uint32_t current_generation = 0U;
    unsigned current_slot = 0U, slot;
    int current_state;
    uint32_t scan_interval_ms;
    zplc_hal_result_t persist_result;
    if (program == NULL || program_size == 0U || program_size > ZPLC_MEM_CODE_SIZE ||
        zplc_native_program_validate(program, program_size, &scan_interval_ms) != 0) return -1;
    current_state = discover_rollback_slot(&current_slot, &current_generation);
    if (current_state < 0) return -1;
    if (highest_structural_generation(&current_generation) != 0) return -1;
    slot = current_state == 0 ? (current_slot == 0U ? 1U : 0U) : 0U;
    envelope = (uint8_t *)malloc(program_size + STORE_FOOTER_SIZE);
    check = (uint8_t *)calloc(1U, program_size + STORE_FOOTER_SIZE);
    if (envelope == NULL || check == NULL) { free(envelope); free(check); return -1; }
    memcpy(envelope, program, program_size); memcpy(envelope + program_size, "ZPE1", 4U); put_u32(envelope + program_size + 4U, (uint32_t)program_size);
    persist_result = zplc_hal_persist_save(payload_keys[slot], envelope, program_size + STORE_FOOTER_SIZE);
    if (persist_result != ZPLC_HAL_OK ||
        zplc_hal_persist_load(payload_keys[slot], check, program_size + STORE_FOOTER_SIZE) != ZPLC_HAL_OK ||
        memcmp(envelope, check, program_size + STORE_FOOTER_SIZE) != 0 ||
        zplc_native_program_validate(check, program_size, &scan_interval_ms) != 0) { free(envelope); free(check); return -1; }
    make_meta(meta, slot, 1U, next_generation(current_generation), program, program_size);
    memset(check, 0, program_size + STORE_FOOTER_SIZE);
    persist_result = zplc_hal_persist_save(meta_keys[slot], meta, sizeof(meta));
    if (persist_result != ZPLC_HAL_OK ||
        zplc_hal_persist_load(meta_keys[slot], check, sizeof(meta)) != ZPLC_HAL_OK || memcmp(meta, check, sizeof(meta)) != 0) { free(envelope); free(check); return -1; }
    make_active(active, slot, next_generation(current_generation));
    persist_result = zplc_hal_persist_save(STORE_ACTIVE, active, sizeof(active));
    if (persist_result == ZPLC_HAL_COMMIT_UNKNOWN) { free(envelope); free(check); return ZPLC_NATIVE_PROGRAM_STORE_COMMIT_UNKNOWN; }
    if (persist_result != ZPLC_HAL_OK) { free(envelope); free(check); return ZPLC_NATIVE_PROGRAM_STORE_ERROR; }
    make_meta(meta, slot, 2U, next_generation(current_generation), program, program_size);
    if (zplc_hal_persist_save(meta_keys[slot], meta, sizeof(meta)) != ZPLC_HAL_OK) zplc_hal_log("[native] program metadata commit deferred after active publish\n");
    (void)zplc_hal_persist_delete(STORE_LEGACY_LEN); (void)zplc_hal_persist_delete(STORE_LEGACY_CODE);
    free(envelope); free(check); return 0;
}

int zplc_native_program_store_restore(uint8_t *program, size_t capacity, size_t *program_size)
{
    unsigned current_slot;
    uint32_t current_generation, generation, scan_interval_ms;
    size_t restored_size = 0U;
    int current_state, from_active, result;
    uint32_t legacy_length = 0U;
    zplc_hal_result_t legacy_result;
    if (program == NULL || program_size == NULL) return -1;
    *program_size = 0U;
    current_state = find_current(&current_slot, &current_generation, &from_active);
    if (current_state < 0) return -1;
    if (current_state == 0) {
        uint8_t *staged = (uint8_t *)malloc(capacity);
        if (staged == NULL) return -1;
        result = read_slot(current_slot, from_active, staged, capacity, &restored_size, &generation);
        if (result < 0) { free(staged); return -1; }
        if (result == 0 && generation == current_generation) {
            repair_current(current_slot, generation, staged, restored_size);
            memcpy(program, staged, restored_size);
            free(staged);
            *program_size = restored_size;
            return 0;
        }
        free(staged);
    }
    legacy_result = zplc_hal_persist_load(STORE_LEGACY_LEN, &legacy_length, sizeof(legacy_length));
    if (legacy_result != ZPLC_HAL_OK && legacy_result != ZPLC_HAL_NOT_IMPL &&
        legacy_result != ZPLC_HAL_CORRUPT) return -1;
    if (legacy_result != ZPLC_HAL_OK || legacy_length == 0U || legacy_length > capacity) return 1;
    {
        uint8_t *legacy = (uint8_t *)malloc(legacy_length);
        if (legacy == NULL) return -1;
        legacy_result = zplc_hal_persist_load(STORE_LEGACY_CODE, legacy, legacy_length);
        if (legacy_result != ZPLC_HAL_OK && legacy_result != ZPLC_HAL_NOT_IMPL &&
            legacy_result != ZPLC_HAL_CORRUPT) { free(legacy); return -1; }
        if (legacy_result != ZPLC_HAL_OK ||
            zplc_native_program_validate(legacy, legacy_length, &scan_interval_ms) != 0) {
            free(legacy);
            return 1;
        }
        if (zplc_native_program_store_commit(legacy, legacy_length) != 0) {
            free(legacy);
            return -1;
        }
        memcpy(program, legacy, legacy_length);
        free(legacy);
    }
    *program_size = legacy_length;
    return 0;
}
