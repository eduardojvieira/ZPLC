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

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

#include <stdarg.h>
#include <stdio.h>

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
#define ZPLC_GPIO_MAX_CHANNELS  8

/** @brief Number of output channels (LEDs) */
#define ZPLC_GPIO_OUTPUT_COUNT  4

/** @brief Number of input channels (buttons/switches) */
#define ZPLC_GPIO_INPUT_COUNT   4

/**
 * @brief GPIO channel descriptor
 */
typedef struct {
    struct gpio_dt_spec spec;   /**< DeviceTree GPIO spec */
    bool configured;            /**< Successfully configured */
    bool is_output;             /**< true=output, false=input */
} zplc_gpio_channel_t;

/** @brief GPIO channel table - outputs first, then inputs */
static zplc_gpio_channel_t gpio_channels[ZPLC_GPIO_MAX_CHANNELS];

/** @brief HAL initialization state */
static bool hal_initialized = false;

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
 * ============================================================================ */

/**
 * @brief Get current system tick in milliseconds.
 *
 * Uses Zephyr's k_uptime_get() which returns milliseconds since boot.
 * This is monotonic and suitable for cycle timing.
 */
uint32_t zplc_hal_tick(void)
{
    return (uint32_t)k_uptime_get();
}

/**
 * @brief Sleep for the specified number of milliseconds.
 *
 * Uses Zephyr's k_msleep() for cooperative/preemptive sleep.
 */
void zplc_hal_sleep(uint32_t ms)
{
    k_msleep((int32_t)ms);
}

/* ============================================================================
 * GPIO Functions
 * ============================================================================ */

/**
 * @brief Configure a single GPIO channel.
 *
 * @param idx Channel index in gpio_channels array
 * @param spec GPIO DeviceTree spec
 * @param is_output true for output, false for input
 * @return 0 on success, negative error code on failure
 */
static int gpio_channel_configure(uint8_t idx, 
                                   const struct gpio_dt_spec *spec,
                                   bool is_output)
{
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
    zplc_hal_log("[HAL] GPIO channel %d: configured as %s\n", 
                 idx, is_output ? "OUTPUT" : "INPUT");

    return 0;
}

/**
 * @brief Initialize all GPIO channels from DeviceTree.
 *
 * @return Number of channels successfully configured
 */
static int gpio_init_all(void)
{
    int configured = 0;

    zplc_hal_log("[HAL] Configuring GPIO channels...\n");

    /* Clear channel table */
    memset(gpio_channels, 0, sizeof(gpio_channels));

    /* Configure output channels (DO0-DO3 mapped to led0-led3) */
#if ZPLC_HAS_LED0
    {
        static const struct gpio_dt_spec led0 = ZPLC_LED0_SPEC;
        if (gpio_channel_configure(0, &led0, true) == 0) configured++;
    }
#endif
#if ZPLC_HAS_LED1
    {
        static const struct gpio_dt_spec led1 = ZPLC_LED1_SPEC;
        if (gpio_channel_configure(1, &led1, true) == 0) configured++;
    }
#endif
#if ZPLC_HAS_LED2
    {
        static const struct gpio_dt_spec led2 = ZPLC_LED2_SPEC;
        if (gpio_channel_configure(2, &led2, true) == 0) configured++;
    }
#endif
#if ZPLC_HAS_LED3
    {
        static const struct gpio_dt_spec led3 = ZPLC_LED3_SPEC;
        if (gpio_channel_configure(3, &led3, true) == 0) configured++;
    }
#endif

    /* Configure input channels (DI0-DI3 mapped to sw0-sw3) */
#if ZPLC_HAS_SW0
    {
        static const struct gpio_dt_spec sw0 = ZPLC_SW0_SPEC;
        if (gpio_channel_configure(4, &sw0, false) == 0) configured++;
    }
#endif
#if ZPLC_HAS_SW1
    {
        static const struct gpio_dt_spec sw1 = ZPLC_SW1_SPEC;
        if (gpio_channel_configure(5, &sw1, false) == 0) configured++;
    }
#endif
#if ZPLC_HAS_SW2
    {
        static const struct gpio_dt_spec sw2 = ZPLC_SW2_SPEC;
        if (gpio_channel_configure(6, &sw2, false) == 0) configured++;
    }
#endif
#if ZPLC_HAS_SW3
    {
        static const struct gpio_dt_spec sw3 = ZPLC_SW3_SPEC;
        if (gpio_channel_configure(7, &sw3, false) == 0) configured++;
    }
#endif

    zplc_hal_log("[HAL] GPIO: %d channels configured\n", configured);
    return configured;
}

