/**
 * @file zplc_io_common.inc
 * @brief Port-independent accessors of the I/O table (IO-001, IO-002, IO-007)
 *
 * SPDX-License-Identifier: MIT
 *
 * Each port's HAL source includes this file once, after zplc_hal.h, and defines
 * zplc_io_table() itself: the Zephyr port from the table the build generates
 * from the board description, the POSIX and WASM ports as an empty table. The
 * accessors below are the same on every port, so the scheduler and the tests
 * see one behaviour. The file defines functions and so must be included from
 * exactly one translation unit of a build.
 */

size_t zplc_io_channel_count(void) { return zplc_io_table()->channel_count; }

const zplc_io_channel_t *zplc_io_channel_at(size_t index) {
  const zplc_io_table_t *table = zplc_io_table();

  if (table->channels == NULL || index >= table->channel_count) {
    return NULL;
  }
  return &table->channels[index];
}

zplc_hal_result_t zplc_io_read_channel(const zplc_io_channel_t *channel,
                                       uint16_t *value) {
  if (channel == NULL || value == NULL) {
    return ZPLC_HAL_ERROR;
  }
  if (channel->kind == ZPLC_IO_KIND_ANALOG) {
    return zplc_hal_adc_read(channel->hal_channel, value);
  }
  {
    uint8_t level = 0U;
    zplc_hal_result_t result = zplc_hal_gpio_read(channel->hal_channel, &level);

    *value = level;
    return result;
  }
}

zplc_hal_result_t zplc_io_write_channel(const zplc_io_channel_t *channel,
                                        uint16_t value) {
  if (channel == NULL || channel->direction != ZPLC_IO_DIR_OUTPUT) {
    return ZPLC_HAL_ERROR;
  }
  if (channel->kind == ZPLC_IO_KIND_ANALOG) {
    return zplc_hal_dac_write(channel->hal_channel, value);
  }
  return zplc_hal_gpio_write(channel->hal_channel, value != 0U ? 1U : 0U);
}

uint16_t zplc_io_image_get(const uint8_t *image, size_t size,
                           const zplc_io_channel_t *channel) {
  if (image == NULL || channel == NULL) {
    return 0U;
  }
  if (channel->kind == ZPLC_IO_KIND_ANALOG) {
    if ((size_t)channel->image_offset + 2U > size) {
      return 0U;
    }
    return (uint16_t)((uint16_t)image[channel->image_offset] |
                      (uint16_t)((uint16_t)image[channel->image_offset + 1U] << 8));
  }
  if ((size_t)channel->image_offset >= size) {
    return 0U;
  }
  return (uint16_t)((image[channel->image_offset] >> channel->bit) & 1U);
}
