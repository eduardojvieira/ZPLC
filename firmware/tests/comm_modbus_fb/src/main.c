/*
 * The Modbus function blocks on the real worker thread, queue and spinlock
 * (COM-002, COM-003, COM-004, COM-008, COM-018).
 *
 * The handler of the product (zplc_comm_modbus_handler.c) runs with its real
 * worker thread and queue, behind the real dispatcher of the core, so what the
 * PLC program sees is the handshake of zplc_comm_dispatch.h. The Modbus client
 * it calls is replaced by one that waits on a semaphore, so the test decides
 * when a request finishes and for how long the worker is away.
 */
#include <errno.h>
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/ztest.h>

#include <zplc_comm_dispatch.h>

#include "zplc_config.h"

int zplc_comm_modbus_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len,
			     zplc_comm_call_t call);
int zplc_comm_modbus_handler_init(void);

#define KIND ZPLC_COMM_FB_MB_READ_HREG
#define BLOCK_BYTES ZPLC_COMM_MB_READ_HREG_SIZE

uint32_t zplc_config_get_modbus_tcp_client_timeout_ms(void) { return 500U; }

/* ---- the Modbus client the worker calls ---- */
static K_SEM_DEFINE(entered, 0, 16);
static K_SEM_DEFINE(release, 0, 16);
static char hosts_seen[16][32];
static int calls;
static int client_rc;

int zplc_modbus_tcp_client_read_holding(const char *host, uint16_t port, uint8_t unit_id,
					uint16_t start_reg, uint16_t count, uint16_t *out)
{
	ARG_UNUSED(port); ARG_UNUSED(unit_id); ARG_UNUSED(start_reg); ARG_UNUSED(count);
	if (calls < 16) {
		strncpy(hosts_seen[calls], host, sizeof(hosts_seen[0]) - 1U);
	}
	calls++;
	k_sem_give(&entered);
	(void)k_sem_take(&release, K_SECONDS(5));
	out[0] = 0x1234U;
	return client_rc;
}
int zplc_modbus_rtu_client_read_holding(uint8_t s, uint16_t r, uint16_t c, uint16_t *o)
{ ARG_UNUSED(s); ARG_UNUSED(r); ARG_UNUSED(c); ARG_UNUSED(o); return -ENOTSUP; }
int zplc_modbus_rtu_client_write_register(uint8_t s, uint16_t r, uint16_t v)
{ ARG_UNUSED(s); ARG_UNUSED(r); ARG_UNUSED(v); return -ENOTSUP; }
int zplc_modbus_rtu_client_write_multiple(uint8_t s, uint16_t r, uint16_t c, const uint16_t *v)
{ ARG_UNUSED(s); ARG_UNUSED(r); ARG_UNUSED(c); ARG_UNUSED(v); return -ENOTSUP; }
int zplc_modbus_rtu_client_read_coils(uint8_t s, uint16_t a, uint16_t c, uint8_t *o)
{ ARG_UNUSED(s); ARG_UNUSED(a); ARG_UNUSED(c); ARG_UNUSED(o); return -ENOTSUP; }
int zplc_modbus_rtu_client_write_coil(uint8_t s, uint16_t a, bool v)
{ ARG_UNUSED(s); ARG_UNUSED(a); ARG_UNUSED(v); return -ENOTSUP; }
int zplc_modbus_tcp_client_write_register(const char *h, uint16_t p, uint8_t u, uint16_t r, uint16_t v)
{ ARG_UNUSED(h); ARG_UNUSED(p); ARG_UNUSED(u); ARG_UNUSED(r); ARG_UNUSED(v); return -ENOTSUP; }
int zplc_modbus_tcp_client_write_multiple(const char *h, uint16_t p, uint8_t u, uint16_t r, uint16_t c,
					  const uint16_t *v)
{ ARG_UNUSED(h); ARG_UNUSED(p); ARG_UNUSED(u); ARG_UNUSED(r); ARG_UNUSED(c); ARG_UNUSED(v); return -ENOTSUP; }
int zplc_modbus_tcp_client_read_coils(const char *h, uint16_t p, uint8_t u, uint16_t a, uint16_t c,
				      uint8_t *o)
{ ARG_UNUSED(h); ARG_UNUSED(p); ARG_UNUSED(u); ARG_UNUSED(a); ARG_UNUSED(c); ARG_UNUSED(o); return -ENOTSUP; }
int zplc_modbus_tcp_client_write_coil(const char *h, uint16_t p, uint8_t u, uint16_t a, bool v)
{ ARG_UNUSED(h); ARG_UNUSED(p); ARG_UNUSED(u); ARG_UNUSED(a); ARG_UNUSED(v); return -ENOTSUP; }

