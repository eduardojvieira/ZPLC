#include "zplc_config.h"

#include <zplc_hal.h>

#include <zephyr/fs/fs.h>
#include <zephyr/kernel.h>
#include <zephyr/net/mqtt.h>
#include <zephyr/net/socket.h>
#include <zephyr/net/tls_credentials.h>
#include <esp_attr.h>

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_aws_fleet, LOG_LEVEL_INF);

#define AWS_TOPIC_MAX 256U
#define AWS_TEMPLATE_MAX 96U
#define AWS_PEM_MAX 4096U
#define AWS_KEY_MAX 4096U

#define AWS_FLEET_CERT_PERSIST_KEY "aws_cert_pem"
#define AWS_FLEET_KEY_PERSIST_KEY "aws_key_pem"
#define AWS_FLEET_CERT_PERSIST_PATH "persist://aws_cert_pem"
#define AWS_FLEET_KEY_PERSIST_PATH "persist://aws_key_pem"
#define AWS_FLEET_CA_TAG 4201
#define AWS_FLEET_CERT_TAG 4202
#define AWS_FLEET_KEY_TAG 4203
#define AWS_FLEET_RX_BUF_SIZE 1536U
#define AWS_FLEET_TX_BUF_SIZE 1536U
#define AWS_FLEET_PAYLOAD_MAX 4096U
#define AWS_FLEET_TIMEOUT_MS 30000

static struct mqtt_client s_aws_client;
static struct sockaddr_storage s_aws_broker;
static uint8_t s_aws_rx_buf[AWS_FLEET_RX_BUF_SIZE];
static uint8_t s_aws_tx_buf[AWS_FLEET_TX_BUF_SIZE];
static EXT_RAM_BSS_ATTR uint8_t s_aws_payload_buf[AWS_FLEET_PAYLOAD_MAX];
static EXT_RAM_BSS_ATTR uint8_t s_aws_ca_buf[4096];
static EXT_RAM_BSS_ATTR uint8_t s_aws_cert_buf[4096];
static EXT_RAM_BSS_ATTR uint8_t s_aws_key_buf[4096];
static struct zsock_pollfd s_aws_fds[1];
static struct k_sem s_aws_sem;
static volatile bool s_aws_connected;
static volatile bool s_aws_subscribed;
static volatile bool s_aws_done;
static volatile int s_aws_result;
static volatile bool s_aws_register_ready;
static uint16_t s_aws_message_id;

typedef struct {
    char certificate_id[128];
    char certificate_pem[AWS_PEM_MAX];
    char private_key[AWS_KEY_MAX];
    char ownership_token[512];
    char thing_name[128];
    int status_code;
    char error_code[64];
    char error_message[192];
} zplc_aws_fleet_payload_t;

static EXT_RAM_BSS_ATTR zplc_aws_fleet_payload_t s_aws_create_payload;
static EXT_RAM_BSS_ATTR zplc_aws_fleet_payload_t s_aws_register_payload;

static int read_file_to_buf(const char *path, uint8_t *buf, size_t buf_len)
{
    struct fs_file_t file;
    ssize_t rd;
    int rc;

    fs_file_t_init(&file);
    rc = fs_open(&file, path, FS_O_READ);
    if (rc < 0) {
        return rc;
    }

    rd = fs_read(&file, buf, buf_len - 1U);
    (void)fs_close(&file);
    if (rd < 0) {
        return (int)rd;
    }

    buf[rd] = '\0';
    return (int)rd;
}

