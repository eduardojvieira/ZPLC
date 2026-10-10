/**
 * @file zplc_parse.h
 * @brief Strict parsing of numbers and hex that operators and cloud services send.
 *
 * SPDX-License-Identifier: MIT
 *
 * atoi() answers 0 for "abc" and wraps "70000" into a uint16_t as 4464; strtoul() with a NULL end pointer accepts
 * "12abc" and a hex digit that is not one decodes as 0. A shell that stores such a value changes the configuration
 * of a device that may be running a machine. Every function here either returns the whole, in-range value or an
 * error and leaves its output untouched, so the caller can refuse the request before any state changes.
 *
 * The header is portable C99 with no Zephyr dependency, so tests/test_parse.c of the core runs it on the host
 * under the address and undefined-behaviour sanitizers. The Zephyr sources include it; the table of numeric
 * configuration keys is here for the same reason: the ranges are data a host test can check.
 */
#ifndef ZPLC_PARSE_H
#define ZPLC_PARSE_H

#include <errno.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Reads a non-negative integer at the start of `text`.
 *
 * The number must start with a digit: no blank, no sign. `base` is 10, 16 or 0 (a 0x prefix means 16, a leading 0
 * means 8, as strtoul). The value must lie in [min, max].
 *
 * @param end Where parsing stopped, or NULL.
 * @return 0, -EINVAL when there is no number at the start of `text`, -ERANGE when it is outside [min, max]
 *         (or outside what an unsigned long holds). `*out` is written only on 0.
 */
static inline int zplc_scan_uint(const char *text, int base, uint32_t min, uint32_t max, uint32_t *out,
                                 const char **end) {
  char *stop = NULL;
  unsigned long value;

  if (text == NULL || out == NULL || text[0] < '0' || text[0] > '9') {
    return -EINVAL;
  }
  errno = 0;
  value = strtoul(text, &stop, base);
  if (stop == text) {
    return -EINVAL;
  }
  if (errno == ERANGE || value > (unsigned long)max || value < (unsigned long)min) {
    return -ERANGE;
  }
  *out = (uint32_t)value;
  if (end != NULL) {
    *end = stop;
  }
  return 0;
}

/** @brief The whole of `text` is one non-negative integer in [min, max]: "12abc", " 12" and "-1" are -EINVAL. */
static inline int zplc_parse_uint(const char *text, int base, uint32_t min, uint32_t max, uint32_t *out) {
  const char *end = NULL;
  uint32_t value = 0U;
  int rc = zplc_scan_uint(text, base, min, max, &value, &end);

  if (rc != 0) {
    return rc;
  }
  if (*end != '\0') {
    return -EINVAL;
  }
  *out = value;
  return 0;
}

/**
 * @brief Reads a decimal integer, with an optional leading minus and leading blanks, at the start of `text`.
 *
 * For a number inside a JSON document or a topic: what may follow it is the caller's decision (`*end`).
 * @return 0, -EINVAL when there is no number, -ERANGE when it is outside [min, max]. `*out` only on 0.
 */
static inline int zplc_scan_int(const char *text, int32_t min, int32_t max, int32_t *out, const char **end) {
  const char *cursor = text;
  char *stop = NULL;
  long value;

  if (text == NULL || out == NULL) {
    return -EINVAL;
  }
  while (*cursor == ' ' || *cursor == '\t' || *cursor == '\r' || *cursor == '\n') {
    cursor++;
  }
  if (!((*cursor >= '0' && *cursor <= '9') ||
        (*cursor == '-' && cursor[1] >= '0' && cursor[1] <= '9'))) {
    return -EINVAL;
  }
  errno = 0;
  value = strtol(cursor, &stop, 10);
  if (errno == ERANGE || value < (long)min || value > (long)max) {
    return -ERANGE;
  }
  *out = (int32_t)value;
  if (end != NULL) {
    *end = stop;
  }
  return 0;
}

/**
 * @brief An integer value of a JSON object: it must end at a delimiter, so "12", "-3" and " 200," are accepted
 *        and "12abc", "1.5" and the string "\"8883\"" are -EINVAL.
 */
static inline int zplc_json_int(const char *text, int32_t min, int32_t max, int32_t *out) {
  const char *end = NULL;
  int32_t value = 0;
  int rc = zplc_scan_int(text, min, max, &value, &end);

  if (rc != 0) {
    return rc;
  }
  if (!(*end == '\0' || *end == ',' || *end == '}' || *end == ']' || *end == ' ' || *end == '\t' ||
        *end == '\r' || *end == '\n')) {
    return -EINVAL;
  }
  *out = value;
  return 0;
}

/**
 * @brief Decodes pairs of hex digits into bytes.
 * @return The number of bytes, -EINVAL for an odd length or a character that is not a hex digit, -ENOSPC when
 *         the bytes do not fit `out_len`. Bytes already written are not meaningful on an error.
 */
