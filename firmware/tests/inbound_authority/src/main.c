/*
 * COM-017: no message that arrives from Modbus changes RUN/STOP, sets or
 * clears a force, or downloads a program.
 *
 * Every function code, with bodies of every length the framing allows, goes
 * through the Modbus TCP framing and the write mapping of the product
 * (zplc_modbus_tcp.c, zplc_modbus.c) in front of a core whose authority
 * entries are traps. The framing, the mapping and the two address spaces are
 * the real ones. The server reaches PLC memory through the exchange only
 * (zplc_exchange.h): the exchange is a fake that keeps the bytes of a small image, and
 * the direct entries of the core (the live region, the image lock, the
 * force-aware write) are traps as well, so a server that went round the
 * exchange would be counted.
 */
#include <errno.h>
#include <string.h>

#include <zephyr/ztest.h>

#include <zplc_core.h>
#include <zplc_exchange.h>
#include <zplc_isa.h>

#include "zplc_config.h"
#include "zplc_modbus_tcp.h"

static uint8_t process_image[4096]; /* WORK, based at 0x2000 */
static zplc_tag_entry_t process_tags[2];
static int authority_calls;
static int exchange_open; /* begin/read_lock calls not yet closed */

#define WORK_BASE 0x2000U

/* ---- what the Modbus server may use: the exchange and the tag table ---- */
int zplc_modbus_client_init(void) { return 0; }
bool zplc_config_get_modbus_tag_override(uint16_t index, uint16_t width, uint32_t *address)
{ ARG_UNUSED(index); ARG_UNUSED(width); ARG_UNUSED(address); return false; }
uint16_t zplc_config_get_modbus_id(void) { return 1U; }
bool zplc_config_get_modbus_tcp_enabled(void) { return false; }
bool zplc_config_get_modbus_rtu_enabled(void) { return false; }

static bool inside_work(uint16_t addr, uint16_t size)
{
	return addr >= WORK_BASE && size != 0U && (size_t)addr + size <= WORK_BASE + sizeof(process_image);
}
int zplc_exchange_write_begin(size_t records, size_t bytes)
{ ARG_UNUSED(records); ARG_UNUSED(bytes); exchange_open++; return 0; }
int zplc_exchange_write_add(uint16_t addr, const uint8_t *bytes, uint16_t size)
{
	if (!inside_work(addr, size)) {
		return ZPLC_EXCHANGE_ERR_RANGE;
	}
	memcpy(&process_image[addr - WORK_BASE], bytes, size);
	return 0;
}
void zplc_exchange_write_end(void) { exchange_open--; }
int zplc_exchange_read_lock(void) { exchange_open++; return 0; }
int zplc_exchange_read_locked(uint16_t addr, uint8_t *out, uint16_t size)
{
	if (!inside_work(addr, size)) {
		return ZPLC_EXCHANGE_ERR_RANGE;
	}
	memcpy(out, &process_image[addr - WORK_BASE], size);
	return 0;
}
void zplc_exchange_read_unlock(void) { exchange_open--; }
uint16_t zplc_core_get_tag_count(void) { return ARRAY_SIZE(process_tags); }
const zplc_tag_entry_t *zplc_core_get_tag(uint16_t index)
{ return index < ARRAY_SIZE(process_tags) ? &process_tags[index] : NULL; }

/* ---- what it may not: each of these is a call a message would have to make
 * to start, stop, force or load. They count; the test asserts the count. ---- */
#define TRAP_INT(name, ...) int name(__VA_ARGS__) { authority_calls++; return -EPERM; }
#define TRAP_VOID(name, ...) void name(__VA_ARGS__) { authority_calls++; }
TRAP_INT(zplc_sched_start, void)
TRAP_INT(zplc_sched_stop, void)
TRAP_INT(zplc_sched_pause, void)
TRAP_INT(zplc_sched_resume, void)
TRAP_INT(zplc_sched_step, void)
TRAP_INT(zplc_sched_enter_safe_error, void)
TRAP_INT(zplc_sched_load, const uint8_t *binary, size_t size)
TRAP_INT(zplc_force_set_bytes, uint16_t addr, const uint8_t *bytes, uint16_t size)
TRAP_INT(zplc_force_clear, uint16_t addr)
TRAP_VOID(zplc_force_clear_all, void)
TRAP_INT(zplc_core_load, const uint8_t *binary, size_t size, uint8_t *workspace, size_t workspace_size)
/* The direct way into PLC memory, round the exchange. */
TRAP_INT(zplc_force_write_bytes, uint16_t addr, const uint8_t *bytes, uint16_t size)
TRAP_INT(zplc_pi_lock, void)
TRAP_VOID(zplc_pi_unlock, void)
uint8_t *zplc_mem_get_region(uint16_t region) { authority_calls++; ARG_UNUSED(region); return NULL; }

