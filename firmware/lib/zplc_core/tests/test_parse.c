/**
 * @file test_parse.c
 * @brief Strict parsing of operator and cloud input (firmware/app/src/zplc_parse.h).
 *
 * The shell used to store atoi(val) cast to the field's type: "70000" became a port of 4464, "abc" became 0,
 * wifi security 256 became 0 (open), and a hex digit that was not one decoded as a zero byte. These cases run the
 * helpers the shell and the cloud clients now use, on the host, under the address and undefined-behaviour
 * sanitizers.
 *
 * SPDX-License-Identifier: MIT
 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "zplc_parse.h"

#define UNTOUCHED 0xA5A5A5A5U

static void say(const char *name) { (void)printf("%s...\n", name); }

static uint32_t parse_u(const char *text, int base, uint32_t min, uint32_t max, int *rc) {
  uint32_t out = UNTOUCHED;
  *rc = zplc_parse_uint(text, base, min, max, &out);
  return out;
}

static void test_a_port_above_what_the_field_holds_is_an_error(void) {
  uint32_t number = UNTOUCHED;
  say("test_a_port_above_what_the_field_holds_is_an_error");
  assert(zplc_config_parse_number("modbus_tcp_port", "70000", &number) == -ERANGE);
  assert(number == UNTOUCHED); /* the old path stored (uint16_t)70000 == 4464 */
  assert(zplc_config_parse_number("mqtt_port", "65536", &number) == -ERANGE);
  assert(zplc_config_parse_number("modbus_tcp_client_port", "99999", &number) == -ERANGE);
  assert(number == UNTOUCHED);
  assert(zplc_config_parse_number("mqtt_port", "65535", &number) == 0 && number == 65535U);
  assert(zplc_config_parse_number("mqtt_port", "1883", &number) == 0 && number == 1883U);
}

static void test_a_value_that_would_truncate_into_a_narrow_field_is_an_error(void) {
  uint32_t number = UNTOUCHED;
  say("test_a_value_that_would_truncate_into_a_narrow_field_is_an_error");
  assert(zplc_config_parse_number("wifi_security", "256", &number) == -ERANGE); /* (uint8_t)256 is 0, open */
  assert(zplc_config_parse_number("modbus_tcp_client_unit_id", "300", &number) == -ERANGE);
  assert(zplc_config_parse_number("modbus_rtu_client_slave_id", "256", &number) == -ERANGE);
  assert(number == UNTOUCHED);
  assert(zplc_config_parse_number("modbus_tcp_client_unit_id", "255", &number) == 0 && number == 255U);
}

static void test_an_enumeration_accepts_its_enumerators_only(void) {
  uint32_t number = UNTOUCHED;
  say("test_an_enumeration_accepts_its_enumerators_only");
  assert(zplc_config_parse_number("modbus_rtu_parity", "2", &number) == 0 && number == 2U);
  assert(zplc_config_parse_number("modbus_rtu_parity", "3", &number) == -ERANGE);
  assert(zplc_config_parse_number("mqtt_publish_qos", "2", &number) == 0);
  assert(zplc_config_parse_number("mqtt_publish_qos", "3", &number) == -ERANGE);
  assert(zplc_config_parse_number("mqtt_lwt_qos", "7", &number) == -ERANGE);
  assert(zplc_config_parse_number("mqtt_profile", "4", &number) == 0);
  assert(zplc_config_parse_number("mqtt_profile", "5", &number) == -ERANGE);
  assert(zplc_config_parse_number("mqtt_protocol", "2", &number) == -ERANGE);
  assert(zplc_config_parse_number("mqtt_transport", "3", &number) == 0);
  assert(zplc_config_parse_number("mqtt_transport", "4", &number) == -ERANGE);
  assert(zplc_config_parse_number("mqtt_security", "3", &number) == 0);
  assert(zplc_config_parse_number("mqtt_security", "4", &number) == -ERANGE);
}

static void test_text_that_is_not_a_whole_number_is_an_error(void) {
  static const char *const bad[] = {"", "abc", "12abc", "1 2", " 12", "12 ", "-1", "+5", "1.5", "0x10", "1e3", "\t7"};
  uint32_t number = UNTOUCHED;
  size_t index;
  say("test_text_that_is_not_a_whole_number_is_an_error");
  for (index = 0U; index < sizeof(bad) / sizeof(bad[0]); index++) {
    assert(zplc_config_parse_number("mqtt_port", bad[index], &number) == -EINVAL);
    assert(number == UNTOUCHED);
  }
  assert(zplc_config_parse_number("mqtt_port", NULL, &number) == -EINVAL);
}