/* ---- block helpers ---- */
static uint8_t blocks[10][BLOCK_BYTES];

/* The STRING of HOST is [len u16][cap u16][data...]. */
static void request(uint8_t *block, const char *host)
{
	const size_t n = strlen(host);
	const uint16_t host_offset = ZPLC_COMM_MB_READ_HREG_HOST_OFFSET;

	memset(block, 0, BLOCK_BYTES);
	block[0] = 1;           /* EN */
	block[ZPLC_COMM_MB_READ_HREG_PROTO_OFFSET] = 1; /* TCP */
	block[ZPLC_COMM_MB_READ_HREG_SLAVE_ID_OFFSET] = 1;
	block[ZPLC_COMM_MB_READ_HREG_COUNT_OFFSET] = 1;
	block[host_offset] = (uint8_t)n;
	block[host_offset + 2] = 80;
	memcpy(&block[host_offset + 4], host, n);
	block[ZPLC_COMM_MB_READ_HREG_PORT_OFFSET] = 0xF6; /* 502 */
	block[ZPLC_COMM_MB_READ_HREG_PORT_OFFSET + 1] = 0x01;
}

static void scan(uint8_t *block)
{
	zassert_ok(zplc_comm_fb_exec(KIND, block, BLOCK_BYTES), "dispatch");
}

static uint32_t status_of(const uint8_t *block)
{
	return (uint32_t)block[4] | ((uint32_t)block[5] << 8) | ((uint32_t)block[6] << 16) |
	       ((uint32_t)block[7] << 24);
}

static void *setup(void)
{
	zassert_true(zplc_comm_fb_size(KIND) <= BLOCK_BYTES, "block size");
	zassert_ok(zplc_comm_modbus_handler_init(), "init");
	return NULL;
}

/* Finishes every request the worker has in hand, and waits for it to idle. */
static void drain(int expected_calls)
{
	for (int i = 0; i < 8; i++) {
		k_sem_give(&release);
	}
	k_msleep(100);
	zassert_true(calls >= expected_calls, "worker reached %d calls", calls);
	k_sem_reset(&release);
	k_sem_reset(&entered);
}

static void before(void *fixture)
{
	ARG_UNUSED(fixture);
	calls = 0;
	client_rc = 0;
	memset(hosts_seen, 0, sizeof(hosts_seen));
	for (size_t i = 0; i < ARRAY_SIZE(blocks); i++) {
		zplc_comm_fb_reset(KIND, blocks[i], BLOCK_BYTES);
	}
	drain(0);
}

ZTEST(comm_modbus_fb, test_reset_while_in_flight_does_not_hand_the_slot_to_another_block)
{
	uint8_t *a = blocks[0];
	uint8_t *b = blocks[1];

	/* A's request reaches the client and waits there. */
	request(a, "10.0.0.1");
	scan(a);
	zassert_ok(k_sem_take(&entered, K_SECONDS(2)), "worker took A");
	zassert_equal(a[1], 1, "A is busy");

	/* A is reset while the worker still holds its slot. */
	zassert_ok(zplc_comm_fb_reset(KIND, a, BLOCK_BYTES), "reset A");
	zassert_equal(a[1], 0, "A is not busy");

	/* B starts; it must not take the slot the worker is using. */
	request(b, "10.0.0.2");
	scan(b);
	zassert_equal(b[1], 1, "B is busy");

	/* A's request finishes (its result belongs to nobody), then B's runs. */
	k_sem_give(&release);
	zassert_ok(k_sem_take(&entered, K_SECONDS(2)), "worker took B after A");
	k_sem_give(&release);
	k_msleep(50);

	zassert_equal(calls, 2, "exactly one request per block, got %d", calls);
	zassert_str_equal(hosts_seen[0], "10.0.0.1", "A's host was not overwritten");
	zassert_str_equal(hosts_seen[1], "10.0.0.2", "B's host");

	/* B completes with its own result; A's block never receives one. */
	scan(b);
	zassert_equal(b[2], 1, "B is done");
	zassert_equal(b[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET], 0x34, "B result low byte");
	zassert_equal(b[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET + 1], 0x12, "B result high byte");
	a[0] = 0;
	scan(a);
	zassert_equal(a[2], 0, "A never completes");
	zassert_equal(a[ZPLC_COMM_MB_READ_HREG_VALUE_OFFSET], 0, "A's VALUE is untouched");
}