static int json_extract_string_unescaped(const char *json, const char *key,
                                         char *out, size_t out_len)
{
    char needle[64];
    const char *start;
    size_t out_pos = 0U;

    snprintf(needle, sizeof(needle), "\"%s\"", key);
    start = strstr(json, needle);
    if (start == NULL) {
        return -ENOENT;
    }

    start = strchr(start + strlen(needle), ':');
    if (start == NULL) {
        return -EINVAL;
    }

    start = strchr(start, '"');
    if (start == NULL) {
        return -EINVAL;
    }
    start++;

    while (*start != '\0') {
        if (*start == '"') {
            break;
        }

        if (*start == '\\') {
            start++;
            if (*start == 'n') {
                if (out_pos + 1U >= out_len) {
                    return -ENOMEM;
                }
                out[out_pos++] = '\n';
                start++;
                continue;
            }
            if (*start == '\\' || *start == '"' || *start == '/') {
                if (out_pos + 1U >= out_len) {
                    return -ENOMEM;
                }
                out[out_pos++] = *start++;
                continue;
            }
        }

        if (out_pos + 1U >= out_len) {
            return -ENOMEM;
        }
        out[out_pos++] = *start++;
    }

    out[out_pos] = '\0';
    return 0;
}

static int json_extract_string(const char *json, const char *key,
                               char *out, size_t out_len)
{
    char needle[64];
    const char *start;
    const char *end;
    size_t len;

    if (json == NULL || key == NULL || out == NULL || out_len == 0U) {
        return -EINVAL;
    }

    snprintf(needle, sizeof(needle), "\"%s\"", key);
    start = strstr(json, needle);
    if (start == NULL) {
        return -ENOENT;
    }

    start = strchr(start + strlen(needle), ':');
    if (start == NULL) {
        return -EINVAL;
    }

    start = strchr(start, '"');
    if (start == NULL) {
        return -EINVAL;
    }
    start++;
    end = strchr(start, '"');
    if (end == NULL) {
        return -EINVAL;
    }

    len = (size_t)(end - start);
    if (len >= out_len) {
        return -ENOMEM;
    }

    memcpy(out, start, len);
    out[len] = '\0';
    return 0;
}

static int json_extract_int(const char *json, const char *key, int *out)
{
    char needle[64];
    const char *start;

    if (json == NULL || key == NULL || out == NULL) {
        return -EINVAL;
    }

    snprintf(needle, sizeof(needle), "\"%s\"", key);
    start = strstr(json, needle);
    if (start == NULL) {
        return -ENOENT;
    }

    start = strchr(start + strlen(needle), ':');
    if (start == NULL) {
        return -EINVAL;
    }

    *out = atoi(start + 1);
    return 0;
}

static int aws_prepare_fds(struct mqtt_client *client)
{
#if defined(CONFIG_MQTT_LIB_TLS)
    s_aws_fds[0].fd = client->transport.tls.sock;
    s_aws_fds[0].events = ZSOCK_POLLIN;
    return 0;
#else
    ARG_UNUSED(client);
    return -ENOTSUP;
#endif
}

static int aws_poll_for_data(int timeout_ms)
{
    return zsock_poll(s_aws_fds, 1, timeout_ms);
}

static int aws_resolve_broker(const char *host, uint16_t port,
                              struct sockaddr_storage *out)
{
    struct zsock_addrinfo hints = {
        .ai_family = AF_INET,
        .ai_socktype = SOCK_STREAM,
        .ai_protocol = IPPROTO_TCP,
    };
    struct zsock_addrinfo *res = NULL;
    char port_str[8];

    snprintf(port_str, sizeof(port_str), "%u", (unsigned int)port);
    if (zsock_getaddrinfo(host, port_str, &hints, &res) != 0 || res == NULL) {
        return -EHOSTUNREACH;
    }

    memcpy(out, res->ai_addr, sizeof(struct sockaddr_in));
    zsock_freeaddrinfo(res);
    return 0;
}

