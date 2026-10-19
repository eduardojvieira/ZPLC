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

#include "loopback_endpoints.h"

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

/** Whether the loopback endpoints of this process were asked for, and whether they run (COM-009). */
typedef enum {
  ZPLC_HOST_ENDPOINTS_OFF = 0, /**< not asked for: a broker named by the environment, or none */
  ZPLC_HOST_ENDPOINTS_RUNNING, /**< a Modbus TCP server and an MQTT broker listen on 127.0.0.1 */
  ZPLC_HOST_ENDPOINTS_FAILED   /**< asked for and could not start: every block answers "unavailable" */
} zplc_host_endpoints_state_t;

typedef struct {
  zplc_host_endpoints_state_t state;
  uint16_t modbus_port;
  uint16_t mqtt_port;
} zplc_host_endpoints_t;

/**
 * Start the Modbus TCP server and the MQTT broker of the simulation inside this process (0: any free port), point
 * the MQTT client at the broker and make every Modbus TCP request, whatever address the program names, reach the
 * server: a simulation has no plant to reach. They end with the process, so with the session. When one cannot start
 * the other is stopped too and all twelve blocks answer "unavailable in simulation"; nothing reports success without
 * acting. Returns 0 or a negative errno.
 */
int zplc_host_comm_start_loopback(uint16_t modbus_port, uint16_t mqtt_port);

/** What the endpoints are now, for the hello of the session. */
void zplc_host_comm_endpoints(zplc_host_endpoints_t *out);

/** The doubles behind the endpoints, for a test that looks at what they were given; NULL unless running. */
zplc_loopback_modbus_t *zplc_host_comm_loopback_modbus(void);
zplc_loopback_mqtt_t *zplc_host_comm_loopback_mqtt(void);

/** Every Modbus TCP request goes to 127.0.0.1:`port` while `port` is not 0 (the MQTT client is not affected). */
void zplc_host_modbus_redirect(uint16_t port);

/**
 * Register what the environment of the session asks for: ZPLC_NATIVE_COMM=1 turns the blocks on,
 * ZPLC_NATIVE_MODBUS_TIMEOUT_MS sets the Modbus timeout and ZPLC_NATIVE_MQTT_BROKER=host:port names the broker.
 * ZPLC_NATIVE_LOOPBACK=1 (what Studio sets) starts the loopback endpoints instead, unless a broker is named.
 * Returns 0, also when nothing was asked for.
 */
int zplc_host_comm_init_from_environment(void);

#ifdef __cplusplus
}
#endif

#endif
