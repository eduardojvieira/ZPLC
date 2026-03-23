/**
 * ZPLC MQTT v5 Client — Sparkplug B (Phase 1.5)
 *
 * Implements:
 *  - MQTT v5 connection with exponential backoff reconnect
 *  - Sparkplug B NBIRTH on CONNACK (required by spec)
 *  - DDATA publish every 2s for tagged variables
 *  - Hardened encode_sparkplug_payload() with bounds checks
 *  - Broker DNS resolution with configurable fallback IP
 *  - Centralized topic builder
 *
 * Golden Rules (ZPLC Phase 1.5):
 *  - No malloc: all buffers are static
 *  - Warning Zero: compiles cleanly with -Werror
 *  - Native Zephyr APIs only (zsock, mqtt)
 *
 * SPDX-License-Identifier: MIT
 */

#include "zplc_azure_sas.h"
#include "zplc_config.h"
#include "zplc_platform_attrs.h"
#include "zplc_time.h"
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <zephyr/fs/fs.h>
#include <zephyr/kernel.h>
#include <zephyr/net/mqtt.h>
#include <zephyr/net/socket.h>
#include <zephyr/net/tls_credentials.h>
#include <zephyr/net/websocket.h>
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>

#include "proto/sparkplug_b.pb.h"
#include <pb_decode.h>
#include <pb_encode.h>

#include <zephyr/logging/log.h>
#include <zephyr/sys/atomic.h>
LOG_MODULE_REGISTER(zplc_mqtt, LOG_LEVEL_INF);

/* ============================================================================
 * Constants
 * ============================================================================
 */

#define MQTT_BUFFER_SIZE 2048U
#define PAYLOAD_BUFFER_SIZE 2048U
#define TOPIC_BUFFER_SIZE 192U
#define TOPIC_WILDCARD_BUFFER_SIZE 224U

#define MQTT_SUB_MAX_TOPICS 32U

#define MQTT_TLS_CA_TAG 130U
#define MQTT_TLS_CLIENT_CERT_TAG 131U
#define MQTT_TLS_CLIENT_KEY_TAG 132U

#define MQTT_CRED_BUF_SIZE 2048U

/** Sparkplug B sequence number wraps at 255 (uint8 domain) */
#define SPB_SEQ_MAX 256U

/** Sparkplug B spec §6.3: the primary namespace is the literal string "spBv1.0"
 */
#define SPB_NAMESPACE "spBv1.0"

/** Reconnect backoff: starts at 2s, doubles each retry, caps at 60s */
#define BACKOFF_INITIAL_S 2U
#define BACKOFF_MAX_S 60U

/**
 * @brief Get best-available timestamp in milliseconds.
 *
 * Returns UTC Unix milliseconds when SNTP is synced (required for Sparkplug B
 * spec compliance — §6.4.4 states timestamps MUST be in UTC Unix ms).
 * Falls back to k_uptime_get() with a LOG_WRN if not yet synced.
 */
static inline uint64_t get_timestamp_ms(void) {
  int64_t t = zplc_time_get_unix_ms();

  if (t < 0) {
    LOG_WRN("SNTP not synced — using relative uptime for timestamp");
    return (uint64_t)k_uptime_get();
  }
  return (uint64_t)t;
}

/* ============================================================================
 * Static State
 * ============================================================================
 */

static uint8_t s_rx_buf[MQTT_BUFFER_SIZE];
static uint8_t s_tx_buf[MQTT_BUFFER_SIZE];
static uint8_t s_payload_buf[PAYLOAD_BUFFER_SIZE];
static uint8_t s_metric_buf[PAYLOAD_BUFFER_SIZE];
static uint8_t s_ws_tmp_buf[512];

static struct mqtt_client s_client;
static struct sockaddr_storage s_broker_addr;
static struct zsock_pollfd s_fds[1];
static int s_nfds;
static bool s_connected;
static bool s_subscribed;

static uint8_t s_publish_buf[512];

static EXT_RAM_BSS_ATTR uint8_t s_tls_ca_buf[MQTT_CRED_BUF_SIZE];
static EXT_RAM_BSS_ATTR uint8_t s_tls_cert_buf[MQTT_CRED_BUF_SIZE];
static EXT_RAM_BSS_ATTR uint8_t s_tls_key_buf[MQTT_CRED_BUF_SIZE];

static sec_tag_t s_mqtt_sec_tags[3];
static uint8_t s_mqtt_sec_tag_count;

/* s_mqtt_username must hold the Azure IoT Hub MQTT username:
 *   "{hostname}/{device_id}/?api-version=2021-04-12"
 * Max: 192 (hostname) + 1 + 128 (device_id) + 24 (suffix) + 1 (NUL) = 346.
 * 384 bytes gives comfortable headroom and eliminates -Wformat-truncation. */
static char s_mqtt_username[384];
static char s_mqtt_password[512];
/* Azure IoT Hub FQDNs can reach ~63 chars per label; sovereign cloud endpoints
 * may be longer. 192 bytes is safe across all known Azure regions. */
static char s_mqtt_hostname[192];
static char s_mqtt_client_id[128];
static char s_mqtt_topic_namespace[128];
static char s_mqtt_group_id[64];
static char s_c2d_topic[128];
static char s_mqtt_websocket_path[128];
static char s_mqtt_alpn[128];
static char s_mqtt_ca_cert_path[96];
static char s_mqtt_client_cert_path[96];
static char s_mqtt_client_key_path[96];
static char s_lwt_topic[160];
static char s_lwt_payload[256];
static uint8_t s_ndeath_payload[64];
static size_t s_ndeath_payload_len;
static struct mqtt_utf8 s_lwt_topic_utf8;
static struct mqtt_utf8 s_lwt_payload_utf8;
static struct mqtt_topic s_will_topic;
static struct mqtt_utf8 s_mqtt_username_utf8;
static struct mqtt_utf8 s_mqtt_password_utf8;
static const char *s_alpn_list[4];
static uint32_t s_alpn_count;

#define ZPLC_MQTT_REQ_MAX_TOPIC 128
#define ZPLC_MQTT_REQ_MAX_PAYLOAD 128

typedef struct {
  char topic[ZPLC_MQTT_REQ_MAX_TOPIC];
  uint8_t payload[ZPLC_MQTT_REQ_MAX_PAYLOAD];
  size_t payload_len;
  uint8_t qos;
  bool retain;
} zplc_mqtt_pub_req_t;

#define MQTT_PUB_QUEUE_SIZE 8
static struct k_msgq s_mqtt_pub_q;
static zplc_mqtt_pub_req_t s_mqtt_pub_q_buf[MQTT_PUB_QUEUE_SIZE];

static struct mqtt_topic s_sub_topics[MQTT_SUB_MAX_TOPICS];
static zplc_azure_c2d_cb_t s_c2d_callback;

bool zplc_mqtt_is_connected(void) { return s_connected; }
bool zplc_mqtt_is_subscribed(void) { return s_subscribed; }

/**
 * Shared Sparkplug B payload workspace.
 * All SPB encode functions run on the same mqtt_client thread (no re-entrancy),
 * so one static copy is sufficient and avoids duplicating ~16 KB in BSS three
 * times.
 */
static EXT_RAM_BSS_ATTR org_eclipse_tahu_protobuf_Payload s_spb_payload;

/**
 * Intermediate decode workspace for publish_ddata().
 * Holds one tag's encoded-then-decoded payload before its metric is
 * merged into s_spb_payload.  Same thread-safety guarantee as s_spb_payload.
 */
static EXT_RAM_BSS_ATTR org_eclipse_tahu_protobuf_Payload s_spb_single;

/** Monotonically increasing Sparkplug B sequence number (wraps 0-255) */
static uint32_t s_spb_seq;

/**
 * Sparkplug B Birth/Death sequence number (bdSeq).
 *
 * Spec §6.4.6: bdSeq MUST be included as a UInt64 metric in every NBIRTH.
 * The same value MUST be pre-set in the LWT (NDEATH) before connecting, so
 * the broker can match them. Increments on every (re-)connection attempt;
 * wraps at 256 to stay within UInt8 range (common broker expectation).
 */
static uint32_t s_bd_seq;
static int32_t s_last_error;
static bool s_session_present;
static uint32_t s_last_publish_ms;
static uint32_t s_current_backoff_s;

/** Set by zplc_mqtt_request_backoff_reset() to force backoff_s =
 * BACKOFF_INITIAL_S */
static atomic_t s_backoff_reset_req;

/**
 * Semaphore used to wake the MQTT thread immediately from any k_sem_take()
 * backoff sleep. Given by zplc_mqtt_request_backoff_reset() so the HIL or
 * operator can force a retry without waiting up to BACKOFF_MAX_S seconds.
 *
 * Initial count: 0 (thread blocks until signalled).
 * Limit: 1 (coalesces multiple rapid signals into a single wakeup).
 */
static K_SEM_DEFINE(s_wakeup_sem, 0, 1);

static struct k_thread s_mqtt_thread;
static K_THREAD_STACK_DEFINE(s_mqtt_stack, 8192);

static int publish_ddata(struct mqtt_client *client);

/* ============================================================================
 * Helpers
 * ============================================================================
 */

/**
 * @brief Build a Sparkplug B topic string.
 *
 * @param[out] buf      Destination buffer.
 * @param[in]  buf_len  Size of destination buffer.
 * @param[in]  msg_type Sparkplug message type string (e.g. "NBIRTH", "DDATA").
 *
 * @return Number of characters written (excluding NUL), or negative on error.
 */
static bool mqtt_profile_is_sparkplug(void) {
  return zplc_config_get_mqtt_profile() == ZPLC_MQTT_PROFILE_SPARKPLUG_B;
}

static bool mqtt_profile_is_azure_iot_hub(void) {
  return zplc_config_get_mqtt_profile() == ZPLC_MQTT_PROFILE_AZURE_IOT_HUB;
}

static bool mqtt_profile_is_aws_iot_core(void) {
  return zplc_config_get_mqtt_profile() == ZPLC_MQTT_PROFILE_AWS_IOT_CORE;
}

static bool mqtt_profile_is_azure_event_grid(void) {
  return zplc_config_get_mqtt_profile() == ZPLC_MQTT_PROFILE_AZURE_EVENT_GRID;
}

static const char *mqtt_profile_status_label(void) {
  switch (zplc_config_get_mqtt_profile()) {
  case ZPLC_MQTT_PROFILE_AWS_IOT_CORE:
    return "aws";
  case ZPLC_MQTT_PROFILE_AZURE_EVENT_GRID:
    return "event-grid";
  case ZPLC_MQTT_PROFILE_AZURE_IOT_HUB:
    return "azure-iot-hub";
  case ZPLC_MQTT_PROFILE_GENERIC_BROKER:
    return "generic";
  case ZPLC_MQTT_PROFILE_SPARKPLUG_B:
  default:
    return "sparkplug";
  }
}

static enum mqtt_qos mqtt_qos_from_config(zplc_mqtt_qos_t qos) {
  switch (qos) {
  case ZPLC_MQTT_QOS1:
    return MQTT_QOS_1_AT_LEAST_ONCE;
  case ZPLC_MQTT_QOS2:
    return MQTT_QOS_2_EXACTLY_ONCE;
  case ZPLC_MQTT_QOS0:
  default:
    return MQTT_QOS_0_AT_MOST_ONCE;
  }
}

static void get_device_identity(char *buf, size_t buf_len) {
  zplc_config_get_mqtt_client_id(s_mqtt_client_id, sizeof(s_mqtt_client_id));
  if (s_mqtt_client_id[0] != '\0') {
    strncpy(buf, s_mqtt_client_id, buf_len - 1U);
    buf[buf_len - 1U] = '\0';
    return;
  }

  zplc_config_get_hostname(buf, buf_len);
  buf[buf_len - 1U] = '\0';
}

