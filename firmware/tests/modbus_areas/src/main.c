/*
 * COM-011 and COM-013: the four areas of the Modbus server are four address spaces, writes to the input areas
 * are refused, and the mapping reaches the whole of the memory it serves.
 *
 * The server of the application (zplc_modbus.c) runs over the real core, the real exchange and the real tag
 * table of a program that is loaded through the loader. The reads and writes are made through the two seams the
 * TCP and the RTU servers end in, zplc_modbus_read_mapped() and zplc_modbus_write_mapped(), and through the
 * framing of the TCP server for the exception a client sees.
 */
#include <string.h>

#include <zephyr/ztest.h>

#include <zplc_core.h>
#include <zplc_exchange.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_loader.h>

#include "zplc_config.h"
#include "zplc_modbus_tcp.h"

int zplc_modbus_client_init(void) { return 0; }
bool zplc_config_get_modbus_tag_override(uint16_t index, uint16_t width, uint32_t *address) {
  ARG_UNUSED(index);
  ARG_UNUSED(width);
  ARG_UNUSED(address);
  return false;
}
uint16_t zplc_config_get_modbus_id(void) { return 1U; }
bool zplc_config_get_modbus_tcp_enabled(void) { return false; }
bool zplc_config_get_modbus_rtu_enabled(void) { return false; }

#define WORK(offset) ((uint16_t)(ZPLC_MEM_WORK_BASE + (offset)))
#define WORK_LAST_WORD ((uint16_t)(ZPLC_MEM_WORK_BASE + ZPLC_MEM_WORK_SIZE - 2U))
#define WORK_BOOL_BEFORE_LAST_WORD ((uint16_t)(ZPLC_MEM_WORK_BASE + ZPLC_MEM_WORK_SIZE - 3U))
#define RETAIN_FIRST_WORD ((uint16_t)ZPLC_MEM_RETAIN_BASE)
#define RETAIN_WORD_BEFORE_DWORD ((uint16_t)(ZPLC_MEM_RETAIN_BASE + ZPLC_MEM_RETAIN_SIZE - 6U))
#define RETAIN_LAST_DWORD ((uint16_t)(ZPLC_MEM_RETAIN_BASE + ZPLC_MEM_RETAIN_SIZE - 4U))

struct tag {
  uint16_t var_addr;
  uint8_t type;
  uint32_t number;
};

/* The number 20, in each of the four areas: four variables, four places. */
static const struct tag tags[] = {
    {WORK(0x00), ZPLC_TYPE_UINT, 40001U}, /* holding register 0 */
    {WORK(0x02), ZPLC_TYPE_UINT, 30001U}, /* input register 0 */
    {WORK(0x04), ZPLC_TYPE_BOOL, 0U},     /* coil 0 */
    {WORK(0x05), ZPLC_TYPE_BOOL, 10001U}, /* discrete input 0 */
    {WORK(0x08), ZPLC_TYPE_DINT, 40011U}, /* holding registers 10 and 11 */
    {WORK(0x10), ZPLC_TYPE_UINT, 40021U}, /* holding register 20 */
    {WORK(0x12), ZPLC_TYPE_UINT, 30021U}, /* input register 20 */
    {WORK(0x14), ZPLC_TYPE_BOOL, 20U},    /* coil 20 */
    {WORK(0x15), ZPLC_TYPE_BOOL, 10021U}, /* discrete input 20 */
    {WORK(0x18), ZPLC_TYPE_UINT, 7U},     /* no prefix: holding register 7 */
    /* the edges of the memory the server serves */
    {WORK_LAST_WORD, ZPLC_TYPE_UINT, 40101U},
    {WORK_BOOL_BEFORE_LAST_WORD, ZPLC_TYPE_BOOL, 101U},
    {RETAIN_FIRST_WORD, ZPLC_TYPE_UINT, 40102U},
    {RETAIN_WORD_BEFORE_DWORD, ZPLC_TYPE_UINT, 40103U},
    {RETAIN_LAST_DWORD, ZPLC_TYPE_DWORD, 40201U},
    /* the last address the wire has */
    {WORK(0x20), ZPLC_TYPE_UINT, 65535U},
    /* an input register and a discrete input that no holding register or coil shares the address with */
    {WORK(0x22), ZPLC_TYPE_UINT, 30031U}, /* input register 30 */
    {WORK(0x24), ZPLC_TYPE_BOOL, 10031U}, /* discrete input 30 */
};

