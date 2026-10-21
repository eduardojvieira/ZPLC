/**
 * @file zplc_io_zephyr.h
 * @brief Devicetree bindings of the generated I/O table (private to the Zephyr port)
 *
 * SPDX-License-Identifier: MIT
 *
 * firmware/zephyr/scripts/gen_io_table.py writes, at build time, one C file
 * from the board I/O description of firmware/app/boards/boards.json. It defines
 * the portable zplc_io_table() and the two binding arrays below. HAL gpio
 * channel n is entry n of the GPIO bindings (outputs first, then inputs); HAL
 * adc channel n is entry n of the ADC bindings.
 */

#ifndef ZPLC_IO_ZEPHYR_H
#define ZPLC_IO_ZEPHYR_H

#include <stdint.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#ifdef CONFIG_ADC
#include <zephyr/drivers/adc.h>
#endif

/** @brief One digital channel: the devicetree GPIO of the pin. */
struct zplc_io_gpio_binding {
  struct gpio_dt_spec spec; /**< spec.port == NULL: the node is absent (optional channel) */
  uint8_t is_output;        /**< 1 for an output, 0 for an input */
  uint8_t safe;             /**< Logical level of an output in the safe state */
  uint8_t required;         /**< 1: the channel must configure for the HAL to initialise */
};

extern const struct zplc_io_gpio_binding zplc_io_gpio_bindings[];
extern const uint16_t zplc_io_gpio_binding_count;

#ifdef CONFIG_ADC
/** @brief One analog input channel: the converter, its channel setup and resolution. */
struct zplc_io_adc_binding {
  const struct device *dev; /**< NULL: the converter node is absent (optional channel) */
  struct adc_channel_cfg cfg;
  uint8_t resolution; /**< Resolution in bits passed to adc_read */
  uint8_t required;
};

extern const struct zplc_io_adc_binding zplc_io_adc_bindings[];
extern const uint16_t zplc_io_adc_binding_count;
#endif

#endif /* ZPLC_IO_ZEPHYR_H */
