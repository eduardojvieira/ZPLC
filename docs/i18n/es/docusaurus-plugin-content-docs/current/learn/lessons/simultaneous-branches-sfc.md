---
title: "Ramas simultáneas: llenar y calentar a la vez"
sidebar_label: "simultaneous-branches-sfc"
description: "La lección simultaneous-branches-sfc: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Ramas simultáneas: llenar y calentar a la vez

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/simultaneous-branches-sfc. Do not edit. >>> */}

Inicie dos ramas a la vez, deje que cada una termine a su tiempo y únalas para que el mezclador arranque solo cuando ambas hayan terminado.

## Datos

- Módulo: [5](../modules/module-5.md)
- Nivel: Intermedio
- Tiempo estimado: 30 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objetivos

- Lea una divergencia simultánea como una transición que activa varios pasos a la vez, de modo que se ejecuten en paralelo.
- Escriba una convergencia como una transición que sale de todos los pasos que espera y se activa solo cuando todos están activos.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran velocidades de calentamiento, volúmenes de llenado, calidad de mezcla, HIL ni certificación.

## En una placa

La celda de mezcla maneja una válvula, un calentador y un mezclador desde un botón; sus dos ramas se califican en el simulador nativo, y esta lección no incluye cableado para las placas del estudiante. Complétela en Simulación, que da el mismo resultado cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/simultaneous-branches-sfc <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
