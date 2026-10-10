/**
 * @file test_retain.c
 * @brief RETAIN persistence module tests.
 *
 * The module is exercised against the real POSIX HAL persistence in a temporary
 * directory, with the HAL's fault injection standing in for a power cut.
 * Nothing here touches hardware: it is host evidence for the record rules, not
 * evidence that any board keeps its values.
 */

#define _POSIX_C_SOURCE 200809L
#ifdef __APPLE__
#define _DARWIN_C_SOURCE 1 /* macOS hides mkdtemp under a strict _POSIX_C_SOURCE */
#endif

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_retain.h>

/* Test-only hooks of the POSIX HAL (built with ZPLC_HAL_PERSIST_TESTING). */
extern void zplc_hal_persist_test_fail_at(unsigned long operation);
extern unsigned long zplc_hal_persist_test_operation_count(void);
extern int zplc_hal_persist_test_failure_triggered(void);
extern void zplc_hal_persist_test_parent_sync_fail(int enabled);

static int test_count = 0;
static int fail_count = 0;

#define TEST_ASSERT(cond, msg) do { \
    test_count++; \
    if (!(cond)) { \
        fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
        fail_count++; \
    } else { \
        printf("PASS: %s\n", msg); \
    } \
} while (0)

#define REGION_BIG 2500U   /* three chunks per slot */
#define REGION_SMALL 256U  /* one chunk per slot */

static uint8_t g_region[ZPLC_RETAIN_CAPACITY];
static uint8_t g_expect[ZPLC_RETAIN_CAPACITY];
static char g_root[128];

static const zplc_retain_identity_t ID1 = { 0x11111111U, 100U };
static const zplc_retain_identity_t ID2 = { 0x22222222U, 200U };
static const zplc_retain_identity_t ID3 = { 0x33333333U, 300U };

/* ------------------------------------------------------------------------- */
/* Harness                                                                    */
/* ------------------------------------------------------------------------- */

static void slot_path(char slot, unsigned chunk, char *out, size_t cap)
{
    (void)snprintf(out, cap, "%s/retain_%c%u.bin", g_root, slot, chunk);
}

static void remove_root(void)
{
    char path[256];
    char slot;
    unsigned chunk;

    for (slot = 'a'; slot <= 'b'; slot++) {
        for (chunk = 0U; chunk < ZPLC_RETAIN_MAX_CHUNKS; chunk++) {
            slot_path(slot, chunk, path, sizeof(path));
            (void)unlink(path);
            (void)strncat(path, ".tmp", sizeof(path) - strlen(path) - 1U);
            (void)unlink(path);
        }
    }
    (void)rmdir(g_root);
}

static int fresh_root(void)
{
    (void)snprintf(g_root, sizeof(g_root), "/tmp/zplc_retain_XXXXXX");
    if (mkdtemp(g_root) == NULL) {
        return -1;
    }
    (void)setenv("ZPLC_PERSIST_ROOT", g_root, 1);
    zplc_hal_persist_test_fail_at(0UL);
    zplc_hal_persist_test_parent_sync_fail(0);
    return 0;
}

static int start_module(uint32_t size, uint32_t min_interval_ms)
{
    zplc_retain_config_t config;

    memset(&config, 0, sizeof(config));
    config.region = g_region;
    config.region_size = size;
    config.min_interval_ms = min_interval_ms;
    return zplc_retain_init(&config);
}

static void fill(uint8_t *bytes, uint32_t size, uint8_t seed)
{
    uint32_t index;

    for (index = 0U; index < size; index++) {
        bytes[index] = (uint8_t)(seed + index * 7U);
    }
}

static int read_file(const char *path, uint8_t *bytes, size_t cap, size_t *length)
{
    FILE *file = fopen(path, "rb");

    if (file == NULL) {
        return -1;
    }
    *length = fread(bytes, 1U, cap, file);
    (void)fclose(file);
    return 0;
}

static int write_file(const char *path, const uint8_t *bytes, size_t length)
{
    FILE *file = fopen(path, "wb");

    if (file == NULL) {
        return -1;
    }
    if (length != 0U && fwrite(bytes, 1U, length, file) != length) {
        (void)fclose(file);
        return -1;
    }
    return fclose(file);
}

static uint32_t crc32_of(const uint8_t *bytes, size_t length)
{
    uint32_t crc = 0xFFFFFFFFU;
    size_t index;

    for (index = 0U; index < length; index++) {
        unsigned bit;

        crc ^= bytes[index];
        for (bit = 0U; bit < 8U; bit++) {
            crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
        }
    }
    return crc ^ 0xFFFFFFFFU;
}

static uint32_t get_u32(const uint8_t *bytes)
{
    return (uint32_t)bytes[0] | ((uint32_t)bytes[1] << 8) |
           ((uint32_t)bytes[2] << 16) | ((uint32_t)bytes[3] << 24);
}

static unsigned chunks_for(uint32_t region_size)
{
    uint32_t total = ZPLC_RETAIN_HEADER_SIZE + region_size + ZPLC_RETAIN_TRAILER_SIZE;

    return (unsigned)((total + ZPLC_RETAIN_CHUNK_SIZE - 1U) / ZPLC_RETAIN_CHUNK_SIZE);
}

