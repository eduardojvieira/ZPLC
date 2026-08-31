#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio/gpio_emul.h>
#include <zephyr/ztest.h>
#include <zplc_hal.h>

#ifdef CONFIG_ZTEST
extern void zplc_hal_test_fail_next_safe_off(void);
#endif

ZTEST(hal_gpio_policy, test_missing_output_alias_follows_profile)
{
#if DT_NODE_EXISTS(DT_NODELABEL(zplc_test_gpio_emul))
  const struct device *gpio = DEVICE_DT_GET(DT_NODELABEL(gpio0));

  zassert_true(device_is_ready(gpio), "GPIO emulator must be ready");
#if CONFIG_ZPLC_REQUIRED_GPIO_OUTPUT_MASK == 0x3
  zassert_equal(zplc_hal_init(), ZPLC_HAL_ERROR,
                "required missing DO1 must fail HAL initialization");
  zassert_equal(gpio_emul_output_get(gpio, 0U), 0,
                "configured DO0 must start inactive");
  zassert_equal(zplc_hal_gpio_write(0U, 1U), ZPLC_HAL_ERROR,
                "failed initialization must reject configured DO0 writes");
  zassert_equal(gpio_emul_output_get(gpio, 0U), 0,
                "rejected write must not energize DO0");
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK,
                "shutdown after failed initialization must succeed");
  return;
#else
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK,
                "configured required DO0 must initialize HAL");
  zassert_equal(zplc_hal_gpio_write(0U, 1U), ZPLC_HAL_OK,
                "initialized DO0 write must succeed");
  zassert_equal(gpio_emul_output_get(gpio, 0U), 1,
                "initialized write must set the emulated output");
  zplc_hal_test_fail_next_safe_off();
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_ERROR,
                "safe-off failure must fail shutdown");
  zassert_equal(gpio_emul_output_get(gpio, 0U), 1,
                "injected safe-off failure must preserve the observed output");
  zassert_equal(zplc_hal_gpio_write(0U, 1U), ZPLC_HAL_ERROR,
                "failed shutdown must reject subsequent writes");
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK,
                "HAL must reinitialize after a failed shutdown");
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK,
                "subsequent normal shutdown must succeed");
  zassert_equal(gpio_emul_output_get(gpio, 0U), 0,
                "normal shutdown must de-energize DO0");
  zassert_equal(zplc_hal_gpio_write(0U, 1U), ZPLC_HAL_ERROR,
                "post-shutdown writes must be rejected");
  return;
#endif
#if CONFIG_ZPLC_REQUIRED_GPIO_OUTPUT_MASK == 0x1
  zassert_equal(zplc_hal_init(), ZPLC_HAL_ERROR,
                "required missing DO0 must fail HAL initialization");
  zassert_equal(zplc_hal_init(), ZPLC_HAL_ERROR,
                "failed initialization must not mark HAL ready");
  zassert_equal(zplc_hal_gpio_write(0U, 1U), ZPLC_HAL_ERROR,
                "required missing DO0 must reject writes");
#else
  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK,
                "optional missing DO0 must not fail HAL initialization");
  zassert_equal(zplc_hal_gpio_write(0U, 1U), ZPLC_HAL_NOT_IMPL,
                "optional missing DO0 must remain unavailable");
#endif
#endif
  zassert_equal(zplc_hal_shutdown(), ZPLC_HAL_OK, "HAL shutdown must succeed");
}

ZTEST_SUITE(hal_gpio_policy, NULL, NULL, NULL, NULL, NULL);
