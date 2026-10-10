/**
 * @file zplc_hal_zephyr.c
 * @brief ZPLC Hardware Abstraction Layer - Zephyr RTOS Implementation
 *
 * SPDX-License-Identifier: MIT
 *
 * This is the Zephyr-native implementation of the ZPLC HAL.
 * It uses Zephyr kernel APIs for timing, GPIO subsystem for I/O,
 * and the Settings subsystem for persistence.
 *
 * Build: This file is compiled when CONFIG_ZPLC is enabled.
 */

#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_program_store.h>

#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/util.h>
#include <zephyr/sys/printk.h>
#include <errno.h>

/* Settings subsystem for NVS persistence */
#ifdef CONFIG_SETTINGS
#include <zephyr/settings/settings.h>
#endif

#ifdef CONFIG_NETWORKING
#include <zephyr/net/socket.h>
#include <zephyr/net/net_if.h>
#include <zephyr/net/net_ip.h>
#include <zephyr/net/net_core.h>
#endif

#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

/* ============================================================================
 * GPIO Configuration
 * ============================================================================
 *
 * We use Zephyr's standard DeviceTree aliases for GPIO:
 *   - led0, led1, led2, led3   -> Digital Outputs (DO0-DO3)
 *   - sw0, sw1, sw2, sw3       -> Digital Inputs (DI0-DI3)
 *
 * This maps to the standard aliases most Zephyr boards define.
 * The overlay can remap these as needed.
 */

/** @brief Maximum GPIO channels supported */
#define ZPLC_GPIO_MAX_CHANNELS 8

/** @brief Number of output channels (LEDs) */
#define ZPLC_GPIO_OUTPUT_COUNT 4

/** @brief Number of input channels (buttons/switches) */
#define ZPLC_GPIO_INPUT_COUNT 4

/**
 * @brief GPIO channel descriptor
 */
typedef struct {
  struct gpio_dt_spec spec; /**< DeviceTree GPIO spec */
  bool configured;          /**< Successfully configured */
  bool is_output;           /**< true=output, false=input */
} zplc_gpio_channel_t;

/** @brief GPIO channel table - outputs first, then inputs */
static zplc_gpio_channel_t gpio_channels[ZPLC_GPIO_MAX_CHANNELS];

/** @brief HAL initialization state */
static bool hal_initialized = false;

#ifdef CONFIG_ZTEST
/* Test-only one-shot failure before a shutdown GPIO safe-off write. */
static bool test_fail_next_safe_off;

void zplc_hal_test_fail_next_safe_off(void) { test_fail_next_safe_off = true; }
#endif

/* ============================================================================
 * DeviceTree GPIO Specifications
 * ============================================================================
 * Using conditional macros to handle boards that don't define all aliases.
 */

/* Output channels (LEDs) */
#if DT_NODE_EXISTS(DT_ALIAS(led0))
#define ZPLC_LED0_SPEC GPIO_DT_SPEC_GET(DT_ALIAS(led0), gpios)
#define ZPLC_HAS_LED0 1
#else
#define ZPLC_HAS_LED0 0
#endif

#if DT_NODE_EXISTS(DT_ALIAS(led1))
#define ZPLC_LED1_SPEC GPIO_DT_SPEC_GET(DT_ALIAS(led1), gpios)
#define ZPLC_HAS_LED1 1
#else
#define ZPLC_HAS_LED1 0
#endif

#if DT_NODE_EXISTS(DT_ALIAS(led2))
#define ZPLC_LED2_SPEC GPIO_DT_SPEC_GET(DT_ALIAS(led2), gpios)
#define ZPLC_HAS_LED2 1
#else
#define ZPLC_HAS_LED2 0
#endif

#if DT_NODE_EXISTS(DT_ALIAS(led3))
#define ZPLC_LED3_SPEC GPIO_DT_SPEC_GET(DT_ALIAS(led3), gpios)
#define ZPLC_HAS_LED3 1
#else
#define ZPLC_HAS_LED3 0
#endif

/* Input channels (buttons/switches) */
#if DT_NODE_EXISTS(DT_ALIAS(sw0))
#define ZPLC_SW0_SPEC GPIO_DT_SPEC_GET(DT_ALIAS(sw0), gpios)
#define ZPLC_HAS_SW0 1
#else
#define ZPLC_HAS_SW0 0
#endif

#if DT_NODE_EXISTS(DT_ALIAS(sw1))
#define ZPLC_SW1_SPEC GPIO_DT_SPEC_GET(DT_ALIAS(sw1), gpios)
#define ZPLC_HAS_SW1 1
#else
#define ZPLC_HAS_SW1 0
#endif

#if DT_NODE_EXISTS(DT_ALIAS(sw2))
#define ZPLC_SW2_SPEC GPIO_DT_SPEC_GET(DT_ALIAS(sw2), gpios)
#define ZPLC_HAS_SW2 1
#else
#define ZPLC_HAS_SW2 0
#endif

#if DT_NODE_EXISTS(DT_ALIAS(sw3))
#define ZPLC_SW3_SPEC GPIO_DT_SPEC_GET(DT_ALIAS(sw3), gpios)
#define ZPLC_HAS_SW3 1
#else
#define ZPLC_HAS_SW3 0
#endif

/* ============================================================================
 * Timing Functions
 * ============================================================================
 */

