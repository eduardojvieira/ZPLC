---
slug: /reference/boards
id: boards
title: Placas Soportadas
sidebar_label: Placas Soportadas
description: Referencia generada de placas para el candidato ZPLC 2.0.
tags: [reference, boards, generated]
---

# Placas Soportadas

> [!IMPORTANT]
> Esta página se genera desde `firmware/app/boards/supported-boards.v1.5.0.json`. Actualizá el JSON o volvé a ejecutar `python3 tools/docs/generate_board_reference.py` en lugar de editar este archivo manualmente.

## Topología

```mermaid
flowchart TD
  serial["Enfoque serial"]
  network["Capacidad de red"]
  b1["Raspberry Pi Pico (RP2040)"]
  serial --> b1
  b2["Arduino GIGA R1 (STM32H747 M7)"]
  serial --> b2
  b3["ESP32-S3 DevKitC"]
  network --> b3
  b4["STM32F746G Discovery"]
  network --> b4
  b5["STM32 Nucleo-H743ZI"]
  network --> b5
  b6["Arduino Opta WiFi (STM32H747 M7)"]
  network --> b6
```

## Matriz de placas

| Nombre visible | Board ID | IDE ID | Target Zephyr | Red | Nivel de evidencia | Evidencia HIL |
| --- | --- | --- | --- | --- | --- | --- |
| Raspberry Pi Pico (RP2040) | `rpi-pico-rp2040` | `rpi_pico` | `rpi_pico/rp2040` | Enfoque serial | cross-build | 0 refs |
| Arduino GIGA R1 (STM32H747 M7) | `arduino-giga-r1-m7` | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Enfoque serial | cross-build | 0 refs |
| ESP32-S3 DevKitC | `esp32-s3-devkitc` | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Capacidad de red (Wi-Fi) | cross-build | 0 refs |
| STM32F746G Discovery | `stm32f746g-disco` | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | Capacidad de red (Ethernet) | cross-build | 0 refs |
| STM32 Nucleo-H743ZI | `nucleo-h743zi` | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | Capacidad de red (Ethernet) | cross-build | 0 refs |
| Arduino Opta WiFi (STM32H747 M7) | `arduino-opta-wifi-m7` | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | Capacidad de red (Wi-Fi) | cross-build | 0 refs |

## Detalle por placa

### Raspberry Pi Pico (RP2040)

- **Board ID:** `rpi-pico-rp2040`
- **IDE ID:** `rpi_pico`
- **Zephyr target:** `rpi_pico/rp2040`
- **Variant:** `rp2040`
- **Network:** Enfoque serial
- **Nivel de evidencia:** cross-build
- **Evidencia HIL:** 0 references
- **Comando de build:** `west build -b rpi_pico/rp2040 firmware/app --pristine`
- **Ancla de referencia:** `docs/docs/reference/index.md#supported-boards`
- **Assets de soporte:**
  - `firmware/app/boards/rpi_pico_rp2040.conf`
  - `firmware/app/boards/rpi_pico_rp2040.overlay`

### Arduino GIGA R1 (STM32H747 M7)

- **Board ID:** `arduino-giga-r1-m7`
- **IDE ID:** `arduino_giga_r1`
- **Zephyr target:** `arduino_giga_r1/stm32h747xx/m7`
- **Variant:** `stm32h747xx/m7`
- **Network:** Enfoque serial
- **Nivel de evidencia:** cross-build
- **Evidencia HIL:** 0 references
- **Comando de build:** `west build -b arduino_giga_r1/stm32h747xx/m7 firmware/app --pristine`
- **Ancla de referencia:** `docs/docs/reference/index.md#supported-boards`
- **Assets de soporte:**
  - `firmware/app/boards/arduino_giga_r1_stm32h747xx_m7.conf`
  - `firmware/app/boards/arduino_giga_r1_stm32h747xx_m7.overlay`

### ESP32-S3 DevKitC

- **Board ID:** `esp32-s3-devkitc`
- **IDE ID:** `esp32s3_devkitc`
- **Zephyr target:** `esp32s3_devkitc/esp32s3/procpu`
- **Variant:** `esp32s3/procpu`
- **Network:** Capacidad de red (Wi-Fi)
- **Nivel de evidencia:** cross-build
- **Evidencia HIL:** 0 references
- **Comando de build:** `west build -b esp32s3_devkitc/esp32s3/procpu firmware/app --pristine`
- **Ancla de referencia:** `docs/docs/reference/index.md#supported-boards`
- **Assets de soporte:**
  - `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.conf`
  - `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay`

### STM32F746G Discovery

- **Board ID:** `stm32f746g-disco`
- **IDE ID:** `stm32f746g_disco`
- **Zephyr target:** `stm32f746g_disco/stm32f746xx`
- **Variant:** `stm32f746xx`
- **Network:** Capacidad de red (Ethernet)
- **Nivel de evidencia:** cross-build
- **Evidencia HIL:** 0 references
- **Comando de build:** `west build -b stm32f746g_disco/stm32f746xx firmware/app --pristine`
- **Ancla de referencia:** `docs/docs/reference/index.md#supported-boards`
- **Assets de soporte:**
  - `firmware/app/boards/stm32f746g_disco.conf`
  - `firmware/app/boards/stm32f746g_disco.overlay`

### STM32 Nucleo-H743ZI

- **Board ID:** `nucleo-h743zi`
- **IDE ID:** `nucleo_h743zi`
- **Zephyr target:** `nucleo_h743zi/stm32h743xx`
- **Variant:** `stm32h743xx`
- **Network:** Capacidad de red (Ethernet)
- **Nivel de evidencia:** cross-build
- **Evidencia HIL:** 0 references
- **Comando de build:** `west build -b nucleo_h743zi/stm32h743xx firmware/app --pristine`
- **Ancla de referencia:** `docs/docs/reference/index.md#supported-boards`
- **Assets de soporte:**
  - `firmware/app/boards/nucleo_h743zi.conf`
  - `firmware/app/boards/nucleo_h743zi.overlay`

### Arduino Opta WiFi (STM32H747 M7)

- **Board ID:** `arduino-opta-wifi-m7`
- **IDE ID:** `arduino_opta_wifi`
- **Zephyr target:** `arduino_opta/stm32h747xx/m7`
- **Variant:** `stm32h747xx/m7`
- **Network:** Capacidad de red (Wi-Fi)
- **Nivel de evidencia:** cross-build
- **Evidencia HIL:** 0 references
- **Comando de build:** `west build -b arduino_opta/stm32h747xx/m7 firmware/app --pristine`
- **Ancla de referencia:** `docs/docs/reference/index.md#supported-boards`
- **Assets de soporte:**
  - `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf`
  - `firmware/app/boards/arduino_opta_stm32h747xx_m7.overlay`
