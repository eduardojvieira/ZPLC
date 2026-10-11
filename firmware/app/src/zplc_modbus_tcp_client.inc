/*
 * The Modbus TCP client: one transaction on a connection of its own, and the five calls the blocks and the
 * polling thread make on it (COM-006, COM-012, COM-018).
 *
 * This file is included, not compiled on its own, by the two programs that have a TCP client: the application
 * (zplc_modbus_client.c, on the Zephyr socket API) and the simulation runtime (host_modbus_client.c, on the BSD
 * socket API through the names below). Both therefore make the same requests, with the same time limits, and
 * give the same status for the same failure. The includer provides: the socket calls under their `zsock_` names,
 * k_uptime_get(), zplc_config_get_modbus_tcp_client_timeout_ms(), and zplc_modbus_tcp.h.
 *
 * SPDX-License-Identifier: MIT
 */

#define ZPLC_MODBUS_TCP_MAX_PDU ZPLC_MODBUS_PDU_MAX
#define ZPLC_MODBUS_TCP_MAX_ADU (ZPLC_MODBUS_TCP_MBAP_LEN + ZPLC_MODBUS_TCP_MAX_PDU)

#define FC_READ_COILS ZPLC_MODBUS_FC_READ_COILS
#define FC_READ_HOLDING_REGISTERS ZPLC_MODBUS_FC_READ_HOLDING_REGISTERS
#define FC_WRITE_SINGLE_COIL ZPLC_MODBUS_FC_WRITE_SINGLE_COIL
#define FC_WRITE_SINGLE_REGISTER ZPLC_MODBUS_FC_WRITE_SINGLE_REGISTER
#define FC_WRITE_MULTIPLE_REGISTERS 0x10U

static uint16_t s_tcp_transaction_id;

/* Milliseconds left until `deadline`, 0 when it has passed. */
static int32_t ms_left(int64_t deadline)
{
    const int64_t left = deadline - k_uptime_get();

    return left > 0 ? (int32_t)left : 0;
}

/**
 * Connect to host:port within the time left. The connect does not block past the deadline: the socket is
 * non-blocking and the wait is a poll, so a host that does not answer is -ETIMEDOUT after the configured
 * time, not after the network stack gives up (COM-018).
 */
static int tcp_connect_socket(const char *host, uint16_t port, int64_t deadline)
{
    struct zsock_addrinfo hints = {
        .ai_family = AF_INET,
        .ai_socktype = SOCK_STREAM,
        .ai_protocol = IPPROTO_TCP,
    };
    struct zsock_addrinfo *res = NULL;
    struct zsock_pollfd fd;
    char port_buf[8];
    int sock;
    int rc;
    int flags;

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

    flags = zsock_fcntl(sock, ZVFS_F_GETFL, 0);
    if (flags < 0 || zsock_fcntl(sock, ZVFS_F_SETFL, flags | ZVFS_O_NONBLOCK) < 0) {
        rc = -errno;
        zsock_freeaddrinfo(res);
        zsock_close(sock);
        return rc;
    }

    rc = zsock_connect(sock, res->ai_addr, res->ai_addrlen);
    zsock_freeaddrinfo(res);
    if (rc == 0) {
        return sock;
    }
    if (errno != EINPROGRESS && errno != EAGAIN) {
        rc = -errno;
        zsock_close(sock);
        return rc;
    }

    fd.fd = sock;
    fd.events = ZSOCK_POLLOUT;
    fd.revents = 0;
    rc = zsock_poll(&fd, 1, ms_left(deadline));
    if (rc == 0) {
        zsock_close(sock);
        return -ETIMEDOUT;
    }
    if (rc < 0) {
        rc = -errno;
        zsock_close(sock);
        return rc;
    }
    {
        int error = 0;
        socklen_t length = sizeof(error);

        if (zsock_getsockopt(sock, SOL_SOCKET, SO_ERROR, &error, &length) < 0) {
            error = errno;
        }
        if (error != 0 || (fd.revents & (ZSOCK_POLLERR | ZSOCK_POLLHUP)) != 0) {
            zsock_close(sock);
            return error != 0 ? -error : -ECONNREFUSED;
        }
    }
    return sock;
}

