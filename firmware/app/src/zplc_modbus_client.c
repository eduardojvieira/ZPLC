#include "zplc_config.h"

#include <zplc_core.h>
#include <zplc_isa.h>

#include <zephyr/devicetree.h>
#include <zephyr/kernel.h>
#include <zephyr/modbus/modbus.h>
#include <zephyr/net/socket.h>
#include <zephyr/sys/byteorder.h>

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/logging/log.h>
LOG_MODULE_REGISTER(zplc_modbus_client, LOG_LEVEL_INF);

#define ZPLC_MODBUS_TCP_MBAP_LEN 7U
#define ZPLC_MODBUS_TCP_MAX_PDU 253U
#define ZPLC_MODBUS_TCP_MAX_ADU (ZPLC_MODBUS_TCP_MBAP_LEN + ZPLC_MODBUS_TCP_MAX_PDU)

#define FC_READ_COILS 0x01U
#define FC_READ_HOLDING_REGISTERS 0x03U
#define FC_WRITE_SINGLE_COIL 0x05U
#define FC_WRITE_SINGLE_REGISTER 0x06U
#define FC_WRITE_MULTIPLE_REGISTERS 0x10U

#if DT_HAS_COMPAT_STATUS_OKAY(zephyr_modbus_serial)
#define ZPLC_MODBUS_RTU_NODE DT_COMPAT_GET_ANY_STATUS_OKAY(zephyr_modbus_serial)
#define ZPLC_HAS_MODBUS_RTU 1
#else
#define ZPLC_HAS_MODBUS_RTU 0
#endif

static struct k_thread s_rtu_client_thread;
static struct k_thread s_tcp_client_thread;
static K_THREAD_STACK_DEFINE(s_rtu_client_stack, 2048);
static K_THREAD_STACK_DEFINE(s_tcp_client_stack, 3072);

static int s_rtu_client_iface = -ENODEV;
static uint16_t s_tcp_transaction_id;

static uint16_t modbus_register_width(zplc_data_type_t type)
{
    switch (type) {
    case ZPLC_TYPE_REAL:
    case ZPLC_TYPE_DINT:
    case ZPLC_TYPE_UDINT:
    case ZPLC_TYPE_DWORD:
        return 2U;
    default:
        return 1U;
    }
}

static void mem_write_val(uint16_t addr, zplc_data_type_t type, uint32_t val)
{
    uint16_t base = addr & 0xF000U;
    uint16_t offset = addr & 0x0FFFU;
    uint8_t *region;

    if (base == 0x2000U || base == 0x3000U) {
        base = 0x2000U;
    }

    region = zplc_mem_get_region(base);
    if (region == NULL) {
        return;
    }

    switch (type) {
    case ZPLC_TYPE_BOOL:
    case ZPLC_TYPE_SINT:
    case ZPLC_TYPE_USINT:
    case ZPLC_TYPE_BYTE:
        region[offset] = (uint8_t)(val & 0xFFU);
        break;
    case ZPLC_TYPE_INT:
    case ZPLC_TYPE_UINT:
    case ZPLC_TYPE_WORD:
        region[offset] = (uint8_t)(val & 0xFFU);
        region[offset + 1U] = (uint8_t)((val >> 8) & 0xFFU);
        break;
    case ZPLC_TYPE_REAL:
    case ZPLC_TYPE_DINT:
    case ZPLC_TYPE_UDINT:
    case ZPLC_TYPE_DWORD:
        region[offset] = (uint8_t)(val & 0xFFU);
        region[offset + 1U] = (uint8_t)((val >> 8) & 0xFFU);
        region[offset + 2U] = (uint8_t)((val >> 16) & 0xFFU);
        region[offset + 3U] = (uint8_t)((val >> 24) & 0xFFU);
        break;
    default:
        break;
    }
}

