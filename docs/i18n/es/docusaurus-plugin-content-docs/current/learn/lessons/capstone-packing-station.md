---
title: "Proyecto final: una estación de empaque, de la descripción al programa probado"
sidebar_label: "capstone-packing-station"
description: "La lección capstone-packing-station: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Proyecto final: una estación de empaque, de la descripción al programa probado

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/capstone-packing-station. Do not edit. >>> */}

Convierta la descripción escrita de una pequeña estación de empaque en un programa de Texto Estructurado, con una autorretención, una parada de emergencia, un contador, un temporizador y una falla enclavada, y demuéstrelo con un escenario que también comprueba lo que no debe ocurrir.

## Datos

- Módulo: [11](../modules/module-11.md)
- Nivel: Avanzado
- Tiempo estimado: 60 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [conveyor-two-parts-diagnosis](./conveyor-two-parts-diagnosis.md)

## Objetivos

- Convertir cinco requisitos escritos en un solo programa de Texto Estructurado que combine una autorretención, una parada de emergencia, un contador, un temporizador y una falla enclavada.
- Leer un escenario que comprueba tanto lo que debe ocurrir como lo que no debe ocurrir, y usar sus assertions fallidas para encontrar el requisito que pasó por alto.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia de host POSIX nativo con una tarea de 10 ms; no establecen requisitos de una línea de empaque, comportamiento de funciones de seguridad, tiempos de sensores ni comportamiento real de ninguna máquina, HIL ni certificación.

## En una placa

La estación lee cinco entradas digitales (Start, Stop, EStop, Part y Reset), y las placas del estudiante tienen cuatro. Complétela en Simulación: su calificación es la misma cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/capstone-packing-station <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
