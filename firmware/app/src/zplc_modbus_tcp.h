/* Modbus TCP framing and ADU validation shared by the server and native tests. */
#ifndef ZPLC_MODBUS_TCP_H
#define ZPLC_MODBUS_TCP_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define ZPLC_MODBUS_TCP_ADU_MAX 260U
#define ZPLC_MODBUS_TCP_DROP (-1)

typedef enum {
  ZPLC_MODBUS_AREA_COIL = 0,
  ZPLC_MODBUS_AREA_DISCRETE_INPUT = 1,
  ZPLC_MODBUS_AREA_INPUT_REGISTER = 2,
  ZPLC_MODBUS_AREA_HOLDING_REGISTER = 3,
} zplc_modbus_area_t;

typedef struct {
  uint16_t unit_id;
  int (*read)(uint16_t address, uint16_t count, uint8_t *response,
              size_t response_capacity, bool bits, zplc_modbus_area_t area,
              void *context);
  int (*write)(uint16_t address, uint16_t count, const uint8_t *data,
               bool bits, bool multiple, zplc_modbus_area_t area,
               void *context);
  void *context;
} zplc_modbus_tcp_ops_t;

typedef struct {
  uint8_t bytes[ZPLC_MODBUS_TCP_ADU_MAX];
  size_t used;
} zplc_modbus_tcp_stream_t;

typedef int (*zplc_modbus_tcp_adu_cb_t)(const uint8_t *request, size_t request_length,
                                        void *context);

void zplc_modbus_tcp_stream_reset(zplc_modbus_tcp_stream_t *stream);
int zplc_modbus_tcp_stream_feed(zplc_modbus_tcp_stream_t *stream,
                                const uint8_t *data, size_t data_length,
                                zplc_modbus_tcp_adu_cb_t callback, void *context);
int zplc_modbus_tcp_process_adu(const uint8_t *request, size_t request_length,
                                uint8_t *response, size_t response_capacity,
                                size_t *response_length,
                                const zplc_modbus_tcp_ops_t *ops);

/*
 * The client side of the same framing (COM-006, COM-012): the request ADU of one function, the check of
 * the response ADU against it, and the functions of the five requests the communication blocks make.
 * Pure C: the Zephyr client and the host runtime build and read their frames with these, so the frames
 * are the ones the server above accepts, and the host tests run the whole of it.
 *
 * Every check returns 0, or a negative errno: -EPROTO for a response that is not the answer to the
 * request (a short frame, another transaction, another unit, another function, a count that is not the
 * one asked for), and -EBADMSG for an exception response of the server.
 */
#define ZPLC_MODBUS_TCP_MBAP_LEN 7U
#define ZPLC_MODBUS_PDU_MAX 253U

#define ZPLC_MODBUS_FC_READ_COILS 0x01U
#define ZPLC_MODBUS_FC_READ_HOLDING_REGISTERS 0x03U
#define ZPLC_MODBUS_FC_WRITE_SINGLE_COIL 0x05U
#define ZPLC_MODBUS_FC_WRITE_SINGLE_REGISTER 0x06U

/** The request ADU of a PDU: MBAP header and PDU. Returns its length, or 0 when it does not fit. */
size_t zplc_modbus_tcp_build_request(uint8_t *adu, size_t capacity, uint16_t transaction,
                                     uint8_t unit_id, const uint8_t *pdu, size_t pdu_length);

/** The PDU of a response ADU, after the checks of its MBAP header against the request it answers. */
int zplc_modbus_tcp_response_pdu(const uint8_t *adu, size_t length, uint16_t transaction,
                                 uint8_t unit_id, const uint8_t **pdu, size_t *pdu_length);

/** PDU of a read of `count` coils or registers (function 1 or 3): 5 bytes. */
size_t zplc_modbus_pdu_read(uint8_t *pdu, uint8_t function, uint16_t address, uint16_t count);

/** PDU of the write of one coil (function 5, value 0 or non-zero) or one register (function 6): 5 bytes. */
size_t zplc_modbus_pdu_write_single(uint8_t *pdu, uint8_t function, uint16_t address, uint16_t value);

/** The answer to a read of `count` holding registers: the registers, in host order. */
int zplc_modbus_pdu_read_registers_response(const uint8_t *pdu, size_t length, uint16_t count,
                                            uint16_t *registers);

/** The answer to a read of `count` coils: the bits, as the server packed them (LSB first). */
int zplc_modbus_pdu_read_coils_response(const uint8_t *pdu, size_t length, uint16_t count,
                                        uint8_t *bits, size_t bits_capacity);

/** The answer to a single write is the echo of the request. */
int zplc_modbus_pdu_write_single_response(const uint8_t *pdu, size_t length, uint8_t function,
                                          uint16_t address, uint16_t value);

/* Private app seam shared by TCP/RTU and the native regression suite. */
int zplc_modbus_write_mapped(uint16_t address, uint16_t count, const uint8_t *data,
                             bool bits, bool multiple, zplc_modbus_area_t area);

#endif