static int aws_setup_tls(struct mqtt_client *client, const char *host,
                         const char *ca_path, const char *claim_cert_path,
                         const char *claim_key_path)
{
#if defined(CONFIG_MQTT_LIB_TLS)
    int ca_len;
    int cert_len;
    int key_len;
    int rc;
    static const sec_tag_t sec_tags[] = {
        AWS_FLEET_CA_TAG,
        AWS_FLEET_CERT_TAG,
        AWS_FLEET_KEY_TAG,
    };

    ca_len = read_file_to_buf(ca_path, s_aws_ca_buf, sizeof(s_aws_ca_buf));
    cert_len = read_file_to_buf(claim_cert_path, s_aws_cert_buf, sizeof(s_aws_cert_buf));
    key_len = read_file_to_buf(claim_key_path, s_aws_key_buf, sizeof(s_aws_key_buf));
    if (ca_len <= 0 || cert_len <= 0 || key_len <= 0) {
        return -ENOENT;
    }

    rc = tls_credential_add(AWS_FLEET_CA_TAG, TLS_CREDENTIAL_CA_CERTIFICATE,
                            s_aws_ca_buf, (size_t)ca_len + 1U);
    if (rc < 0 && rc != -EEXIST) {
        return rc;
    }
    rc = tls_credential_add(AWS_FLEET_CERT_TAG, TLS_CREDENTIAL_SERVER_CERTIFICATE,
                            s_aws_cert_buf, (size_t)cert_len + 1U);
    if (rc < 0 && rc != -EEXIST) {
        return rc;
    }
    rc = tls_credential_add(AWS_FLEET_KEY_TAG, TLS_CREDENTIAL_PRIVATE_KEY,
                            s_aws_key_buf, (size_t)key_len + 1U);
    if (rc < 0 && rc != -EEXIST) {
        return rc;
    }

    client->transport.type = MQTT_TRANSPORT_SECURE;
    client->transport.tls.config.peer_verify = TLS_PEER_VERIFY_REQUIRED;
    client->transport.tls.config.cipher_list = NULL;
    client->transport.tls.config.sec_tag_list = sec_tags;
    client->transport.tls.config.sec_tag_count = ARRAY_SIZE(sec_tags);
    client->transport.tls.config.hostname = host;
    return 0;
#else
    ARG_UNUSED(client);
    ARG_UNUSED(host);
    ARG_UNUSED(ca_path);
    ARG_UNUSED(claim_cert_path);
    ARG_UNUSED(claim_key_path);
    return -ENOTSUP;
#endif
}

static int aws_publish_topic(struct mqtt_client *client, const char *topic,
                             const char *payload)
{
    struct mqtt_publish_param param;

    memset(&param, 0, sizeof(param));
    param.message.topic.topic.utf8 = (const uint8_t *)topic;
    param.message.topic.topic.size = strlen(topic);
    param.message.topic.qos = MQTT_QOS_0_AT_MOST_ONCE;
    param.message.payload.data = (uint8_t *)payload;
    param.message.payload.len = strlen(payload);
    param.message_id = ++s_aws_message_id;
    return mqtt_publish(client, &param);
}

static int aws_build_create_cert_topic(char *buf, size_t buf_len, bool accepted)
{
    int n = snprintf(buf, buf_len, "$aws/certificates/create/json/%s",
                     accepted ? "accepted" : "rejected");
    if (n < 0 || (size_t)n >= buf_len) {
        return -ENOMEM;
    }
    return 0;
}

static int aws_build_register_topic(char *buf, size_t buf_len,
                                    const char *template_name, bool accepted)
{
    int n;

    if (template_name == NULL || template_name[0] == '\0') {
        return -EINVAL;
    }

    n = snprintf(buf, buf_len,
                 "$aws/provisioning-templates/%s/provision/json/%s",
                 template_name, accepted ? "accepted" : "rejected");
    if (n < 0 || (size_t)n >= buf_len) {
        return -ENOMEM;
    }
    return 0;
}

