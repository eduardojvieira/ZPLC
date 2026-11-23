---
title: "El mismo lazo con bloques de función"
sidebar_label: "plant-tank-pid-fbd"
description: "La lección plant-tank-pid-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# El mismo lazo con bloques de función

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-tank-pid-fbd. Do not edit. >>> */}

Cablee el lazo de nivel de un tanque como un diagrama de bloques de función: un bloque PID_Compact entre el nivel y la consigna escalados y la válvula de entrada.

## Datos

- Módulo: [13](../modules/module-13.md)
- Nivel: Avanzado
- Tiempo estimado: 40 minutos
- Lenguajes: FBD
- Rutas: Simulación
- Página de lectura: no
- Planta: [Control de nivel de un tanque](../../plant/scenes/tank-level-control.md)
- Requisitos previos: [plant-tank-pid](./plant-tank-pid.md)

## Objetivos

- Cablear un bloque de función PID_Compact en un diagrama: consigna, variable de proceso, ganancias, tiempo de ciclo y límites de salida a la izquierda, la salida a la derecha.
- Seguir un valor por el diagrama, desde el número entero bruto del nivel hasta metros y de ahí a la válvula de entrada.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

La calificación ejecuta el tanque simulado en el simulador de esta computadora. Comprueba hacia dónde va el nivel, no cómo se dibuja el diagrama ni los valores de las ganancias. No dice nada sobre un tanque o una válvula reales, sus tiempos ni su seguridad.

## En una placa

El diagrama de esta lección maneja el mismo tanque simulado que el lazo en texto estructurado, y la ruta de hardware de las lecciones de planta se abre en una versión posterior, cuando su temporización de lazo se haya medido con el modo de E/S de planta en una placa del estudiante. Complétela en Simulación, donde el tanque y la perturbación del lazo forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-tank-pid-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
