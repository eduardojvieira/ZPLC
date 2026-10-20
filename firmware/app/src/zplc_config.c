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

#include <zplc_hal.h>

#include <zephyr/logging/log.h>
#include <zephyr/kernel.h>
#include "zplc_lock.h"
LOG_MODULE_REGISTER(zplc_config, LOG_LEVEL_INF);

/* Only shell/settings and the Modbus server access this pair; none runs in ISR. */
K_MUTEX_DEFINE(modbus_tag_override_lock);

#if defined(CONFIG_ZTEST)
static void (*modbus_tag_override_publish_hook)(void);

void zplc_config_test_set_modbus_override_publish_hook(void (*hook)(void))
{
  modbus_tag_override_publish_hook = hook;
}
#endif

/* The stored mapping overrides are applied only as a complete pair. */
static bool modbus_tag_override_load_valid[ZPLC_MAX_TAGS];
static uint32_t modbus_tag_override_load_addr[ZPLC_MAX_TAGS];
static bool modbus_tag_override_load_valid_seen;
static bool modbus_tag_override_load_addr_seen;

static void zplc_modbus_override_load_reset(void)
{
  memset(modbus_tag_override_load_valid, 0,
         sizeof(modbus_tag_override_load_valid));
  memset(modbus_tag_override_load_addr, 0,
         sizeof(modbus_tag_override_load_addr));
  modbus_tag_override_load_valid_seen = false;
  modbus_tag_override_load_addr_seen = false;
}

#if defined(CONFIG_FILE_SYSTEM_LITTLEFS)
/* LittleFS on storage_partition: the settings file (CONFIG_SETTINGS_FILE), the certificate files and, where the
 * Wi-Fi credentials go through the settings, those (IO-008). The mount names the flash area (PARTITION_ID). An
 * earlier version passed the flash device, which is no flash area: the mount failed with -ENODEV on every board and
 * none of that was ever kept.
 * A mount that finds no file system formats the partition (CONFIG_FILE_SYSTEM_MKFS), so the NVS records of the HAL
 * (program, RETAIN, settings keys, credentials) must be elsewhere: on zplc_nvs_partition, which the HAL takes when
 * the board defines it. The build stops when a board would put both on the same flash.
 * Must be mounted before settings_subsys_init() when using SETTINGS_FILE.
 * Variable renamed to zplc_lfs_mount to avoid collision with lfs_mount()
 * function declared in lfs.h.
 */
#if !DT_NODE_EXISTS(DT_NODELABEL(zplc_nvs_partition))
#error "LittleFS formats storage_partition, where the HAL keeps its NVS records on a board without zplc_nvs_partition: give the records a zplc_nvs_partition in the board overlay (IO-008)"
#endif
#define ZPLC_LFS_NODE DT_NODELABEL(storage_partition)
#define ZPLC_NVS_NODE DT_NODELABEL(zplc_nvs_partition)
BUILD_ASSERT(!DT_SAME_NODE(DT_GPARENT(ZPLC_LFS_NODE), DT_GPARENT(ZPLC_NVS_NODE)) ||
                 DT_REG_ADDR(ZPLC_LFS_NODE) + DT_REG_SIZE(ZPLC_LFS_NODE) <= DT_REG_ADDR(ZPLC_NVS_NODE) ||
                 DT_REG_ADDR(ZPLC_NVS_NODE) + DT_REG_SIZE(ZPLC_NVS_NODE) <= DT_REG_ADDR(ZPLC_LFS_NODE),
             "storage_partition (LittleFS) overlaps zplc_nvs_partition (the NVS records of the HAL), IO-008");
