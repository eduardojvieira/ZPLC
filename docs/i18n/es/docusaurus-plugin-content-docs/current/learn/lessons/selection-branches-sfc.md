---
title: "Ramas de selección: un camino entre dos"
sidebar_label: "selection-branches-sfc"
description: "La lección selection-branches-sfc: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Ramas de selección: un camino entre dos

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/selection-branches-sfc. Do not edit. >>> */}

Envíe una pieza a la bahía pequeña o a la grande con dos transiciones que salen del mismo paso, y deje que su prioridad decida cuál se activa.

## Datos

- Módulo: [5](../modules/module-5.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objetivos

- Lea una divergencia de selección como varias transiciones que salen de un paso, de las cuales se activa como máximo una.
- Use la prioridad de una transición para decidir qué rama gana cuando se cumple más de una condición.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el dimensionado de piezas, los tiempos de compuertas en equipos reales, HIL ni certificación.

## En una placa

El clasificador de piezas lee un botón de pieza lista y una señal de tamaño y maneja dos compuertas; su secuencia se califica en el simulador nativo, y esta lección no incluye cableado para las placas del estudiante. Complétela en Simulación, que da el mismo resultado cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/selection-branches-sfc <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
