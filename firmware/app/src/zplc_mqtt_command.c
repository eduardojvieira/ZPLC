/**
 * @file zplc_mqtt_command.c
 * @brief Strict textual MQTT command decoder.
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_mqtt_command.h"

#include <ctype.h>
#include <errno.h>
#include <float.h>
#include <limits.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <zplc_isa.h>

_Static_assert(sizeof(float) == 4U, "ZPLC REAL requires 32-bit float");
_Static_assert(FLT_RADIX == 2, "ZPLC REAL requires binary float");
_Static_assert(FLT_MANT_DIG == 24, "ZPLC REAL requires IEEE-754 binary32");
_Static_assert(FLT_MIN_EXP == -125 && FLT_MAX_EXP == 128,
               "ZPLC REAL requires IEEE-754 binary32 exponent range");

int zplc_mqtt_command_decode(uint8_t var_type, const uint8_t *payload,
                             size_t payload_len, uint8_t *out_bytes,
                             size_t *out_size) {
  char text[ZPLC_MQTT_COMMAND_MAX_PAYLOAD + 1U];
  char *end;
  uint8_t bytes[4U];
  size_t size;

  if (payload == NULL || out_bytes == NULL || out_size == NULL ||
      payload_len == 0U) {
    return -EINVAL;
  }
  if (payload_len > ZPLC_MQTT_COMMAND_MAX_PAYLOAD) {
    return -EMSGSIZE;
  }
  for (size_t i = 0U; i < payload_len; i++) {
    if (payload[i] == '\0' || isspace((unsigned char)payload[i])) {
      return -EINVAL;
    }
  }
  memcpy(text, payload, payload_len);
  text[payload_len] = '\0';

  switch (var_type) {
  case ZPLC_TYPE_BOOL:
    if (strcmp(text, "0") == 0 || strcasecmp(text, "false") == 0) {
      bytes[0] = 0U;
    } else if (strcmp(text, "1") == 0 || strcasecmp(text, "true") == 0) {
      bytes[0] = 1U;
    } else {
      return -EINVAL;
    }
    size = 1U;
    break;
  case ZPLC_TYPE_INT: {
    long value;

    errno = 0;
    value = strtol(text, &end, 10);
    if (errno == ERANGE || end == text || *end != '\0' || value < INT16_MIN ||
        value > INT16_MAX) {
      return -EINVAL;
    }
    bytes[0] = (uint8_t)((uint16_t)value & 0xFFU);
    bytes[1] = (uint8_t)(((uint16_t)value >> 8U) & 0xFFU);
    size = 2U;
    break;
  }
  case ZPLC_TYPE_UINT:
  case ZPLC_TYPE_WORD: {
    unsigned long value;

    if (text[0] == '-') {
      return -EINVAL;
    }
    errno = 0;
    value = strtoul(text, &end, 10);
    if (errno == ERANGE || end == text || *end != '\0' || value > UINT16_MAX) {
      return -EINVAL;
    }
    bytes[0] = (uint8_t)((uint16_t)value & 0xFFU);
    bytes[1] = (uint8_t)(((uint16_t)value >> 8U) & 0xFFU);
    size = 2U;
    break;
  }
  case ZPLC_TYPE_REAL: {
    float value;
    uint32_t raw;

    errno = 0;
    value = strtof(text, &end);
    if (errno == ERANGE || end == text || *end != '\0' || !isfinite(value)) {
      return -EINVAL;
    }
    memcpy(&raw, &value, sizeof(raw));
    bytes[0] = (uint8_t)(raw & 0xFFU);
    bytes[1] = (uint8_t)((raw >> 8U) & 0xFFU);
    bytes[2] = (uint8_t)((raw >> 16U) & 0xFFU);
    bytes[3] = (uint8_t)((raw >> 24U) & 0xFFU);
    size = sizeof(bytes);
    break;
  }
  default:
    return -ENOTSUP;
  }

  memcpy(out_bytes, bytes, size);
  *out_size = size;
  return 0;
}
