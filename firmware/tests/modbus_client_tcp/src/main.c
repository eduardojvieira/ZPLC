/*
 * COM-006, COM-012, COM-018: the Modbus TCP client of the product against a
 * Modbus TCP server written for the test, on the loopback interface of the
 * network stack.
 *
 * The client is zplc_modbus_client.c as it is on a board. The server is a
 * thread of this test that answers what the test says: a good response, one
 * that arrives a byte at a time, an exception, the answer to another
 * transaction, silence, and a connection that is closed. The client has to give
 * the documented result for each, in the time its configuration allows.
 */
#include <errno.h>
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/modbus/modbus.h>
#include <zephyr/net/socket.h>
#include <zephyr/ztest.h>

#include <zplc_core.h>
#include <zplc_exchange.h>

#include "zplc_config.h"

#define TIMEOUT_MS 400U
#define SERVER_PORT 15020U

/* ---- what the client links against ---- */
uint32_t zplc_config_get_modbus_tcp_client_timeout_ms(void) { return TIMEOUT_MS; }
uint32_t zplc_config_get_modbus_rtu_baud(void) { return 9600U; }
zplc_modbus_parity_t zplc_config_get_modbus_rtu_parity(void) { return ZPLC_MODBUS_PARITY_EVEN; }
bool zplc_config_get_modbus_rtu_client_enabled(void) { return false; }
uint32_t zplc_config_get_modbus_rtu_client_poll_ms(void) { return 1000U; }
uint8_t zplc_config_get_modbus_rtu_client_slave_id(void) { return 1U; }
bool zplc_config_get_modbus_tcp_client_enabled(void) { return false; }
void zplc_config_get_modbus_tcp_client_host(char *buf, size_t len) { strncpy(buf, "127.0.0.1", len); }
uint16_t zplc_config_get_modbus_tcp_client_port(void) { return SERVER_PORT; }
uint8_t zplc_config_get_modbus_tcp_client_unit_id(void) { return 1U; }
uint32_t zplc_config_get_modbus_tcp_client_poll_ms(void) { return 1000U; }
uint16_t zplc_core_get_tag_count(void) { return 0U; }
const zplc_tag_entry_t *zplc_core_get_tag(uint16_t index) { ARG_UNUSED(index); return NULL; }
int zplc_exchange_write(uint16_t addr, const uint8_t *bytes, uint16_t size)
{ ARG_UNUSED(addr); ARG_UNUSED(bytes); ARG_UNUSED(size); return 0; }

/* ---- the server of the test ---- */
enum mode {
	MODE_GOOD,
	MODE_FRAGMENTED,
	MODE_EXCEPTION,
	MODE_WRONG_TRANSACTION,
	MODE_WRONG_UNIT,
	MODE_SILENT,
	MODE_CLOSE_AT_ONCE,
	MODE_SHORT_BYTE_COUNT,
};

static volatile enum mode mode;
static volatile bool stop;
static uint8_t last_request[300];
static volatile int last_request_length;
static volatile int requests;
static struct k_thread server_thread;
static K_THREAD_STACK_DEFINE(server_stack, 4096);

static void put_be16(uint8_t *b, uint16_t v) { b[0] = (uint8_t)(v >> 8); b[1] = (uint8_t)v; }

/* The response PDU for a request, as the good server gives it. */
static size_t answer(const uint8_t *req, uint8_t *pdu)
{
	const uint8_t fc = req[7];
	const uint16_t count = (uint16_t)((req[10] << 8) | req[11]);

	switch (fc) {
	case 0x03:
		pdu[0] = 0x03;
		pdu[1] = (uint8_t)(count * 2U);
		for (uint16_t i = 0; i < count; i++) {
			put_be16(&pdu[2 + i * 2], (uint16_t)(0x1234 + i));
		}
		return 2U + (size_t)count * 2U;
	case 0x01:
		pdu[0] = 0x01;
		pdu[1] = (uint8_t)((count + 7U) / 8U);
		memset(&pdu[2], 0xA5, pdu[1]);
		return 2U + pdu[1];
	case 0x05:
	case 0x06:
		memcpy(pdu, &req[7], 5);
		return 5U;
	default:
		pdu[0] = (uint8_t)(fc | 0x80);
		pdu[1] = 0x01;
		return 2U;
	}
}

