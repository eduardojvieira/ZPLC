/**
 * @file test_safe_state.c
 * @brief The safe value a project declares for an output decides the level of its pin (RT-023).
 *
 * SPDX-License-Identifier: MIT
 *
 * The runtime drives every digital output to its safe level whenever the program does not control it. The level
 * is off unless the board description says otherwise, and the project may declare another value for an output
 * in the SAFE segment of its artifact. This test loads artifacts that declare, and artifacts that do not, over a
 * board of its own (a table and a recording pin driver, below) and reads the level each pin was driven to.
 */

#define _POSIX_C_SOURCE 200809L

#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_sched_core.h>

#include "zplc_test_safe.h"

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                                       \
  do {                                                                         \
    test_count++;                                                              \
    if (!(cond)) {                                                             \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__);                  \
      fail_count++;                                                            \
    } else {                                                                   \
      printf("PASS: %s\n", msg);                                               \
    }                                                                          \
  } while (0)

/* ---- the board under test ----
 * DO0 and DO1 are two bits of one byte of the output image; DO1 is off in the safe state only because the
 * board description says it is ON (an active-low relay). DO9 is a plain output in the next byte. DI0 is an input
 * whose image address is the same byte and bit as DO0 (the two images are separate), and AO0 is an analog output.
 */
static const zplc_io_channel_t channels[] = {
    /* id    pin    offset kind                   dir                   bit hal safe req */
    {"DO0", "GP0", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U},
    {"DO1", "GP1", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 1U, 1U, 1U, 1U},
    {"DO9", "GP9", 1U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_OUTPUT, 1U, 2U, 0U, 1U},
    {"AO0", "GP20", 4U, ZPLC_IO_KIND_ANALOG, ZPLC_IO_DIR_OUTPUT, 0U, 0U, 0U, 1U},
    {"DI0", "GP15", 0U, ZPLC_IO_KIND_DIGITAL, ZPLC_IO_DIR_INPUT, 0U, 3U, 0U, 1U},
};

static const zplc_io_table_t table = {"safe-state-board", 0x5AFE5AFEU, 1U, 4U, 5U, channels};

const zplc_io_table_t *zplc_io_table(void) { return &table; }

/* ---- the pins: the last level written to each HAL channel, and how many writes were made ---- */
static uint8_t pin_level[4];
static unsigned pin_writes;

zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value) {
  (void)channel;
  *value = 0U;
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value) {
  if (channel >= sizeof(pin_level)) {
    return ZPLC_HAL_ERROR;
  }
  pin_level[channel] = value;
  pin_writes++;
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
  (void)channel;
  *value = 0U;
  return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value) {
  (void)channel;
  (void)value;
  return ZPLC_HAL_NOT_IMPL;
}

/* ---- the rest of the HAL the core needs: one thread, so a mutex is a flag ---- */
static int mutex_object;

zplc_hal_mutex_t zplc_hal_mutex_create(void) { return &mutex_object; }
zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex) {
  (void)mutex;
  return ZPLC_HAL_OK;
}
zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex) {
  (void)mutex;
  return ZPLC_HAL_OK;
}
zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex) {
  (void)mutex;
  return ZPLC_HAL_OK;
}
uint32_t zplc_hal_tick(void) { return 0U; }

#include "../src/hal/common/zplc_io_common.inc"

/* ---- artifacts ---- */
static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

static size_t program_declaring(uint8_t *file, size_t capacity, const uint8_t *entries, size_t entries_size) {
  const size_t length = zplc_test_minimal_program(file);

  return entries == NULL ? length : zplc_test_append_safe(file, length, capacity, entries, entries_size);
}

static int load(const uint8_t *file, size_t length) {
  return zplc_core_load(file, length, workspace, sizeof(workspace));
}

/* The levels the safe state puts on the pins, read from the pins themselves. */
static void drive_safe_and_read(uint8_t *do0, uint8_t *do1, uint8_t *do9) {
  memset(pin_level, 0xEE, sizeof(pin_level));
  CHECK(zplc_io_drive_safe(NULL) == ZPLC_HAL_OK, "the safe state is driven");
  *do0 = pin_level[0];
  *do1 = pin_level[1];
  *do9 = pin_level[2];
}

static void test_the_board_decides_when_the_program_declares_nothing(void) {
  uint8_t file[256];
  uint8_t do0, do1, do9;
  size_t length;

  printf("\n=== Test: no declaration, the board's levels (RT-023) ===\n");
  CHECK(zplc_core_init() == 0, "the core starts");
  CHECK(zplc_core_declared_safe_count() == 0U, "no program declares nothing");
  drive_safe_and_read(&do0, &do1, &do9);
  CHECK(do0 == 0U && do9 == 0U, "an output is off in the safe state");
  CHECK(do1 == 1U, "unless the board description says it is on");

  length = program_declaring(file, sizeof(file), NULL, 0U);
  CHECK(load(file, length) == 0, "a program without a SAFE segment is loaded");
  CHECK(zplc_core_declared_safe_count() == 0U, "it declares nothing");
  drive_safe_and_read(&do0, &do1, &do9);
  CHECK(do0 == 0U && do1 == 1U && do9 == 0U, "the levels are the board's");
}