/**
 * @brief Get current system tick in milliseconds.
 *
 * Uses Zephyr's k_uptime_get() which returns milliseconds since boot.
 * This is monotonic and suitable for cycle timing.
 */
uint32_t zplc_hal_tick(void) { return (uint32_t)k_uptime_get(); }

/**
 * @brief Sleep for the specified number of milliseconds.
 *
 * Uses Zephyr's k_msleep() for cooperative/preemptive sleep.
 */
void zplc_hal_sleep(uint32_t ms) { k_msleep((int32_t)ms); }

/* ============================================================================
 * GPIO Functions
 * ============================================================================
 */

/**
 * @brief Configure a single GPIO channel.
 *
 * @param idx Channel index in gpio_channels array
 * @param spec GPIO DeviceTree spec
 * @param is_output true for output, false for input
 * @return 0 on success, negative error code on failure
 */
static int __maybe_unused gpio_channel_configure(
    uint8_t idx, const struct gpio_dt_spec *spec, bool is_output) {
  int ret;
  gpio_flags_t flags;

  if (idx >= ZPLC_GPIO_MAX_CHANNELS) {
    return -EINVAL;
  }

  /* Copy spec to channel table */
  gpio_channels[idx].spec = *spec;
  gpio_channels[idx].is_output = is_output;
  gpio_channels[idx].configured = false;

  /* Check if device is ready */
  if (!gpio_is_ready_dt(spec)) {
    zplc_hal_log("[HAL] GPIO channel %d: device not ready\n", idx);
    return -ENODEV;
  }

  /* Configure pin direction */
  if (is_output) {
    flags = GPIO_OUTPUT_INACTIVE;
  } else {
    flags = GPIO_INPUT;
  }

  ret = gpio_pin_configure_dt(spec, flags);
  if (ret < 0) {
    zplc_hal_log("[HAL] GPIO channel %d: configure failed (%d)\n", idx, ret);
    return ret;
  }

  gpio_channels[idx].configured = true;
  zplc_hal_log("[HAL] GPIO channel %d: configured as %s\n", idx,
               is_output ? "OUTPUT" : "INPUT");

  return 0;
}

/**
 * @brief Initialize all GPIO channels from DeviceTree.
 *
 * @return Number of channels successfully configured
 */
static int gpio_init_all(void) {
  int configured = 0;

  zplc_hal_log("[HAL] Configuring GPIO channels...\n");

  /* Clear channel table */
  memset(gpio_channels, 0, sizeof(gpio_channels));

  /* Configure output channels (DO0-DO3 mapped to led0-led3) */
#if ZPLC_HAS_LED0
  {
    static const struct gpio_dt_spec led0 = ZPLC_LED0_SPEC;
    if (gpio_channel_configure(0, &led0, true) == 0)
      configured++;
  }
#endif
#if ZPLC_HAS_LED1
  {
    static const struct gpio_dt_spec led1 = ZPLC_LED1_SPEC;
    if (gpio_channel_configure(1, &led1, true) == 0)
      configured++;
  }
#endif
#if ZPLC_HAS_LED2
  {
    static const struct gpio_dt_spec led2 = ZPLC_LED2_SPEC;
    if (gpio_channel_configure(2, &led2, true) == 0)
      configured++;
  }
#endif
#if ZPLC_HAS_LED3
  {
    static const struct gpio_dt_spec led3 = ZPLC_LED3_SPEC;
    if (gpio_channel_configure(3, &led3, true) == 0)
      configured++;
  }
#endif

  /* Configure input channels (DI0-DI3 mapped to sw0-sw3) */
#if ZPLC_HAS_SW0
  {
    static const struct gpio_dt_spec sw0 = ZPLC_SW0_SPEC;
    if (gpio_channel_configure(4, &sw0, false) == 0)
      configured++;
  }
#endif
#if ZPLC_HAS_SW1
  {
    static const struct gpio_dt_spec sw1 = ZPLC_SW1_SPEC;
    if (gpio_channel_configure(5, &sw1, false) == 0)
      configured++;
  }
#endif
#if ZPLC_HAS_SW2
  {
    static const struct gpio_dt_spec sw2 = ZPLC_SW2_SPEC;
    if (gpio_channel_configure(6, &sw2, false) == 0)
      configured++;
  }
#endif
#if ZPLC_HAS_SW3
  {
    static const struct gpio_dt_spec sw3 = ZPLC_SW3_SPEC;
    if (gpio_channel_configure(7, &sw3, false) == 0)
      configured++;
  }
#endif

  zplc_hal_log("[HAL] GPIO: %d channels configured\n", configured);
  return configured;
}

static uint8_t gpio_output_configured_mask(void) {
  uint8_t mask = 0U;
  uint8_t channel;

  for (channel = 0U; channel < ZPLC_GPIO_OUTPUT_COUNT; channel++) {
    if (gpio_channels[channel].configured) {
      mask |= (uint8_t)BIT(channel);
    }
  }

  return mask;
}

/**
 * @brief Read a digital input channel.
 *
 * Channel mapping:
 *   0-3: Output channels (can read back state)
 *   4-7: Input channels (buttons/switches)
 */
zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value) {
  int ret;

  if (value == NULL) {
    return ZPLC_HAL_ERROR;
  }

  if (channel >= ZPLC_GPIO_MAX_CHANNELS) {
    *value = 0;
    return ZPLC_HAL_ERROR;
  }

  if (!gpio_channels[channel].configured) {
    *value = 0;
    return ZPLC_HAL_NOT_IMPL;
  }

  ret = gpio_pin_get_dt(&gpio_channels[channel].spec);
  if (ret < 0) {
    *value = 0;
    return ZPLC_HAL_ERROR;
  }

  *value = (uint8_t)(ret ? 1 : 0);
  return ZPLC_HAL_OK;
}

/**
 * @brief Write to a digital output channel.
 *
 * Only channels 0-3 (outputs) can be written.
 */
zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value) {
  int ret;

  if (!hal_initialized) {
    return ZPLC_HAL_ERROR;
  }

  if (channel >= ZPLC_GPIO_OUTPUT_COUNT) {
    return ZPLC_HAL_ERROR;
  }

  if (!gpio_channels[channel].configured) {
    if ((CONFIG_ZPLC_REQUIRED_GPIO_OUTPUT_MASK & BIT(channel)) != 0U) {
      return ZPLC_HAL_ERROR;
    }
    return ZPLC_HAL_NOT_IMPL;
  }

  if (!gpio_channels[channel].is_output) {
    return ZPLC_HAL_ERROR;
  }

  ret = gpio_pin_set_dt(&gpio_channels[channel].spec, value ? 1 : 0);
  if (ret < 0) {
    return ZPLC_HAL_ERROR;
  }

  return ZPLC_HAL_OK;
}

/* ============================================================================
 * Analog I/O Functions
 * ============================================================================
 */

#ifdef CONFIG_ADC

#include <zephyr/drivers/adc.h>

/* Get ADC device from DeviceTree */
#define ADC_NODE DT_NODELABEL(adc)

#if DT_NODE_EXISTS(ADC_NODE)

static const struct device *adc_dev = DEVICE_DT_GET(ADC_NODE);

/* Maximum number of ADC channels to support */
#define ZPLC_ADC_MAX_CHANNELS 5

/* Channel configuration for each channel */
static struct adc_channel_cfg adc_channel_cfgs[ZPLC_ADC_MAX_CHANNELS];

/* Track which channels have been configured */
static bool adc_channel_configured[ZPLC_ADC_MAX_CHANNELS] = {false};

/** @brief ADC initialized flag */
static bool adc_initialized = false;

/**
 * @brief Initialize ADC device.
 */
static int adc_init_device(void) {
  if (adc_initialized) {
    return 0;
  }

  if (!device_is_ready(adc_dev)) {
    zplc_hal_log("[HAL] ADC device not ready\n");
    return -ENODEV;
  }

  adc_initialized = true;
  zplc_hal_log("[HAL] ADC device initialized\n");
  return 0;
}

/**
 * @brief Configure an ADC channel if not already configured.
 */
static int adc_ensure_channel_configured(uint8_t channel) {
  int ret;

  if (channel >= ZPLC_ADC_MAX_CHANNELS) {
    return -EINVAL;
  }

  if (adc_channel_configured[channel]) {
    return 0;
  }

  /* Configure channel settings */
  if (channel == 4) {
    /* Channel 4 is the internal temperature sensor on RP2040.
     * On Zephyr, the sensor is enabled automatically when channel 4 is read.
     * No explicit enable call is needed (unlike Pico SDK). */

    adc_channel_cfgs[channel] = (struct adc_channel_cfg){
        .gain = ADC_GAIN_1,
        .reference = ADC_REF_INTERNAL,
        .acquisition_time =
            ADC_ACQ_TIME_DEFAULT, /* 20us rejected by driver, using default */
        .channel_id = channel,
        .differential = 0,
    };
  } else {
    /* Default for external channels */
    adc_channel_cfgs[channel] = (struct adc_channel_cfg){
        .gain = ADC_GAIN_1,
        .reference = ADC_REF_INTERNAL,
        .acquisition_time = ADC_ACQ_TIME_DEFAULT,
        .channel_id = channel,
        .differential = 0,
    };
  }

  ret = adc_channel_setup(adc_dev, &adc_channel_cfgs[channel]);
  if (ret < 0) {
    zplc_hal_log("[HAL] ADC channel %u setup failed: %d\n", channel, ret);
    return ret;
  }

  adc_channel_configured[channel] = true;
  zplc_hal_log("[HAL] ADC channel %u configured\n", channel);
  return 0;
}

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
  int ret;
  int16_t sample_buffer;

  if (value == NULL) {
    return ZPLC_HAL_ERROR;
  }

  if (channel >= ZPLC_ADC_MAX_CHANNELS) {
    *value = 0;
    return ZPLC_HAL_ERROR;
  }

  /* Initialize ADC device if not done yet */
  ret = adc_init_device();
  if (ret < 0) {
    *value = 0;
    return ZPLC_HAL_ERROR;
  }

  /* Ensure channel is configured */
  ret = adc_ensure_channel_configured(channel);
  if (ret < 0) {
    *value = 0;
    return ZPLC_HAL_ERROR;
  }

  /* Configure and execute ADC sequence */
  struct adc_sequence sequence = {
      .channels = BIT(channel),
      .buffer = &sample_buffer,
      .buffer_size = sizeof(sample_buffer),
      .resolution = 12, /* 12-bit resolution for RP2040 */
      .oversampling = 0,
  };

  ret = adc_read(adc_dev, &sequence);
  if (ret < 0) {
    zplc_hal_log("[HAL] ADC read failed: %d\n", ret);
    *value = 0;
    return ZPLC_HAL_ERROR;
  }

  /* Return raw value (12-bit, 0-4095) */
  *value = (uint16_t)sample_buffer;
  return ZPLC_HAL_OK;
}

