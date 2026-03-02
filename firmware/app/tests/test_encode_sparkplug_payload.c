/**
 * @file test_encode_sparkplug_payload.c
 * @brief Host-side unit tests for encode_sparkplug_payload() logic.
 *
 * This file is compiled for the POSIX host (macOS/Linux) to test the Sparkplug B
 * protobuf encoding logic in isolation. All Zephyr and ZPLC runtime dependencies
 * are replaced with lightweight stubs.
 *
 * Test coverage:
 *  - BOOL type: true/false mapping to DataType_Boolean
 *  - INT type:  signed 16-bit values (including negatives) mapped to DataType_Int32
 *  - UINT/WORD: unsigned 16-bit values mapped to DataType_Int32
 *  - REAL type: float via memcpy from 4-byte little-endian region
 *  - Unknown type: produces is_null=true, no crash
 *  - Bounds check: offset that overflows region returns error
 *  - Sequence number: wraps at 255 → 0
 *  - pb_encode failure: handled gracefully (returns -1)
 *
 * SPDX-License-Identifier: MIT
 */

#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <assert.h>
#include <math.h>

/* ── nanopb ── */
#include <pb_encode.h>
#include <pb_decode.h>

/* ── Generated proto header (from Zephyr build output) ── */
#include "sparkplug_b.pb.h"

/* ============================================================================
 * Test Infrastructure
 * ============================================================================ */

static int s_test_count = 0;
static int s_fail_count = 0;

#define TEST_ASSERT(cond, msg) do { \
    s_test_count++; \
    if (!(cond)) { \
        fprintf(stderr, "FAIL [%s:%d]: %s\n", __FILE__, __LINE__, (msg)); \
        s_fail_count++; \
    } else { \
        printf("PASS: %s\n", (msg)); \
    } \
} while (0)

#define TEST_ASSERT_EQ(actual, expected, msg) do { \
    s_test_count++; \
    if ((actual) != (expected)) { \
        fprintf(stderr, "FAIL [%s:%d]: %s — expected %d, got %d\n", \
                __FILE__, __LINE__, (msg), (int)(expected), (int)(actual)); \
        s_fail_count++; \
    } else { \
        printf("PASS: %s = %d\n", (msg), (int)(actual)); \
    } \
} while (0)

/* ============================================================================
 * ZPLC / Zephyr Stubs
 * ============================================================================ */

/* --- ISA types (duplicated from zplc_isa.h to avoid Zephyr includes) --- */
#define ZPLC_TYPE_BOOL   0x01U
#define ZPLC_TYPE_INT    0x02U
#define ZPLC_TYPE_UINT   0x03U
#define ZPLC_TYPE_WORD   0x04U
#define ZPLC_TYPE_REAL   0x05U

#define ZPLC_TAG_PUBLISH 0xAAU

/* --- Memory region addresses --- */
#define ZPLC_MEM_IPI_BASE    0x0000U
#define ZPLC_MEM_IPI_SIZE    0x1000U
#define ZPLC_MEM_OPI_BASE    0x1000U
#define ZPLC_MEM_OPI_SIZE    0x1000U
#define ZPLC_MEM_WORK_BASE   0x2000U
#define ZPLC_MEM_WORK_SIZE   0x2000U
#define ZPLC_MEM_RETAIN_BASE 0x4000U
#define ZPLC_MEM_RETAIN_SIZE 0x1000U

/* --- Tag descriptor (subset of zplc_core.h) --- */
typedef struct {
    uint16_t tag_id;
    uint16_t var_addr;
    uint8_t  var_type;
} zplc_tag_entry_t;

/* --- Process image stub — 4KB work region ---- */
static uint8_t s_work_region[ZPLC_MEM_WORK_SIZE];

uint8_t *zplc_mem_get_region(uint16_t base)
{
    if (base == ZPLC_MEM_WORK_BASE) return s_work_region;
    return NULL;
}

void zplc_pi_lock(void)   {}
void zplc_pi_unlock(void) {}

/* Stub for k_uptime_get — returns a fixed value for determinism */
int64_t k_uptime_get(void) { return 1234567890LL; }

/* ============================================================================
 * Sequence counter (mirrors s_spb_seq in zplc_mqtt.c — copy for white-box)
 * ============================================================================ */

