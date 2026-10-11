/*
 * The communication blocks in the simulation runtime (COM-009).
 *
 * The native POSIX runtime runs the same communication handlers as the controller (the sources of firmware/app,
 * compiled against shim/zephyr), on an MQTT client and a Modbus TCP client of its own that talk to endpoints on
 * the host. Nothing is registered unless the session asks for it (ZPLC_NATIVE_COMM=1), so a runtime that is
 * started the old way answers every block "no handler" as it always did.
 *
 * What the host answers, and what it cannot: Modbus TCP and MQTT (plain TCP) are served. Modbus RTU needs a
 * serial device and the cloud blocks need a service (an Azure or AWS account): both answer STATUS 10, "not
 * available in this runtime".
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef ZPLC_HOST_COMM_H
#define ZPLC_HOST_COMM_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ZPLC_HOST_MODBUS_TIMEOUT_MS_DEFAULT 500U
#define ZPLC_HOST_MQTT_KEEPALIVE_S_DEFAULT 30U
#define ZPLC_HOST_MQTT_CONNECT_TIMEOUT_MS_DEFAULT 5000U
#define ZPLC_HOST_MQTT_RECONNECT_INITIAL_MS_DEFAULT 2000U
#define ZPLC_HOST_MQTT_RECONNECT_MAX_MS_DEFAULT 60000U

typedef struct {
  const char *host;     /**< broker address; NULL leaves MQTT off */
  uint16_t port;        /**< 0 is 1883 */
  const char *client_id; /**< NULL is "zplc-sim-<pid>" */
  uint16_t keepalive_s; /**< 0 is the default */
  uint32_t connect_timeout_ms;    /**< 0 is the default */
  uint32_t reconnect_initial_ms;  /**< 0 is the default */
  uint32_t reconnect_max_ms;      /**< 0 is the default */
} zplc_host_mqtt_config_t;

/** The time a Modbus TCP request waits to connect and again for the answer. */
void zplc_host_modbus_set_timeout_ms(uint32_t timeout_ms);

/** Connect a TCP socket within `timeout_ms`: the descriptor, or a negative errno. */
int zplc_host_tcp_connect(const char *host, uint16_t port, uint32_t timeout_ms);

/** Start the MQTT client thread against the broker of `config`. Returns 0 or a negative errno. Once only. */
int zplc_host_mqtt_start(const zplc_host_mqtt_config_t *config);

/**
 * Register the handlers of the communication blocks: the two Modbus and MQTT handlers of the application on the
 * clients above, and an "unavailable" answer for the blocks of the cloud services and for RTU.
 * Returns 0 or a negative errno.
 */
int zplc_host_comm_register(void);

/**
 * Register what the environment of the session asks for: ZPLC_NATIVE_COMM=1 turns the blocks on,
 * ZPLC_NATIVE_MODBUS_TIMEOUT_MS sets the Modbus timeout and ZPLC_NATIVE_MQTT_BROKER=host:port names the broker.
 * Returns 0, also when nothing was asked for.
 */
int zplc_host_comm_init_from_environment(void);

#ifdef __cplusplus
}
#endif

#endif
