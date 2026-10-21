/**
 * @file zplc_wifi_link.h
 * @brief The decision that keeps the Wi-Fi link up by itself (HIL-010.32, .33; COM-012).
 *
 * SPDX-License-Identifier: MIT
 *
 * A board with a stored SSID and password (`zplc config set wifi_ssid` / `wifi_pass`) joins the network at boot and
 * again after a drop. This file holds only the decision, as a function a host or native_sim test can drive with a
 * fake network layer; the work item that calls it is in zplc_wifi_boot.inc. Nothing here blocks: one poll makes at
 * most one connection request and returns how long the caller should wait before polling again, so the work item
 * stays out of the way of the scan.
 *
 * What only a board can show is the radio: the association, the key exchange and DHCP.
 */

#ifndef ZPLC_WIFI_LINK_H
#define ZPLC_WIFI_LINK_H

#include <stdbool.h>
#include <stdint.h>

#define ZPLC_WIFI_IDLE_MS 5000U          /**< poll again when no credentials are stored */
#define ZPLC_WIFI_WATCH_MS 2000U         /**< poll again while the link is up, to notice a drop */
#define ZPLC_WIFI_CONNECT_WAIT_MS 20000U /**< how long an association may take before it counts as a failure */
#define ZPLC_WIFI_BACKOFF_BASE_MS 2000U  /**< the wait after the first failure; it doubles with each one */
#define ZPLC_WIFI_BACKOFF_MAX_MS 60000U  /**< the longest wait between two requests */

typedef enum {
  ZPLC_WIFI_UNCONFIGURED = 0, /**< no SSID is stored: nothing is requested */
  ZPLC_WIFI_CONNECTING,       /**< a request was made; the address has not come yet */
  ZPLC_WIFI_CONNECTED,        /**< the board has an address */
  ZPLC_WIFI_RETRYING          /**< the last request or association failed; the next one waits out the backoff */
} zplc_wifi_state_t;

typedef struct {
  uint8_t state;     /**< zplc_wifi_state_t */
  uint32_t failures; /**< consecutive failures; 0 after a connection */
} zplc_wifi_link_t;

/** @brief Ask the network layer to join the stored network. 0 when the request was accepted, negative otherwise. */
typedef int (*zplc_wifi_connect_fn)(void *ctx);

static inline void zplc_wifi_link_init(zplc_wifi_link_t *link) {
  link->state = (uint8_t)ZPLC_WIFI_UNCONFIGURED;
  link->failures = 0U;
}

static inline zplc_wifi_state_t zplc_wifi_link_state(const zplc_wifi_link_t *link) { return (zplc_wifi_state_t)link->state; }

/** @brief The name the status reports. */
static inline const char *zplc_wifi_state_name(zplc_wifi_state_t state) {
  switch (state) {
  case ZPLC_WIFI_CONNECTING:
    return "connecting";
  case ZPLC_WIFI_CONNECTED:
    return "connected";
  case ZPLC_WIFI_RETRYING:
    return "retrying";
  case ZPLC_WIFI_UNCONFIGURED:
  default:
    return "unconfigured";
  }
}

/** @brief The wait after the given number of consecutive failures: 2, 4, 8, 16, 32 s, then 60 s for as long as it lasts. */
static inline uint32_t zplc_wifi_backoff_ms(uint32_t failures) {
  uint32_t wait = ZPLC_WIFI_BACKOFF_BASE_MS;

  while (failures > 1U && wait < ZPLC_WIFI_BACKOFF_MAX_MS) {
    wait *= 2U;
    failures--;
  }
  return wait < ZPLC_WIFI_BACKOFF_MAX_MS ? wait : ZPLC_WIFI_BACKOFF_MAX_MS;
}

static inline uint32_t zplc_wifi_link_failed(zplc_wifi_link_t *link) {
  link->failures++;
  link->state = (uint8_t)ZPLC_WIFI_RETRYING;
  return zplc_wifi_backoff_ms(link->failures);
}

/**
 * @brief One look at the link.
 *
 * @param configured an SSID is stored
 * @param online     the board has an IPv4 address
 * @param connect    asks the network layer to join; called at most once per poll
 * @return the time in milliseconds to wait before the next poll
 */
static inline uint32_t zplc_wifi_link_poll(zplc_wifi_link_t *link, bool configured, bool online, zplc_wifi_connect_fn connect, void *ctx) {
  if (!configured) {
    zplc_wifi_link_init(link);
    return ZPLC_WIFI_IDLE_MS;
  }
  if (online) {
    link->state = (uint8_t)ZPLC_WIFI_CONNECTED;
    link->failures = 0U;
    return ZPLC_WIFI_WATCH_MS;
  }
  if (zplc_wifi_link_state(link) == ZPLC_WIFI_CONNECTING) {
    return zplc_wifi_link_failed(link); /* the wait for the address is over: back off, request again on the next poll */
  }
  if (zplc_wifi_link_state(link) == ZPLC_WIFI_CONNECTED) {
    link->failures = 0U; /* a drop: the first request goes out at once */
  }
  if (connect(ctx) != 0) {
    return zplc_wifi_link_failed(link);
  }
  link->state = (uint8_t)ZPLC_WIFI_CONNECTING;
  return ZPLC_WIFI_CONNECT_WAIT_MS;
}

#endif /* ZPLC_WIFI_LINK_H */
