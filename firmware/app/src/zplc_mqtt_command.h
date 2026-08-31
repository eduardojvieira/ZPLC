/**
 * @file zplc_mqtt_command.h
 * @brief Strict textual MQTT command decoder.
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_MQTT_COMMAND_H
#define ZPLC_MQTT_COMMAND_H

#include <stddef.h>
#include <stdint.h>

#define ZPLC_MQTT_COMMAND_MAX_PAYLOAD 511U

/** Decode a complete textual MQTT command into little-endian PLC bytes.
 * Outputs are changed only on success. */
int zplc_mqtt_command_decode(uint8_t var_type, const uint8_t *payload,
                             size_t payload_len, uint8_t *out_bytes,
                             size_t *out_size);

#endif /* ZPLC_MQTT_COMMAND_H */