static int aws_parse_create_cert_payload(const char *json,
                                         zplc_aws_fleet_payload_t *payload)
{
    if (json == NULL || payload == NULL) {
        return -EINVAL;
    }

    memset(payload, 0, sizeof(*payload));
    payload->status_code = -1;
    (void)json_extract_string_unescaped(json, "certificateId", payload->certificate_id,
                              sizeof(payload->certificate_id));
    (void)json_extract_string_unescaped(json, "certificatePem", payload->certificate_pem,
                              sizeof(payload->certificate_pem));
    (void)json_extract_string_unescaped(json, "privateKey", payload->private_key,
                              sizeof(payload->private_key));
    (void)json_extract_string_unescaped(json, "certificateOwnershipToken",
                              payload->ownership_token,
                              sizeof(payload->ownership_token));
    (void)json_extract_string_unescaped(json, "errorCode", payload->error_code,
                              sizeof(payload->error_code));
    (void)json_extract_string_unescaped(json, "errorMessage", payload->error_message,
                              sizeof(payload->error_message));
    (void)json_extract_int(json, "statusCode", &payload->status_code);
    return 0;
}

static int aws_parse_register_payload(const char *json,
                                      zplc_aws_fleet_payload_t *payload)
{
    if (json == NULL || payload == NULL) {
        return -EINVAL;
    }

    memset(payload, 0, sizeof(*payload));
    payload->status_code = -1;
    (void)json_extract_string_unescaped(json, "thingName", payload->thing_name,
                              sizeof(payload->thing_name));
    (void)json_extract_string_unescaped(json, "errorCode", payload->error_code,
                              sizeof(payload->error_code));
    (void)json_extract_string_unescaped(json, "errorMessage", payload->error_message,
                              sizeof(payload->error_message));
    (void)json_extract_int(json, "statusCode", &payload->status_code);
    return 0;
}

static int aws_persist_device_material(const zplc_aws_fleet_payload_t *payload)
{
    if (payload == NULL || payload->certificate_pem[0] == '\0' ||
        payload->private_key[0] == '\0') {
        return -EINVAL;
    }

    if (zplc_hal_persist_save(AWS_FLEET_CERT_PERSIST_KEY, payload->certificate_pem,
                              strlen(payload->certificate_pem) + 1U) != ZPLC_HAL_OK) {
        return -EIO;
    }

    if (zplc_hal_persist_save(AWS_FLEET_KEY_PERSIST_KEY, payload->private_key,
                              strlen(payload->private_key) + 1U) != ZPLC_HAL_OK) {
        return -EIO;
    }

    return 0;
}

static int aws_build_create_request_topic(char *buf, size_t buf_len)
{
    int n = snprintf(buf, buf_len, "$aws/certificates/create/json");
    if (n < 0 || (size_t)n >= buf_len) {
        return -ENOMEM;
    }
    return 0;
}

static int aws_build_register_request_topic(char *buf, size_t buf_len,
                                            const char *template_name)
{
    int n = snprintf(buf, buf_len,
                     "$aws/provisioning-templates/%s/provision/json",
                     template_name);
    if (n < 0 || (size_t)n >= buf_len) {
        return -ENOMEM;
    }
    return 0;
}

static int aws_build_register_payload(char *buf, size_t buf_len,
                                      const char *ownership_token)
{
    char hostname[64];
    int n;

    zplc_config_get_hostname(hostname, sizeof(hostname));
    n = snprintf(buf, buf_len,
                 "{\"certificateOwnershipToken\":\"%s\",\"parameters\":{\"DeviceId\":\"%s\",\"SerialNumber\":\"%s\"}}",
                 ownership_token, hostname, hostname);
    if (n < 0 || (size_t)n >= buf_len) {
        return -ENOMEM;
    }
    return 0;
}