static int read_zero(uint16_t address, uint16_t count, uint8_t *out, size_t cap, bool bits,
		     zplc_modbus_area_t area, void *context)
{
	size_t n = bits ? ((size_t)count + 7U) / 8U : (size_t)count * 2U;

	ARG_UNUSED(address); ARG_UNUSED(area); ARG_UNUSED(context);
	if (n > cap) {
		return -1;
	}
	memset(out, 0, n);
	return (int)n;
}

static int write_through_the_product(uint16_t address, uint16_t count, const uint8_t *data,
				     bool bits, bool multiple, zplc_modbus_area_t area, void *context)
{
	ARG_UNUSED(context);
	return zplc_modbus_write_mapped(address, count, data, bits, multiple, area);
}

static zplc_modbus_tcp_ops_t ops = {
	.unit_id = 1U,
	.read = read_zero,
	.write = write_through_the_product,
};

static size_t adu(uint8_t *out, uint8_t fc, const uint8_t *body, size_t n)
{
	out[0] = 0U; out[1] = 1U; out[2] = 0U; out[3] = 0U;
	out[4] = (uint8_t)((n + 2U) >> 8); out[5] = (uint8_t)(n + 2U);
	out[6] = 1U; out[7] = fc;
	memcpy(&out[8], body, n);
	return n + 8U;
}

static void before(void *fixture)
{
	ARG_UNUSED(fixture);
	memset(process_image, 0, sizeof(process_image));
	/* A WORD at 0x2000 served as holding register 0, and a BOOL at 0x2002 as
	 * coil 5. */
	process_tags[0] = (zplc_tag_entry_t){ .var_addr = 0x2000U, .var_type = ZPLC_TYPE_WORD,
					      .tag_id = ZPLC_TAG_MODBUS, .value = 0U };
	process_tags[1] = (zplc_tag_entry_t){ .var_addr = 0x2002U, .var_type = ZPLC_TYPE_BOOL,
					      .tag_id = ZPLC_TAG_MODBUS, .value = 5U };
	authority_calls = 0;
	exchange_open = 0;
}

ZTEST(inbound_authority, test_no_function_code_reaches_run_stop_forces_or_download)
{
	static const size_t lengths[] = {0U, 1U, 2U, 4U, 5U, 6U, 9U, 17U, 100U, 246U};
	uint8_t body[246];
	uint8_t request[ZPLC_MODBUS_TCP_ADU_MAX];
	uint8_t response[ZPLC_MODBUS_TCP_ADU_MAX];

	for (unsigned int fc = 0U; fc <= 0xFFU; fc++) {
		for (size_t l = 0; l < ARRAY_SIZE(lengths); l++) {
			/* Three fills: zero, one, and a count that is as large as it
			 * can be, so a write function code is asked for the most. */
			for (unsigned int fill = 0U; fill < 3U; fill++) {
				size_t request_length;
				size_t response_length = 0U;

				memset(body, fill == 0U ? 0x00 : (fill == 1U ? 0xFF : 0x7B),
				       sizeof(body));
				request_length = adu(request, (uint8_t)fc, body, lengths[l]);
				(void)zplc_modbus_tcp_process_adu(request, request_length, response,
								  sizeof(response), &response_length,
								  &ops);
				zassert_equal(authority_calls, 0,
					      "function code 0x%02X (%zu bytes) reached the runtime",
					      fc, lengths[l]);
				zassert_equal(exchange_open, 0, "exchange begin/lock calls balanced");
			}
		}
	}
}

/* Well-formed writes, at every count the protocol allows: the fill-based
 * test above reaches the write path by luck of the bytes; these reach it by
 * construction. */
