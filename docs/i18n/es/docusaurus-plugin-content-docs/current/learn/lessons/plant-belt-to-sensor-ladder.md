---
title: "Mover una caja hasta un sensor en Ladder"
sidebar_label: "plant-belt-to-sensor-ladder"
description: "La lección plant-belt-to-sensor-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Mover una caja hasta un sensor en Ladder

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-belt-to-sensor-ladder. Do not edit. >>> */}

Arranque una banda con un botón mediante una bobina de activación y deténgala con una bobina de borrado cuando una caja llegue al sensor del extremo.

## Datos

- Módulo: [12](../modules/module-12.md)
- Nivel: Avanzado
- Tiempo estimado: 20 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: no
- Planta: ninguna
- Requisitos previos: [motor-start-stop-safe](./motor-start-stop-safe.md)

## Objetivos

- Arrancar un actuador con la pulsación de un botón mediante una bobina de activación y recordar que está en marcha.
- Detener el actuador con una bobina de borrado cuando un sensor ve la caja.

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

Los peldaños de esta lección gobiernan una banda y leen un sensor que solo aporta la escena simulada; una placa del estudiante no tiene banda, caja ni sensor en el extremo para que los contactos lean. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-belt-to-sensor-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
