---
title: "Llenar y vaciar con temporizadores"
sidebar_label: "plant-timed-tank"
description: "La lección plant-timed-tank: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Llenar y vaciar con temporizadores

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-timed-tank. Do not edit. >>> */}

Ejecute un ciclo de llenado, espera y vaciado de un tanque con temporizadores de retardo a la conexión, un arranque desde el panel y una parada de emergencia.

## Datos

- Módulo: [13](../modules/module-13.md)
- Nivel: Avanzado
- Tiempo estimado: 30 minutos
- Lenguajes: ST
- Rutas: Simulación
- Página de lectura: no
- Planta: [Tanque temporizado](../../plant/scenes/timed-tank.md)
- Requisitos previos: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md)

## Objetivos

- Medir los pasos de un proceso de modo que cada paso temporizado dure su propio tiempo.
- Usar un temporizador como límite de seguridad en un paso que normalmente termina con un sensor, y dejar que la parada de emergencia aborte el ciclo.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

La calificación ejecuta el tanque simulado en el simulador de esta computadora. No dice nada sobre un tanque, una válvula o un sensor reales, sus tiempos ni su seguridad.

## En una placa

El tanque, sus válvulas y la parada de emergencia de este ciclo temporizado son simulados, y la ruta de hardware de las lecciones de planta se abre en una versión posterior, cuando el modo de E/S de planta se haya medido en una placa del estudiante. Complétela en Simulación, donde el tanque, sus válvulas y la parada de emergencia forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-timed-tank <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