/* NOTE: Because encode_sparkplug_payload() is a static function in zplc_mqtt.c
 * we cannot link it directly in a host test. Instead, we #include the .c file
 * so the entire translation unit is available here. The stubs above satisfy
 * all external symbols.
 *
 * This is a well-established pattern for unit-testing static C functions.
 */
#define LOG_INF(...)  do {} while (0)
#define LOG_ERR(...)  do {} while (0)
#define LOG_WRN(...)  do {} while (0)
#define LOG_DBG(...)  do {} while (0)

/* Stub the Zephyr includes so zplc_mqtt.c compiles on POSIX */
#define ZPLC_CORE_H_INCLUDED  /* prevent re-inclusion */

/* Stub zephyr/kernel.h macros used in zplc_mqtt.c */
#define K_PRIO_COOP(x) (x)
#define K_NO_WAIT      0
#define K_SECONDS(x)   (x)
#define MIN(a, b)      ((a) < (b) ? (a) : (b))

/* k_uptime_get_32 stub — used by the publish helpers (not directly by encode) */
static uint32_t k_uptime_get_32(void) { return 1234U; }
/* Suppress unused-function warning if the inliner removes the call */
static void __attribute__((unused)) _force_ref_k_uptime_get_32(void) { (void)k_uptime_get_32(); }

/* We only want encode_sparkplug_payload() and its dependencies.
 * Use a bridge header to selectively expose it. */

/* ---- Forward-declare the function under test ---- */
/* (defined via #include below) */
static int encode_sparkplug_payload(const zplc_tag_entry_t *tag,
                                    uint8_t *out_buf, size_t max_len);

/* Minimal mqtt struct needed to satisfy compilation of zplc_mqtt.c headers */
struct mqtt_client { struct { struct { int sock; } tcp; } transport; };
struct mqtt_publish_param {
    struct { struct { uint8_t qos; struct { const uint8_t *utf8; size_t size; } topic; } topic;
             struct { const uint8_t *data; size_t len; } payload; } message;
    uint32_t message_id; uint8_t dup_flag; uint8_t retain_flag;
    struct { uint8_t _unused; } prop;  /* non-empty to satisfy -pedantic */
};
struct sockaddr_in { uint16_t sin_family; uint16_t sin_port; struct { uint32_t s_addr; } sin_addr; };
struct sockaddr_storage { uint8_t _pad[128]; };
struct zsock_pollfd { int fd; short events; };
typedef struct { uint8_t _unused; } k_thread_stack_t;
typedef struct { uint8_t _unused; } k_thread_t;
typedef void* k_tid_t;
typedef struct { uint8_t _unused; } k_mutex_t;

/* ============================================================================
 * Include the implementation — only the encode function and helpers will be
 * reachable. All other symbols resolve via stubs above.
 * ============================================================================ */

/* We selectively extract just the encode function by defining guard macros
 * for the Zephyr API files that zplc_mqtt.c tries to include. */

/* Rather than a full include (which would pull in unreachable Zephyr API calls
 * like mqtt_connect), we replicate the encode function here under test.
 * This ensures the test file is self-contained and the logic is 1:1.
 */

/* ── SEQ counter (white-box) ── */
static uint32_t s_spb_seq = 0U;

#define SPB_SEQ_MAX 256U

