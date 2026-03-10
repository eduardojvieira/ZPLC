/**
 * ZPLC Configuration Manager
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_CONFIG_H
#define ZPLC_CONFIG_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include <zplc_isa.h>

typedef enum {
  ZPLC_MQTT_SECURITY_NONE = 0,
  ZPLC_MQTT_SECURITY_TLS_NO_VERIFY = 1,
  ZPLC_MQTT_SECURITY_TLS_SERVER_VERIFY = 2,
  ZPLC_MQTT_SECURITY_TLS_MUTUAL = 3,
} zplc_mqtt_security_t;

typedef enum {
  ZPLC_MQTT_PROFILE_SPARKPLUG_B = 0,
  ZPLC_MQTT_PROFILE_GENERIC_BROKER = 1,
  ZPLC_MQTT_PROFILE_AWS_IOT_CORE = 2,
  ZPLC_MQTT_PROFILE_AZURE_IOT_HUB = 3,
  ZPLC_MQTT_PROFILE_AZURE_EVENT_GRID = 4,
} zplc_mqtt_profile_t;

typedef enum {
  ZPLC_MQTT_PROTOCOL_3_1_1 = 0,
  ZPLC_MQTT_PROTOCOL_5_0 = 1,
} zplc_mqtt_protocol_t;

typedef enum {
  ZPLC_MQTT_TRANSPORT_TCP = 0,
  ZPLC_MQTT_TRANSPORT_TLS = 1,
  ZPLC_MQTT_TRANSPORT_WS = 2,
  ZPLC_MQTT_TRANSPORT_WSS = 3,
} zplc_mqtt_transport_t;

typedef enum {
  ZPLC_MQTT_QOS0 = 0,
  ZPLC_MQTT_QOS1 = 1,
  ZPLC_MQTT_QOS2 = 2,
} zplc_mqtt_qos_t;

typedef struct {
  bool connected;
  bool subscribed;
  bool session_present;
  uint8_t profile;
  uint8_t protocol;
  uint8_t transport;
  uint8_t publish_qos;
  uint8_t subscribe_qos;
  bool retain_enabled;
  bool lwt_enabled;
  int32_t last_error;
  uint32_t last_publish_ms;
  uint32_t reconnect_backoff_s;
  char broker[128];
  char client_id[128];
} zplc_mqtt_status_t;

typedef enum {
  ZPLC_MODBUS_PARITY_NONE = 0,
  ZPLC_MODBUS_PARITY_EVEN = 1,
  ZPLC_MODBUS_PARITY_ODD = 2,
} zplc_modbus_parity_t;

typedef void (*zplc_azure_c2d_cb_t)(const uint8_t *payload, size_t len);

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
 * ============================================================================
 */

void zplc_config_get_hostname(char *buf, size_t len);
void zplc_config_set_hostname(const char *name);

bool zplc_config_get_dhcp(void);
void zplc_config_set_dhcp(bool enabled);

void zplc_config_get_ip(char *buf, size_t len);
void zplc_config_set_ip(const char *ip);

/* ============================================================================
 * Protocol Configuration
 * ============================================================================
 */

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

bool zplc_config_get_modbus_rtu_client_enabled(void);
void zplc_config_set_modbus_rtu_client_enabled(bool enabled);

uint8_t zplc_config_get_modbus_rtu_client_slave_id(void);
void zplc_config_set_modbus_rtu_client_slave_id(uint8_t id);

uint32_t zplc_config_get_modbus_rtu_client_poll_ms(void);
void zplc_config_set_modbus_rtu_client_poll_ms(uint32_t ms);

bool zplc_config_get_modbus_tcp_client_enabled(void);
void zplc_config_set_modbus_tcp_client_enabled(bool enabled);

void zplc_config_get_modbus_tcp_client_host(char *buf, size_t len);
void zplc_config_set_modbus_tcp_client_host(const char *host);

uint16_t zplc_config_get_modbus_tcp_client_port(void);
void zplc_config_set_modbus_tcp_client_port(uint16_t port);

