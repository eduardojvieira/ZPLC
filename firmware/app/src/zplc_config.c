/**
 * ZPLC Configuration Manager Implementation
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_config.h"
#include <zephyr/settings/settings.h>
#include <zephyr/fs/fs.h>
#include <zephyr/fs/littlefs.h>
#include <zephyr/storage/flash_map.h>
#include <string.h>
#include <stdio.h>
#include <errno.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_config, LOG_LEVEL_INF);

/* LittleFS mount on external QSPI NOR flash (storage_partition).
 * Must be mounted before settings_subsys_init() when using SETTINGS_FILE.
 * Variable renamed to zplc_lfs_mount to avoid collision with lfs_mount()
 * function declared in lfs.h.
 */
FS_LITTLEFS_DECLARE_DEFAULT_CONFIG(qspi_lfs_data);
static struct fs_mount_t zplc_lfs_mount = {
    .type      = FS_LITTLEFS,
    .fs_data   = &qspi_lfs_data,
    .storage_dev = (void *)FIXED_PARTITION_ID(storage_partition),
    .mnt_point = "/lfs",
};

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
    bool mqtt_enabled;
    char mqtt_broker[64];
    char mqtt_client_id[64];
    char mqtt_topic_namespace[64];
    uint16_t mqtt_port;
    char mqtt_username[64];
    char mqtt_password[64];
    uint16_t mqtt_keepalive_sec;
    uint32_t mqtt_publish_interval_ms;
    bool mqtt_clean_session;
    uint8_t mqtt_security;
    char mqtt_ca_cert_path[96];
    char mqtt_client_cert_path[96];
    char mqtt_client_key_path[96];
} config;

/* ============================================================================
 * Settings Callbacks
 * ============================================================================ */