static inline int zplc_hex_decode(const char *hex, uint8_t *out, size_t out_len) {
  size_t length;
  size_t index;

  if (hex == NULL || out == NULL) {
    return -EINVAL;
  }
  length = strlen(hex);
  if (length % 2U != 0U) {
    return -EINVAL;
  }
  if (length / 2U > out_len) {
    return -ENOSPC;
  }
  for (index = 0U; index < length / 2U; index++) {
    unsigned nibble[2];
    size_t half;

    for (half = 0U; half < 2U; half++) {
      char digit = hex[index * 2U + half];

      if (digit >= '0' && digit <= '9') {
        nibble[half] = (unsigned)(digit - '0');
      } else if (digit >= 'a' && digit <= 'f') {
        nibble[half] = (unsigned)(digit - 'a') + 10U;
      } else if (digit >= 'A' && digit <= 'F') {
        nibble[half] = (unsigned)(digit - 'A') + 10U;
      } else {
        return -EINVAL;
      }
    }
    out[index] = (uint8_t)((nibble[0] << 4) | nibble[1]);
  }
  return (int)(length / 2U);
}

/**
 * @brief The numeric keys of `zplc config set`, each with the largest value its field holds.
 *
 * The field type fixes the maximum (uint8_t 255, uint16_t 65535, uint32_t 4294967295) or, for an enumeration,
 * the last enumerator: a value above it used to be truncated into the field (port 70000 became 4464, wifi
 * security 256 became 0, "open") or cast into an enum that has no such member.
 */
typedef struct {
  const char *key;
  uint32_t max;
} zplc_config_number_t;

static const zplc_config_number_t zplc_config_numbers[] = {
    {"wifi_security", 255U},               /* uint8_t */
    {"modbus_id", 65535U},                 /* uint16_t */
    {"modbus_tcp_port", 65535U},           /* uint16_t */
    {"modbus_rtu_baud", 4294967295U},      /* uint32_t */
    {"modbus_rtu_parity", 2U},             /* zplc_modbus_parity_t: NONE, EVEN, ODD */
    {"modbus_rtu_client_slave_id", 255U},  /* uint8_t */
    {"modbus_rtu_client_poll_ms", 4294967295U},
    {"modbus_tcp_client_port", 65535U},    /* uint16_t */
    {"modbus_tcp_client_unit_id", 255U},   /* uint8_t */
    {"modbus_tcp_client_poll_ms", 4294967295U},
    {"modbus_tcp_client_timeout_ms", 4294967295U},
    {"mqtt_profile", 4U},                  /* zplc_mqtt_profile_t: SPARKPLUG_B .. AZURE_EVENT_GRID */
    {"mqtt_protocol", 1U},                 /* zplc_mqtt_protocol_t: 3.1.1, 5.0 */
    {"mqtt_transport", 3U},                /* zplc_mqtt_transport_t: TCP, TLS, WS, WSS */
    {"mqtt_port", 65535U},                 /* uint16_t */
    {"mqtt_keepalive", 65535U},            /* uint16_t */
    {"mqtt_publish_interval", 4294967295U},
    {"mqtt_publish_qos", 2U},              /* zplc_mqtt_qos_t */
    {"mqtt_subscribe_qos", 2U},            /* zplc_mqtt_qos_t */
    {"mqtt_session_expiry", 4294967295U},
    {"mqtt_security", 3U},                 /* zplc_mqtt_security_t: NONE .. TLS_MUTUAL */
    {"mqtt_lwt_qos", 2U},                  /* zplc_mqtt_qos_t */
    {"azure_sas_expiry_s", 4294967295U},
};

/** @brief The largest value of a numeric configuration key, or -ENOENT when `key` is not numeric. */
static inline int zplc_config_number_max(const char *key, uint32_t *max) {
  size_t index;

  if (key == NULL || max == NULL) {
    return -EINVAL;
  }
  for (index = 0U; index < sizeof(zplc_config_numbers) / sizeof(zplc_config_numbers[0]); index++) {
    if (strcmp(zplc_config_numbers[index].key, key) == 0) {
      *max = zplc_config_numbers[index].max;
      return 0;
    }
  }
  return -ENOENT;
}

/**
 * @brief Parses the value of a configuration key.
 * @return 0 and `*out`; -ENOENT when `key` takes no number; -EINVAL when `value` is not a whole decimal number;
 *         -ERANGE when it is above what the key holds. Nothing is written on an error.
 */
static inline int zplc_config_parse_number(const char *key, const char *value, uint32_t *out) {
  uint32_t max = 0U;
  int rc = zplc_config_number_max(key, &max);

  if (rc != 0) {
    return rc;
  }
  return zplc_parse_uint(value, 10, 0U, max, out);
}

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_PARSE_H */
