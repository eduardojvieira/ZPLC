/**
 * @file zplc_hal_wasm.c
 * @brief ZPLC Hardware Abstraction Layer - WebAssembly Implementation
 *
 * SPDX-License-Identifier: MIT
 *
 * This is the WebAssembly/Emscripten implementation of the ZPLC HAL.
 * It enables running the PLC runtime in a web browser for simulation
 * and debugging purposes.
 *
 * GPIO operations are bridged to JavaScript callbacks, allowing the
 * web UI to display virtual LEDs and simulate button presses.
 *
 * Build: emcc with EXPORTED_FUNCTIONS and EXPORTED_RUNTIME_METHODS
 */

#include <zplc_hal.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/html5.h>
#else
/* Stub for non-Emscripten builds (testing) */
#define EMSCRIPTEN_KEEPALIVE
#define EM_JS(ret, name, args, body)
#endif

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

/* ============================================================================
 * Configuration
 * ============================================================================ */

/** @brief Maximum GPIO channels (4 outputs + 4 inputs) */
#define ZPLC_GPIO_MAX_CHANNELS  8

/** @brief Number of output channels */
#define ZPLC_GPIO_OUTPUT_COUNT  4

/** @brief Number of input channels */
#define ZPLC_GPIO_INPUT_COUNT   4

/* ============================================================================
 * JavaScript Bridge Functions
 * ============================================================================
 * These functions are implemented in JavaScript and called from C.
 */

#ifdef __EMSCRIPTEN__

/* JavaScript: Called when a GPIO output changes */
EM_JS(void, js_gpio_write, (int channel, int value), {
    if (typeof window !== 'undefined' && window.zplcOnGpioWrite) {
        window.zplcOnGpioWrite(channel, value);
    }
});

/* JavaScript: Read a GPIO input value */
EM_JS(int, js_gpio_read, (int channel), {
    if (typeof window !== 'undefined' && window.zplcOnGpioRead) {
        return window.zplcOnGpioRead(channel);
    }
    return 0;
});

/* JavaScript: Log a message to console */
EM_JS(void, js_log, (const char* msg), {
    console.log('[ZPLC]', UTF8ToString(msg));
});

/* JavaScript: Get current time in milliseconds */
EM_JS(double, js_get_time_ms, (void), {
    return performance.now();
});

#else
/* Stubs for non-Emscripten builds */
static void js_gpio_write(int channel, int value) { (void)channel; (void)value; }
static int js_gpio_read(int channel) { (void)channel; return 0; }
static void js_log(const char* msg) { printf("%s\n", msg); }
static double js_get_time_ms(void) { return 0.0; }
#endif

/* ============================================================================
 * Internal State
 * ============================================================================ */

/** @brief GPIO output states (cached) */
static uint8_t gpio_outputs[ZPLC_GPIO_OUTPUT_COUNT];

/** @brief GPIO input states (cached) */
static uint8_t gpio_inputs[ZPLC_GPIO_INPUT_COUNT];

/** @brief HAL initialization state */
static int hal_initialized = 0;

/** @brief Start time for tick calculation */
static double start_time_ms = 0.0;

/* ============================================================================
 * Timing Functions
 * ============================================================================ */

/**
 * @brief Get current system tick in milliseconds.
 *
 * Uses performance.now() via JavaScript bridge.
 */
uint32_t zplc_hal_tick(void)
{
    double now = js_get_time_ms();
    return (uint32_t)(now - start_time_ms);
}

/**
 * @brief Sleep for the specified number of milliseconds.
 *
 * Note: In WASM, we can't truly block. This is a no-op.
 * The caller (main loop) should use requestAnimationFrame instead.
 */
void zplc_hal_sleep(uint32_t ms)
{
    /* WASM cannot block - this is handled by the JS event loop */
    (void)ms;
}

/* ============================================================================
 * GPIO Functions
 * ============================================================================ */

/**
 * @brief Read a digital input channel.
 */