static int build_topic(char *buf, size_t buf_len, const char *msg_type) {
  char hostname[128];
  get_device_identity(hostname, sizeof(hostname));
  zplc_config_get_mqtt_topic_namespace(s_mqtt_topic_namespace,
                                       sizeof(s_mqtt_topic_namespace));

  if (mqtt_profile_is_azure_iot_hub()) {
    if (strcmp(msg_type, "DDATA") == 0 || strcmp(msg_type, "NBIRTH") == 0) {
      return snprintf(buf, buf_len, "devices/%s/messages/events/", hostname);
    }

    if (strcmp(msg_type, "DCMD") == 0) {
      return snprintf(buf, buf_len, "devices/%s/messages/devicebound/#",
                      hostname);
    }

    return snprintf(buf, buf_len, "devices/%s/messages/events/", hostname);
  }

  if (mqtt_profile_is_azure_event_grid()) {
    char topic[192];
    zplc_config_get_azure_event_grid_topic(topic, sizeof(topic));
    if (topic[0] != '\0') {
      return snprintf(buf, buf_len, "%s", topic);
    }

    return snprintf(buf, buf_len, "%s/telemetry/%s", s_mqtt_topic_namespace,
                    hostname);
  }

  if (!mqtt_profile_is_sparkplug()) {
    if (strcmp(msg_type, "DDATA") == 0 || strcmp(msg_type, "NBIRTH") == 0) {
      return snprintf(buf, buf_len, "%s/telemetry/%s", s_mqtt_topic_namespace,
                      hostname);
    }

    if (strcmp(msg_type, "NDEATH") == 0) {
      return snprintf(buf, buf_len, "%s/status/%s", s_mqtt_topic_namespace,
                      hostname);
    }

    return snprintf(buf, buf_len, "%s/%s/%s", s_mqtt_topic_namespace, msg_type,
                    hostname);
  }

  /*
   * Sparkplug B §6.3 canonical topic format:
   *   spBv1.0/{groupId}/{messageType}/{edgeNodeId}
   *
   * The "namespace" field in the IDE maps to group_id in Sparkplug B context.
   * We use the dedicated group_id config if set, otherwise fall back to the
   * generic topic_namespace so existing deployments are not broken.
   */
  zplc_config_get_mqtt_group_id(s_mqtt_group_id, sizeof(s_mqtt_group_id));
  if (s_mqtt_group_id[0] == '\0') {
    /* fallback: use topic_namespace as group_id */
    return snprintf(buf, buf_len, SPB_NAMESPACE "/%s/%s/%s",
                    s_mqtt_topic_namespace, msg_type, hostname);
  }

  return snprintf(buf, buf_len, SPB_NAMESPACE "/%s/%s/%s", s_mqtt_group_id,
                  msg_type, hostname);
}

static int build_tag_topic(char *buf, size_t buf_len, const char *msg_type,
                           uint16_t var_addr) {
  char hostname[128];
  get_device_identity(hostname, sizeof(hostname));
  zplc_config_get_mqtt_topic_namespace(s_mqtt_topic_namespace,
                                       sizeof(s_mqtt_topic_namespace));

  if (mqtt_profile_is_azure_iot_hub()) {
    return snprintf(buf, buf_len, "devices/%s/messages/devicebound/#",
                    hostname);
  }

  if (!mqtt_profile_is_sparkplug()) {
    return snprintf(buf, buf_len, "%s/cmd/%s/tag_%04x", s_mqtt_topic_namespace,
                    hostname, var_addr);
  }

  /* Sparkplug B: spBv1.0/{groupId}/DCMD/{edgeNodeId}/tag_{addr} */
  zplc_config_get_mqtt_group_id(s_mqtt_group_id, sizeof(s_mqtt_group_id));
  if (s_mqtt_group_id[0] == '\0') {
    return snprintf(buf, buf_len, SPB_NAMESPACE "/%s/%s/%s/tag_%04x",
                    s_mqtt_topic_namespace, msg_type, hostname, var_addr);
  }

  return snprintf(buf, buf_len, SPB_NAMESPACE "/%s/%s/%s/tag_%04x",
                  s_mqtt_group_id, msg_type, hostname, var_addr);
}

static int build_default_lwt_topic(char *buf, size_t buf_len) {
  return build_topic(buf, buf_len,
                     mqtt_profile_is_sparkplug() ? "NDEATH" : "STATUS");
}

static int configure_lwt(struct mqtt_client *client) {
  client->will_topic = NULL;
  client->will_message = NULL;
  client->will_retain = 0U;

  if (!zplc_config_get_mqtt_lwt_enabled()) {
    return 0;
  }

  zplc_config_get_mqtt_lwt_topic(s_lwt_topic, sizeof(s_lwt_topic));
  if (s_lwt_topic[0] == '\0' &&
      build_default_lwt_topic(s_lwt_topic, sizeof(s_lwt_topic)) < 0) {
    return -EINVAL;
  }

  if (mqtt_profile_is_sparkplug()) {
    /*
     * Sparkplug B §6.4.6: The LWT payload MUST be a protobuf-encoded
     * Payload containing a single `bdSeq` metric (UInt64, datatype=8).
     * bdSeq increments on every (re-)connection attempt (wraps at 256).
     */
    s_bd_seq = (s_bd_seq + 1U) % SPB_SEQ_MAX;

    org_eclipse_tahu_protobuf_Payload *ndeath = &s_spb_payload;
    *ndeath = (org_eclipse_tahu_protobuf_Payload)
        org_eclipse_tahu_protobuf_Payload_init_zero;
    ndeath->timestamp = get_timestamp_ms();
    ndeath->metrics_count = 1U;
    ndeath->seq = 0U; /* NDEATH seq is always 0 per spec */

    org_eclipse_tahu_protobuf_Metric *bd = &ndeath->metrics[0];
    strncpy(bd->name, "bdSeq", sizeof(bd->name) - 1U);
    bd->name[sizeof(bd->name) - 1U] = '\0';
    bd->timestamp = ndeath->timestamp;
    bd->datatype = 8U; /* UInt64 */
    bd->which_value = org_eclipse_tahu_protobuf_Metric_long_value_tag;
    bd->value.long_value = (uint64_t)s_bd_seq;

    pb_ostream_t stream =
        pb_ostream_from_buffer(s_ndeath_payload, sizeof(s_ndeath_payload));
    if (!pb_encode(&stream, org_eclipse_tahu_protobuf_Payload_fields, ndeath)) {
      LOG_ERR("NDEATH LWT pb_encode failed: %s", PB_GET_ERROR(&stream));
      return -EIO;
    }
    s_ndeath_payload_len = stream.bytes_written;

    s_lwt_topic_utf8.utf8 = (const uint8_t *)s_lwt_topic;
    s_lwt_topic_utf8.size = strlen(s_lwt_topic);
    s_lwt_payload_utf8.utf8 = s_ndeath_payload;
    s_lwt_payload_utf8.size = s_ndeath_payload_len;
  } else {
    zplc_config_get_mqtt_lwt_payload(s_lwt_payload, sizeof(s_lwt_payload));
    if (s_lwt_payload[0] == '\0') {
      strncpy(s_lwt_payload, "offline", sizeof(s_lwt_payload) - 1U);
      s_lwt_payload[sizeof(s_lwt_payload) - 1U] = '\0';
    }

    s_lwt_topic_utf8.utf8 = (const uint8_t *)s_lwt_topic;
    s_lwt_topic_utf8.size = strlen(s_lwt_topic);
    s_lwt_payload_utf8.utf8 = (const uint8_t *)s_lwt_payload;
    s_lwt_payload_utf8.size = strlen(s_lwt_payload);
  }

  s_will_topic.topic = s_lwt_topic_utf8;
  s_will_topic.qos = mqtt_qos_from_config(zplc_config_get_mqtt_lwt_qos());
  client->will_topic = &s_will_topic;
  client->will_message = &s_lwt_payload_utf8;
  client->will_retain = zplc_config_get_mqtt_lwt_retain() ? 1U : 0U;
  return 0;
}

static int read_file_to_buf(const char *path, uint8_t *buf, size_t buf_len) {
  static const char persist_prefix[] = "persist://";
  if (path == NULL || buf == NULL || buf_len == 0U) {
    return -EINVAL;
  }

  if (strncmp(path, persist_prefix, sizeof(persist_prefix) - 1U) == 0) {
    const char *key = path + (sizeof(persist_prefix) - 1U);
    if (key[0] == '\0') {
      return -EINVAL;
    }

    if (zplc_hal_persist_load(key, buf, buf_len) != ZPLC_HAL_OK) {
      return -ENOENT;
    }

    buf[buf_len - 1U] = '\0';
    return (int)strlen((const char *)buf);
  }

  struct fs_file_t file;
  fs_file_t_init(&file);

  int rc = fs_open(&file, path, FS_O_READ);
  if (rc < 0) {
    return rc;
  }

  ssize_t rd = fs_read(&file, buf, buf_len - 1U);
  (void)fs_close(&file);

  if (rd < 0) {
    return (int)rd;
  }

  buf[rd] = '\0';
  return (int)rd;
}

static void setup_auth(struct mqtt_client *client) {
  zplc_config_get_mqtt_broker(s_mqtt_hostname, sizeof(s_mqtt_hostname));
  zplc_config_get_mqtt_client_id(s_mqtt_client_id, sizeof(s_mqtt_client_id));
  zplc_config_get_mqtt_username(s_mqtt_username, sizeof(s_mqtt_username));
  zplc_config_get_mqtt_password(s_mqtt_password, sizeof(s_mqtt_password));

  if (mqtt_profile_is_azure_iot_hub()) {
    if (s_mqtt_client_id[0] == '\0') {
      get_device_identity(s_mqtt_client_id, sizeof(s_mqtt_client_id));
    }
    if (s_mqtt_username[0] == '\0') {
      snprintf(s_mqtt_username, sizeof(s_mqtt_username),
               "%s/%s/?api-version=2021-04-12", s_mqtt_hostname,
               s_mqtt_client_id);
    }
    /* On-device SAS token generation — only when a key is stored in config.
     * If the user pre-filled the password field manually, leave it untouched.
     */
    if (s_mqtt_password[0] == '\0') {
      char sas_key[96];
      zplc_config_get_azure_sas_key(sas_key, sizeof(sas_key));
      if (sas_key[0] != '\0') {
        uint32_t expiry_s = zplc_config_get_azure_sas_expiry_s();
        int sas_rc = zplc_azure_sas_generate(s_mqtt_hostname, s_mqtt_client_id,
                                             sas_key, expiry_s, s_mqtt_password,
                                             sizeof(s_mqtt_password));
        if (sas_rc != 0) {
          LOG_ERR("Azure SAS token generation failed: %d", sas_rc);
          /* Clear so we don't send garbage as password */
          s_mqtt_password[0] = '\0';
        }
      }
    }
  }

  if (zplc_config_get_mqtt_profile() == ZPLC_MQTT_PROFILE_AWS_IOT_CORE &&
      zplc_config_get_mqtt_port() == 443U) {
#if defined(CONFIG_MQTT_LIB_TLS_USE_ALPN)
    zplc_config_get_mqtt_alpn(s_mqtt_alpn, sizeof(s_mqtt_alpn));
    if (s_mqtt_alpn[0] == '\0') {
      strncpy(s_mqtt_alpn, "x-amzn-mqtt-ca", sizeof(s_mqtt_alpn) - 1U);
      s_mqtt_alpn[sizeof(s_mqtt_alpn) - 1U] = '\0';
    }
#endif
  }

  if (s_mqtt_username[0] != '\0') {
    s_mqtt_username_utf8.utf8 = (const uint8_t *)s_mqtt_username;
    s_mqtt_username_utf8.size = strlen(s_mqtt_username);
    client->user_name = &s_mqtt_username_utf8;
  } else {
    client->user_name = NULL;
  }

  if (s_mqtt_password[0] != '\0') {
    s_mqtt_password_utf8.utf8 = (const uint8_t *)s_mqtt_password;
    s_mqtt_password_utf8.size = strlen(s_mqtt_password);
    client->password = &s_mqtt_password_utf8;
  } else {
    client->password = NULL;
  }
}

