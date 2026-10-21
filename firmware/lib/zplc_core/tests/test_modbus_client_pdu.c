/**
 * @file test_modbus_client_pdu.c
 * @brief The frames of the Modbus clients, and the unit of their timeouts (COM-006, COM-012).
 *
 * The request the client builds is the request the server of the product
 * accepts, and what the client takes for an answer is only the answer to
 * its request: a short frame, another transaction, another unit, another
 * function, a count that is not the one asked for, and an exception are each
 * a defined error and deliver nothing.
 *
 * SPDX-License-Identifier: MIT
 */
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>

#include "zplc_modbus_tcp.h"
#include "zplc_modbus_timing.h"

/* The server of the product, with a bank of registers and coils behind it. */
static uint16_t bank[16];
static uint8_t coil_bits[2];
static int read_hook(uint16_t address, uint16_t count, uint8_t *response, size_t capacity, bool bits, zplc_modbus_area_t area,
                     void *context) {
  uint16_t i;

  (void)area;
  (void)context;
  if (address + count > 16U) {
    return -1;
  }
  if (bits) {
    memset(response, 0, ((size_t)count + 7U) / 8U);
    for (i = 0U; i < count; i++) {
      if ((coil_bits[(address + i) / 8U] >> ((address + i) % 8U)) & 1U) {
        response[i / 8U] |= (uint8_t)(1U << (i % 8U));
      }
    }
    return (int)(((size_t)count + 7U) / 8U);
  }
  assert(capacity >= (size_t)count * 2U);
  for (i = 0U; i < count; i++) {
    response[i * 2U] = (uint8_t)(bank[address + i] >> 8);
    response[i * 2U + 1U] = (uint8_t)bank[address + i];
  }
  return (int)count * 2;
}
static int write_hook(uint16_t address, uint16_t count, const uint8_t *data, bool bits, bool multiple, zplc_modbus_area_t area,
                      void *context) {
  (void)multiple;
  (void)area;
  (void)context;
  if (address + count > 16U) {
    return -1;
  }
  if (bits) {
    if (count == 1U) {
      const uint8_t on = data[0] == 0xFFU;
      coil_bits[address / 8U] = (uint8_t)((coil_bits[address / 8U] & ~(1U << (address % 8U))) | ((unsigned)on << (address % 8U)));
    }
  } else {
    bank[address] = (uint16_t)((data[0] << 8) | data[1]);
  }
  return 0;
}

/* Run a request PDU through the server and give back the response PDU. */
static size_t serve(uint16_t transaction, uint8_t unit, const uint8_t *pdu, size_t pdu_length, uint8_t *response_adu, size_t *adu_length,
                    const uint8_t **response_pdu) {
  uint8_t request[ZPLC_MODBUS_TCP_ADU_MAX];
  const zplc_modbus_tcp_ops_t ops = {.unit_id = 5U, .read = read_hook, .write = write_hook, .context = NULL};
  size_t n = zplc_modbus_tcp_build_request(request, sizeof(request), transaction, unit, pdu, pdu_length);
  size_t response_pdu_length = 0U;

  assert(n == 7U + pdu_length);
  assert(zplc_modbus_tcp_process_adu(request, n, response_adu, ZPLC_MODBUS_TCP_ADU_MAX, adu_length, &ops) == 0);
  assert(zplc_modbus_tcp_response_pdu(response_adu, *adu_length, transaction, unit, response_pdu, &response_pdu_length) == 0);
  return response_pdu_length;
}

