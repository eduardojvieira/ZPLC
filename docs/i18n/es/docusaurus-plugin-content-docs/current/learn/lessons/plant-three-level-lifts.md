---
title: "Mover cajas entre tres niveles"
sidebar_label: "plant-three-level-lifts"
description: "La lección plant-three-level-lifts: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Mover cajas entre tres niveles

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-three-level-lifts. Do not edit. >>> */}

Secuencie dos elevadores como dos cadenas que corren en paralelo y se encuentran solo en la banda de transferencia compartida.

## Datos

- Módulo: [17](../modules/module-17.md)
- Nivel: Avanzado
- Tiempo estimado: 50 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Página de lectura: no
- Planta: ninguna
- Requisitos previos: [plant-buffer-release](./plant-buffer-release.md)

## Objetivos

- Describir cada elevador como su propia cadena de pasos que vuelve a su primer paso.
- Arrancar ambas cadenas con una sola transición y dejar que se encuentren solo en la banda entre los elevadores.

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

El diagrama maneja dos elevadores y una banda de transferencia entre ellos; una placa del estudiante no tiene elevadores, y la escena los aporta. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-three-level-lifts <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