static void put_u16(uint8_t *data, uint16_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
}

static void put_u32(uint8_t *data, uint32_t value) {
  data[0] = (uint8_t)value;
  data[1] = (uint8_t)(value >> 8);
  data[2] = (uint8_t)(value >> 16);
  data[3] = (uint8_t)(value >> 24);
}

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  size_t index;

  for (index = 0U; index < length; index++) {
    uint32_t bit;

    crc ^= data[index];
    for (bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static void load_program(void) {
  static uint8_t file[512];
  static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  const uint8_t code[] = {OP_HALT};
  const size_t tag_bytes = ARRAY_SIZE(tags) * ZPLC_TAG_ENTRY_SIZE;
  size_t offset = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t code_offset = offset;
  uint32_t crc;

  memset(file, 0, sizeof(file));
  memcpy(file, "ZPLC", 4U);
  put_u16(file + 4U, ZPLC_VERSION_MAJOR);
  put_u16(file + 6U, ZPLC_VERSION_MINOR);
  put_u32(file + 16U, sizeof(code));
  put_u32(file + 20U, (uint32_t)tag_bytes);
  put_u16(file + 26U, 2U);
  put_u32(file + 28U, ZPLC_DRAFT_COUNTER);
  put_u16(file + 32U, ZPLC_SEG_CODE);
  put_u32(file + 36U, sizeof(code));
  put_u16(file + 40U, ZPLC_SEG_TAGS);
  put_u32(file + 44U, (uint32_t)tag_bytes);
  memcpy(file + code_offset, code, sizeof(code));
  offset = code_offset + sizeof(code);
  for (size_t i = 0U; i < ARRAY_SIZE(tags); i++) {
    uint8_t *entry = file + offset + i * ZPLC_TAG_ENTRY_SIZE;

    put_u16(entry, tags[i].var_addr);
    entry[2] = tags[i].type;
    entry[3] = ZPLC_TAG_MODBUS;
    put_u32(entry + 4U, tags[i].number);
  }
  offset += tag_bytes;
  crc = crc32_update(0xFFFFFFFFU, file, 12U);
  crc = crc32_update(crc, file + 16U, offset - 16U) ^ 0xFFFFFFFFU;
  put_u32(file + 12U, crc);
  zassert_equal(zplc_core_load(file, offset, workspace, sizeof(workspace)), ZPLC_LOADER_OK,
                "the program with its Modbus tags loads");
  zassert_equal(zplc_core_get_tag_count(), ARRAY_SIZE(tags), "the tags");
}

static uint8_t *live(uint16_t address) {
  uint8_t *region = zplc_mem_get_region(address >= ZPLC_MEM_RETAIN_BASE ? ZPLC_MEM_RETAIN_BASE : ZPLC_MEM_WORK_BASE);
  const uint16_t base = address >= ZPLC_MEM_RETAIN_BASE ? ZPLC_MEM_RETAIN_BASE : ZPLC_MEM_WORK_BASE;

  return region + (address - base);
}

static void *suite_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "HAL init");
  zassert_ok(zplc_core_init(), "core init");
  zassert_ok(zplc_exchange_init(NULL), "exchange init");
  return NULL;
}

static void before_each(void *fixture) {
  ARG_UNUSED(fixture);
  load_program(); /* a load is a cold start: memory is clean */
}

/* What a client reads from `area` at `address`: one register, or one bit. -1 when it is not served. */
static int read_register(zplc_modbus_area_t area, uint16_t address) {
  uint8_t out[2] = {0, 0};

  if (zplc_modbus_read_mapped(address, 1U, out, sizeof(out), false, area) < 0) {
    return -1;
  }
  return (out[0] << 8) | out[1];
}

