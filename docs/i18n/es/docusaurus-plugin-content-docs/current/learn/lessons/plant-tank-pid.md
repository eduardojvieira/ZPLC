---
title: "Mantener el nivel con PID"
sidebar_label: "plant-tank-pid"
description: "La lección plant-tank-pid: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Mantener el nivel con PID

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-tank-pid. Do not edit. >>> */}

Mantenga el nivel de un tanque en una consigna con PID_Compact, consérvelo cuando se abra el vaciado y ajuste las ganancias a partir de lo que hace el nivel.

## Datos

- Módulo: [13](../modules/module-13.md)
- Nivel: Avanzado
- Tiempo estimado: 40 minutos
- Lenguajes: ST
- Rutas: Simulación
- Página de lectura: no
- Planta: [Control de nivel de un tanque](../../plant/scenes/tank-level-control.md)
- Requisitos previos: [plant-tank-level-scaling](./plant-tank-level-scaling.md)

## Objetivos

- Ejecutar un lazo PID con PID_Compact: consigna, variable de proceso, ganancias, tiempo de ciclo y límites de la salida.
- Ajustar las ganancias a partir de la respuesta del nivel y distinguir el efecto de los términos proporcional, integral y derivativo.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

La calificación ejecuta el tanque simulado en el simulador de esta computadora. Comprueba hacia dónde va el nivel, no los valores de las ganancias: varios ajustes pasan. No dice nada sobre un tanque o una válvula reales, sus tiempos ni su seguridad.

## En una placa

El lazo de esta lección se cierra a través del tanque simulado y su perturbación de vaciado, y la ruta de hardware de las lecciones de planta se abre en una versión posterior, cuando el tiempo de ciclo del lazo se haya medido con el modo de E/S de planta en una placa del estudiante. Complétela en Simulación, donde el tanque y la perturbación del lazo forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-tank-pid <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
