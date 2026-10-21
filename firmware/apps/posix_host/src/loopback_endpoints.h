/*
 * The loopback endpoints of a simulation: a Modbus TCP server and an MQTT broker that live on 127.0.0.1 for the
 * length of a session, so the communication blocks of a program have a peer to talk to without a controller, a
 * broker on the network or a cloud account (COM-009).
 *
 * They speak the protocol on a real socket and keep what a test or a user needs to look at: the registers and
 * coils of the server, the messages the broker was given. They are doubles, not products: a register bank of 1024
 * holding registers and 1024 coils, one retained message for each of 16 topics, publishes delivered at QoS 0.
 * They can be made to misbehave (stay silent, answer late, close the connection, refuse), which is how the
 * timeout, error and loss paths of a block are executed.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef ZPLC_LOOPBACK_ENDPOINTS_H
#define ZPLC_LOOPBACK_ENDPOINTS_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define ZPLC_LOOPBACK_BANK 1024U

typedef enum {
  ZPLC_LOOPBACK_MODBUS_GOOD = 0,
  ZPLC_LOOPBACK_MODBUS_SILENT,    /**< reads the request and never answers; keeps the connection */
  ZPLC_LOOPBACK_MODBUS_EXCEPTION, /**< answers every request with exception 6 (server busy) */
  ZPLC_LOOPBACK_MODBUS_CLOSE,     /**< closes the connection on a request, unanswered */
  ZPLC_LOOPBACK_MODBUS_SLOW       /**< answers after the delay set with _set_delay_ms */
} zplc_loopback_modbus_mode_t;

typedef struct zplc_loopback_modbus zplc_loopback_modbus_t;
typedef struct zplc_loopback_mqtt zplc_loopback_mqtt_t;

/** Start a server on 127.0.0.1:`port` (0: any free port; the one chosen is in `*bound`). NULL on failure. */
zplc_loopback_modbus_t *zplc_loopback_modbus_start(uint16_t port, uint16_t *bound);
void zplc_loopback_modbus_stop(zplc_loopback_modbus_t *server);
void zplc_loopback_modbus_set_mode(zplc_loopback_modbus_t *server, zplc_loopback_modbus_mode_t mode);
void zplc_loopback_modbus_set_delay_ms(zplc_loopback_modbus_t *server, uint32_t delay_ms);
uint16_t zplc_loopback_modbus_register(zplc_loopback_modbus_t *server, uint16_t address);
void zplc_loopback_modbus_set_register(zplc_loopback_modbus_t *server, uint16_t address, uint16_t value);
bool zplc_loopback_modbus_coil(zplc_loopback_modbus_t *server, uint16_t address);
void zplc_loopback_modbus_set_coil(zplc_loopback_modbus_t *server, uint16_t address, bool value);
/** Requests received (complete frames), whatever the answer. */
uint32_t zplc_loopback_modbus_requests(zplc_loopback_modbus_t *server);

/** Start a broker on 127.0.0.1:`port` (0: any free port). NULL on failure. */
zplc_loopback_mqtt_t *zplc_loopback_mqtt_start(uint16_t port, uint16_t *bound);
void zplc_loopback_mqtt_stop(zplc_loopback_mqtt_t *broker);
/** Close every client connection and keep listening: the clients lose their session and reconnect. */
void zplc_loopback_mqtt_drop_clients(zplc_loopback_mqtt_t *broker);
/** While silent the broker reads and answers nothing, and the connection stays open (a silent loss). */
void zplc_loopback_mqtt_set_silent(zplc_loopback_mqtt_t *broker, bool silent);
/** Clients with a session, and subscriptions held, now. */
uint32_t zplc_loopback_mqtt_clients(zplc_loopback_mqtt_t *broker);
uint32_t zplc_loopback_mqtt_subscriptions(zplc_loopback_mqtt_t *broker);
/** PUBLISH packets received from clients since the start. */
uint32_t zplc_loopback_mqtt_publishes(zplc_loopback_mqtt_t *broker);
/** The last PUBLISH from a client: copies topic and payload (NUL-terminated), true when there was one. */
bool zplc_loopback_mqtt_last_publish(zplc_loopback_mqtt_t *broker, char *topic, size_t topic_capacity, uint8_t *payload,
                                     size_t payload_capacity, size_t *payload_length, uint8_t *qos, bool *retain);
/** Publish a message from the broker itself to every client subscribed to `topic`. */
void zplc_loopback_mqtt_inject(zplc_loopback_mqtt_t *broker, const char *topic, const uint8_t *payload, size_t length);

#ifdef __cplusplus
}
#endif

#endif