static void test_the_requests_of_the_client_are_the_ones_the_server_serves(void) {
  uint8_t pdu[8];
  uint8_t adu[ZPLC_MODBUS_TCP_ADU_MAX];
  const uint8_t *rpdu = NULL;
  size_t adu_length = 0U, n;
  uint16_t regs[3] = {0};
  uint8_t bits[1] = {0};
  printf("test_the_requests_of_the_client_are_the_ones_the_server_serves...\n");

  memset(bank, 0, sizeof(bank));
  memset(coil_bits, 0, sizeof(coil_bits));

  /* write a register, read it back */
  n = zplc_modbus_pdu_write_single(pdu, ZPLC_MODBUS_FC_WRITE_SINGLE_REGISTER, 4U, 0xBEEFU);
  assert(n == 5U && pdu[0] == 0x06 && pdu[1] == 0 && pdu[2] == 4 && pdu[3] == 0xBE && pdu[4] == 0xEF);
  n = serve(1U, 5U, pdu, n, adu, &adu_length, &rpdu);
  assert(zplc_modbus_pdu_write_single_response(rpdu, n, ZPLC_MODBUS_FC_WRITE_SINGLE_REGISTER, 4U, 0xBEEFU) == 0);
  assert(bank[4] == 0xBEEFU);

  bank[5] = 0x1111U;
  bank[6] = 0x2222U;
  n = zplc_modbus_pdu_read(pdu, ZPLC_MODBUS_FC_READ_HOLDING_REGISTERS, 4U, 3U);
  n = serve(2U, 5U, pdu, n, adu, &adu_length, &rpdu);
  assert(zplc_modbus_pdu_read_registers_response(rpdu, n, 3U, regs) == 0);
  assert(regs[0] == 0xBEEFU && regs[1] == 0x1111U && regs[2] == 0x2222U);

  /* coils: ON is 0xFF00, and the answer is the echo */
  n = zplc_modbus_pdu_write_single(pdu, ZPLC_MODBUS_FC_WRITE_SINGLE_COIL, 3U, 1U);
  assert(pdu[3] == 0xFF && pdu[4] == 0x00);
  n = serve(3U, 5U, pdu, n, adu, &adu_length, &rpdu);
  assert(zplc_modbus_pdu_write_single_response(rpdu, n, ZPLC_MODBUS_FC_WRITE_SINGLE_COIL, 3U, 1U) == 0);
  n = zplc_modbus_pdu_read(pdu, ZPLC_MODBUS_FC_READ_COILS, 3U, 1U);
  n = serve(4U, 5U, pdu, n, adu, &adu_length, &rpdu);
  assert(zplc_modbus_pdu_read_coils_response(rpdu, n, 1U, bits, sizeof(bits)) == 0);
  assert((bits[0] & 1U) == 1U);
}