static void setup_websocket(struct mqtt_client *client) {
#if defined(CONFIG_MQTT_LIB_WEBSOCKET)
  zplc_config_get_mqtt_websocket_path(s_mqtt_websocket_path,
                                      sizeof(s_mqtt_websocket_path));
  if (s_mqtt_websocket_path[0] == '\0') {
    strncpy(s_mqtt_websocket_path, "/mqtt", sizeof(s_mqtt_websocket_path) - 1U);
    s_mqtt_websocket_path[sizeof(s_mqtt_websocket_path) - 1U] = '\0';
  }

  client->transport.websocket.config.host = s_mqtt_hostname;
  client->transport.websocket.config.url = s_mqtt_websocket_path;
  client->transport.websocket.config.tmp_buf = s_ws_tmp_buf;
  client->transport.websocket.config.tmp_buf_len = sizeof(s_ws_tmp_buf);
  client->transport.websocket.timeout = 5000;
#else
  ARG_UNUSED(client);
#endif
}

static int setup_tls(struct mqtt_client *client) {
  zplc_mqtt_security_t security = zplc_config_get_mqtt_security();
  zplc_mqtt_transport_t transport = zplc_config_get_mqtt_transport();

  s_mqtt_sec_tag_count = 0U;
  s_alpn_count = 0U;

  if (transport == ZPLC_MQTT_TRANSPORT_TCP ||
      transport == ZPLC_MQTT_TRANSPORT_WS) {
    client->transport.type =
#if defined(CONFIG_MQTT_LIB_WEBSOCKET)
        (transport == ZPLC_MQTT_TRANSPORT_WS)
            ? MQTT_TRANSPORT_NON_SECURE_WEBSOCKET
            : MQTT_TRANSPORT_NON_SECURE;
#else
        MQTT_TRANSPORT_NON_SECURE;
#endif
    setup_websocket(client);
    return 0;
  }

  if (security == ZPLC_MQTT_SECURITY_NONE) {
    return -EINVAL;
  }

  client->transport.type =
#if defined(CONFIG_MQTT_LIB_WEBSOCKET)
      (transport == ZPLC_MQTT_TRANSPORT_WSS) ? MQTT_TRANSPORT_SECURE_WEBSOCKET
                                             : MQTT_TRANSPORT_SECURE;
#else
      MQTT_TRANSPORT_SECURE;
#endif

  if (security == ZPLC_MQTT_SECURITY_TLS_NO_VERIFY) {
    client->transport.tls.config.peer_verify = TLS_PEER_VERIFY_NONE;
    client->transport.tls.config.sec_tag_list = NULL;
    client->transport.tls.config.sec_tag_count = 0;
    setup_websocket(client);
    return 0;
  }

  zplc_config_get_mqtt_ca_cert_path(s_mqtt_ca_cert_path,
                                    sizeof(s_mqtt_ca_cert_path));
  zplc_config_get_mqtt_client_cert_path(s_mqtt_client_cert_path,
                                        sizeof(s_mqtt_client_cert_path));
  zplc_config_get_mqtt_client_key_path(s_mqtt_client_key_path,
                                       sizeof(s_mqtt_client_key_path));

  int ca_len =
      read_file_to_buf(s_mqtt_ca_cert_path, s_tls_ca_buf, sizeof(s_tls_ca_buf));
  if (ca_len <= 0) {
    LOG_ERR("TLS CA file missing: %s (err %d)", s_mqtt_ca_cert_path, ca_len);
    return -ENOENT;
  }

  int rc = tls_credential_add(MQTT_TLS_CA_TAG, TLS_CREDENTIAL_CA_CERTIFICATE,
                              s_tls_ca_buf, (size_t)ca_len + 1U);
  if (rc < 0 && rc != -EEXIST) {
    LOG_ERR("tls_credential_add(CA) failed: %d", rc);
    return rc;
  }

  s_mqtt_sec_tags[s_mqtt_sec_tag_count++] = MQTT_TLS_CA_TAG;

  if (security == ZPLC_MQTT_SECURITY_TLS_MUTUAL) {
    int cert_len = read_file_to_buf(s_mqtt_client_cert_path, s_tls_cert_buf,
                                    sizeof(s_tls_cert_buf));
    int key_len = read_file_to_buf(s_mqtt_client_key_path, s_tls_key_buf,
                                   sizeof(s_tls_key_buf));
    if (cert_len <= 0 || key_len <= 0) {
      LOG_ERR("Mutual TLS requires cert+key in %s and %s",
              s_mqtt_client_cert_path, s_mqtt_client_key_path);
      return -ENOENT;
    }

    rc = tls_credential_add(MQTT_TLS_CLIENT_CERT_TAG,
                            TLS_CREDENTIAL_SERVER_CERTIFICATE, s_tls_cert_buf,
                            (size_t)cert_len + 1U);
    if (rc < 0 && rc != -EEXIST) {
      LOG_ERR("tls_credential_add(client cert) failed: %d", rc);
      return rc;
    }

    rc = tls_credential_add(MQTT_TLS_CLIENT_KEY_TAG, TLS_CREDENTIAL_PRIVATE_KEY,
                            s_tls_key_buf, (size_t)key_len + 1U);
    if (rc < 0 && rc != -EEXIST) {
      LOG_ERR("tls_credential_add(client key) failed: %d", rc);
      return rc;
    }

    s_mqtt_sec_tags[s_mqtt_sec_tag_count++] = MQTT_TLS_CLIENT_CERT_TAG;
    s_mqtt_sec_tags[s_mqtt_sec_tag_count++] = MQTT_TLS_CLIENT_KEY_TAG;
  }

  client->transport.tls.config.peer_verify = TLS_PEER_VERIFY_REQUIRED;
  client->transport.tls.config.cipher_list = NULL;
  client->transport.tls.config.sec_tag_list = s_mqtt_sec_tags;
  client->transport.tls.config.sec_tag_count = s_mqtt_sec_tag_count;
  client->transport.tls.config.hostname = s_mqtt_hostname;

#if defined(CONFIG_MQTT_LIB_TLS_USE_ALPN)
  zplc_config_get_mqtt_alpn(s_mqtt_alpn, sizeof(s_mqtt_alpn));
  if (s_mqtt_alpn[0] != '\0') {
    s_alpn_list[0] = s_mqtt_alpn;
    s_alpn_count = 1U;
    client->transport.tls.config.alpn_protocol_name_list = s_alpn_list;
    client->transport.tls.config.alpn_protocol_name_count = s_alpn_count;
  } else {
    client->transport.tls.config.alpn_protocol_name_list = NULL;
    client->transport.tls.config.alpn_protocol_name_count = 0U;
  }
#endif

  setup_websocket(client);
  return 0;
}

/**
 * @brief Encode one ZPLC tag into a Sparkplug B Payload protobuf.
 *
 * Performs strict bounds validation before reading from process image.
 * On encode failure returns -1 and logs the nanopb error.
 *
 * @param[in]  tag      Tag descriptor.
 * @param[out] out_buf  Output buffer for encoded bytes.
 * @param[in]  max_len  Capacity of @p out_buf.
 *
 * @return Number of bytes written on success, -1 on failure.
 */
static int encode_sparkplug_payload(const zplc_tag_entry_t *tag,
                                    uint8_t *out_buf, size_t max_len) {
  if (!tag || !out_buf || max_len == 0U) {
    return -1;
  }

  zplc_pi_lock();

  uint16_t base = tag->var_addr & 0xF000U;
  uint16_t offset = tag->var_addr & 0x0FFFU;

  /* Normalise %QX/%MX region aliases */
  if (base == 0x3000U) {
    base = 0x2000U;
  }

  uint8_t *region = zplc_mem_get_region(base);

  /* Determine the size of the resolved region for bounds validation */
  uint32_t region_size;
  switch (base) {
  case ZPLC_MEM_IPI_BASE:
    region_size = ZPLC_MEM_IPI_SIZE;
    break;
  case ZPLC_MEM_OPI_BASE:
    region_size = ZPLC_MEM_OPI_SIZE;
    break;
  case ZPLC_MEM_WORK_BASE:
    region_size = ZPLC_MEM_WORK_SIZE;
    break;
  case ZPLC_MEM_RETAIN_BASE:
    region_size = ZPLC_MEM_RETAIN_SIZE;
    break;
  default:
    LOG_ERR("Unknown memory region base 0x%04x", base);
    zplc_pi_unlock();
    return -1;
  }

  /* Use the shared file-scope payload workspace (single MQTT thread, no
   * re-entrancy). */
  org_eclipse_tahu_protobuf_Payload *payload = &s_spb_payload;
  *payload = (org_eclipse_tahu_protobuf_Payload)
      org_eclipse_tahu_protobuf_Payload_init_zero;
  payload->timestamp = get_timestamp_ms();
  payload->seq = (uint64_t)s_spb_seq;
  s_spb_seq = (s_spb_seq + 1U) % SPB_SEQ_MAX;

  if (region) {
    payload->metrics_count = 1U;
    org_eclipse_tahu_protobuf_Metric *m = &payload->metrics[0];

    snprintf(m->name, sizeof(m->name), "tag_%04x", tag->var_addr);
    m->timestamp = payload->timestamp;

    switch (tag->var_type) {

    case ZPLC_TYPE_BOOL:
      /* Single byte — offset must be within region */
      if ((uint32_t)offset + 1U > region_size) {
        LOG_ERR("BOOL offset %u out of bounds", offset);
        region = NULL;
        break;
      }
      m->datatype = 11U; /* Sparkplug DataType_Boolean */
      m->which_value = org_eclipse_tahu_protobuf_Metric_boolean_value_tag;
      m->value.boolean_value = (region[offset] != 0U);
      break;

    case ZPLC_TYPE_INT:
    case ZPLC_TYPE_UINT:
    case ZPLC_TYPE_WORD:
      /* Two bytes — explicit bounds before read */
      if ((uint32_t)offset + 2U > region_size) {
        LOG_ERR("INT/WORD offset %u out of bounds", offset);
        region = NULL;
        break;
      }
      {
        uint16_t raw =
            (uint16_t)region[offset] | ((uint16_t)region[offset + 1U] << 8U);
        m->datatype = 5U; /* Sparkplug DataType_Int32 */
        m->which_value = org_eclipse_tahu_protobuf_Metric_int_value_tag;
        /* Preserve sign for ZPLC_TYPE_INT */
        if (tag->var_type == ZPLC_TYPE_INT) {
          m->value.int_value = (int32_t)(int16_t)raw;
        } else {
          m->value.int_value = (int32_t)raw;
        }
      }
      break;

    case ZPLC_TYPE_REAL:
      /* Four bytes */
      if ((uint32_t)offset + 4U > region_size) {
        LOG_ERR("REAL offset %u out of bounds", offset);
        region = NULL;
        break;
      }
      {
        uint32_t raw = (uint32_t)region[offset] |
                       ((uint32_t)region[offset + 1U] << 8U) |
                       ((uint32_t)region[offset + 2U] << 16U) |
                       ((uint32_t)region[offset + 3U] << 24U);
        float fval;
        /* Type-punning via memcpy — the only safe way in C99 */
        memcpy(&fval, &raw, sizeof(float));
        m->datatype = 9U; /* Sparkplug DataType_Float */
        m->which_value = org_eclipse_tahu_protobuf_Metric_float_value_tag;
        m->value.float_value = fval;
      }
      break;

    default:
      LOG_WRN("Unsupported tag type %u — publishing as null", tag->var_type);
      m->is_null = true;
      break;
    }
  }

  zplc_pi_unlock();

  if (!region && !payload->metrics[0].is_null) {
    /* Region was invalidated by a bounds-check failure above */
    payload->metrics[0].is_null = true;
  }

  pb_ostream_t stream = pb_ostream_from_buffer(out_buf, max_len);
  if (!pb_encode(&stream, org_eclipse_tahu_protobuf_Payload_fields, payload)) {
    LOG_ERR("Sparkplug B pb_encode failed: %s", PB_GET_ERROR(&stream));
    return -1;
  }

  return (int)stream.bytes_written;
}