static void test_a_32_bit_field_takes_its_whole_range_and_nothing_beyond(void) {
  uint32_t number = UNTOUCHED;
  say("test_a_32_bit_field_takes_its_whole_range_and_nothing_beyond");
  assert(zplc_config_parse_number("modbus_rtu_baud", "4294967295", &number) == 0 && number == 4294967295U);
  assert(zplc_config_parse_number("modbus_rtu_baud", "4294967296", &number) == -ERANGE);
  assert(zplc_config_parse_number("azure_sas_expiry_s", "99999999999999999999999", &number) == -ERANGE);
  assert(zplc_config_parse_number("mqtt_publish_interval", "0", &number) == 0 && number == 0U);
}

static void test_a_key_that_takes_no_number_is_not_found(void) {
  uint32_t number = UNTOUCHED;
  uint32_t max = 0U;
  say("test_a_key_that_takes_no_number_is_not_found");
  assert(zplc_config_parse_number("hostname", "7", &number) == -ENOENT);
  assert(zplc_config_number_max("mqtt_broker", &max) == -ENOENT);
  assert(zplc_config_number_max(NULL, &max) == -EINVAL);
  assert(zplc_config_number_max("mqtt_port", &max) == 0 && max == 65535U);
}

static void test_every_numeric_key_has_one_range_and_the_documented_ones_are_present(void) {
  static const char *const expected[] = {"wifi_security",
                                         "modbus_id",
                                         "modbus_tcp_port",
                                         "modbus_rtu_baud",
                                         "modbus_rtu_parity",
                                         "modbus_rtu_client_slave_id",
                                         "modbus_rtu_client_poll_ms",
                                         "modbus_tcp_client_port",
                                         "modbus_tcp_client_unit_id",
                                         "modbus_tcp_client_poll_ms",
                                         "modbus_tcp_client_timeout_ms",
                                         "mqtt_profile",
                                         "mqtt_protocol",
                                         "mqtt_transport",
                                         "mqtt_port",
                                         "mqtt_keepalive",
                                         "mqtt_publish_interval",
                                         "mqtt_publish_qos",
                                         "mqtt_subscribe_qos",
                                         "mqtt_session_expiry",
                                         "mqtt_security",
                                         "mqtt_lwt_qos",
                                         "azure_sas_expiry_s"};
  size_t index;
  size_t other;
  say("test_every_numeric_key_has_one_range_and_the_documented_ones_are_present");
  assert(sizeof(zplc_config_numbers) / sizeof(zplc_config_numbers[0]) == sizeof(expected) / sizeof(expected[0]));
  for (index = 0U; index < sizeof(expected) / sizeof(expected[0]); index++) {
    uint32_t max = 0U;
    assert(zplc_config_number_max(expected[index], &max) == 0);
    assert(max >= 1U);
    for (other = index + 1U; other < sizeof(expected) / sizeof(expected[0]); other++) {
      assert(strcmp(expected[index], expected[other]) != 0);
    }
  }
}

static void test_a_number_with_a_base_prefix_is_read_in_that_base_only_when_asked(void) {
  int rc;
  say("test_a_number_with_a_base_prefix_is_read_in_that_base_only_when_asked");
  assert(parse_u("0x1F", 0, 0U, UINT16_MAX, &rc) == 31U && rc == 0);
  assert(parse_u("31", 0, 0U, UINT16_MAX, &rc) == 31U && rc == 0);
  assert(parse_u("0x", 0, 0U, UINT16_MAX, &rc) == UNTOUCHED && rc == -EINVAL);      /* "0" then "x": trailing text */
  assert(parse_u("0x10000", 0, 0U, UINT16_MAX, &rc) == UNTOUCHED && rc == -ERANGE); /* a pc of 65536 wrapped to 0 */
  assert(parse_u("70000", 0, 0U, UINT16_MAX, &rc) == UNTOUCHED && rc == -ERANGE);
  assert(parse_u("0x10", 10, 0U, UINT16_MAX, &rc) == UNTOUCHED && rc == -EINVAL);
}

static void test_the_minimum_is_enforced(void) {
  int rc;
  say("test_the_minimum_is_enforced");
  assert(parse_u("0", 10, 1U, 8192U, &rc) == UNTOUCHED && rc == -ERANGE);
  assert(parse_u("1", 10, 1U, 8192U, &rc) == 1U && rc == 0);
  assert(parse_u("8192", 10, 1U, 8192U, &rc) == 8192U && rc == 0);
  assert(parse_u("8193", 10, 1U, 8192U, &rc) == UNTOUCHED && rc == -ERANGE);
}