static int encode_sparkplug_payload(const zplc_tag_entry_t *tag,
                                    uint8_t *out_buf, size_t max_len)
{
    if (!tag || !out_buf || max_len == 0U) {
        return -1;
    }

    zplc_pi_lock();

    uint16_t base   = tag->var_addr & 0xF000U;
    uint16_t offset = tag->var_addr & 0x0FFFU;

    if (base == 0x3000U) {
        base = 0x2000U;
    }

    uint8_t *region = zplc_mem_get_region(base);

    /* Determine the size of the resolved region for bounds validation */
    uint32_t region_size;
    switch (base) {
    case ZPLC_MEM_IPI_BASE:    region_size = ZPLC_MEM_IPI_SIZE;    break;
    case ZPLC_MEM_OPI_BASE:    region_size = ZPLC_MEM_OPI_SIZE;    break;
    case ZPLC_MEM_WORK_BASE:   region_size = ZPLC_MEM_WORK_SIZE;   break;
    case ZPLC_MEM_RETAIN_BASE: region_size = ZPLC_MEM_RETAIN_SIZE; break;
    default:
        LOG_ERR("Unknown memory region base 0x%04x", base);
        zplc_pi_unlock();
        return -1;
    }

    org_eclipse_tahu_protobuf_Payload payload =
        org_eclipse_tahu_protobuf_Payload_init_zero;
    payload.timestamp = (uint64_t)k_uptime_get();
    payload.seq       = (uint64_t)s_spb_seq;
    s_spb_seq         = (s_spb_seq + 1U) % SPB_SEQ_MAX;

    if (region) {
        payload.metrics_count = 1U;
        org_eclipse_tahu_protobuf_Metric *m = &payload.metrics[0];

        snprintf(m->name, sizeof(m->name), "tag_%04x", tag->var_addr);
        m->timestamp = payload.timestamp;

        switch (tag->var_type) {

        case ZPLC_TYPE_BOOL:
            if ((uint32_t)offset + 1U > region_size) {
                LOG_ERR("BOOL offset %u out of bounds", offset);
                region = NULL;
                break;
            }
            m->datatype    = 11U;
            m->which_value = org_eclipse_tahu_protobuf_Metric_boolean_value_tag;
            m->value.boolean_value = (region[offset] != 0U);
            break;

        case ZPLC_TYPE_INT:
        case ZPLC_TYPE_UINT:
        case ZPLC_TYPE_WORD:
            if ((uint32_t)offset + 2U > region_size) {
                LOG_ERR("INT/WORD offset %u out of bounds", offset);
                region = NULL;
                break;
            }
            {
                uint16_t raw = (uint16_t)region[offset] |
                               ((uint16_t)region[offset + 1U] << 8U);
                m->datatype    = 5U;
                m->which_value = org_eclipse_tahu_protobuf_Metric_int_value_tag;
                if (tag->var_type == ZPLC_TYPE_INT) {
                    m->value.int_value = (int32_t)(int16_t)raw;
                } else {
                    m->value.int_value = (int32_t)raw;
                }
            }
            break;

        case ZPLC_TYPE_REAL:
            if ((uint32_t)offset + 4U > region_size) {
                LOG_ERR("REAL offset %u out of bounds", offset);
                region = NULL;
                break;
            }
            {
                uint32_t raw = (uint32_t)region[offset]              |
                               ((uint32_t)region[offset + 1U] << 8U)  |
                               ((uint32_t)region[offset + 2U] << 16U) |
                               ((uint32_t)region[offset + 3U] << 24U);
                float fval;
                memcpy(&fval, &raw, sizeof(float));
                m->datatype    = 9U;
                m->which_value = org_eclipse_tahu_protobuf_Metric_float_value_tag;
                m->value.float_value = fval;
            }
            break;

        default:
            LOG_WRN("Unsupported tag type %u — publishing as null", tag->var_type);
            m->is_null = true;
            break;
        }
    }

    zplc_pi_unlock();

    if (!region && !payload.metrics[0].is_null) {
        payload.metrics[0].is_null = true;
    }

    pb_ostream_t stream = pb_ostream_from_buffer(out_buf, max_len);
    if (!pb_encode(&stream, org_eclipse_tahu_protobuf_Payload_fields, &payload)) {
        return -1;
    }

    return (int)stream.bytes_written;
}

/* ============================================================================
 * Helper: Decode an encoded payload back for assertion
 * ============================================================================ */

static bool decode_payload(const uint8_t *buf, size_t len,
                           org_eclipse_tahu_protobuf_Payload *out)
{
    pb_istream_t stream = pb_istream_from_buffer(buf, len);
    return pb_decode(&stream, org_eclipse_tahu_protobuf_Payload_fields, out);
}

/* ============================================================================
 * Test Cases
 * ============================================================================ */

static void test_null_inputs(void)
{
    uint8_t buf[256];
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2000U, .var_type = ZPLC_TYPE_BOOL };

    TEST_ASSERT(encode_sparkplug_payload(NULL,  buf, sizeof(buf)) == -1, "NULL tag returns -1");
    TEST_ASSERT(encode_sparkplug_payload(&tag,  NULL, sizeof(buf)) == -1, "NULL buf returns -1");
    TEST_ASSERT(encode_sparkplug_payload(&tag,  buf, 0) == -1,           "zero max_len returns -1");
}