#else /* No ADC node in DT */

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
  static bool adc_missing_warned = false;

  (void)channel;
  if (value)
    *value = 0;

  if (!adc_missing_warned) {
    zplc_hal_log("[HAL] ADC: No ADC device in DeviceTree\n");
    adc_missing_warned = true;
  }

  return ZPLC_HAL_NOT_IMPL;
}

#endif /* DT_NODE_EXISTS(ADC_NODE) */

#else /* !CONFIG_ADC */

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
  (void)channel;
  if (value)
    *value = 0;
  return ZPLC_HAL_NOT_IMPL;
}

#endif /* CONFIG_ADC */

zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value) {
  (void)channel;
  (void)value;

  /* TODO: Implement via PWM for Pico (no native DAC) */
  return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Persistence Functions (Direct NVS API)
 * ============================================================================
 *
 * This implementation uses Zephyr's NVS (Non-Volatile Storage) directly.
 * NVS provides a simple key-value store on flash memory.
 *
 * We use numeric IDs for keys:
 *   ID 1: "code_len" - Program length (4 bytes)
 *   ID 2: "code"     - Program bytecode (up to 4KB)
 *   ID 3: "retain"   - unused (the RETAIN records use IDs 16..31)
 *   IDs 4-8: transactional .zplc program store v1
 *
 * The storage_partition must be defined in the board's DeviceTree overlay.
 */

#ifdef CONFIG_NVS

#include <zephyr/drivers/flash.h>
/* Newer Zephyr moved NVS to kvss and renamed the FIXED_PARTITION_* macros; both
 * spellings warn as deprecated there, and the twister builds make warnings errors. */
#if __has_include(<zephyr/kvss/nvs.h>)
#include <zephyr/kvss/nvs.h>
#else
#include <zephyr/fs/nvs.h>
#endif
#include <zephyr/storage/flash_map.h>

#ifdef PARTITION_DEVICE
#define ZPLC_STORAGE_DEVICE() PARTITION_DEVICE(storage_partition)
#define ZPLC_STORAGE_OFFSET() PARTITION_OFFSET(storage_partition)
#define ZPLC_STORAGE_SIZE() PARTITION_SIZE(storage_partition)
#else
#define ZPLC_STORAGE_DEVICE() FIXED_PARTITION_DEVICE(storage_partition)
#define ZPLC_STORAGE_OFFSET() FIXED_PARTITION_OFFSET(storage_partition)
#define ZPLC_STORAGE_SIZE() FIXED_PARTITION_SIZE(storage_partition)
#endif

/** @brief NVS ID for program length */
#define NVS_ID_CODE_LEN 1

/** @brief NVS ID for program bytecode */
#define NVS_ID_CODE 2

/** @brief NVS ID for retentive memory */
#define NVS_ID_RETAIN 3
#define NVS_ID_PROGRAM_ACTIVE 4
#define NVS_ID_PROGRAM_SLOT_A_PAYLOAD 5
#define NVS_ID_PROGRAM_SLOT_A_META 6
#define NVS_ID_PROGRAM_SLOT_B_PAYLOAD 7
#define NVS_ID_PROGRAM_SLOT_B_META 8

/** @brief NVS IDs 16..31: chunk 0..7 of RETAIN slot a, then of slot b
 *         ("retain_a0".."retain_b7", see zplc_retain.h). */
#define NVS_ID_RETAIN_CHUNKS 16

/** @brief NVS IDs from 64: chunk 1, 2, ... of the payload of program slot a, then of slot b
 *         ("program_v1_slot_a_payload_1", see zplc_program_store.h). Chunk 0 is NVS_ID_PROGRAM_SLOT_x_PAYLOAD.
 *         Each slot has ZPLC_PROGRAM_STORE_MAX_CHUNKS identifiers, of which the first is not used. */
#define NVS_ID_PROGRAM_CHUNKS 64

/* RT-029: the two program slots of the largest artifact, the records and, when it is built in, the two RETAIN
 * records have to fit the storage partition with one spare sector for garbage collection. A sector is taken as
 * 4 KB, the smallest the boards of this repository have; a board with larger sectors keeps more spare. The figure
 * is an estimate (entry overhead is ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD per entry), so it fails the build early
 * rather than promising that the last byte fits. The remedy is a smaller CONFIG_ZPLC_CODE_SIZE_MAX in the board
 * profile, or a larger partition. */
#define ZPLC_STORAGE_SPARE_SECTOR_BYTES 4096U
#ifdef CONFIG_ZPLC_RETAIN_PERSIST
#define ZPLC_STORAGE_RETAIN_BYTES                                              \
  (2U * (((ZPLC_MEM_RETAIN_SIZE + 64U + ZPLC_PROGRAM_STORE_CHUNK_SIZE - 1U) /  \
          ZPLC_PROGRAM_STORE_CHUNK_SIZE) *                                     \
         (ZPLC_PROGRAM_STORE_CHUNK_SIZE + ZPLC_PROGRAM_STORE_ENTRY_OVERHEAD)))
#else
#define ZPLC_STORAGE_RETAIN_BYTES 0U
#endif
#define ZPLC_STORAGE_REQUIRED_BYTES                                            \
  (ZPLC_PROGRAM_STORE_WORST_CASE_BYTES + ZPLC_STORAGE_RETAIN_BYTES +           \
   ZPLC_STORAGE_SPARE_SECTOR_BYTES)
BUILD_ASSERT(ZPLC_STORAGE_SIZE() >= ZPLC_STORAGE_REQUIRED_BYTES,
             "the storage partition cannot hold two program slots of "
             "CONFIG_ZPLC_CODE_SIZE_MAX (and the RETAIN records): lower the code size "
             "of the board profile or enlarge storage_partition");

/** @brief NVS filesystem handle */
static struct nvs_fs nvs_handle;

/** @brief NVS initialized flag */
static bool nvs_initialized = false;

/**
 * @brief NVS ID of "program_v1_slot_<a|b>_payload_<n>", n a decimal chunk number from 1, or 0.
 */
static uint16_t program_chunk_id(const char *key) {
  static const char prefix[] = "program_v1_slot_";
  static const char suffix[] = "_payload_";
  const size_t prefix_length = sizeof(prefix) - 1U;
  const size_t suffix_length = sizeof(suffix) - 1U;
  const char *digits;
  unsigned long chunk = 0UL;
  unsigned slot;

  if (strncmp(key, prefix, prefix_length) != 0 ||
      (key[prefix_length] != 'a' && key[prefix_length] != 'b') ||
      strncmp(key + prefix_length + 1U, suffix, suffix_length) != 0) {
    return 0;
  }
  slot = key[prefix_length] == 'a' ? 0U : 1U;
  digits = key + prefix_length + 1U + suffix_length;
  if (*digits == '\0' || *digits == '0') {
    return 0;
  }
  for (; *digits != '\0'; digits++) {
    if (*digits < '0' || *digits > '9') {
      return 0;
    }
    chunk = chunk * 10UL + (unsigned long)(*digits - '0');
    if (chunk >= ZPLC_PROGRAM_STORE_MAX_CHUNKS) {
      return 0;
    }
  }
  return (uint16_t)(NVS_ID_PROGRAM_CHUNKS + slot * ZPLC_PROGRAM_STORE_MAX_CHUNKS + chunk);
}

/**
 * @brief Map string key to NVS ID.
 */
static uint16_t key_to_nvs_id(const char *key) {
  if (strcmp(key, "code_len") == 0)
    return NVS_ID_CODE_LEN;
  if (strcmp(key, "code") == 0)
    return NVS_ID_CODE;
  if (strcmp(key, "retain") == 0)
    return NVS_ID_RETAIN;
  if (strcmp(key, "program_v1_active") == 0)
    return NVS_ID_PROGRAM_ACTIVE;
  if (strcmp(key, "program_v1_slot_a_payload") == 0)
    return NVS_ID_PROGRAM_SLOT_A_PAYLOAD;
  if (strcmp(key, "program_v1_slot_a_meta") == 0)
    return NVS_ID_PROGRAM_SLOT_A_META;
  if (strcmp(key, "program_v1_slot_b_payload") == 0)
    return NVS_ID_PROGRAM_SLOT_B_PAYLOAD;
  if (strcmp(key, "program_v1_slot_b_meta") == 0)
    return NVS_ID_PROGRAM_SLOT_B_META;
  if (strncmp(key, "retain_", 7) == 0 && (key[7] == 'a' || key[7] == 'b') &&
      key[8] >= '0' && key[8] <= '7' && key[9] == '\0')
    return NVS_ID_RETAIN_CHUNKS + (key[7] - 'a') * 8 + (key[8] - '0');
  return program_chunk_id(key);
}

/**
 * @brief Ensure NVS is initialized.
 */
static int ensure_nvs_init(void) {
  int ret;
  struct flash_pages_info page_info;

  if (nvs_initialized) {
    return 0;
  }

  /* Get the storage partition from DeviceTree */
  nvs_handle.flash_device = ZPLC_STORAGE_DEVICE();
  if (!device_is_ready(nvs_handle.flash_device)) {
    zplc_hal_log("[HAL] NVS flash device not ready\n");
    return -ENODEV;
  }

  nvs_handle.offset = ZPLC_STORAGE_OFFSET();

  /* Get flash page info to determine sector size */
  ret = flash_get_page_info_by_offs(nvs_handle.flash_device, nvs_handle.offset,
                                    &page_info);
  if (ret != 0) {
    zplc_hal_log("[HAL] Failed to get flash page info: %d\n", ret);
    return ret;
  }

  nvs_handle.sector_size = page_info.size;
  nvs_handle.sector_count =
      ZPLC_STORAGE_SIZE() / page_info.size;

  /* Mount NVS */
  ret = nvs_mount(&nvs_handle);
  if (ret != 0) {
    zplc_hal_log("[HAL] NVS mount failed: %d\n", ret);
    return ret;
  }

  nvs_initialized = true;
  zplc_hal_log("[HAL] NVS initialized (%u sectors of %u bytes)\n",
               nvs_handle.sector_count, nvs_handle.sector_size);
  return 0;
}

/**
 * @brief Save data to persistent storage using NVS.
 *
 * @param key    Identifier string for the data block.
 * @param data   Pointer to data to save.
 * @param len    Length of data in bytes.
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 */
zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data,
                                        size_t len) {
  uint16_t id;
  ssize_t ret;

  if (key == NULL || data == NULL || len == 0) {
    return ZPLC_HAL_ERROR;
  }

  /* Initialize NVS if needed */
  if (ensure_nvs_init() != 0) {
    return ZPLC_HAL_ERROR;
  }

  /* Map key to ID */
  id = key_to_nvs_id(key);
  if (id == 0) {
    zplc_hal_log("[HAL] Unknown persist key: %s\n", key);
    return ZPLC_HAL_ERROR;
  }

  /* Write to NVS */
  ret = nvs_write(&nvs_handle, id, data, len);
  if (ret < 0) {
    zplc_hal_log("[HAL] NVS write '%s' (id=%u) failed: %zd\n", key, id, ret);
    return ZPLC_HAL_ERROR;
  }

  zplc_hal_log("[HAL] NVS write '%s': %zu bytes\n", key, len);
  return ZPLC_HAL_OK;
}

