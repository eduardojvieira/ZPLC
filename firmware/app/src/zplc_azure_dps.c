#include "zplc_config.h"
#include "zplc_azure_sas.h"
#include "zplc_platform_attrs.h"

#include <zephyr/fs/fs.h>
#include <zephyr/kernel.h>
#include <zephyr/net/mqtt.h>
#include <zephyr/net/socket.h>
#include <zephyr/net/tls_credentials.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_azure_dps, LOG_LEVEL_INF);

#define DPS_API_VERSION "2019-03-31"
#define DPS_SAS_KEY_NAME "registration"
#define DPS_USERNAME_MAX 256U
#define DPS_PASSWORD_MAX 512U
#define DPS_TOPIC_MAX 192U
#define DPS_TLS_CA_TAG 4101
#define DPS_RX_BUF_SIZE 1024U
#define DPS_TX_BUF_SIZE 1024U
#define DPS_PAYLOAD_MAX 768U
#define DPS_TIMEOUT_MS 30000

static struct mqtt_client s_dps_client;
static struct sockaddr_storage s_dps_broker;
static uint8_t s_dps_rx_buf[DPS_RX_BUF_SIZE];
static uint8_t s_dps_tx_buf[DPS_TX_BUF_SIZE];
static uint8_t s_dps_payload_buf[DPS_PAYLOAD_MAX];
static EXT_RAM_BSS_ATTR uint8_t s_dps_ca_buf[4096];
static struct zsock_pollfd s_dps_fds[1];
static struct k_sem s_dps_sem;
static volatile bool s_dps_connected;
static volatile bool s_dps_subscribed;
static volatile bool s_dps_done;
static volatile int s_dps_result;
static volatile bool s_dps_publish_poll;
static char s_dps_operation_id[96];
static uint32_t s_dps_retry_after_s;
static uint32_t s_dps_request_id;

typedef struct {
    int status_code;
    uint32_t retry_after_s;
    char request_id[16];
} zplc_azure_dps_topic_info_t;

typedef struct {
    char operation_id[96];
    char status[32];
    char assigned_hub[128];
    char device_id[128];
    int error_code;
} zplc_azure_dps_payload_info_t;

static int dps_parse_response_topic(const char *topic,
                                    zplc_azure_dps_topic_info_t *info);
static int dps_parse_payload(const char *payload,
                             zplc_azure_dps_payload_info_t *info);
static int dps_build_register_topic(char *buf, size_t buf_len, uint32_t rid);
static int dps_build_poll_topic(char *buf, size_t buf_len, uint32_t rid,
                                const char *operation_id);

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

static int dps_prepare_fds(struct mqtt_client *client)
{
#if defined(CONFIG_MQTT_LIB_TLS)
    s_dps_fds[0].fd = client->transport.tls.sock;
    s_dps_fds[0].events = ZSOCK_POLLIN;
    return 0;
#else
    ARG_UNUSED(client);
    return -ENOTSUP;
#endif
}

static int dps_poll_for_data(int timeout_ms)
{
    return zsock_poll(s_dps_fds, 1, timeout_ms);
}