static int zplc_settings_set(const char *name, size_t len, settings_read_cb read_cb, void *cb_arg)
{
    const char *next;
    int rc;

    if (settings_name_steq(name, "hostname", &next) && !next) {
        rc = read_cb(cb_arg, config.hostname, sizeof(config.hostname) - 1);
        if (rc >= 0) config.hostname[rc] = '\0';
        return 0;
    }

    if (settings_name_steq(name, "dhcp", &next) && !next) {
        rc = read_cb(cb_arg, &config.dhcp, sizeof(config.dhcp));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "ip", &next) && !next) {
        rc = read_cb(cb_arg, config.ip, sizeof(config.ip) - 1);
        if (rc >= 0) config.ip[rc] = '\0';
        return 0;
    }

    if (settings_name_steq(name, "modbus_id", &next) && !next) {
        rc = read_cb(cb_arg, &config.modbus_id, sizeof(config.modbus_id));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "modbus_tcp_enabled", &next) && !next) {
        rc = read_cb(cb_arg, &config.modbus_tcp_enabled, sizeof(config.modbus_tcp_enabled));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "modbus_tcp_port", &next) && !next) {
        rc = read_cb(cb_arg, &config.modbus_tcp_port, sizeof(config.modbus_tcp_port));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "modbus_rtu_enabled", &next) && !next) {
        rc = read_cb(cb_arg, &config.modbus_rtu_enabled, sizeof(config.modbus_rtu_enabled));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "modbus_rtu_baud", &next) && !next) {
        rc = read_cb(cb_arg, &config.modbus_rtu_baud, sizeof(config.modbus_rtu_baud));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "modbus_rtu_parity", &next) && !next) {
        rc = read_cb(cb_arg, &config.modbus_rtu_parity, sizeof(config.modbus_rtu_parity));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "mqtt_broker", &next) && !next) {
        rc = read_cb(cb_arg, config.mqtt_broker, sizeof(config.mqtt_broker) - 1);
        if (rc >= 0) config.mqtt_broker[rc] = '\0';
        return 0;
    }

    if (settings_name_steq(name, "mqtt_client_id", &next) && !next) {
        rc = read_cb(cb_arg, config.mqtt_client_id, sizeof(config.mqtt_client_id) - 1);
        if (rc >= 0) config.mqtt_client_id[rc] = '\0';
        return 0;
    }

    if (settings_name_steq(name, "mqtt_topic_namespace", &next) && !next) {
        rc = read_cb(cb_arg, config.mqtt_topic_namespace, sizeof(config.mqtt_topic_namespace) - 1);
        if (rc >= 0) config.mqtt_topic_namespace[rc] = '\0';
        return 0;
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
        rc = read_cb(cb_arg, config.mqtt_username, sizeof(config.mqtt_username) - 1);
        if (rc >= 0) config.mqtt_username[rc] = '\0';
        return 0;
    }

    if (settings_name_steq(name, "mqtt_password", &next) && !next) {
        rc = read_cb(cb_arg, config.mqtt_password, sizeof(config.mqtt_password) - 1);
        if (rc >= 0) config.mqtt_password[rc] = '\0';
        return 0;
    }

    if (settings_name_steq(name, "mqtt_keepalive_sec", &next) && !next) {
        rc = read_cb(cb_arg, &config.mqtt_keepalive_sec, sizeof(config.mqtt_keepalive_sec));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "mqtt_publish_interval_ms", &next) && !next) {
        rc = read_cb(cb_arg, &config.mqtt_publish_interval_ms, sizeof(config.mqtt_publish_interval_ms));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "mqtt_clean_session", &next) && !next) {
        rc = read_cb(cb_arg, &config.mqtt_clean_session, sizeof(config.mqtt_clean_session));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "mqtt_security", &next) && !next) {
        rc = read_cb(cb_arg, &config.mqtt_security, sizeof(config.mqtt_security));
        return (rc >= 0) ? 0 : rc;
    }

    if (settings_name_steq(name, "mqtt_ca_cert_path", &next) && !next) {
        rc = read_cb(cb_arg, config.mqtt_ca_cert_path, sizeof(config.mqtt_ca_cert_path) - 1);
        if (rc >= 0) config.mqtt_ca_cert_path[rc] = '\0';
        return 0;
    }

    if (settings_name_steq(name, "mqtt_client_cert_path", &next) && !next) {
        rc = read_cb(cb_arg, config.mqtt_client_cert_path, sizeof(config.mqtt_client_cert_path) - 1);
        if (rc >= 0) config.mqtt_client_cert_path[rc] = '\0';
        return 0;
    }

    if (settings_name_steq(name, "mqtt_client_key_path", &next) && !next) {
        rc = read_cb(cb_arg, config.mqtt_client_key_path, sizeof(config.mqtt_client_key_path) - 1);
        if (rc >= 0) config.mqtt_client_key_path[rc] = '\0';
        return 0;
    }

    return -ENOENT;
}

static struct settings_handler zplc_conf_handler = {
    .name = "zplc",
    .h_set = zplc_settings_set,
};

/* ============================================================================
 * Public API
 * ============================================================================ */

