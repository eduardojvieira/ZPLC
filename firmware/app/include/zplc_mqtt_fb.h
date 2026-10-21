/**
 * @file zplc_mqtt_fb.h
 * @brief What the communication blocks ask of the MQTT client (COM-003, COM-004, COM-018).
 *
 * The blocks run in the scan and the MQTT client runs in its own thread, so
 * every call here is the scan's side of a hand-over: it takes a lock held for
 * a few instructions and never waits for the broker, the network or the
 * client thread. A request is identified by the block that made it (the
 * address of its instance, `owner`); the answer of a request is a handler
 * result of zplc_comm_dispatch.h.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef ZPLC_MQTT_FB_H
#define ZPLC_MQTT_FB_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Where the session with the broker stands. */
typedef enum {
  /** Down, and the client is waiting to retry (or MQTT is off): the blocks report ERROR. */
  ZPLC_MQTT_FB_DOWN = 0,
  /** The client is connecting for the first time or is in the middle of an attempt: the blocks are BUSY. */
  ZPLC_MQTT_FB_CONNECTING = 1,
  /** CONNACK received and the session is up. */
  ZPLC_MQTT_FB_UP = 2
} zplc_mqtt_fb_session_t;

/** The state of the session, and the status code of the failure that put it down (0 when none is known). */
zplc_mqtt_fb_session_t zplc_mqtt_fb_session(int *last_error);

/**
 * @brief Queue one message for the client thread to publish.
 *
 * Returns ZPLC_COMM_HANDLER_PENDING when the message is queued, or a
 * failure: NOT_CONNECTED (the session is down: nothing is queued to be sent
 * later), QUEUE_FULL, STRING_OVERFLOW. A request that the client thread has not
 * sent before the session goes down is failed, not kept for the next one.
 */
int zplc_mqtt_fb_publish(const void *owner, const char *topic, const uint8_t *payload, size_t length, uint8_t qos, bool retain);

/** The same for an Azure Event Grid event (the client builds the CloudEvent). */
int zplc_mqtt_fb_event_grid(const void *owner, const char *event_type, const char *topic, const char *data);

/** Ask the client to publish its Sparkplug B birth certificate again (UNAVAILABLE when the profile is another). */
int zplc_mqtt_fb_rebirth(const void *owner);

/** Where the request of a block stands: PENDING, DONE or a failure. The slot is free after DONE or a failure. */
int zplc_mqtt_fb_poll(const void *owner);

/** The block is reset: its request, if any, is let go of (the client thread frees it when it is through). */
void zplc_mqtt_fb_abort(const void *owner);

/**
 * @brief Keep a subscription to `topic` for the block `owner`.
 *
 * Called on every scan while the block is enabled. Returns PENDING until the
 * broker has acknowledged the subscription, DONE while it holds, and a
 * failure while the session is down (the subscription is made again on the
 * next session). A different topic replaces the earlier one. A NULL topic
 * is the cloud-to-device messages of Azure IoT Hub: the client already
 * holds that subscription of its profile, so it is DONE while the session is up.
 */
int zplc_mqtt_fb_subscribe(const void *owner, const char *topic, uint8_t qos);

/**
 * @brief The newest message that arrived on the subscription of the block.
 *
 * Returns the length of the message copied into `payload` (at most `capacity`
 * bytes) and removes it, or -1 when no message arrived since the last call.
 * One message is held for each block: a newer one replaces an older one that
 * the scan has not taken.
 */
int zplc_mqtt_fb_take_message(const void *owner, uint8_t *payload, size_t capacity);

/** The block is disabled: its subscription is dropped. */
void zplc_mqtt_fb_unsubscribe(const void *owner);

/** True when the configured MQTT profile is Azure IoT Hub with cloud-to-device messages on. */
bool zplc_mqtt_fb_c2d_available(void);

/** True when the configured MQTT profile is Sparkplug B. */
bool zplc_mqtt_fb_sparkplug(void);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_MQTT_FB_H */