static int dps_resolve_broker(const char *host, uint16_t port,
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

static int dps_setup_tls(struct mqtt_client *client, const char *host)
{
#if defined(CONFIG_MQTT_LIB_TLS)
    char ca_path[96];
    int ca_len;
    int rc;
    static const sec_tag_t sec_tags[] = { DPS_TLS_CA_TAG };

    zplc_config_get_mqtt_ca_cert_path(ca_path, sizeof(ca_path));
    ca_len = read_file_to_buf(ca_path, s_dps_ca_buf, sizeof(s_dps_ca_buf));
    if (ca_len <= 0) {
        return -ENOENT;
    }

    rc = tls_credential_add(DPS_TLS_CA_TAG, TLS_CREDENTIAL_CA_CERTIFICATE,
                            s_dps_ca_buf, (size_t)ca_len + 1U);
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
    return -ENOTSUP;
#endif
}

static int dps_publish_topic(struct mqtt_client *client, const char *topic,
                             const char *payload, uint16_t message_id)
{
    struct mqtt_publish_param param;

    memset(&param, 0, sizeof(param));
    param.message.topic.topic.utf8 = (const uint8_t *)topic;
    param.message.topic.topic.size = strlen(topic);
    param.message.topic.qos = MQTT_QOS_0_AT_MOST_ONCE;
    param.message.payload.data = (uint8_t *)payload;
    param.message.payload.len = strlen(payload);
    param.message_id = message_id;
    return mqtt_publish(client, &param);
}

static int dps_send_register_request(struct mqtt_client *client)
{
    char topic[DPS_TOPIC_MAX];
    uint16_t rid = ++s_dps_request_id;

    if (dps_build_register_topic(topic, sizeof(topic), rid) != 0) {
        return -ENOMEM;
    }

    return dps_publish_topic(client, topic, "{}", rid);
}

static int dps_send_poll_request(struct mqtt_client *client)
{
    char topic[DPS_TOPIC_MAX];
    uint16_t rid = ++s_dps_request_id;

    if (s_dps_operation_id[0] == '\0') {
        return -EINVAL;
    }

    if (dps_build_poll_topic(topic, sizeof(topic), rid,
                             s_dps_operation_id) != 0) {
        return -ENOMEM;
    }

    return dps_publish_topic(client, topic, "", rid);
}

static void dps_handle_publish(struct mqtt_client *client,
                               const struct mqtt_publish_param *pub)
{
    char topic[DPS_TOPIC_MAX];
    zplc_azure_dps_topic_info_t topic_info;
    zplc_azure_dps_payload_info_t payload_info;
    size_t topic_len;

    topic_len = MIN((size_t)pub->message.topic.topic.size, sizeof(topic) - 1U);
    memcpy(topic, pub->message.topic.topic.utf8, topic_len);
    topic[topic_len] = '\0';

    if (pub->message.payload.len >= sizeof(s_dps_payload_buf)) {
        s_dps_result = -EMSGSIZE;
        s_dps_done = true;
        k_sem_give(&s_dps_sem);
        return;
    }

    if (mqtt_readall_publish_payload(client, s_dps_payload_buf,
                                     pub->message.payload.len) != 0) {
        s_dps_result = -EIO;
        s_dps_done = true;
        k_sem_give(&s_dps_sem);
        return;
    }
    s_dps_payload_buf[pub->message.payload.len] = '\0';

    if (dps_parse_response_topic(topic, &topic_info) != 0) {
        return;
    }

    (void)dps_parse_payload((const char *)s_dps_payload_buf, &payload_info);

    if (topic_info.status_code == 202) {
        if (payload_info.operation_id[0] != '\0') {
            strncpy(s_dps_operation_id, payload_info.operation_id,
                    sizeof(s_dps_operation_id) - 1U);
            s_dps_operation_id[sizeof(s_dps_operation_id) - 1U] = '\0';
        }
        if (payload_info.operation_id[0] == '\0') {
            s_dps_result = -EIO;
            s_dps_done = true;
            k_sem_give(&s_dps_sem);
            return;
        }
        s_dps_retry_after_s = topic_info.retry_after_s != 0U ? topic_info.retry_after_s : 1U;
        s_dps_publish_poll = true;
        k_sem_give(&s_dps_sem);
        return;
    }

    if ((topic_info.status_code == 200 || topic_info.status_code == 201) &&
        strcmp(payload_info.status, "assigned") == 0 &&
        payload_info.assigned_hub[0] != '\0') {
        zplc_config_set_mqtt_broker(payload_info.assigned_hub);
        if (payload_info.device_id[0] != '\0') {
            zplc_config_set_mqtt_client_id(payload_info.device_id);
        }
        (void)zplc_config_save();
        s_dps_result = 0;
        s_dps_done = true;
        k_sem_give(&s_dps_sem);
        return;
    }

    if ((topic_info.status_code == 200 || topic_info.status_code == 201) &&
        payload_info.status[0] != '\0' &&
        strcmp(payload_info.status, "assigning") == 0 &&
        payload_info.operation_id[0] != '\0') {
        strncpy(s_dps_operation_id, payload_info.operation_id,
                sizeof(s_dps_operation_id) - 1U);
        s_dps_operation_id[sizeof(s_dps_operation_id) - 1U] = '\0';
        s_dps_retry_after_s = 1U;
        s_dps_publish_poll = true;
        k_sem_give(&s_dps_sem);
        return;
    }

    if (payload_info.error_code >= 0 || topic_info.status_code >= 400) {
        s_dps_result = -EACCES;
        s_dps_done = true;
        k_sem_give(&s_dps_sem);
    }
}

static void dps_evt_handler(struct mqtt_client *const client,
                            const struct mqtt_evt *evt)
{
    switch (evt->type) {
    case MQTT_EVT_CONNACK:
        s_dps_connected = (evt->result == 0);
        k_sem_give(&s_dps_sem);
        break;
    case MQTT_EVT_SUBACK:
        s_dps_subscribed = (evt->result == 0);
        k_sem_give(&s_dps_sem);
        break;
    case MQTT_EVT_PUBLISH:
        dps_handle_publish(client, &evt->param.publish);
        break;
    case MQTT_EVT_DISCONNECT:
        if (!s_dps_done) {
            s_dps_result = evt->result != 0 ? evt->result : -ECONNRESET;
            s_dps_done = true;
            k_sem_give(&s_dps_sem);
        }
        break;
    default:
        break;
    }
}

static int dps_client_init(const char *endpoint,
                           const char *registration_id,
                           const char *username,
                           const char *password)
{
    int rc;
    static struct mqtt_utf8 username_utf8;
    static struct mqtt_utf8 password_utf8;

    mqtt_client_init(&s_dps_client);
    rc = dps_resolve_broker(endpoint, 8883U, &s_dps_broker);
    if (rc != 0) {
        return rc;
    }

    s_dps_client.broker = &s_dps_broker;
    s_dps_client.evt_cb = dps_evt_handler;
    s_dps_client.client_id.utf8 = (const uint8_t *)registration_id;
    s_dps_client.client_id.size = strlen(registration_id);
    username_utf8.utf8 = (const uint8_t *)username;
    username_utf8.size = strlen(username);
    password_utf8.utf8 = (const uint8_t *)password;
    password_utf8.size = strlen(password);
    s_dps_client.user_name = &username_utf8;
    s_dps_client.password = &password_utf8;
    s_dps_client.keepalive = 60U;
    s_dps_client.protocol_version = MQTT_VERSION_3_1_1;
    s_dps_client.clean_session = 1U;
    s_dps_client.rx_buf = s_dps_rx_buf;
    s_dps_client.rx_buf_size = sizeof(s_dps_rx_buf);
    s_dps_client.tx_buf = s_dps_tx_buf;
    s_dps_client.tx_buf_size = sizeof(s_dps_tx_buf);

    rc = dps_setup_tls(&s_dps_client, endpoint);
    if (rc != 0) {
        return rc;
    }

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

static int dps_parse_response_topic(const char *topic,
                                    zplc_azure_dps_topic_info_t *info)
{
    const char *status_ptr;
    const char *rid_ptr;
    const char *retry_ptr;
    size_t rid_len;

    if (topic == NULL || info == NULL) {
        return -EINVAL;
    }

    memset(info, 0, sizeof(*info));
    status_ptr = strstr(topic, "$dps/registrations/res/");
    if (status_ptr == NULL) {
        return -EINVAL;
    }

    status_ptr += strlen("$dps/registrations/res/");
    info->status_code = atoi(status_ptr);

    rid_ptr = strstr(topic, "$rid=");
    if (rid_ptr != NULL) {
        rid_ptr += 5;
        rid_len = strcspn(rid_ptr, "&");
        if (rid_len >= sizeof(info->request_id)) {
            rid_len = sizeof(info->request_id) - 1U;
        }
        memcpy(info->request_id, rid_ptr, rid_len);
        info->request_id[rid_len] = '\0';
    }

    retry_ptr = strstr(topic, "retry-after=");
    if (retry_ptr != NULL) {
        info->retry_after_s = (uint32_t)strtoul(retry_ptr + strlen("retry-after="), NULL, 10);
    }

    return 0;
}

static int dps_parse_payload(const char *payload,
                             zplc_azure_dps_payload_info_t *info)
{
    if (payload == NULL || info == NULL) {
        return -EINVAL;
    }

    memset(info, 0, sizeof(*info));
    info->error_code = -1;
    (void)json_extract_string(payload, "operationId", info->operation_id,
                              sizeof(info->operation_id));
    (void)json_extract_string(payload, "status", info->status,
                              sizeof(info->status));
    (void)json_extract_string(payload, "assignedHub", info->assigned_hub,
                              sizeof(info->assigned_hub));
    (void)json_extract_string(payload, "deviceId", info->device_id,
                              sizeof(info->device_id));
    (void)json_extract_int(payload, "errorCode", &info->error_code);

    return 0;
}

static int dps_build_username(char *buf, size_t buf_len,
                              const char *id_scope,
                              const char *registration_id)
{
    int n = snprintf(buf, buf_len, "%s/registrations/%s/api-version=%s",
                     id_scope, registration_id, DPS_API_VERSION);
    if (n < 0 || (size_t)n >= buf_len) {
        return -ENOMEM;
    }

    return 0;
}

static int dps_build_password(char *buf, size_t buf_len,
                              const char *id_scope,
                              const char *registration_id,
                              const char *sas_key_b64,
                              uint32_t expiry_s)
{
    char resource[192];
    int n = snprintf(resource, sizeof(resource), "%s/registrations/%s",
                     id_scope, registration_id);
    if (n < 0 || (size_t)n >= sizeof(resource)) {
        return -ENOMEM;
    }

    return zplc_azure_sas_generate_resource(resource, sas_key_b64, expiry_s,
                                            DPS_SAS_KEY_NAME, buf, buf_len);
}

static int dps_build_register_topic(char *buf, size_t buf_len, uint32_t rid)
{
    int n = snprintf(buf, buf_len,
                     "$dps/registrations/PUT/iotdps-register/?$rid=%u", rid);
    if (n < 0 || (size_t)n >= buf_len) {
        return -ENOMEM;
    }
    return 0;
}

static int dps_build_poll_topic(char *buf, size_t buf_len, uint32_t rid,
                                const char *operation_id)
{
    int n = snprintf(buf, buf_len,
                     "$dps/registrations/GET/iotdps-get-operationstatus/?$rid=%u&operationId=%s",
                     rid, operation_id);
    if (n < 0 || (size_t)n >= buf_len) {
        return -ENOMEM;
    }
    return 0;
}

int zplc_azure_dps_provision(void)
{
    char endpoint[128];
    char scope[64];
    char registration_id[128];
    char sas_key[96];
    char username[DPS_USERNAME_MAX];
    char password[DPS_PASSWORD_MAX];
    char register_topic[DPS_TOPIC_MAX];
    char poll_topic[DPS_TOPIC_MAX];
    zplc_azure_dps_topic_info_t topic_info;
    zplc_azure_dps_payload_info_t payload_info;
    struct mqtt_topic sub_topic;
    struct mqtt_subscription_list sub_list;
    int rc;
    int64_t deadline;

    if (!zplc_config_get_azure_dps_enabled()) {
        return -ENOTSUP;
    }

    zplc_config_get_azure_dps_endpoint(endpoint, sizeof(endpoint));
    zplc_config_get_azure_dps_id_scope(scope, sizeof(scope));
    zplc_config_get_azure_dps_registration_id(registration_id, sizeof(registration_id));
    zplc_config_get_azure_sas_key(sas_key, sizeof(sas_key));
    if (endpoint[0] == '\0' || scope[0] == '\0' || registration_id[0] == '\0' ||
        sas_key[0] == '\0') {
        return -EINVAL;
    }

    if (dps_build_username(username, sizeof(username), scope, registration_id) < 0) {
        return -ENOMEM;
    }

    if (dps_build_password(password, sizeof(password), scope, registration_id,
                           sas_key, zplc_config_get_azure_sas_expiry_s()) < 0) {
        return -EACCES;
    }

    k_sem_init(&s_dps_sem, 0, 1);
    s_dps_connected = false;
    s_dps_subscribed = false;
    s_dps_done = false;
    s_dps_result = -ETIMEDOUT;
    s_dps_publish_poll = false;
    s_dps_operation_id[0] = '\0';
    s_dps_retry_after_s = 0U;
    s_dps_request_id = 0U;

    rc = dps_client_init(endpoint, registration_id, username, password);
    if (rc != 0) {
        return rc;
    }

    rc = mqtt_connect(&s_dps_client);
    if (rc != 0) {
        return rc;
    }

    dps_prepare_fds(&s_dps_client);
    deadline = k_uptime_get() + DPS_TIMEOUT_MS;
    while (!s_dps_connected && k_uptime_get() < deadline) {
        if (dps_poll_for_data(250) > 0) {
            (void)mqtt_input(&s_dps_client);
        }
    }
    if (!s_dps_connected) {
        mqtt_abort(&s_dps_client);
        return -ETIMEDOUT;
    }

    sub_topic.topic.utf8 = (const uint8_t *)"$dps/registrations/res/#";
    sub_topic.topic.size = strlen((const char *)sub_topic.topic.utf8);
    sub_topic.qos = MQTT_QOS_0_AT_MOST_ONCE;
    memset(&sub_list, 0, sizeof(sub_list));
    sub_list.list = &sub_topic;
    sub_list.list_count = 1U;
    sub_list.message_id = 0xD501U;
    rc = mqtt_subscribe(&s_dps_client, &sub_list);
    if (rc != 0) {
        mqtt_abort(&s_dps_client);
        return rc;
    }

    while (!s_dps_subscribed && k_uptime_get() < deadline) {
        if (dps_poll_for_data(250) > 0) {
            (void)mqtt_input(&s_dps_client);
        }
    }
    if (!s_dps_subscribed) {
        mqtt_abort(&s_dps_client);
        return -ETIMEDOUT;
    }

    rc = dps_send_register_request(&s_dps_client);
    if (rc != 0) {
        mqtt_abort(&s_dps_client);
        return rc;
    }

    if (dps_build_register_topic(register_topic, sizeof(register_topic), 1U) < 0) {
        return -ENOMEM;
    }

    dps_parse_response_topic("$dps/registrations/res/202/?$rid=1&retry-after=3",
                             &topic_info);
    dps_parse_payload("{\"operationId\":\"op-1\",\"status\":\"assigning\"}",
                      &payload_info);
    if (payload_info.operation_id[0] != '\0') {
        (void)dps_build_poll_topic(poll_topic, sizeof(poll_topic), 2U,
                                   payload_info.operation_id);
    } else {
        poll_topic[0] = '\0';
    }

    LOG_INF("Azure DPS bootstrap prepared for %s", endpoint);
    LOG_INF("DPS register topic: %s", register_topic);
    if (poll_topic[0] != '\0') {
        LOG_INF("DPS poll topic template: %s", poll_topic);
    }

    while (!s_dps_done && k_uptime_get() < deadline) {
        int poll_rc = dps_poll_for_data(250);
        if (poll_rc > 0) {
            (void)mqtt_input(&s_dps_client);
        }

        if (s_dps_publish_poll) {
            s_dps_publish_poll = false;
            if (k_uptime_get() + ((int64_t)MAX(s_dps_retry_after_s, 1U) * 1000LL) >= deadline) {
                break;
            }
            k_sleep(K_SECONDS(MAX(s_dps_retry_after_s, 1U)));
            rc = dps_send_poll_request(&s_dps_client);
            if (rc != 0) {
                s_dps_result = rc;
                s_dps_done = true;
            }
        }

        (void)mqtt_live(&s_dps_client);
    }

    mqtt_abort(&s_dps_client);
    return s_dps_done ? s_dps_result : -ETIMEDOUT;
}
