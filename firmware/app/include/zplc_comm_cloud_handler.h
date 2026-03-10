/**
 * @file zplc_comm_cloud_handler.h
 * @brief Cloud communication FB handler — Phase 5 public API.
 *
 * Registers OP_COMM_EXEC handlers for Azure C2D, DPS, Event Grid,
 * AWS Fleet Provisioning, and Sparkplug B Rebirth.
 *
 * SPDX-License-Identifier: MIT
 */
#ifndef ZPLC_COMM_CLOUD_HANDLER_H
#define ZPLC_COMM_CLOUD_HANDLER_H

/**
 * @brief Register all Phase 5 cloud handlers with the comm dispatch layer.
 * @return 0 on success, negative errno on failure.
 */
int zplc_comm_cloud_handler_init(void);

#endif /* ZPLC_COMM_CLOUD_HANDLER_H */