static void server(void *a, void *b, void *c)
{
	struct sockaddr_in addr = {0};
	int listener;
	int one = 1;

	ARG_UNUSED(a); ARG_UNUSED(b); ARG_UNUSED(c);
	listener = zsock_socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
	zsock_setsockopt(listener, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
	addr.sin_family = AF_INET;
	addr.sin_port = htons(SERVER_PORT);
	zsock_inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);
	if (zsock_bind(listener, (struct sockaddr *)&addr, sizeof(addr)) < 0 || zsock_listen(listener, 2) < 0) {
		return;
	}
	while (!stop) {
		struct zsock_pollfd fd = {.fd = listener, .events = ZSOCK_POLLIN};
		int conn;
		int n;
		uint8_t adu[300];
		uint8_t pdu[260];
		size_t pdu_length;

		if (zsock_poll(&fd, 1, 50) <= 0) {
			continue;
		}
		conn = zsock_accept(listener, NULL, NULL);
		if (conn < 0) {
			continue;
		}
		if (mode == MODE_CLOSE_AT_ONCE) {
			requests++;
			zsock_close(conn);
			continue;
		}
		n = (int)zsock_recv(conn, adu, sizeof(adu), 0);
		if (n >= 8) {
			requests++;
			memcpy(last_request, adu, (size_t)n);
			last_request_length = n;
			if (mode == MODE_SILENT) {
				/* no answer: wait for the client to give up and close */
				struct zsock_pollfd hold = {.fd = conn, .events = ZSOCK_POLLIN};
				uint8_t drop[8];

				(void)zsock_poll(&hold, 1, (int)(TIMEOUT_MS * 3U));
				(void)zsock_recv(conn, drop, sizeof(drop), ZSOCK_MSG_DONTWAIT);
				zsock_close(conn);
				continue;
			}
			pdu_length = answer(adu, pdu);
			if (mode == MODE_EXCEPTION) {
				pdu[0] = (uint8_t)(adu[7] | 0x80);
				pdu[1] = 0x02;
				pdu_length = 2U;
			} else if (mode == MODE_SHORT_BYTE_COUNT && adu[7] == 0x03) {
				pdu[1] = (uint8_t)(pdu[1] - 2U); /* says one register less than it carries */
			}
			{
				uint8_t out[300];

				memcpy(out, adu, 7);
				put_be16(&out[4], (uint16_t)(pdu_length + 1U));
				if (mode == MODE_WRONG_TRANSACTION) {
					put_be16(&out[0], (uint16_t)(((adu[0] << 8) | adu[1]) + 1U));
				}
				if (mode == MODE_WRONG_UNIT) {
					out[6] = (uint8_t)(adu[6] + 1U);
				}
				memcpy(&out[7], pdu, pdu_length);
				if (mode == MODE_FRAGMENTED) {
					for (size_t i = 0; i < 7U + pdu_length; i++) {
						(void)zsock_send(conn, &out[i], 1, 0);
						k_msleep(3);
					}
				} else {
					(void)zsock_send(conn, out, 7U + pdu_length, 0);
				}
			}
		}
		k_msleep(20);
		zsock_close(conn);
	}
	zsock_close(listener);
}

static void *setup(void)
{
	stop = false;
	k_thread_create(&server_thread, server_stack, K_THREAD_STACK_SIZEOF(server_stack), server,
			NULL, NULL, NULL, K_PRIO_PREEMPT(7), 0, K_NO_WAIT);
	k_msleep(100);
	return NULL;
}

static void teardown(void *fixture)
{
	ARG_UNUSED(fixture);
	stop = true;
	k_thread_join(&server_thread, K_SECONDS(2));
}

static void before(void *fixture)
{
	ARG_UNUSED(fixture);
	mode = MODE_GOOD;
	requests = 0;
	last_request_length = 0;
}

int zplc_modbus_tcp_client_read_holding(const char *host, uint16_t port, uint8_t unit_id,
					uint16_t start_reg, uint16_t count, uint16_t *out);
int zplc_modbus_tcp_client_write_register(const char *host, uint16_t port, uint8_t unit_id,
					  uint16_t reg, uint16_t value);
int zplc_modbus_tcp_client_read_coils(const char *host, uint16_t port, uint8_t unit_id,
				      uint16_t start_addr, uint16_t count, uint8_t *out_bits);
int zplc_modbus_tcp_client_write_coil(const char *host, uint16_t port, uint8_t unit_id, uint16_t addr,
				      bool state);

ZTEST(modbus_client_tcp, test_a_read_of_holding_registers_succeeds)
{
	uint16_t regs[2] = {0};

	const int rc = zplc_modbus_tcp_client_read_holding("127.0.0.1", SERVER_PORT, 7, 100, 2, regs);

	zassert_equal(rc, 0, "rc %d", rc);
	zassert_equal(regs[0], 0x1234);
	zassert_equal(regs[1], 0x1235);
	zassert_equal(requests, 1);
	zassert_equal(last_request_length, 12);
	zassert_equal(last_request[6], 7, "unit identifier");
	zassert_equal(last_request[7], 0x03, "function code");
	zassert_equal((last_request[8] << 8) | last_request[9], 100, "start address");
	zassert_equal((last_request[10] << 8) | last_request[11], 2, "count");
	zassert_equal((last_request[2] << 8) | last_request[3], 0, "protocol identifier");
}