/* ============================================================================
 * MQTT Poll Helpers
 * ============================================================================
 */

static int mqtt_socket_fd(const struct mqtt_client *client) {
  switch (client->transport.type) {
  case MQTT_TRANSPORT_NON_SECURE:
    return client->transport.tcp.sock;
#if defined(CONFIG_MQTT_LIB_TLS)
  case MQTT_TRANSPORT_SECURE:
    return client->transport.tls.sock;
#endif
#if defined(CONFIG_MQTT_LIB_WEBSOCKET)
  case MQTT_TRANSPORT_NON_SECURE_WEBSOCKET:
  case MQTT_TRANSPORT_SECURE_WEBSOCKET:
    return client->transport.websocket.sock;
#endif
  default:
    return -1;
  }
}

static void prepare_fds(struct mqtt_client *client) {
  s_fds[0].fd = mqtt_socket_fd(client);
  s_fds[0].events = ZSOCK_POLLIN;
  s_nfds = 1;
}

static void clear_fds(void) { s_nfds = 0; }

static int poll_for_data(int timeout_ms) {
  if (s_nfds > 0) {
    return zsock_poll(s_fds, (int)s_nfds, timeout_ms);
  }
  return -EINVAL;
}

/* ============================================================================
 * Sparkplug B Publish Helpers
 * ============================================================================
 */

/**
 * @brief Publish a raw Sparkplug B payload to a topic.
 *
 * @return 0 on success, negative errno on failure.
 */
static int spb_publish(struct mqtt_client *client, const char *topic_str,
                       const uint8_t *data, size_t data_len) {
  struct mqtt_publish_param param;

  param.message.topic.qos =
      mqtt_qos_from_config(zplc_config_get_mqtt_publish_qos());
  param.message.topic.topic.utf8 = (const uint8_t *)topic_str;
  param.message.topic.topic.size = strlen(topic_str);
  param.message.payload.data =
      (uint8_t *)data; /* MQTT API takes non-const; data is read-only */
  param.message.payload.len = data_len;
  param.message_id = k_uptime_get_32();
  param.dup_flag = 0U;
  param.retain_flag = zplc_config_get_mqtt_publish_retain() ? 1U : 0U;

#if defined(CONFIG_MQTT_VERSION_5_0)
  memset(&param.prop, 0, sizeof(param.prop));
#endif

  return mqtt_publish(client, &param);
}

static int event_grid_publish(struct mqtt_client *client, const char *topic_str,
                              const char *event_type, const char *source,
                              const char *content_type, const uint8_t *data,
                              size_t data_len) {
  struct mqtt_publish_param param;
#if defined(CONFIG_MQTT_VERSION_5_0)
  char event_id[16];
  char event_time[24];
  static const char ce_specversion[] = "1.0";
  static const char content_type_default[] =
      "application/cloudevents+json; charset=utf-8";
#endif

  memset(&param, 0, sizeof(param));
  param.message.topic.qos =
      mqtt_qos_from_config(zplc_config_get_mqtt_publish_qos());
  param.message.topic.topic.utf8 = (const uint8_t *)topic_str;
  param.message.topic.topic.size = strlen(topic_str);
  param.message.payload.data = (uint8_t *)data;
  param.message.payload.len = data_len;
  param.message_id = k_uptime_get_32();
  param.dup_flag = 0U;
  param.retain_flag = zplc_config_get_mqtt_publish_retain() ? 1U : 0U;

#if defined(CONFIG_MQTT_VERSION_5_0)
  snprintf(event_id, sizeof(event_id), "%u", (unsigned)param.message_id);
  snprintf(event_time, sizeof(event_time), "%llu",
           (unsigned long long)get_timestamp_ms());
  param.prop.payload_format_indicator = 1U;
  param.prop.rx.has_payload_format_indicator = true;
  param.prop.content_type.utf8 =
      (const uint8_t *)(content_type != NULL ? content_type
                                             : content_type_default);
  param.prop.content_type.size =
      strlen((const char *)param.prop.content_type.utf8);
  param.prop.rx.has_content_type = true;

  param.prop.user_prop[0].name = MQTT_UTF8_LITERAL("ce-specversion");
  param.prop.user_prop[0].value.utf8 = (const uint8_t *)ce_specversion;
  param.prop.user_prop[0].value.size = strlen(ce_specversion);
  param.prop.user_prop[1].name = MQTT_UTF8_LITERAL("ce-type");
  param.prop.user_prop[1].value.utf8 = (const uint8_t *)event_type;
  param.prop.user_prop[1].value.size = strlen(event_type);
  param.prop.user_prop[2].name = MQTT_UTF8_LITERAL("ce-source");
  param.prop.user_prop[2].value.utf8 = (const uint8_t *)source;
  param.prop.user_prop[2].value.size = strlen(source);
  param.prop.user_prop[3].name = MQTT_UTF8_LITERAL("ce-id");
  param.prop.user_prop[3].value.utf8 = (const uint8_t *)event_id;
  param.prop.user_prop[3].value.size = strlen(event_id);
  param.prop.user_prop[4].name = MQTT_UTF8_LITERAL("ce-time");
  param.prop.user_prop[4].value.utf8 = (const uint8_t *)event_time;
  param.prop.user_prop[4].value.size = strlen(event_time);
  param.prop.user_prop[5].name = MQTT_UTF8_LITERAL("ce-datacontenttype");
  param.prop.user_prop[5].value.utf8 =
      (const uint8_t *)(content_type != NULL ? content_type
                                             : content_type_default);
  param.prop.user_prop[5].value.size =
      strlen((const char *)param.prop.user_prop[5].value.utf8);
  param.prop.rx.has_user_prop = true;
#endif

  return mqtt_publish(client, &param);
}

static int publish_json_payload(struct mqtt_client *client,
                                const char *topic_str, const char *payload) {
  if (mqtt_profile_is_azure_event_grid()) {
    char source[128];
    char event_type[96];

    zplc_config_get_azure_event_grid_source(source, sizeof(source));
    zplc_config_get_azure_event_grid_event_type(event_type, sizeof(event_type));
    if (source[0] == '\0') {
      get_device_identity(source, sizeof(source));
    }
    if (event_type[0] == '\0') {
      strncpy(event_type, "com.zplc.telemetry", sizeof(event_type) - 1U);
      event_type[sizeof(event_type) - 1U] = '\0';
    }

    return event_grid_publish(client, topic_str, event_type, source,
                              "application/cloudevents+json; charset=utf-8",
                              (const uint8_t *)payload, strlen(payload));
  }

  struct mqtt_publish_param param;

  param.message.topic.qos =
      mqtt_qos_from_config(zplc_config_get_mqtt_publish_qos());
  param.message.topic.topic.utf8 = (const uint8_t *)topic_str;
  param.message.topic.topic.size = strlen(topic_str);
  param.message.payload.data = (uint8_t *)payload;
  param.message.payload.len = strlen(payload);
  param.message_id = k_uptime_get_32();
  param.dup_flag = 0U;
  param.retain_flag = zplc_config_get_mqtt_publish_retain() ? 1U : 0U;

#if defined(CONFIG_MQTT_VERSION_5_0)
  memset(&param.prop, 0, sizeof(param.prop));
#endif

  return mqtt_publish(client, &param);
}

/**
 * @brief Build and publish an NBIRTH message.
 *
 * Sparkplug B requires an NBIRTH on every (re-)connection, immediately after
 * CONNACK, before any DDATA. The NBIRTH sequence number must be 0.
 *
 * Per spec §6.4.6 the NBIRTH MUST contain a `bdSeq` metric (UInt64, datatype=8)
 * whose value matches the one pre-encoded in the LWT (NDEATH) payload.
 *
 * @return 0 on success, negative on failure.
 */
static int publish_nbirth(struct mqtt_client *client) {
  char topic[TOPIC_BUFFER_SIZE];
  if (build_topic(topic, sizeof(topic), "NBIRTH") < 0) {
    return -EINVAL;
  }

  /* Use the shared file-scope payload workspace (single MQTT thread, no
   * re-entrancy). */
  org_eclipse_tahu_protobuf_Payload *payload = &s_spb_payload;
  *payload = (org_eclipse_tahu_protobuf_Payload)
      org_eclipse_tahu_protobuf_Payload_init_zero;
  payload->timestamp = get_timestamp_ms();

  /*
   * Sparkplug B spec §6.4.6: The NBIRTH seq field MUST be 0.
   * Reset the running counter here so the first DDATA gets seq=1.
   */
  s_spb_seq = 0U;
  payload->seq = 0U;

  /*
   * §6.4.6: NBIRTH MUST include a `bdSeq` metric (UInt64, datatype=8).
   * Slot 0 is reserved for bdSeq; user tags start at slot 1.
   */
  {
    org_eclipse_tahu_protobuf_Metric *bd = &payload->metrics[0];
    strncpy(bd->name, "bdSeq", sizeof(bd->name) - 1U);
    bd->name[sizeof(bd->name) - 1U] = '\0';
    bd->timestamp = payload->timestamp;
    bd->datatype = 8U; /* UInt64 */
    bd->which_value = org_eclipse_tahu_protobuf_Metric_long_value_tag;
    bd->value.long_value = (uint64_t)s_bd_seq;
  }

  /* Include all published tags as birth certificate entries */
  uint16_t count = zplc_core_get_tag_count();
  uint8_t n_added = 1U; /* slot 0 = bdSeq */

  for (uint16_t i = 0U; i < count && n_added < 32U; i++) {
    const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
    if (!tag || tag->tag_id != ZPLC_TAG_PUBLISH) {
      continue;
    }

    org_eclipse_tahu_protobuf_Metric *m = &payload->metrics[n_added];
    snprintf(m->name, sizeof(m->name), "tag_%04x", tag->var_addr);
    m->timestamp = payload->timestamp;
    m->is_null = true; /* Birth values carry metadata only */

    /* Map ZPLC type to Sparkplug DataType */
    switch (tag->var_type) {
    case ZPLC_TYPE_BOOL:
      m->datatype = 11U;
      break; /* Boolean */
    case ZPLC_TYPE_INT:
      m->datatype = 5U;
      break; /* Int32   */
    case ZPLC_TYPE_UINT:
    case ZPLC_TYPE_WORD:
      m->datatype = 5U;
      break; /* Int32   */
    case ZPLC_TYPE_REAL:
      m->datatype = 9U;
      break; /* Float   */
    default:
      m->datatype = 0U;
      break; /* Unknown */
    }

    n_added++;
  }

  payload->metrics_count = n_added;

  pb_ostream_t stream =
      pb_ostream_from_buffer(s_payload_buf, sizeof(s_payload_buf));
  if (!pb_encode(&stream, org_eclipse_tahu_protobuf_Payload_fields, payload)) {
    LOG_ERR("NBIRTH pb_encode failed: %s", PB_GET_ERROR(&stream));
    return -1;
  }

  LOG_INF("Publishing NBIRTH to %s (%zu bytes, %u metrics, bdSeq=%u)", topic,
          stream.bytes_written, n_added, s_bd_seq);

  return spb_publish(client, topic, s_payload_buf, stream.bytes_written);
}

/**
 * @brief Publish a DDATA frame for the first ZPLC_TAG_PUBLISH tag found.
 *
 * @return 0 on success, negative on failure, 1 if nothing to publish.
 */
