#ifndef ZPLC_COMM_MODBUS_HANDLER_H
#define ZPLC_COMM_MODBUS_HANDLER_H

#include <stdbool.h>
#include <stdint.h>

#include <zplc_comm_dispatch.h>

#ifdef __cplusplus
extern "C" {
#endif

int zplc_comm_modbus_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len, zplc_comm_call_t call);
int zplc_comm_modbus_handler_init(void);

#ifdef __cplusplus
}
#endif

#endif