uint8_t zplc_config_get_modbus_tcp_client_unit_id(void);
void zplc_config_set_modbus_tcp_client_unit_id(uint8_t id);

uint32_t zplc_config_get_modbus_tcp_client_poll_ms(void);
void zplc_config_set_modbus_tcp_client_poll_ms(uint32_t ms);

uint32_t zplc_config_get_modbus_tcp_client_timeout_ms(void);
void zplc_config_set_modbus_tcp_client_timeout_ms(uint32_t ms);

int zplc_modbus_rtu_client_read_holding(uint8_t slave_id, uint16_t start_reg,
                                        uint16_t count, uint16_t *out);
int zplc_modbus_rtu_client_write_register(uint8_t slave_id, uint16_t reg,
                                          uint16_t value);
int zplc_modbus_rtu_client_write_multiple(uint8_t slave_id, uint16_t start_reg,
                                          uint16_t count,
                                          const uint16_t *values);
int zplc_modbus_rtu_client_read_coils(uint8_t slave_id, uint16_t start_addr,
                                      uint16_t count, uint8_t *out_bits);
int zplc_modbus_rtu_client_write_coil(uint8_t slave_id, uint16_t addr,
                                      bool state);

int zplc_modbus_tcp_client_read_holding(const char *host, uint16_t port,
                                        uint8_t unit_id, uint16_t start_reg,
                                        uint16_t count, uint16_t *out);
int zplc_modbus_tcp_client_write_register(const char *host, uint16_t port,
                                          uint8_t unit_id, uint16_t reg,
                                          uint16_t value);
int zplc_modbus_tcp_client_write_multiple(const char *host, uint16_t port,
                                          uint8_t unit_id, uint16_t start_reg,
                                          uint16_t count,
                                          const uint16_t *values);
int zplc_modbus_tcp_client_read_coils(const char *host, uint16_t port,
                                      uint8_t unit_id, uint16_t start_addr,
                                      uint16_t count, uint8_t *out_bits);
int zplc_modbus_tcp_client_write_coil(const char *host, uint16_t port,
                                      uint8_t unit_id, uint16_t addr,
                                      bool state);

bool zplc_config_get_modbus_tag_override(uint16_t index, uint32_t *address);
int zplc_config_set_modbus_tag_override(uint16_t index, uint32_t address);
int zplc_config_clear_modbus_tag_override(uint16_t index);

int zplc_modbus_init(void);
int zplc_mqtt_init(void);
void zplc_mqtt_request_backoff_reset(void);
void zplc_mqtt_get_status(zplc_mqtt_status_t *status);
void zplc_mqtt_set_azure_c2d_callback(zplc_azure_c2d_cb_t cb);
bool zplc_mqtt_is_connected(void);
int zplc_mqtt_enqueue_publish(const char *topic, const uint8_t *payload,
                              size_t len, uint8_t qos, bool retain);
int zplc_azure_event_grid_publish(const char *event_type, const char *source,
                                  const char *topic, const char *data);

void zplc_config_get_mqtt_broker(char *buf, size_t len);
void zplc_config_set_mqtt_broker(const char *broker);

void zplc_config_get_mqtt_client_id(char *buf, size_t len);
void zplc_config_set_mqtt_client_id(const char *client_id);

void zplc_config_get_mqtt_topic_namespace(char *buf, size_t len);
void zplc_config_set_mqtt_topic_namespace(const char *topic_namespace);

zplc_mqtt_profile_t zplc_config_get_mqtt_profile(void);
void zplc_config_set_mqtt_profile(zplc_mqtt_profile_t profile);

zplc_mqtt_protocol_t zplc_config_get_mqtt_protocol(void);
void zplc_config_set_mqtt_protocol(zplc_mqtt_protocol_t protocol);

zplc_mqtt_transport_t zplc_config_get_mqtt_transport(void);
void zplc_config_set_mqtt_transport(zplc_mqtt_transport_t transport);

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