/* Starts a module over a clean directory with two records: A = seed 1 (sequence 1),
 * B = seed 2 (sequence 2), both under ID1. g_expect holds A's payload. */
static int make_two_records(uint32_t size, uint8_t *older, uint8_t *newer)
{
    if (fresh_root() != 0 || start_module(size, 0U) != 0) {
        return -1;
    }
    if (zplc_retain_restore(&ID1, 0U) != ZPLC_RETAIN_NONE) {
        return -1;
    }
    fill(g_region, size, 1U);
    memcpy(older, g_region, size);
    if (zplc_retain_save(&ID1, 10U, ZPLC_RETAIN_SAVE_FORCED) != ZPLC_RETAIN_SAVE_WRITTEN) {
        return -1;
    }
    fill(g_region, size, 2U);
    memcpy(newer, g_region, size);
    if (zplc_retain_save(&ID1, 20U, ZPLC_RETAIN_SAVE_FORCED) != ZPLC_RETAIN_SAVE_WRITTEN) {
        return -1;
    }
    return 0;
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                      */
/* ------------------------------------------------------------------------- */

static void test_identity_from_artifact(void)
{
    uint8_t artifact[ZPLC_FILE_HEADER_SIZE];
    zplc_retain_identity_t identity = { 0U, 0U };

    printf("\n=== Test: program identity is read from the artifact header ===\n");
    memset(artifact, 0, sizeof(artifact));
    artifact[0] = 'Z'; artifact[1] = 'P'; artifact[2] = 'L'; artifact[3] = 'C';
    artifact[12] = 0x78; artifact[13] = 0x56; artifact[14] = 0x34; artifact[15] = 0x12;
    artifact[16] = 0x40; artifact[17] = 0x0D; artifact[18] = 0x00; artifact[19] = 0x00;

    TEST_ASSERT(zplc_retain_identity_from_artifact(artifact, sizeof(artifact), &identity) == 0,
                "identity is read from a header");
    TEST_ASSERT(identity.crc32 == 0x12345678U, "identity carries the header CRC word");
    TEST_ASSERT(identity.code_size == 0x0D40U, "identity carries the header code size word");
    TEST_ASSERT(zplc_retain_identity_from_artifact(artifact, sizeof(artifact) - 1U, &identity) != 0,
                "a buffer shorter than the header is refused");
    artifact[0] = 'X';
    TEST_ASSERT(zplc_retain_identity_from_artifact(artifact, sizeof(artifact), &identity) != 0,
                "a buffer without the magic is refused");
    TEST_ASSERT(zplc_retain_identity_from_artifact(NULL, 0U, &identity) != 0 &&
                zplc_retain_identity_from_artifact(artifact, sizeof(artifact), NULL) != 0,
                "NULL arguments are refused");
}

static void test_init_validation(void)
{
    zplc_retain_config_t config;

    printf("\n=== Test: init validates the region ===\n");
    memset(&config, 0, sizeof(config));
    TEST_ASSERT(zplc_retain_init(NULL) != 0, "init refuses NULL");
    TEST_ASSERT(zplc_retain_init(&config) != 0, "init refuses a NULL region");
    config.region = g_region;
    config.region_size = 0U;
    TEST_ASSERT(zplc_retain_init(&config) != 0, "init refuses a zero size");
    config.region_size = ZPLC_RETAIN_CAPACITY + 1U;
    TEST_ASSERT(zplc_retain_init(&config) != 0, "init refuses a region above the capacity");
    config.region_size = REGION_SMALL;
    TEST_ASSERT(zplc_retain_init(&config) == 0, "init accepts a valid region");
}

static void test_first_start_has_no_record(void)
{
    zplc_retain_status_t status;
    char path[256];

    printf("\n=== Test: first start, no record ===\n");
    TEST_ASSERT(fresh_root() == 0, "temporary directory created");
    TEST_ASSERT(start_module(REGION_SMALL, 0U) == 0, "module initialised");
    TEST_ASSERT(zplc_retain_save(&ID1, 0U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_NOT_READY,
                "a save before restore is refused");
    memset(g_region, 0xAA, REGION_SMALL);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_NONE, "no record reports none");
    memset(g_expect, 0, REGION_SMALL);
    TEST_ASSERT(memcmp(g_region, g_expect, REGION_SMALL) == 0, "the region is initialised to zero");
    zplc_retain_last_status(&status);
    TEST_ASSERT(status.reason == ZPLC_RETAIN_NONE && status.sequence == 0U && status.saves == 0U,
                "status says none, sequence 0, no saves");

    fill(g_region, REGION_SMALL, 9U);
    TEST_ASSERT(zplc_retain_save(&ID1, 5U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "the first save is written");
    slot_path('a', 0U, path, sizeof(path));
    TEST_ASSERT(access(path, F_OK) == 0, "the first record goes to slot a");
    slot_path('b', 0U, path, sizeof(path));
    TEST_ASSERT(access(path, F_OK) != 0, "slot b is untouched by the first save");
    zplc_retain_last_status(&status);
    TEST_ASSERT(status.sequence == 1U && status.saves == 1U && status.saved_at_ms == 5U,
                "status says sequence 1, one save, the save time");
    remove_root();
}

/* RT-025: a saved region survives a power cycle: a fresh module restores the record. */
static void test_round_trip(void)
{
    zplc_retain_status_t status;

    printf("\n=== Test: save, power cycle, restore ===\n");
    TEST_ASSERT(fresh_root() == 0, "temporary directory created");
    TEST_ASSERT(start_module(REGION_BIG, 0U) == 0, "module initialised");
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_NONE, "first start has no record");
    fill(g_region, REGION_BIG, 3U);
    memcpy(g_expect, g_region, REGION_BIG);
    TEST_ASSERT(zplc_retain_save(&ID1, 1U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "the region is saved");

    memset(g_region, 0x55, REGION_BIG); /* the RAM is gone after a power cycle */
    TEST_ASSERT(start_module(REGION_BIG, 0U) == 0, "module initialised again");
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_RESTORED, "the record is restored");
    TEST_ASSERT(memcmp(g_region, g_expect, REGION_BIG) == 0, "the restored bytes equal the saved bytes");
    zplc_retain_last_status(&status);
    TEST_ASSERT(status.reason == ZPLC_RETAIN_RESTORED && status.sequence == 1U,
                "status says restored, sequence 1");
    TEST_ASSERT(strcmp(zplc_retain_reason_string(status.reason), "restored") == 0,
                "the reason token is restored");
    remove_root();
}

/* RT-025: a record carries a magic, a sequence, the program identity, the layout hash and a checksum. */
static void test_record_layout_on_disk(void)
{
    uint8_t record[ZPLC_RETAIN_CHUNK_SIZE];
    uint8_t whole[ZPLC_RETAIN_CAPACITY + 64U];
    size_t length = 0U;
    size_t used = 0U;
    unsigned chunk;
    char path[256];
    uint32_t total = ZPLC_RETAIN_HEADER_SIZE + REGION_BIG + ZPLC_RETAIN_TRAILER_SIZE;
    int sizes_ok = 1;

    printf("\n=== Test: the record on disk follows the documented layout ===\n");
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_BIG, 0U) == 0, "module over a clean directory");
    (void)zplc_retain_restore(&ID2, 0U);
    fill(g_region, REGION_BIG, 4U);
    TEST_ASSERT(zplc_retain_save(&ID2, 1U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "record written");

    for (chunk = 0U; chunk < chunks_for(REGION_BIG); chunk++) {
        slot_path('a', chunk, path, sizeof(path));
        if (read_file(path, record, sizeof(record), &length) != 0) {
            sizes_ok = 0;
            break;
        }
        if (length > ZPLC_RETAIN_CHUNK_SIZE) {
            sizes_ok = 0;
        }
        memcpy(whole + used, record, length);
        used += length;
    }
    TEST_ASSERT(sizes_ok != 0 && used == total, "the chunks hold the whole record, none above the chunk size");
    TEST_ASSERT(memcmp(whole, "ZRTN", 4U) == 0, "magic is ZRTN");
    TEST_ASSERT(whole[4] == ZPLC_RETAIN_FORMAT_VERSION && whole[5] == 0U, "format version is 1");
    TEST_ASSERT(get_u32(whole + 8U) == 1U, "sequence is 1");
    TEST_ASSERT(get_u32(whole + 12U) == ID2.crc32 && get_u32(whole + 16U) == ID2.code_size,
                "identity words follow the sequence");
    TEST_ASSERT(get_u32(whole + 24U) == REGION_BIG, "payload length is the region size");
    TEST_ASSERT(memcmp(whole + ZPLC_RETAIN_HEADER_SIZE, g_region, REGION_BIG) == 0,
                "payload is the region bytes");
    TEST_ASSERT(get_u32(whole + total - 4U) == crc32_of(whole, total - 4U),
                "the trailer is the CRC-32 of everything before it");
    remove_root();
}

