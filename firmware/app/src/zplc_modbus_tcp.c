#include "zplc_modbus_tcp.h"

#include <errno.h>
#include <string.h>

#define FC_READ_COILS 0x01U
#define FC_READ_DISCRETE_INPUTS 0x02U
#define FC_READ_HOLDING_REGISTERS 0x03U
#define FC_READ_INPUT_REGISTERS 0x04U
#define FC_WRITE_SINGLE_COIL 0x05U
#define FC_WRITE_SINGLE_REGISTER 0x06U
#define FC_WRITE_MULTIPLE_COILS 0x0FU
#define FC_WRITE_MULTIPLE_REGISTERS 0x10U

static uint16_t be16(const uint8_t *bytes) { return ((uint16_t)bytes[0] << 8) | bytes[1]; }

static void put_be16(uint8_t *bytes, uint16_t value) {
  bytes[0] = (uint8_t)(value >> 8);
  bytes[1] = (uint8_t)value;
}

static zplc_modbus_area_t area_for_fc(uint8_t function) {
  switch (function) {
  case FC_READ_COILS:
  case FC_WRITE_SINGLE_COIL:
  case FC_WRITE_MULTIPLE_COILS:
    return ZPLC_MODBUS_AREA_COIL;
  case FC_READ_DISCRETE_INPUTS:
    return ZPLC_MODBUS_AREA_DISCRETE_INPUT;
  case FC_READ_INPUT_REGISTERS:
    return ZPLC_MODBUS_AREA_INPUT_REGISTER;
  default:
    return ZPLC_MODBUS_AREA_HOLDING_REGISTER;
  }
}

static bool range_is_valid(uint16_t start, uint16_t count) { return (uint32_t)start + (uint32_t)count <= UINT16_MAX + 1U; }

static int exception_response(const uint8_t *request, uint8_t *response, size_t response_capacity, size_t *response_length,
                              uint8_t exception) {
  if (response_capacity < 9U) {
    return -ENOSPC;
  }
  memcpy(response, request, 7U);
  response[4] = 0U;
  response[5] = 3U;
  response[7] = request[7] | 0x80U;
  response[8] = exception;
  *response_length = 9U;
  return 0;
}

void zplc_modbus_tcp_stream_reset(zplc_modbus_tcp_stream_t *stream) {
  if (stream != NULL) {
    stream->used = 0U;
  }
}

int zplc_modbus_tcp_stream_feed(zplc_modbus_tcp_stream_t *stream, const uint8_t *data, size_t data_length,
                                zplc_modbus_tcp_adu_cb_t callback, void *context) {
  if (stream == NULL || (data == NULL && data_length != 0U) || callback == NULL) {
    return -EINVAL;
  }
  if (stream->used > sizeof(stream->bytes)) {
    return -EPROTO;
  }
  do {
    while (stream->used >= 6U) {
      uint16_t length = be16(&stream->bytes[4]);
      size_t frame_length;
      int rc;

      if (length < 2U || length > 254U) {
        return -EPROTO;
      }
      frame_length = 6U + length;
      if (stream->used < frame_length) {
        break;
      }
      rc = callback(stream->bytes, frame_length, context);
      if (rc < 0 && rc != ZPLC_MODBUS_TCP_DROP) {
        return rc;
      }
      stream->used -= frame_length;
      if (stream->used != 0U) {
        memmove(stream->bytes, stream->bytes + frame_length, stream->used);
      }
    }
    if (data_length == 0U) {
      return 0;
    }
    if (stream->used == sizeof(stream->bytes)) {
      return -EPROTO;
    }
    {
      size_t copy_length = data_length;
      size_t space = sizeof(stream->bytes) - stream->used;
      if (copy_length > space) {
        copy_length = space;
      }
      memcpy(stream->bytes + stream->used, data, copy_length);
      stream->used += copy_length;
      data += copy_length;
      data_length -= copy_length;
    }
  } while (true);
}