static int publish_ddata(struct mqtt_client *client) {
  uint16_t count = zplc_core_get_tag_count();
  char topic[TOPIC_BUFFER_SIZE];

  if (build_topic(topic, sizeof(topic), "DDATA") < 0) {
    return -EINVAL;
  }

  /* Use the shared file-scope payload workspace (single MQTT thread, no
   * re-entrancy). */
  org_eclipse_tahu_protobuf_Payload *payload = &s_spb_payload;
  *payload = (org_eclipse_tahu_protobuf_Payload)
      org_eclipse_tahu_protobuf_Payload_init_zero;
  payload->timestamp = get_timestamp_ms();
  payload->seq = (uint64_t)s_spb_seq;
  s_spb_seq = (s_spb_seq + 1U) % SPB_SEQ_MAX;

  uint8_t metric_count = 0U;

  for (uint16_t i = 0U; i < count; i++) {
    pb_istream_t istream;
    const char *decode_err;
    int len;

    const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
    if (!tag || tag->tag_id != ZPLC_TAG_PUBLISH) {
      continue;
    }

    if (metric_count >= 32U) {
      break;
    }

    len = encode_sparkplug_payload(tag, s_metric_buf, sizeof(s_metric_buf));
    if (len <= 0) {
      continue;
    }

    /* Decode into the file-scope single workspace to avoid a 16 KB local. */
    s_spb_single = (org_eclipse_tahu_protobuf_Payload)
        org_eclipse_tahu_protobuf_Payload_init_zero;
    istream = pb_istream_from_buffer(s_metric_buf, (size_t)len);
    if (!pb_decode(&istream, org_eclipse_tahu_protobuf_Payload_fields,
                   &s_spb_single)) {
      decode_err = PB_GET_ERROR(&istream);
      LOG_ERR("DDATA pb_decode failed: %s", decode_err);
      continue;
    }

    if (s_spb_single.metrics_count == 0U) {
      continue;
    }

    payload->metrics[metric_count] = s_spb_single.metrics[0];
    payload->metrics[metric_count].timestamp = payload->timestamp;
    metric_count++;
  }

  if (metric_count == 0U) {
    return 1; /* Nothing to publish */
  }

  payload->metrics_count = metric_count;

  {
    pb_ostream_t ostream =
        pb_ostream_from_buffer(s_payload_buf, sizeof(s_payload_buf));
    const char *encode_err;

    if (!pb_encode(&ostream, org_eclipse_tahu_protobuf_Payload_fields,
                   payload)) {
      encode_err = PB_GET_ERROR(&ostream);
      LOG_ERR("DDATA pb_encode failed: %s", encode_err);
      return -EIO;
    }

    LOG_INF("Publishing DDATA to %s (%zu bytes, %u metrics)", topic,
            ostream.bytes_written, metric_count);
    return spb_publish(client, topic, s_payload_buf, ostream.bytes_written);
  }
}

static int append_json_tag(char *buf, size_t buf_len, size_t *used,
                           const zplc_tag_entry_t *tag, bool *first) {
  uint16_t base = tag->var_addr & 0xF000U;
  uint16_t offset = tag->var_addr & 0x0FFFU;
  if (base == 0x3000U) {
    base = 0x2000U;
  }

  uint8_t *region = zplc_mem_get_region(base);
  if (!region) {
    return -EINVAL;
  }

  int written = snprintf(buf + *used, buf_len - *used,
                         "%s\"tag_%04x\":", *first ? "" : ",", tag->var_addr);
  if (written < 0 || (size_t)written >= buf_len - *used) {
    return -ENOSPC;
  }
  *used += (size_t)written;
  *first = false;

  switch (tag->var_type) {
  case ZPLC_TYPE_BOOL:
    written = snprintf(buf + *used, buf_len - *used, "%s",
                       region[offset] != 0U ? "true" : "false");
    break;
  case ZPLC_TYPE_INT:
    written = snprintf(buf + *used, buf_len - *used, "%d",
                       (int)((int16_t)((uint16_t)region[offset] |
                                       ((uint16_t)region[offset + 1U] << 8U))));
    break;
  case ZPLC_TYPE_UINT:
  case ZPLC_TYPE_WORD:
    written = snprintf(buf + *used, buf_len - *used, "%u",
                       (unsigned)((uint16_t)region[offset] |
                                  ((uint16_t)region[offset + 1U] << 8U)));
    break;
  case ZPLC_TYPE_REAL: {
    uint32_t raw = (uint32_t)region[offset] |
                   ((uint32_t)region[offset + 1U] << 8U) |
                   ((uint32_t)region[offset + 2U] << 16U) |
                   ((uint32_t)region[offset + 3U] << 24U);
    float f = 0.0f;
    memcpy(&f, &raw, sizeof(f));
    written = snprintf(buf + *used, buf_len - *used, "%g", (double)f);
    break;
  }
  default:
    written = snprintf(buf + *used, buf_len - *used, "null");
    break;
  }

  if (written < 0 || (size_t)written >= buf_len - *used) {
    return -ENOSPC;
  }

  *used += (size_t)written;
  return 0;
}

static int publish_generic_telemetry(struct mqtt_client *client) {
  char topic[TOPIC_BUFFER_SIZE];
  if (build_topic(topic, sizeof(topic), "DDATA") < 0) {
    return -EINVAL;
  }

  size_t used = 0U;
  bool first = true;
  int written =
      snprintf((char *)s_payload_buf, sizeof(s_payload_buf),
               "{\"profile\":\"%s\",\"ts\":%u,\"metrics\":{",
               mqtt_profile_status_label(), (unsigned)k_uptime_get_32());
  if (written < 0 || (size_t)written >= sizeof(s_payload_buf)) {
    return -ENOSPC;
  }
  used = (size_t)written;

  zplc_pi_lock();
  uint16_t count = zplc_core_get_tag_count();
  for (uint16_t i = 0U; i < count; i++) {
    const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
    if (!tag || tag->tag_id != ZPLC_TAG_PUBLISH) {
      continue;
    }

    if (append_json_tag((char *)s_payload_buf, sizeof(s_payload_buf), &used,
                        tag, &first) < 0) {
      zplc_pi_unlock();
      return -ENOSPC;
    }
  }
  zplc_pi_unlock();

  written = snprintf((char *)s_payload_buf + used, sizeof(s_payload_buf) - used,
                     "}}");
  if (written < 0 || (size_t)written >= sizeof(s_payload_buf) - used) {
    return -ENOSPC;
  }
  used += (size_t)written;

  return spb_publish(client, topic, s_payload_buf, used);
}

static int publish_connect_birth(struct mqtt_client *client) {
  if (mqtt_profile_is_sparkplug()) {
    return publish_nbirth(client);
  }

  if (mqtt_profile_is_azure_iot_hub() && zplc_config_get_azure_twin_enabled()) {
    /*
     * Request the full Device Twin document immediately after CONNACK.
     * Azure IoT Hub responds on $iothub/twin/res/200/?$rid=1 with the JSON
     * document containing both desired and reported properties.
     * $rid=1 is reserved for the initial GET — periodic PATCH requests use
     * incrementing $rid values managed in handle_incoming_publish().
     */
    static const char twin_get_topic[] = "$iothub/twin/GET/?$rid=1";
    struct mqtt_publish_param twin_get = {
        .message =
            {
                .topic =
                    {
                        .topic =
                            {
                                .utf8 = (const uint8_t *)twin_get_topic,
                                .size = sizeof(twin_get_topic) - 1U,
                            },
                        .qos = MQTT_QOS_0_AT_MOST_ONCE,
                    },
                .payload = {.data = NULL, .len = 0U},
            },
        .message_id = 0U,
        .dup_flag = 0U,
        .retain_flag = 0U,
    };
    int rc = mqtt_publish(client, &twin_get);
    if (rc != 0) {
      LOG_WRN("Azure Twin GET failed (rc %d)", rc);
    }
  }

  if (mqtt_profile_is_aws_iot_core() && zplc_config_get_aws_shadow_enabled()) {
    /*
     * Publish an empty shadow update to trigger an accepted/delta response.
     * AWS IoT Core uses the classic shadow topic:
     *   $aws/things/{clientId}/shadow/update
     * An empty reported state forces the service to return the current delta
     * (if any desired properties differ from what was last reported).
     */
    char shadow_topic[TOPIC_BUFFER_SIZE];
    char client_id[64];
    zplc_config_get_mqtt_client_id(client_id, sizeof(client_id));
    int n = snprintf(shadow_topic, sizeof(shadow_topic),
                     "$aws/things/%s/shadow/update", client_id);
    if (n > 0 && (size_t)n < sizeof(shadow_topic)) {
      static const char shadow_sync_payload[] = "{\"state\":{\"reported\":{}}}";
      struct mqtt_publish_param shadow_sync = {
          .message =
              {
                  .topic =
                      {
                          .topic =
                              {
                                  .utf8 = (const uint8_t *)shadow_topic,
                                  .size = (uint16_t)n,
                              },
                          .qos = MQTT_QOS_0_AT_MOST_ONCE,
                      },
                  .payload =
                      {
                          .data = (uint8_t *)shadow_sync_payload,
                          .len = sizeof(shadow_sync_payload) - 1U,
                      },
              },
          .message_id = 0U,
          .dup_flag = 0U,
          .retain_flag = 0U,
      };
      int rc = mqtt_publish(client, &shadow_sync);
      if (rc != 0) {
        LOG_WRN("AWS Shadow sync publish failed (rc %d)", rc);
      }
    }
  }

  return publish_generic_telemetry(client);
}

static int publish_periodic_data(struct mqtt_client *client) {
  if (mqtt_profile_is_sparkplug()) {
    return publish_ddata(client);
  }

  return publish_generic_telemetry(client);
}

static int parse_payload_to_tag(const zplc_tag_entry_t *tag,
                                const char *payload) {
  if (!tag || !payload) {
    return -EINVAL;
  }

  uint16_t base = tag->var_addr & 0xF000U;
  uint16_t offset = tag->var_addr & 0x0FFFU;
  if (base == 0x3000U) {
    base = 0x2000U;
  }

  uint8_t *region = zplc_mem_get_region(base);
  if (!region) {
    return -EINVAL;
  }

  zplc_pi_lock();
  switch (tag->var_type) {
  case ZPLC_TYPE_BOOL: {
    bool v = (strcmp(payload, "1") == 0) || (strcasecmp(payload, "true") == 0);
    region[offset] = v ? 1U : 0U;
    break;
  }
  case ZPLC_TYPE_INT:
  case ZPLC_TYPE_UINT:
  case ZPLC_TYPE_WORD: {
    long v = strtol(payload, NULL, 10);
    uint16_t raw = (uint16_t)v;
    region[offset] = (uint8_t)(raw & 0xFFU);
    region[offset + 1U] = (uint8_t)((raw >> 8U) & 0xFFU);
    break;
  }
  case ZPLC_TYPE_REAL: {
    float f = strtof(payload, NULL);
    uint32_t raw;
    memcpy(&raw, &f, sizeof(raw));
    region[offset] = (uint8_t)(raw & 0xFFU);
    region[offset + 1U] = (uint8_t)((raw >> 8U) & 0xFFU);
    region[offset + 2U] = (uint8_t)((raw >> 16U) & 0xFFU);
    region[offset + 3U] = (uint8_t)((raw >> 24U) & 0xFFU);
    break;
  }
  default:
    zplc_pi_unlock();
    return -ENOTSUP;
  }
  zplc_pi_unlock();
  return 0;
}

