#ifndef ZPLC_COMM_MODBUS_HANDLER_H
#define ZPLC_COMM_MODBUS_HANDLER_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize the Modbus Async FB Handler subsystem.
 *
 * Registers the handler with the VM core dispatch table and starts the
 * background background thread for processing transactions.
 */
int zplc_comm_modbus_handler_init(void);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_COMM_MODBUS_HANDLER_H */
