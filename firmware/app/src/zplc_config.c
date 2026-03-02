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
    char mqtt_broker[64];
    uint16_t mqtt_port;
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

    if (settings_name_steq(name, "mqtt_broker", &next) && !next) {
        rc = read_cb(cb_arg, config.mqtt_broker, sizeof(config.mqtt_broker) - 1);
        if (rc >= 0) config.mqtt_broker[rc] = '\0';
        return 0;
    }

    if (settings_name_steq(name, "mqtt_port", &next) && !next) {
        rc = read_cb(cb_arg, &config.mqtt_port, sizeof(config.mqtt_port));
        return (rc >= 0) ? 0 : rc;
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
    strncpy(config.mqtt_broker, "test.mosquitto.org", sizeof(config.mqtt_broker));
    config.mqtt_port = 1883;

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
    settings_save_one("zplc/mqtt_broker", config.mqtt_broker, strlen(config.mqtt_broker));
    settings_save_one("zplc/mqtt_port", &config.mqtt_port, sizeof(config.mqtt_port));
    
    return 0;
}

int zplc_config_reset(void)
{
    /* Simply re-init with defaults and save */
    strncpy(config.hostname, "zplc-device", sizeof(config.hostname));
    config.dhcp = true;
    strncpy(config.ip, "0.0.0.0", sizeof(config.ip));
    config.modbus_id = 1;
    strncpy(config.mqtt_broker, "test.mosquitto.org", sizeof(config.mqtt_broker));
    config.mqtt_port = 1883;

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

void zplc_config_get_mqtt_broker(char *buf, size_t len) {
    strncpy(buf, config.mqtt_broker, len);
}

void zplc_config_set_mqtt_broker(const char *broker) {
    strncpy(config.mqtt_broker, broker, sizeof(config.mqtt_broker) - 1);
}

uint16_t zplc_config_get_mqtt_port(void) {
    return config.mqtt_port;
}

void zplc_config_set_mqtt_port(uint16_t port) {
    config.mqtt_port = port;
}
