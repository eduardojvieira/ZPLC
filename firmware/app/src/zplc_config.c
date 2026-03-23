/**
 * ZPLC Configuration Manager Implementation
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_config.h"
#include <errno.h>
#include <stdio.h>
#include <string.h>
#if defined(CONFIG_FILE_SYSTEM)
#include <zephyr/fs/fs.h>
#endif
#if defined(CONFIG_FILE_SYSTEM_LITTLEFS)
#include <zephyr/fs/littlefs.h>
#endif
#if defined(CONFIG_SETTINGS)
#include <zephyr/settings/settings.h>
#endif
#include <zephyr/storage/flash_map.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_config, LOG_LEVEL_INF);

#if defined(CONFIG_FILE_SYSTEM_LITTLEFS)
/* LittleFS mount on external QSPI NOR flash (storage_partition).
 * Must be mounted before settings_subsys_init() when using SETTINGS_FILE.
 * Variable renamed to zplc_lfs_mount to avoid collision with lfs_mount()
 * function declared in lfs.h.
 */
FS_LITTLEFS_DECLARE_DEFAULT_CONFIG(qspi_lfs_data);
static struct fs_mount_t zplc_lfs_mount = {
    .type = FS_LITTLEFS,
    .fs_data = &qspi_lfs_data,
    .storage_dev = (void *)FIXED_PARTITION_ID(storage_partition),
    .mnt_point = "/lfs",
};
#endif

/* Internal configuration state */
static struct {
  char hostname[32];
  bool dhcp;
  char ip[16];
  uint16_t modbus_id;
  bool modbus_tcp_enabled;
  uint16_t modbus_tcp_port;
  bool modbus_rtu_enabled;
  uint32_t modbus_rtu_baud;
  uint8_t modbus_rtu_parity;
  bool modbus_rtu_client_enabled;
  uint8_t modbus_rtu_client_slave_id;
  uint32_t modbus_rtu_client_poll_ms;
  bool modbus_tcp_client_enabled;
  char modbus_tcp_client_host[128];
  uint16_t modbus_tcp_client_port;
  uint8_t modbus_tcp_client_unit_id;
  uint32_t modbus_tcp_client_poll_ms;
  uint32_t modbus_tcp_client_timeout_ms;
  bool mqtt_enabled;
  char mqtt_broker[128];
  char mqtt_client_id[128];
  char mqtt_topic_namespace[128];
  uint8_t mqtt_profile;
  uint8_t mqtt_protocol;
  uint8_t mqtt_transport;
  uint16_t mqtt_port;
  char mqtt_username[256];
  char mqtt_password[512];
  uint16_t mqtt_keepalive_sec;
  uint32_t mqtt_publish_interval_ms;
  uint8_t mqtt_publish_qos;
  uint8_t mqtt_subscribe_qos;
  bool mqtt_publish_retain;
  bool mqtt_clean_session;
  uint32_t mqtt_session_expiry_sec;
  uint8_t mqtt_security;
  char mqtt_websocket_path[128];
  char mqtt_alpn[128];
  char mqtt_ca_cert_path[96];
  char mqtt_client_cert_path[96];
  char mqtt_client_key_path[96];
  bool mqtt_lwt_enabled;
  char mqtt_lwt_topic[160];
  char mqtt_lwt_payload[256];
  uint8_t mqtt_lwt_qos;
  bool mqtt_lwt_retain;
  bool modbus_tag_override_valid[ZPLC_MAX_TAGS];
  uint32_t modbus_tag_override_addr[ZPLC_MAX_TAGS];
  /* Wi-Fi credentials */
  char wifi_ssid[64];
  char wifi_pass[64];
  uint8_t wifi_security; /* 0=open, 1=WEP, 2=WPA/WPA2-PSK, 3=WPA2-EAP */
  /* Time synchronization */
  bool ntp_enabled;
  char ntp_server[64];
  /* Sparkplug B */
  char mqtt_group_id[64];
  /* Azure IoT Hub — SAS authentication */
  char azure_sas_key[96]; /* base64-encoded SharedAccessKey (primary/secondary)
                           */
  uint32_t
      azure_sas_expiry_s; /* token validity window in seconds (default 3600) */
  /* Azure IoT Hub — Device Twins & Direct Methods */
  bool azure_twin_enabled;
  bool azure_direct_methods_enabled;
  bool azure_c2d_enabled;
  bool azure_dps_enabled;
  char azure_dps_id_scope[64];
  char azure_dps_registration_id[128];
  char azure_dps_endpoint[128];
  char azure_event_grid_topic[192];
  char azure_event_grid_source[128];
  char azure_event_grid_event_type[96];
  /* AWS IoT Core — Device Shadows & Jobs */
  bool aws_shadow_enabled;
  bool aws_jobs_enabled;
  bool aws_fleet_enabled;
  char aws_fleet_template_name[64];
  char aws_claim_cert_path[96];
  char aws_claim_key_path[96];
} config;

/* ============================================================================
 * Settings Callbacks
 * ============================================================================
 */