static enum uart_config_parity zplc_modbus_parity_to_uart(zplc_modbus_parity_t parity)
{
    switch (parity) {
    case ZPLC_MODBUS_PARITY_EVEN:
        return UART_CFG_PARITY_EVEN;
    case ZPLC_MODBUS_PARITY_ODD:
        return UART_CFG_PARITY_ODD;
    case ZPLC_MODBUS_PARITY_NONE:
    default:
        return UART_CFG_PARITY_NONE;
    }
}

static int zplc_modbus_rtu_client_iface_init(void)
{
#if ZPLC_HAS_MODBUS_RTU
    const char iface_name[] = DEVICE_DT_NAME(ZPLC_MODBUS_RTU_NODE);
    struct modbus_iface_param client_param = {
        .mode = MODBUS_MODE_RTU,
        .rx_timeout = MAX(zplc_config_get_modbus_tcp_client_timeout_ms(), 100U),
        .serial = {
            .baud = zplc_config_get_modbus_rtu_baud(),
            .parity = zplc_modbus_parity_to_uart(zplc_config_get_modbus_rtu_parity()),
            .stop_bits = UART_CFG_STOP_BITS_1,
        },
    };
    int iface = modbus_iface_get_by_name(iface_name);

    if (iface < 0) {
        return iface;
    }

    if (modbus_init_client(iface, client_param) < 0) {
        return -EIO;
    }

    s_rtu_client_iface = iface;
    return 0;
#else
    return -ENODEV;
#endif
}

static int tcp_connect_socket(const char *host, uint16_t port, uint32_t timeout_ms)
{
    struct zsock_addrinfo hints = {
        .ai_family = AF_INET,
        .ai_socktype = SOCK_STREAM,
        .ai_protocol = IPPROTO_TCP,
    };
    struct zsock_addrinfo *res = NULL;
    char port_buf[8];
    int sock;
    int rc;
    struct zsock_timeval tv;

    snprintf(port_buf, sizeof(port_buf), "%u", (unsigned int)port);
    rc = zsock_getaddrinfo(host, port_buf, &hints, &res);
    if (rc != 0 || res == NULL) {
        return -EHOSTUNREACH;
    }

    sock = zsock_socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (sock < 0) {
        zsock_freeaddrinfo(res);
        return -errno;
    }

    tv.tv_sec = (timeout_ms / 1000U);
    tv.tv_usec = (timeout_ms % 1000U) * 1000U;
    (void)zsock_setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    (void)zsock_setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    rc = zsock_connect(sock, res->ai_addr, res->ai_addrlen);
    zsock_freeaddrinfo(res);
    if (rc < 0) {
        rc = -errno;
        zsock_close(sock);
        return rc;
    }

    return sock;
}

static int tcp_transaction(const char *host, uint16_t port, uint8_t unit_id,
                           const uint8_t *req_pdu, size_t req_pdu_len,
                           uint8_t *resp_pdu, size_t *resp_pdu_len,
                           uint32_t timeout_ms)
{
    uint8_t adu[ZPLC_MODBUS_TCP_MAX_ADU];
    uint8_t rx[ZPLC_MODBUS_TCP_MAX_ADU];
    uint16_t trans_id = ++s_tcp_transaction_id;
    size_t rx_len;
    int sock;
    int rc;

    if (req_pdu_len > ZPLC_MODBUS_TCP_MAX_PDU || resp_pdu == NULL || resp_pdu_len == NULL) {
        return -EINVAL;
    }

    adu[0] = (uint8_t)(trans_id >> 8);
    adu[1] = (uint8_t)(trans_id & 0xFFU);
    adu[2] = 0U;
    adu[3] = 0U;
    adu[4] = (uint8_t)(((req_pdu_len + 1U) >> 8) & 0xFFU);
    adu[5] = (uint8_t)((req_pdu_len + 1U) & 0xFFU);
    adu[6] = unit_id;
    memcpy(&adu[7], req_pdu, req_pdu_len);

    sock = tcp_connect_socket(host, port, timeout_ms);
    if (sock < 0) {
        return sock;
    }

    rc = zsock_send(sock, adu, req_pdu_len + ZPLC_MODBUS_TCP_MBAP_LEN, 0);
    if (rc < 0) {
        rc = -errno;
        zsock_close(sock);
        return rc;
    }

    rc = zsock_recv(sock, rx, sizeof(rx), 0);
    zsock_close(sock);
    if (rc <= 0) {
        return (rc == 0) ? -ECONNRESET : -errno;
    }

    rx_len = (size_t)rc;
    if (rx_len < ZPLC_MODBUS_TCP_MBAP_LEN + 2U) {
        return -EMSGSIZE;
    }

    if (rx[0] != adu[0] || rx[1] != adu[1]) {
        return -EIO;
    }

    *resp_pdu_len = rx_len - ZPLC_MODBUS_TCP_MBAP_LEN;
    memcpy(resp_pdu, &rx[7], *resp_pdu_len);
    if ((resp_pdu[0] & 0x80U) != 0U) {
        return -EIO;
    }

    return 0;
}

