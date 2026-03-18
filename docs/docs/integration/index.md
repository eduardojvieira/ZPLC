---
slug: /integration
id: index
title: Integration & Deployment
sidebar_label: Integration
description: How to embed ZPLC into target hardware and deployment workflows.
tags: [integration, runtime]
---

# Integration & Deployment

This section covers how to embed the ZPLC runtime into your hardware targets and how to manage the deployment of PLC applications.

## Platform Support

ZPLC remains portable, but v1.5 support claims are intentionally narrower than “anything
Zephyr can build.”

Use the supported-board manifest and reference pages for the actual v1.5 claim set.

## Embedding ZPLC

Integrating ZPLC into a custom Zephyr board involves:

1.  **Including the Library**: Add `libzplc_core` to your CMake build.
2.  **Implementing the HAL**: Provide specific implementations for the required hardware interfaces (`zplc_hal_*`) defined in `docs/docs/runtime/hal-contract.md`.
3.  **Initializing the Core**: Call the initialization functions from your Zephyr `main()` application.

## Deployment Workflows

Once the runtime is embedded on a device, deploying logic is managed via the IDE:

1.  **Serial Deployment**: For local development, the IDE can transfer compiled `.zplc` files directly over a serial connection.
2.  **Network Deployment**: For remote devices, deployment must match validated board and
    runtime capabilities.

*Note: For detailed HAL implementation guides, refer to the [Runtime Documentation](../runtime/index.md).*

## Truth Rule for Integrators

If a board, transport, or deployment path is not present in the release evidence and the
supported-board list, treat it as out of scope for v1.5.

## Protocol Configuration Expectations

- use MQTT only on boards whose supported profile exposes a real network workflow;
- use Modbus TCP only when the board profile and runtime support network transport;
- use Modbus RTU only when the target board and firmware expose the required serial path;
- keep protocol docs, project settings, and release evidence aligned.
