---
slug: /integration
id: index
title: Integración y despliegue
sidebar_label: Integración
description: El proceso para incorporar el runtime de ZPLC en hardware Zephyr propio.
tags: [integration, runtime]
---

# Integración y despliegue

Esta página describe cómo llevar aplicaciones ZPLC funcionales a hardware Zephyr real, tanto en despliegues estándar como en integraciones profundas para fabricantes (OEM).

## Destinos de ejecución

Cuando el compilador emite una carga útil de bytecode `.zplc`, esta se envía al destino de ejecución elegido:

```mermaid
flowchart LR
  A[Compilar el proyecto a .zplc] --> B{Destino de ejecución}
  B --> D[Simulación SoftPLC nativa en el equipo]
  B --> E[Runtime de hardware Zephyr]
  E --> F[Depuración en línea desde Studio]
```

## Integrar ZPLC en un firmware propio

Si fabrica hardware propio o usa una placa que no viene en las imágenes estándar de ZPLC para Zephyr, debe incorporar el núcleo de ZPLC manualmente. Integrarlo en una configuración propia de Zephyr implica:

1. **Incluir la biblioteca del núcleo.** Enlace el motor C99 de ZPLC en el árbol de compilación CMake.
2. **Implementar el contrato de la HAL.** Escriba las funciones en C de `zplc_hal_tick`, `zplc_hal_gpio_read`, `zplc_hal_gpio_write` y el resto del [contrato HAL](../runtime/hal-contract.md), según la distribución de GPIO y los controladores de su destino.
3. **Iniciar el planificador.** Llame a `zplc_sched_init()`, cargue un programa con `zplc_sched_load()` e inícielo con `zplc_sched_start()` desde el hilo `main()` de Zephyr. Consulte la [API del runtime](../reference/runtime-api.md).

Al cumplir la HAL, se puede portar ZPLC a casi cualquier microcontrolador compatible con POSIX o con Zephyr.

## Capacidades de protocolo

Al llevar la lógica de automatización a una red, compruebe que su plataforma de hardware admita las capas físicas necesarias:

- **MQTT:** requiere una placa con una pila Wi-Fi o Ethernet activa en Zephyr.
- **Modbus TCP:** funciona sobre los sockets Ethernet estándar.
- **Modbus RTU:** requiere al menos un transceptor UART/RS-485 implementado físicamente en la placa.

Como ZPLC resuelve la lógica de los protocolos dentro del motor de la máquina virtual, la configuración entre familias de microcontroladores depende solo de hacer coincidir las rutas de E/S de la HAL.

## Grabar el hardware

Para poner en marcha un microcontrolador nuevo, debe grabar el firmware base de ZPLC para Zephyr antes de que Studio pueda transmitir bytecode `.zplc` por el puerto serie.

En general, ZPLC se apoya en los procedimientos estándar de grabación de Zephyr:

- Muchas placas con núcleo ARM aceptan la grabación directa con ST-Link o J-Link mediante `west flash`.
- Las placas de desarrollo estándar, como las ESP32, pueden grabarse directamente por USB.
- En los procesos con RP2040 se puede copiar el binario UF2 generado a la unidad de almacenamiento que aparece al conectar la placa.