int zplc_modbus_rtu_client_read_holding(uint8_t slave_id, uint16_t start_reg,
                                        uint16_t count, uint16_t *out)
{
    if (out == NULL || count == 0U || count > 125U) {
        return -EINVAL;
    }

    if (s_rtu_client_iface < 0) {
        return -ENODEV;
    }

    return modbus_read_holding_regs(s_rtu_client_iface, slave_id, start_reg, out, count);
}

int zplc_modbus_rtu_client_write_register(uint8_t slave_id, uint16_t reg,
                                          uint16_t value)
{
    if (s_rtu_client_iface < 0) {
        return -ENODEV;
    }

    return modbus_write_holding_reg(s_rtu_client_iface, slave_id, reg, value);
}

int zplc_modbus_rtu_client_write_multiple(uint8_t slave_id, uint16_t start_reg,
                                          uint16_t count, const uint16_t *values)
{
    if (values == NULL || count == 0U || count > 123U || s_rtu_client_iface < 0) {
        return -EINVAL;
    }

    return modbus_write_holding_regs(s_rtu_client_iface, slave_id, start_reg,
                                     (uint16_t *const)values, count);
}

int zplc_modbus_rtu_client_read_coils(uint8_t slave_id, uint16_t start_addr,
                                      uint16_t count, uint8_t *out_bits)
{
    if (out_bits == NULL || count == 0U || count > 2000U || s_rtu_client_iface < 0) {
        return -EINVAL;
    }

    return modbus_read_coils(s_rtu_client_iface, slave_id, start_addr, out_bits, count);
}

int zplc_modbus_rtu_client_write_coil(uint8_t slave_id, uint16_t addr, bool state)
{
    if (s_rtu_client_iface < 0) {
        return -ENODEV;
    }

    return modbus_write_coil(s_rtu_client_iface, slave_id, addr, state);
}

int zplc_modbus_tcp_client_read_holding(const char *host, uint16_t port,
                                        uint8_t unit_id, uint16_t start_reg,
                                        uint16_t count, uint16_t *out)
{
    uint8_t req[5];
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_ADU];
    size_t resp_len = 0U;
    int rc;

    if (host == NULL || out == NULL || count == 0U || count > 125U) {
        return -EINVAL;
    }

    req[0] = FC_READ_HOLDING_REGISTERS;
    req[1] = (uint8_t)(start_reg >> 8);
    req[2] = (uint8_t)(start_reg & 0xFFU);
    req[3] = (uint8_t)(count >> 8);
    req[4] = (uint8_t)(count & 0xFFU);
    rc = tcp_transaction(host, port, unit_id, req, sizeof(req), resp, &resp_len,
                         zplc_config_get_modbus_tcp_client_timeout_ms());
    if (rc < 0) {
        return rc;
    }

    if (resp_len < 2U || resp[0] != FC_READ_HOLDING_REGISTERS || resp[1] != count * 2U) {
        return -EIO;
    }

    for (uint16_t i = 0U; i < count; i++) {
        out[i] = ((uint16_t)resp[2U + (i * 2U)] << 8) | resp[3U + (i * 2U)];
    }

    return 0;
}