/**
 * @brief Load data from persistent storage using NVS.
 *
 * @param key    Identifier string for the data block.
 * @param data   Buffer to load data into.
 * @param len    Maximum length to read.
 *
 * @return ZPLC_HAL_OK on success, error code otherwise.
 *         Returns ZPLC_HAL_NOT_IMPL if key is not found.
 */
zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data,
                                        size_t len) {
  uint16_t id;
  ssize_t ret;

  if (key == NULL || data == NULL || len == 0) {
    return ZPLC_HAL_ERROR;
  }

  /* Initialize NVS if needed */
  if (ensure_nvs_init() != 0) {
    return ZPLC_HAL_ERROR;
  }

  /* Map key to ID */
  id = key_to_nvs_id(key);
  if (id == 0) {
    zplc_hal_log("[HAL] Unknown persist key: %s\n", key);
    return ZPLC_HAL_ERROR;
  }

  /* NVS refuses a read request larger than the largest entry it can hold: a sector less two allocation entries.
   * An entry is never larger, so asking for less than the caller's capacity truncates nothing. A caller that
   * passes the capacity of a whole artifact (the program store reads the first chunk that way) is served. */
  {
    const size_t write_block = nvs_handle.flash_parameters != NULL
                                   ? nvs_handle.flash_parameters->write_block_size
                                   : 1U;
    const size_t allocation_entry =
        write_block <= 1U ? 8U : ((8U + write_block - 1U) / write_block) * write_block;
    const size_t largest_entry = nvs_handle.sector_size - 2U * allocation_entry;

    if (len > largest_entry) {
      len = largest_entry;
    }
  }

  /* Read from NVS */
  ret = nvs_read(&nvs_handle, id, data, len);
  if (ret < 0) {
    if (ret == -ENOENT)
      return ZPLC_HAL_NOT_IMPL;
    zplc_hal_log("[HAL] NVS read '%s' failed: %zd\n", key, ret);
    return ZPLC_HAL_ERROR;
  }

  zplc_hal_log("[HAL] NVS read '%s': %zd bytes\n", key, ret);
  return ZPLC_HAL_OK;
}