/** Send all of `data` within the time left. */
static int tcp_send_all(int sock, const uint8_t *data, size_t length, int64_t deadline)
{
    size_t sent = 0U;

    while (sent < length) {
        struct zsock_pollfd fd = {.fd = sock, .events = ZSOCK_POLLOUT, .revents = 0};
        int rc = zsock_poll(&fd, 1, ms_left(deadline));

        if (rc == 0) {
            return -ETIMEDOUT;
        }
        if (rc < 0) {
            return -errno;
        }
        rc = (int)zsock_send(sock, data + sent, length - sent, 0);
        if (rc < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                continue;
            }
            return -errno;
        }
        sent += (size_t)rc;
    }
    return 0;
}

/** What the reassembly of a response gives: the one ADU the server sent. */
struct tcp_response {
    uint8_t adu[ZPLC_MODBUS_TCP_MAX_ADU];
    size_t length;
    bool complete;
};

static int tcp_response_cb(const uint8_t *adu, size_t length, void *context)
{
    struct tcp_response *response = context;

    if (length > sizeof(response->adu) || response->complete) {
        return -EPROTO;
    }
    memcpy(response->adu, adu, length);
    response->length = length;
    response->complete = true;
    return 0;
}

/**
 * One transaction on a connection of its own: the request, then the response, whole, whatever the way the
 * segments of the stream fall (a response may come in pieces). Everything, connect included, is inside the
 * configured timeout (COM-018). The PDU of the response is the checked one: its transaction, protocol, unit
 * and length are the ones of the request.
 */
static int tcp_transaction(const char *host, uint16_t port, uint8_t unit_id,
                           const uint8_t *req_pdu, size_t req_pdu_len,
                           uint8_t *resp_pdu, size_t *resp_pdu_len,
                           uint32_t timeout_ms)
{
    uint8_t adu[ZPLC_MODBUS_TCP_MAX_ADU];
    zplc_modbus_tcp_stream_t stream;
    struct tcp_response response = {.length = 0U, .complete = false};
    const uint16_t trans_id = ++s_tcp_transaction_id;
    const int64_t deadline = k_uptime_get() + (int64_t)timeout_ms;
    const uint8_t *pdu = NULL;
    size_t pdu_length = 0U;
    size_t adu_length;
    int sock;
    int rc;

    if (req_pdu_len > ZPLC_MODBUS_TCP_MAX_PDU || resp_pdu == NULL || resp_pdu_len == NULL) {
        return -EINVAL;
    }
    adu_length = zplc_modbus_tcp_build_request(adu, sizeof(adu), trans_id, unit_id, req_pdu, req_pdu_len);
    if (adu_length == 0U) {
        return -EINVAL;
    }

    sock = tcp_connect_socket(host, port, deadline);
    if (sock < 0) {
        return sock;
    }

    rc = tcp_send_all(sock, adu, adu_length, deadline);
    zplc_modbus_tcp_stream_reset(&stream);
    while (rc == 0 && !response.complete) {
        uint8_t chunk[64];
        struct zsock_pollfd fd = {.fd = sock, .events = ZSOCK_POLLIN, .revents = 0};
        int received;

        rc = zsock_poll(&fd, 1, ms_left(deadline));
        if (rc == 0) {
            rc = -ETIMEDOUT;
            break;
        }
        if (rc < 0) {
            rc = -errno;
            break;
        }
        received = (int)zsock_recv(sock, chunk, sizeof(chunk), 0);
        if (received == 0) {
            rc = -ECONNRESET; /* the server closed before the response was whole */
            break;
        }
        if (received < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                rc = 0;
                continue;
            }
            rc = -errno;
            break;
        }
        rc = zplc_modbus_tcp_stream_feed(&stream, chunk, (size_t)received, tcp_response_cb, &response);
    }
    zsock_close(sock);
    if (rc != 0) {
        return rc;
    }

    rc = zplc_modbus_tcp_response_pdu(response.adu, response.length, trans_id, unit_id, &pdu, &pdu_length);
    if (rc != 0) {
        return rc;
    }
    memcpy(resp_pdu, pdu, pdu_length);
    *resp_pdu_len = pdu_length;
    return 0;
}