FS_LITTLEFS_DECLARE_DEFAULT_CONFIG(zplc_lfs_data);
static struct fs_mount_t zplc_lfs_mount = {
    .type = FS_LITTLEFS,
    .fs_data = &zplc_lfs_data,
    .storage_dev = (void *)PARTITION_ID(storage_partition),
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
 * Persisted settings (COM-027)
 * ============================================================================
 */

/*
 * One row per persisted setting. Load and save walk this one table, so a
 * setting that is read from storage is also written to it: the two
 * directions cannot drift apart as the hand-written chain of comparisons
 * did, where load knew 70 keys and save wrote none.
 *
 * Storage is the HAL key-value store (NVS on the Zephyr HAL), the one the
 * program store already uses on every board: one entry per row, key
 * "cfg_NN" with NN the row index. An entry is self-describing,
 *
 *   [name length (1)] [name] [value length (2, little endian)] [value]
 *
 * so a row whose index moved in a later firmware is recognised by its name
 * and ignored instead of being applied to another setting. A string is
 * stored with its length, so an empty string is a value like any other.
 */
struct cfg_item {
  const char *name;
  void *ptr;
  uint16_t size;
  bool is_string;
};

#define CFG_RAW(key, field)                                                    \
  { #key, &config.field, (uint16_t)sizeof(config.field), false }
#define CFG_STR(key, field)                                                    \
  { #key, config.field, (uint16_t)sizeof(config.field), true }

static const struct cfg_item cfg_items[] = {
    CFG_STR(hostname, hostname),
    CFG_RAW(dhcp, dhcp),
    CFG_STR(ip, ip),
    CFG_STR(wifi_ssid, wifi_ssid),
    CFG_STR(wifi_pass, wifi_pass),
    CFG_RAW(wifi_security, wifi_security),
    CFG_RAW(modbus_id, modbus_id),
    CFG_RAW(modbus_tcp_enabled, modbus_tcp_enabled),
    CFG_RAW(modbus_tcp_port, modbus_tcp_port),
    CFG_RAW(modbus_rtu_enabled, modbus_rtu_enabled),
    CFG_RAW(modbus_rtu_baud, modbus_rtu_baud),
    CFG_RAW(modbus_rtu_parity, modbus_rtu_parity),
    CFG_RAW(modbus_rtu_client_enabled, modbus_rtu_client_enabled),
    CFG_RAW(modbus_rtu_client_slave_id, modbus_rtu_client_slave_id),
    CFG_RAW(modbus_rtu_client_poll_ms, modbus_rtu_client_poll_ms),
    CFG_RAW(modbus_tcp_client_enabled, modbus_tcp_client_enabled),
    CFG_STR(modbus_tcp_client_host, modbus_tcp_client_host),
    CFG_RAW(modbus_tcp_client_port, modbus_tcp_client_port),
    CFG_RAW(modbus_tcp_client_unit_id, modbus_tcp_client_unit_id),
    CFG_RAW(modbus_tcp_client_poll_ms, modbus_tcp_client_poll_ms),
    CFG_RAW(modbus_tcp_client_timeout_ms, modbus_tcp_client_timeout_ms),
    CFG_STR(mqtt_broker, mqtt_broker),
    CFG_STR(mqtt_client_id, mqtt_client_id),
    CFG_STR(mqtt_topic_namespace, mqtt_topic_namespace),
    CFG_RAW(mqtt_profile, mqtt_profile),
    CFG_RAW(mqtt_protocol, mqtt_protocol),
    CFG_RAW(mqtt_transport, mqtt_transport),
    CFG_RAW(mqtt_enabled, mqtt_enabled),
    CFG_RAW(mqtt_port, mqtt_port),
    CFG_STR(mqtt_username, mqtt_username),
    CFG_STR(mqtt_password, mqtt_password),
    CFG_RAW(mqtt_keepalive_sec, mqtt_keepalive_sec),
    CFG_RAW(mqtt_publish_interval_ms, mqtt_publish_interval_ms),
    CFG_RAW(mqtt_publish_qos, mqtt_publish_qos),
    CFG_RAW(mqtt_subscribe_qos, mqtt_subscribe_qos),
    CFG_RAW(mqtt_publish_retain, mqtt_publish_retain),
    CFG_RAW(mqtt_clean_session, mqtt_clean_session),
    CFG_RAW(mqtt_session_expiry_sec, mqtt_session_expiry_sec),
    CFG_RAW(mqtt_security, mqtt_security),
    CFG_STR(mqtt_websocket_path, mqtt_websocket_path),
    CFG_STR(mqtt_alpn, mqtt_alpn),
    CFG_STR(mqtt_ca_cert_path, mqtt_ca_cert_path),
    CFG_STR(mqtt_client_cert_path, mqtt_client_cert_path),
    CFG_STR(mqtt_client_key_path, mqtt_client_key_path),
    CFG_RAW(mqtt_lwt_enabled, mqtt_lwt_enabled),
    CFG_STR(mqtt_lwt_topic, mqtt_lwt_topic),
    CFG_STR(mqtt_lwt_payload, mqtt_lwt_payload),
    CFG_RAW(mqtt_lwt_qos, mqtt_lwt_qos),
    CFG_RAW(mqtt_lwt_retain, mqtt_lwt_retain),
    CFG_RAW(ntp_enabled, ntp_enabled),
    CFG_STR(ntp_server, ntp_server),
    CFG_STR(mqtt_group_id, mqtt_group_id),
    CFG_STR(azure_sas_key, azure_sas_key),
    CFG_RAW(azure_sas_expiry_s, azure_sas_expiry_s),
    CFG_RAW(azure_twin_enabled, azure_twin_enabled),
    CFG_RAW(azure_direct_methods_enabled, azure_direct_methods_enabled),
    CFG_RAW(azure_c2d_enabled, azure_c2d_enabled),
    CFG_RAW(azure_dps_enabled, azure_dps_enabled),
    CFG_STR(azure_dps_id_scope, azure_dps_id_scope),
    CFG_STR(azure_dps_registration_id, azure_dps_registration_id),
    CFG_STR(azure_dps_endpoint, azure_dps_endpoint),
    CFG_STR(azure_event_grid_topic, azure_event_grid_topic),
    CFG_STR(azure_event_grid_source, azure_event_grid_source),
    CFG_STR(azure_event_grid_event_type, azure_event_grid_event_type),
    CFG_RAW(aws_shadow_enabled, aws_shadow_enabled),
    CFG_RAW(aws_jobs_enabled, aws_jobs_enabled),
    CFG_RAW(aws_fleet_enabled, aws_fleet_enabled),
    CFG_STR(aws_fleet_template_name, aws_fleet_template_name),
    CFG_STR(aws_claim_cert_path, aws_claim_cert_path),
    CFG_STR(aws_claim_key_path, aws_claim_key_path),
};

/* Length of a string that need not be terminated within `max`. */
static size_t cfg_strnlen(const char *text, size_t max) {
  const char *end = memchr(text, '\0', max);

  return end != NULL ? (size_t)(end - text) : max;
}

#define CFG_RAW_MAX 4U /* the widest raw setting is a uint32_t */
#define CFG_NAME_MAX 40U
#define CFG_VALUE_MAX 512U /* mqtt_password */

/* The entry indexes after the table belong to the two override arrays. */
#define CFG_KEY_OVERRIDE_VALID ARRAY_SIZE(cfg_items)
#define CFG_KEY_OVERRIDE_ADDR (ARRAY_SIZE(cfg_items) + 1U)
#define CFG_KEY_COUNT (ARRAY_SIZE(cfg_items) + 2U)

BUILD_ASSERT(CFG_KEY_COUNT <= 100U, "cfg_NN keys carry two digits");
BUILD_ASSERT(sizeof(uint32_t) * ZPLC_MAX_TAGS <= CFG_VALUE_MAX,
             "the override address array must fit one stored entry");

/* The settings subsystem's name of a row of the table or an override array,
 * or NULL. One lookup, so the settings handler and the stored-entry loader
 * apply a value the same way. */
static const struct cfg_item *cfg_find(const char *name) {
  for (size_t i = 0U; i < ARRAY_SIZE(cfg_items); i++) {
    if (strcmp(cfg_items[i].name, name) == 0) {
      return &cfg_items[i];
    }
  }
  return NULL;
}

/* Applies one stored value to the in-memory setting it names. A value of
 * the wrong width is refused and leaves the setting as it was. */
static int cfg_apply(const char *name, const uint8_t *value, size_t length) {
  const struct cfg_item *item = cfg_find(name);

  if (item != NULL) {
    if (item->is_string) {
      char *text = (char *)item->ptr;
      size_t n = length < item->size ? length : (size_t)item->size - 1U;

      (void)snprintf(text, item->size, "%.*s", (int)n, (const char *)value);
      return 0;
    }
    if (length != item->size) {
      return -EINVAL;
    }
    memcpy(item->ptr, value, item->size);
    return 0;
  }

  if (strcmp(name, "modbus_tag_override_valid") == 0) {
    if (length != sizeof(modbus_tag_override_load_valid)) {
      modbus_tag_override_load_valid_seen = false;
      return -EINVAL;
    }
    memcpy(modbus_tag_override_load_valid, value, length);
    modbus_tag_override_load_valid_seen = true;
    return 0;
  }

  if (strcmp(name, "modbus_tag_override_addr") == 0) {
    if (length != sizeof(modbus_tag_override_load_addr)) {
      modbus_tag_override_load_addr_seen = false;
      return -EINVAL;
    }
    memcpy(modbus_tag_override_load_addr, value, length);
    modbus_tag_override_load_addr_seen = true;
    return 0;
  }

  return -ENOENT;
}

/* Publishes the override pair read by cfg_apply(), when it is complete. A lock
 * that cannot be taken (RT-030) leaves the published overrides as they were
 * and drops what was read. */
static int cfg_commit_overrides(void) {
  if (zplc_lock_take(&modbus_tag_override_lock, "modbus override lock") != 0) {
    zplc_modbus_override_load_reset();
    return -EIO;
  }
  memset(config.modbus_tag_override_valid, 0,
         sizeof(config.modbus_tag_override_valid));
  memset(config.modbus_tag_override_addr, 0,
         sizeof(config.modbus_tag_override_addr));

  if (modbus_tag_override_load_valid_seen &&
      modbus_tag_override_load_addr_seen) {
    for (uint16_t i = 0U; i < ZPLC_MAX_TAGS; ++i) {
      if (modbus_tag_override_load_valid[i] &&
          modbus_tag_override_load_addr[i] <= UINT16_MAX) {
        config.modbus_tag_override_addr[i] = modbus_tag_override_load_addr[i];
        config.modbus_tag_override_valid[i] = true;
      }
    }
  }
  k_mutex_unlock(&modbus_tag_override_lock);
  zplc_modbus_override_load_reset();
  return 0;
}

K_MUTEX_DEFINE(cfg_store_lock);
static uint8_t cfg_record[1U + CFG_NAME_MAX + 2U + CFG_VALUE_MAX];

#if defined(CONFIG_ZTEST)
/* Test seams (COM-027): the rows the store persists, and a store that fails
 * after a number of entries, to see that a failed save is reported. */
static int cfg_test_entries_left = -1;
static int cfg_test_store_error;

void zplc_config_test_fail_store_after(int entries, int error) {
  cfg_test_entries_left = entries;
  cfg_test_store_error = error;
}

size_t zplc_config_test_row_count(void) { return ARRAY_SIZE(cfg_items); }

const char *zplc_config_test_row(size_t index, uint8_t *value, size_t *length) {
  const struct cfg_item *item;

  if (index >= ARRAY_SIZE(cfg_items)) {
    return NULL;
  }
  item = &cfg_items[index];
  *length = item->is_string ? cfg_strnlen((const char *)item->ptr, item->size - 1U)
                            : item->size;
  memcpy(value, item->ptr, *length);
  return item->name;
}
#endif

static void cfg_key(size_t index, char *key, size_t key_size) {
  (void)snprintf(key, key_size, "cfg_%02u", (unsigned)index);
}

static int hal_to_errno(zplc_hal_result_t result) {
  if (result == ZPLC_HAL_OK) {
    return 0;
  }
  return result == ZPLC_HAL_NOT_IMPL ? -ENOTSUP : -EIO;
}

/* One entry of the store: name and value are written together. */
static int cfg_store_entry(size_t index, const char *name, const void *value,
                           size_t length) {
  const size_t name_length = strlen(name);
  char key[8];

#if defined(CONFIG_ZTEST)
  if (cfg_test_entries_left == 0) {
    return cfg_test_store_error;
  }
  if (cfg_test_entries_left > 0) {
    cfg_test_entries_left--;
  }
#endif
  if (name_length > CFG_NAME_MAX || length > CFG_VALUE_MAX) {
    return -ENAMETOOLONG;
  }
  cfg_record[0] = (uint8_t)name_length;
  memcpy(&cfg_record[1], name, name_length);
  cfg_record[1U + name_length] = (uint8_t)(length & 0xFFU);
  cfg_record[2U + name_length] = (uint8_t)(length >> 8);
  /* The record carries the value length in its header: it is binary, not a
   * string, and has no terminator. */
  memcpy(&cfg_record[3U + name_length], value, length); /* NOLINT(bugprone-not-null-terminated-result) */
  cfg_key(index, key, sizeof(key));
  return hal_to_errno(
      zplc_hal_persist_save(key, cfg_record, 3U + name_length + length));
}

/* Reads one entry and applies it when its name is the one expected. */
static int cfg_load_entry(size_t index, const char *name) {
  const size_t name_length = strlen(name);
  size_t length;
  char key[8];
  int rc;

  memset(cfg_record, 0, sizeof(cfg_record));
  cfg_key(index, key, sizeof(key));
  rc = hal_to_errno(zplc_hal_persist_load(key, cfg_record, sizeof(cfg_record)));
  if (rc != 0) {
    return rc;
  }
  if (cfg_record[0] != name_length ||
      memcmp(&cfg_record[1], name, name_length) != 0) {
    return -ENOENT; /* another setting lived here: not applied */
  }
  length = (size_t)cfg_record[1U + name_length] |
           ((size_t)cfg_record[2U + name_length] << 8);
  if (length > CFG_VALUE_MAX) {
    return -EINVAL;
  }
  return cfg_apply(name, &cfg_record[3U + name_length], length);
}

static int cfg_save_all(void) {
  bool valid[ZPLC_MAX_TAGS];
  uint32_t addr[ZPLC_MAX_TAGS];
  int rc = 0;

  if (zplc_lock_take(&cfg_store_lock, "config store lock") != 0) {
    return -EIO; /* nothing was written, and the caller is told so */
  }
  for (size_t i = 0U; i < ARRAY_SIZE(cfg_items) && rc == 0; i++) {
    const struct cfg_item *item = &cfg_items[i];
    size_t length = item->size;

    if (item->is_string) {
      length = cfg_strnlen((const char *)item->ptr, item->size - 1U);
    }
    rc = cfg_store_entry(i, item->name, item->ptr, length);
  }
  if (rc == 0) {
    if (zplc_lock_take(&modbus_tag_override_lock, "modbus override lock") != 0) {
      rc = -EIO;
    } else {
      memcpy(valid, config.modbus_tag_override_valid, sizeof(valid));
      memcpy(addr, config.modbus_tag_override_addr, sizeof(addr));
      k_mutex_unlock(&modbus_tag_override_lock);
      rc = cfg_store_entry(CFG_KEY_OVERRIDE_VALID, "modbus_tag_override_valid",
                           valid, sizeof(valid));
    }
  }
  if (rc == 0) {
    rc = cfg_store_entry(CFG_KEY_OVERRIDE_ADDR, "modbus_tag_override_addr",
                         addr, sizeof(addr));
  }
  k_mutex_unlock(&cfg_store_lock);
  return rc;
}

/* Applies every stored setting over the defaults. A missing entry keeps its
 * default; the first entry that is present and refused is reported. */
static int cfg_load_all(void) {
  int first_error = 0;

  if (zplc_lock_take(&cfg_store_lock, "config store lock") != 0) {
    return -EIO; /* the defaults stay */
  }
  zplc_modbus_override_load_reset();
  for (size_t i = 0U; i < ARRAY_SIZE(cfg_items); i++) {
    int rc = cfg_load_entry(i, cfg_items[i].name);

    if (rc != 0 && rc != -ENOTSUP && first_error == 0 && rc != -ENOENT) {
      first_error = rc;
    }
  }
  (void)cfg_load_entry(CFG_KEY_OVERRIDE_VALID, "modbus_tag_override_valid");
  (void)cfg_load_entry(CFG_KEY_OVERRIDE_ADDR, "modbus_tag_override_addr");
  if (cfg_commit_overrides() != 0 && first_error == 0) {
    first_error = -EIO;
  }
#if !defined(CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS)
  /* COM-014: a no-verify setting stored by an image that allowed it is not
   * honoured by one that does not. The MQTT client refuses it as well; this
   * keeps the reported state true. */
  if (config.mqtt_security == ZPLC_MQTT_SECURITY_TLS_NO_VERIFY) {
    config.mqtt_security = ZPLC_MQTT_SECURITY_TLS_SERVER_VERIFY;
    LOG_WRN("stored mqtt_security 'no verify' is not allowed in this build; "
            "server verification is used");
  }
#endif
  k_mutex_unlock(&cfg_store_lock);
  return first_error;
}

#if defined(CONFIG_SETTINGS)
/*
 * The Zephyr settings handler stays as the runtime interface to the same
 * table (`settings_runtime_set("zplc/<name>", ...)` and the commit that
 * publishes the Modbus override pair). Persistence does not go through it:
 * the settings back ends of the boards sit on a partition the program store
 * already owns.
 */
static int zplc_settings_set(const char *name, size_t len,
                             settings_read_cb read_cb, void *cb_arg) {
  static uint8_t value[CFG_VALUE_MAX];
  int rc;

  ARG_UNUSED(len);
  if (cfg_find(name) == NULL &&
      strcmp(name, "modbus_tag_override_valid") != 0 &&
      strcmp(name, "modbus_tag_override_addr") != 0) {
    return -ENOENT;
  }

  rc = read_cb(cb_arg, value, sizeof(value));
  if (rc < 0) {
    return rc;
  }
  return cfg_apply(name, value, (size_t)rc);
}

static int zplc_settings_commit(void) {
  return cfg_commit_overrides();
}

static struct settings_handler zplc_conf_handler = {
    .name = "zplc",
    .h_set = zplc_settings_set,
    .h_commit = zplc_settings_commit,
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
  /* COM-014: there is no default broker. A device publishes nowhere until an
   * operator names the server; a public test server as default sent a
   * plant's tags to a stranger. */
  config.mqtt_broker[0] = '\0';
  config.mqtt_client_id[0] = '\0';
  strncpy(config.mqtt_topic_namespace, "spBv1.0/ZPLC",
          sizeof(config.mqtt_topic_namespace));
  config.mqtt_profile = ZPLC_MQTT_PROFILE_SPARKPLUG_B;
  config.mqtt_protocol = ZPLC_MQTT_PROTOCOL_5_0;
  /* COM-014: TLS with certificate verification is the default. Plain TCP
   * and a no-verify TLS session are explicit choices (see mqtt_security). */
  config.mqtt_transport = ZPLC_MQTT_TRANSPORT_TLS;
  config.mqtt_port = 8883;
  config.mqtt_username[0] = '\0';
  config.mqtt_password[0] = '\0';
  config.mqtt_keepalive_sec = 60;
  config.mqtt_publish_interval_ms = 2000U;
  config.mqtt_publish_qos = ZPLC_MQTT_QOS0;
  config.mqtt_subscribe_qos = ZPLC_MQTT_QOS0;
  config.mqtt_publish_retain = false;
  config.mqtt_clean_session = true;
  config.mqtt_session_expiry_sec = 0U;
  config.mqtt_security = ZPLC_MQTT_SECURITY_TLS_SERVER_VERIFY;
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
  if (zplc_lock_take(&modbus_tag_override_lock, "modbus override lock") == 0) {
    memset(config.modbus_tag_override_valid, 0,
           sizeof(config.modbus_tag_override_valid));
    memset(config.modbus_tag_override_addr, 0,
           sizeof(config.modbus_tag_override_addr));
    k_mutex_unlock(&modbus_tag_override_lock);
  }
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
  int rc;

  zplc_config_set_defaults();

#if defined(CONFIG_FILE_SYSTEM_LITTLEFS)
  rc = fs_mount(&zplc_lfs_mount);
  if (rc < 0 && rc != -EBUSY) {
    LOG_WRN("LittleFS mount failed (%d), using defaults", rc);
  }
#endif

  /* The stored settings, over the defaults. Running this again is what a
   * reboot does: the memory goes back to the defaults and the store is read
   * (a reboot test needs nothing else). */
  rc = cfg_load_all();
  if (rc != 0) {
    LOG_WRN("stored settings partly refused (%d), defaults kept for those", rc);
  }

#if defined(CONFIG_SETTINGS)
  rc = settings_subsys_init();
  if (rc) {
    LOG_WRN("settings_subsys_init failed: %d (stored settings unaffected)", rc);
    return 0;
  }
  rc = settings_register(&zplc_conf_handler);
  if (rc && rc != -EEXIST) {
    LOG_WRN("settings_register failed: %d", rc);
    return 0;
  }
#endif

  LOG_INF("Config loaded. MQTT=%s", config.mqtt_enabled ? "on" : "off");
  return 0;
}

int zplc_config_save(void) {
  /* Setters only update the in-memory config struct. This is the ONLY
   * storage flush point: call it after a batch of config sets. It writes
   * every row of cfg_items and the Modbus overrides, stops at the first
   * write that fails and returns that error (COM-027). */
  return cfg_save_all();
}

int zplc_config_reset(void) {
  zplc_config_set_defaults();
  return cfg_save_all();
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

bool zplc_config_get_modbus_tag_override(uint16_t index,
                                         uint16_t register_count,
                                         uint32_t *address) {
  uint32_t override_addr;

  if (index >= ZPLC_MAX_TAGS || register_count == 0U)
    return false;
  if (zplc_lock_take(&modbus_tag_override_lock, "modbus override lock") != 0)
    return false;
  if (!config.modbus_tag_override_valid[index]) {
    k_mutex_unlock(&modbus_tag_override_lock);
    return false;
  }
  override_addr = config.modbus_tag_override_addr[index];
  if (override_addr > UINT16_MAX ||
      register_count - 1U > UINT16_MAX - override_addr) {
    k_mutex_unlock(&modbus_tag_override_lock);
    return false;
  }
  if (address != NULL) {
    *address = override_addr;
  }
  k_mutex_unlock(&modbus_tag_override_lock);
  return true;
}

int zplc_config_set_modbus_tag_override(uint16_t index, uint32_t address,
                                        uint16_t register_count) {
  if (index >= ZPLC_MAX_TAGS || register_count == 0U)
    return -EINVAL;
  if (address > UINT16_MAX || register_count - 1U > UINT16_MAX - address)
    return -ERANGE;
  if (zplc_lock_take(&modbus_tag_override_lock, "modbus override lock") != 0)
    return -EIO;
  config.modbus_tag_override_addr[index] = address;
#if defined(CONFIG_ZTEST)
  if (modbus_tag_override_publish_hook != NULL) {
    modbus_tag_override_publish_hook();
  }
#endif
  config.modbus_tag_override_valid[index] = true;
  k_mutex_unlock(&modbus_tag_override_lock);
  return 0;
}

int zplc_config_clear_modbus_tag_override(uint16_t index) {
  if (index >= ZPLC_MAX_TAGS)
    return -EINVAL;
  if (zplc_lock_take(&modbus_tag_override_lock, "modbus override lock") != 0)
    return -EIO;
  config.modbus_tag_override_valid[index] = false;
  config.modbus_tag_override_addr[index] = 0;
  k_mutex_unlock(&modbus_tag_override_lock);
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
    /* No MQTT client is linked, but what is configured is still known and
     * is what an operator reads here (COM-014): the TLS state is the one
     * the configuration would give a client. */
    status->transport = config.mqtt_transport;
    status->tls_verify = (uint8_t)zplc_config_get_mqtt_tls_verify();
    status->profile = config.mqtt_profile;
    strncpy(status->broker, config.mqtt_broker, sizeof(status->broker) - 1U);
  }
}

__attribute__((weak)) void
zplc_mqtt_set_azure_c2d_callback(zplc_azure_c2d_cb_t cb) {
  ARG_UNUSED(cb);
  LOG_WRN("zplc_mqtt_set_azure_c2d_callback: MQTT module not linked");
}

__attribute__((weak)) bool zplc_mqtt_is_connected(void) { return false; }

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

zplc_mqtt_tls_verify_t zplc_config_get_mqtt_tls_verify(void) {
  if (config.mqtt_transport != ZPLC_MQTT_TRANSPORT_TLS &&
      config.mqtt_transport != ZPLC_MQTT_TRANSPORT_WSS) {
    return ZPLC_MQTT_TLS_VERIFY_NOT_APPLICABLE;
  }
  /* NONE over a TLS transport is refused when the client is set up; it does
   * not reach a server unverified, so it is not reported as "off". */
  return config.mqtt_security == ZPLC_MQTT_SECURITY_TLS_NO_VERIFY
             ? ZPLC_MQTT_TLS_VERIFY_OFF
             : ZPLC_MQTT_TLS_VERIFY_ON;
}

bool zplc_config_mqtt_tls_verify_off(void) {
  return config.mqtt_enabled &&
         zplc_config_get_mqtt_tls_verify() == ZPLC_MQTT_TLS_VERIFY_OFF;
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
