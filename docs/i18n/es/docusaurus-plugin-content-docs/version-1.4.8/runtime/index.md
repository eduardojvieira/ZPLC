---
slug: /runtime
id: index
title: Runtime y Sistemas Embebidos
sidebar_label: Visión General del Runtime
description: Visión general de la Máquina Virtual ZPLC, planificación y modelo de ejecución.
tags: [runtime, embedded]
---

# Runtime y Sistemas Embebidos

El Runtime ZPLC es una Máquina Virtual C99 determinista y altamente portable diseñada para ejecutar bytecode `.zplc` en dispositivos embebidos con recursos limitados.

## Modelo de la VM

El núcleo de ZPLC es una máquina virtual basada en pila (stack). Interpreta las instrucciones generadas por el compilador.
*   **Determinismo**: La VM está diseñada para ejecutar instrucciones con una temporización altamente predecible, un requisito crítico para el control industrial.
*   **Sin Memoria Dinámica**: Después de la inicialización, la VM central realiza cero asignaciones dinámicas de memoria (`malloc`, `free`). Toda la memoria se asigna estáticamente o se gestiona a través de grupos (pools) preasignados, eliminando los riesgos de fragmentación de memoria durante operaciones prolongadas.

## Planificador y Modelo de Ejecución

ZPLC utiliza un modelo cooperativo multitarea dentro del contexto del RTOS subyacente (generalmente Zephyr).

*   **Tareas**: Un programa PLC está compuesto por una o más tareas.
*   **Tiempo de Ciclo**: A cada tarea se le asigna un tiempo de ciclo específico (por ejemplo, 10 ms, 100 ms).
*   **Bucle de Ejecución**: 
    1.  **Leer Entradas**: La HAL lee el estado actual de las entradas físicas.
    2.  **Ejecutar Lógica**: La VM ejecuta el bytecode para la tarea.
    3.  **Escribir Salidas**: La HAL escribe el nuevo estado en las salidas físicas.
    4.  **Esperar**: El planificador cede el control hasta que comience el siguiente ciclo.

## Objetivos Soportados

El runtime está completamente desacoplado del hardware a través de la HAL. Puede ejecutarse en cualquier plataforma donde exista una implementación HAL.

Objetivos principales soportados:
*   **Zephyr RTOS**: El entorno de destino principal, proporcionando un soporte robusto de controladores para STM32, ESP32, NXP, etc.
*   **POSIX**: Utilizado para simulación y pruebas basadas en host (Linux, macOS).
*   **WASM**: Compilado a través de Emscripten para ejecutarse dentro del IDE web para simulación basada en navegador.