/**
 * @brief Read a digital input channel.
 *
 * Channel mapping:
 *   0-3: Output channels (can read back state)
 *   4-7: Input channels (buttons/switches)
 */
zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value)
{
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
zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value)
{
    int ret;

    if (channel >= ZPLC_GPIO_OUTPUT_COUNT) {
        return ZPLC_HAL_ERROR;
    }

    if (!gpio_channels[channel].configured) {
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
 * Analog I/O Functions (Stubs for Phase 3+)
 * ============================================================================ */

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value)
{
    (void)channel;
    if (value) *value = 0;
    
    /* TODO Phase 3+:
     * 1. Get ADC channel from DeviceTree
     * 2. Configure and read using adc_read()
     */
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value)
{
    (void)channel;
    (void)value;
    
    /* TODO Phase 3+:
     * Use DAC driver API when available
     */
    return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Persistence Functions (Stubs for Phase 3+)
 * ============================================================================ */

zplc_hal_result_t zplc_hal_persist_save(const char *key,
                                         const void *data,
                                         size_t len)
{
    (void)key;
    (void)data;
    (void)len;
    
    /* TODO Phase 3+:
     * Use settings_save_one() or NVS directly
     */
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_persist_load(const char *key,
                                         void *data,
                                         size_t len)
{
    (void)key;
    (void)data;
    (void)len;
    
    /* TODO Phase 3+:
     * Use settings_runtime_get() or NVS directly
     */
    return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Network Functions (Stubs for Phase 4)
 * ============================================================================ */

zplc_hal_socket_t zplc_hal_socket_connect(const char *host, uint16_t port)
{
    (void)host;
    (void)port;
    
    /* TODO Phase 4:
     * Use Zephyr BSD sockets (CONFIG_NET_SOCKETS)
     */
    return NULL;
}

int32_t zplc_hal_socket_send(zplc_hal_socket_t sock,
                              const void *data,
                              size_t len)
{
    (void)sock;
    (void)data;
    (void)len;
    
    return ZPLC_HAL_NOT_IMPL;
}

int32_t zplc_hal_socket_recv(zplc_hal_socket_t sock,
                              void *buf,
                              size_t len)
{
    (void)sock;
    (void)buf;
    (void)len;
    
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_socket_close(zplc_hal_socket_t sock)
{
    (void)sock;
    
    return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Logging
 * ============================================================================ */

/**
 * @brief Log a formatted message using Zephyr's printk.
 *
 * Note: printk does not support all printf format specifiers.
 * For production, consider using Zephyr's LOG_* macros instead.
 */
void zplc_hal_log(const char *fmt, ...)
{
    char buf[256];
    va_list args;
    
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    
    printk("%s", buf);
}

/* ============================================================================
 * System Initialization
 * ============================================================================ */

/**
 * @brief Initialize the Zephyr HAL.
 *
 * Initializes GPIO channels from DeviceTree and prepares other subsystems.
 */
zplc_hal_result_t zplc_hal_init(void)
{
    int gpio_count;

    if (hal_initialized) {
        return ZPLC_HAL_OK;
    }

    zplc_hal_log("[HAL] Zephyr HAL initializing...\n");
    
    /* Initialize GPIO from DeviceTree */
    gpio_count = gpio_init_all();
    
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
zplc_hal_result_t zplc_hal_shutdown(void)
{
    zplc_hal_log("[HAL] Zephyr HAL shutting down...\n");
    
    /* Turn off all outputs */
    for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
        if (gpio_channels[i].configured) {
            gpio_pin_set_dt(&gpio_channels[i].spec, 0);
        }
    }

    hal_initialized = false;
    
    return ZPLC_HAL_OK;
}
