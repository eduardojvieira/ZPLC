---
title: "Clasificación en un transportador como diagrama"
sidebar_label: "conveyor-sorting-sfc"
description: "La lección conveyor-sorting-sfc: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Clasificación en un transportador como diagrama

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/conveyor-sorting-sfc. Do not edit. >>> */}

Describa un transportador clasificador como un diagrama de pasos de detenido, en marcha y falla: clasifique las piezas metálicas en marcha y bloquee la banda cuando la planta informe un atasco.

## Datos

- Módulo: [5](../modules/module-5.md)
- Nivel: Intermedio
- Tiempo estimado: 30 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Planta: [`conveyor-v1`](../plants.md)
- Requisitos previos: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objetivos

- Describa un transportador con tres pasos, con la memoria de clasificación en una variable local que actualiza la acción de marcha.
- Pase de RUNNING a FAULT con el sensor de atasco, y salga de FAULT solo cuando se pulse Reset y el atasco haya desaparecido.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan solo evidencia determinista del host con el runtime nativo POSIX, que no es evidencia de transportador físico, liberación de atascos, hardware, HIL ni certificación.

## En una placa

El diagrama lee siete entradas cuando las placas del estudiante tienen cuatro, y sus piezas y su atasco provienen de la planta simulada del transportador. Complétela en Simulación, donde el transportador y el atasco forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/conveyor-sorting-sfc <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