ZTEST(inbound_authority, test_well_formed_writes_of_every_count_reach_no_authority)
{
	static const uint16_t addresses[] = {0U, 1U, 5U, 0x00FFU, 0x2000U, 0xFFFFU};
	uint8_t body[260];
	uint8_t request[ZPLC_MODBUS_TCP_ADU_MAX];
	uint8_t response[ZPLC_MODBUS_TCP_ADU_MAX];

	for (size_t a = 0; a < ARRAY_SIZE(addresses); a++) {
		const uint16_t address = addresses[a];

		/* FC 5 and FC 6: one coil, one register, with each value. */
		for (unsigned int fc = 5U; fc <= 6U; fc++) {
			static const uint16_t values[] = {0x0000U, 0xFF00U, 0x1234U, 0xFFFFU};

			for (size_t v = 0; v < ARRAY_SIZE(values); v++) {
				size_t response_length = 0U;

				body[0] = (uint8_t)(address >> 8); body[1] = (uint8_t)address;
				body[2] = (uint8_t)(values[v] >> 8); body[3] = (uint8_t)values[v];
				(void)zplc_modbus_tcp_process_adu(request, adu(request, (uint8_t)fc, body, 4U),
								  response, sizeof(response),
								  &response_length, &ops);
				zassert_equal(authority_calls, 0, "FC %u reached the runtime", fc);
			}
		}
		/* FC 15 (coils) and FC 16 (registers): every count up to the limit. */
		for (unsigned int count = 1U; count <= 123U; count++) {
			for (unsigned int fc = 15U; fc <= 16U; fc++) {
				const size_t data = fc == 16U ? (size_t)count * 2U : ((size_t)count + 7U) / 8U;
				size_t response_length = 0U;

				body[0] = (uint8_t)(address >> 8); body[1] = (uint8_t)address;
				body[2] = (uint8_t)(count >> 8); body[3] = (uint8_t)count;
				body[4] = (uint8_t)data;
				memset(&body[5], 0xFF, data);
				(void)zplc_modbus_tcp_process_adu(request, adu(request, (uint8_t)fc, body, 5U + data),
								  response, sizeof(response),
								  &response_length, &ops);
				zassert_equal(authority_calls, 0, "FC %u count %u reached the runtime",
					      fc, count);
			}
		}
	}
}

ZTEST(inbound_authority, test_a_write_to_any_area_or_address_changes_only_mapped_bytes)
{
	static const uint16_t addresses[] = {0U, 1U, 2U, 5U, 6U, 0x00FFU, 0x0100U, 0x2000U, 0x3000U,
					     0x7FFFU, 0x8000U, 0xFFFEU, 0xFFFFU};
	static const uint8_t data[8] = {0xFFU, 0xFFU, 0xFFU, 0xFFU, 0xFFU, 0xFFU, 0xFFU, 0xFFU};
	/* Not on the stack: the test thread of the 64 KB target has 4 KB. */
	static uint8_t reference[sizeof(process_image)];

	for (int area = ZPLC_MODBUS_AREA_COIL; area <= ZPLC_MODBUS_AREA_HOLDING_REGISTER; area++) {
		for (size_t a = 0; a < ARRAY_SIZE(addresses); a++) {
			for (unsigned int count = 0U; count <= 4U; count++) {
				for (int bits = 0; bits <= 1; bits++) {
					memset(process_image, 0, sizeof(process_image));
					memcpy(reference, process_image, sizeof(reference));
					(void)zplc_modbus_write_mapped(addresses[a], (uint16_t)count, data,
								       bits != 0, count > 1U,
								       (zplc_modbus_area_t)area);
					/* Only the bytes of the two tags may have moved. */
					for (size_t i = 0; i < sizeof(process_image); i++) {
						if (i != 0U && i != 1U && i != 2U) {
							zassert_equal(process_image[i], reference[i],
								      "byte %zu written (area %d addr %u)",
								      i, area, addresses[a]);
						}
					}
					zassert_equal(authority_calls, 0, "a write reached the runtime");
				}
			}
		}
	}
}

/* The control of the two tests above: a legitimate write does land, so a run
 * that shows no change is not a run in which nothing was ever able to. */
ZTEST(inbound_authority, test_control_a_mapped_write_does_land)
{
	uint8_t request[ZPLC_MODBUS_TCP_ADU_MAX];
	uint8_t response[ZPLC_MODBUS_TCP_ADU_MAX];
	size_t response_length = 0U;
	const uint8_t holding[] = {0x00U, 0x00U, 0x12U, 0x34U}; /* register 0 = 0x1234 */
	const uint8_t coil[] = {0x00U, 0x05U, 0xFFU, 0x00U};   /* coil 5 on */
	size_t n = adu(request, 6U, holding, sizeof(holding));

	zassert_ok(zplc_modbus_tcp_process_adu(request, n, response, sizeof(response),
					       &response_length, &ops), "FC 06");
	zassert_equal(process_image[0], 0x34U, "low byte");
	zassert_equal(process_image[1], 0x12U, "high byte");

	n = adu(request, 5U, coil, sizeof(coil));
	zassert_ok(zplc_modbus_tcp_process_adu(request, n, response, sizeof(response),
					       &response_length, &ops), "FC 05");
	zassert_equal(process_image[2], 1U, "coil");
	zassert_equal(authority_calls, 0, "and still no authority");
}

ZTEST_SUITE(inbound_authority, NULL, NULL, before, NULL, NULL);