static void test_a_json_integer_ends_at_a_delimiter(void) {
  int32_t value = 77;
  say("test_a_json_integer_ends_at_a_delimiter");
  assert(zplc_json_int(" 200,\"x\":1}", -1000, 1000, &value) == 0 && value == 200);
  assert(zplc_json_int("-3}", -1000, 1000, &value) == 0 && value == -3);
  assert(zplc_json_int("404", -1000, 1000, &value) == 0 && value == 404);
  value = 77;
  assert(zplc_json_int("12abc", -1000, 1000, &value) == -EINVAL && value == 77);
  assert(zplc_json_int("1.5", -1000, 1000, &value) == -EINVAL && value == 77);
  assert(zplc_json_int("\"8883\"", -1000, 1000, &value) == -EINVAL && value == 77);
  assert(zplc_json_int("null", -1000, 1000, &value) == -EINVAL && value == 77);
  assert(zplc_json_int("-", -1000, 1000, &value) == -EINVAL && value == 77);
  assert(zplc_json_int("1001,", -1000, 1000, &value) == -ERANGE && value == 77);
  assert(zplc_json_int("99999999999999999999,", INT32_MIN, INT32_MAX, &value) == -ERANGE && value == 77);
  assert(zplc_json_int("2147483648,", INT32_MIN, INT32_MAX, &value) == -ERANGE && value == 77);
  assert(zplc_json_int("-2147483648,", INT32_MIN, INT32_MAX, &value) == 0 && value == INT32_MIN);
}

static void test_a_scanned_integer_reports_where_it_stopped(void) {
  int32_t value = 0;
  const char *end = NULL;
  uint32_t unsigned_value = 0U;
  say("test_a_scanned_integer_reports_where_it_stopped");
  assert(zplc_scan_int("202/?$rid=1&retry-after=3", 0, 999, &value, &end) == 0 && value == 202 && *end == '/');
  assert(zplc_scan_uint("3&x", 10, 0U, UINT32_MAX, &unsigned_value, &end) == 0 && unsigned_value == 3U && *end == '&');
  assert(zplc_scan_uint("abc", 10, 0U, UINT32_MAX, &unsigned_value, &end) == -EINVAL);
}

static void test_hex_decodes_pairs_and_refuses_anything_else(void) {
  uint8_t out[4];
  say("test_hex_decodes_pairs_and_refuses_anything_else");
  assert(zplc_hex_decode("00fFa5", out, sizeof(out)) == 3);
  assert(out[0] == 0x00U && out[1] == 0xFFU && out[2] == 0xA5U);
  assert(zplc_hex_decode("", out, sizeof(out)) == 0);
  assert(zplc_hex_decode("abc", out, sizeof(out)) == -EINVAL); /* odd length */
  assert(zplc_hex_decode("zz", out, sizeof(out)) == -EINVAL);  /* decoded as 0x00 before */
  assert(zplc_hex_decode("0g", out, sizeof(out)) == -EINVAL);
  assert(zplc_hex_decode("0x", out, sizeof(out)) == -EINVAL);
  assert(zplc_hex_decode("+1", out, sizeof(out)) == -EINVAL); /* strtoul accepted a sign */
  assert(zplc_hex_decode(" 1", out, sizeof(out)) == -EINVAL); /* and a blank */
  assert(zplc_hex_decode("0102030405", out, sizeof(out)) == -ENOSPC);
  assert(zplc_hex_decode("01020304", out, sizeof(out)) == 4 && out[3] == 4U);
}

int main(void) {
  test_a_port_above_what_the_field_holds_is_an_error();
  test_a_value_that_would_truncate_into_a_narrow_field_is_an_error();
  test_an_enumeration_accepts_its_enumerators_only();
  test_text_that_is_not_a_whole_number_is_an_error();
  test_a_32_bit_field_takes_its_whole_range_and_nothing_beyond();
  test_a_key_that_takes_no_number_is_not_found();
  test_every_numeric_key_has_one_range_and_the_documented_ones_are_present();
  test_a_number_with_a_base_prefix_is_read_in_that_base_only_when_asked();
  test_the_minimum_is_enforced();
  test_a_json_integer_ends_at_a_delimiter();
  test_a_scanned_integer_reports_where_it_stopped();
  test_hex_decodes_pairs_and_refuses_anything_else();
  say("test_parse: all passed");
  return 0;
}