/* RT-025: two records alternate, and the sequence counts up across 1000 saves. */
static void test_sequence_across_many_saves(void)
{
    uint32_t index;
    int alternate = 1;
    int sequences = 1;
    uint8_t header[ZPLC_RETAIN_HEADER_SIZE];
    size_t length;
    char path_a[256], path_b[256];
    zplc_retain_status_t status;

    printf("\n=== Test: 1000 saves alternate the slots and count up ===\n");
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 0U) == 0, "module over a clean directory");
    (void)zplc_retain_restore(&ID1, 0U);
    slot_path('a', 0U, path_a, sizeof(path_a));
    slot_path('b', 0U, path_b, sizeof(path_b));
    for (index = 1U; index <= 1000U; index++) {
        const char *expected_path = (index % 2U == 1U) ? path_a : path_b;
        uint32_t sequence;

        g_region[0] = (uint8_t)index;
        g_region[1] = (uint8_t)(index >> 8);
        if (zplc_retain_save(&ID1, index, ZPLC_RETAIN_SAVE_FORCED) != ZPLC_RETAIN_SAVE_WRITTEN) {
            sequences = 0;
            break;
        }
        if (read_file(expected_path, header, sizeof(header), &length) != 0 || length != sizeof(header)) {
            alternate = 0;
            break;
        }
        sequence = get_u32(header + 8U);
        if (sequence != index) {
            sequences = 0;
            break;
        }
    }
    TEST_ASSERT(sequences != 0, "each save carries the previous sequence plus one");
    TEST_ASSERT(alternate != 0, "odd saves go to slot a and even saves to slot b");

    g_region[0] = 0U; g_region[1] = 0U;
    TEST_ASSERT(start_module(REGION_SMALL, 0U) == 0, "module initialised again");
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_RESTORED, "the newest record is restored");
    TEST_ASSERT(g_region[0] == (uint8_t)1000U && g_region[1] == (uint8_t)(1000U >> 8),
                "the restored bytes are those of save 1000");
    zplc_retain_last_status(&status);
    TEST_ASSERT(status.sequence == 1000U, "status says sequence 1000");
    TEST_ASSERT(zplc_retain_save(&ID1, 2000U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_UNCHANGED,
                "nothing is written right after a restore");
    g_region[2] = 0x77U;
    TEST_ASSERT(zplc_retain_save(&ID1, 2001U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "the next save continues the sequence");
    zplc_retain_last_status(&status);
    TEST_ASSERT(status.sequence == 1001U, "status says sequence 1001");
    remove_root();
}

typedef struct {
    const char *name;
    char slot;
    int chunk;          /* -1 = last chunk */
    int action;         /* 0 flip, 1 truncate, 2 delete, 3 empty, 4 append */
    long offset;        /* flip: byte offset inside the chunk; -1 = last byte */
    size_t keep;        /* truncate: bytes kept */
} damage_t;

static int damage_slot(const damage_t *damage, uint32_t region_size)
{
    char path[256];
    uint8_t bytes[ZPLC_RETAIN_CHUNK_SIZE + 32U];
    size_t length = 0U;
    unsigned chunk = damage->chunk < 0 ? chunks_for(region_size) - 1U : (unsigned)damage->chunk;

    slot_path(damage->slot, chunk, path, sizeof(path));
    switch (damage->action) {
    case 2:
        return unlink(path);
    case 3:
        return write_file(path, NULL, 0U);
    default:
        break;
    }
    if (read_file(path, bytes, ZPLC_RETAIN_CHUNK_SIZE, &length) != 0) {
        return -1;
    }
    if (damage->action == 0) {
        size_t at = damage->offset < 0 ? length - 1U : (size_t)damage->offset;

        bytes[at] ^= 0x01U;
    } else if (damage->action == 1) {
        length = damage->keep < length ? damage->keep : length;
    } else {
        memset(bytes + length, 0xE5, 16U);
        length += 16U;
    }
    return write_file(path, bytes, length);
}

/* RT-025: damage to a record is detected by its checksum and the other record is restored. */
static void test_damage_falls_back_to_the_other_slot(void)
{
    static const damage_t damages[] = {
        { "magic byte flipped",              'b',  0, 0,  0L, 0U },
        { "format version flipped",          'b',  0, 0,  4L, 0U },
        { "sequence flipped",                'b',  0, 0,  8L, 0U },
        { "identity word flipped",           'b',  0, 0, 12L, 0U },
        { "layout hash flipped",             'b',  0, 0, 20L, 0U },
        { "payload length flipped",          'b',  0, 0, 24L, 0U },
        { "payload byte of the first chunk", 'b',  0, 0, 40L, 0U },
        { "payload byte of the last chunk",  'b', -1, 0, 10L, 0U },
        { "checksum flipped",                'b', -1, 0, -1L, 0U },
        { "last chunk truncated",            'b', -1, 1,  0L, 5U },
        { "first chunk cut inside header",   'b',  0, 1,  0L, 10U },
        { "middle chunk missing",            'b',  1, 2,  0L, 0U },
        { "first chunk empty",               'b',  0, 3,  0L, 0U },
        { "bytes appended to a chunk",       'b', -1, 4,  0L, 0U }
    };
    uint8_t older[REGION_BIG], newer[REGION_BIG];
    size_t index;
    zplc_retain_status_t status;

    printf("\n=== Test: damage to the newest record falls back to the other slot ===\n");
    for (index = 0U; index < sizeof(damages) / sizeof(damages[0]); index++) {
        char message[128];
        zplc_retain_reason_t reason;

        if (make_two_records(REGION_BIG, older, newer) != 0) {
            TEST_ASSERT(0, "two records created");
            return;
        }
        if (damage_slot(&damages[index], REGION_BIG) != 0) {
            TEST_ASSERT(0, "damage applied");
            remove_root();
            return;
        }
        memset(g_region, 0x5A, REGION_BIG);
        (void)start_module(REGION_BIG, 0U);
        reason = zplc_retain_restore(&ID1, 0U);
        (void)snprintf(message, sizeof(message), "%s: the previous record is restored", damages[index].name);
        TEST_ASSERT(reason == ZPLC_RETAIN_RESTORED && memcmp(g_region, older, REGION_BIG) == 0, message);
        zplc_retain_last_status(&status);
        (void)snprintf(message, sizeof(message), "%s: status carries the older sequence", damages[index].name);
        TEST_ASSERT(status.sequence == 1U, message);
        /* A later save must not overwrite the good record. */
        g_region[0] ^= 0xFFU;
        TEST_ASSERT(zplc_retain_save(&ID1, 100U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                    "a save after the fallback is written");
        remove_root();
    }

    printf("\n=== Test: both records damaged ===\n");
    TEST_ASSERT(make_two_records(REGION_SMALL, older, newer) == 0, "two records created");
    {
        const damage_t a = { "a", 'a', 0, 0, 40L, 0U };
        const damage_t b = { "b", 'b', 0, 0, 40L, 0U };

        TEST_ASSERT(damage_slot(&a, REGION_SMALL) == 0 && damage_slot(&b, REGION_SMALL) == 0,
                    "both records damaged");
    }
    memset(g_region, 0x5A, REGION_SMALL);
    (void)start_module(REGION_SMALL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_CORRUPT, "corrupt is reported");
    memset(g_expect, 0, REGION_SMALL);
    TEST_ASSERT(memcmp(g_region, g_expect, REGION_SMALL) == 0, "the region is initialised to zero");
    TEST_ASSERT(zplc_retain_save(&ID1, 1U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "a save repairs the store");
    (void)start_module(REGION_SMALL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_RESTORED, "the repaired store restores");
    remove_root();
}

/* RT-025: a record is restored only when the program identity matches; otherwise the region is initialised and the status says why. */
static void test_identity_mismatch(void)
{
    uint8_t first[REGION_SMALL];

    printf("\n=== Test: a record of another program is not restored ===\n");
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 0U) == 0, "module over a clean directory");
    (void)zplc_retain_restore(&ID1, 0U);
    fill(g_region, REGION_SMALL, 11U);
    memcpy(first, g_region, REGION_SMALL);
    TEST_ASSERT(zplc_retain_save(&ID1, 1U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "record of program 1 written");

    (void)start_module(REGION_SMALL, 0U);
    memset(g_region, 0xAA, REGION_SMALL);
    TEST_ASSERT(zplc_retain_restore(&ID2, 0U) == ZPLC_RETAIN_IDENTITY_MISMATCH,
                "program 2 sees an identity mismatch");
    memset(g_expect, 0, REGION_SMALL);
    TEST_ASSERT(memcmp(g_region, g_expect, REGION_SMALL) == 0, "the region is initialised to zero");
    TEST_ASSERT(strcmp(zplc_retain_reason_string(ZPLC_RETAIN_IDENTITY_MISMATCH), "identity_mismatch") == 0,
                "the reason token is identity_mismatch");

    /* The record of program 1 stays until a newer record replaces it. */
    (void)start_module(REGION_SMALL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_RESTORED, "program 1 still restores");
    TEST_ASSERT(memcmp(g_region, first, REGION_SMALL) == 0, "with its own bytes");

    /* Program 2 writes: the older of two matching candidates wins for each program. */
    (void)start_module(REGION_SMALL, 0U);
    (void)zplc_retain_restore(&ID2, 0U);
    fill(g_region, REGION_SMALL, 22U);
    TEST_ASSERT(zplc_retain_save(&ID2, 2U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "record of program 2 written to the other slot");
    (void)start_module(REGION_SMALL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_RESTORED && memcmp(g_region, first, REGION_SMALL) == 0,
                "program 1 restores its older record");
    fill(g_expect, REGION_SMALL, 22U);
    (void)start_module(REGION_SMALL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID2, 0U) == ZPLC_RETAIN_RESTORED && memcmp(g_region, g_expect, REGION_SMALL) == 0,
                "program 2 restores its own record");
    (void)start_module(REGION_SMALL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID3, 0U) == ZPLC_RETAIN_IDENTITY_MISMATCH,
                "a third program matches neither");
    remove_root();
}

/* RT-025: a record is restored only when the layout matches; otherwise the region is initialised and the status says why. */
static void test_layout_mismatch(void)
{
    uint8_t whole[ZPLC_RETAIN_HEADER_SIZE + 6000U + ZPLC_RETAIN_TRAILER_SIZE];
    uint32_t total = sizeof(whole);
    uint32_t crc;
    unsigned chunk, chunks;
    char path[256];

    printf("\n=== Test: another region size is a layout mismatch ===\n");
    TEST_ASSERT(fresh_root() == 0 && start_module(64U, 0U) == 0, "module over a clean directory, 64 bytes");
    (void)zplc_retain_restore(&ID1, 0U);
    fill(g_region, 64U, 5U);
    TEST_ASSERT(zplc_retain_save(&ID1, 1U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN, "record written");

    TEST_ASSERT(start_module(128U, 0U) == 0, "module over a 128-byte region");
    memset(g_region, 0xAA, 128U);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_LAYOUT_MISMATCH,
                "a bigger region reports a layout mismatch");
    memset(g_expect, 0, 128U);
    TEST_ASSERT(memcmp(g_region, g_expect, 128U) == 0, "the region is initialised to zero");
    TEST_ASSERT(start_module(32U, 0U) == 0, "module over a 32-byte region");
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_LAYOUT_MISMATCH,
                "a smaller region reports a layout mismatch");
    TEST_ASSERT(strcmp(zplc_retain_reason_string(ZPLC_RETAIN_LAYOUT_MISMATCH), "layout_mismatch") == 0,
                "the reason token is layout_mismatch");
    remove_root();

    /* A valid record that a build with a bigger region wrote: bigger than the
     * module's own buffer, so it is checked as a stream. */
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 0U) == 0, "module over a clean directory");
    memset(whole, 0, sizeof(whole));
    memcpy(whole, "ZRTN", 4U);
    whole[4] = ZPLC_RETAIN_FORMAT_VERSION;
    whole[8] = 1U;
    whole[12] = (uint8_t)ID1.crc32; whole[13] = (uint8_t)(ID1.crc32 >> 8);
    whole[14] = (uint8_t)(ID1.crc32 >> 16); whole[15] = (uint8_t)(ID1.crc32 >> 24);
    whole[16] = (uint8_t)ID1.code_size; whole[17] = (uint8_t)(ID1.code_size >> 8);
    whole[24] = (uint8_t)6000U; whole[25] = (uint8_t)(6000U >> 8);
    fill(whole + ZPLC_RETAIN_HEADER_SIZE, 6000U, 3U);
    crc = crc32_of(whole, total - 4U);
    whole[total - 4U] = (uint8_t)crc; whole[total - 3U] = (uint8_t)(crc >> 8);
    whole[total - 2U] = (uint8_t)(crc >> 16); whole[total - 1U] = (uint8_t)(crc >> 24);
    chunks = (total + ZPLC_RETAIN_CHUNK_SIZE - 1U) / ZPLC_RETAIN_CHUNK_SIZE;
    for (chunk = 0U; chunk < chunks; chunk++) {
        size_t offset = (size_t)chunk * ZPLC_RETAIN_CHUNK_SIZE;
        size_t length = total - offset < ZPLC_RETAIN_CHUNK_SIZE ? total - offset : ZPLC_RETAIN_CHUNK_SIZE;

        slot_path('a', chunk, path, sizeof(path));
        (void)write_file(path, whole + offset, length);
    }
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_LAYOUT_MISMATCH,
                "a valid record bigger than the buffer is a layout mismatch, not corruption");
    whole[ZPLC_RETAIN_HEADER_SIZE + 5U] ^= 0x01U;
    slot_path('a', 0U, path, sizeof(path));
    (void)write_file(path, whole, ZPLC_RETAIN_CHUNK_SIZE);
    (void)start_module(REGION_SMALL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_CORRUPT,
                "the same record with a flipped payload byte is corrupt");
    remove_root();
}

