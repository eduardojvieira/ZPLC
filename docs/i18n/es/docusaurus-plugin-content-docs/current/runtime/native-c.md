---
id: native-c
title: Integrando Código Nativo C
sidebar_label: Soluciones C Nativas
description: Extender el comportamiento de ZPLC compilando tareas en lenguaje C personalizadas dentro de la lógica del firmware.
tags: [runtime, zephyr, native-c]
---

# Integrando Código Nativo en C

ZPLC separa la lógica IEC editable de forma visual (`.zplc`) de las tareas operacionales complejas escritas en hardware. Sin embargo, los desarrolladores que trabajan en integraciones OEM a menudo necesitan escribir drivers de alto rendimiento, utilizar bibliotecas o SDK propietarios de proveedores, o implementar hardware altamente especializado que no se pueden mapear a bibliotecas estándar de forma nativa en sistemas tradicionales.

Para solucionar estos cuellos de botella programáticos, ZPLC le permite extender libremente las bibliotecas core en lenguaje C mediante el manejo integral dentro del ecosistema Zephyr RTOS.

## Separación Arquitectónica

Es fundamental mantener la separación de responsabilidades:
- **Use Funciones del entorno IEC (ST, SFC, LD)**: Para automatización general, control de domótica de la fábrica, control secuencial, cálculos de matemática general o manipulación de I/Os cotidianos.
- **Use Funciones en lenguaje C y RTOS**: Para operar controladores de comunicación SPI o I2C a alta velocidad, operar micro-servicios mediante REST APIs o cifrados criptográficos embebidos sobre un canal protegido, etc.

*Las inserciones en C de Zephyr no están encoladas dentro de la plataforma ZPLC como lógica visible; no operan cíclicamente junto a su programa. Estas viven y funcionan dentro de su núcleo embebido como módulos en segundo plano paralelos.*

## Método Regular e Instalación

1. Enlace archivos fuentes (extensiones `.c` / `.h`) dentro del proyecto original. Se dispone de la vía `firmware/app/src/custom`.
2. Genere configuraciones de funciones o rutinas con llamados dependientes de Zephyr orientadas al requerimiento en cuestión.
3. Actualice o llame estos procesos nuevos modificando el entorno base `CMakeLists.txt` en el mismo directorio.
4. Interactúe recíprocamente entre ZPLC y Zephyr aprovechando directivas expuestas mediante `zplc_hal_*` de ser necesario.

**Ejemplo de llamada en extensión a `CMakeLists.txt`:**
```cmake
if(CONFIG_ZPLC_CUSTOM_TASKS)
  target_sources(app PRIVATE src/custom/custom_sensor_driver.c)
endif()
```

Este procedimiento garantiza un estado pulcro al compilar la ejecución paralela y conserva una estricta estabilidad para los desarrolladores industriales de firmware frente a futuros despliegues complejos de mantenimiento mecánico.
