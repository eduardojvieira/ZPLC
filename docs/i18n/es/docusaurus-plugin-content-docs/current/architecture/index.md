---
slug: /architecture
id: index
title: Arquitectura del Sistema
sidebar_label: Arquitectura
description: Arquitectura de alto nivel del sistema y flujos de datos de la plataforma ZPLC.
tags: [architecture, evaluator, contributor]
---

# Arquitectura del Sistema

ZPLC está diseñado en torno a una estricta separación de responsabilidades, asegurando que el runtime permanezca determinista y portable, mientras que las herramientas de desarrollo aprovechan las tecnologías web modernas.

## Arquitectura de Alto Nivel

El sistema se puede dividir a grandes rasgos en tres componentes principales:

1.  **El IDE (Entorno de Desarrollo)**
2.  **El Compilador**
3.  **El Runtime (Máquina Virtual)**

### 1. El IDE

El IDE cubre autoría, compilación, simulación, despliegue y depuración para las rutas de
lenguaje reclamadas.

### 2. El Compilador

El compilador normaliza las rutas de lenguaje reclamadas hacia el mismo contrato de runtime.

- **Frontend**: analiza texto o fuente normalizada
- **Ruta de normalización**: `IL`, `LD`, `FBD` y `SFC` convergen en la ruta canónica
- **Backend**: emite bytecode `.zplc`

### 3. El Runtime (Core VM)

El runtime es el corazón de ZPLC. Es un intérprete C99 diseñado para ejecutarse en sistemas embebidos con recursos limitados.

*   **Core (`libzplc_core`)**: El intérprete de bytecode, el planificador (scheduler) y el gestor de memoria. Es completamente independiente del hardware.
*   **Capa de Abstracción de Hardware (HAL)**: Un conjunto de interfaces C definidas (`zplc_hal_*`) que el Core utiliza para interactuar con el mundo exterior (temporizadores, GPIO, red).
*   **Implementaciones de Destino**: Implementaciones específicas de la HAL para diferentes plataformas (por ejemplo, Zephyr RTOS en STM32, POSIX en Linux).

## Flujo de Datos

1.  **Creación**: El usuario escribe un programa en Texto Estructurado en el IDE.
2.  **Compilación**: El IDE invoca al compilador (que a menudo se ejecuta como WebAssembly en el navegador, o como un servicio backend). La salida es un archivo binario `.zplc`.
3.  **Despliegue**: El IDE envía el archivo `.zplc` al dispositivo de destino.
4.  **Ejecución**: El Runtime ZPLC en el dispositivo carga el bytecode, programa las tareas basándose en sus tiempos de ciclo configurados y ejecuta las instrucciones, interactuando con las E/S físicas a través de la HAL.