zplc_mqtt_qos_t zplc_config_get_mqtt_publish_qos(void);
void zplc_config_set_mqtt_publish_qos(zplc_mqtt_qos_t qos);

zplc_mqtt_qos_t zplc_config_get_mqtt_subscribe_qos(void);
void zplc_config_set_mqtt_subscribe_qos(zplc_mqtt_qos_t qos);

bool zplc_config_get_mqtt_publish_retain(void);
void zplc_config_set_mqtt_publish_retain(bool retain);

bool zplc_config_get_mqtt_clean_session(void);
void zplc_config_set_mqtt_clean_session(bool clean_session);

uint32_t zplc_config_get_mqtt_session_expiry_sec(void);
void zplc_config_set_mqtt_session_expiry_sec(uint32_t session_expiry_sec);

zplc_mqtt_security_t zplc_config_get_mqtt_security(void);
void zplc_config_set_mqtt_security(zplc_mqtt_security_t security);

void zplc_config_get_mqtt_websocket_path(char *buf, size_t len);
void zplc_config_set_mqtt_websocket_path(const char *path);

void zplc_config_get_mqtt_alpn(char *buf, size_t len);
void zplc_config_set_mqtt_alpn(const char *alpn);

bool zplc_config_get_mqtt_lwt_enabled(void);
void zplc_config_set_mqtt_lwt_enabled(bool enabled);

void zplc_config_get_mqtt_lwt_topic(char *buf, size_t len);
void zplc_config_set_mqtt_lwt_topic(const char *topic);

void zplc_config_get_mqtt_lwt_payload(char *buf, size_t len);
void zplc_config_set_mqtt_lwt_payload(const char *payload);

zplc_mqtt_qos_t zplc_config_get_mqtt_lwt_qos(void);
void zplc_config_set_mqtt_lwt_qos(zplc_mqtt_qos_t qos);

bool zplc_config_get_mqtt_lwt_retain(void);
void zplc_config_set_mqtt_lwt_retain(bool retain);

void zplc_config_get_mqtt_ca_cert_path(char *buf, size_t len);
void zplc_config_set_mqtt_ca_cert_path(const char *path);

void zplc_config_get_mqtt_client_cert_path(char *buf, size_t len);
void zplc_config_set_mqtt_client_cert_path(const char *path);

void zplc_config_get_mqtt_client_key_path(char *buf, size_t len);
void zplc_config_set_mqtt_client_key_path(const char *path);

/* ============================================================================
 * Time Synchronization Configuration (SNTP / NTP)
 * ============================================================================
 */

bool zplc_config_get_ntp_enabled(void);
void zplc_config_set_ntp_enabled(bool enabled);

void zplc_config_get_ntp_server(char *buf, size_t len);
void zplc_config_set_ntp_server(const char *server);

/* ============================================================================
 * Sparkplug B Configuration
 * ============================================================================
 */

/**
 * @brief Get the Sparkplug B Group ID.
 *
 * Used to build the canonical topic:
 * spBv1.0/{group_id}/{msg_type}/{edge_node_id} Defaults to "ZPLC".
 */
void zplc_config_get_mqtt_group_id(char *buf, size_t len);
void zplc_config_set_mqtt_group_id(const char *group_id);

/* ============================================================================
 * Azure IoT Hub SAS Token Configuration
 * ============================================================================
 */

/**
 * @brief Get/set the base64-encoded SharedAccessKey for Azure IoT Hub SAS auth.
 *
 * This is the "Primary Key" or "Secondary Key" copied verbatim from
 * the Azure Portal (IoT Hub → Devices → {device} → Connection string).
 * Example: "abc123...==" (44 characters for a 32-byte key).
 */
void zplc_config_get_azure_sas_key(char *buf, size_t len);
void zplc_config_set_azure_sas_key(const char *key);

/**
 * @brief Get/set the SAS token validity window in seconds.
 *
 * The token is regenerated at every MQTT connect. The expiry sets how far
 * into the future the token is valid. Default: 3600 (1 hour).
 * Clamped: min 300 (5 min), max 31536000 (365 days).
 */