int zplc_modbus_tcp_process_adu(const uint8_t *request, size_t request_length, uint8_t *response, size_t response_capacity,
                                size_t *response_length, const zplc_modbus_tcp_ops_t *ops) {
  const uint8_t *pdu;
  size_t pdu_length;
  uint8_t function;
  uint16_t start;
  uint16_t count;
  bool bits;
  int rc;

  if (response_length == NULL) {
    return -EINVAL;
  }
  *response_length = 0U;
  if (request == NULL || response == NULL || ops == NULL || request_length < 8U || be16(&request[2]) != 0U || be16(&request[4]) < 2U ||
      be16(&request[4]) > 254U || request_length != 6U + be16(&request[4]) ||
      (request[6] != ops->unit_id && request[6] != 0U && request[6] != 255U)) {
    return ZPLC_MODBUS_TCP_DROP;
  }
  pdu = &request[7];
  pdu_length = request_length - 7U;
  function = pdu[0];

  switch (function) {
  case FC_READ_COILS:
  case FC_READ_DISCRETE_INPUTS:
  case FC_READ_HOLDING_REGISTERS:
  case FC_READ_INPUT_REGISTERS:
    if (pdu_length != 5U) {
      return exception_response(request, response, response_capacity, response_length, 0x03U);
    }
    start = be16(&pdu[1]);
    count = be16(&pdu[3]);
    bits = function == FC_READ_COILS || function == FC_READ_DISCRETE_INPUTS;
    if (count == 0U || (bits && count > 2000U) || (!bits && count > 125U)) {
      return exception_response(request, response, response_capacity, response_length, 0x03U);
    }
    if (!range_is_valid(start, count)) {
      return exception_response(request, response, response_capacity, response_length, 0x02U);
    }
    {
      size_t required = bits ? ((size_t)count + 7U) / 8U : (size_t)count * 2U;
      if (response_capacity < 9U + required || ops->read == NULL) {
        return -ENOSPC;
      }
    }
    response[7] = function;
    response[8] = 0U;
    rc = ops->read(start, count, &response[9], response_capacity - 9U, bits, area_for_fc(function), ops->context);
    if (rc < 0) {
      return exception_response(request, response, response_capacity, response_length, 0x02U);
    }
    if ((size_t)rc > response_capacity - 9U || rc > UINT8_MAX) {
      return -ENOSPC;
    }
    memcpy(response, request, 7U);
    response[8] = (uint8_t)rc;
    put_be16(&response[4], (uint16_t)(3U + rc));
    *response_length = 9U + (size_t)rc;
    return 0;

  case FC_WRITE_SINGLE_COIL:
  case FC_WRITE_SINGLE_REGISTER:
    if (pdu_length != 5U) {
      return exception_response(request, response, response_capacity, response_length, 0x03U);
    }
    if (function == FC_WRITE_SINGLE_COIL && !((pdu[3] == 0xFFU && pdu[4] == 0U) || (pdu[3] == 0U && pdu[4] == 0U))) {
      return exception_response(request, response, response_capacity, response_length, 0x03U);
    }
    if (response_capacity < 12U || ops->write == NULL) {
      return -ENOSPC;
    }
    rc = ops->write(be16(&pdu[1]), 1U, &pdu[3], function == FC_WRITE_SINGLE_COIL, false, area_for_fc(function), ops->context);
    if (rc < 0) {
      /* -EBUSY: the write queue of the scan is full (RT-010). The address is valid and the client may retry. */
      return exception_response(request, response, response_capacity, response_length, rc == -EBUSY ? 0x06U : 0x02U);
    }
    memcpy(response, request, 12U);
    put_be16(&response[4], 6U);
    *response_length = 12U;
    return 0;

  case FC_WRITE_MULTIPLE_COILS:
  case FC_WRITE_MULTIPLE_REGISTERS:
    if (pdu_length < 6U) {
      return exception_response(request, response, response_capacity, response_length, 0x03U);
    }
    start = be16(&pdu[1]);
    count = be16(&pdu[3]);
    bits = function == FC_WRITE_MULTIPLE_COILS;
    if (count == 0U || (bits && count > 1968U) || (!bits && count > 123U)) {
      return exception_response(request, response, response_capacity, response_length, 0x03U);
    }
    if (!range_is_valid(start, count)) {
      return exception_response(request, response, response_capacity, response_length, 0x02U);
    }
    {
      size_t data_length = bits ? ((size_t)count + 7U) / 8U : (size_t)count * 2U;
      if (pdu[5] != data_length || pdu_length != 6U + data_length) {
        return exception_response(request, response, response_capacity, response_length, 0x03U);
      }
    }
    if (response_capacity < 12U || ops->write == NULL) {
      return -ENOSPC;
    }
    rc = ops->write(start, count, &pdu[6], bits, true, area_for_fc(function), ops->context);
    if (rc < 0) {
      /* -EBUSY: the write queue of the scan is full (RT-010). The address is valid and the client may retry. */
      return exception_response(request, response, response_capacity, response_length, rc == -EBUSY ? 0x06U : 0x02U);
    }
    memcpy(response, request, 12U);
    put_be16(&response[4], 6U);
    *response_length = 12U;
    return 0;

  default:
    return exception_response(request, response, response_capacity, response_length, 0x01U);
  }
}

/* ============================================================================
 * The client side (COM-006, COM-012)
 * ============================================================================
 */

