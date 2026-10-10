/**
 * @file test_io_table.c
 * @brief The I/O table accessors every port shares (IO-001, IO-002, IO-007).
 *
 * The accessors live in src/hal/common/zplc_io_common.inc and are included by
 * each port's HAL. This test includes the same file over a table of its own and
 * stub HAL functions, so it proves what the scheduler relies on: a channel is
 * data (a row of the table), its image address and its HAL number decide where
 * it is read from and written to, and nothing else names a channel.
 */

#define _POSIX_C_SOURCE 200809L

#include <zplc_hal.h>

#include <stdio.h>
#include <string.h>

static int test_count = 0;
static int fail_count = 0;

#define TEST_ASSERT(cond, msg) do { \
    test_count++; \
    if (!(cond)) { \
        fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
        fail_count++; \
    } else { \
        printf("PASS: %s\n", msg); \
    } \
} while (0)

/* ---- the board under test: 2 outputs, 1 input, 1 analog input ---- */
static const zplc_io_channel_t channels[] = {
    /* id    pin   offset kind                  dir                  bit hal safe req */
    {"DO0",  "GP0", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U},
    {"DO9",  "GP9", 1U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 1U, 1U, 0U, 1U},
    {"DI0",  "GP15", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 0U, 2U, 0U, 1U},
    {"AI0",  "GP26", 8U, ZPLC_IO_KIND_ANALOG, ZPLC_IO_DIR_INPUT, 0U, 0U, 0U, 1U},
};

static const zplc_io_table_t table = {"test-board", 0x12345678U, 10U, 2U, 4U, channels};

const zplc_io_table_t *zplc_io_table(void) { return &table; }

/* ---- stub HAL: what the accessors forward to ---- */
static uint8_t last_gpio_channel;
static uint8_t last_gpio_value;
static uint8_t gpio_input_level = 1U;
static zplc_hal_result_t gpio_result = ZPLC_HAL_OK;
static uint8_t last_adc_channel;
static uint16_t adc_value = 0x0ABCU;
static zplc_hal_result_t adc_result = ZPLC_HAL_OK;

zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value) {
    last_gpio_channel = channel;
    *value = gpio_input_level;
    return gpio_result;
}

zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value) {
    last_gpio_channel = channel;
    last_gpio_value = value;
    return gpio_result;
}

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
    last_adc_channel = channel;
    *value = adc_value;
    return adc_result;
}

zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value) {
    (void)channel;
    (void)value;
    return ZPLC_HAL_NOT_IMPL;
}

#include "../src/hal/common/zplc_io_common.inc"

static void test_the_table_is_data(void) {
    printf("\n=== Test: the table lists the channels of the board ===\n");
    TEST_ASSERT(zplc_io_channel_count() == 4U, "four channels are listed");
    TEST_ASSERT(strcmp(zplc_io_channel_at(1U)->id, "DO9") == 0, "channel 1 is DO9");
    TEST_ASSERT(zplc_io_channel_at(4U) == NULL, "past the end is NULL");
}

static void test_a_digital_input_is_read_through_its_hal_number(void) {
    uint16_t value = 0U;

    printf("\n=== Test: reading a digital input ===\n");
    gpio_result = ZPLC_HAL_OK;
    TEST_ASSERT(zplc_io_read_channel(zplc_io_channel_at(2U), &value) == ZPLC_HAL_OK, "the read succeeds");
    TEST_ASSERT(last_gpio_channel == 2U, "the HAL number of DI0 is used");
    TEST_ASSERT(value == 1U, "the level is the value");
    gpio_result = ZPLC_HAL_NOT_IMPL;
    TEST_ASSERT(zplc_io_read_channel(zplc_io_channel_at(2U), &value) == ZPLC_HAL_NOT_IMPL,
                "a channel the port cannot read reports not implemented");
    gpio_result = ZPLC_HAL_OK;
}

static void test_an_analog_input_is_read_through_the_converter(void) {
    uint16_t value = 0U;

    printf("\n=== Test: reading an analog input ===\n");
    TEST_ASSERT(zplc_io_read_channel(zplc_io_channel_at(3U), &value) == ZPLC_HAL_OK, "the read succeeds");
    TEST_ASSERT(last_adc_channel == 0U, "the converter channel of AI0 is used");
    TEST_ASSERT(value == 0x0ABCU, "the raw converter value is returned");
    adc_result = ZPLC_HAL_NOT_IMPL;
    TEST_ASSERT(zplc_io_read_channel(zplc_io_channel_at(3U), &value) == ZPLC_HAL_NOT_IMPL,
                "an absent converter reports not implemented");
    adc_result = ZPLC_HAL_OK;
}

static void test_an_output_is_written_with_a_logical_level(void) {
    printf("\n=== Test: writing an output ===\n");
    TEST_ASSERT(zplc_io_write_channel(zplc_io_channel_at(1U), 7U) == ZPLC_HAL_OK, "the write succeeds");
    TEST_ASSERT(last_gpio_channel == 1U && last_gpio_value == 1U, "any non-zero value is level 1 on HAL channel 1");
    TEST_ASSERT(zplc_io_write_channel(zplc_io_channel_at(0U), 0U) == ZPLC_HAL_OK, "level 0 is written");
    TEST_ASSERT(last_gpio_channel == 0U && last_gpio_value == 0U, "on HAL channel 0");
    TEST_ASSERT(zplc_io_write_channel(zplc_io_channel_at(2U), 1U) == ZPLC_HAL_ERROR, "an input cannot be written");
    TEST_ASSERT(zplc_io_write_channel(NULL, 1U) == ZPLC_HAL_ERROR, "a NULL channel is an error");
}

static void test_the_image_helpers_follow_the_channel_address(void) {
    uint8_t image[16];

    printf("\n=== Test: reading the image ===\n");
    memset(image, 0, sizeof(image));
    image[1] = 0x02U; /* %QX1.1 */
    TEST_ASSERT(zplc_io_image_get(image, sizeof(image), zplc_io_channel_at(1U)) == 1U, "DO9 is bit 1 of byte 1");
    TEST_ASSERT(zplc_io_image_get(image, sizeof(image), zplc_io_channel_at(0U)) == 0U, "DO0 is bit 0 of byte 0, still clear");
    image[8] = 0xEFU;
    image[9] = 0xBEU; /* %IW4, little endian */
    TEST_ASSERT(zplc_io_image_get(image, sizeof(image), zplc_io_channel_at(3U)) == 0xBEEFU,
                "an analog word is little endian at its offset");
    TEST_ASSERT(zplc_io_image_get(image, 9U, zplc_io_channel_at(3U)) == 0U,
                "a word that does not fit the buffer reads as zero");
    TEST_ASSERT(zplc_io_image_get(NULL, 0U, zplc_io_channel_at(0U)) == 0U, "no image reads as zero");
}

int main(void) {
    test_the_table_is_data();
    test_a_digital_input_is_read_through_its_hal_number();
    test_an_analog_input_is_read_through_the_converter();
    test_an_output_is_written_with_a_logical_level();
    test_the_image_helpers_follow_the_channel_address();

    printf("\n%d checks, %d failed\n", test_count, fail_count);
    return fail_count == 0 ? 0 : 1;
}