static void aws_handle_publish(struct mqtt_client *client,
                               const struct mqtt_publish_param *pub)
{
    char topic[AWS_TOPIC_MAX];
    size_t topic_len = MIN((size_t)pub->message.topic.topic.size, sizeof(topic) - 1U);

    memcpy(topic, pub->message.topic.topic.utf8, topic_len);
    topic[topic_len] = '\0';

    if (pub->message.payload.len >= sizeof(s_aws_payload_buf)) {
        s_aws_result = -EMSGSIZE;
        s_aws_done = true;
        k_sem_give(&s_aws_sem);
        return;
    }

    if (mqtt_readall_publish_payload(client, s_aws_payload_buf,
                                     pub->message.payload.len) != 0) {
        s_aws_result = -EIO;
        s_aws_done = true;
        k_sem_give(&s_aws_sem);
        return;
    }
    s_aws_payload_buf[pub->message.payload.len] = '\0';

    if (strstr(topic, "/create/json/accepted") != NULL) {
        (void)aws_parse_create_cert_payload((const char *)s_aws_payload_buf,
                                            &s_aws_create_payload);
        if (s_aws_create_payload.ownership_token[0] != '\0') {
            s_aws_register_ready = true;
            k_sem_give(&s_aws_sem);
        } else {
            s_aws_result = -EIO;
            s_aws_done = true;
            k_sem_give(&s_aws_sem);
        }
        return;
    }

    if (strstr(topic, "/create/json/rejected") != NULL) {
        s_aws_result = -EACCES;
        s_aws_done = true;
        k_sem_give(&s_aws_sem);
        return;
    }

    if (strstr(topic, "/provision/json/accepted") != NULL) {
        (void)aws_parse_register_payload((const char *)s_aws_payload_buf,
                                         &s_aws_register_payload);
        s_aws_result = aws_persist_device_material(&s_aws_create_payload);
        if (s_aws_result == 0) {
            if (s_aws_register_payload.thing_name[0] != '\0') {
                zplc_config_set_mqtt_client_id(s_aws_register_payload.thing_name);
            }
            zplc_config_set_mqtt_client_cert_path(AWS_FLEET_CERT_PERSIST_PATH);
            zplc_config_set_mqtt_client_key_path(AWS_FLEET_KEY_PERSIST_PATH);
            zplc_config_set_mqtt_security(ZPLC_MQTT_SECURITY_TLS_MUTUAL);
            zplc_config_set_aws_fleet_enabled(false);
            (void)zplc_config_save();
            s_aws_done = true;
        }
        k_sem_give(&s_aws_sem);
        return;
    }

    if (strstr(topic, "/provision/json/rejected") != NULL) {
        s_aws_result = -EACCES;
        s_aws_done = true;
        k_sem_give(&s_aws_sem);
    }
}

static void aws_evt_handler(struct mqtt_client *const client,
                            const struct mqtt_evt *evt)
{
    switch (evt->type) {
    case MQTT_EVT_CONNACK:
        s_aws_connected = (evt->result == 0);
        k_sem_give(&s_aws_sem);
        break;
    case MQTT_EVT_SUBACK:
        s_aws_subscribed = (evt->result == 0);
        k_sem_give(&s_aws_sem);
        break;
    case MQTT_EVT_PUBLISH:
        aws_handle_publish(client, &evt->param.publish);
        break;
    case MQTT_EVT_DISCONNECT:
        if (!s_aws_done) {
            s_aws_result = evt->result != 0 ? evt->result : -ECONNRESET;
            s_aws_done = true;
            k_sem_give(&s_aws_sem);
        }
        break;
    default:
        break;
    }
}

static int aws_client_init(const char *host, const char *ca_path,
                           const char *claim_cert_path, const char *claim_key_path)
{
    int rc;
    char client_id[64];

    mqtt_client_init(&s_aws_client);
    rc = aws_resolve_broker(host, zplc_config_get_mqtt_port(), &s_aws_broker);
    if (rc != 0) {
        return rc;
    }

    zplc_config_get_hostname(client_id, sizeof(client_id));
    s_aws_client.broker = &s_aws_broker;
    s_aws_client.evt_cb = aws_evt_handler;
    s_aws_client.client_id.utf8 = (const uint8_t *)client_id;
    s_aws_client.client_id.size = strlen(client_id);
    s_aws_client.keepalive = 60U;
    s_aws_client.protocol_version = MQTT_VERSION_3_1_1;
    s_aws_client.clean_session = 1U;
    s_aws_client.rx_buf = s_aws_rx_buf;
    s_aws_client.rx_buf_size = sizeof(s_aws_rx_buf);
    s_aws_client.tx_buf = s_aws_tx_buf;
    s_aws_client.tx_buf_size = sizeof(s_aws_tx_buf);

    return aws_setup_tls(&s_aws_client, host, ca_path, claim_cert_path, claim_key_path);
}