static int read_bit(zplc_modbus_area_t area, uint16_t address) {
  uint8_t out[1] = {0};

  if (zplc_modbus_read_mapped(address, 1U, out, sizeof(out), true, area) < 0) {
    return -1;
  }
  return out[0] & 1U;
}

/* COM-011: number 20 is four variables; each area serves its own. */
ZTEST(modbus_areas, test_the_same_number_in_four_areas_is_four_variables) {
  put_u16(live(WORK(0x10)), 0x1111U);
  put_u16(live(WORK(0x12)), 0x2222U);
  *live(WORK(0x14)) = 1U;
  *live(WORK(0x15)) = 0U;
  zplc_exchange_publish();

  zassert_equal(read_register(ZPLC_MODBUS_AREA_HOLDING_REGISTER, 20U), 0x1111, "holding register 20");
  zassert_equal(read_register(ZPLC_MODBUS_AREA_INPUT_REGISTER, 20U), 0x2222, "input register 20");
  zassert_equal(read_bit(ZPLC_MODBUS_AREA_COIL, 20U), 1, "coil 20");
  zassert_equal(read_bit(ZPLC_MODBUS_AREA_DISCRETE_INPUT, 20U), 0, "discrete input 20");

  *live(WORK(0x15)) = 1U;
  zplc_exchange_publish();
  zassert_equal(read_bit(ZPLC_MODBUS_AREA_DISCRETE_INPUT, 20U), 1, "discrete input 20 follows its own variable");
  zassert_equal(read_bit(ZPLC_MODBUS_AREA_COIL, 20U), 1, "and the coil is its own");
}

/* An item that no variable is located at, in that area, is not served, even when another area has the number. */
ZTEST(modbus_areas, test_an_item_is_served_in_its_own_area_only) {
  zplc_exchange_publish();
  zassert_equal(read_register(ZPLC_MODBUS_AREA_HOLDING_REGISTER, 0U), 0, "holding register 0 is served");
  zassert_equal(read_register(ZPLC_MODBUS_AREA_INPUT_REGISTER, 0U), 0, "input register 0 is served");
  zassert_equal(read_register(ZPLC_MODBUS_AREA_INPUT_REGISTER, 7U), -1, "input register 7: only HR 7 exists");
  zassert_equal(read_register(ZPLC_MODBUS_AREA_HOLDING_REGISTER, 7U), 0, "holding register 7 is served");
  zassert_equal(read_bit(ZPLC_MODBUS_AREA_DISCRETE_INPUT, 5U), -1, "discrete input 5 is not served");
  zassert_equal(read_bit(ZPLC_MODBUS_AREA_COIL, 1U), -1, "coil 1 is not served");
  zassert_equal(read_bit(ZPLC_MODBUS_AREA_COIL, 0U), 0, "coil 0 is served");
}

/* COM-011: a write to a discrete input or an input register is refused with nothing written. */
ZTEST(modbus_areas, test_a_write_to_an_input_area_is_refused) {
  const uint8_t word[] = {0x12U, 0x34U};
  const uint8_t on[] = {0xFFU, 0x00U};

  zassert_equal(zplc_modbus_write_mapped(0U, 1U, word, false, false, ZPLC_MODBUS_AREA_INPUT_REGISTER), -1,
                "a write of an input register");
  zassert_equal(zplc_modbus_write_mapped(0U, 1U, on, true, false, ZPLC_MODBUS_AREA_DISCRETE_INPUT), -1,
                "a write of a discrete input");
  zassert_equal(live(WORK(0x02))[0], 0U, "the input register is untouched");
  zassert_equal(live(WORK(0x05))[0], 0U, "the discrete input is untouched");
  /* and the areas that can be written write their own variable and no other */
  zassert_ok(zplc_modbus_write_mapped(20U, 1U, word, false, false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), "HR 20");
  zassert_equal(live(WORK(0x10))[0], 0x34U, "holding register 20 holds it");
  zassert_equal(live(WORK(0x12))[0], 0U, "the input register 20 is not that variable");
  zassert_ok(zplc_modbus_write_mapped(20U, 1U, on, true, false, ZPLC_MODBUS_AREA_COIL), "coil 20");
  zassert_equal(live(WORK(0x14))[0], 1U, "coil 20");
  zassert_equal(live(WORK(0x15))[0], 0U, "the discrete input 20 is not that variable");
}