int zplc_config_init(void)
{
    int err;

    /* Set defaults */
    strncpy(config.hostname, "zplc-device", sizeof(config.hostname));
    config.dhcp = true;
    strncpy(config.ip, "0.0.0.0", sizeof(config.ip));
    config.modbus_id = 1;
    config.modbus_tcp_enabled = true;
    config.modbus_tcp_port = 502;
    config.modbus_rtu_enabled = false;
    config.modbus_rtu_baud = 19200U;
    config.modbus_rtu_parity = ZPLC_MODBUS_PARITY_NONE;
    config.mqtt_enabled = true;
    strncpy(config.mqtt_broker, "test.mosquitto.org", sizeof(config.mqtt_broker));
    config.mqtt_client_id[0] = '\0';
    strncpy(config.mqtt_topic_namespace, "spBv1.0/ZPLC", sizeof(config.mqtt_topic_namespace));
    config.mqtt_port = 1883;
    config.mqtt_username[0] = '\0';
    config.mqtt_password[0] = '\0';
    config.mqtt_keepalive_sec = 60;
    config.mqtt_publish_interval_ms = 2000U;
    config.mqtt_clean_session = true;
    config.mqtt_security = ZPLC_MQTT_SECURITY_NONE;
    strncpy(config.mqtt_ca_cert_path, "/lfs/certs/ca.pem", sizeof(config.mqtt_ca_cert_path));
    strncpy(config.mqtt_client_cert_path, "/lfs/certs/client.pem", sizeof(config.mqtt_client_cert_path));
    strncpy(config.mqtt_client_key_path, "/lfs/certs/client.key", sizeof(config.mqtt_client_key_path));

    /* Mount LittleFS on external QSPI NOR flash.
     * SETTINGS_FILE requires a mounted filesystem before settings_subsys_init().
     * On first boot the partition is unformatted — fs_mount() returns -ENOENT
     * or a negative errno. We detect that and call fs_mkfs() to format it.
     */
    err = fs_mount(&zplc_lfs_mount);
    if (err < 0) {
        LOG_WRN("LittleFS mount failed (err %d) — formatting QSPI storage...", err);
        err = fs_mkfs(FS_LITTLEFS, (uintptr_t)FIXED_PARTITION_ID(storage_partition),
                      NULL, 0);
        if (err) {
            LOG_ERR("LittleFS mkfs failed (err %d)", err);
            /* Non-fatal: continue with in-RAM defaults */
            err = 0;
            goto skip_lfs;
        }
        err = fs_mount(&zplc_lfs_mount);
    }
    if (err) {
        LOG_ERR("LittleFS mount failed after format (err %d) — settings will not persist", err);
        err = 0; /* Non-fatal */
        goto skip_lfs;
    }

    LOG_INF("LittleFS mounted on /lfs");

    /* Sanity check: settings_file backend needs /lfs/settings to be a FILE,
     * not a directory. A previous firmware version incorrectly created it as
     * a directory (fs_mkdir). Detect that and remove it so settings_file can
     * create a proper file on first access.
     */
    {
        struct fs_dirent dirent;
        if (fs_stat(CONFIG_SETTINGS_FILE_PATH, &dirent) == 0 &&
            dirent.type == FS_DIR_ENTRY_DIR) {
            LOG_WRN("'%s' exists as a directory — removing stale artifact",
                    CONFIG_SETTINGS_FILE_PATH);
            (void)fs_unlink(CONFIG_SETTINGS_FILE_PATH);
        }
    }

skip_lfs:

    err = settings_subsys_init();
    if (err) {
        LOG_ERR("Settings subsys init failed (err %d)", err);
        return err;
    }

    err = settings_register(&zplc_conf_handler);
    if (err) {
        LOG_ERR("Settings register failed (err %d)", err);
        return err;
    }

    /* Load values from storage */
    err = settings_load();
    if (err) {
        LOG_WRN("Settings load failed (err %d), using defaults", err);
    }

    return 0;
}