/* RT-025: a save that fails at any step never destroys the last good record. */
static void test_power_cut_during_save(void)
{
    unsigned long k;
    int always_restorable = 1;
    int saw_failure = 0;
    int finished = 0;

    printf("\n=== Test: a save that fails at any step leaves the previous record ===\n");
    for (k = 1UL; k < 64UL && finished == 0; k++) {
        uint8_t older[REGION_BIG], newer[REGION_BIG], third[REGION_BIG];
        zplc_retain_save_result_t result;
        zplc_retain_reason_t reason;
        zplc_retain_status_t status;
        int triggered;

        if (make_two_records(REGION_BIG, older, newer) != 0) {
            TEST_ASSERT(0, "two records created");
            return;
        }
        fill(g_region, REGION_BIG, 3U);
        memcpy(third, g_region, REGION_BIG);
        zplc_hal_persist_test_fail_at(k);
        result = zplc_retain_save(&ID1, 30U, ZPLC_RETAIN_SAVE_FORCED);
        triggered = zplc_hal_persist_test_failure_triggered();
        zplc_hal_persist_test_fail_at(0UL);
        if (triggered != 0) {
            saw_failure++;
            zplc_retain_last_status(&status);
            if (result != ZPLC_RETAIN_SAVE_IO_ERROR || status.save_errors != 1U) {
                always_restorable = 0;
            }
        } else {
            finished = 1;
        }

        memset(g_region, 0x5A, REGION_BIG);
        (void)start_module(REGION_BIG, 0U);
        reason = zplc_retain_restore(&ID1, 0U);
        if (reason != ZPLC_RETAIN_RESTORED ||
            memcmp(g_region, triggered != 0 ? newer : third, REGION_BIG) != 0) {
            always_restorable = 0;
        }

        if (triggered != 0) {
            /* The retry is a plain save: same data, next sequence. */
            fill(g_region, REGION_BIG, 3U);
            (void)start_module(REGION_BIG, 0U);
            (void)zplc_retain_restore(&ID1, 0U);
            fill(g_region, REGION_BIG, 3U);
            if (zplc_retain_save(&ID1, 40U, ZPLC_RETAIN_SAVE_FORCED) != ZPLC_RETAIN_SAVE_WRITTEN) {
                always_restorable = 0;
            }
            (void)start_module(REGION_BIG, 0U);
            if (zplc_retain_restore(&ID1, 0U) != ZPLC_RETAIN_RESTORED ||
                memcmp(g_region, third, REGION_BIG) != 0) {
                always_restorable = 0;
            }
        }
        remove_root();
    }
    TEST_ASSERT(saw_failure >= (int)chunks_for(REGION_BIG),
                "the failure was injected at every backend call of a save");
    TEST_ASSERT(always_restorable != 0,
                "after each failure the previous record restores, and a retry succeeds");
}

