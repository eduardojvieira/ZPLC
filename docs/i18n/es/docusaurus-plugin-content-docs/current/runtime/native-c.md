---
id: native-c
title: Integrar código nativo en C
sidebar_label: Código C nativo
description: Agregue su propio código C al firmware de ZPLC como un hilo de Zephyr y decida cuándo es la herramienta adecuada.
tags: [runtime, zephyr, native-c]
---

# Integrar código nativo en C

Lea esta página cuando una parte de su máquina necesite código que la lógica IEC no puede expresar: un controlador de pantalla, un SDK de proveedor, un algoritmo de movimiento propietario o un protocolo heredado. Ese código se agrega al firmware en C, junto al runtime, y la lógica de control se mantiene en bytecode `.zplc`.

## Elija la capa

| Póngalo en lógica IEC (ST, LD, FBD, SFC)                  | Póngalo en C nativo de Zephyr                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| Secuencias, enclavamientos, lazos PID, estados de máquina | Controladores I2C o SPI para una pieza que Zephyr no cubre         |
| Todo lo que un integrador deba cambiar sin recompilar     | Un SDK de proveedor, un servicio criptográfico, un algoritmo propietario |
| Lógica que desea simular y probar en un computador        | Un protocolo que el firmware no implementa                         |

:::note C nativo es un hilo aparte, no un bloque
Una tarea en C nativo no es un bloque de función de su programa. Se ejecuta como un hilo de Zephyr propio junto al planificador, así que la lógica IEC no puede llamarla y el simulador no la ejecuta. Además cambia la imagen del firmware, por lo que exige compilar, grabar y registrar nueva evidencia de la placa donde se ejecuta.
:::

## Agregue el código

Para esto compila el firmware desde el código fuente ([Compilar el firmware](../guides/build-firmware.md)).

1. Cree un archivo C dentro de `firmware/app`. Una carpeta nueva como `src/custom/` lo mantiene separado de las fuentes del runtime.
2. Escriba la lógica como un hilo o servicio de Zephyr. Cuando deba tocar el PLC o el hardware, use las funciones `zplc_hal_*` del [contrato de la HAL](./hal-contract.md), nunca las rodee.
3. Agregue el archivo a la compilación en `firmware/app/CMakeLists.txt`:

```cmake
target_sources(app PRIVATE src/custom/custom_sensor_driver.c)
```

4. Compile la placa de nuevo y compruebe su presupuesto de flash y RAM con `tools/firmware-test/run.sh size <placa>`. Su código cuenta contra el mismo presupuesto que el runtime.

## Mantenga el límite limpio

Mantenga la lógica del PLC en los lenguajes IEC y el código específico del hardware en archivos nativos. Un hilo nativo que escribe salidas o se bloquea por mucho tiempo puede romper la temporización del ciclo, y nada en el runtime lo comprueba por usted. Mídalo en la placa antes de depender de él.
