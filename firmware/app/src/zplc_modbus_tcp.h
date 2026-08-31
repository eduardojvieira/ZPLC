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

/* Private app seam shared by TCP/RTU and the native regression suite. */
int zplc_modbus_write_mapped(uint16_t address, uint16_t count, const uint8_t *data,
                             bool bits, bool multiple, zplc_modbus_area_t area);

#endif