/**
 * @brief Delete data from persistent storage using NVS.
 *
 * @param key    Identifier string for the data block.
 *
 * @return ZPLC_HAL_OK on success, ZPLC_HAL_NOT_IMPL if key not found,
 *         error code otherwise.
 */
zplc_hal_result_t zplc_hal_persist_delete(const char *key) {
  uint16_t id;
  int ret;

  if (key == NULL) {
    return ZPLC_HAL_ERROR;
  }

  /* Initialize NVS if needed */
  if (ensure_nvs_init() != 0) {
    return ZPLC_HAL_ERROR;
  }

  /* Map key to ID */
  id = key_to_nvs_id(key);
  if (id == 0) {
    zplc_hal_log("[HAL] Unknown persist key: %s\n", key);
    return ZPLC_HAL_ERROR;
  }

  /* Delete from NVS */
  ret = nvs_delete(&nvs_handle, id);
  if (ret != 0) {
    if (ret == -ENOENT)
      return ZPLC_HAL_NOT_IMPL;
    zplc_hal_log("[HAL] NVS delete '%s' failed: %d\n", key, ret);
    return ZPLC_HAL_ERROR;
  }

  zplc_hal_log("[HAL] NVS delete '%s': OK\n", key);
  return ZPLC_HAL_OK;
}

#else /* !CONFIG_NVS */

/**
 * @brief Save data to persistent storage (stub - NVS disabled).
 */
zplc_hal_result_t zplc_hal_persist_save(const char *key, const void *data,
                                        size_t len) {
  (void)key;
  (void)data;
  (void)len;

  zplc_hal_log("[HAL] Persist save: CONFIG_NVS not enabled\n");
  return ZPLC_HAL_NOT_IMPL;
}

/**
 * @brief Load data from persistent storage (stub - Settings disabled).
 */
zplc_hal_result_t zplc_hal_persist_load(const char *key, void *data,
                                        size_t len) {
  (void)key;
  (void)data;
  (void)len;

  return ZPLC_HAL_NOT_IMPL;
}

/**
 * @brief Delete data from persistent storage (stub - Settings disabled).
 */
