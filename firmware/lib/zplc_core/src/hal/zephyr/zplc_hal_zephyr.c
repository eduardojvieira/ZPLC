/**
 * @file zplc_hal_zephyr.c
 * @brief ZPLC Hardware Abstraction Layer - Zephyr RTOS Implementation
 *
 * SPDX-License-Identifier: MIT
 *
 * This is the Zephyr-native implementation of the ZPLC HAL.
 * It uses Zephyr kernel APIs for timing, the GPIO and ADC subsystems for I/O
 * (the channels come from the board I/O description, see zplc_io_zephyr.h) and
 * the NVS subsystem for persistence.
 *
 * Build: This file is compiled when CONFIG_ZPLC is enabled.
 */

#include <zplc_hal.h>

#include "zplc_io_zephyr.h"

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
 * The digital channels are the board I/O description (firmware/app/boards/
 * boards.json), turned at build time into zplc_io_gpio_bindings[]: one
 * devicetree GPIO spec per channel, outputs first and then inputs. HAL gpio
 * channel n is entry n. The build fails when the description and the
 * devicetree disagree (IO-001), so a pin is never silently missing; only a
 * channel of the default alias profile (a board without a description) may be
 * absent, and its entry then has no port.
 */

/** @brief Run-time state of one digital channel */
typedef struct {
  bool configured; /**< Successfully configured */
} zplc_gpio_state_t;

static zplc_gpio_state_t gpio_state[ZPLC_IO_MAX_CHANNELS];

/** @brief HAL initialization state */
static bool hal_initialized = false;

#ifdef CONFIG_ZTEST
/* Test-only one-shot failure before a shutdown GPIO safe-off write. */
static bool test_fail_next_safe_off;

void zplc_hal_test_fail_next_safe_off(void) { test_fail_next_safe_off = true; }
#endif

/* The accessors of the I/O table are the same on every port. */
#include "../common/zplc_io_common.inc"

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

/** @brief Number of digital channels (outputs first) of the board. */
static uint16_t gpio_channel_count(void) {
  return zplc_io_gpio_binding_count;
}

/** @brief Whether channel `channel` must configure for the HAL to initialize. */
static bool gpio_channel_required(uint16_t channel) {
  const struct zplc_io_gpio_binding *binding = &zplc_io_gpio_bindings[channel];

  if (binding->required != 0U) {
    return true;
  }
  /* The Kconfig mask counts outputs from the first one, which is channel 0. */
  return binding->is_output != 0U && channel < 32U &&
         (CONFIG_ZPLC_REQUIRED_GPIO_OUTPUT_MASK & BIT(channel)) != 0U;
}

/**
 * @brief Configure a single GPIO channel.
 *
 * @param idx Channel index in zplc_io_gpio_bindings
 * @return 0 on success, negative error code on failure
 */
static int gpio_channel_configure(uint16_t idx) {
  const struct zplc_io_gpio_binding *binding = &zplc_io_gpio_bindings[idx];
  gpio_flags_t flags;
  int ret;

  gpio_state[idx].configured = false;

  /* Check if device is ready */
  if (!gpio_is_ready_dt(&binding->spec)) {
    zplc_hal_log("[HAL] GPIO channel %u: device not ready\n", (unsigned)idx);
    return -ENODEV;
  }

  /* Configure pin direction; an output starts at its safe level */
  if (binding->is_output != 0U) {
    flags = binding->safe != 0U ? GPIO_OUTPUT_ACTIVE : GPIO_OUTPUT_INACTIVE;
  } else {
    flags = GPIO_INPUT;
  }

  ret = gpio_pin_configure_dt(&binding->spec, flags);
  if (ret < 0) {
    zplc_hal_log("[HAL] GPIO channel %u: configure failed (%d)\n",
                 (unsigned)idx, ret);
    return ret;
  }

  gpio_state[idx].configured = true;
  zplc_hal_log("[HAL] GPIO channel %u: configured as %s\n", (unsigned)idx,
               binding->is_output != 0U ? "OUTPUT" : "INPUT");

  return 0;
}

/**
 * @brief Configure every digital channel of the board description.
 *
 * @return Number of channels successfully configured
 */
static int gpio_init_all(void) {
  int configured = 0;
  uint16_t channel;

  zplc_hal_log("[HAL] Configuring GPIO channels...\n");

  memset(gpio_state, 0, sizeof(gpio_state));

  for (channel = 0U; channel < gpio_channel_count(); channel++) {
    /* An optional channel the devicetree does not define has no port */
    if (zplc_io_gpio_bindings[channel].spec.port == NULL) {
      continue;
    }
    if (gpio_channel_configure(channel) == 0) {
      configured++;
    }
  }

  zplc_hal_log("[HAL] GPIO: %d channels configured\n", configured);
  return configured;
}