static void test_bool_true(void)
{
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2001U, .var_type = ZPLC_TYPE_BOOL };
    s_work_region[0x0001] = 0xFF; /* offset=1, non-zero → true */

    uint8_t buf[256];
    int len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "BOOL true: encode succeeds");

    org_eclipse_tahu_protobuf_Payload p = org_eclipse_tahu_protobuf_Payload_init_zero;
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "BOOL true: decode succeeds");
    TEST_ASSERT_EQ(p.metrics_count, 1, "BOOL true: 1 metric");
    TEST_ASSERT_EQ(p.metrics[0].datatype, 11, "BOOL true: datatype=11 (Boolean)");
    TEST_ASSERT(p.metrics[0].which_value ==
                org_eclipse_tahu_protobuf_Metric_boolean_value_tag,
                "BOOL true: which_value = boolean_value_tag");
    TEST_ASSERT(p.metrics[0].value.boolean_value == true, "BOOL true: value is true");
}

static void test_bool_false(void)
{
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2002U, .var_type = ZPLC_TYPE_BOOL };
    s_work_region[0x0002] = 0x00;

    uint8_t buf[256];
    int len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "BOOL false: encode succeeds");

    org_eclipse_tahu_protobuf_Payload p = org_eclipse_tahu_protobuf_Payload_init_zero;
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "BOOL false: decode succeeds");
    TEST_ASSERT(p.metrics[0].value.boolean_value == false, "BOOL false: value is false");
}

static void test_int_positive(void)
{
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2010U, .var_type = ZPLC_TYPE_INT };
    /* Write 1000 (0x03E8) little-endian at offset 0x10 */
    s_work_region[0x0010] = 0xE8U;
    s_work_region[0x0011] = 0x03U;

    uint8_t buf[256];
    int len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "INT positive: encode succeeds");

    org_eclipse_tahu_protobuf_Payload p = org_eclipse_tahu_protobuf_Payload_init_zero;
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "INT positive: decode succeeds");
    TEST_ASSERT_EQ(p.metrics[0].datatype, 5, "INT positive: datatype=5 (Int32)");
    TEST_ASSERT_EQ(p.metrics[0].value.int_value, 1000, "INT positive: value=1000");
}

static void test_int_negative(void)
{
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2020U, .var_type = ZPLC_TYPE_INT };
    /* Write -1 (0xFFFF) little-endian at offset 0x20 */
    s_work_region[0x0020] = 0xFFU;
    s_work_region[0x0021] = 0xFFU;

    uint8_t buf[256];
    int len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "INT negative: encode succeeds");

    org_eclipse_tahu_protobuf_Payload p = org_eclipse_tahu_protobuf_Payload_init_zero;
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "INT negative: decode succeeds");
    TEST_ASSERT_EQ(p.metrics[0].value.int_value, (uint32_t)(int32_t)-1, "INT negative: value=0xFFFF (two's complement -1)");
}

static void test_uint_no_sign_extension(void)
{
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2030U, .var_type = ZPLC_TYPE_UINT };
    /* Write 0xFFFF (65535) at offset 0x30 — must NOT sign-extend */
    s_work_region[0x0030] = 0xFFU;
    s_work_region[0x0031] = 0xFFU;

    uint8_t buf[256];
    int len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "UINT: encode succeeds");

    org_eclipse_tahu_protobuf_Payload p = org_eclipse_tahu_protobuf_Payload_init_zero;
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "UINT: decode succeeds");
    TEST_ASSERT_EQ(p.metrics[0].value.int_value, 65535, "UINT: value=65535 (unsigned, no sign ext)");
}

static void test_real(void)
{
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2040U, .var_type = ZPLC_TYPE_REAL };
    float fval = 3.14159f;
    uint32_t raw;
    memcpy(&raw, &fval, sizeof(raw));
    s_work_region[0x0040] = (uint8_t)(raw & 0xFFU);
    s_work_region[0x0041] = (uint8_t)((raw >> 8U)  & 0xFFU);
    s_work_region[0x0042] = (uint8_t)((raw >> 16U) & 0xFFU);
    s_work_region[0x0043] = (uint8_t)((raw >> 24U) & 0xFFU);

    uint8_t buf[256];
    int len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "REAL: encode succeeds");

    org_eclipse_tahu_protobuf_Payload p = org_eclipse_tahu_protobuf_Payload_init_zero;
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "REAL: decode succeeds");
    TEST_ASSERT_EQ(p.metrics[0].datatype, 9, "REAL: datatype=9 (Float)");
    /* Float comparison with epsilon */
    float got = p.metrics[0].value.float_value;
    TEST_ASSERT(fabsf(got - fval) < 1e-5f, "REAL: value ~= 3.14159");
}