int zplc_modbus_tcp_client_write_register(const char *host, uint16_t port,
                                          uint8_t unit_id, uint16_t reg,
                                          uint16_t value)
{
    uint8_t req[5] = {
        FC_WRITE_SINGLE_REGISTER,
        (uint8_t)(reg >> 8),
        (uint8_t)(reg & 0xFFU),
        (uint8_t)(value >> 8),
        (uint8_t)(value & 0xFFU),
    };
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_ADU];
    size_t resp_len = 0U;

    if (host == NULL) {
        return -EINVAL;
    }

    if (tcp_transaction(host, port, unit_id, req, sizeof(req), resp, &resp_len,
                        zplc_config_get_modbus_tcp_client_timeout_ms()) < 0) {
        return -EIO;
    }

    return 0;
}

int zplc_modbus_tcp_client_write_multiple(const char *host, uint16_t port,
                                          uint8_t unit_id, uint16_t start_reg,
                                          uint16_t count, const uint16_t *values)
{
    uint8_t req[ZPLC_MODBUS_TCP_MAX_ADU];
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_ADU];
    size_t resp_len = 0U;

    if (host == NULL || values == NULL || count == 0U || count > 123U) {
        return -EINVAL;
    }

    req[0] = FC_WRITE_MULTIPLE_REGISTERS;
    req[1] = (uint8_t)(start_reg >> 8);
    req[2] = (uint8_t)(start_reg & 0xFFU);
    req[3] = (uint8_t)(count >> 8);
    req[4] = (uint8_t)(count & 0xFFU);
    req[5] = (uint8_t)(count * 2U);
    for (uint16_t i = 0U; i < count; i++) {
        req[6U + (i * 2U)] = (uint8_t)(values[i] >> 8);
        req[7U + (i * 2U)] = (uint8_t)(values[i] & 0xFFU);
    }

    return tcp_transaction(host, port, unit_id, req, 6U + (count * 2U), resp, &resp_len,
                           zplc_config_get_modbus_tcp_client_timeout_ms());
}

int zplc_modbus_tcp_client_read_coils(const char *host, uint16_t port,
                                      uint8_t unit_id, uint16_t start_addr,
                                      uint16_t count, uint8_t *out_bits)
{
    uint8_t req[5] = {
        FC_READ_COILS,
        (uint8_t)(start_addr >> 8),
        (uint8_t)(start_addr & 0xFFU),
        (uint8_t)(count >> 8),
        (uint8_t)(count & 0xFFU),
    };
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_ADU];
    size_t resp_len = 0U;
    size_t byte_count;
    int rc;

    if (host == NULL || out_bits == NULL || count == 0U || count > 2000U) {
        return -EINVAL;
    }

    rc = tcp_transaction(host, port, unit_id, req, sizeof(req), resp, &resp_len,
                         zplc_config_get_modbus_tcp_client_timeout_ms());
    if (rc < 0) {
        return rc;
    }

    byte_count = (count + 7U) / 8U;
    if (resp_len < 2U || resp[0] != FC_READ_COILS || resp[1] < byte_count) {
        return -EIO;
    }

    memcpy(out_bits, &resp[2], byte_count);
    return 0;
}

int zplc_modbus_tcp_client_write_coil(const char *host, uint16_t port,
                                      uint8_t unit_id, uint16_t addr, bool state)
{
    uint8_t req[5] = {
        FC_WRITE_SINGLE_COIL,
        (uint8_t)(addr >> 8),
        (uint8_t)(addr & 0xFFU),
        state ? 0xFFU : 0x00U,
        0x00U,
    };
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_ADU];
    size_t resp_len = 0U;

    if (host == NULL) {
        return -EINVAL;
    }

    return tcp_transaction(host, port, unit_id, req, sizeof(req), resp, &resp_len,
                           zplc_config_get_modbus_tcp_client_timeout_ms());
}