int zplc_modbus_tcp_client_read_holding(const char *host, uint16_t port,
                                         uint8_t unit_id, uint16_t start_reg,
                                         uint16_t count, uint16_t *out)
{
    uint8_t req[5];
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_PDU];
    size_t resp_len = 0U;
    int rc;

    if (host == NULL || out == NULL || count == 0U || count > 125U) {
        return -EINVAL;
    }

    (void)zplc_modbus_pdu_read(req, FC_READ_HOLDING_REGISTERS, start_reg, count);
    rc = tcp_transaction(host, port, unit_id, req, sizeof(req), resp, &resp_len,
                         zplc_config_get_modbus_tcp_client_timeout_ms());
    if (rc < 0) {
        return rc;
    }

    return zplc_modbus_pdu_read_registers_response(resp, resp_len, count, out);
}

int zplc_modbus_tcp_client_write_register(const char *host, uint16_t port,
                                          uint8_t unit_id, uint16_t reg,
                                          uint16_t value)
{
    uint8_t req[5];
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_PDU];
    size_t resp_len = 0U;
    int rc;

    if (host == NULL) {
        return -EINVAL;
    }

    (void)zplc_modbus_pdu_write_single(req, FC_WRITE_SINGLE_REGISTER, reg, value);
    rc = tcp_transaction(host, port, unit_id, req, sizeof(req), resp, &resp_len,
                         zplc_config_get_modbus_tcp_client_timeout_ms());
    if (rc < 0) {
        return rc;
    }

    return zplc_modbus_pdu_write_single_response(resp, resp_len, FC_WRITE_SINGLE_REGISTER, reg, value);
}

int zplc_modbus_tcp_client_write_multiple(const char *host, uint16_t port,
                                          uint8_t unit_id, uint16_t start_reg,
                                          uint16_t count, const uint16_t *values)
{
    uint8_t req[ZPLC_MODBUS_TCP_MAX_PDU];
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_PDU];
    size_t resp_len = 0U;
    int rc;

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

    rc = tcp_transaction(host, port, unit_id, req, 6U + (count * 2U), resp, &resp_len,
                         zplc_config_get_modbus_tcp_client_timeout_ms());
    if (rc < 0) {
        return rc;
    }
    if (resp_len >= 1U && resp[0] == (uint8_t)(FC_WRITE_MULTIPLE_REGISTERS | 0x80U)) {
        return -EBADMSG;
    }
    /* the echo of the start address and the count */
    return (resp_len == 5U && resp[0] == FC_WRITE_MULTIPLE_REGISTERS && resp[1] == req[1] &&
            resp[2] == req[2] && resp[3] == req[3] && resp[4] == req[4])
               ? 0
               : -EPROTO;
}

int zplc_modbus_tcp_client_read_coils(const char *host, uint16_t port,
                                      uint8_t unit_id, uint16_t start_addr,
                                      uint16_t count, uint8_t *out_bits)
{
    uint8_t req[5];
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_PDU];
    size_t resp_len = 0U;
    int rc;

    if (host == NULL || out_bits == NULL || count == 0U || count > 2000U) {
        return -EINVAL;
    }

    (void)zplc_modbus_pdu_read(req, FC_READ_COILS, start_addr, count);
    rc = tcp_transaction(host, port, unit_id, req, sizeof(req), resp, &resp_len,
                         zplc_config_get_modbus_tcp_client_timeout_ms());
    if (rc < 0) {
        return rc;
    }

    return zplc_modbus_pdu_read_coils_response(resp, resp_len, count, out_bits, ((size_t)count + 7U) / 8U);
}

int zplc_modbus_tcp_client_write_coil(const char *host, uint16_t port,
                                      uint8_t unit_id, uint16_t addr, bool state)
{
    uint8_t req[5];
    uint8_t resp[ZPLC_MODBUS_TCP_MAX_PDU];
    size_t resp_len = 0U;
    int rc;

    if (host == NULL) {
        return -EINVAL;
    }

    (void)zplc_modbus_pdu_write_single(req, FC_WRITE_SINGLE_COIL, addr, state ? 1U : 0U);
    rc = tcp_transaction(host, port, unit_id, req, sizeof(req), resp, &resp_len,
                         zplc_config_get_modbus_tcp_client_timeout_ms());
    if (rc < 0) {
        return rc;
    }

    return zplc_modbus_pdu_write_single_response(resp, resp_len, FC_WRITE_SINGLE_COIL, addr, state ? 1U : 0U);
}