static void test_a_declared_value_replaces_the_default_in_both_directions(void) {
  uint8_t file[256];
  uint8_t do0, do1, do9;
  uint8_t value = 0xEEU;
  const uint8_t entries[] = {ZPLC_TEST_SAFE(0, 0, 1), ZPLC_TEST_SAFE(0, 1, 0)};
  const size_t length = program_declaring(file, sizeof(file), entries, sizeof(entries));

  printf("\n=== Test: a declared value is the level of the pin (RT-023) ===\n");
  CHECK(length != 0U && load(file, length) == 0, "a program that declares two outputs is loaded");
  CHECK(zplc_core_declared_safe_count() == 2U, "the core holds both declarations");
  CHECK(zplc_core_declared_safe(0U, 0U, &value) == 1 && value == 1U, "DO0 is declared on");
  CHECK(zplc_core_declared_safe(0U, 1U, &value) == 1 && value == 0U, "DO1 is declared off");
  CHECK(zplc_core_declared_safe(1U, 1U, &value) == 0, "DO9 is not declared");
  drive_safe_and_read(&do0, &do1, &do9);
  CHECK(do0 == 1U, "DO0 is driven on: the declaration turns an output that is off by default on");
  CHECK(do1 == 0U, "DO1 is driven off: and one that the board has on, off");
  CHECK(do9 == 0U, "DO9, which it does not declare, keeps the board's level");
}

static void test_the_declaration_belongs_to_the_program(void) {
  uint8_t file[256];
  uint8_t do0, do1, do9;
  const uint8_t entries[] = {ZPLC_TEST_SAFE(1, 1, 1)};
  size_t length = program_declaring(file, sizeof(file), entries, sizeof(entries));

  printf("\n=== Test: the declaration is the program's and ends with it (RT-023) ===\n");
  CHECK(load(file, length) == 0, "a program declaring DO9 is loaded");
  drive_safe_and_read(&do0, &do1, &do9);
  CHECK(do9 == 1U, "DO9 is on in the safe state");

  /* a program that is refused does not change what is in force */
  file[40U] ^= 0x01U;
  CHECK(load(file, length) != 0, "an artifact that does not verify is refused");
  drive_safe_and_read(&do0, &do1, &do9);
  CHECK(do9 == 1U && zplc_core_declared_safe_count() == 1U, "the refusal leaves the declaration of the program in force");

  length = program_declaring(file, sizeof(file), NULL, 0U);
  CHECK(load(file, length) == 0, "a program that declares nothing replaces it");
  drive_safe_and_read(&do0, &do1, &do9);
  CHECK(do9 == 0U && zplc_core_declared_safe_count() == 0U, "its declaration is gone: DO9 is off again");

  length = program_declaring(file, sizeof(file), entries, sizeof(entries));
  CHECK(load(file, length) == 0, "a program declaring DO9 is loaded again");
  CHECK(zplc_mem_init() == 0, "the memory is initialised");
  drive_safe_and_read(&do0, &do1, &do9);
  CHECK(do9 == 0U && zplc_core_declared_safe_count() == 0U, "with no program there is no declaration");
}

static void test_the_declaration_is_checked_against_the_board(void) {
  const uint8_t on_do0[] = {ZPLC_TEST_SAFE(0, 0, 1)};
  const uint8_t on_do1_and_do9[] = {ZPLC_TEST_SAFE(0, 1, 0), ZPLC_TEST_SAFE(1, 1, 1)};
  const uint8_t no_bit_there[] = {ZPLC_TEST_SAFE(0, 4, 1)};
  const uint8_t no_byte_there[] = {ZPLC_TEST_SAFE(7, 0, 1)};
  const uint8_t analog_word[] = {ZPLC_TEST_SAFE(4, 0, 1)};
  const uint8_t one_good_one_bad[] = {ZPLC_TEST_SAFE(0, 0, 1), ZPLC_TEST_SAFE(0, 5, 1)};

  printf("\n=== Test: a declaration for an output the board has (RT-023) ===\n");
  CHECK(zplc_io_declared_safe_fits_board(NULL, 0U) == ZPLC_LOADER_OK, "no declaration fits every board");
  CHECK(zplc_io_declared_safe_fits_board(on_do0, 1U) == ZPLC_LOADER_OK, "a digital output of the board fits");
  CHECK(zplc_io_declared_safe_fits_board(on_do1_and_do9, 2U) == ZPLC_LOADER_OK, "two of them fit");
  CHECK(zplc_io_declared_safe_fits_board(no_bit_there, 1U) == ZPLC_LOADER_ERR_SAFE,
        "a bit of the image that is no output is refused");
  CHECK(zplc_io_declared_safe_fits_board(no_byte_there, 1U) == ZPLC_LOADER_ERR_SAFE,
        "a byte of the image that is no output is refused");
  CHECK(zplc_io_declared_safe_fits_board(analog_word, 1U) == ZPLC_LOADER_ERR_SAFE,
        "an analog output has no on or off to declare");
  CHECK(zplc_io_declared_safe_fits_board(one_good_one_bad, 2U) == ZPLC_LOADER_ERR_SAFE,
        "one entry the board does not have refuses the whole declaration");
}

int main(void) {
  test_the_board_decides_when_the_program_declares_nothing();
  test_a_declared_value_replaces_the_default_in_both_directions();
  test_the_declaration_belongs_to_the_program();
  test_the_declaration_is_checked_against_the_board();

  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