zplc_hal_result_t zplc_hal_gpio_read(uint8_t channel, uint8_t *value)
{
    if (value == NULL) {
        return ZPLC_HAL_ERROR;
    }

    if (channel < ZPLC_GPIO_OUTPUT_COUNT) {
        /* Reading from an output - return cached value */
        *value = gpio_outputs[channel];
        return ZPLC_HAL_OK;
    } else if (channel < ZPLC_GPIO_MAX_CHANNELS) {
        /* Reading from an input - query JavaScript */
        int input_channel = channel - ZPLC_GPIO_OUTPUT_COUNT;
        gpio_inputs[input_channel] = (uint8_t)js_gpio_read(input_channel);
        *value = gpio_inputs[input_channel];
        return ZPLC_HAL_OK;
    }

    *value = 0;
    return ZPLC_HAL_ERROR;
}

/**
 * @brief Write to a digital output channel.
 */
zplc_hal_result_t zplc_hal_gpio_write(uint8_t channel, uint8_t value)
{
    if (channel >= ZPLC_GPIO_OUTPUT_COUNT) {
        return ZPLC_HAL_ERROR;
    }

    gpio_outputs[channel] = value ? 1 : 0;
    js_gpio_write(channel, gpio_outputs[channel]);

    return ZPLC_HAL_OK;
}

/* ============================================================================
 * Analog I/O Functions (Stubs)
 * ============================================================================ */