ZTEST(modbus_client_tcp, test_single_writes_and_coil_reads_succeed)
{
	uint8_t bits[1] = {0};

	zassert_ok(zplc_modbus_tcp_client_write_register("127.0.0.1", SERVER_PORT, 1, 5, 0xBEEF));
	zassert_equal(last_request[7], 0x06);
	zassert_equal((last_request[10] << 8) | last_request[11], 0xBEEF);
	zassert_ok(zplc_modbus_tcp_client_write_coil("127.0.0.1", SERVER_PORT, 1, 9, true));
	zassert_equal(last_request[7], 0x05);
	zassert_equal(last_request[10], 0xFF, "ON is 0xFF00");
	zassert_ok(zplc_modbus_tcp_client_read_coils("127.0.0.1", SERVER_PORT, 1, 0, 3, bits));
	zassert_equal(bits[0], 0xA5);
}

/* A TCP response may arrive in pieces; the client puts it back together (COM-006). */
ZTEST(modbus_client_tcp, test_a_response_that_arrives_a_byte_at_a_time_is_read_whole)
{
	uint16_t regs[1] = {0};

	mode = MODE_FRAGMENTED;
	zassert_ok(zplc_modbus_tcp_client_read_holding("127.0.0.1", SERVER_PORT, 1, 0, 1, regs));
	zassert_equal(regs[0], 0x1234);
}

ZTEST(modbus_client_tcp, test_an_exception_response_is_an_error)
{
	uint16_t regs[1] = {0};

	mode = MODE_EXCEPTION;
	{
		const int rc = zplc_modbus_tcp_client_read_holding("127.0.0.1", SERVER_PORT, 1, 0, 1, regs);

		zassert_equal(rc, -EBADMSG, "rc %d", rc);
	}
	zassert_equal(zplc_modbus_tcp_client_write_register("127.0.0.1", SERVER_PORT, 1, 0, 1), -EBADMSG);
	zassert_equal(regs[0], 0, "no value from an exception");
}

ZTEST(modbus_client_tcp, test_an_answer_to_another_transaction_or_unit_or_count_is_a_protocol_error)
{
	uint16_t regs[2] = {0};

	mode = MODE_WRONG_TRANSACTION;
	zassert_equal(zplc_modbus_tcp_client_read_holding("127.0.0.1", SERVER_PORT, 1, 0, 1, regs), -EPROTO);
	mode = MODE_WRONG_UNIT;
	zassert_equal(zplc_modbus_tcp_client_read_holding("127.0.0.1", SERVER_PORT, 1, 0, 1, regs), -EPROTO);
	mode = MODE_SHORT_BYTE_COUNT;
	zassert_equal(zplc_modbus_tcp_client_read_holding("127.0.0.1", SERVER_PORT, 1, 0, 2, regs), -EPROTO);
	zassert_equal(regs[0], 0, "nothing is delivered from an answer that is not the answer");
}

/* COM-018: a server that does not answer is a timeout, after the configured time and not much after. */
ZTEST(modbus_client_tcp, test_a_silent_server_is_a_timeout_in_the_configured_time)
{
	uint16_t regs[1] = {0};
	const int64_t start = k_uptime_get();
	int rc;

	mode = MODE_SILENT;
	rc = zplc_modbus_tcp_client_read_holding("127.0.0.1", SERVER_PORT, 1, 0, 1, regs);
	zassert_equal(rc, -ETIMEDOUT);
	zassert_true(k_uptime_get() - start >= TIMEOUT_MS - 20, "not before the time: %lld ms", k_uptime_get() - start);
	zassert_true(k_uptime_get() - start < TIMEOUT_MS + 150, "not long after it: %lld ms", k_uptime_get() - start);
}

ZTEST(modbus_client_tcp, test_a_connection_closed_before_the_answer_and_a_port_with_no_server)
{
	uint16_t regs[1] = {0};

	mode = MODE_CLOSE_AT_ONCE;
	zassert_equal(zplc_modbus_tcp_client_read_holding("127.0.0.1", SERVER_PORT, 1, 0, 1, regs), -ECONNRESET);
	/* nothing listens on this port */
	zassert_equal(zplc_modbus_tcp_client_read_holding("127.0.0.1", SERVER_PORT + 1, 1, 0, 1, regs),
		      -ECONNREFUSED);
}

void zplc_modbus_rtu_client_params(struct modbus_iface_param *param);

/* COM-012: the interface of an RTU client waits for a response for rx_timeout MICROseconds. A value in
 * milliseconds there is a thousandth of the wait that was asked for, and every request to a responsive
 * device timed out before its first byte could arrive. */
ZTEST(modbus_client_tcp, test_the_rtu_client_is_given_its_timeout_in_microseconds)
{
	struct modbus_iface_param param;

	zplc_modbus_rtu_client_params(&param);
	zassert_equal(param.mode, MODBUS_MODE_RTU);
	zassert_equal(param.rx_timeout, TIMEOUT_MS * 1000U, "rx_timeout is %u", param.rx_timeout);
	zassert_equal(param.serial.baud, 9600U);
	zassert_equal(param.serial.parity, UART_CFG_PARITY_EVEN);
	zassert_equal(param.serial.stop_bits, UART_CFG_STOP_BITS_1);
}

ZTEST_SUITE(modbus_client_tcp, NULL, setup, before, NULL, teardown);
