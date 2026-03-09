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

typedef enum {
  ZPLC_MQTT_SECURITY_NONE = 0,
  ZPLC_MQTT_SECURITY_TLS_NO_VERIFY = 1,
  ZPLC_MQTT_SECURITY_TLS_SERVER_VERIFY = 2,
  ZPLC_MQTT_SECURITY_TLS_MUTUAL = 3,
} zplc_mqtt_security_t;

typedef enum {
  ZPLC_MODBUS_PARITY_NONE = 0,
  ZPLC_MODBUS_PARITY_EVEN = 1,
  ZPLC_MODBUS_PARITY_ODD = 2,
} zplc_modbus_parity_t;

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

bool zplc_config_get_modbus_tcp_enabled(void);
void zplc_config_set_modbus_tcp_enabled(bool enabled);

uint16_t zplc_config_get_modbus_tcp_port(void);
void zplc_config_set_modbus_tcp_port(uint16_t port);

bool zplc_config_get_modbus_rtu_enabled(void);
void zplc_config_set_modbus_rtu_enabled(bool enabled);

uint32_t zplc_config_get_modbus_rtu_baud(void);
void zplc_config_set_modbus_rtu_baud(uint32_t baud);

zplc_modbus_parity_t zplc_config_get_modbus_rtu_parity(void);
void zplc_config_set_modbus_rtu_parity(zplc_modbus_parity_t parity);

int zplc_modbus_init(void);
int zplc_mqtt_init(void);

void zplc_config_get_mqtt_broker(char *buf, size_t len);
void zplc_config_set_mqtt_broker(const char *broker);

void zplc_config_get_mqtt_client_id(char *buf, size_t len);
void zplc_config_set_mqtt_client_id(const char *client_id);

void zplc_config_get_mqtt_topic_namespace(char *buf, size_t len);
void zplc_config_set_mqtt_topic_namespace(const char *topic_namespace);

uint16_t zplc_config_get_mqtt_port(void);
void zplc_config_set_mqtt_port(uint16_t port);

bool zplc_config_get_mqtt_enabled(void);
void zplc_config_set_mqtt_enabled(bool enabled);

void zplc_config_get_mqtt_username(char *buf, size_t len);
void zplc_config_set_mqtt_username(const char *username);

void zplc_config_get_mqtt_password(char *buf, size_t len);
void zplc_config_set_mqtt_password(const char *password);

uint16_t zplc_config_get_mqtt_keepalive_sec(void);
void zplc_config_set_mqtt_keepalive_sec(uint16_t keepalive_sec);

uint32_t zplc_config_get_mqtt_publish_interval_ms(void);
void zplc_config_set_mqtt_publish_interval_ms(uint32_t publish_interval_ms);

bool zplc_config_get_mqtt_clean_session(void);
void zplc_config_set_mqtt_clean_session(bool clean_session);

zplc_mqtt_security_t zplc_config_get_mqtt_security(void);
void zplc_config_set_mqtt_security(zplc_mqtt_security_t security);

void zplc_config_get_mqtt_ca_cert_path(char *buf, size_t len);
void zplc_config_set_mqtt_ca_cert_path(const char *path);

void zplc_config_get_mqtt_client_cert_path(char *buf, size_t len);
void zplc_config_set_mqtt_client_cert_path(const char *path);

void zplc_config_get_mqtt_client_key_path(char *buf, size_t len);
void zplc_config_set_mqtt_client_key_path(const char *path);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_CONFIG_H */
