/*
 * EMULATION ONLY (native_sim): the `emu` shell command of the emulated bench.
 * SPDX-License-Identifier: MIT
 *
 *   emu pin <gpio> <0|1>   drive the level of an input pin on gpio_emul (inputs are active low: 0 = pressed)
 *   emu adc <ch> <raw>     set an input of the `adc` converter to raw / 4095 of 3.3 V
 *   emu out                the levels of the output pins, as a bit mask of GPIO numbers
 *
 * It replaces the wires and the potentiometer of the bench on native_sim, so that the
 * same program can be compared with the emulated Pico (HIL-015). It is never compiled
 * into a shipped board: see CMakeLists.txt and the check below.
 */
#include <stdlib.h>

#include <zephyr/drivers/adc/adc_emul.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/gpio/gpio_emul.h>
#include <zephyr/shell/shell.h>

#if !defined(CONFIG_BOARD_NATIVE_SIM)
#error "emu_shell.c is for native_sim only: it must never be compiled into a shipped board"
#endif

#define EMU_ADC_REF_MV 3300U
#define EMU_ADC_FULL_SCALE 4095U

static const struct device *const emu_gpio = DEVICE_DT_GET(DT_NODELABEL(gpio0));
static const struct device *const emu_adc = DEVICE_DT_GET(DT_NODELABEL(adc));

static int emu_number(const struct shell *sh, const char *text, long max, long *out) {
  char *end = NULL;
  long value = strtol(text, &end, 0);

  if ((end == text) || (*end != '\0') || (value < 0) || (value > max)) {
    shell_error(sh, "ERROR: '%s' is not a number from 0 to %ld", text, max);
    return -EINVAL;
  }
  *out = value;
  return 0;
}

static int cmd_emu_pin(const struct shell *sh, size_t argc, char **argv) {
  long pin = 0;
  long level = 0;

  ARG_UNUSED(argc);
  if ((emu_number(sh, argv[1], 31, &pin) != 0) || (emu_number(sh, argv[2], 1, &level) != 0)) {
    return -EINVAL;
  }
  int rc = gpio_emul_input_set(emu_gpio, (gpio_pin_t)pin, (int)level);

  if (rc != 0) {
    shell_error(sh, "ERROR: pin %ld: %d", pin, rc);
    return rc;
  }
  shell_print(sh, "OK: pin %ld = %ld", pin, level);
  return 0;
}

static int cmd_emu_adc(const struct shell *sh, size_t argc, char **argv) {
  long channel = 0;
  long raw = 0;

  ARG_UNUSED(argc);
  if ((emu_number(sh, argv[1], 4, &channel) != 0) || (emu_number(sh, argv[2], EMU_ADC_FULL_SCALE, &raw) != 0)) {
    return -EINVAL;
  }
  uint32_t millivolts = ((uint32_t)raw * EMU_ADC_REF_MV) / EMU_ADC_FULL_SCALE;
  int rc = adc_emul_const_value_set(emu_adc, (unsigned int)channel, millivolts);

  if (rc != 0) {
    shell_error(sh, "ERROR: adc %ld: %d", channel, rc);
    return rc;
  }
  shell_print(sh, "OK: adc %ld = %ld (%u mV)", channel, raw, millivolts);
  return 0;
}

static int cmd_emu_out(const struct shell *sh, size_t argc, char **argv) {
  uint32_t levels = 0U;

  ARG_UNUSED(argc);
  ARG_UNUSED(argv);
  for (gpio_pin_t pin = 0U; pin < 32U; pin++) {
    if (gpio_emul_output_get(emu_gpio, pin) > 0) {
      levels |= BIT(pin);
    }
  }
  shell_print(sh, "OUT 0x%08x", levels);
  return 0;
}

SHELL_STATIC_SUBCMD_SET_CREATE(emu_commands, SHELL_CMD_ARG(pin, NULL, "Drive an input pin: emu pin <gpio> <0|1>", cmd_emu_pin, 3, 0),
                               SHELL_CMD_ARG(adc, NULL, "Set a converter input: emu adc <ch> <0..4095>", cmd_emu_adc, 3, 0),
                               SHELL_CMD_ARG(out, NULL, "Output pin levels as a GPIO bit mask", cmd_emu_out, 1, 0), SHELL_SUBCMD_SET_END);

SHELL_CMD_REGISTER(emu, &emu_commands, "EMULATION ONLY (native_sim): drive inputs, read outputs", NULL);