#if defined(__linux__)
static void test_commit_unknown_is_a_failed_save(void)
{
    uint8_t older[REGION_SMALL], newer[REGION_SMALL];
    zplc_retain_status_t status;

    printf("\n=== Test: a write whose durability is unknown is not reported as saved ===\n");
    TEST_ASSERT(make_two_records(REGION_SMALL, older, newer) == 0, "two records created");
    g_region[0] ^= 0xFFU;
    zplc_hal_persist_test_parent_sync_fail(1);
    TEST_ASSERT(zplc_retain_save(&ID1, 30U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_IO_ERROR,
                "the save reports an error");
    zplc_hal_persist_test_parent_sync_fail(0);
    zplc_retain_last_status(&status);
    TEST_ASSERT(status.last_error == ZPLC_HAL_COMMIT_UNKNOWN && status.save_errors == 1U && status.saves == 2U,
                "status records the unknown commit and counts no new save");
    TEST_ASSERT(zplc_retain_save(&ID1, 31U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "the retry is written");
    zplc_retain_last_status(&status);
    TEST_ASSERT(status.sequence == 3U, "the retry reuses the sequence that was not confirmed");
    remove_root();
}
#endif

/* RT-026: an unchanged region is not written, so the flash is not worn for nothing. */
static void test_unchanged_payload_is_not_written(void)
{
    unsigned long before;

    printf("\n=== Test: an unchanged region is not written ===\n");
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_BIG, 0U) == 0, "module over a clean directory");
    (void)zplc_retain_restore(&ID1, 0U);
    fill(g_region, REGION_BIG, 8U);
    TEST_ASSERT(zplc_retain_save(&ID1, 1U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN, "first save written");
    zplc_hal_persist_test_fail_at(1000000UL); /* counts operations, never fires */
    before = zplc_hal_persist_test_operation_count();
    TEST_ASSERT(zplc_retain_save(&ID1, 2U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_UNCHANGED,
                "second save of the same bytes is skipped");
    TEST_ASSERT(zplc_hal_persist_test_operation_count() == before, "the skip makes no backend call");
    g_region[REGION_BIG - 1U] ^= 1U;
    TEST_ASSERT(zplc_retain_save(&ID1, 3U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "one changed byte is written");
    TEST_ASSERT(zplc_hal_persist_test_operation_count() - before == chunks_for(REGION_BIG),
                "a save is one backend call per chunk");
    TEST_ASSERT(zplc_retain_save(&ID2, 4U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "the same bytes under another program identity are written");
    zplc_hal_persist_test_fail_at(0UL);
    remove_root();
}

/* RT-026: periodic saves keep a minimum interval, and the interval survives a wrap of the clock. */
static void test_periodic_interval(void)
{
    printf("\n=== Test: periodic saves respect the minimum interval ===\n");
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 1000U) == 0, "module with a 1000 ms interval");
    (void)zplc_retain_restore(&ID1, 0U);
    g_region[0] = 1U;
    TEST_ASSERT(zplc_retain_save(&ID1, 500U, ZPLC_RETAIN_SAVE_PERIODIC) == ZPLC_RETAIN_SAVE_TOO_SOON,
                "periodic save before the interval is skipped");
    TEST_ASSERT(zplc_retain_save(&ID1, 999U, ZPLC_RETAIN_SAVE_PERIODIC) == ZPLC_RETAIN_SAVE_TOO_SOON,
                "periodic save one millisecond early is skipped");
    TEST_ASSERT(zplc_retain_save(&ID1, 1000U, ZPLC_RETAIN_SAVE_PERIODIC) == ZPLC_RETAIN_SAVE_WRITTEN,
                "periodic save at the interval is written");
    g_region[0] = 2U;
    TEST_ASSERT(zplc_retain_save(&ID1, 1500U, ZPLC_RETAIN_SAVE_PERIODIC) == ZPLC_RETAIN_SAVE_TOO_SOON,
                "the interval restarts at the last write");
    TEST_ASSERT(zplc_retain_save(&ID1, 1501U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "a forced save ignores the interval");
    g_region[0] = 3U;
    TEST_ASSERT(zplc_retain_save(&ID1, 2400U, ZPLC_RETAIN_SAVE_PERIODIC) == ZPLC_RETAIN_SAVE_TOO_SOON,
                "a forced save restarts the interval too");
    TEST_ASSERT(zplc_retain_save(&ID1, 2501U, ZPLC_RETAIN_SAVE_PERIODIC) == ZPLC_RETAIN_SAVE_WRITTEN,
                "periodic save written after the interval");
    remove_root();

    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 1000U) == 0, "module over a clean directory");
    (void)zplc_retain_restore(&ID1, 0xFFFFFF00U);
    g_region[0] = 1U;
    TEST_ASSERT(zplc_retain_save(&ID1, 0x000000FFU, ZPLC_RETAIN_SAVE_PERIODIC) == ZPLC_RETAIN_SAVE_TOO_SOON,
                "the interval is measured across a wrap of the 32-bit clock");
    TEST_ASSERT(zplc_retain_save(&ID1, 0x000004F0U, ZPLC_RETAIN_SAVE_PERIODIC) == ZPLC_RETAIN_SAVE_WRITTEN,
                "and is satisfied after the wrap");
    remove_root();

    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 0U) == 0, "module with periodic saves disabled");
    (void)zplc_retain_restore(&ID1, 0U);
    g_region[0] = 1U;
    TEST_ASSERT(zplc_retain_save(&ID1, 100000U, ZPLC_RETAIN_SAVE_PERIODIC) == ZPLC_RETAIN_SAVE_DISABLED,
                "an interval of 0 disables periodic saves");
    TEST_ASSERT(zplc_retain_save(&ID1, 100001U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "a forced save still works");
    remove_root();
}

