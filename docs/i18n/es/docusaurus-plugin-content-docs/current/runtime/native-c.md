---
id: native-c
title: Integrar código nativo en C
sidebar_label: Código C nativo
description: Cómo extender el comportamiento de ZPLC compilando tareas propias en C dentro del firmware.
tags: [runtime, zephyr, native-c]
---

# Integrar código nativo en C

ZPLC separa la lógica IEC editable por el usuario (el bytecode `.zplc`) de las operaciones de bajo nivel del firmware. Sin embargo, quien trabaja en integraciones OEM complejas suele necesitar controladores de alto rendimiento, SDK propietarios de proveedores o funciones de hardware complejas que no se corresponden con la lógica estándar.

Para esos casos, ZPLC permite extender el sistema embebido directamente en C con Zephyr RTOS.

## La separación arquitectónica

Es importante mantener la separación de responsabilidades:
- **Use la lógica estándar de ZPLC (ST, SFC, LD)** para la automatización de planta, las operaciones generales, la lógica de secuencias, el control PID y la lógica de negocio.
- **Use C nativo de Zephyr** para operaciones muy rígidas, como los controladores I2C de pantallas, los algoritmos propietarios de control de movimiento, los servicios criptográficos de hardware y los protocolos heredados.

*Las tareas en C nativo no se enlazan directamente al flujo de la lógica programable de ZPLC en el IDE.* Se ejecutan como hilos independientes, en paralelo, dentro del ecosistema de Zephyr.

## Flujo de trabajo estándar

Si necesita la integración nativa, debe compilar el firmware de ZPLC desde su código fuente:

1. Cree un archivo fuente en C dentro de `firmware/app` (se recomienda `src/custom/`).
2. Implemente su lógica como un servicio nativo de Zephyr o como un hilo independiente.
3. Intégrelo mediante CMake en el archivo `CMakeLists.txt` del espacio de trabajo `firmware/app`.
4. Si hace falta, interactúe con el runtime de ZPLC mediante las funciones `zplc_hal_*` desde su código en C.

**Ejemplo de extensión de `CMakeLists.txt`:**
```cmake
target_sources(app PRIVATE src/custom/custom_sensor_driver.c)
```

Mantenga la lógica del PLC en los lenguajes IEC y ponga el código específico del hardware en archivos nativos de Zephyr.