size_t zplc_modbus_tcp_build_request(uint8_t *adu, size_t capacity, uint16_t transaction, uint8_t unit_id, const uint8_t *pdu,
                                     size_t pdu_length) {
  if (adu == NULL || pdu == NULL || pdu_length == 0U || pdu_length > ZPLC_MODBUS_PDU_MAX ||
      capacity < ZPLC_MODBUS_TCP_MBAP_LEN + pdu_length) {
    return 0U;
  }
  put_be16(&adu[0], transaction);
  put_be16(&adu[2], 0U);
  put_be16(&adu[4], (uint16_t)(pdu_length + 1U));
  adu[6] = unit_id;
  memcpy(&adu[ZPLC_MODBUS_TCP_MBAP_LEN], pdu, pdu_length);
  return ZPLC_MODBUS_TCP_MBAP_LEN + pdu_length;
}

int zplc_modbus_tcp_response_pdu(const uint8_t *adu, size_t length, uint16_t transaction, uint8_t unit_id, const uint8_t **pdu,
                                 size_t *pdu_length) {
  if (adu == NULL || pdu == NULL || pdu_length == NULL) {
    return -EINVAL;
  }
  /* MBAP header and a function code at least */
  if (length < ZPLC_MODBUS_TCP_MBAP_LEN + 1U || be16(&adu[2]) != 0U || (size_t)be16(&adu[4]) + 6U != length ||
      be16(&adu[0]) != transaction || adu[6] != unit_id) {
    return -EPROTO;
  }
  *pdu = &adu[ZPLC_MODBUS_TCP_MBAP_LEN];
  *pdu_length = length - ZPLC_MODBUS_TCP_MBAP_LEN;
  return 0;
}

size_t zplc_modbus_pdu_read(uint8_t *pdu, uint8_t function, uint16_t address, uint16_t count) {
  pdu[0] = function;
  put_be16(&pdu[1], address);
  put_be16(&pdu[3], count);
  return 5U;
}

size_t zplc_modbus_pdu_write_single(uint8_t *pdu, uint8_t function, uint16_t address, uint16_t value) {
  pdu[0] = function;
  put_be16(&pdu[1], address);
  if (function == ZPLC_MODBUS_FC_WRITE_SINGLE_COIL) {
    put_be16(&pdu[3], value != 0U ? 0xFF00U : 0x0000U);
  } else {
    put_be16(&pdu[3], value);
  }
  return 5U;
}

/* The function of a response, or -EBADMSG for an exception response, -EPROTO for what is not one. */
static int response_function(const uint8_t *pdu, size_t length, uint8_t function) {
  if (pdu == NULL || length < 2U) {
    return -EPROTO;
  }
  if (pdu[0] == (uint8_t)(function | 0x80U)) {
    return -EBADMSG;
  }
  return pdu[0] == function ? 0 : -EPROTO;
}

int zplc_modbus_pdu_read_registers_response(const uint8_t *pdu, size_t length, uint16_t count, uint16_t *registers) {
  int rc = response_function(pdu, length, ZPLC_MODBUS_FC_READ_HOLDING_REGISTERS);
  uint16_t i;

  if (rc != 0) {
    return rc;
  }
  if (registers == NULL || pdu[1] != (uint8_t)(count * 2U) || (size_t)count * 2U > 250U || length != 2U + (size_t)count * 2U) {
    return -EPROTO;
  }
  for (i = 0U; i < count; i++) {
    registers[i] = be16(&pdu[2U + (size_t)i * 2U]);
  }
  return 0;
}

int zplc_modbus_pdu_read_coils_response(const uint8_t *pdu, size_t length, uint16_t count, uint8_t *bits, size_t bits_capacity) {
  int rc = response_function(pdu, length, ZPLC_MODBUS_FC_READ_COILS);
  const size_t bytes = ((size_t)count + 7U) / 8U;

  if (rc != 0) {
    return rc;
  }
  if (bits == NULL || bytes > bits_capacity || pdu[1] != bytes || length != 2U + bytes) {
    return -EPROTO;
  }
  memcpy(bits, &pdu[2], bytes);
  return 0;
}

int zplc_modbus_pdu_write_single_response(const uint8_t *pdu, size_t length, uint8_t function, uint16_t address, uint16_t value) {
  int rc;
  uint8_t expected[5];

  if (pdu == NULL || length < 2U) {
    return -EPROTO;
  }
  rc = response_function(pdu, length, function);
  if (rc != 0) {
    return rc;
  }
  (void)zplc_modbus_pdu_write_single(expected, function, address, value);
  return length == sizeof(expected) && memcmp(pdu, expected, sizeof(expected)) == 0 ? 0 : -EPROTO;
}