#if defined(CONFIG_SETTINGS)
static int zplc_settings_set(const char *name, size_t len,
                             settings_read_cb read_cb, void *cb_arg) {
  const char *next;
  int rc;

  if (settings_name_steq(name, "hostname", &next) && !next) {
    rc = read_cb(cb_arg, config.hostname, sizeof(config.hostname) - 1);
    if (rc >= 0)
      config.hostname[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "dhcp", &next) && !next) {
    rc = read_cb(cb_arg, &config.dhcp, sizeof(config.dhcp));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "ip", &next) && !next) {
    rc = read_cb(cb_arg, config.ip, sizeof(config.ip) - 1);
    if (rc >= 0)
      config.ip[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "wifi_ssid", &next) && !next) {
    rc = read_cb(cb_arg, config.wifi_ssid, sizeof(config.wifi_ssid) - 1);
    if (rc >= 0)
      config.wifi_ssid[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "wifi_pass", &next) && !next) {
    rc = read_cb(cb_arg, config.wifi_pass, sizeof(config.wifi_pass) - 1);
    if (rc >= 0)
      config.wifi_pass[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "wifi_security", &next) && !next) {
    rc = read_cb(cb_arg, &config.wifi_security, sizeof(config.wifi_security));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_id", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_id, sizeof(config.modbus_id));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_tcp_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_tcp_enabled,
                 sizeof(config.modbus_tcp_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_tcp_port", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_tcp_port,
                 sizeof(config.modbus_tcp_port));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_rtu_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_rtu_enabled,
                 sizeof(config.modbus_rtu_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_rtu_baud", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_rtu_baud,
                 sizeof(config.modbus_rtu_baud));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_rtu_parity", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_rtu_parity,
                 sizeof(config.modbus_rtu_parity));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_rtu_client_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_rtu_client_enabled,
                 sizeof(config.modbus_rtu_client_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_rtu_client_slave_id", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_rtu_client_slave_id,
                 sizeof(config.modbus_rtu_client_slave_id));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_rtu_client_poll_ms", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_rtu_client_poll_ms,
                 sizeof(config.modbus_rtu_client_poll_ms));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_tcp_client_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_tcp_client_enabled,
                 sizeof(config.modbus_tcp_client_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_tcp_client_host", &next) && !next) {
    rc = read_cb(cb_arg, config.modbus_tcp_client_host,
                 sizeof(config.modbus_tcp_client_host) - 1);
    if (rc >= 0)
      config.modbus_tcp_client_host[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "modbus_tcp_client_port", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_tcp_client_port,
                 sizeof(config.modbus_tcp_client_port));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_tcp_client_unit_id", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_tcp_client_unit_id,
                 sizeof(config.modbus_tcp_client_unit_id));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_tcp_client_poll_ms", &next) && !next) {
    rc = read_cb(cb_arg, &config.modbus_tcp_client_poll_ms,
                 sizeof(config.modbus_tcp_client_poll_ms));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_tcp_client_timeout_ms", &next) &&
      !next) {
    rc = read_cb(cb_arg, &config.modbus_tcp_client_timeout_ms,
                 sizeof(config.modbus_tcp_client_timeout_ms));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_broker", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_broker, sizeof(config.mqtt_broker) - 1);
    if (rc >= 0)
      config.mqtt_broker[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_client_id", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_client_id,
                 sizeof(config.mqtt_client_id) - 1);
    if (rc >= 0)
      config.mqtt_client_id[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_topic_namespace", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_topic_namespace,
                 sizeof(config.mqtt_topic_namespace) - 1);
    if (rc >= 0)
      config.mqtt_topic_namespace[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_profile", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_profile, sizeof(config.mqtt_profile));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_protocol", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_protocol, sizeof(config.mqtt_protocol));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_transport", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_transport, sizeof(config.mqtt_transport));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_enabled, sizeof(config.mqtt_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_port", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_port, sizeof(config.mqtt_port));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_username", &next) && !next) {
    rc =
        read_cb(cb_arg, config.mqtt_username, sizeof(config.mqtt_username) - 1);
    if (rc >= 0)
      config.mqtt_username[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_password", &next) && !next) {
    rc =
        read_cb(cb_arg, config.mqtt_password, sizeof(config.mqtt_password) - 1);
    if (rc >= 0)
      config.mqtt_password[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_keepalive_sec", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_keepalive_sec,
                 sizeof(config.mqtt_keepalive_sec));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_publish_interval_ms", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_publish_interval_ms,
                 sizeof(config.mqtt_publish_interval_ms));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_publish_qos", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_publish_qos,
                 sizeof(config.mqtt_publish_qos));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_subscribe_qos", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_subscribe_qos,
                 sizeof(config.mqtt_subscribe_qos));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_publish_retain", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_publish_retain,
                 sizeof(config.mqtt_publish_retain));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_clean_session", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_clean_session,
                 sizeof(config.mqtt_clean_session));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_session_expiry_sec", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_session_expiry_sec,
                 sizeof(config.mqtt_session_expiry_sec));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_security", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_security, sizeof(config.mqtt_security));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_websocket_path", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_websocket_path,
                 sizeof(config.mqtt_websocket_path) - 1);
    if (rc >= 0)
      config.mqtt_websocket_path[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_alpn", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_alpn, sizeof(config.mqtt_alpn) - 1);
    if (rc >= 0)
      config.mqtt_alpn[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_ca_cert_path", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_ca_cert_path,
                 sizeof(config.mqtt_ca_cert_path) - 1);
    if (rc >= 0)
      config.mqtt_ca_cert_path[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_client_cert_path", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_client_cert_path,
                 sizeof(config.mqtt_client_cert_path) - 1);
    if (rc >= 0)
      config.mqtt_client_cert_path[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_client_key_path", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_client_key_path,
                 sizeof(config.mqtt_client_key_path) - 1);
    if (rc >= 0)
      config.mqtt_client_key_path[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_lwt_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_lwt_enabled,
                 sizeof(config.mqtt_lwt_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_lwt_topic", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_lwt_topic,
                 sizeof(config.mqtt_lwt_topic) - 1);
    if (rc >= 0)
      config.mqtt_lwt_topic[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_lwt_payload", &next) && !next) {
    rc = read_cb(cb_arg, config.mqtt_lwt_payload,
                 sizeof(config.mqtt_lwt_payload) - 1);
    if (rc >= 0)
      config.mqtt_lwt_payload[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_lwt_qos", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_lwt_qos, sizeof(config.mqtt_lwt_qos));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "mqtt_lwt_retain", &next) && !next) {
    rc = read_cb(cb_arg, &config.mqtt_lwt_retain,
                 sizeof(config.mqtt_lwt_retain));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_tag_override_valid", &next) && !next) {
    rc = read_cb(cb_arg, config.modbus_tag_override_valid,
                 sizeof(config.modbus_tag_override_valid));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "modbus_tag_override_addr", &next) && !next) {
    rc = read_cb(cb_arg, config.modbus_tag_override_addr,
                 sizeof(config.modbus_tag_override_addr));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "ntp_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.ntp_enabled, sizeof(config.ntp_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "ntp_server", &next) && !next) {
    rc = read_cb(cb_arg, config.ntp_server, sizeof(config.ntp_server) - 1);
    if (rc >= 0)
      config.ntp_server[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "mqtt_group_id", &next) && !next) {
    rc =
        read_cb(cb_arg, config.mqtt_group_id, sizeof(config.mqtt_group_id) - 1);
    if (rc >= 0)
      config.mqtt_group_id[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "azure_sas_key", &next) && !next) {
    rc =
        read_cb(cb_arg, config.azure_sas_key, sizeof(config.azure_sas_key) - 1);
    if (rc >= 0)
      config.azure_sas_key[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "azure_sas_expiry_s", &next) && !next) {
    rc = read_cb(cb_arg, &config.azure_sas_expiry_s,
                 sizeof(config.azure_sas_expiry_s));
    return 0;
  }

  if (settings_name_steq(name, "azure_twin_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.azure_twin_enabled,
                 sizeof(config.azure_twin_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "azure_direct_methods_enabled", &next) &&
      !next) {
    rc = read_cb(cb_arg, &config.azure_direct_methods_enabled,
                 sizeof(config.azure_direct_methods_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "azure_c2d_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.azure_c2d_enabled,
                 sizeof(config.azure_c2d_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "azure_dps_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.azure_dps_enabled,
                 sizeof(config.azure_dps_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "azure_dps_id_scope", &next) && !next) {
    rc = read_cb(cb_arg, config.azure_dps_id_scope,
                 sizeof(config.azure_dps_id_scope) - 1);
    if (rc >= 0)
      config.azure_dps_id_scope[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "azure_dps_registration_id", &next) && !next) {
    rc = read_cb(cb_arg, config.azure_dps_registration_id,
                 sizeof(config.azure_dps_registration_id) - 1);
    if (rc >= 0)
      config.azure_dps_registration_id[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "azure_dps_endpoint", &next) && !next) {
    rc = read_cb(cb_arg, config.azure_dps_endpoint,
                 sizeof(config.azure_dps_endpoint) - 1);
    if (rc >= 0)
      config.azure_dps_endpoint[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "azure_event_grid_topic", &next) && !next) {
    rc = read_cb(cb_arg, config.azure_event_grid_topic,
                 sizeof(config.azure_event_grid_topic) - 1);
    if (rc >= 0)
      config.azure_event_grid_topic[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "azure_event_grid_source", &next) && !next) {
    rc = read_cb(cb_arg, config.azure_event_grid_source,
                 sizeof(config.azure_event_grid_source) - 1);
    if (rc >= 0)
      config.azure_event_grid_source[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "azure_event_grid_event_type", &next) && !next) {
    rc = read_cb(cb_arg, config.azure_event_grid_event_type,
                 sizeof(config.azure_event_grid_event_type) - 1);
    if (rc >= 0)
      config.azure_event_grid_event_type[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "aws_shadow_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.aws_shadow_enabled,
                 sizeof(config.aws_shadow_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "aws_jobs_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.aws_jobs_enabled,
                 sizeof(config.aws_jobs_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "aws_fleet_enabled", &next) && !next) {
    rc = read_cb(cb_arg, &config.aws_fleet_enabled,
                 sizeof(config.aws_fleet_enabled));
    return (rc >= 0) ? 0 : rc;
  }

  if (settings_name_steq(name, "aws_fleet_template_name", &next) && !next) {
    rc = read_cb(cb_arg, config.aws_fleet_template_name,
                 sizeof(config.aws_fleet_template_name) - 1);
    if (rc >= 0)
      config.aws_fleet_template_name[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "aws_claim_cert_path", &next) && !next) {
    rc = read_cb(cb_arg, config.aws_claim_cert_path,
                 sizeof(config.aws_claim_cert_path) - 1);
    if (rc >= 0)
      config.aws_claim_cert_path[rc] = '\0';
    return 0;
  }

  if (settings_name_steq(name, "aws_claim_key_path", &next) && !next) {
    rc = read_cb(cb_arg, config.aws_claim_key_path,
                 sizeof(config.aws_claim_key_path) - 1);
    if (rc >= 0)
      config.aws_claim_key_path[rc] = '\0';
    return 0;
  }

  return -ENOENT;
}

static struct settings_handler zplc_conf_handler = {
    .name = "zplc",
    .h_set = zplc_settings_set,
};
#endif

static void zplc_config_set_defaults(void) {
  strncpy(config.hostname, "zplc-device", sizeof(config.hostname));
  config.dhcp = true;
  strncpy(config.ip, "0.0.0.0", sizeof(config.ip));
  config.modbus_id = 1;
  config.modbus_tcp_enabled = false;
  config.modbus_tcp_port = 502;
  config.modbus_rtu_enabled = false;
  config.modbus_rtu_baud = 19200U;
  config.modbus_rtu_parity = ZPLC_MODBUS_PARITY_NONE;
  config.modbus_rtu_client_enabled = false;
  config.modbus_rtu_client_slave_id = 1U;
  config.modbus_rtu_client_poll_ms = 100U;
  config.modbus_tcp_client_enabled = false;
  strncpy(config.modbus_tcp_client_host, "192.168.1.100",
          sizeof(config.modbus_tcp_client_host));
  config.modbus_tcp_client_port = 502U;
  config.modbus_tcp_client_unit_id = 1U;
  config.modbus_tcp_client_poll_ms = 100U;
  config.modbus_tcp_client_timeout_ms = 500U;
  config.mqtt_enabled = false;
  strncpy(config.mqtt_broker, "test.mosquitto.org", sizeof(config.mqtt_broker));
  config.mqtt_client_id[0] = '\0';
  strncpy(config.mqtt_topic_namespace, "spBv1.0/ZPLC",
          sizeof(config.mqtt_topic_namespace));
  config.mqtt_profile = ZPLC_MQTT_PROFILE_SPARKPLUG_B;
  config.mqtt_protocol = ZPLC_MQTT_PROTOCOL_5_0;
  config.mqtt_transport = ZPLC_MQTT_TRANSPORT_TCP;
  config.mqtt_port = 1883;
  config.mqtt_username[0] = '\0';
  config.mqtt_password[0] = '\0';
  config.mqtt_keepalive_sec = 60;
  config.mqtt_publish_interval_ms = 2000U;
  config.mqtt_publish_qos = ZPLC_MQTT_QOS0;
  config.mqtt_subscribe_qos = ZPLC_MQTT_QOS0;
  config.mqtt_publish_retain = false;
  config.mqtt_clean_session = true;
  config.mqtt_session_expiry_sec = 0U;
  config.mqtt_security = ZPLC_MQTT_SECURITY_NONE;
  strncpy(config.mqtt_websocket_path, "/mqtt",
          sizeof(config.mqtt_websocket_path));
  config.mqtt_alpn[0] = '\0';
  strncpy(config.mqtt_ca_cert_path, "/lfs/certs/ca.pem",
          sizeof(config.mqtt_ca_cert_path));
  strncpy(config.mqtt_client_cert_path, "/lfs/certs/client.pem",
          sizeof(config.mqtt_client_cert_path));
  strncpy(config.mqtt_client_key_path, "/lfs/certs/client.key",
          sizeof(config.mqtt_client_key_path));
  config.mqtt_lwt_enabled = false;
  config.mqtt_lwt_topic[0] = '\0';
  strncpy(config.mqtt_lwt_payload, "offline", sizeof(config.mqtt_lwt_payload));
  config.mqtt_lwt_qos = ZPLC_MQTT_QOS0;
  config.mqtt_lwt_retain = false;
  memset(config.modbus_tag_override_valid, 0,
         sizeof(config.modbus_tag_override_valid));
  memset(config.modbus_tag_override_addr, 0,
         sizeof(config.modbus_tag_override_addr));
  config.ntp_enabled = false;
  strncpy(config.ntp_server, "pool.ntp.org", sizeof(config.ntp_server));
  strncpy(config.mqtt_group_id, "ZPLC", sizeof(config.mqtt_group_id));
  config.azure_sas_key[0] = '\0';
  config.azure_sas_expiry_s = 3600U;
  config.azure_twin_enabled = false;
  config.azure_direct_methods_enabled = false;
  config.azure_c2d_enabled = false;
  config.azure_dps_enabled = false;
  config.azure_dps_id_scope[0] = '\0';
  config.azure_dps_registration_id[0] = '\0';
  strncpy(config.azure_dps_endpoint, "global.azure-devices-provisioning.net",
          sizeof(config.azure_dps_endpoint));
  config.azure_event_grid_topic[0] = '\0';
  config.azure_event_grid_source[0] = '\0';
  config.azure_event_grid_event_type[0] = '\0';
  config.aws_shadow_enabled = false;
  config.aws_jobs_enabled = false;
  config.aws_fleet_enabled = false;
  config.aws_fleet_template_name[0] = '\0';
  config.aws_claim_cert_path[0] = '\0';
  config.aws_claim_key_path[0] = '\0';
}

/* ============================================================================
 * Public API — Lifecycle
 * ============================================================================
 */

int zplc_config_init(void) {
  zplc_config_set_defaults();
  int rc;

#if defined(CONFIG_FILE_SYSTEM_LITTLEFS)
  rc = fs_mount(&zplc_lfs_mount);
  if (rc < 0 && rc != -EBUSY) {
    LOG_WRN("LittleFS mount failed (%d), using defaults", rc);
  }
#endif

#if !defined(CONFIG_SETTINGS)
  LOG_WRN("Settings subsystem disabled; using in-memory defaults only");
  return 0;
#else
  rc = settings_subsys_init();
  if (rc) {
    LOG_ERR("settings_subsys_init failed: %d", rc);
    return rc;
  }

  rc = settings_register(&zplc_conf_handler);
  if (rc) {
    LOG_ERR("settings_register failed: %d", rc);
    return rc;
  }

  rc = settings_load();
  if (rc) {
    LOG_WRN("settings_load failed (%d), using defaults", rc);
  }

  LOG_INF("Config loaded. MQTT=%s broker=%s",
          config.mqtt_enabled ? "on" : "off", config.mqtt_broker);
  return 0;
#endif
}

int zplc_config_save(void) {
#if !defined(CONFIG_SETTINGS)
  return -ENOTSUP;
#else
  /* Setters only update the in-memory config struct.
   * This is the ONLY NVS flush point — call after a batch of config sets. */
  return settings_save();
#endif
}

int zplc_config_reset(void) {
  zplc_config_set_defaults();
#if !defined(CONFIG_SETTINGS)
  return 0;
#else
  return settings_save();
#endif
}

/* ============================================================================
 * Networking
 * ============================================================================
 */

void zplc_config_get_hostname(char *buf, size_t len) {
  strncpy(buf, config.hostname, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_hostname(const char *name) {
  strncpy(config.hostname, name, sizeof(config.hostname));
  config.hostname[sizeof(config.hostname) - 1] = '\0';
}

bool zplc_config_get_dhcp(void) { return config.dhcp; }
void zplc_config_set_dhcp(bool enabled) {
  config.dhcp = enabled;
}

void zplc_config_get_ip(char *buf, size_t len) {
  strncpy(buf, config.ip, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_ip(const char *ip) {
  strncpy(config.ip, ip, sizeof(config.ip));
  config.ip[sizeof(config.ip) - 1] = '\0';
}

void zplc_config_get_wifi_ssid(char *buf, size_t len) {
  strncpy(buf, config.wifi_ssid, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_wifi_ssid(const char *ssid) {
  strncpy(config.wifi_ssid, ssid, sizeof(config.wifi_ssid));
  config.wifi_ssid[sizeof(config.wifi_ssid) - 1] = '\0';
}

void zplc_config_get_wifi_pass(char *buf, size_t len) {
  strncpy(buf, config.wifi_pass, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_wifi_pass(const char *pass) {
  strncpy(config.wifi_pass, pass, sizeof(config.wifi_pass));
  config.wifi_pass[sizeof(config.wifi_pass) - 1] = '\0';
}

uint8_t zplc_config_get_wifi_security(void) { return config.wifi_security; }

void zplc_config_set_wifi_security(uint8_t security) {
  config.wifi_security = security;
}

/* ============================================================================
 * Modbus — Server
 * ============================================================================
 */

uint16_t zplc_config_get_modbus_id(void) { return config.modbus_id; }
void zplc_config_set_modbus_id(uint16_t id) {
  config.modbus_id = id;
}

bool zplc_config_get_modbus_tcp_enabled(void) {
  return config.modbus_tcp_enabled;
}
void zplc_config_set_modbus_tcp_enabled(bool enabled) {
  config.modbus_tcp_enabled = enabled;
}

uint16_t zplc_config_get_modbus_tcp_port(void) {
  return config.modbus_tcp_port;
}
void zplc_config_set_modbus_tcp_port(uint16_t port) {
  config.modbus_tcp_port = port;
}

bool zplc_config_get_modbus_rtu_enabled(void) {
  return config.modbus_rtu_enabled;
}
void zplc_config_set_modbus_rtu_enabled(bool enabled) {
  config.modbus_rtu_enabled = enabled;
}

uint32_t zplc_config_get_modbus_rtu_baud(void) {
  return config.modbus_rtu_baud;
}
void zplc_config_set_modbus_rtu_baud(uint32_t baud) {
  config.modbus_rtu_baud = baud;
}

zplc_modbus_parity_t zplc_config_get_modbus_rtu_parity(void) {
  return (zplc_modbus_parity_t)config.modbus_rtu_parity;
}

void zplc_config_set_modbus_rtu_parity(zplc_modbus_parity_t parity) {
  config.modbus_rtu_parity = (uint8_t)parity;
}

bool zplc_config_get_modbus_rtu_client_enabled(void) {
  return config.modbus_rtu_client_enabled;
}
void zplc_config_set_modbus_rtu_client_enabled(bool enabled) {
  config.modbus_rtu_client_enabled = enabled;
}

uint8_t zplc_config_get_modbus_rtu_client_slave_id(void) {
  return config.modbus_rtu_client_slave_id;
}
void zplc_config_set_modbus_rtu_client_slave_id(uint8_t id) {
  config.modbus_rtu_client_slave_id = id;
}

uint32_t zplc_config_get_modbus_rtu_client_poll_ms(void) {
  return config.modbus_rtu_client_poll_ms;
}
void zplc_config_set_modbus_rtu_client_poll_ms(uint32_t ms) {
  config.modbus_rtu_client_poll_ms = ms;
}

bool zplc_config_get_modbus_tcp_client_enabled(void) {
  return config.modbus_tcp_client_enabled;
}
void zplc_config_set_modbus_tcp_client_enabled(bool enabled) {
  config.modbus_tcp_client_enabled = enabled;
}

void zplc_config_get_modbus_tcp_client_host(char *buf, size_t len) {
  strncpy(buf, config.modbus_tcp_client_host, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_modbus_tcp_client_host(const char *host) {
  strncpy(config.modbus_tcp_client_host, host,
          sizeof(config.modbus_tcp_client_host));
  config.modbus_tcp_client_host[sizeof(config.modbus_tcp_client_host) - 1] =
      '\0';
}

uint16_t zplc_config_get_modbus_tcp_client_port(void) {
  return config.modbus_tcp_client_port;
}
void zplc_config_set_modbus_tcp_client_port(uint16_t port) {
  config.modbus_tcp_client_port = port;
}

uint8_t zplc_config_get_modbus_tcp_client_unit_id(void) {
  return config.modbus_tcp_client_unit_id;
}
void zplc_config_set_modbus_tcp_client_unit_id(uint8_t id) {
  config.modbus_tcp_client_unit_id = id;
}

uint32_t zplc_config_get_modbus_tcp_client_poll_ms(void) {
  return config.modbus_tcp_client_poll_ms;
}
void zplc_config_set_modbus_tcp_client_poll_ms(uint32_t ms) {
  config.modbus_tcp_client_poll_ms = ms;
}

uint32_t zplc_config_get_modbus_tcp_client_timeout_ms(void) {
  return config.modbus_tcp_client_timeout_ms;
}
void zplc_config_set_modbus_tcp_client_timeout_ms(uint32_t ms) {
  config.modbus_tcp_client_timeout_ms = ms;
}

/* ============================================================================
 * Modbus Tag Overrides
 * ============================================================================
 */

bool zplc_config_get_modbus_tag_override(uint16_t index, uint32_t *address) {
  if (index >= ZPLC_MAX_TAGS)
    return false;
  if (!config.modbus_tag_override_valid[index])
    return false;
  if (address != NULL) {
    *address = config.modbus_tag_override_addr[index];
  }
  return true;
}

int zplc_config_set_modbus_tag_override(uint16_t index, uint32_t address) {
  if (index >= ZPLC_MAX_TAGS)
    return -EINVAL;
  config.modbus_tag_override_valid[index] = true;
  config.modbus_tag_override_addr[index] = address;
  return 0;
}

int zplc_config_clear_modbus_tag_override(uint16_t index) {
  if (index >= ZPLC_MAX_TAGS)
    return -EINVAL;
  config.modbus_tag_override_valid[index] = false;
  config.modbus_tag_override_addr[index] = 0;
  return 0;
}

/* ============================================================================
 * MQTT — Core
 * ============================================================================
 */

bool zplc_config_get_mqtt_enabled(void) { return config.mqtt_enabled; }
void zplc_config_set_mqtt_enabled(bool enabled) {
  config.mqtt_enabled = enabled;
}

/* Stubs — real MQTT implementations live in zplc_mqtt.c */
__attribute__((weak)) int zplc_mqtt_init(void) {
  LOG_WRN("zplc_mqtt_init: MQTT module not linked");
  return -ENOTSUP;
}

__attribute__((weak)) void zplc_mqtt_request_backoff_reset(void) {
  LOG_WRN("zplc_mqtt_request_backoff_reset: MQTT module not linked");
}

__attribute__((weak)) void zplc_mqtt_get_status(zplc_mqtt_status_t *status) {
  if (status != NULL) {
    memset(status, 0, sizeof(*status));
  }
}

__attribute__((weak)) void
zplc_mqtt_set_azure_c2d_callback(zplc_azure_c2d_cb_t cb) {
  ARG_UNUSED(cb);
  LOG_WRN("zplc_mqtt_set_azure_c2d_callback: MQTT module not linked");
}

__attribute__((weak)) bool zplc_mqtt_is_connected(void) { return false; }

__attribute__((weak)) int
zplc_mqtt_enqueue_publish(const char *topic, const uint8_t *payload, size_t len,
                          uint8_t qos, bool retain) {
  ARG_UNUSED(topic);
  ARG_UNUSED(payload);
  ARG_UNUSED(len);
  ARG_UNUSED(qos);
  ARG_UNUSED(retain);
  LOG_WRN("zplc_mqtt_enqueue_publish: MQTT module not linked");
  return -ENOTSUP;
}

__attribute__((weak)) int zplc_azure_event_grid_publish(const char *event_type,
                                                        const char *source,
                                                        const char *topic,
                                                        const char *data) {
  ARG_UNUSED(event_type);
  ARG_UNUSED(source);
  ARG_UNUSED(topic);
  ARG_UNUSED(data);
  LOG_WRN("zplc_azure_event_grid_publish: MQTT module not linked");
  return -ENOTSUP;
}

void zplc_config_get_mqtt_broker(char *buf, size_t len) {
  strncpy(buf, config.mqtt_broker, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_broker(const char *broker) {
  strncpy(config.mqtt_broker, broker, sizeof(config.mqtt_broker));
  config.mqtt_broker[sizeof(config.mqtt_broker) - 1] = '\0';
}

void zplc_config_get_mqtt_client_id(char *buf, size_t len) {
  strncpy(buf, config.mqtt_client_id, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_client_id(const char *client_id) {
  strncpy(config.mqtt_client_id, client_id, sizeof(config.mqtt_client_id));
  config.mqtt_client_id[sizeof(config.mqtt_client_id) - 1] = '\0';
}

void zplc_config_get_mqtt_topic_namespace(char *buf, size_t len) {
  strncpy(buf, config.mqtt_topic_namespace, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_topic_namespace(const char *topic_namespace) {
  strncpy(config.mqtt_topic_namespace, topic_namespace,
          sizeof(config.mqtt_topic_namespace));
  config.mqtt_topic_namespace[sizeof(config.mqtt_topic_namespace) - 1] = '\0';
}

zplc_mqtt_profile_t zplc_config_get_mqtt_profile(void) {
  return (zplc_mqtt_profile_t)config.mqtt_profile;
}
void zplc_config_set_mqtt_profile(zplc_mqtt_profile_t profile) {
  config.mqtt_profile = (uint8_t)profile;
}

zplc_mqtt_protocol_t zplc_config_get_mqtt_protocol(void) {
  return (zplc_mqtt_protocol_t)config.mqtt_protocol;
}
void zplc_config_set_mqtt_protocol(zplc_mqtt_protocol_t protocol) {
  config.mqtt_protocol = (uint8_t)protocol;
}

zplc_mqtt_transport_t zplc_config_get_mqtt_transport(void) {
  return (zplc_mqtt_transport_t)config.mqtt_transport;
}
void zplc_config_set_mqtt_transport(zplc_mqtt_transport_t transport) {
  config.mqtt_transport = (uint8_t)transport;
}

uint16_t zplc_config_get_mqtt_port(void) { return config.mqtt_port; }
void zplc_config_set_mqtt_port(uint16_t port) {
  config.mqtt_port = port;
}

void zplc_config_get_mqtt_username(char *buf, size_t len) {
  strncpy(buf, config.mqtt_username, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_username(const char *username) {
  strncpy(config.mqtt_username, username, sizeof(config.mqtt_username));
  config.mqtt_username[sizeof(config.mqtt_username) - 1] = '\0';
}

void zplc_config_get_mqtt_password(char *buf, size_t len) {
  strncpy(buf, config.mqtt_password, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_password(const char *password) {
  strncpy(config.mqtt_password, password, sizeof(config.mqtt_password));
  config.mqtt_password[sizeof(config.mqtt_password) - 1] = '\0';
}

uint16_t zplc_config_get_mqtt_keepalive_sec(void) {
  return config.mqtt_keepalive_sec;
}
void zplc_config_set_mqtt_keepalive_sec(uint16_t keepalive_sec) {
  config.mqtt_keepalive_sec = keepalive_sec;
}

uint32_t zplc_config_get_mqtt_publish_interval_ms(void) {
  return config.mqtt_publish_interval_ms;
}
void zplc_config_set_mqtt_publish_interval_ms(uint32_t publish_interval_ms) {
  config.mqtt_publish_interval_ms = publish_interval_ms;
}

zplc_mqtt_qos_t zplc_config_get_mqtt_publish_qos(void) {
  return (zplc_mqtt_qos_t)config.mqtt_publish_qos;
}
void zplc_config_set_mqtt_publish_qos(zplc_mqtt_qos_t qos) {
  config.mqtt_publish_qos = (uint8_t)qos;
}

zplc_mqtt_qos_t zplc_config_get_mqtt_subscribe_qos(void) {
  return (zplc_mqtt_qos_t)config.mqtt_subscribe_qos;
}
void zplc_config_set_mqtt_subscribe_qos(zplc_mqtt_qos_t qos) {
  config.mqtt_subscribe_qos = (uint8_t)qos;
}

bool zplc_config_get_mqtt_publish_retain(void) {
  return config.mqtt_publish_retain;
}
void zplc_config_set_mqtt_publish_retain(bool retain) {
  config.mqtt_publish_retain = retain;
}

bool zplc_config_get_mqtt_clean_session(void) {
  return config.mqtt_clean_session;
}
void zplc_config_set_mqtt_clean_session(bool clean_session) {
  config.mqtt_clean_session = clean_session;
}

uint32_t zplc_config_get_mqtt_session_expiry_sec(void) {
  return config.mqtt_session_expiry_sec;
}
void zplc_config_set_mqtt_session_expiry_sec(uint32_t session_expiry_sec) {
  config.mqtt_session_expiry_sec = session_expiry_sec;
}

zplc_mqtt_security_t zplc_config_get_mqtt_security(void) {
  return (zplc_mqtt_security_t)config.mqtt_security;
}
void zplc_config_set_mqtt_security(zplc_mqtt_security_t security) {
  config.mqtt_security = (uint8_t)security;
}

void zplc_config_get_mqtt_websocket_path(char *buf, size_t len) {
  strncpy(buf, config.mqtt_websocket_path, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_websocket_path(const char *path) {
  strncpy(config.mqtt_websocket_path, path, sizeof(config.mqtt_websocket_path));
  config.mqtt_websocket_path[sizeof(config.mqtt_websocket_path) - 1] = '\0';
}

void zplc_config_get_mqtt_alpn(char *buf, size_t len) {
  strncpy(buf, config.mqtt_alpn, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_alpn(const char *alpn) {
  strncpy(config.mqtt_alpn, alpn, sizeof(config.mqtt_alpn));
  config.mqtt_alpn[sizeof(config.mqtt_alpn) - 1] = '\0';
}

/* ============================================================================
 * MQTT — LWT
 * ============================================================================
 */

bool zplc_config_get_mqtt_lwt_enabled(void) { return config.mqtt_lwt_enabled; }
void zplc_config_set_mqtt_lwt_enabled(bool enabled) {
  config.mqtt_lwt_enabled = enabled;
}

void zplc_config_get_mqtt_lwt_topic(char *buf, size_t len) {
  strncpy(buf, config.mqtt_lwt_topic, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_lwt_topic(const char *topic) {
  strncpy(config.mqtt_lwt_topic, topic, sizeof(config.mqtt_lwt_topic));
  config.mqtt_lwt_topic[sizeof(config.mqtt_lwt_topic) - 1] = '\0';
}

void zplc_config_get_mqtt_lwt_payload(char *buf, size_t len) {
  strncpy(buf, config.mqtt_lwt_payload, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_lwt_payload(const char *payload) {
  strncpy(config.mqtt_lwt_payload, payload, sizeof(config.mqtt_lwt_payload));
  config.mqtt_lwt_payload[sizeof(config.mqtt_lwt_payload) - 1] = '\0';
}

zplc_mqtt_qos_t zplc_config_get_mqtt_lwt_qos(void) {
  return (zplc_mqtt_qos_t)config.mqtt_lwt_qos;
}
void zplc_config_set_mqtt_lwt_qos(zplc_mqtt_qos_t qos) {
  config.mqtt_lwt_qos = (uint8_t)qos;
}

bool zplc_config_get_mqtt_lwt_retain(void) { return config.mqtt_lwt_retain; }
void zplc_config_set_mqtt_lwt_retain(bool retain) {
  config.mqtt_lwt_retain = retain;
}

/* ============================================================================
 * MQTT — TLS Certs
 * ============================================================================
 */

void zplc_config_get_mqtt_ca_cert_path(char *buf, size_t len) {
  strncpy(buf, config.mqtt_ca_cert_path, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_ca_cert_path(const char *path) {
  strncpy(config.mqtt_ca_cert_path, path, sizeof(config.mqtt_ca_cert_path));
  config.mqtt_ca_cert_path[sizeof(config.mqtt_ca_cert_path) - 1] = '\0';
}

void zplc_config_get_mqtt_client_cert_path(char *buf, size_t len) {
  strncpy(buf, config.mqtt_client_cert_path, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_client_cert_path(const char *path) {
  strncpy(config.mqtt_client_cert_path, path,
          sizeof(config.mqtt_client_cert_path));
  config.mqtt_client_cert_path[sizeof(config.mqtt_client_cert_path) - 1] = '\0';
}

void zplc_config_get_mqtt_client_key_path(char *buf, size_t len) {
  strncpy(buf, config.mqtt_client_key_path, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_client_key_path(const char *path) {
  strncpy(config.mqtt_client_key_path, path,
          sizeof(config.mqtt_client_key_path));
  config.mqtt_client_key_path[sizeof(config.mqtt_client_key_path) - 1] = '\0';
}

/* ============================================================================
 * NTP
 * ============================================================================
 */

bool zplc_config_get_ntp_enabled(void) { return config.ntp_enabled; }
void zplc_config_set_ntp_enabled(bool enabled) {
  config.ntp_enabled = enabled;
}

void zplc_config_get_ntp_server(char *buf, size_t len) {
  strncpy(buf, config.ntp_server, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_ntp_server(const char *server) {
  strncpy(config.ntp_server, server, sizeof(config.ntp_server));
  config.ntp_server[sizeof(config.ntp_server) - 1] = '\0';
}

/* ============================================================================
 * Sparkplug B
 * ============================================================================
 */

void zplc_config_get_mqtt_group_id(char *buf, size_t len) {
  strncpy(buf, config.mqtt_group_id, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_mqtt_group_id(const char *group_id) {
  strncpy(config.mqtt_group_id, group_id, sizeof(config.mqtt_group_id));
  config.mqtt_group_id[sizeof(config.mqtt_group_id) - 1] = '\0';
}

/* ============================================================================
 * Azure — SAS Authentication
 * ============================================================================
 */

void zplc_config_get_azure_sas_key(char *buf, size_t len) {
  strncpy(buf, config.azure_sas_key, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_azure_sas_key(const char *key) {
  strncpy(config.azure_sas_key, key, sizeof(config.azure_sas_key));
  config.azure_sas_key[sizeof(config.azure_sas_key) - 1] = '\0';
}

uint32_t zplc_config_get_azure_sas_expiry_s(void) {
  return config.azure_sas_expiry_s;
}
void zplc_config_set_azure_sas_expiry_s(uint32_t expiry_s) {
  if (expiry_s < 300U)
    expiry_s = 300U;
  if (expiry_s > 31536000U)
    expiry_s = 31536000U;
  config.azure_sas_expiry_s = expiry_s;
}

/* ============================================================================
 * Azure — Twins & Direct Methods
 * ============================================================================
 */

bool zplc_config_get_azure_twin_enabled(void) {
  return config.azure_twin_enabled;
}
void zplc_config_set_azure_twin_enabled(bool enabled) {
  config.azure_twin_enabled = enabled;
}

bool zplc_config_get_azure_direct_methods_enabled(void) {
  return config.azure_direct_methods_enabled;
}
void zplc_config_set_azure_direct_methods_enabled(bool enabled) {
  config.azure_direct_methods_enabled = enabled;
}

bool zplc_config_get_azure_c2d_enabled(void) {
  return config.azure_c2d_enabled;
}
void zplc_config_set_azure_c2d_enabled(bool enabled) {
  config.azure_c2d_enabled = enabled;
}

/* ============================================================================
 * Azure — DPS (Device Provisioning Service)
 * ============================================================================
 */

bool zplc_config_get_azure_dps_enabled(void) {
  return config.azure_dps_enabled;
}
void zplc_config_set_azure_dps_enabled(bool enabled) {
  config.azure_dps_enabled = enabled;
}

void zplc_config_get_azure_dps_id_scope(char *buf, size_t len) {
  strncpy(buf, config.azure_dps_id_scope, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_azure_dps_id_scope(const char *scope) {
  strncpy(config.azure_dps_id_scope, scope, sizeof(config.azure_dps_id_scope));
  config.azure_dps_id_scope[sizeof(config.azure_dps_id_scope) - 1] = '\0';
}

void zplc_config_get_azure_dps_registration_id(char *buf, size_t len) {
  strncpy(buf, config.azure_dps_registration_id, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_azure_dps_registration_id(const char *id) {
  strncpy(config.azure_dps_registration_id, id,
          sizeof(config.azure_dps_registration_id));
  config
      .azure_dps_registration_id[sizeof(config.azure_dps_registration_id) - 1] =
      '\0';
}

void zplc_config_get_azure_dps_endpoint(char *buf, size_t len) {
  strncpy(buf, config.azure_dps_endpoint, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_azure_dps_endpoint(const char *endpoint) {
  strncpy(config.azure_dps_endpoint, endpoint,
          sizeof(config.azure_dps_endpoint));
  config.azure_dps_endpoint[sizeof(config.azure_dps_endpoint) - 1] = '\0';
}

/* Stub — real implementation lives in zplc_azure_dps.c */
__attribute__((weak)) int zplc_azure_dps_provision(void) {
  LOG_WRN("zplc_azure_dps_provision: DPS module not linked");
  return -ENOTSUP;
}

/* ============================================================================
 * Azure — Event Grid
 * ============================================================================
 */

void zplc_config_get_azure_event_grid_topic(char *buf, size_t len) {
  strncpy(buf, config.azure_event_grid_topic, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_azure_event_grid_topic(const char *topic) {
  strncpy(config.azure_event_grid_topic, topic,
          sizeof(config.azure_event_grid_topic));
  config.azure_event_grid_topic[sizeof(config.azure_event_grid_topic) - 1] =
      '\0';
}

void zplc_config_get_azure_event_grid_source(char *buf, size_t len) {
  strncpy(buf, config.azure_event_grid_source, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_azure_event_grid_source(const char *source) {
  strncpy(config.azure_event_grid_source, source,
          sizeof(config.azure_event_grid_source));
  config.azure_event_grid_source[sizeof(config.azure_event_grid_source) - 1] =
      '\0';
}

void zplc_config_get_azure_event_grid_event_type(char *buf, size_t len) {
  strncpy(buf, config.azure_event_grid_event_type, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_azure_event_grid_event_type(const char *type) {
  strncpy(config.azure_event_grid_event_type, type,
          sizeof(config.azure_event_grid_event_type));
  config
      .azure_event_grid_event_type[sizeof(config.azure_event_grid_event_type) -
                                   1] = '\0';
}

/* ============================================================================
 * AWS — Shadows & Jobs
 * ============================================================================
 */

bool zplc_config_get_aws_shadow_enabled(void) {
  return config.aws_shadow_enabled;
}
void zplc_config_set_aws_shadow_enabled(bool enabled) {
  config.aws_shadow_enabled = enabled;
}

bool zplc_config_get_aws_jobs_enabled(void) { return config.aws_jobs_enabled; }
void zplc_config_set_aws_jobs_enabled(bool enabled) {
  config.aws_jobs_enabled = enabled;
}

/* ============================================================================
 * AWS — Fleet Provisioning
 * ============================================================================
 */

bool zplc_config_get_aws_fleet_enabled(void) {
  return config.aws_fleet_enabled;
}
void zplc_config_set_aws_fleet_enabled(bool enabled) {
  config.aws_fleet_enabled = enabled;
}

void zplc_config_get_aws_fleet_template_name(char *buf, size_t len) {
  strncpy(buf, config.aws_fleet_template_name, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_aws_fleet_template_name(const char *name) {
  strncpy(config.aws_fleet_template_name, name,
          sizeof(config.aws_fleet_template_name));
  config.aws_fleet_template_name[sizeof(config.aws_fleet_template_name) - 1] =
      '\0';
}

void zplc_config_get_aws_claim_cert_path(char *buf, size_t len) {
  strncpy(buf, config.aws_claim_cert_path, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_aws_claim_cert_path(const char *path) {
  strncpy(config.aws_claim_cert_path, path, sizeof(config.aws_claim_cert_path));
  config.aws_claim_cert_path[sizeof(config.aws_claim_cert_path) - 1] = '\0';
}

void zplc_config_get_aws_claim_key_path(char *buf, size_t len) {
  strncpy(buf, config.aws_claim_key_path, len);
  buf[len - 1] = '\0';
}

void zplc_config_set_aws_claim_key_path(const char *path) {
  strncpy(config.aws_claim_key_path, path, sizeof(config.aws_claim_key_path));
  config.aws_claim_key_path[sizeof(config.aws_claim_key_path) - 1] = '\0';
}

/* Stubs — real implementations live in zplc_aws_fleet.c */
__attribute__((weak)) int zplc_aws_fleet_provision(void) {
  LOG_WRN("zplc_aws_fleet_provision: AWS Fleet module not linked");
  return -ENOTSUP;
}

__attribute__((weak)) bool zplc_aws_fleet_is_provisioned(void) { return false; }
