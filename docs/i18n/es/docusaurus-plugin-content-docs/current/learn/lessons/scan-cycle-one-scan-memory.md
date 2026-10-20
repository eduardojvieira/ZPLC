---
title: "Ciclo de scan y memoria de un ciclo"
sidebar_label: "scan-cycle-one-scan-memory"
description: "La lección scan-cycle-one-scan-memory: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Ciclo de scan y memoria de un ciclo

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/scan-cycle-one-scan-memory. Do not edit. >>> */}

Siga cómo una entrada produce una salida actual y una copia demorada un scan.

## Datos

- Módulo: [1](../modules/module-1.md)
- Nivel: Fundamentos
- Tiempo estimado: 10 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [first-blink-simulation](./first-blink-simulation.md)

## Objetivos

- Compruebe que una variable conserva su valor de un ciclo al siguiente.
- Construya un retardo de un ciclo y un pulso de un ciclo con una única memoria.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Evidencia**
7. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es del runtime nativo POSIX host con una única tarea de 10 ms; no demuestra timing de target, snapshot bajo interrupciones físicas, rebote eléctrico, HIL ni certificación.

## En una placa

La lección observa cómo un valor avanza un ciclo de escaneo a la vez, y una placa no permite ver cada ciclo por separado. Complétela en Simulación, donde la traza muestra cada ciclo, y lea la página del ciclo de escaneo antes de probar con una placa.

{/* <<< END GENERATED: learn/lessons/scan-cycle-one-scan-memory <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