int zplc_config_save(void)
{
    settings_save_one("zplc/hostname", config.hostname, strlen(config.hostname));
    settings_save_one("zplc/dhcp", &config.dhcp, sizeof(config.dhcp));
    settings_save_one("zplc/ip", config.ip, strlen(config.ip));
    settings_save_one("zplc/modbus_id", &config.modbus_id, sizeof(config.modbus_id));
    settings_save_one("zplc/modbus_tcp_enabled", &config.modbus_tcp_enabled, sizeof(config.modbus_tcp_enabled));
    settings_save_one("zplc/modbus_tcp_port", &config.modbus_tcp_port, sizeof(config.modbus_tcp_port));
    settings_save_one("zplc/modbus_rtu_enabled", &config.modbus_rtu_enabled, sizeof(config.modbus_rtu_enabled));
    settings_save_one("zplc/modbus_rtu_baud", &config.modbus_rtu_baud, sizeof(config.modbus_rtu_baud));
    settings_save_one("zplc/modbus_rtu_parity", &config.modbus_rtu_parity, sizeof(config.modbus_rtu_parity));
    settings_save_one("zplc/mqtt_enabled", &config.mqtt_enabled, sizeof(config.mqtt_enabled));
    settings_save_one("zplc/mqtt_broker", config.mqtt_broker, strlen(config.mqtt_broker));
    settings_save_one("zplc/mqtt_client_id", config.mqtt_client_id, strlen(config.mqtt_client_id));
    settings_save_one("zplc/mqtt_topic_namespace", config.mqtt_topic_namespace, strlen(config.mqtt_topic_namespace));
    settings_save_one("zplc/mqtt_port", &config.mqtt_port, sizeof(config.mqtt_port));
    settings_save_one("zplc/mqtt_username", config.mqtt_username, strlen(config.mqtt_username));
    settings_save_one("zplc/mqtt_password", config.mqtt_password, strlen(config.mqtt_password));
    settings_save_one("zplc/mqtt_keepalive_sec", &config.mqtt_keepalive_sec, sizeof(config.mqtt_keepalive_sec));
    settings_save_one("zplc/mqtt_publish_interval_ms", &config.mqtt_publish_interval_ms, sizeof(config.mqtt_publish_interval_ms));
    settings_save_one("zplc/mqtt_clean_session", &config.mqtt_clean_session, sizeof(config.mqtt_clean_session));
    settings_save_one("zplc/mqtt_security", &config.mqtt_security, sizeof(config.mqtt_security));
    settings_save_one("zplc/mqtt_ca_cert_path", config.mqtt_ca_cert_path, strlen(config.mqtt_ca_cert_path));
    settings_save_one("zplc/mqtt_client_cert_path", config.mqtt_client_cert_path, strlen(config.mqtt_client_cert_path));
    settings_save_one("zplc/mqtt_client_key_path", config.mqtt_client_key_path, strlen(config.mqtt_client_key_path));
    
    return 0;
}

int zplc_config_reset(void)
{
    /* Simply re-init with defaults and save */
    strncpy(config.hostname, "zplc-device", sizeof(config.hostname));
    config.dhcp = true;
    strncpy(config.ip, "0.0.0.0", sizeof(config.ip));
    config.modbus_id = 1;
    config.modbus_tcp_enabled = true;
    config.modbus_tcp_port = 502;
    config.modbus_rtu_enabled = false;
    config.modbus_rtu_baud = 19200U;
    config.modbus_rtu_parity = ZPLC_MODBUS_PARITY_NONE;
    config.mqtt_enabled = true;
    strncpy(config.mqtt_broker, "test.mosquitto.org", sizeof(config.mqtt_broker));
    config.mqtt_client_id[0] = '\0';
    strncpy(config.mqtt_topic_namespace, "spBv1.0/ZPLC", sizeof(config.mqtt_topic_namespace));
    config.mqtt_port = 1883;
    config.mqtt_username[0] = '\0';
    config.mqtt_password[0] = '\0';
    config.mqtt_keepalive_sec = 60;
    config.mqtt_publish_interval_ms = 2000U;
    config.mqtt_clean_session = true;
    config.mqtt_security = ZPLC_MQTT_SECURITY_NONE;
    strncpy(config.mqtt_ca_cert_path, "/lfs/certs/ca.pem", sizeof(config.mqtt_ca_cert_path));
    strncpy(config.mqtt_client_cert_path, "/lfs/certs/client.pem", sizeof(config.mqtt_client_cert_path));
    strncpy(config.mqtt_client_key_path, "/lfs/certs/client.key", sizeof(config.mqtt_client_key_path));

    return zplc_config_save();
}

/* Getters/Setters */

void zplc_config_get_hostname(char *buf, size_t len) {
    strncpy(buf, config.hostname, len);
}

void zplc_config_set_hostname(const char *name) {
    strncpy(config.hostname, name, sizeof(config.hostname) - 1);
}

bool zplc_config_get_dhcp(void) {
    return config.dhcp;
}