/* COM-013: the memory the server serves is served to its last byte, in WORK and in RETAIN. */
ZTEST(modbus_areas, test_the_mapping_covers_the_whole_of_work_and_retain) {
  const uint8_t value[] = {0xCAU, 0xFEU};
  const uint8_t dword[] = {0x01U, 0x02U, 0x03U, 0x04U};
  const uint8_t coil_on[] = {0xFFU, 0x00U};

  /* the last word of WORK (its second byte is the last byte), and the BOOL in front of it */
  zassert_ok(zplc_modbus_write_mapped(100U, 1U, value, false, false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), "WORK end");
  zassert_equal(live(WORK_LAST_WORD)[0], 0xFEU, "the last word of WORK: low byte");
  zassert_equal(live(WORK_LAST_WORD)[1], 0xCAU, "the last word of WORK: high byte");
  zassert_ok(zplc_modbus_write_mapped(101U, 1U, coil_on, true, false, ZPLC_MODBUS_AREA_COIL), "BOOL before it");
  zassert_equal(*live(WORK_BOOL_BEFORE_LAST_WORD), 1U, "the BOOL before the last word of WORK");
  /* the first word of RETAIN, a word near its end, and a 32-bit value that ends at its last byte */
  zassert_ok(zplc_modbus_write_mapped(101U, 1U, value, false, false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), "RETAIN start");
  zassert_equal(live(RETAIN_FIRST_WORD)[0], 0xFEU, "the first word of RETAIN");
  zassert_ok(zplc_modbus_write_mapped(102U, 1U, value, false, false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), "RETAIN end");
  zassert_equal(live(RETAIN_WORD_BEFORE_DWORD)[1], 0xCAU, "the word before the last 32-bit value of RETAIN");
  zassert_ok(zplc_modbus_write_mapped(200U, 2U, dword, false, true, ZPLC_MODBUS_AREA_HOLDING_REGISTER),
             "a 32-bit value that ends at the last byte of RETAIN");
  zassert_equal(live(RETAIN_LAST_DWORD)[0], 0x04U, "its low byte");
  zassert_equal(live(RETAIN_LAST_DWORD)[3], 0x01U, "its high byte, at the last byte of RETAIN");

  zplc_exchange_publish();
  zassert_equal(read_register(ZPLC_MODBUS_AREA_HOLDING_REGISTER, 100U), 0xCAFE, "read back: WORK end");
  zassert_equal(read_register(ZPLC_MODBUS_AREA_HOLDING_REGISTER, 102U), 0xCAFE, "read back: RETAIN end");
  zassert_equal(read_register(ZPLC_MODBUS_AREA_HOLDING_REGISTER, 200U), 0x0102, "the 32-bit value, first register");
  zassert_equal(read_register(ZPLC_MODBUS_AREA_HOLDING_REGISTER, 201U), 0x0304, "second register");
  zassert_equal(read_bit(ZPLC_MODBUS_AREA_COIL, 101U), 1, "the BOOL before the last word of WORK as a coil");
}

/* A range that starts or ends outside what is mapped is refused whole; the last address of the wire is
 * served, and nothing past it. */