/** @brief Whether every required digital channel configured. */
static bool gpio_required_configured(void) {
  uint16_t channel;
  bool all = true;

  for (channel = 0U; channel < gpio_channel_count(); channel++) {
    if (gpio_channel_required(channel) && !gpio_state[channel].configured) {
      zplc_hal_log("[HAL] Required GPIO channel %u (%s) is missing\n",
                   (unsigned)channel,
                   zplc_io_gpio_bindings[channel].is_output != 0U ? "output"
                                                                  : "input");
      all = false;
    }
  }
  return all;
}

/**
 * @brief Read a digital channel.
 *
 * Channel mapping: outputs first (they can be read back), then inputs, in the
 * order of the generated I/O table.
 */
zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value) {
  int ret;

  if (value == NULL) {
    return ZPLC_HAL_ERROR;
  }

  if (channel >= gpio_channel_count()) {
    *value = 0;
    return ZPLC_HAL_ERROR;
  }

  if (!gpio_state[channel].configured) {
    *value = 0;
    return ZPLC_HAL_NOT_IMPL;
  }

  ret = gpio_pin_get_dt(&zplc_io_gpio_bindings[channel].spec);
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
 * Only output channels can be written.
 */
zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value) {
  int ret;

  if (!hal_initialized) {
    return ZPLC_HAL_ERROR;
  }

  if (channel >= gpio_channel_count() ||
      zplc_io_gpio_bindings[channel].is_output == 0U) {
    return ZPLC_HAL_ERROR;
  }

  if (!gpio_state[channel].configured) {
    if (gpio_channel_required(channel)) {
      return ZPLC_HAL_ERROR;
    }
    return ZPLC_HAL_NOT_IMPL;
  }

  ret = gpio_pin_set_dt(&zplc_io_gpio_bindings[channel].spec, value ? 1 : 0);
  if (ret < 0) {
    return ZPLC_HAL_ERROR;
  }

  return ZPLC_HAL_OK;
}

/* ============================================================================
 * Analog I/O Functions
 * ============================================================================
 *
 * The analog inputs are the analog channels of the board description,
 * zplc_io_adc_bindings[]: the converter, the channel setup and the resolution
 * of each. Every channel is set up in zplc_hal_init(), before the runtime can
 * enter RUN (IO-018); a read never configures a converter.
 */

#ifdef CONFIG_ADC

static bool adc_state_configured[ZPLC_IO_MAX_CHANNELS];

/**
 * @brief Set up every analog channel of the board description.
 *
 * @return Number of channels successfully set up
 */
static int adc_init_all(void) {
  int configured = 0;
  uint16_t channel;

  memset(adc_state_configured, 0, sizeof(adc_state_configured));

  for (channel = 0U; channel < zplc_io_adc_binding_count; channel++) {
    const struct zplc_io_adc_binding *binding = &zplc_io_adc_bindings[channel];
    int ret;

    /* An optional converter that the devicetree does not enable is absent */
    if (binding->dev == NULL) {
      continue;
    }
    if (!device_is_ready(binding->dev)) {
      zplc_hal_log("[HAL] ADC channel %u: device not ready\n",
                   (unsigned)channel);
      continue;
    }
    ret = adc_channel_setup(binding->dev, &binding->cfg);
    if (ret < 0) {
      zplc_hal_log("[HAL] ADC channel %u setup failed: %d\n",
                   (unsigned)channel, ret);
      continue;
    }
    adc_state_configured[channel] = true;
    configured++;
    zplc_hal_log("[HAL] ADC channel %u configured\n", (unsigned)channel);
  }
  return configured;
}

/** @brief Whether every required analog channel was set up. */
static bool adc_required_configured(void) {
  uint16_t channel;
  bool all = true;

  for (channel = 0U; channel < zplc_io_adc_binding_count; channel++) {
    if (zplc_io_adc_bindings[channel].required != 0U &&
        !adc_state_configured[channel]) {
      zplc_hal_log("[HAL] Required ADC channel %u is missing\n",
                   (unsigned)channel);
      all = false;
    }
  }
  return all;
}

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
  const struct zplc_io_adc_binding *binding;
  int16_t sample_buffer;
  int ret;

  if (value == NULL) {
    return ZPLC_HAL_ERROR;
  }

  if (channel >= zplc_io_adc_binding_count) {
    *value = 0;
    return ZPLC_HAL_ERROR;
  }

  if (!adc_state_configured[channel]) {
    *value = 0;
    return ZPLC_HAL_NOT_IMPL;
  }

  binding = &zplc_io_adc_bindings[channel];
  {
    struct adc_sequence sequence = {
        .channels = BIT(binding->cfg.channel_id),
        .buffer = &sample_buffer,
        .buffer_size = sizeof(sample_buffer),
        .resolution = binding->resolution,
        .oversampling = 0,
    };

    ret = adc_read(binding->dev, &sequence);
  }
  if (ret < 0) {
    zplc_hal_log("[HAL] ADC read failed: %d\n", ret);
    *value = 0;
    return ZPLC_HAL_ERROR;
  }

  /* The raw converter value; its scaling is the range of the description */
  *value = (uint16_t)sample_buffer;
  return ZPLC_HAL_OK;
}

