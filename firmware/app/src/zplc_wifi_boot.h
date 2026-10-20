/**
 * @file zplc_wifi_boot.h
 * @brief The Wi-Fi link the firmware keeps up by itself, and what the shell asks of it (HIL-010.32, .33).
 *
 * SPDX-License-Identifier: MIT
 */

#ifndef ZPLC_WIFI_BOOT_H
#define ZPLC_WIFI_BOOT_H

/**
 * @brief Ask the network layer to join the network of `zplc config` (wifi_ssid, wifi_pass, wifi_security).
 *
 * The one place that turns the stored credentials into a request, used by the boot work item and by `wifi connect`.
 * Nothing it does logs the SSID or the password.
 *
 * @return 0 when the request was accepted or the board is already joining, -EINVAL when no SSID is stored,
 *         -ENODEV without a network interface, -ENOTSUP in a build without Wi-Fi, else the error of the driver
 */
int zplc_wifi_request_connect(void);

/** @brief Start the background work item that connects at boot and again after a drop. Returns at once. */
void zplc_wifi_boot_start(void);

/** @brief The state of the link as the status reports it: unconfigured, connecting, connected, retrying or unsupported. */
const char *zplc_wifi_status_name(void);

#endif /* ZPLC_WIFI_BOOT_H */
