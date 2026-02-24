/**
 * ZPLC Configuration Manager Implementation
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_config.h"
#include <zephyr/settings/settings.h>
#include <string.h>
#include <stdio.h>
#include <errno.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_config, LOG_LEVEL_INF);

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
    strncpy(config.mqtt_broker, "localhost", sizeof(config.mqtt_broker));
    config.mqtt_port = 1883;

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
    strncpy(config.mqtt_broker, "localhost", sizeof(config.mqtt_broker));
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
