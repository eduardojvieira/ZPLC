---
title: "Cargar y descargar tres cajas"
sidebar_label: "plant-counted-queue"
description: "La lección plant-counted-queue: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Cargar y descargar tres cajas

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-counted-queue. Do not edit. >>> */}

Cuente cajas con dos contadores para ejecutar un lote fijo: cargue tres, descargue tres y encienda Done.

## Datos

- Módulo: [12](../modules/module-12.md)
- Nivel: Avanzado
- Tiempo estimado: 30 minutos
- Lenguajes: ST
- Rutas: Simulación
- Página de lectura: no
- Planta: [Cola contada](../../plant/scenes/counted-queue.md)
- Requisitos previos: [plant-latch-two-sensors](./plant-latch-two-sensors.md), [edge-counter-pulses](./edge-counter-pulses.md)

## Objetivos

- Contar elementos con un contador de valor preestablecido.
- Usar un contador para dejar de cargar y otro para saber que el lote terminó.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

Las pruebas dan evidencia determinista del host POSIX nativo sobre una escena de planta simulada; no son evidencia física, de hardware, HIL ni de certificación.

## En una placa

Tres cajas se cargan y descargan con un emisor y una banda simulados, y una placa del estudiante no puede aportar cajas para que las cuenten los dos contadores. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-counted-queue <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