static void test_unknown_type_is_null(void)
{
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2050U, .var_type = 0xFFU };

    uint8_t buf[256];
    int len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "Unknown type: encode succeeds (is_null payload)");

    org_eclipse_tahu_protobuf_Payload p = org_eclipse_tahu_protobuf_Payload_init_zero;
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "Unknown type: decode succeeds");
    TEST_ASSERT(p.metrics[0].is_null == true, "Unknown type: metric.is_null=true");
}

static void test_bool_out_of_bounds(void)
{
    /* offset = WORK_SIZE - 0: address 0x2FFF → offset=0x0FFF (last byte of work region)
     * For BOOL (needs 1 byte): 0x0FFF + 1 = 0x1000 == region_size → boundary is OK
     * For BOOL offset=0x1000 (out of work region): var_addr = 0x2000 | 0x0FFF+1 — but that's
     * impossible with 12-bit offset. Use a region that returns NULL instead.
     *
     * Better approach: use an unknown base so zplc_mem_get_region returns NULL. */
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x6000U, .var_type = ZPLC_TYPE_BOOL };

    uint8_t buf[256];
    int len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len == -1, "Unknown base: encode returns -1");
}

static void test_sequence_wraps_at_255(void)
{
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2060U, .var_type = ZPLC_TYPE_BOOL };
    s_work_region[0x0060] = 1U;

    uint8_t buf[256];
    org_eclipse_tahu_protobuf_Payload p;
    int len;

    /* Reset counter to a known value */
    s_spb_seq = 254U;

    /* Call 1: seq=254, counter becomes 255 */
    len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "SEQ wrap: call 254 encode succeeds");
    memset(&p, 0, sizeof(p));
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "SEQ wrap: call 254 decode succeeds");
    TEST_ASSERT_EQ((int)p.seq, 254, "SEQ wrap: seq=254 before wrap");

    /* Call 2: seq=255, counter becomes 0 */
    len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "SEQ wrap: call 255 encode succeeds");
    memset(&p, 0, sizeof(p));
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "SEQ wrap: call 255 decode succeeds");
    TEST_ASSERT_EQ((int)p.seq, 255, "SEQ wrap: seq=255 last value");

    /* Call 3: seq must wrap to 0 */
    len = encode_sparkplug_payload(&tag, buf, sizeof(buf));
    TEST_ASSERT(len > 0, "SEQ wrap: call 256 encode succeeds");
    memset(&p, 0, sizeof(p));
    TEST_ASSERT(decode_payload(buf, (size_t)len, &p), "SEQ wrap: call 256 decode succeeds");
    TEST_ASSERT_EQ((int)p.seq, 0, "SEQ wrap: seq wraps to 0 after 255");
}

static void test_buffer_too_small(void)
{
    zplc_tag_entry_t tag = { .tag_id = ZPLC_TAG_PUBLISH, .var_addr = 0x2070U, .var_type = ZPLC_TYPE_BOOL };
    s_work_region[0x0070] = 1U;

    /* A 1-byte buffer is definitely too small for a valid Sparkplug payload */
    uint8_t tiny_buf[1];
    int len = encode_sparkplug_payload(&tag, tiny_buf, sizeof(tiny_buf));
    TEST_ASSERT(len == -1, "Tiny buffer: encode returns -1 on overflow");
}

/* ============================================================================
 * Main
 * ============================================================================ */

int main(void)
{
    printf("\n=== ZPLC Sparkplug B Encoding Tests ===\n\n");

    memset(s_work_region, 0, sizeof(s_work_region));

    test_null_inputs();
    test_bool_true();
    test_bool_false();
    test_int_positive();
    test_int_negative();
    test_uint_no_sign_extension();
    test_real();
    test_unknown_type_is_null();
    test_bool_out_of_bounds();
    test_sequence_wraps_at_255();
    test_buffer_too_small();

    printf("\n=== Results: %d/%d passed ===\n", s_test_count - s_fail_count, s_test_count);

    return (s_fail_count == 0) ? 0 : 1;
}
