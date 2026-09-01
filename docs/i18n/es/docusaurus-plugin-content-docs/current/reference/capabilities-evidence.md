---
slug: /reference/capabilities-evidence
id: capabilities-evidence
title: Capacidades y niveles de evidencia
sidebar_label: Capacidades y evidencia
description: Leé los claims de capacidad de ZPLC según la evidencia que los respalda.
tags: [reference, evidencia, placas]
---

# Capacidades y niveles de evidencia

ZPLC etiqueta una capacidad por la evidencia más fuerte realmente registrada.
Un archivo fuente, run host, build de paquete o entrada de catálogo no es una
calificación de hardware.

## Leé primero la etiqueta

| Nivel | Qué establece | Qué no establece |
| --- | --- | --- |
| Host / unit | Pasó una función o test unitario host. | Timing, I/O o alimentación del dispositivo. |
| POSIX nativo | El runtime host nativo ejecutó el escenario. | Equivalencia Zephyr target ni HIL. |
| Host empaquetado | Un artefacto desktop empaquetado pasó el smoke host registrado. | Firma de instalador, notarización o comportamiento hardware. |
| Twister / QEMU | Pasó cobertura Zephyr o target emulado. | La placa, probe, cableado o salida eléctrica exactos. |
| Cross-build | El profile compila para el target Zephyr declarado. | Flash, boot, deploy, persistencia o HIL. |
| HIL | Pasó un SHA registrado, board/profile exacto, flash/deploy, escenario y resultado observado. | Calificación de producción fuera del procedimiento registrado. |
| Production-qualified | Existe un paquete de evidencia de producción gobernado aparte. | Certificación de seguridad salvo declaración explícita. |

## Verdad actual de placas

El nombre histórico del manifest sigue siendo la fuente de los seis profiles
actuales. Cada entrada está en `cross-build` con **cero referencias de
evidencia HIL**. Ninguna está HIL-verified ni production-qualified.

| Placa | IDE ID | Target Zephyr | Nivel | Refs HIL |
| --- | --- | --- | --- | --- |
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | cross-build | 0 |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | cross-build | 0 |
| ESP32-S3 DevKitC | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | cross-build | 0 |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | cross-build | 0 |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | cross-build | 0 |
| Arduino Opta WiFi (STM32H747 M7) | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | cross-build | 0 |

Los datos salen de `firmware/app/boards/supported-boards.v1.5.0.json`; el
nombre del archivo es compatibilidad histórica, no un claim de que ZPLC 2.0
sea v1.5.

## Usá la conclusión correcta

Usá resultados POSIX nativos y Lab para mejorar lógica antes de hardware. Usá
cross-build para detectar regresiones de integración de profiles. Exigí un run
HIL registrado en el hardware exacto antes de afirmar que funciona un flujo
físico, presupuesto de timing, salida, persistencia o recovery.
