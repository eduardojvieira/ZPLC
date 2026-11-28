---
title: "Paro de emergencia y enclavamientos en diagrama de escalera"
sidebar_label: "plant-estop-interlocks-ladder"
description: "La lección plant-estop-interlocks-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Paro de emergencia y enclavamientos en diagrama de escalera

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-estop-interlocks-ladder. Do not edit. >>> */}

Haga que una línea en marcha se detenga al pulsar el paro de emergencia, muéstrelo con la luz roja y rehúse reiniciar hasta que se pulse Start de nuevo.

## Datos

- Módulo: [18](../modules/module-18.md)
- Nivel: Avanzado
- Tiempo estimado: 40 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: sí
- Planta: [Elevadores de tres niveles](../../plant/scenes/three-level-lifts.md)
- Requisitos previos: [plant-three-level-lifts](./plant-three-level-lifts.md), [interlock-guard-permissive](./interlock-guard-permissive.md)

## Objetivos

- Detener todas las salidas mientras el paro de emergencia está pulsado.
- Recordar el paro, de modo que soltar el pulsador no reinicie la línea.

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

La versión en escalera lee el paro de emergencia de la escena y detiene sus elevadores y bandas; una placa del estudiante no tiene circuito de paro de emergencia ni elevadores, y la pista de hardware llega con la ejecución HIL. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-estop-interlocks-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