static int handle_incoming_publish(struct mqtt_client *client,
                                   const struct mqtt_publish_param *pub) {
  uint32_t to_copy = MIN((uint32_t)pub->message.payload.len,
                         (uint32_t)(sizeof(s_publish_buf) - 1U));
  int rc = mqtt_read_publish_payload(client, s_publish_buf, to_copy);
  if (rc < 0) {
    return rc;
  }

  s_publish_buf[to_copy] = '\0';

  char topic[TOPIC_WILDCARD_BUFFER_SIZE];
  size_t topic_len =
      MIN((size_t)pub->message.topic.topic.size, sizeof(topic) - 1U);
  memcpy(topic, pub->message.topic.topic.utf8, topic_len);
  topic[topic_len] = '\0';

  uint16_t count = zplc_core_get_tag_count();

  if (mqtt_profile_is_azure_iot_hub()) {
    /*
     * Azure IoT Hub Device Twin response:
     *   $iothub/twin/res/{status}/?$rid={rid}
     * We only log it here — full desired-property processing would require
     * a JSON parser, which is out of scope for Phase 1.5.1.
     */
    if (zplc_config_get_azure_twin_enabled() &&
        strncmp(topic, "$iothub/twin/", 13) == 0) {
      LOG_INF("Azure Twin msg on '%s' (%u bytes)", topic, (unsigned)to_copy);
      return 0;
    }

    /*
     * Azure IoT Hub Direct Methods:
     *   $iothub/methods/POST/{methodName}/?$rid={rid}
     * Respond immediately with HTTP 200 and an empty JSON body.
     */
    if (zplc_config_get_azure_direct_methods_enabled() &&
        strncmp(topic, "$iothub/methods/POST/", 21) == 0) {
      /* Extract $rid from the topic query string */
      const char *rid_ptr = strstr(topic, "$rid=");
      char rid_val[16] = "0";
      if (rid_ptr != NULL) {
        rid_ptr += 5U; /* skip "$rid=" */
        size_t i = 0U;
        while (*rid_ptr != '\0' && *rid_ptr != '&' &&
               i < sizeof(rid_val) - 1U) {
          rid_val[i++] = *rid_ptr++;
        }
        rid_val[i] = '\0';
      }

      char resp_topic[TOPIC_WILDCARD_BUFFER_SIZE];
      int n = snprintf(resp_topic, sizeof(resp_topic),
                       "$iothub/methods/res/200/?$rid=%s", rid_val);
      if (n > 0 && (size_t)n < sizeof(resp_topic)) {
        static const char empty_body[] = "{}";
        struct mqtt_publish_param resp = {
            .message =
                {
                    .topic =
                        {
                            .topic =
                                {
                                    .utf8 = (const uint8_t *)resp_topic,
                                    .size = (uint16_t)n,
                                },
                            .qos = MQTT_QOS_0_AT_MOST_ONCE,
                        },
                    .payload =
                        {
                            .data = (uint8_t *)empty_body,
                            .len = sizeof(empty_body) - 1U,
                        },
                },
            .message_id = 0U,
            .dup_flag = 0U,
            .retain_flag = 0U,
        };
        int rc = mqtt_publish(client, &resp);
        if (rc != 0) {
          LOG_WRN("Direct Method response publish failed (rc %d)", rc);
        }
      }

      LOG_INF("Azure Direct Method on '%s' — responded 200/$rid=%s", topic,
              rid_val);
      return 0;
    }

    if (zplc_config_get_azure_c2d_enabled() &&
        strncmp(topic, "devices/", 8) == 0 &&
        strstr(topic, "/messages/devicebound/") != NULL) {
      LOG_INF("Azure C2D message received (%u bytes)", (unsigned)to_copy);
      if (s_c2d_callback != NULL) {
        s_c2d_callback(s_publish_buf, to_copy);
      }
      return 0;
    }

    /* Legacy Azure key=value tag update (original behaviour) */
    char *sep = strchr((char *)s_publish_buf, '=');
    if (sep != NULL) {
      *sep = '\0';
      const char *value = sep + 1;
      for (uint16_t i = 0U; i < count; i++) {
        const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
        if (!tag || tag->tag_id != ZPLC_TAG_SUBSCRIBE) {
          continue;
        }

        char expected_name[16];
        snprintf(expected_name, sizeof(expected_name), "tag_%04x",
                 tag->var_addr);
        if (strcmp((char *)s_publish_buf, expected_name) == 0) {
          return parse_payload_to_tag(tag, value);
        }
      }
    }
    return 0;
  }

  if (mqtt_profile_is_aws_iot_core()) {
    char client_id[64];
    zplc_config_get_mqtt_client_id(client_id, sizeof(client_id));

    /*
     * AWS IoT Core Device Shadow delta:
     *   $aws/things/{clientId}/shadow/update/delta
     * Log the delta payload — full desired→reported reconciliation requires
     * a JSON parser (out of scope for Phase 1.5.1).
     */
    if (zplc_config_get_aws_shadow_enabled()) {
      char delta_topic[TOPIC_BUFFER_SIZE];
      int n = snprintf(delta_topic, sizeof(delta_topic),
                       "$aws/things/%s/shadow/update/delta", client_id);
      if (n > 0 && (size_t)n < sizeof(delta_topic) &&
          strcmp(topic, delta_topic) == 0) {
        LOG_INF("AWS Shadow delta (%u bytes): %.*s", (unsigned)to_copy,
                (int)to_copy, (char *)s_publish_buf);
        return 0;
      }

      if (mqtt_profile_is_azure_event_grid()) {
#if defined(CONFIG_MQTT_VERSION_5_0)
        const struct mqtt_publish_param *publish = pub;
        if (publish->prop.rx.has_content_type) {
          LOG_INF("Event Grid content-type: %.*s",
                  (int)publish->prop.content_type.size,
                  publish->prop.content_type.utf8);
        }
        if (publish->prop.rx.has_user_prop) {
          for (size_t i = 0; i < ARRAY_SIZE(publish->prop.user_prop); i++) {
            if (publish->prop.user_prop[i].name.size == 0U) {
              continue;
            }
            LOG_DBG("Event Grid user-prop %.*s=%.*s",
                    (int)publish->prop.user_prop[i].name.size,
                    publish->prop.user_prop[i].name.utf8,
                    (int)publish->prop.user_prop[i].value.size,
                    publish->prop.user_prop[i].value.utf8);
          }
        }
#endif
        return 0;
      }
    }

    /*
     * AWS IoT Core Jobs notification:
     *   $aws/things/{clientId}/jobs/notify
     * Acknowledge the job as SUCCEEDED immediately.
     */
    if (zplc_config_get_aws_jobs_enabled()) {
      char jobs_topic[TOPIC_BUFFER_SIZE];
      int n = snprintf(jobs_topic, sizeof(jobs_topic),
                       "$aws/things/%s/jobs/notify", client_id);
      if (n > 0 && (size_t)n < sizeof(jobs_topic) &&
          strcmp(topic, jobs_topic) == 0) {
        LOG_INF("AWS Jobs notify (%u bytes): %.*s", (unsigned)to_copy,
                (int)to_copy, (char *)s_publish_buf);
        return 0;
      }
    }

    return 0;
  }

  if (mqtt_profile_is_sparkplug()) {
    /*
     * Check if this is an NCMD (node command) by comparing the topic
     * against the expected NCMD topic.
     *
     * The only mandatory NCMD per Sparkplug B spec §6.4.15 is:
     *   metric name = "Node Control/Rebirth", datatype = Boolean, value = true
     *
     * On rebirth: re-publish NBIRTH immediately to re-announce the node.
     */
    char ncmd_expected[TOPIC_BUFFER_SIZE];
    if (build_topic(ncmd_expected, sizeof(ncmd_expected), "NCMD") >= 0 &&
        strcmp(topic, ncmd_expected) == 0) {

      /* Decode the protobuf payload to check for rebirth request */
      org_eclipse_tahu_protobuf_Payload *ncmd_payload = &s_spb_single;
      *ncmd_payload = (org_eclipse_tahu_protobuf_Payload)
          org_eclipse_tahu_protobuf_Payload_init_zero;

      pb_istream_t istream = pb_istream_from_buffer(s_publish_buf, to_copy);
      if (pb_decode(&istream, org_eclipse_tahu_protobuf_Payload_fields,
                    ncmd_payload)) {
        for (pb_size_t i = 0U; i < ncmd_payload->metrics_count; i++) {
          const org_eclipse_tahu_protobuf_Metric *m = &ncmd_payload->metrics[i];

          /* §6.4.15: rebirth metric name is "Node Control/Rebirth" */
          if (strcmp(m->name, "Node Control/Rebirth") == 0 &&
              m->which_value ==
                  org_eclipse_tahu_protobuf_Metric_boolean_value_tag &&
              m->value.boolean_value) {

            LOG_INF(
                "NCMD: Node Control/Rebirth received — re-publishing NBIRTH");
            (void)publish_nbirth(client);
            return 0;
          }
        }
      } else {
        LOG_WRN("NCMD: pb_decode failed: %s", PB_GET_ERROR(&istream));
      }

      return 0; /* handled as NCMD regardless */
    }

    if (strstr(topic, "/DCMD/") != NULL) {
      org_eclipse_tahu_protobuf_Payload *dcmd_payload = &s_spb_single;
      *dcmd_payload = (org_eclipse_tahu_protobuf_Payload)
          org_eclipse_tahu_protobuf_Payload_init_zero;

      pb_istream_t istream = pb_istream_from_buffer(s_publish_buf, to_copy);
      if (pb_decode(&istream, org_eclipse_tahu_protobuf_Payload_fields,
                    dcmd_payload)) {
        for (pb_size_t i = 0U; i < dcmd_payload->metrics_count; i++) {
          const org_eclipse_tahu_protobuf_Metric *m = &dcmd_payload->metrics[i];

          if (strcmp(m->name, "Device Control/Rebirth") == 0 &&
              m->which_value ==
                  org_eclipse_tahu_protobuf_Metric_boolean_value_tag &&
              m->value.boolean_value) {
            LOG_INF("DCMD: Device Control/Rebirth received — re-publishing "
                    "NBIRTH/DDATA");
            (void)publish_nbirth(client);
            (void)publish_ddata(client);
            return 0;
          }
        }
      } else {
        LOG_WRN("DCMD: pb_decode failed: %s", PB_GET_ERROR(&istream));
      }
    }
  }

  for (uint16_t i = 0U; i < count; i++) {
    const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
    if (!tag || tag->tag_id != ZPLC_TAG_SUBSCRIBE) {
      continue;
    }

    char expected[TOPIC_WILDCARD_BUFFER_SIZE];
    if (build_tag_topic(expected, sizeof(expected), "DCMD", tag->var_addr) <
        0) {
      continue;
    }

    if (strcmp(topic, expected) == 0) {
      (void)parse_payload_to_tag(tag, (char *)s_publish_buf);
      break;
    }
  }

  return 0;
}