ZTEST(comm_modbus_fb, test_a_full_queue_is_an_error_with_a_status_code)
{
	/* Eight requests fill the pool: the first is in the client, the rest queue. */
	for (int i = 0; i < 8; i++) {
		request(blocks[i], "10.0.1.1");
		scan(blocks[i]);
		zassert_equal(blocks[i][3], 0, "block %d is not in error", i);
	}
	zassert_ok(k_sem_take(&entered, K_SECONDS(2)), "worker busy");

	request(blocks[8], "10.0.1.2");
	blocks[8][6] = 0xFF; /* stale bytes of an earlier status */
	blocks[8][7] = 0xFF;
	scan(blocks[8]);
	zassert_equal(blocks[8][3], 1, "ERROR is set");
	zassert_equal(blocks[8][1], 0, "not busy");
	zassert_equal(status_of(blocks[8]), ZPLC_COMM_QUEUE_FULL, "STATUS is exactly QUEUE_FULL");

	drain(8);
}

/* COM-003: the worker is away in the client for the better part of a second; the scan is not. Every call of
 * the block returns at once, and the scan loop keeps its period: the loop with the block takes as long as the
 * same loop without it. A block that waited for the client inside the scan would take the time of the
 * request out of the loop. */
ZTEST(comm_modbus_fb, test_a_request_that_takes_longer_than_the_scan_does_not_delay_the_scan)
{
	uint8_t *a = blocks[0];
	int64_t worst_call_ms = 0;
	int64_t start = k_uptime_get();
	int64_t baseline_ms;
	int64_t with_block_ms;

	for (int i = 0; i < 60; i++) {
		k_msleep(10);
	}
	baseline_ms = k_uptime_get() - start;

	request(a, "10.0.2.1");
	start = k_uptime_get();
	for (int i = 0; i < 60; i++) {
		const int64_t before_call = k_uptime_get();

		scan(a);
		if (k_uptime_get() - before_call > worst_call_ms) {
			worst_call_ms = k_uptime_get() - before_call;
		}
		if (i == 50) {
			k_sem_give(&release); /* the client has taken the better part of the loop */
		}
		k_msleep(10);
	}
	with_block_ms = k_uptime_get() - start;

	zassert_equal(worst_call_ms, 0, "a call of the block took %lld ms of the clock", worst_call_ms);
	zassert_true(with_block_ms - baseline_ms < 30,
		     "the loop with the block took %lld ms, without it %lld ms", with_block_ms,
		     baseline_ms);
	k_msleep(50);
	scan(a);
	zassert_equal(a[2], 1, "DONE");
	zassert_equal(calls, 1, "one request");
}

/* COM-004: one rising edge is one request, however long EN stays up; a new rise is another. */
ZTEST(comm_modbus_fb, test_one_trigger_is_one_request)
{
	uint8_t *a = blocks[0];

	request(a, "10.0.3.1");
	scan(a);
	k_sem_give(&release);
	k_msleep(50);
	for (int i = 0; i < 100; i++) {
		scan(a);
		zassert_equal(a[2], 1, "DONE is held");
		k_msleep(1);
	}
	zassert_equal(calls, 1, "one request for one rise, got %d", calls);

	a[0] = 0;
	scan(a);
	zassert_equal(a[2], 0, "DONE is gone");
	a[0] = 1;
	scan(a);
	k_sem_give(&release);
	k_msleep(50);
	scan(a);
	zassert_equal(calls, 2, "the second rise is the second request, got %d", calls);
	zassert_equal(a[2], 1, "DONE again");
}

/* COM-018: a client that fails is ERROR with a status of the documented set, within the request. */
ZTEST(comm_modbus_fb, test_a_client_failure_is_an_error_with_a_status)
{
	uint8_t *a = blocks[0];

	client_rc = -ETIMEDOUT;
	request(a, "10.0.4.1");
	scan(a);
	k_sem_give(&release);
	k_msleep(50);
	scan(a);
	zassert_equal(a[3], 1, "ERROR");
	zassert_equal(status_of(a), ZPLC_COMM_TIMEOUT, "TIMEOUT");
	scan(a);
	zassert_equal(calls, 1, "a failure is not retried while EN stays");
}

ZTEST_SUITE(comm_modbus_fb, NULL, setup, before, NULL, NULL);
