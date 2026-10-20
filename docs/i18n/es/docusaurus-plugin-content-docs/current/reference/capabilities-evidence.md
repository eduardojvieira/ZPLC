---
slug: /reference/capabilities-evidence
id: capabilities-evidence
title: Compatibilidad de hardware
sidebar_label: Compatibilidad de hardware
description: "Los niveles de evidencia que usa ZPLC y el nivel de cada placa hoy, derivado de los registros de evidencia."
tags: [reference, evidence, boards]
---

# Compatibilidad de hardware

Esta es la única página que dice hasta dónde se ha demostrado que funciona cada
placa. Todas las demás páginas que mencionan una placa o un nivel enlazan aquí.

ZPLC etiqueta una capacidad con la evidencia más fuerte que está registrada para
ella. Un archivo fuente, una ejecución en el host, una compilación de paquete o
una entrada de catálogo no son una calificación de hardware.

## Los niveles

Se usa un solo vocabulario en todas partes: en la documentación, en la aplicación ZPLC, en los
mensajes de commit y en los pull requests. Un nivel superior nunca se deduce de uno
inferior.

| Nivel | Qué establece | Qué no establece | Dónde se ve |
| --- | --- | --- | --- |
| Host | Pasó una prueba unitaria, de conformidad o en C en el equipo de desarrollo. | Tiempos, E/S ni alimentación de un dispositivo. | Las líneas de evidencia de la documentación |
| Simulación nativa | El runtime nativo del host ejecutó el escenario con un reloj virtual. | Equivalencia con el destino Zephyr ni con una placa. | El modo **Simulate** de ZPLC |
| Host empaquetado | Un instalador de escritorio empaquetado se inició en su propio sistema en la ejecución de la versión. | Firma del instalador, notarización ni comportamiento del hardware. | Las notas de cada versión |
| Destino emulado | Una suite de Zephyr pasó en `native_sim` o en un destino QEMU Cortex-M. | La placa exacta, su sonda, el cableado ni la salida eléctrica. | La página de pruebas de firmware |
| `cross-build` | El firmware compila para la placa y cabe en su presupuesto de flash y RAM. | Grabar, arrancar, desplegar, persistencia ni ninguna salida. | **Nivel de compatibilidad** de una placa, más abajo |
| `community-reported` | Un usuario informó qué ocurrió en su propia placa, con la imagen exacta que ejecutó, mediante la plantilla de informe de placa. | Que el proyecto lo reprodujo, que se siguió un procedimiento ni ningún nivel de compatibilidad: un informe nunca cambia el nivel de una placa. | La columna de evidencia de una placa, más abajo |
| `human-hil` | Una persona ejecutó un procedimiento registrado en la placa exacta, con la imagen de firmware identificada por su commit y su hash, y pasó. | Calificación de producción fuera del procedimiento registrado. | **Nivel de compatibilidad** de una placa, más abajo |
| Calificado para producción | Existe un paquete de evidencia de producción gobernado aparte. | Certificación de seguridad, salvo que lo diga. | Ninguna placa lo tiene |

Un resultado que una persona observó en un banco es una pista, no una
calificación: una placa llega a `human-hil` solo mediante un registro que nombra
la versión del firmware, el commit y el hash de la imagen que probó.

## Placas

La tabla se genera desde `firmware/app/boards/boards.json`, el único manifiesto de
placas. El **Nivel de compatibilidad** se deriva de los registros de evidencia que
referencia el manifiesto; nunca se fija a mano, y una placa sin ningún registro
que pase se queda en `cross-build`.

{/* >>> GENERATED (tools/docs/generate_board_reference.py): hardware-support-boards. Do not edit. >>> */}

| Placa | ID del IDE | Destino de Zephyr | Red | Nivel de compatibilidad | Registros de evidencia |
| --- | --- | --- | --- | --- | --- |
| Raspberry Pi Pico (RP2040) | `rpi_pico` | `rpi_pico/rp2040` | Orientada al puerto serie | `cross-build` | ninguno |
| Arduino GIGA R1 (STM32H747 M7) | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Orientada al puerto serie | `cross-build` | ninguno |
| ESP32-S3-DevKitC-1 (N8R8) | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Capacidad de red (Wi-Fi) | `cross-build` | ninguno |
| STM32F746G Discovery | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | Capacidad de red (Ethernet) | `cross-build` | ninguno |
| STM32 Nucleo-H743ZI | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | Capacidad de red (Ethernet) | `cross-build` | ninguno |
| Arduino Opta WiFi (STM32H747 M7) | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | Capacidad de red (Wi-Fi) | `cross-build` | ninguno |
| Waveshare RP2040-Zero | `waveshare_rp2040_zero` | `rp2040_zero/rp2040` | Orientada al puerto serie | `cross-build` | ninguno |

Ninguna placa tiene un registro de hardware: cada fila dice que el firmware compila para esa placa, y nada más.

{/* <<< END GENERATED: hardware-support-boards <<< */}

Los canales de E/S de cada placa, con sus pines y sus valores seguros, están en
[Placas soportadas](./boards.md).

## Qué se deduce de un nivel

- **`cross-build`:** use el simulador para mejorar su lógica y la compilación para
  detectar un problema de integración. No afirme que un flujo de trabajo, una
  salida, un presupuesto de tiempos, la persistencia o la recuperación funcionan en
  la placa.
- **`community-reported`:** otra persona vio que esa imagen hacía eso en su placa. Es
  una pista para la misma imagen en la misma placa. La placa se queda en
  `cross-build`, y su watchdog de hardware sigue apagado, hasta que una persona
  ejecute el procedimiento registrado.
- **`human-hil`:** el procedimiento del registro funcionó con esa versión del
  firmware en esa placa. Otra imagen, otra placa u otro procedimiento necesita su
  propio registro.
- **Cualquier cosa sobre seguridad:** lea [Seguridad y limitaciones](../safety-and-limitations.md).

Los registros de hardware los hace una persona, nunca un asistente de IA ni el
servidor MCP. Compilar el firmware, grabarlo, cargar un programa y ejecutarlo
siguen siendo operaciones separadas: [Pruebas de firmware](../development/firmware-testing.md)
explica qué muestran las suites automáticas y qué no.