static int subscribe_runtime_tags(struct mqtt_client *client) {
  uint16_t count = zplc_core_get_tag_count();
  uint32_t n = 0U;

  if (mqtt_profile_is_sparkplug()) {
    /*
     * Sparkplug B: subscribe to NCMD topic for node-level commands.
     * Format: spBv1.0/{groupId}/NCMD/{edgeNodeId}
     * The most important NCMD is "Node Control/Rebirth" (value=true).
     *
     * Reserve slot 0 for the NCMD wildcard; tag DCMDs start at slot 1.
     */
    static char ncmd_topic[TOPIC_BUFFER_SIZE];
    if (build_topic(ncmd_topic, sizeof(ncmd_topic), "NCMD") >= 0) {
      s_sub_topics[0].topic.utf8 = (const uint8_t *)ncmd_topic;
      s_sub_topics[0].topic.size = strlen(ncmd_topic);
      s_sub_topics[0].qos =
          mqtt_qos_from_config(zplc_config_get_mqtt_subscribe_qos());
      n = 1U;
    }
  } else if (mqtt_profile_is_azure_iot_hub()) {
    static char azure_topic[TOPIC_WILDCARD_BUFFER_SIZE];
    if (build_tag_topic(azure_topic, sizeof(azure_topic), "DCMD", 0U) < 0) {
      return -EINVAL;
    }

    s_sub_topics[0].topic.utf8 = (const uint8_t *)azure_topic;
    s_sub_topics[0].topic.size = strlen(azure_topic);
    s_sub_topics[0].qos =
        mqtt_qos_from_config(zplc_config_get_mqtt_subscribe_qos());
    n = 1U;

    /* Azure Device Twin — subscribe to all responses: $iothub/twin/res/# */
    if (zplc_config_get_azure_twin_enabled() && n < MQTT_SUB_MAX_TOPICS) {
      static const char twin_res_topic[] = "$iothub/twin/res/#";
      s_sub_topics[n].topic.utf8 = (const uint8_t *)twin_res_topic;
      s_sub_topics[n].topic.size = sizeof(twin_res_topic) - 1U;
      s_sub_topics[n].qos = MQTT_QOS_0_AT_MOST_ONCE;
      n++;

      /* Also subscribe to desired property patches:
       * $iothub/twin/PATCH/properties/desired/# */
      static const char twin_desired_topic[] =
          "$iothub/twin/PATCH/properties/desired/#";
      if (n < MQTT_SUB_MAX_TOPICS) {
        s_sub_topics[n].topic.utf8 = (const uint8_t *)twin_desired_topic;
        s_sub_topics[n].topic.size = sizeof(twin_desired_topic) - 1U;
        s_sub_topics[n].qos = MQTT_QOS_0_AT_MOST_ONCE;
        n++;
      }
    }

    /* Azure Direct Methods — subscribe to all incoming method calls:
     * $iothub/methods/POST/# */
    if (zplc_config_get_azure_direct_methods_enabled() &&
        n < MQTT_SUB_MAX_TOPICS) {
      static const char methods_topic[] = "$iothub/methods/POST/#";
      s_sub_topics[n].topic.utf8 = (const uint8_t *)methods_topic;
      s_sub_topics[n].topic.size = sizeof(methods_topic) - 1U;
      s_sub_topics[n].qos = MQTT_QOS_0_AT_MOST_ONCE;
      n++;
    }
  } else if (mqtt_profile_is_azure_event_grid()) {
    static char event_grid_sub_topic[TOPIC_WILDCARD_BUFFER_SIZE];
    zplc_config_get_mqtt_topic_namespace(event_grid_sub_topic,
                                         sizeof(event_grid_sub_topic));
    if (event_grid_sub_topic[0] == '\0') {
      strncpy(event_grid_sub_topic, "zplc", sizeof(event_grid_sub_topic) - 1U);
      event_grid_sub_topic[sizeof(event_grid_sub_topic) - 1U] = '\0';
    }

    size_t used = strlen(event_grid_sub_topic);
    if (used + strlen("/commands/#") >= sizeof(event_grid_sub_topic)) {
      return -EINVAL;
    }

    strcpy(&event_grid_sub_topic[used], "/commands/#");
    s_sub_topics[0].topic.utf8 = (const uint8_t *)event_grid_sub_topic;
    s_sub_topics[0].topic.size = strlen(event_grid_sub_topic);
    s_sub_topics[0].qos =
        mqtt_qos_from_config(zplc_config_get_mqtt_subscribe_qos());
    n = 1U;
  } else if (mqtt_profile_is_aws_iot_core()) {
    char client_id[64];
    zplc_config_get_mqtt_client_id(client_id, sizeof(client_id));

    /* AWS Device Shadow delta — $aws/things/{clientId}/shadow/update/delta */
    if (zplc_config_get_aws_shadow_enabled() && n < MQTT_SUB_MAX_TOPICS) {
      static char aws_shadow_topic[TOPIC_BUFFER_SIZE];
      int ret = snprintf(aws_shadow_topic, sizeof(aws_shadow_topic),
                         "$aws/things/%s/shadow/update/delta", client_id);
      if (ret > 0 && (size_t)ret < sizeof(aws_shadow_topic)) {
        s_sub_topics[n].topic.utf8 = (const uint8_t *)aws_shadow_topic;
        s_sub_topics[n].topic.size = (uint16_t)ret;
        s_sub_topics[n].qos = MQTT_QOS_0_AT_MOST_ONCE;
        n++;
      }
    }

    /* AWS Jobs notification — $aws/things/{clientId}/jobs/notify */
    if (zplc_config_get_aws_jobs_enabled() && n < MQTT_SUB_MAX_TOPICS) {
      static char aws_jobs_topic[TOPIC_BUFFER_SIZE];
      int ret = snprintf(aws_jobs_topic, sizeof(aws_jobs_topic),
                         "$aws/things/%s/jobs/notify", client_id);
      if (ret > 0 && (size_t)ret < sizeof(aws_jobs_topic)) {
        s_sub_topics[n].topic.utf8 = (const uint8_t *)aws_jobs_topic;
        s_sub_topics[n].topic.size = (uint16_t)ret;
        s_sub_topics[n].qos = MQTT_QOS_0_AT_MOST_ONCE;
        n++;
      }
    }
  }

  if (!mqtt_profile_is_azure_iot_hub() && !mqtt_profile_is_aws_iot_core()) {
    for (uint16_t i = 0U; i < count && n < MQTT_SUB_MAX_TOPICS; i++) {
      const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
      if (!tag || tag->tag_id != ZPLC_TAG_SUBSCRIBE) {
        continue;
      }

      static char topic_storage[MQTT_SUB_MAX_TOPICS]
                               [TOPIC_WILDCARD_BUFFER_SIZE];
      if (build_tag_topic(topic_storage[n], sizeof(topic_storage[n]), "DCMD",
                          tag->var_addr) < 0) {
        continue;
      }

      s_sub_topics[n].topic.utf8 = (const uint8_t *)topic_storage[n];
      s_sub_topics[n].topic.size = strlen(topic_storage[n]);
      s_sub_topics[n].qos =
          mqtt_qos_from_config(zplc_config_get_mqtt_subscribe_qos());
      n++;
    }
  }

  if (n == 0U) {
    return 0;
  }

  struct mqtt_subscription_list list = {
      .list = s_sub_topics,
      .list_count = n,
      .message_id = 0x0200,
  };

  int rc = mqtt_subscribe(client, &list);
  if (rc == 0) {
    s_subscribed = true;
    LOG_INF("Subscribed to %u topics (incl. NCMD: %s)", n,
            mqtt_profile_is_sparkplug() ? "yes" : "no");
  }
  return rc;
}

/* ============================================================================
 * MQTT Event Handler
 * ============================================================================
 */

static void mqtt_evt_handler(struct mqtt_client *const client,
                             const struct mqtt_evt *evt) {
  switch (evt->type) {

  case MQTT_EVT_CONNACK:
    if (evt->result != 0) {
      LOG_ERR("MQTT CONNACK failed: %d", evt->result);
      s_last_error = evt->result;
      break;
    }
    s_connected = true;
    s_last_error = 0;
    s_session_present = evt->param.connack.session_present_flag != 0U;
    LOG_INF("MQTT connected — publishing initial state");
    if (publish_connect_birth(client) != 0) {
      LOG_ERR("Initial publish failed — aborting connection");
      s_connected = false;
      mqtt_abort(client);
      break;
    }

    if (subscribe_runtime_tags(client) != 0) {
      LOG_WRN("Subscribe setup failed");
    }
    break;

  case MQTT_EVT_DISCONNECT:
    LOG_INF("MQTT disconnected: %d", evt->result);
    s_connected = false;
    s_subscribed = false;
    s_last_error = evt->result;
    clear_fds();
    break;

  case MQTT_EVT_PUBLISH:
    (void)handle_incoming_publish(client, &evt->param.publish);
    if (evt->param.publish.message.topic.qos == MQTT_QOS_1_AT_LEAST_ONCE) {
      struct mqtt_puback_param ack = {
          .message_id = evt->param.publish.message_id,
      };
      (void)mqtt_publish_qos1_ack(client, &ack);
    }
    break;

  case MQTT_EVT_PUBACK:
    if (evt->result != 0) {
      LOG_ERR("MQTT PUBACK error: %d", evt->result);
      s_last_error = evt->result;
    }
    break;

  case MQTT_EVT_SUBACK:
    LOG_INF("MQTT SUBACK id=%u result=%d", evt->param.suback.message_id,
            evt->result);
    break;

  case MQTT_EVT_PUBREC: {
    /* QoS 2 publish — step 2: respond with PUBREL so broker completes delivery
     */
    struct mqtt_pubrel_param rel = {.message_id = evt->param.pubrec.message_id};
    int rc = mqtt_publish_qos2_release(client, &rel);
    if (rc != 0) {
      LOG_ERR("PUBREL send failed (id=%u): %d", rel.message_id, rc);
    } else {
      LOG_DBG("MQTT PUBREC id=%u → PUBREL sent", rel.message_id);
    }
    break;
  }

  case MQTT_EVT_PUBREL: {
    /* QoS 2 subscribe — step 4: confirm release with PUBCOMP */
    struct mqtt_pubcomp_param comp = {.message_id =
                                          evt->param.pubrel.message_id};
    int rc = mqtt_publish_qos2_complete(client, &comp);
    if (rc != 0) {
      LOG_ERR("PUBCOMP send failed (id=%u): %d", comp.message_id, rc);
    } else {
      LOG_DBG("MQTT PUBREL id=%u → PUBCOMP sent", comp.message_id);
    }
    break;
  }

  case MQTT_EVT_PUBCOMP:
    LOG_DBG("MQTT PUBCOMP id=%u — QoS 2 delivery confirmed",
            evt->param.pubcomp.message_id);
    break;

  case MQTT_EVT_PINGRESP:
    LOG_DBG("PINGRESP");
    break;

  default:
    LOG_DBG("Unhandled MQTT event %d", (int)evt->type);
    break;
  }
}

/* ============================================================================
 * Broker Resolution
 * ============================================================================
 */

/**
 * @brief Resolve the configured broker hostname/IP to a sockaddr_in.
 *
 * Falls back to the same configured broker string interpreted as an IP.
 * This keeps the fallback consistent with whatever the operator has set
 * (no hardcoded magic IPs in source code).
 */
static void resolve_broker(struct sockaddr_in *out) {
  /* Use the static buffer so deferred LOG_* macros don't crash on invalid
   * pointers */
  zplc_config_get_mqtt_broker(s_mqtt_hostname, sizeof(s_mqtt_hostname));

  char port_str[8];
  snprintf(port_str, sizeof(port_str), "%u", zplc_config_get_mqtt_port());

  struct zsock_addrinfo hints = {0};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;

  struct zsock_addrinfo *res = NULL;
  if (zsock_getaddrinfo(s_mqtt_hostname, port_str, &hints, &res) == 0 && res) {
    memcpy(out, res->ai_addr, sizeof(struct sockaddr_in));
    zsock_freeaddrinfo(res);
    LOG_INF("Broker '%s' resolved via DNS", s_mqtt_hostname);
  } else {
    /*
     * DNS failed. Attempt to use the configured value directly as an
     * IPv4 address. If it is already a dotted-decimal string (common
     * in embedded deployments) zsock_inet_pton will succeed.
     */
    LOG_WRN("DNS resolution for '%s' failed. Trying as literal IP...",
            s_mqtt_hostname);
    out->sin_family = AF_INET;
    out->sin_port = htons(zplc_config_get_mqtt_port());
    if (zsock_inet_pton(AF_INET, s_mqtt_hostname, &out->sin_addr) != 1) {
      LOG_ERR("'%s' is not a valid IPv4 address. Connection will fail.",
              s_mqtt_hostname);
    }
  }
}

/* ============================================================================
 * Client Init
 * ============================================================================
 */

static int client_init(struct mqtt_client *client) {
  mqtt_client_init(client);

  resolve_broker((struct sockaddr_in *)&s_broker_addr);

  char hostname[32];
  zplc_config_get_hostname(hostname, sizeof(hostname));
  zplc_config_get_mqtt_client_id(s_mqtt_client_id, sizeof(s_mqtt_client_id));

  client->broker = &s_broker_addr;
  client->evt_cb = mqtt_evt_handler;
  if (s_mqtt_client_id[0] != '\0') {
    client->client_id.utf8 = (const uint8_t *)s_mqtt_client_id;
    client->client_id.size = strlen(s_mqtt_client_id);
  } else {
    client->client_id.utf8 = (const uint8_t *)hostname;
    client->client_id.size = strlen(hostname);
  }
  setup_auth(client);
  client->protocol_version =
      ((mqtt_profile_is_azure_iot_hub()) ||
       (!mqtt_profile_is_azure_event_grid() &&
        zplc_config_get_mqtt_protocol() == ZPLC_MQTT_PROTOCOL_3_1_1))
          ? MQTT_VERSION_3_1_1
          : MQTT_VERSION_5_0;
  client->clean_session = zplc_config_get_mqtt_clean_session() ? 1U : 0U;
  client->keepalive = zplc_config_get_mqtt_keepalive_sec();

  client->rx_buf = s_rx_buf;
  client->rx_buf_size = sizeof(s_rx_buf);
  client->tx_buf = s_tx_buf;
  client->tx_buf_size = sizeof(s_tx_buf);

#if defined(CONFIG_MQTT_VERSION_5_0)
  memset(&client->prop, 0, sizeof(client->prop));
  client->prop.session_expiry_interval =
      zplc_config_get_mqtt_session_expiry_sec();
#endif

  if (configure_lwt(client) < 0) {
    return -EINVAL;
  }

  return setup_tls(client);
}

