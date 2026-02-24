/**
 * ZPLC Configuration Manager
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_CONFIG_H
#define ZPLC_CONFIG_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize the configuration system.
 * 
 * @return 0 on success, negative on error.
 */
int zplc_config_init(void);

/**
 * @brief Save the current configuration to persistent storage.
 * 
 * @return 0 on success, negative on error.
 */
int zplc_config_save(void);

/**
 * @brief Reset configuration to defaults.
 * 
 * @return 0 on success, negative on error.
 */
int zplc_config_reset(void);

/* ============================================================================
 * Networking Configuration
 * ============================================================================ */

void zplc_config_get_hostname(char *buf, size_t len);
void zplc_config_set_hostname(const char *name);

bool zplc_config_get_dhcp(void);
void zplc_config_set_dhcp(bool enabled);

void zplc_config_get_ip(char *buf, size_t len);
void zplc_config_set_ip(const char *ip);

/* ============================================================================
 * Protocol Configuration
 * ============================================================================ */

uint16_t zplc_config_get_modbus_id(void);
void zplc_config_set_modbus_id(uint16_t id);

int zplc_modbus_init(void);

void zplc_config_get_mqtt_broker(char *buf, size_t len);
void zplc_config_set_mqtt_broker(const char *broker);

uint16_t zplc_config_get_mqtt_port(void);
void zplc_config_set_mqtt_port(uint16_t port);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_CONFIG_H */