zplc_hal_result_t zplc_hal_adc_read(uint8_t channel, uint16_t *value)
{
    (void)channel;
    if (value) *value = 0;
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_dac_write(uint8_t channel, uint16_t value)
{
    (void)channel;
    (void)value;
    return ZPLC_HAL_NOT_IMPL;
}

/* ============================================================================
 * Persistence Functions (using localStorage via JS)
 * ============================================================================ */

#ifdef __EMSCRIPTEN__

EM_JS(int, js_persist_save, (const char* key, const void* data, int len), {
    try {
        const keyStr = UTF8ToString(key);
        const bytes = new Uint8Array(HEAPU8.buffer, data, len);
        const base64 = btoa(String.fromCharCode.apply(null, bytes));
        localStorage.setItem('zplc_' + keyStr, base64);
        return 0;
    } catch (e) {
        console.error('Persist save error:', e);
        return -1;
    }
});

EM_JS(int, js_persist_load, (const char* key, void* data, int len), {
    try {
        const keyStr = UTF8ToString(key);
        const base64 = localStorage.getItem('zplc_' + keyStr);
        if (!base64) return -1;
        const binary = atob(base64);
        const bytes = new Uint8Array(len);
        for (let i = 0; i < Math.min(binary.length, len); i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        HEAPU8.set(bytes, data);
        return 0;
    } catch (e) {
        console.error('Persist load error:', e);
        return -1;
    }
});

EM_JS(int, js_persist_delete, (const char* key), {
    try {
        const keyStr = UTF8ToString(key);
        const item = localStorage.getItem('zplc_' + keyStr);
        if (!item) return -4;  /* ZPLC_HAL_NOT_IMPL - not found */
        localStorage.removeItem('zplc_' + keyStr);
        return 0;
    } catch (e) {
        console.error('Persist delete error:', e);
        return -1;
    }
});

#else
static int js_persist_save(const char* key, const void* data, int len) {
    (void)key; (void)data; (void)len; return -1;
}
static int js_persist_load(const char* key, void* data, int len) {
    (void)key; (void)data; (void)len; return -1;
}
static int js_persist_delete(const char* key) {
    (void)key; return -1;
}
#endif

zplc_hal_result_t zplc_hal_persist_save(const char *key,
                                         const void *data,
                                         size_t len)
{
    if (js_persist_save(key, data, (int)len) == 0) {
        return ZPLC_HAL_OK;
    }
    return ZPLC_HAL_ERROR;
}

zplc_hal_result_t zplc_hal_persist_load(const char *key,
                                         void *data,
                                         size_t len)
{
    if (js_persist_load(key, data, (int)len) == 0) {
        return ZPLC_HAL_OK;
    }
    return ZPLC_HAL_ERROR;
}

zplc_hal_result_t zplc_hal_persist_delete(const char *key)
{
    int ret = js_persist_delete(key);
    if (ret == 0) {
        return ZPLC_HAL_OK;
    } else if (ret == -4) {
        return ZPLC_HAL_NOT_IMPL;  /* Not found */
    }
    return ZPLC_HAL_ERROR;
}

/* ============================================================================
 * Synchronization Functions
 * ============================================================================ */

zplc_hal_mutex_t zplc_hal_mutex_create(void)
{
    /* JavaScript is single-threaded, no mutex needed */
    return (zplc_hal_mutex_t)1;
}

zplc_hal_result_t zplc_hal_mutex_lock(zplc_hal_mutex_t mutex)
{
    (void)mutex;
    return ZPLC_HAL_OK;
}

zplc_hal_result_t zplc_hal_mutex_unlock(zplc_hal_mutex_t mutex)
{
    (void)mutex;
    return ZPLC_HAL_OK;
}

/* ============================================================================
 * Network Functions (Not implemented in WASM)
 * ============================================================================ */

zplc_hal_result_t zplc_hal_net_init(void)
{
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_net_get_ip(char *buf, size_t len)
{
    if (buf && len > 0) buf[0] = '\0';
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_result_t zplc_hal_dns_resolve(const char *hostname, char *ip_buf, size_t len)
{
    if (ip_buf && len > 0) ip_buf[0] = '\0';
    return ZPLC_HAL_NOT_IMPL;
}

zplc_hal_socket_t zplc_hal_socket_connect(const char *host, uint16_t port)
{
    (void)host;
    (void)port;
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
 * @brief Log a formatted message using console.log via JavaScript.
 */
void zplc_hal_log(const char *fmt, ...)
{
    char buf[256];
    va_list args;
    
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    
    js_log(buf);
}

/* ============================================================================
 * System Initialization
 * ============================================================================ */

/**
 * @brief Initialize the WASM HAL.
 */
zplc_hal_result_t zplc_hal_init(void)
{
    if (hal_initialized) {
        return ZPLC_HAL_OK;
    }

    /* Clear GPIO states */
    memset(gpio_outputs, 0, sizeof(gpio_outputs));
    memset(gpio_inputs, 0, sizeof(gpio_inputs));

    /* Record start time */
    start_time_ms = js_get_time_ms();

    hal_initialized = 1;
    zplc_hal_log("[HAL] WASM HAL initialized\n");

    return ZPLC_HAL_OK;
}

/**
 * @brief Shutdown the WASM HAL.
 */
zplc_hal_result_t zplc_hal_shutdown(void)
{
    /* Turn off all outputs */
    for (int i = 0; i < ZPLC_GPIO_OUTPUT_COUNT; i++) {
        gpio_outputs[i] = 0;
        js_gpio_write(i, 0);
    }

    hal_initialized = 0;
    zplc_hal_log("[HAL] WASM HAL shutdown\n");

    return ZPLC_HAL_OK;
}

/* ============================================================================
 * Exported Functions for JavaScript
 * ============================================================================
 * These functions are exported via EXPORTED_FUNCTIONS in the build.
 */

#ifdef __EMSCRIPTEN__

/**
 * @brief Set a virtual input value from JavaScript.
 *
 * Called when user clicks a virtual button in the UI.
 */
EMSCRIPTEN_KEEPALIVE
void zplc_wasm_set_input(int channel, int value)
{
    if (channel >= 0 && channel < ZPLC_GPIO_INPUT_COUNT) {
        gpio_inputs[channel] = value ? 1 : 0;
    }
}

/**
 * @brief Get a virtual output value from JavaScript.
 *
 * Called by UI to read current LED states.
 */
EMSCRIPTEN_KEEPALIVE
int zplc_wasm_get_output(int channel)
{
    if (channel >= 0 && channel < ZPLC_GPIO_OUTPUT_COUNT) {
        return gpio_outputs[channel];
    }
    return 0;
}

#endif /* __EMSCRIPTEN__ */
