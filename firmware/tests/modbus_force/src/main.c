/*
 * RT-011, COM-010: a write from Modbus goes through the exchange and the force-aware memory interface of the core,
 * so a forced variable keeps its forced value whatever a Modbus client writes. The server of the product is the
 * code under test, over the real core: a write that reached the memory of the program by another way would
 * overwrite the force and fail these tests.
 *
 * The program holds three tags the server maps: a 16-bit register at WORK+0x10 (Modbus address 0), a 32-bit value
 * at WORK+0x20 (registers 10 and 11) and a BOOL at WORK+0x30 (coil 20). The writes are made through
 * zplc_modbus_write_mapped(), the one function every Modbus write of the server ends in.
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

/* The parts of the application the server calls and this suite does not link. */
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

#define REG_VAR (ZPLC_MEM_WORK_BASE + 0x10U)
#define DINT_VAR (ZPLC_MEM_WORK_BASE + 0x20U)
#define BOOL_VAR (ZPLC_MEM_WORK_BASE + 0x30U)

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

static void add_tag(uint8_t *entry, uint16_t address, uint8_t type, uint32_t modbus_address) {
  put_u16(entry, address);
  entry[2] = type;
  entry[3] = ZPLC_TAG_MODBUS;
  put_u32(entry + 4U, modbus_address);
}

static void load_program(void) {
  static uint8_t file[256];
  static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];
  const uint8_t code[] = {OP_HALT};
  const size_t tag_bytes = 3U * ZPLC_TAG_ENTRY_SIZE;
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
  add_tag(file + offset, REG_VAR, ZPLC_TYPE_UINT, 0U);
  add_tag(file + offset + ZPLC_TAG_ENTRY_SIZE, DINT_VAR, ZPLC_TYPE_DINT, 10U);
  add_tag(file + offset + 2U * ZPLC_TAG_ENTRY_SIZE, BOOL_VAR, ZPLC_TYPE_BOOL, 20U);
  offset += tag_bytes;
  crc = crc32_update(0xFFFFFFFFU, file, 12U);
  crc = crc32_update(crc, file + 16U, offset - 16U) ^ 0xFFFFFFFFU;
  put_u32(file + 12U, crc);
  zassert_equal(zplc_core_load(file, offset, workspace, sizeof(workspace)), ZPLC_LOADER_OK, "the program with its Modbus tags loads");
  zassert_equal(zplc_core_get_tag_count(), 3U, "three tags");
}

static void *suite_setup(void) {
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "HAL init");
  zassert_ok(zplc_core_init(), "core init");
  /* No scheduler runs in this suite: the exchange has no scan to wait for and applies a write at once. */
  zassert_ok(zplc_exchange_init(NULL), "exchange init");
  return NULL;
}

static void before_each(void *fixture) {
  ARG_UNUSED(fixture);
  load_program(); /* a load is a cold start: memory and forces are clean (RT-016) */
}

static const uint8_t *mem(uint16_t address) { return zplc_mem_get_region(ZPLC_MEM_WORK_BASE) + (address - ZPLC_MEM_WORK_BASE); }

ZTEST(modbus_force, test_an_unforced_register_is_written) {
  const uint8_t request[] = {0x12U, 0x34U};

  zassert_ok(zplc_modbus_write_mapped(0U, 1U, request, false, false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), "a write of a mapped register");
  zassert_equal(mem(REG_VAR)[0], 0x34U, "low byte (Modbus is big endian, memory is little endian)");
  zassert_equal(mem(REG_VAR)[1], 0x12U, "high byte");
}

ZTEST(modbus_force, test_a_forced_register_keeps_the_forced_value) {
  const uint8_t forced[] = {0xAAU, 0xBBU};
  const uint8_t request[] = {0x12U, 0x34U};

  zassert_ok(zplc_force_set_bytes(REG_VAR, forced, sizeof(forced)), "the variable is forced");
  zassert_ok(zplc_modbus_write_mapped(0U, 1U, request, false, false, ZPLC_MODBUS_AREA_HOLDING_REGISTER), "the write is accepted");
  zassert_equal(mem(REG_VAR)[0], 0xAAU, "the forced low byte stays");
  zassert_equal(mem(REG_VAR)[1], 0xBBU, "the forced high byte stays");
}

ZTEST(modbus_force, test_a_forced_32_bit_value_keeps_both_words) {
  const uint8_t forced[] = {0x01U, 0x02U, 0x03U, 0x04U};
  const uint8_t request[] = {0x11U, 0x22U, 0x33U, 0x44U};

  zassert_ok(zplc_force_set_bytes(DINT_VAR, forced, sizeof(forced)), "the variable is forced");
  zassert_ok(zplc_modbus_write_mapped(10U, 2U, request, false, true, ZPLC_MODBUS_AREA_HOLDING_REGISTER), "a write of both registers");
  zassert_mem_equal(mem(DINT_VAR), forced, sizeof(forced), "the forced value stays");

  zassert_ok(zplc_force_clear(DINT_VAR), "the force is released");
  zassert_ok(zplc_modbus_write_mapped(10U, 2U, request, false, true, ZPLC_MODBUS_AREA_HOLDING_REGISTER), "and the same write");
  zassert_equal(mem(DINT_VAR)[0], 0x44U, "now lands: low byte");
  zassert_equal(mem(DINT_VAR)[3], 0x11U, "high byte");
}

ZTEST(modbus_force, test_a_forced_coil_keeps_the_forced_value) {
  const uint8_t off = 0U;
  const uint8_t on[] = {0xFFU, 0x00U};

  zassert_ok(zplc_force_set_bytes(BOOL_VAR, &off, 1U), "the BOOL is forced to FALSE");
  zassert_ok(zplc_modbus_write_mapped(20U, 1U, on, true, false, ZPLC_MODBUS_AREA_COIL), "a coil write ON");
  zassert_equal(mem(BOOL_VAR)[0], 0U, "the forced FALSE stays");
}

ZTEST_SUITE(modbus_force, NULL, suite_setup, before_each, NULL, NULL);