/* RT-025: a backend failure is reported in the status and a record that could not be read is not overwritten. */
static void test_backend_errors(void)
{
    zplc_retain_status_t status;
    char path[256];
    char not_a_directory[256];

    printf("\n=== Test: backend failures are reported, never hidden ===\n");
    /* The persistence root is a file: every load and save fails with a real error. */
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 0U) == 0, "module over a clean directory");
    (void)snprintf(not_a_directory, sizeof(not_a_directory), "%s/file", g_root);
    TEST_ASSERT(write_file(not_a_directory, (const uint8_t *)"x", 1U) == 0, "a plain file created");
    (void)setenv("ZPLC_PERSIST_ROOT", not_a_directory, 1);
    memset(g_region, 0xAA, REGION_SMALL);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_IO_ERROR, "a backend that fails on both slots is an io error");
    memset(g_expect, 0, REGION_SMALL);
    TEST_ASSERT(memcmp(g_region, g_expect, REGION_SMALL) == 0, "the region is initialised to zero");
    g_region[0] = 1U;
    TEST_ASSERT(zplc_retain_save(&ID1, 1U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_NOT_READY,
                "saves are refused, so a record that could not be read is not overwritten");
    zplc_retain_last_status(&status);
    TEST_ASSERT(status.reason == ZPLC_RETAIN_IO_ERROR && status.save_errors == 1U && status.last_error != 0,
                "status says io_error, counts the refused save and keeps the HAL result");
    TEST_ASSERT(strcmp(zplc_retain_reason_string(ZPLC_RETAIN_IO_ERROR), "io_error") == 0,
                "the reason token is io_error");
    (void)setenv("ZPLC_PERSIST_ROOT", g_root, 1);
    (void)unlink(not_a_directory);
    remove_root();

    /* One slot unreadable (the backend fails once): a damaged record, and a save repairs it. */
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 0U) == 0, "module over a clean directory");
    zplc_hal_persist_test_fail_at(1UL);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_CORRUPT, "one unreadable slot is a damaged record");
    zplc_hal_persist_test_fail_at(0UL);
    g_region[0] = 1U;
    TEST_ASSERT(zplc_retain_save(&ID1, 1U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN,
                "and the next save is written");
    (void)start_module(REGION_SMALL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_RESTORED && g_region[0] == 1U,
                "the repaired store restores");
    remove_root();

    /* An empty file is a structurally invalid record: the HAL says corrupt. */
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 0U) == 0, "module over a clean directory");
    slot_path('a', 0U, path, sizeof(path));
    (void)write_file(path, NULL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_CORRUPT, "an empty record is corrupt");
    remove_root();
}