zplc_hal_result_t zplc_hal_persist_delete(const char *key) {
  (void)key;

  zplc_hal_log("[HAL] Persist delete: CONFIG_NVS not enabled\n");
  return ZPLC_HAL_NOT_IMPL;
}

#endif /* CONFIG_NVS */

/* ============================================================================
 * Synchronization Functions
 * ============================================================================
 */

/* The mutexes of the runtime come from a small static pool, not from the heap: a runtime that has no heap (the
 * scheduler suites, and a board that sets the pool to zero) still has its process-image lock and the lock of the
 * exchange, and creating one cannot fail for lack of memory at run time (RT-030). The core takes two. */
#define ZPLC_HAL_MUTEX_POOL_SIZE 4U

static struct k_mutex hal_mutex_pool[ZPLC_HAL_MUTEX_POOL_SIZE];
static bool hal_mutex_used[ZPLC_HAL_MUTEX_POOL_SIZE];
static struct k_spinlock hal_mutex_pool_lock;

zplc_hal_mutex_t zplc_hal_mutex_create(void) {
  struct k_mutex *mutex = NULL;
  k_spinlock_key_t key = k_spin_lock(&hal_mutex_pool_lock);
  size_t index;

  for (index = 0U; index < ZPLC_HAL_MUTEX_POOL_SIZE; index++) {
    if (!hal_mutex_used[index]) {
      hal_mutex_used[index] = true;
      mutex = &hal_mutex_pool[index];
      break;
    }
  }
  k_spin_unlock(&hal_mutex_pool_lock, key);
  if (mutex == NULL) {
    return NULL;
  }
  if (k_mutex_init(mutex) != 0) {
    /* RT-030: a mutex that did not initialise is not handed out. */
    key = k_spin_lock(&hal_mutex_pool_lock);
    hal_mutex_used[mutex - hal_mutex_pool] = false;
    k_spin_unlock(&hal_mutex_pool_lock, key);
    return NULL;
  }
  return (zplc_hal_mutex_t)mutex;
}

zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex) {
  struct k_mutex *handle = (struct k_mutex *)mutex;
  k_spinlock_key_t key;

  if (handle < hal_mutex_pool || handle >= hal_mutex_pool + ZPLC_HAL_MUTEX_POOL_SIZE) {
    return ZPLC_HAL_ERROR;
  }
  key = k_spin_lock(&hal_mutex_pool_lock);
  hal_mutex_used[handle - hal_mutex_pool] = false;
  k_spin_unlock(&hal_mutex_pool_lock, key);
  return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex) {
  if (mutex == NULL) {
    return ZPLC_HAL_ERROR;
  }
  if (k_mutex_lock((struct k_mutex *)mutex, K_FOREVER) == 0) {
    return ZPLC_HAL_OK;
  }
  return ZPLC_HAL_ERROR;
}

zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex) {
  if (mutex == NULL) {
    return ZPLC_HAL_ERROR;
  }
  if (k_mutex_unlock((struct k_mutex *)mutex) != 0) {
    return ZPLC_HAL_ERROR;
  }
  return ZPLC_HAL_OK;
}

/* ============================================================================
 * Network Functions (Phase 1.4.1+)
 * ============================================================================
 */

zplc_hal_result_t zplc_hal_net_init(void) {
#ifdef CONFIG_NETWORKING
  /* Zephyr initializes networking automatically. Just check if it's up. */
  return ZPLC_HAL_OK;
#else
  return ZPLC_HAL_NOT_IMPL;
#endif
}

zplc_hal_result_t zplc_hal_net_get_ip(char *buf, size_t len) {
#ifdef CONFIG_NETWORKING
  struct net_if *iface = net_if_get_default();
  if (!iface) {
    if (buf && len > 0) buf[0] = '\0';
    return ZPLC_HAL_ERROR;
  }
  
  struct net_if_ipv4 *ipv4 = iface->config.ip.ipv4;
  if (!ipv4 || net_ipv4_is_addr_unspecified(&ipv4->unicast[0].ipv4.address.in_addr)) {
    if (buf && len > 0) buf[0] = '\0';
    return ZPLC_HAL_ERROR;
  }
  
  net_addr_ntop(AF_INET, &ipv4->unicast[0].ipv4.address.in_addr, buf, len);
  return ZPLC_HAL_OK;
#else
  if (buf && len > 0) {
    buf[0] = '\0';
  }
  return ZPLC_HAL_NOT_IMPL;
#endif
}

zplc_hal_result_t zplc_hal_dns_resolve(const char *hostname, char *ip_buf, size_t len) {
#ifdef CONFIG_NETWORKING
  struct zsock_addrinfo hints = {0};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  
  struct zsock_addrinfo *res;
  int ret = zsock_getaddrinfo(hostname, NULL, &hints, &res);
  if (ret != 0) {
    return ZPLC_HAL_ERROR;
  }
  
  struct sockaddr_in *addr = (struct sockaddr_in *)res->ai_addr;
  zsock_inet_ntop(AF_INET, &addr->sin_addr, ip_buf, len);
  
  zsock_freeaddrinfo(res);
  return ZPLC_HAL_OK;
#else
  (void)hostname;
  (void)ip_buf;
  (void)len;
  return ZPLC_HAL_NOT_IMPL;
#endif
}