static void test_only_the_answer_to_the_request_is_taken_for_one(void) {
  uint8_t pdu[8];
  uint8_t adu[ZPLC_MODBUS_TCP_ADU_MAX];
  const uint8_t *rpdu = NULL;
  size_t adu_length = 0U, rlen = 0U, n;
  uint16_t regs[2] = {0};
  printf("test_only_the_answer_to_the_request_is_taken_for_one...\n");

  bank[0] = 0x0102U;
  bank[1] = 0x0304U;
  n = zplc_modbus_pdu_read(pdu, ZPLC_MODBUS_FC_READ_HOLDING_REGISTERS, 0U, 2U);
  n = serve(9U, 5U, pdu, n, adu, &adu_length, &rpdu);
  assert(zplc_modbus_pdu_read_registers_response(rpdu, n, 2U, regs) == 0);

  /* the MBAP header: another transaction, another unit, a wrong length, a protocol identifier, a short frame */
  assert(zplc_modbus_tcp_response_pdu(adu, adu_length, 10U, 5U, &rpdu, &rlen) == -EPROTO);
  assert(zplc_modbus_tcp_response_pdu(adu, adu_length, 9U, 6U, &rpdu, &rlen) == -EPROTO);
  assert(zplc_modbus_tcp_response_pdu(adu, adu_length - 1U, 9U, 5U, &rpdu, &rlen) == -EPROTO);
  assert(zplc_modbus_tcp_response_pdu(adu, 7U, 9U, 5U, &rpdu, &rlen) == -EPROTO);
  {
    uint8_t other[ZPLC_MODBUS_TCP_ADU_MAX];

    memcpy(other, adu, adu_length);
    other[3] = 1U; /* protocol identifier */
    assert(zplc_modbus_tcp_response_pdu(other, adu_length, 9U, 5U, &rpdu, &rlen) == -EPROTO);
  }

  /* the PDU: a count that is not the one asked for, another function, a short body, an exception */
  regs[0] = regs[1] = 0U;
  assert(zplc_modbus_pdu_read_registers_response(rpdu = &adu[7], 6U, 1U, regs) == -EPROTO); /* byte count 4 for 1 */
  assert(zplc_modbus_pdu_read_registers_response(&adu[7], 5U, 2U, regs) == -EPROTO);        /* one byte short */
  assert(zplc_modbus_pdu_read_registers_response(&adu[7], 7U, 2U, regs) == -EPROTO);        /* one byte long */
  {
    uint8_t other[8];

    memcpy(other, &adu[7], 6U);
    other[0] = 0x04U;
    assert(zplc_modbus_pdu_read_registers_response(other, 6U, 2U, regs) == -EPROTO);
    other[0] = 0x83U;
    other[1] = 0x02U;
    assert(zplc_modbus_pdu_read_registers_response(other, 2U, 2U, regs) == -EBADMSG);
    assert(zplc_modbus_pdu_write_single_response(other, 2U, ZPLC_MODBUS_FC_READ_HOLDING_REGISTERS, 0U, 0U) == -EBADMSG);
  }
  assert(regs[0] == 0U && regs[1] == 0U); /* nothing delivered from an answer that is not the answer */

  /* the echo of a write must be the request: another address or value is not its answer */
  {
    uint8_t echo[5];

    (void)zplc_modbus_pdu_write_single(echo, ZPLC_MODBUS_FC_WRITE_SINGLE_REGISTER, 4U, 7U);
    assert(zplc_modbus_pdu_write_single_response(echo, 5U, ZPLC_MODBUS_FC_WRITE_SINGLE_REGISTER, 4U, 7U) == 0);
    assert(zplc_modbus_pdu_write_single_response(echo, 5U, ZPLC_MODBUS_FC_WRITE_SINGLE_REGISTER, 5U, 7U) == -EPROTO);
    assert(zplc_modbus_pdu_write_single_response(echo, 5U, ZPLC_MODBUS_FC_WRITE_SINGLE_REGISTER, 4U, 8U) == -EPROTO);
    assert(zplc_modbus_pdu_write_single_response(echo, 4U, ZPLC_MODBUS_FC_WRITE_SINGLE_REGISTER, 4U, 7U) == -EPROTO);
  }

  /* a request that does not fit the buffer is not built */
  assert(zplc_modbus_tcp_build_request(adu, 11U, 1U, 1U, pdu, 5U) == 0U);
  assert(zplc_modbus_tcp_build_request(adu, sizeof(adu), 1U, 1U, pdu, 0U) == 0U);
}

/* COM-012: the Zephyr Modbus client reads its timeout in MICROseconds. */
static void test_the_rtu_timeout_is_given_in_the_unit_the_client_reads(void) {
  printf("test_the_rtu_timeout_is_given_in_the_unit_the_client_reads...\n");
  assert(zplc_modbus_rtu_rx_timeout_us(500U) == 500000U);
  assert(zplc_modbus_rtu_rx_timeout_us(1000U) == 1000000U);
  assert(zplc_modbus_rtu_rx_timeout_us(100U) == 100000U);
  /* shorter than the shortest wait: the shortest wait */
  assert(zplc_modbus_rtu_rx_timeout_us(0U) == 100000U);
  assert(zplc_modbus_rtu_rx_timeout_us(99U) == 100000U);
  /* no wrap */
  assert(zplc_modbus_rtu_rx_timeout_us(4294967U) == 4294967000U);
  assert(zplc_modbus_rtu_rx_timeout_us(4294968U) == 0xFFFFFFFFU);
  assert(zplc_modbus_rtu_rx_timeout_us(0xFFFFFFFFU) == 0xFFFFFFFFU);
}

int main(void) {
  printf("Running Modbus client frame tests...\n");
  test_the_requests_of_the_client_are_the_ones_the_server_serves();
  test_only_the_answer_to_the_request_is_taken_for_one();
  test_the_rtu_timeout_is_given_in_the_unit_the_client_reads();
  printf("All Modbus client frame tests passed.\n");
  return 0;
}
