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

#include "zplc_config.h"
#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zephyr/kernel.h>
#include <zephyr/net/socket.h>
#include <zephyr/net/mqtt.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>

#include <pb_encode.h>
#include "proto/sparkplug_b.pb.h"

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_mqtt, LOG_LEVEL_INF);

/* ============================================================================
 * Constants
 * ============================================================================ */

#define MQTT_BUFFER_SIZE        1024U
#define PAYLOAD_BUFFER_SIZE     1024U
#define TOPIC_BUFFER_SIZE       128U

/** Sparkplug B sequence number wraps at 255 (uint8 domain) */
#define SPB_SEQ_MAX             256U

/** Reconnect backoff: starts at 2s, doubles each retry, caps at 60s */
#define BACKOFF_INITIAL_S       2U
#define BACKOFF_MAX_S           60U

/* ============================================================================
 * Static State
 * ============================================================================ */

static uint8_t s_rx_buf[MQTT_BUFFER_SIZE];
static uint8_t s_tx_buf[MQTT_BUFFER_SIZE];
static uint8_t s_payload_buf[PAYLOAD_BUFFER_SIZE];

static struct mqtt_client  s_client;
static struct sockaddr_storage s_broker_addr;
static struct zsock_pollfd s_fds[1];
static int                 s_nfds;
static bool                s_connected;

/** Monotonically increasing Sparkplug B sequence number (wraps 0-255) */
static uint32_t            s_spb_seq;

static struct k_thread     s_mqtt_thread;
static K_THREAD_STACK_DEFINE(s_mqtt_stack, 8192);

/* ============================================================================
 * Helpers
 * ============================================================================ */

/**
 * @brief Build a Sparkplug B topic string.
 *
 * @param[out] buf      Destination buffer.
 * @param[in]  buf_len  Size of destination buffer.
 * @param[in]  msg_type Sparkplug message type string (e.g. "NBIRTH", "DDATA").
 *
 * @return Number of characters written (excluding NUL), or negative on error.
 */
