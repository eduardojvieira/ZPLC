---
title: "MQTT: publish a message and receive it"
sidebar_label: "mqtt-publish-subscribe"
description: "The lesson mqtt-publish-subscribe: level, time, languages and objectives, generated from its package."
tags: [learn, generated]
unlisted: true
---

# MQTT: publish a message and receive it

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/mqtt-publish-subscribe. Do not edit. >>> */}

Join the broker of the simulation, subscribe to a topic, publish a message on it, and keep a record of the message when it comes back for a single scan.

## Facts

- Module: [10](../modules/module-10.md)
- Level: Advanced
- Estimated time: 25 minutes
- Languages: ST
- Tracks: Simulation
- Plant: none
- Prerequisites: [modbus-register-round-trip](./modbus-register-round-trip.md)

## Objectives

- Tell a service block (MQTT_CONNECT, MQTT_SUBSCRIBE), which reports its state on every scan, from a request block (MQTT_PUBLISH), which sends once for each rising edge of EN.
- Publish only after the subscription holds, because a message sent earlier is not delivered to it.
- Keep a message that VALID reports for one scan only, and compare its PAYLOAD.
- Say what a loopback broker shows and what it does not show.

## Stages

1. **Objective**
2. **Predict**
3. **Edit**
4. **Run**
5. **Observe**
6. **Reflect**

## What the evidence covers

The MQTT broker in this lesson is a loopback double that ZPLC starts inside the simulation session, on this computer. The scenario shows how the blocks and their handshake behave against that double; it does not show that a real broker, cloud service or device accepts the same session, topics or quality of service, and it says nothing about network timing, HIL, or certification.

## On a board

The lesson talks to the MQTT broker that ZPLC starts on this computer. The Raspberry Pi Pico has no network interface, and the ESP32-S3 would need Wi-Fi credentials and the address of a broker in its firmware, which the course firmware does not set. Complete it in Simulation: its grade is the same each time and needs no broker or network.

{/* <<< END GENERATED: learn/lessons/mqtt-publish-subscribe <<< */}

This page is generated: to change it, change its source and run `bun run docs:generate`.