uint32_t zplc_config_get_azure_sas_expiry_s(void);
void zplc_config_set_azure_sas_expiry_s(uint32_t expiry_s);

/* ============================================================================
 * Azure IoT Hub — Device Twins & Direct Methods
 * ============================================================================
 */

/**
 * @brief Enable/disable Azure IoT Hub Device Twin synchronisation.
 *
 * When enabled the firmware subscribes to $iothub/twin/res/# on connect and
 * issues a GET request ($iothub/twin/GET/?$rid=1) to fetch the full Twin
 * document. Reported properties are published via
 * $iothub/twin/PATCH/properties/reported/?$rid=N.  Default: false.
 */
bool zplc_config_get_azure_twin_enabled(void);
void zplc_config_set_azure_twin_enabled(bool enabled);

/**
 * @brief Enable/disable Azure IoT Hub Direct Methods.
 *
 * When enabled the firmware subscribes to $iothub/methods/POST/# and
 * responds via $iothub/methods/res/{status}/?$rid={rid}.  Default: false.
 */
bool zplc_config_get_azure_direct_methods_enabled(void);
void zplc_config_set_azure_direct_methods_enabled(bool enabled);

bool zplc_config_get_azure_c2d_enabled(void);
void zplc_config_set_azure_c2d_enabled(bool enabled);

bool zplc_config_get_azure_dps_enabled(void);
void zplc_config_set_azure_dps_enabled(bool enabled);

void zplc_config_get_azure_dps_id_scope(char *buf, size_t len);
void zplc_config_set_azure_dps_id_scope(const char *scope);

void zplc_config_get_azure_dps_registration_id(char *buf, size_t len);
void zplc_config_set_azure_dps_registration_id(const char *id);

void zplc_config_get_azure_dps_endpoint(char *buf, size_t len);
void zplc_config_set_azure_dps_endpoint(const char *endpoint);

void zplc_config_get_azure_event_grid_topic(char *buf, size_t len);
void zplc_config_set_azure_event_grid_topic(const char *topic);

void zplc_config_get_azure_event_grid_source(char *buf, size_t len);
void zplc_config_set_azure_event_grid_source(const char *source);

void zplc_config_get_azure_event_grid_event_type(char *buf, size_t len);
void zplc_config_set_azure_event_grid_event_type(const char *type);

/* ============================================================================
 * AWS IoT Core — Device Shadows & Jobs
 * ============================================================================
 */

/**
 * @brief Enable/disable AWS IoT Core Device Shadow synchronisation.
 *
 * When enabled the firmware subscribes to
 * $aws/things/{clientId}/shadow/update/delta on connect and publishes
 * reported state to $aws/things/{clientId}/shadow/update.  Default: false.
 */
bool zplc_config_get_aws_shadow_enabled(void);
void zplc_config_set_aws_shadow_enabled(bool enabled);

/**
 * @brief Enable/disable AWS IoT Core Jobs.
 *
 * When enabled the firmware subscribes to
 * $aws/things/{clientId}/jobs/notify and processes job execution requests.
 * Default: false.
 */
bool zplc_config_get_aws_jobs_enabled(void);
void zplc_config_set_aws_jobs_enabled(bool enabled);

bool zplc_config_get_aws_fleet_enabled(void);
void zplc_config_set_aws_fleet_enabled(bool enabled);

void zplc_config_get_aws_fleet_template_name(char *buf, size_t len);
void zplc_config_set_aws_fleet_template_name(const char *name);

void zplc_config_get_aws_claim_cert_path(char *buf, size_t len);
void zplc_config_set_aws_claim_cert_path(const char *path);

void zplc_config_get_aws_claim_key_path(char *buf, size_t len);
void zplc_config_set_aws_claim_key_path(const char *path);

int zplc_azure_dps_provision(void);
int zplc_aws_fleet_provision(void);
bool zplc_aws_fleet_is_provisioned(void);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_CONFIG_H */
