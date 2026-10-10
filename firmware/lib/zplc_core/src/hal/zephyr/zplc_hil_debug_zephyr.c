/**
 * @file zplc_hil_debug_zephyr.c
 * @brief Zephyr shell binding of the HIL debug output.
 *
 * SPDX-License-Identifier: MIT
 *
 * The portable formatter is src/core/zplc_debug.c; it hands each JSON line to a sink. This file registers the sink
 * that prints the line on a Zephyr shell, so the core itself includes no Zephyr header (RT-029).
 * Compiled only when CONFIG_ZPLC_HIL_DEBUG is enabled.
 */

#include <zephyr/shell/shell.h>

#include <zplc_debug.h>

#ifdef CONFIG_ZPLC_HIL_DEBUG

static void hil_shell_sink(void *context, const char *line)
{
    shell_print((const struct shell *)context, "%s", line);
}

void hil_set_shell(const struct shell *sh)
{
    hil_set_sink(sh != NULL ? hil_shell_sink : NULL, (void *)sh);
}

#endif /* CONFIG_ZPLC_HIL_DEBUG */
