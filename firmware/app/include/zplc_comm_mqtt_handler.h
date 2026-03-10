#ifndef ZPLC_COMM_MQTT_HANDLER_H
#define ZPLC_COMM_MQTT_HANDLER_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize the MQTT FB Handler subsystem.
 *
 * Registers the handler with the VM core dispatch table.
 */
int zplc_comm_mqtt_handler_init(void);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_COMM_MQTT_HANDLER_H */
