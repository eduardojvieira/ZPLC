---
title: "Del sensor A al sensor B en Ladder"
sidebar_label: "plant-latch-two-sensors-ladder"
description: "La lección plant-latch-two-sensors-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Del sensor A al sensor B en Ladder

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-latch-two-sensors-ladder. Do not edit. >>> */}

Secuencie un movimiento con una bobina de activación y una de borrado: haga correr la banda desde el sensor A hasta que la caja llegue al sensor B.

## Datos

- Módulo: [12](../modules/module-12.md)
- Nivel: Avanzado
- Tiempo estimado: 20 minutos
- Lenguajes: LD
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

Las bobinas de activación y de borrado de esta lección mantienen una banda entre dos sensores que existen solo en la escena simulada; una placa del estudiante no tiene banda que lleve una caja del primer contacto al segundo. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-latch-two-sensors-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
