---
title: "Del sensor A al sensor B"
sidebar_label: "plant-latch-two-sensors"
description: "La lección plant-latch-two-sensors: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Del sensor A al sensor B

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-latch-two-sensors. Do not edit. >>> */}

Secuencie un movimiento con un set y un reset: haga correr la banda desde el sensor A hasta que la caja llegue al sensor B.

## Datos

- Módulo: [12](../modules/module-12.md)
- Nivel: Avanzado
- Tiempo estimado: 20 minutos
- Lenguajes: ST
- Rutas: Simulación
- Página de lectura: no
- Planta: ninguna
- Requisitos previos: [plant-belt-to-sensor](./plant-belt-to-sensor.md)

## Objetivos

- Usar un set y un reset para mantener una salida entre dos eventos.
- Explicar por qué un sensor que se apaga no puede mantener la salida por sí solo.

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

La caja viaja del sensor A al sensor B sobre una banda simulada; una placa del estudiante no tiene una banda que la lleve entre los dos sensores. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-latch-two-sensors <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