/* RT-025: a cold reset initialises the region and the stored record, so the old values do not come back. */
static void test_cold_reset(void)
{
    zplc_retain_status_t status;

    printf("\n=== Test: cold reset initialises the region and the stored record ===\n");
    TEST_ASSERT(fresh_root() == 0 && start_module(REGION_SMALL, 0U) == 0, "module over a clean directory");
    (void)zplc_retain_restore(&ID1, 0U);
    fill(g_region, REGION_SMALL, 6U);
    TEST_ASSERT(zplc_retain_save(&ID1, 1U, ZPLC_RETAIN_SAVE_FORCED) == ZPLC_RETAIN_SAVE_WRITTEN, "record written");
    TEST_ASSERT(zplc_retain_cold_reset(&ID1, 2U) == ZPLC_RETAIN_SAVE_WRITTEN, "cold reset writes the initialised region");
    memset(g_expect, 0, REGION_SMALL);
    TEST_ASSERT(memcmp(g_region, g_expect, REGION_SMALL) == 0, "the region is zero");
    zplc_retain_last_status(&status);
    TEST_ASSERT(status.reason == ZPLC_RETAIN_RESET && status.sequence == 2U, "status says reset, sequence 2");
    TEST_ASSERT(strcmp(zplc_retain_reason_string(ZPLC_RETAIN_RESET), "reset") == 0, "the reason token is reset");

    memset(g_region, 0x5A, REGION_SMALL);
    (void)start_module(REGION_SMALL, 0U);
    TEST_ASSERT(zplc_retain_restore(&ID1, 0U) == ZPLC_RETAIN_RESTORED && memcmp(g_region, g_expect, REGION_SMALL) == 0,
                "a restart restores zeros, not the old values");
    remove_root();
}

int main(void)
{
    test_identity_from_artifact();
    test_init_validation();
    test_first_start_has_no_record();
    test_round_trip();
    test_record_layout_on_disk();
    test_sequence_across_many_saves();
    test_damage_falls_back_to_the_other_slot();
    test_identity_mismatch();
    test_layout_mismatch();
    test_power_cut_during_save();
#if defined(__linux__)
    test_commit_unknown_is_a_failed_save();
#endif
    test_unchanged_payload_is_not_written();
    test_periodic_interval();
    test_backend_errors();
    test_cold_reset();

    printf("\n%d checks, %d failed\n", test_count, fail_count);
    (void)unsetenv("ZPLC_PERSIST_ROOT");
    return fail_count == 0 ? 0 : 1;
}
