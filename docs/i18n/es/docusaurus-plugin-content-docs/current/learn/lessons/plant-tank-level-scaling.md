---
title: "Leer el nivel"
sidebar_label: "plant-tank-level-scaling"
description: "La lección plant-tank-level-scaling: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Leer el nivel

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-tank-level-scaling. Do not edit. >>> */}

Escale el nivel bruto de un tanque, un número entero de 0 a 27648, a metros, y úselo para mantener el nivel cerca de una consigna con una entrada proporcional.

## Datos

- Módulo: [13](../modules/module-13.md)
- Nivel: Avanzado
- Tiempo estimado: 30 minutos
- Lenguajes: ST
- Rutas: Simulación
- Página de lectura: sí
- Planta: [Control de nivel de un tanque](../../plant/scenes/tank-level-control.md)
- Requisitos previos: [analog-scaling-integer](./analog-scaling-integer.md), [plant-timed-tank](./plant-timed-tank.md)

## Objetivos

- Escalar un valor analógico a unidades de ingeniería de modo que se conserven las fracciones de una unidad.
- Leer el mapa de la planta para hallar el rango bruto de cada señal, y ver qué hace una escala errónea en el proceso.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

La calificación ejecuta el tanque simulado en el simulador de esta computadora, con un nivel analógico que sigue las reglas de escala del mapa de la planta. No dice nada sobre la exactitud, el ruido ni la calibración de un transmisor de nivel real, una máquina real, sus tiempos ni su seguridad.

## En una placa

El nivel analógico de esta lección proviene del tanque simulado, y la ruta de hardware de las lecciones de planta se abre en una versión posterior, cuando el intercambio analógico del modo de E/S de planta se haya medido en una placa del estudiante. Complétela en Simulación, donde el tanque, su sensor de nivel y los potenciómetros forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-tank-level-scaling <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
