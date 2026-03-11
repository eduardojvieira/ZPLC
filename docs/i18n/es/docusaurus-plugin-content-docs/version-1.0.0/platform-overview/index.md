---
slug: /platform-overview
id: index
title: Visión General de la Plataforma
sidebar_label: Visión General
description: Descubra ZPLC, un runtime determinista compatible con IEC 61131-3 para la automatización industrial moderna.
tags: [evaluator, architecture]
---

# Visión General de la Plataforma

ZPLC (Zephyr PLC) es un runtime de nueva generación, determinista y compatible con IEC 61131-3, diseñado para la automatización industrial moderna. Cierra la brecha entre los controladores industriales tradicionales y las prácticas modernas de ingeniería de software.

## Conceptos Centrales

*   **Determinismo**: Los tiempos de ejecución predecibles no son negociables. ZPLC está construido sobre Zephyr RTOS, asegurando un comportamiento en tiempo real.
*   **Portabilidad**: "Un único núcleo de ejecución, cualquier runtime". La máquina virtual principal (escrita en C) está desacoplada del hardware a través de una estricta Capa de Abstracción de Hardware (HAL).
*   **Seguridad**: Construido desde cero con principios seguros, orientado a un despliegue robusto en entornos industriales.
*   **Experiencia de Desarrollo Moderna**: Un IDE basado en web (usando React, TypeScript y Monaco) trae los flujos de trabajo de desarrollo de software estándar (Git, CI/CD) a la programación de PLC.

## Límites del Producto

ZPLC consta de varios subsistemas distintos:

1.  **Máquina Virtual Central (Core VM) (`firmware/lib/zplc_core`)**: El intérprete de bytecode C99. Maneja la programación (scheduling), la gestión de tareas y la ejecución de la lógica compilada. Tiene cero dependencias de hardware específico.
2.  **Capa de Abstracción de Hardware (HAL)**: El contrato que permite que la VM central se ejecute en varios objetivos (por ejemplo, STM32, ESP32, POSIX).
3.  **Compilador (`packages/compiler`)**: Traduce lenguajes IEC 61131-3 (como Texto Estructurado) al formato de bytecode `.zplc`.
4.  **IDE Web (`packages/ide`)**: El entorno de desarrollo basado en el navegador para crear, compilar y desplegar lógica de PLC.
5.  **Runtimes de Destino**: Compilaciones de firmware específicas que combinan la VM central, una implementación HAL y un RTOS (generalmente Zephyr).

## ¿Por qué ZPLC?

Los PLC tradicionales a menudo encierran a los usuarios en ecosistemas propietarios y herramientas de desarrollo obsoletas. ZPLC proporciona una alternativa abierta y moderna que aprovecha microcontroladores estándar mientras se adhiere al estándar establecido IEC 61131-3 para la lógica de automatización.