static int poll_modbus_tags(bool use_tcp)
{
    uint16_t count = zplc_core_get_tag_count();
    uint16_t regs[2];
    int rc = 0;

    for (uint16_t i = 0U; i < count; i++) {
        const zplc_tag_entry_t *tag = zplc_core_get_tag(i);
        uint16_t width;
        uint32_t value;

        if (tag == NULL || tag->tag_id != ZPLC_TAG_MODBUS) {
            continue;
        }

        width = modbus_register_width((zplc_data_type_t)tag->var_type);
        if (use_tcp) {
            char host[128];
            zplc_config_get_modbus_tcp_client_host(host, sizeof(host));
            rc = zplc_modbus_tcp_client_read_holding(host,
                                                     zplc_config_get_modbus_tcp_client_port(),
                                                     zplc_config_get_modbus_tcp_client_unit_id(),
                                                     (uint16_t)tag->value, width, regs);
        } else {
            rc = zplc_modbus_rtu_client_read_holding(
                zplc_config_get_modbus_rtu_client_slave_id(), (uint16_t)tag->value,
                width, regs);
        }

        if (rc < 0) {
            return rc;
        }

        value = (width == 2U) ? (((uint32_t)regs[0] << 16) | regs[1]) : regs[0];

        zplc_pi_lock();
        mem_write_val(tag->var_addr, (zplc_data_type_t)tag->var_type, value);
        zplc_pi_unlock();
    }

    return 0;
}

static void modbus_rtu_client_thread(void *arg1, void *arg2, void *arg3)
{
    uint32_t delay_ms = zplc_config_get_modbus_rtu_client_poll_ms();

    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);

    while (1) {
        int rc = poll_modbus_tags(false);
        if (rc < 0) {
            LOG_WRN("Modbus RTU client poll failed: %d", rc);
            delay_ms = MIN(delay_ms * 2U, 10000U);
        } else {
            delay_ms = zplc_config_get_modbus_rtu_client_poll_ms();
        }
        k_msleep(delay_ms);
    }
}

static void modbus_tcp_client_thread(void *arg1, void *arg2, void *arg3)
{
    uint32_t delay_ms = zplc_config_get_modbus_tcp_client_poll_ms();

    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);

    while (1) {
        int rc = poll_modbus_tags(true);
        if (rc < 0) {
            LOG_WRN("Modbus TCP client poll failed: %d", rc);
            delay_ms = MIN(delay_ms * 2U, 10000U);
        } else {
            delay_ms = zplc_config_get_modbus_tcp_client_poll_ms();
        }
        k_msleep(delay_ms);
    }
}

int zplc_modbus_client_init(void)
{
    if (zplc_config_get_modbus_rtu_client_enabled()) {
        if (zplc_modbus_rtu_client_iface_init() == 0) {
            k_thread_create(&s_rtu_client_thread, s_rtu_client_stack,
                            K_THREAD_STACK_SIZEOF(s_rtu_client_stack),
                            modbus_rtu_client_thread, NULL, NULL, NULL,
                            K_PRIO_PREEMPT(8), 0, K_NO_WAIT);
            k_thread_name_set(&s_rtu_client_thread, "modbus_rtu_client");
        } else {
            LOG_WRN("Modbus RTU client init skipped");
        }
    }

    if (zplc_config_get_modbus_tcp_client_enabled()) {
        k_thread_create(&s_tcp_client_thread, s_tcp_client_stack,
                        K_THREAD_STACK_SIZEOF(s_tcp_client_stack),
                        modbus_tcp_client_thread, NULL, NULL, NULL,
                        K_PRIO_PREEMPT(8), 0, K_NO_WAIT);
        k_thread_name_set(&s_tcp_client_thread, "modbus_tcp_client");
    }

    return 0;
}
