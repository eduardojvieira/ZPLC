/*
 * Register the communication handlers of the simulation runtime (COM-009). See host_comm.h.
 *
 * SPDX-License-Identifier: MIT
 */
#define _POSIX_C_SOURCE 200809L /* NOLINT(bugprone-reserved-identifier,cert-dcl37-c,cert-dcl51-cpp): feature-test macro */

#include "host_comm.h"

#include <errno.h>
#include <signal.h>
#include <stdlib.h>
#include <string.h>

#include <zplc_comm_dispatch.h>

#include "zplc_comm_modbus_handler.h"
#include "zplc_comm_mqtt_handler.h"

/* The service of a block that a simulation does not have: a status of its own, not "no handler". */
static int unavailable_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len, zplc_comm_call_t call) {
  (void)kind;
  (void)fb_mem;
  (void)fb_len;
  if (call == ZPLC_COMM_CALL_RESET) {
    return ZPLC_COMM_HANDLER_DONE;
  }
  return ZPLC_COMM_HANDLER_FAIL(ZPLC_COMM_UNAVAILABLE);
}

/* Every one of the twelve blocks, answered "unavailable in simulation" (an endpoint could not start). */
static int register_all_unavailable(void) {
  static const zplc_comm_fb_kind_t all[] = {
      ZPLC_COMM_FB_MB_READ_HREG,   ZPLC_COMM_FB_MB_WRITE_HREG, ZPLC_COMM_FB_MB_READ_COIL,   ZPLC_COMM_FB_MB_WRITE_COIL,
      ZPLC_COMM_FB_MQTT_CONNECT,   ZPLC_COMM_FB_MQTT_PUBLISH,  ZPLC_COMM_FB_MQTT_SUBSCRIBE, ZPLC_COMM_FB_AZURE_C2D_RECV,
      ZPLC_COMM_FB_AZURE_DPS_PROV, ZPLC_COMM_FB_AZURE_EG_PUB,  ZPLC_COMM_FB_AWS_FLEET_PROV, ZPLC_COMM_FB_SPB_REBIRTH,
  };
  size_t i;

  for (i = 0U; i < sizeof(all) / sizeof(all[0]); i++) {
    const int rc = zplc_comm_register_handler(all[i], unavailable_handler);

    if (rc != 0) {
      return rc;
    }
  }
  return 0;
}

static zplc_host_endpoints_t s_endpoints;
static zplc_loopback_modbus_t *s_modbus;
static zplc_loopback_mqtt_t *s_mqtt;

void zplc_host_comm_endpoints(zplc_host_endpoints_t *out) { *out = s_endpoints; }
zplc_loopback_modbus_t *zplc_host_comm_loopback_modbus(void) { return s_modbus; }
zplc_loopback_mqtt_t *zplc_host_comm_loopback_mqtt(void) { return s_mqtt; }

int zplc_host_comm_start_loopback(uint16_t modbus_port, uint16_t mqtt_port) {
  zplc_host_mqtt_config_t config;
  int rc;

  s_modbus = zplc_loopback_modbus_start(modbus_port, &s_endpoints.modbus_port);
  s_mqtt = s_modbus != NULL ? zplc_loopback_mqtt_start(mqtt_port, &s_endpoints.mqtt_port) : NULL;
  if (s_modbus == NULL || s_mqtt == NULL) {
    zplc_loopback_modbus_stop(s_modbus);
    s_modbus = NULL;
    s_endpoints.state = ZPLC_HOST_ENDPOINTS_FAILED;
    s_endpoints.modbus_port = 0U;
    s_endpoints.mqtt_port = 0U;
    (void)signal(SIGPIPE, SIG_IGN);
    rc = register_all_unavailable();
    return rc != 0 ? rc : -EADDRINUSE;
  }
  rc = zplc_host_comm_register();
  if (rc == 0) {
    zplc_host_modbus_redirect(s_endpoints.modbus_port);
    memset(&config, 0, sizeof(config));
    config.host = "127.0.0.1";
    config.port = s_endpoints.mqtt_port;
    rc = zplc_host_mqtt_start(&config);
  }
  s_endpoints.state = rc == 0 ? ZPLC_HOST_ENDPOINTS_RUNNING : ZPLC_HOST_ENDPOINTS_FAILED;
  return rc;
}

int zplc_host_comm_register(void) {
  static const zplc_comm_fb_kind_t cloud[] = {
      ZPLC_COMM_FB_AZURE_C2D_RECV, ZPLC_COMM_FB_AZURE_DPS_PROV, ZPLC_COMM_FB_AZURE_EG_PUB,
      ZPLC_COMM_FB_AWS_FLEET_PROV, ZPLC_COMM_FB_SPB_REBIRTH,
  };
  size_t i;
  int rc;

  /* A write to a connection that the peer closed is an error to report, not a signal that ends the runtime. */
  (void)signal(SIGPIPE, SIG_IGN);

  rc = zplc_comm_modbus_handler_init();
  if (rc != 0) {
    return rc;
  }
  rc = zplc_comm_mqtt_handler_init();
  if (rc != 0) {
    return rc;
  }
  for (i = 0U; i < sizeof(cloud) / sizeof(cloud[0]); i++) {
    rc = zplc_comm_register_handler(cloud[i], unavailable_handler);
    if (rc != 0) {
      return rc;
    }
  }
  return 0;
}

int zplc_host_comm_init_from_environment(void) {
  const char *enabled = getenv("ZPLC_NATIVE_COMM");
  const char *timeout = getenv("ZPLC_NATIVE_MODBUS_TIMEOUT_MS");
  const char *broker = getenv("ZPLC_NATIVE_MQTT_BROKER");
  const char *loopback = getenv("ZPLC_NATIVE_LOOPBACK");
  int rc;

  if (enabled == NULL || strcmp(enabled, "1") != 0) {
    return 0;
  }
  if (timeout != NULL && timeout[0] != '\0') {
    const long value = strtol(timeout, NULL, 10);

    if (value > 0 && value <= 60000L) {
      zplc_host_modbus_set_timeout_ms((uint32_t)value);
    }
  }
  if (loopback != NULL && strcmp(loopback, "1") == 0 && (broker == NULL || broker[0] == '\0')) {
    return zplc_host_comm_start_loopback(0U, 0U) == 0 ? 0 : -EADDRINUSE;
  }
  rc = zplc_host_comm_register();
  if (rc != 0) {
    return rc;
  }
  if (broker != NULL && broker[0] != '\0') {
    char host[96];
    zplc_host_mqtt_config_t config;
    const char *colon = strrchr(broker, ':');
    const size_t host_len = colon != NULL ? (size_t)(colon - broker) : strlen(broker);

    if (host_len == 0U || host_len >= sizeof(host)) {
      return -EINVAL;
    }
    memcpy(host, broker, host_len);
    host[host_len] = '\0';
    memset(&config, 0, sizeof(config));
    config.host = host;
    if (colon != NULL) {
      const long port = strtol(colon + 1, NULL, 10);

      if (port <= 0 || port > 65535L) {
        return -EINVAL;
      }
      config.port = (uint16_t)port;
    }
    return zplc_host_mqtt_start(&config);
  }
  return 0;
}
