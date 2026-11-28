---
title: "Modos manual y automático"
sidebar_label: "plant-manual-auto-ladder"
description: "La lección plant-manual-auto-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Modos manual y automático

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-manual-auto-ladder. Do not edit. >>> */}

Añada un modo al ensamblaje de dos ejes: avance el brazo a mano en manual, ejecute el ciclo en automático y no deje que uno se filtre en el otro.

## Datos

- Módulo: [18](../modules/module-18.md)
- Nivel: Avanzado
- Tiempo estimado: 45 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: sí
- Planta: [Ensamble de dos ejes](../../plant/scenes/two-axis-assembly.md)
- Requisitos previos: [plant-assembler](./plant-assembler.md), [plant-estop-interlocks](./plant-estop-interlocks.md)

## Objetivos

- Cambiar entre manual y automático con cada pulsación del pulsador de modo, y arrancar en manual.
- Mover el brazo con los pulsadores de avance solo en manual, sin pasar de un final de carrera, y arrancar el ciclo con Start solo en automático.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

Aprobar significa que su programa se comportó correctamente en el simulador de esta computadora. No dice nada sobre una máquina real, sus tiempos ni su seguridad.

## En una placa

Los peldaños leen cinco botones de panel y los finales de carrera de un brazo de dos ejes y gobiernan una ventosa; una placa del estudiante tiene cuatro entradas y ningún brazo, y la escena aporta el brazo, el panel y las cajas. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-manual-auto-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