static int build_topic(char *buf, size_t buf_len, const char *msg_type)
{
    char hostname[32];
    zplc_config_get_hostname(hostname, sizeof(hostname));

    /* Topic namespace: spBv1.0/<GroupId>/<MsgType>/<EdgeNodeId> */
    return snprintf(buf, buf_len, "spBv1.0/ZPLC/%s/%s", msg_type, hostname);
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
                                    uint8_t *out_buf, size_t max_len)
{
    if (!tag || !out_buf || max_len == 0U) {
        return -1;
    }

    zplc_pi_lock();

    uint16_t base   = tag->var_addr & 0xF000U;
    uint16_t offset = tag->var_addr & 0x0FFFU;

    /* Normalise %QX/%MX region aliases */
    if (base == 0x3000U) {
        base = 0x2000U;
    }

    uint8_t *region = zplc_mem_get_region(base);

    /* Determine the size of the resolved region for bounds validation */
    uint32_t region_size;
    switch (base) {
    case ZPLC_MEM_IPI_BASE:    region_size = ZPLC_MEM_IPI_SIZE;    break;
    case ZPLC_MEM_OPI_BASE:    region_size = ZPLC_MEM_OPI_SIZE;    break;
    case ZPLC_MEM_WORK_BASE:   region_size = ZPLC_MEM_WORK_SIZE;   break;
    case ZPLC_MEM_RETAIN_BASE: region_size = ZPLC_MEM_RETAIN_SIZE; break;
    default:
        LOG_ERR("Unknown memory region base 0x%04x", base);
        zplc_pi_unlock();
        return -1;
    }

    /* Static: this struct holds up to 32 metrics (~3.8 KB). Keeping it
     * off the thread stack prevents stack overflow on Cortex-M7.
     * Safe here because encode_sparkplug_payload() is only ever called
     * from the single mqtt_client thread (no re-entrancy). */
    static org_eclipse_tahu_protobuf_Payload payload;
    payload = (org_eclipse_tahu_protobuf_Payload)
                  org_eclipse_tahu_protobuf_Payload_init_zero;
    payload.timestamp = (uint64_t)k_uptime_get();
    payload.seq       = (uint64_t)s_spb_seq;
    s_spb_seq         = (s_spb_seq + 1U) % SPB_SEQ_MAX;

    if (region) {
        payload.metrics_count = 1U;
        org_eclipse_tahu_protobuf_Metric *m = &payload.metrics[0];

        snprintf(m->name, sizeof(m->name), "tag_%04x", tag->var_addr);
        m->timestamp = payload.timestamp;

        switch (tag->var_type) {

        case ZPLC_TYPE_BOOL:
            /* Single byte — offset must be within region */
            if ((uint32_t)offset + 1U > region_size) {
                LOG_ERR("BOOL offset %u out of bounds", offset);
                region = NULL;
                break;
            }
            m->datatype   = 11U; /* Sparkplug DataType_Boolean */
            m->which_value =
                org_eclipse_tahu_protobuf_Metric_boolean_value_tag;
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
                uint16_t raw = (uint16_t)region[offset] |
                               ((uint16_t)region[offset + 1U] << 8U);
                m->datatype    = 5U; /* Sparkplug DataType_Int32 */
                m->which_value =
                    org_eclipse_tahu_protobuf_Metric_int_value_tag;
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
                uint32_t raw = (uint32_t)region[offset]            |
                               ((uint32_t)region[offset + 1U] << 8U)  |
                               ((uint32_t)region[offset + 2U] << 16U) |
                               ((uint32_t)region[offset + 3U] << 24U);
                float fval;
                /* Type-punning via memcpy — the only safe way in C99 */
                memcpy(&fval, &raw, sizeof(float));
                m->datatype    = 9U; /* Sparkplug DataType_Float */
                m->which_value =
                    org_eclipse_tahu_protobuf_Metric_float_value_tag;
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

    if (!region && !payload.metrics[0].is_null) {
        /* Region was invalidated by a bounds-check failure above */
        payload.metrics[0].is_null = true;
    }

    pb_ostream_t stream = pb_ostream_from_buffer(out_buf, max_len);
    if (!pb_encode(&stream, org_eclipse_tahu_protobuf_Payload_fields, &payload)) {
        LOG_ERR("Sparkplug B pb_encode failed: %s", PB_GET_ERROR(&stream));
        return -1;
    }

    return (int)stream.bytes_written;
}

/* ============================================================================
 * MQTT Poll Helpers
 * ============================================================================ */

static void prepare_fds(struct mqtt_client *client)
{
    s_fds[0].fd     = client->transport.tcp.sock;
    s_fds[0].events = ZSOCK_POLLIN;
    s_nfds          = 1;
}

static void clear_fds(void)
{
    s_nfds = 0;
}

static int poll_for_data(int timeout_ms)
{
    if (s_nfds > 0) {
        return zsock_poll(s_fds, (nfds_t)s_nfds, timeout_ms);
    }
    return -EINVAL;
}

/* ============================================================================
 * Sparkplug B Publish Helpers
 * ============================================================================ */

/**
 * @brief Publish a raw Sparkplug B payload to a topic.
 *
 * @return 0 on success, negative errno on failure.
 */
static int spb_publish(struct mqtt_client *client,
                       const char *topic_str,
                       const uint8_t *data, size_t data_len)
{
    struct mqtt_publish_param param;

    param.message.topic.qos         = MQTT_QOS_0_AT_MOST_ONCE;
    param.message.topic.topic.utf8  = (const uint8_t *)topic_str;
    param.message.topic.topic.size  = strlen(topic_str);
    param.message.payload.data      = (uint8_t *)data; /* MQTT API takes non-const; data is read-only */
    param.message.payload.len       = data_len;
    param.message_id                = k_uptime_get_32();
    param.dup_flag                  = 0U;
    param.retain_flag               = 0U;

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
 * @return 0 on success, negative on failure.
 */
static int publish_nbirth(struct mqtt_client *client)
{
    char topic[TOPIC_BUFFER_SIZE];
    if (build_topic(topic, sizeof(topic), "NBIRTH") < 0) {
        return -EINVAL;
    }

    /* Static: same reasoning as encode_sparkplug_payload — up to 32 metrics,
     * ~3.8 KB. Only called from the mqtt_client thread. */
    static org_eclipse_tahu_protobuf_Payload payload;
    payload = (org_eclipse_tahu_protobuf_Payload)
                  org_eclipse_tahu_protobuf_Payload_init_zero;
    payload.timestamp = (uint64_t)k_uptime_get();

    /*
     * Sparkplug B spec §6.4.6: The NBIRTH seq field MUST be 0.
     * Reset the running counter here so the first DDATA gets seq=1.
     */
    s_spb_seq         = 0U;
    payload.seq       = 0U;

    /* Include all published tags as birth certificate entries */
    uint16_t count   = zplc_core_get_tag_count();
    uint8_t  n_added = 0U;

    for (uint16_t i = 0U; i < count && n_added < 32U; i++) {
        const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
        if (!tag || tag->tag_id != ZPLC_TAG_PUBLISH) {
            continue;
        }

        org_eclipse_tahu_protobuf_Metric *m = &payload.metrics[n_added];
        snprintf(m->name, sizeof(m->name), "tag_%04x", tag->var_addr);
        m->timestamp = payload.timestamp;
        m->is_null   = true; /* Birth values carry metadata only */

        /* Map ZPLC type to Sparkplug DataType */
        switch (tag->var_type) {
        case ZPLC_TYPE_BOOL: m->datatype = 11U; break; /* Boolean */
        case ZPLC_TYPE_INT:  m->datatype = 5U;  break; /* Int32   */
        case ZPLC_TYPE_UINT:
        case ZPLC_TYPE_WORD: m->datatype = 5U;  break; /* Int32   */
        case ZPLC_TYPE_REAL: m->datatype = 9U;  break; /* Float   */
        default:             m->datatype = 0U;  break; /* Unknown */
        }

        n_added++;
    }

    payload.metrics_count = n_added;

    pb_ostream_t stream = pb_ostream_from_buffer(s_payload_buf, sizeof(s_payload_buf));
    if (!pb_encode(&stream, org_eclipse_tahu_protobuf_Payload_fields, &payload)) {
        LOG_ERR("NBIRTH pb_encode failed: %s", PB_GET_ERROR(&stream));
        return -1;
    }

    LOG_INF("Publishing NBIRTH to %s (%zu bytes, %u metrics)",
            topic, stream.bytes_written, n_added);

    return spb_publish(client, topic, s_payload_buf, stream.bytes_written);
}

/**
 * @brief Publish a DDATA frame for the first ZPLC_TAG_PUBLISH tag found.
 *
 * @return 0 on success, negative on failure, 1 if nothing to publish.
 */
static int publish_ddata(struct mqtt_client *client)
{
    uint16_t count = zplc_core_get_tag_count();

    for (uint16_t i = 0U; i < count; i++) {
        const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
        if (!tag || tag->tag_id != ZPLC_TAG_PUBLISH) {
            continue;
        }

        char topic[TOPIC_BUFFER_SIZE];
        if (build_topic(topic, sizeof(topic), "DDATA") < 0) {
            return -EINVAL;
        }

        int len = encode_sparkplug_payload(tag, s_payload_buf, sizeof(s_payload_buf));
        if (len <= 0) {
            return -EIO;
        }

        LOG_INF("Publishing DDATA to %s (%d bytes)", topic, len);
        return spb_publish(client, topic, s_payload_buf, (size_t)len);
    }

    return 1; /* Nothing to publish */
}

/* ============================================================================
 * MQTT Event Handler
 * ============================================================================ */

static void mqtt_evt_handler(struct mqtt_client *const client,
                             const struct mqtt_evt *evt)
{
    switch (evt->type) {

    case MQTT_EVT_CONNACK:
        if (evt->result != 0) {
            LOG_ERR("MQTT CONNACK failed: %d", evt->result);
            break;
        }
        s_connected = true;
        LOG_INF("MQTT connected — publishing NBIRTH");
        /*
         * Sparkplug B §6.4.6: NBIRTH MUST be the first message after
         * CONNACK, before any DDATA.
         */
        if (publish_nbirth(client) != 0) {
            LOG_ERR("NBIRTH publish failed — aborting connection");
            s_connected = false;
            mqtt_abort(client);
        }
        break;

    case MQTT_EVT_DISCONNECT:
        LOG_INF("MQTT disconnected: %d", evt->result);
        s_connected = false;
        clear_fds();
        break;

    case MQTT_EVT_PUBACK:
        if (evt->result != 0) {
            LOG_ERR("MQTT PUBACK error: %d", evt->result);
        }
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
 * ============================================================================ */

/**
 * @brief Resolve the configured broker hostname/IP to a sockaddr_in.
 *
 * Falls back to the same configured broker string interpreted as an IP.
 * This keeps the fallback consistent with whatever the operator has set
 * (no hardcoded magic IPs in source code).
 */
static void resolve_broker(struct sockaddr_in *out)
{
    char broker[64];
    zplc_config_get_mqtt_broker(broker, sizeof(broker));

    char port_str[8];
    snprintf(port_str, sizeof(port_str), "%u", zplc_config_get_mqtt_port());

    struct zsock_addrinfo hints = {0};
    hints.ai_family   = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    struct zsock_addrinfo *res = NULL;
    if (zsock_getaddrinfo(broker, port_str, &hints, &res) == 0 && res) {
        memcpy(out, res->ai_addr, sizeof(struct sockaddr_in));
        zsock_freeaddrinfo(res);
        LOG_INF("Broker '%s' resolved via DNS", broker);
    } else {
        /*
         * DNS failed. Attempt to use the configured value directly as an
         * IPv4 address. If it is already a dotted-decimal string (common
         * in embedded deployments) zsock_inet_pton will succeed.
         */
        LOG_WRN("DNS resolution for '%s' failed. Trying as literal IP...", broker);
        out->sin_family = AF_INET;
        out->sin_port   = htons(zplc_config_get_mqtt_port());
        if (zsock_inet_pton(AF_INET, broker, &out->sin_addr) != 1) {
            LOG_ERR("'%s' is not a valid IPv4 address. Connection will fail.", broker);
        }
    }
}

/* ============================================================================
 * Client Init
 * ============================================================================ */

static void client_init(struct mqtt_client *client)
{
    mqtt_client_init(client);

    resolve_broker((struct sockaddr_in *)&s_broker_addr);

    char hostname[32];
    zplc_config_get_hostname(hostname, sizeof(hostname));

    client->broker           = &s_broker_addr;
    client->evt_cb           = mqtt_evt_handler;
    client->client_id.utf8   = (const uint8_t *)hostname;
    client->client_id.size   = strlen(hostname);
    client->password         = NULL;
    client->user_name        = NULL;
    client->protocol_version = MQTT_VERSION_5_0;

    client->rx_buf      = s_rx_buf;
    client->rx_buf_size = sizeof(s_rx_buf);
    client->tx_buf      = s_tx_buf;
    client->tx_buf_size = sizeof(s_tx_buf);

    client->transport.type = MQTT_TRANSPORT_NON_SECURE;
}

/* ============================================================================
 * MQTT Client Thread
 * ============================================================================ */

static void mqtt_client_thread(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);

    /* Allow network stack + DHCP to settle before first connect attempt */
    k_sleep(K_SECONDS(5));

    uint32_t backoff_s = BACKOFF_INITIAL_S;

    while (1) {
        s_connected = false;
        client_init(&s_client);

        LOG_INF("Connecting to MQTT broker (backoff=%us)...", backoff_s);

        int rc = mqtt_connect(&s_client);
        if (rc != 0) {
            LOG_ERR("mqtt_connect failed: %d — retrying in %us", rc, backoff_s);
            k_sleep(K_SECONDS(backoff_s));
            /* Exponential backoff, capped at BACKOFF_MAX_S */
            backoff_s = MIN(backoff_s * 2U, BACKOFF_MAX_S);
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
            k_sleep(K_SECONDS(backoff_s));
            backoff_s = MIN(backoff_s * 2U, BACKOFF_MAX_S);
            continue;
        }

        /* Connection established — reset backoff */
        backoff_s = BACKOFF_INITIAL_S;

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
            if (now_ms - last_publish_ms >= 2000U) {
                (void)publish_ddata(&s_client);
                last_publish_ms = now_ms;
            }

            mqtt_live(&s_client);
        }

        struct mqtt_disconnect_param dis = {
            .reason_code = MQTT_DISCONNECT_NORMAL
        };
        mqtt_disconnect(&s_client, &dis);

        LOG_INF("Disconnected. Reconnecting in %us...", backoff_s);
        k_sleep(K_SECONDS(backoff_s));
        backoff_s = MIN(backoff_s * 2U, BACKOFF_MAX_S);
    }
}

/* ============================================================================
 * Public API
 * ============================================================================ */

int zplc_mqtt_init(void)
{
    k_tid_t tid = k_thread_create(
        &s_mqtt_thread, s_mqtt_stack,
        K_THREAD_STACK_SIZEOF(s_mqtt_stack),
        mqtt_client_thread,
        NULL, NULL, NULL,
        K_PRIO_COOP(8), 0, K_NO_WAIT);

    if (!tid) {
        LOG_ERR("Failed to create MQTT thread");
        return -ENOMEM;
    }

    k_thread_name_set(&s_mqtt_thread, "mqtt_client");
    return 0;
}
