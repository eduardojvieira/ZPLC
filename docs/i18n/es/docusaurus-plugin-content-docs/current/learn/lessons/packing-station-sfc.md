---
title: "Proyecto final: una estación de empaque como diagrama"
sidebar_label: "packing-station-sfc"
description: "La lección packing-station-sfc: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Proyecto final: una estación de empaque como diagrama

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/packing-station-sfc. Do not edit. >>> */}

Construya una estación de empaque como un diagrama funcional secuencial a partir de una descripción escrita, con una banda con autorretención, una cuenta de tres piezas, una parada de emergencia y una falla enclavada, y demuéstrelo con un escenario que también comprueba lo que no debe ocurrir.

## Datos

- Módulo: [11](../modules/module-11.md)
- Nivel: Avanzado
- Tiempo estimado: 60 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [capstone-packing-station](./capstone-packing-station.md), [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objetivos

- Convierta cinco requisitos escritos en un diagrama de pasos, transiciones y acciones, y decida qué comportamiento es un paso y cuál es una transición.
- Lea un escenario que comprueba tanto lo que debe ocurrir como lo que no debe ocurrir, y use sus aserciones fallidas para encontrar el requisito que omitió.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran requisitos de una línea de empaque, el comportamiento de una función de seguridad, tiempos de sensores ni ningún comportamiento de máquinas reales, HIL ni certificación.

## En una placa

El diagrama lee cinco entradas digitales (Start, Stop, EStop, Part y Reset) cuando las placas del estudiante tienen cuatro. Complétela en Simulación: su calificación es la misma cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/packing-station-sfc <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