void zplc_config_set_dhcp(bool enabled) {
    config.dhcp = enabled;
}

void zplc_config_get_ip(char *buf, size_t len) {
    strncpy(buf, config.ip, len);
}

void zplc_config_set_ip(const char *ip) {
    strncpy(config.ip, ip, sizeof(config.ip) - 1);
}

uint16_t zplc_config_get_modbus_id(void) {
    return config.modbus_id;
}

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

void zplc_config_get_mqtt_broker(char *buf, size_t len) {
    strncpy(buf, config.mqtt_broker, len);
}

void zplc_config_set_mqtt_broker(const char *broker) {
    strncpy(config.mqtt_broker, broker, sizeof(config.mqtt_broker) - 1);
}

void zplc_config_get_mqtt_client_id(char *buf, size_t len) {
    strncpy(buf, config.mqtt_client_id, len);
}

void zplc_config_set_mqtt_client_id(const char *client_id) {
    strncpy(config.mqtt_client_id, client_id, sizeof(config.mqtt_client_id) - 1);
}

void zplc_config_get_mqtt_topic_namespace(char *buf, size_t len) {
    strncpy(buf, config.mqtt_topic_namespace, len);
}

void zplc_config_set_mqtt_topic_namespace(const char *topic_namespace) {
    strncpy(config.mqtt_topic_namespace, topic_namespace, sizeof(config.mqtt_topic_namespace) - 1);
}

uint16_t zplc_config_get_mqtt_port(void) {
    return config.mqtt_port;
}

void zplc_config_set_mqtt_port(uint16_t port) {
    config.mqtt_port = port;
}

bool zplc_config_get_mqtt_enabled(void) {
    return config.mqtt_enabled;
}

void zplc_config_set_mqtt_enabled(bool enabled) {
    config.mqtt_enabled = enabled;
}

void zplc_config_get_mqtt_username(char *buf, size_t len) {
    strncpy(buf, config.mqtt_username, len);
}

void zplc_config_set_mqtt_username(const char *username) {
    strncpy(config.mqtt_username, username, sizeof(config.mqtt_username) - 1);
}

void zplc_config_get_mqtt_password(char *buf, size_t len) {
    strncpy(buf, config.mqtt_password, len);
}

void zplc_config_set_mqtt_password(const char *password) {
    strncpy(config.mqtt_password, password, sizeof(config.mqtt_password) - 1);
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

bool zplc_config_get_mqtt_clean_session(void) {
    return config.mqtt_clean_session;
}

void zplc_config_set_mqtt_clean_session(bool clean_session) {
    config.mqtt_clean_session = clean_session;
}

zplc_mqtt_security_t zplc_config_get_mqtt_security(void) {
    return (zplc_mqtt_security_t)config.mqtt_security;
}

void zplc_config_set_mqtt_security(zplc_mqtt_security_t security) {
    config.mqtt_security = (uint8_t)security;
}

void zplc_config_get_mqtt_ca_cert_path(char *buf, size_t len) {
    strncpy(buf, config.mqtt_ca_cert_path, len);
}

void zplc_config_set_mqtt_ca_cert_path(const char *path) {
    strncpy(config.mqtt_ca_cert_path, path, sizeof(config.mqtt_ca_cert_path) - 1);
}

void zplc_config_get_mqtt_client_cert_path(char *buf, size_t len) {
    strncpy(buf, config.mqtt_client_cert_path, len);
}

void zplc_config_set_mqtt_client_cert_path(const char *path) {
    strncpy(config.mqtt_client_cert_path, path, sizeof(config.mqtt_client_cert_path) - 1);
}

void zplc_config_get_mqtt_client_key_path(char *buf, size_t len) {
    strncpy(buf, config.mqtt_client_key_path, len);
}

void zplc_config_set_mqtt_client_key_path(const char *path) {
    strncpy(config.mqtt_client_key_path, path, sizeof(config.mqtt_client_key_path) - 1);
}
