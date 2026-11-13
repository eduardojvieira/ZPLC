---
title: "Modos manual y automático"
sidebar_label: "plant-manual-auto"
description: "La lección plant-manual-auto: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Modos manual y automático

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-manual-auto. Do not edit. >>> */}

Añada un modo al ensamblaje de dos ejes: avance el brazo a mano en manual, ejecute el ciclo en automático y no deje que uno se filtre en el otro.

## Datos

- Módulo: [18](../modules/module-18.md)
- Nivel: Avanzado
- Tiempo estimado: 45 minutos
- Lenguajes: ST
- Rutas: Simulación
- Página de lectura: no
- Planta: ninguna
- Requisitos previos: [plant-assembler](./plant-assembler.md), [plant-estop-interlocks](./plant-estop-interlocks.md)

## Objetivos

- Guardar el modo en una memoria que cambie con una pulsación de ModeBtn, y dejar que la máquina arranque en manual.
- Mover el brazo con los botones de avance solo en manual, sin pasar de un final de carrera, y arrancar el ciclo con Start solo en automático.

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

La lección necesita un brazo de dos ejes con finales de carrera, una ventosa y cinco botones de panel; una placa del estudiante tiene cuatro entradas, ni brazo ni panel, y la escena aporta todo. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-manual-auto <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