zplc_hal_socket_t zplc_hal_socket_connect(const char *host, uint16_t port) {
#ifdef CONFIG_NETWORKING
  struct zsock_addrinfo hints = {0};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  
  char port_str[8];
  (void)snprintf(port_str, sizeof(port_str), "%u", port); /* a uint16_t always fits in 8 bytes */
  
  struct zsock_addrinfo *res;
  if (zsock_getaddrinfo(host, port_str, &hints, &res) != 0) {
    return NULL;
  }
  
  int sock = zsock_socket(res->ai_family, res->ai_socktype, res->ai_protocol);
  if (sock < 0) {
    zsock_freeaddrinfo(res);
    return NULL;
  }
  
  if (zsock_connect(sock, res->ai_addr, res->ai_addrlen) < 0) {
    zsock_close(sock);
    zsock_freeaddrinfo(res);
    return NULL;
  }
  
  zsock_freeaddrinfo(res);
  return (zplc_hal_socket_t)(intptr_t)sock; /* NOLINT(performance-no-int-to-ptr): the HAL handle is an opaque pointer */
#else
  (void)host;
  (void)port;
  return NULL;
#endif
}

int32_t zplc_hal_socket_send(zplc_hal_socket_t sock_handle, const void *data, size_t len) {
#ifdef CONFIG_NETWORKING
  int sock = (int)(intptr_t)sock_handle;
  ssize_t ret = zsock_send(sock, data, len, 0);
  if (ret < 0) return ZPLC_HAL_ERROR;
  return (int32_t)ret;
#else
  (void)sock_handle;
  (void)data;
  (void)len;
  return ZPLC_HAL_NOT_IMPL;
#endif
}

int32_t zplc_hal_socket_recv(zplc_hal_socket_t sock_handle, void *buf, size_t len) {
#ifdef CONFIG_NETWORKING
  int sock = (int)(intptr_t)sock_handle;
  ssize_t ret = zsock_recv(sock, buf, len, 0);
  if (ret < 0) return ZPLC_HAL_ERROR;
  return (int32_t)ret;
#else
  (void)sock_handle;
  (void)buf;
  (void)len;
  return ZPLC_HAL_NOT_IMPL;
#endif
}

zplc_hal_result_t zplc_hal_socket_close(zplc_hal_socket_t sock_handle) {
#ifdef CONFIG_NETWORKING
  int sock = (int)(intptr_t)sock_handle;
  zsock_close(sock);
  return ZPLC_HAL_OK;
#else
  (void)sock_handle;
  return ZPLC_HAL_NOT_IMPL;
#endif
}

/* ============================================================================
 * Logging
 * ============================================================================
 */

/**
 * @brief Log a formatted message using Zephyr's printk.
 *
 * Note: printk does not support all printf format specifiers.
 * For production, consider using Zephyr's LOG_* macros instead.
 */
void zplc_hal_log(const char *fmt, ...) {
  char buf[256];
  va_list args;

  va_start(args, fmt);
  (void)vsnprintf(buf, sizeof(buf), fmt, args); /* a truncated log line is still a log line */
  va_end(args);

  printk("%s", buf);
}

/* ============================================================================
 * System Initialization
 * ============================================================================
 */

/**
 * @brief Initialize the Zephyr HAL.
 *
 * Initializes GPIO channels from DeviceTree and prepares other subsystems.
 */
zplc_hal_result_t zplc_hal_init(void) {
  int gpio_count;
  uint8_t configured_output_mask;
  uint8_t missing_output_mask;

  if (hal_initialized) {
    return ZPLC_HAL_OK;
  }

  zplc_hal_log("[HAL] Zephyr HAL initializing...\n");

  /* Initialize GPIO from DeviceTree */
  gpio_count = gpio_init_all();
  configured_output_mask = gpio_output_configured_mask();
  missing_output_mask = (uint8_t)(CONFIG_ZPLC_REQUIRED_GPIO_OUTPUT_MASK &
                                  ~configured_output_mask);

  if (missing_output_mask != 0U) {
    zplc_hal_log("[HAL] Required output mask 0x%x missing 0x%x\n",
                 CONFIG_ZPLC_REQUIRED_GPIO_OUTPUT_MASK, missing_output_mask);
    return ZPLC_HAL_ERROR;
  }

  if (gpio_count == 0) {
    zplc_hal_log("[HAL] Warning: No GPIO channels configured\n");
    zplc_hal_log("[HAL] Add led0/sw0 aliases to board overlay\n");
  }

  hal_initialized = true;
  zplc_hal_log("[HAL] Zephyr HAL ready\n");

  return ZPLC_HAL_OK;
}

/**
 * @brief Shutdown the Zephyr HAL.
 *
 * Releases resources and turns off outputs.
 */
zplc_hal_result_t zplc_hal_shutdown(void) {
  zplc_hal_result_t result = ZPLC_HAL_OK;

  zplc_hal_log("[HAL] Zephyr HAL shutting down...\n");

  /* Turn off all outputs */
  for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
    if (gpio_channels[i].configured) {
      int ret;

#ifdef CONFIG_ZTEST
      if (test_fail_next_safe_off) {
        test_fail_next_safe_off = false;
        ret = -EIO;
      } else
#endif
      {
        ret = gpio_pin_set_dt(&gpio_channels[i].spec, 0);
      }

      if (ret < 0) {
        result = ZPLC_HAL_ERROR;
      }
    }
  }

  hal_initialized = false;

  return result;
}