/* ============================================================================
 * MQTT Client Thread
 * ============================================================================
 */

static void mqtt_client_thread(void *arg1, void *arg2, void *arg3) {
  ARG_UNUSED(arg1);
  ARG_UNUSED(arg2);
  ARG_UNUSED(arg3);

  /* Allow network stack + DHCP to settle before first connect attempt */
  k_sleep(K_SECONDS(5));

  uint32_t backoff_s = BACKOFF_INITIAL_S;
  s_current_backoff_s = backoff_s;

  while (1) {
    if (!zplc_config_get_mqtt_enabled()) {
      /* Use the wakeup semaphore so zplc_mqtt_request_backoff_reset()
       * (or any future re-enable path) can interrupt this sleep
       * immediately instead of waiting a full second. */
      k_sem_take(&s_wakeup_sem, K_SECONDS(1));
      continue;
    }

    /* Allow HIL / operator to force backoff reset without a reboot */
    if (atomic_test_and_clear_bit(&s_backoff_reset_req, 0)) {
      LOG_INF("Backoff reset requested — resetting to %us", BACKOFF_INITIAL_S);
      backoff_s = BACKOFF_INITIAL_S;
      s_current_backoff_s = backoff_s;
    }

    s_connected = false;
    s_subscribed = false;
    int tls_rc = client_init(&s_client);
    if (tls_rc < 0) {
      LOG_ERR("MQTT security setup failed: %d", tls_rc);
      s_last_error = tls_rc;
      /* Interruptible sleep: wakes early if s_wakeup_sem is given */
      k_sem_take(&s_wakeup_sem, K_SECONDS(backoff_s));
      backoff_s = MIN(backoff_s * 2U, BACKOFF_MAX_S);
      s_current_backoff_s = backoff_s;
      continue;
    }

    LOG_INF("Connecting to MQTT broker (backoff=%us)...", backoff_s);

    int rc = mqtt_connect(&s_client);
    if (rc != 0) {
      LOG_ERR("mqtt_connect failed: %d — retrying in %us", rc, backoff_s);
      s_last_error = rc;
      /* Interruptible sleep: wakes early if s_wakeup_sem is given */
      k_sem_take(&s_wakeup_sem, K_SECONDS(backoff_s));
      /* Exponential backoff, capped at BACKOFF_MAX_S */
      backoff_s = MIN(backoff_s * 2U, BACKOFF_MAX_S);
      s_current_backoff_s = backoff_s;
      continue;
    }

    prepare_fds(&s_client);

    /* Wait up to 5s for CONNACK */
    if (poll_for_data(5000) > 0) {
      mqtt_input(&s_client);
    }

    if (!s_connected) {
      mqtt_abort(&s_client);
      LOG_WRN("No CONNACK received — retrying in %us", backoff_s);
      s_last_error = -ETIMEDOUT;
      /* Interruptible sleep: wakes early if s_wakeup_sem is given */
      k_sem_take(&s_wakeup_sem, K_SECONDS(backoff_s));
      backoff_s = MIN(backoff_s * 2U, BACKOFF_MAX_S);
      s_current_backoff_s = backoff_s;
      continue;
    }

    /* Connection established — reset backoff */
    backoff_s = BACKOFF_INITIAL_S;
    s_current_backoff_s = backoff_s;

    /* ── Main publish loop ── */
    uint32_t last_publish_ms = k_uptime_get_32();

    while (s_connected) {
      int err = poll_for_data(100);
      if (err > 0) {
        mqtt_input(&s_client);
      } else if (err < 0 && err != -EAGAIN && err != -EINVAL) {
        LOG_ERR("Poll error: %d", err);
        break;
      }

      uint32_t now_ms = k_uptime_get_32();
      if (now_ms - last_publish_ms >=
          zplc_config_get_mqtt_publish_interval_ms()) {
        (void)publish_periodic_data(&s_client);
        last_publish_ms = now_ms;
        s_last_publish_ms = now_ms;
      }

      /* Drain FB publishes */
      zplc_mqtt_pub_req_t req;
      while (k_msgq_get(&s_mqtt_pub_q, &req, K_NO_WAIT) == 0) {
        struct mqtt_publish_param param;
        memset(&param, 0, sizeof(param));
        param.message.topic.qos = (req.qos <= 2) ? req.qos : 0;
        param.message.topic.topic.utf8 = (const uint8_t *)req.topic;
        param.message.topic.topic.size = strlen(req.topic);
        param.message.payload.data = req.payload;
        param.message.payload.len = req.payload_len;
        param.message_id = k_uptime_get_32();
        param.dup_flag = 0U;
        param.retain_flag = req.retain ? 1U : 0U;

#if defined(CONFIG_MQTT_VERSION_5_0)
        memset(&param.prop, 0, sizeof(param.prop));
#endif

        int pub_rc = mqtt_publish(&s_client, &param);
        if (pub_rc != 0) {
          LOG_WRN("FB publish failed: %d", pub_rc);
        }
      }

      mqtt_live(&s_client);
    }

    if (s_client.protocol_version == MQTT_VERSION_3_1_1) {
      mqtt_disconnect(&s_client, NULL);
    } else {
      struct mqtt_disconnect_param dis = {.reason_code =
                                              MQTT_DISCONNECT_NORMAL};
      mqtt_disconnect(&s_client, &dis);
    }

    LOG_INF("Disconnected. Reconnecting in %us...", backoff_s);
    /* Interruptible sleep: wakes early if s_wakeup_sem is given */
    k_sem_take(&s_wakeup_sem, K_SECONDS(backoff_s));
    backoff_s = MIN(backoff_s * 2U, BACKOFF_MAX_S);
    s_current_backoff_s = backoff_s;
  }
}

/* ============================================================================
 * Public API
 * ============================================================================
 */

int zplc_mqtt_init(void) {
  k_msgq_init(&s_mqtt_pub_q, (char *)s_mqtt_pub_q_buf,
              sizeof(zplc_mqtt_pub_req_t), MQTT_PUB_QUEUE_SIZE);

  k_tid_t tid = k_thread_create(
      &s_mqtt_thread, s_mqtt_stack, K_THREAD_STACK_SIZEOF(s_mqtt_stack),
      mqtt_client_thread, NULL, NULL, NULL, K_PRIO_COOP(8), 0, K_NO_WAIT);

  if (!tid) {
    LOG_ERR("Failed to create MQTT thread");
    return -ENOMEM;
  }

  k_thread_name_set(&s_mqtt_thread, "mqtt_client");
  return 0;
}

void zplc_mqtt_request_backoff_reset(void) {
  atomic_set_bit(&s_backoff_reset_req, 0);
  /* Wake the MQTT thread immediately from any k_sem_take() backoff sleep.
   * Without this, the thread would block up to BACKOFF_MAX_S (60s) before
   * it checks the atomic flag — making HIL tests time out. */
  k_sem_give(&s_wakeup_sem);
  LOG_INF("Backoff reset requested — thread woken immediately");
}

void zplc_mqtt_set_azure_c2d_callback(zplc_azure_c2d_cb_t cb) {
  s_c2d_callback = cb;
}

int zplc_mqtt_enqueue_publish(const char *topic, const uint8_t *payload,
                              size_t len, uint8_t qos, bool retain) {
  if (!s_connected)
    return -ENOTCONN;
  if (len > ZPLC_MQTT_REQ_MAX_PAYLOAD)
    return -EMSGSIZE;
  if (strlen(topic) >= ZPLC_MQTT_REQ_MAX_TOPIC)
    return -EMSGSIZE;

  zplc_mqtt_pub_req_t req;
  strncpy(req.topic, topic, sizeof(req.topic) - 1);
  req.topic[sizeof(req.topic) - 1] = '\0';
  memcpy(req.payload, payload, len);
  req.payload_len = len;
  req.qos = qos;
  req.retain = retain;

  return k_msgq_put(&s_mqtt_pub_q, &req, K_NO_WAIT);
}

int zplc_azure_event_grid_publish(const char *event_type, const char *source,
                                  const char *topic, const char *data) {
  char resolved_topic[192];
  char resolved_source[128];
  char resolved_type[96];
  char cloud_event[1024];
  int len;

  if (!mqtt_profile_is_azure_event_grid()) {
    return -ENOTSUP;
  }

  if (!s_connected) {
    return -ENOTCONN;
  }

  if (topic != NULL && topic[0] != '\0') {
    strncpy(resolved_topic, topic, sizeof(resolved_topic) - 1U);
    resolved_topic[sizeof(resolved_topic) - 1U] = '\0';
  } else {
    zplc_config_get_azure_event_grid_topic(resolved_topic,
                                           sizeof(resolved_topic));
  }

  if (source != NULL && source[0] != '\0') {
    strncpy(resolved_source, source, sizeof(resolved_source) - 1U);
    resolved_source[sizeof(resolved_source) - 1U] = '\0';
  } else {
    zplc_config_get_azure_event_grid_source(resolved_source,
                                            sizeof(resolved_source));
  }

  if (event_type != NULL && event_type[0] != '\0') {
    strncpy(resolved_type, event_type, sizeof(resolved_type) - 1U);
    resolved_type[sizeof(resolved_type) - 1U] = '\0';
  } else {
    zplc_config_get_azure_event_grid_event_type(resolved_type,
                                                sizeof(resolved_type));
  }

  if (resolved_topic[0] == '\0' || resolved_source[0] == '\0' ||
      resolved_type[0] == '\0' || data == NULL) {
    return -EINVAL;
  }

  len = snprintf(cloud_event, sizeof(cloud_event),
                 "{\"specversion\":\"1.0\",\"type\":\"%s\",\"source\":\"%s\","
                 "\"id\":\"%u\",\"time\":\"%llu\",\"datacontenttype\":"
                 "\"application/json\",\"data\":%s}",
                 resolved_type, resolved_source, (unsigned)k_uptime_get_32(),
                 (unsigned long long)get_timestamp_ms(), data);
  if (len <= 0 || (size_t)len >= sizeof(cloud_event)) {
    return -ENOMEM;
  }

  return publish_json_payload(&s_client, resolved_topic, cloud_event);
}

void zplc_mqtt_get_status(zplc_mqtt_status_t *status) {
  if (status == NULL) {
    return;
  }

  memset(status, 0, sizeof(*status));
  status->connected = s_connected;
  status->subscribed = s_subscribed;
  status->session_present = s_session_present;
  status->profile = (uint8_t)zplc_config_get_mqtt_profile();
  status->protocol = (uint8_t)zplc_config_get_mqtt_protocol();
  status->transport = (uint8_t)zplc_config_get_mqtt_transport();
  status->publish_qos = (uint8_t)zplc_config_get_mqtt_publish_qos();
  status->subscribe_qos = (uint8_t)zplc_config_get_mqtt_subscribe_qos();
  status->retain_enabled = zplc_config_get_mqtt_publish_retain();
  status->lwt_enabled = zplc_config_get_mqtt_lwt_enabled();
  status->last_error = s_last_error;
  status->last_publish_ms = s_last_publish_ms;
  status->reconnect_backoff_s = s_current_backoff_s;
  zplc_config_get_mqtt_broker(status->broker, sizeof(status->broker));
  zplc_config_get_mqtt_client_id(status->client_id, sizeof(status->client_id));
}
