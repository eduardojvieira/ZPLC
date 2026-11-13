---
title: "Leer el nivel en diagrama de escalera"
sidebar_label: "plant-tank-level-scaling-ladder"
description: "La lección plant-tank-level-scaling-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Leer el nivel en diagrama de escalera

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-tank-level-scaling-ladder. Do not edit. >>> */}

Escale con cuadros de función el nivel crudo de un tanque, un número entero de 0 a 27648, a metros, y úselo para mantener el nivel cerca de un valor de consigna con una entrada proporcional.

## Datos

- Módulo: [13](../modules/module-13.md)
- Nivel: Avanzado
- Tiempo estimado: 30 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: no
- Planta: [Control de nivel de un tanque](../../plant/scenes/tank-level-control.md)
- Requisitos previos: [analog-scaling-integer](./analog-scaling-integer.md), [plant-timed-tank](./plant-timed-tank.md)

## Objetivos

- Escalar con cuadros un valor analógico a unidades de ingeniería: convertir primero a REAL y luego dividir entre el rango crudo.
- Leer el mapa de planta para hallar el rango crudo de cada señal, y ver qué hace al proceso una escala equivocada.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

La calificación es una ejecución sin interfaz del tanque simulado en el entorno de ejecución POSIX nativo, con un nivel analógico que sigue las reglas de escala del mapa de la planta. No establece la exactitud, el ruido ni la calibración de un transmisor de nivel real, la temporización en hardware, HIL ni la certificación.

## En una placa

Los cuadros MOVE, DIV y LIMIT de esta lección escalan un nivel que proviene del tanque simulado, y la ruta de hardware de las lecciones de planta se abre en una versión posterior, cuando el intercambio analógico del modo de E/S de planta se haya medido en una placa del estudiante. Complétela en Simulación, donde el tanque, su sensor de nivel y los potenciómetros forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-tank-level-scaling-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
