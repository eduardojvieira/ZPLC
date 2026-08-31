#include "zplc_mqtt_command.h"
#include <errno.h>
#include <string.h>
#include <zephyr/ztest.h>
#include <zplc_isa.h>

static void expect_decode(uint8_t type, const char *text,
                          const uint8_t *expected, size_t expected_size) {
  uint8_t bytes[4] = {0U};
  size_t size = 0U;

  zassert_ok(zplc_mqtt_command_decode(type, (const uint8_t *)text, strlen(text),
                                      bytes, &size),
             "%s", text);
  zassert_equal(size, expected_size, "decoded size");
  zassert_mem_equal(bytes, expected, size, "decoded bytes");
}

ZTEST(mqtt_command, test_decodes_all_supported_command_types) {
  uint8_t longest[ZPLC_MQTT_COMMAND_MAX_PAYLOAD];
  const uint8_t bool_true[] = {1U};
  const uint8_t bool_false[] = {0U};
  const uint8_t int_min[] = {0x00U, 0x80U};
  const uint8_t int_max[] = {0xFFU, 0x7FU};
  const uint8_t one[] = {1U, 0U};
  const uint8_t uint_max[] = {0xFFU, 0xFFU};
  const uint8_t real[] = {0x00U, 0x00U, 0x60U, 0x40U};

  expect_decode(ZPLC_TYPE_BOOL, "true", bool_true, sizeof(bool_true));
  expect_decode(ZPLC_TYPE_BOOL, "FALSE", bool_false, sizeof(bool_false));
  expect_decode(ZPLC_TYPE_BOOL, "1", bool_true, sizeof(bool_true));
  expect_decode(ZPLC_TYPE_BOOL, "0", bool_false, sizeof(bool_false));
  expect_decode(ZPLC_TYPE_INT, "-32768", int_min, sizeof(int_min));
  expect_decode(ZPLC_TYPE_INT, "32767", int_max, sizeof(int_max));
  expect_decode(ZPLC_TYPE_UINT, "65535", uint_max, sizeof(uint_max));
  expect_decode(ZPLC_TYPE_WORD, "65535", uint_max, sizeof(uint_max));
  expect_decode(ZPLC_TYPE_REAL, "3.5", real, sizeof(real));
  memset(longest, '0', sizeof(longest));
  longest[sizeof(longest) - 1U] = '1';
  {
    uint8_t bytes[4] = {0U};
    size_t size = 0U;

    zassert_ok(zplc_mqtt_command_decode(ZPLC_TYPE_UINT, longest,
                                        sizeof(longest), bytes, &size),
               "maximum payload length");
    zassert_mem_equal(bytes, one, sizeof(one), "maximum payload bytes");
    zassert_equal(size, 2U, "maximum payload size");
  }
}

static void expect_rejected(uint8_t type, const char *text) {
  uint8_t bytes[4] = {0xA5U, 0xA5U, 0xA5U, 0xA5U};
  const uint8_t sentinel[4] = {0xA5U, 0xA5U, 0xA5U, 0xA5U};
  size_t size = 99U;

  zassert_true(zplc_mqtt_command_decode(type, (const uint8_t *)text,
                                        strlen(text), bytes, &size) < 0,
               "%s", text);
  zassert_mem_equal(bytes, sentinel, sizeof(bytes), "bytes preserved");
  zassert_equal(size, 99U, "size preserved");
}

ZTEST(mqtt_command, test_rejects_invalid_input_without_mutating_outputs) {
  static const uint8_t embedded_nul[] = {'1', '\0', '2'};
  uint8_t oversized[512];
  uint8_t bytes[4] = {0xA5U, 0xA5U, 0xA5U, 0xA5U};
  const uint8_t sentinel[4] = {0xA5U, 0xA5U, 0xA5U, 0xA5U};
  size_t size = 99U;

  memset(oversized, '1', sizeof(oversized));
  expect_rejected(ZPLC_TYPE_BOOL, "2");
  expect_rejected(ZPLC_TYPE_INT, "12junk");
  expect_rejected(ZPLC_TYPE_INT, "32768");
  expect_rejected(ZPLC_TYPE_INT, "-32769");
  expect_rejected(ZPLC_TYPE_UINT, "-1");
  expect_rejected(ZPLC_TYPE_UINT, "65536");
  expect_rejected(ZPLC_TYPE_REAL, "nan");
  expect_rejected(ZPLC_TYPE_REAL, "inf");
  expect_rejected(ZPLC_TYPE_REAL, "1e100");
  expect_rejected(ZPLC_TYPE_REAL, "1.0junk");
  expect_rejected(ZPLC_TYPE_BOOL, " true");
  expect_rejected(ZPLC_TYPE_BOOL, "true ");
  zassert_equal(zplc_mqtt_command_decode(ZPLC_TYPE_BOOL, embedded_nul,
                                         sizeof(embedded_nul), bytes, &size),
                -EINVAL, "embedded NUL");
  zassert_equal(zplc_mqtt_command_decode(ZPLC_TYPE_BOOL, oversized,
                                         sizeof(oversized), bytes, &size),
                -EMSGSIZE, "oversized");
  zassert_equal(
      zplc_mqtt_command_decode(0xFFU, (const uint8_t *)"1", 1U, bytes, &size),
      -ENOTSUP, "unknown type");
  zassert_equal(
      zplc_mqtt_command_decode(ZPLC_TYPE_BOOL, NULL, 1U, bytes, &size), -EINVAL,
      "NULL payload");
  zassert_equal(zplc_mqtt_command_decode(ZPLC_TYPE_BOOL, (const uint8_t *)"",
                                         0U, bytes, &size),
                -EINVAL, "empty");
  zassert_equal(zplc_mqtt_command_decode(ZPLC_TYPE_BOOL, (const uint8_t *)"1",
                                         1U, NULL, &size),
                -EINVAL, "NULL bytes");
  zassert_equal(zplc_mqtt_command_decode(ZPLC_TYPE_BOOL, (const uint8_t *)"1",
                                         1U, bytes, NULL),
                -EINVAL, "NULL size");
  zassert_mem_equal(bytes, sentinel, sizeof(bytes),
                    "bytes preserved after all rejects");
  zassert_equal(size, 99U, "size preserved after all rejects");
}

ZTEST_SUITE(mqtt_command, NULL, NULL, NULL, NULL, NULL);