bool zplc_aws_fleet_is_provisioned(void)
{
    char cert_buf[16];
    char key_buf[16];
    char cert_path[96];
    char key_path[96];

    zplc_config_get_mqtt_client_cert_path(cert_path, sizeof(cert_path));
    zplc_config_get_mqtt_client_key_path(key_path, sizeof(key_path));
    if (zplc_hal_persist_load(AWS_FLEET_CERT_PERSIST_KEY, cert_buf, sizeof(cert_buf)) == ZPLC_HAL_OK &&
        zplc_hal_persist_load(AWS_FLEET_KEY_PERSIST_KEY, key_buf, sizeof(key_buf)) == ZPLC_HAL_OK) {
        return true;
    }

    return cert_path[0] != '\0' && key_path[0] != '\0' && !zplc_config_get_aws_fleet_enabled();
}

int zplc_aws_fleet_provision(void)
{
    char broker[128];
    char ca_path[96];
    char claim_cert_path[96];
    char claim_key_path[96];
    char template_name[AWS_TEMPLATE_MAX];
    char create_request[AWS_TOPIC_MAX];
    char create_accepted[AWS_TOPIC_MAX];
    char create_rejected[AWS_TOPIC_MAX];
    char register_request[AWS_TOPIC_MAX];
    char register_accepted[AWS_TOPIC_MAX];
    char register_rejected[AWS_TOPIC_MAX];
    char register_payload[768];
    struct mqtt_topic topics[4];
    struct mqtt_subscription_list sub_list;
    int rc;
    int64_t deadline;

    if (!zplc_config_get_aws_fleet_enabled()) {
        return -ENOTSUP;
    }

    if (zplc_aws_fleet_is_provisioned()) {
        return 0;
    }

    zplc_config_get_mqtt_broker(broker, sizeof(broker));
    zplc_config_get_mqtt_ca_cert_path(ca_path, sizeof(ca_path));
    zplc_config_get_aws_claim_cert_path(claim_cert_path, sizeof(claim_cert_path));
    zplc_config_get_aws_claim_key_path(claim_key_path, sizeof(claim_key_path));
    zplc_config_get_aws_fleet_template_name(template_name, sizeof(template_name));
    if (broker[0] == '\0' || ca_path[0] == '\0' || claim_cert_path[0] == '\0' ||
        claim_key_path[0] == '\0' || template_name[0] == '\0') {
        return -EINVAL;
    }

    if (aws_build_create_request_topic(create_request, sizeof(create_request)) < 0 ||
        aws_build_create_cert_topic(create_accepted, sizeof(create_accepted), true) < 0 ||
        aws_build_create_cert_topic(create_rejected, sizeof(create_rejected), false) < 0 ||
        aws_build_register_request_topic(register_request, sizeof(register_request), template_name) < 0 ||
        aws_build_register_topic(register_accepted, sizeof(register_accepted), template_name, true) < 0 ||
        aws_build_register_topic(register_rejected, sizeof(register_rejected), template_name, false) < 0) {
        return -ENOMEM;
    }

    k_sem_init(&s_aws_sem, 0, 1);
    s_aws_connected = false;
    s_aws_subscribed = false;
    s_aws_done = false;
    s_aws_result = -ETIMEDOUT;
    s_aws_register_ready = false;
    s_aws_message_id = 0U;
    memset(&s_aws_create_payload, 0, sizeof(s_aws_create_payload));
    memset(&s_aws_register_payload, 0, sizeof(s_aws_register_payload));

    rc = aws_client_init(broker, ca_path, claim_cert_path, claim_key_path);
    if (rc != 0) {
        return rc;
    }

    rc = mqtt_connect(&s_aws_client);
    if (rc != 0) {
        return rc;
    }

    rc = aws_prepare_fds(&s_aws_client);
    if (rc != 0) {
        return rc;
    }

    deadline = k_uptime_get() + AWS_FLEET_TIMEOUT_MS;
    while (!s_aws_connected && k_uptime_get() < deadline) {
        if (aws_poll_for_data(250) > 0) {
            (void)mqtt_input(&s_aws_client);
        }
    }
    if (!s_aws_connected) {
        mqtt_abort(&s_aws_client);
        return -ETIMEDOUT;
    }

    memset(&topics, 0, sizeof(topics));
    topics[0].topic.utf8 = (const uint8_t *)create_accepted;
    topics[0].topic.size = strlen(create_accepted);
    topics[0].qos = MQTT_QOS_0_AT_MOST_ONCE;
    topics[1].topic.utf8 = (const uint8_t *)create_rejected;
    topics[1].topic.size = strlen(create_rejected);
    topics[1].qos = MQTT_QOS_0_AT_MOST_ONCE;
    topics[2].topic.utf8 = (const uint8_t *)register_accepted;
    topics[2].topic.size = strlen(register_accepted);
    topics[2].qos = MQTT_QOS_0_AT_MOST_ONCE;
    topics[3].topic.utf8 = (const uint8_t *)register_rejected;
    topics[3].topic.size = strlen(register_rejected);
    topics[3].qos = MQTT_QOS_0_AT_MOST_ONCE;

    memset(&sub_list, 0, sizeof(sub_list));
    sub_list.list = topics;
    sub_list.list_count = ARRAY_SIZE(topics);
    sub_list.message_id = 0xA601U;
    rc = mqtt_subscribe(&s_aws_client, &sub_list);
    if (rc != 0) {
        mqtt_abort(&s_aws_client);
        return rc;
    }

    while (!s_aws_subscribed && k_uptime_get() < deadline) {
        if (aws_poll_for_data(250) > 0) {
            (void)mqtt_input(&s_aws_client);
        }
    }
    if (!s_aws_subscribed) {
        mqtt_abort(&s_aws_client);
        return -ETIMEDOUT;
    }

    rc = aws_publish_topic(&s_aws_client, create_request, "{}");
    if (rc != 0) {
        mqtt_abort(&s_aws_client);
        return rc;
    }

    LOG_INF("AWS Fleet create accepted topic: %s", create_accepted);
    LOG_INF("AWS Fleet create rejected topic: %s", create_rejected);
    LOG_INF("AWS Fleet register accepted topic: %s", register_accepted);
    LOG_INF("AWS Fleet register rejected topic: %s", register_rejected);

    while (!s_aws_done && k_uptime_get() < deadline) {
        if (aws_poll_for_data(250) > 0) {
            (void)mqtt_input(&s_aws_client);
        }

        if (s_aws_register_ready) {
            s_aws_register_ready = false;
            if (aws_build_register_payload(register_payload, sizeof(register_payload),
                                           s_aws_create_payload.ownership_token) != 0) {
                s_aws_result = -ENOMEM;
                s_aws_done = true;
                break;
            }
            rc = aws_publish_topic(&s_aws_client, register_request, register_payload);
            if (rc != 0) {
                s_aws_result = rc;
                s_aws_done = true;
                break;
            }
        }

        (void)mqtt_live(&s_aws_client);
    }

    mqtt_abort(&s_aws_client);
    return s_aws_done ? s_aws_result : -ETIMEDOUT;
}