#else /* !CONFIG_ADC */

static int adc_init_all(void) { return 0; }
static bool adc_required_configured(void) { return true; }

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value) {
  (void)channel;
  if (value)
    *value = 0;
  return ZPLC_HAL_NOT_IMPL;
}

#endif /* CONFIG_ADC */

/**
 * @brief Write an analog output channel.
 *
 * No port drives an analog output and no board description lists one (IO-006):
 * the call returns ZPLC_HAL_NOT_IMPL, which zplc_io_write_channel() passes to
 * its caller.
 */
zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value) {
  (void)channel;
  (void)value;

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

/** @brief NVS filesystem handle */
static struct nvs_fs nvs_handle;

/** @brief NVS initialized flag */
static bool nvs_initialized = false;

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
  return 0; /* Invalid */
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

zplc_hal_mutex_t zplc_hal_mutex_create(void) {
  struct k_mutex *mutex = k_malloc(sizeof(struct k_mutex));
  if (mutex != NULL) {
    k_mutex_init(mutex);
  }
  return (zplc_hal_mutex_t)mutex;
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
  k_mutex_unlock((struct k_mutex *)mutex);
  return ZPLC_HAL_OK;
}

/* The handle is the k_malloc'd k_mutex of zplc_hal_mutex_create(); a k_mutex has
 * no teardown beyond giving its memory back. The caller must not hold it. */
zplc_hal_result_t zplc_hal_mutex_destroy(zplc_hal_mutex_t mutex) {
  if (mutex == NULL) {
    return ZPLC_HAL_ERROR;
  }
  k_free(mutex);
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
 * Configures every digital and analog channel of the board I/O description
 * (IO-018): the peripherals are ready before the scheduler can enter RUN, not
 * on the first scan. A required channel that cannot be configured fails the
 * initialization and leaves the HAL not ready.
 */
zplc_hal_result_t zplc_hal_init(void) {
  int gpio_count;
  int adc_count;

  if (hal_initialized) {
    return ZPLC_HAL_OK;
  }

  zplc_hal_log("[HAL] Zephyr HAL initializing...\n");

  /* Configure the channels of the board description */
  gpio_count = gpio_init_all();
  adc_count = adc_init_all();

  if (!gpio_required_configured() || !adc_required_configured()) {
    zplc_hal_log("[HAL] A required I/O channel of the board is missing\n");
    return ZPLC_HAL_ERROR;
  }

  if (gpio_count == 0 && adc_count == 0) {
    zplc_hal_log("[HAL] Warning: No I/O channels configured\n");
    zplc_hal_log("[HAL] Describe the board in firmware/app/boards/boards.json\n");
  }

  hal_initialized = true;
  zplc_hal_log("[HAL] Zephyr HAL ready\n");

  return ZPLC_HAL_OK;
}

/**
 * @brief Shutdown the Zephyr HAL.
 *
 * Releases resources and drives every output to its safe level.
 */
zplc_hal_result_t zplc_hal_shutdown(void) {
  zplc_hal_result_t result = ZPLC_HAL_OK;
  uint16_t channel;

  zplc_hal_log("[HAL] Zephyr HAL shutting down...\n");

  /* Drive all outputs to their safe level */
  for (channel = 0U; channel < gpio_channel_count(); channel++) {
    const struct zplc_io_gpio_binding *binding = &zplc_io_gpio_bindings[channel];

    if (binding->is_output != 0U && gpio_state[channel].configured) {
      int ret;

#ifdef CONFIG_ZTEST
      if (test_fail_next_safe_off) {
        test_fail_next_safe_off = false;
        ret = -EIO;
      } else
#endif
      {
        ret = gpio_pin_set_dt(&binding->spec, binding->safe != 0U ? 1 : 0);
      }

      if (ret < 0) {
        result = ZPLC_HAL_ERROR;
      }
    }
  }

  hal_initialized = false;

  return result;
}