ZTEST(modbus_areas, test_the_range_of_the_wire_is_served_to_its_last_address) {
  uint8_t out[8];
  const uint8_t value[] = {0x0AU, 0x0BU};

  zplc_exchange_publish();
  zassert_equal(read_register(ZPLC_MODBUS_AREA_HOLDING_REGISTER, 65535U), 0, "address 65535");
  zassert_ok(zplc_modbus_write_mapped(65535U, 1U, value, false, false, ZPLC_MODBUS_AREA_HOLDING_REGISTER),
             "write at address 65535");
  zassert_equal(zplc_modbus_read_mapped(65535U, 2U, out, sizeof(out), false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), -1,
                "a range past 65535");
  zassert_equal(zplc_modbus_read_mapped(0U, 2U, out, sizeof(out), false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), -1,
                "a range that includes an item that is not served (register 1)");
  zassert_equal(zplc_modbus_read_mapped(10U, 2U, out, sizeof(out), false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), 4,
                "the two registers of a 32-bit value");
  zassert_equal(zplc_modbus_read_mapped(10U, 1U, out, 1U, false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), -1,
                "a response that does not fit");
}

/* The framing of the TCP server, in front of the same two seams the server of the application ends in: what a
 * client sees when it asks for, or writes, an address that only an input has. */
static int ops_read(uint16_t address, uint16_t count, uint8_t *response, size_t capacity, bool bits,
                    zplc_modbus_area_t area, void *context) {
  ARG_UNUSED(context);
  return zplc_modbus_read_mapped(address, count, response, capacity, bits, area);
}

static int ops_write(uint16_t address, uint16_t count, const uint8_t *data, bool bits, bool multiple,
                     zplc_modbus_area_t area, void *context) {
  ARG_UNUSED(context);
  return zplc_modbus_write_mapped(address, count, data, bits, multiple, area);
}

/* One request of function `function` for `address` and `value` (count of a read, value of a single write). */
static size_t ask(uint8_t function, uint16_t address, uint16_t value, uint8_t *response) {
  static const zplc_modbus_tcp_ops_t ops = {.unit_id = 1U, .read = ops_read, .write = ops_write, .context = NULL};
  const uint8_t request[12] = {0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x01, function,
                               (uint8_t)(address >> 8), (uint8_t)address, (uint8_t)(value >> 8), (uint8_t)value};
  size_t length = 0U;

  zassert_ok(zplc_modbus_tcp_process_adu(request, sizeof(request), response, 260U, &length, &ops), "framing");
  return length;
}

/* COM-011: the exception a client sees. */
ZTEST(modbus_areas, test_an_address_only_an_input_has_is_exception_2_for_a_write_and_a_read_of_the_other_area) {
  uint8_t response[260];
  size_t length;

  zplc_exchange_publish();
  /* the input register 30 is read through function 4 */
  length = ask(0x04U, 30U, 1U, response);
  zassert_equal(length, 11U, "length %u", (unsigned)length);
  zassert_equal(response[7], 0x04U, "function 4 answers");
  /* a holding register at 30 is not a variable: reading or writing it is exception 2, and nothing is written */
  length = ask(0x03U, 30U, 1U, response);
  zassert_equal(length, 9U);
  zassert_equal(response[7], 0x83U, "exception of function 3");
  zassert_equal(response[8], 0x02U, "illegal data address");
  length = ask(0x06U, 30U, 0xABCDU, response);
  zassert_equal(response[7], 0x86U, "exception of function 6");
  zassert_equal(response[8], 0x02U, "illegal data address");
  zassert_equal(live(WORK(0x22))[0], 0U, "the input register is untouched by the write of a holding register");
  /* the same for a coil at the address of a discrete input */
  length = ask(0x02U, 30U, 1U, response);
  zassert_equal(response[7], 0x02U, "function 2 answers");
  length = ask(0x05U, 30U, 0xFF00U, response);
  zassert_equal(response[7], 0x85U, "exception of function 5");
  zassert_equal(response[8], 0x02U, "illegal data address");
  zassert_equal(live(WORK(0x24))[0], 0U, "the discrete input is untouched by the write of a coil");
  /* and a function that does not exist is exception 1 */
  length = ask(0x08U, 0U, 0U, response);
  zassert_equal(response[7], 0x88U);
  zassert_equal(response[8], 0x01U, "illegal function");
}

ZTEST_SUITE(modbus_areas, NULL, suite_setup, before_each, NULL, NULL);
