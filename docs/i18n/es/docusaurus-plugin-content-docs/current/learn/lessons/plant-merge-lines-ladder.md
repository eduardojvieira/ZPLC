---
title: "Fusionar dos líneas en Ladder"
sidebar_label: "plant-merge-lines-ladder"
description: "La lección plant-merge-lines-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Fusionar dos líneas en Ladder

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-merge-lines-ladder. Do not edit. >>> */}

Arbitre con peldaños de enclavamiento dos alimentadores que comparten una salida: dé prioridad a la línea A, deje pasar una caja a la vez y bloquee entre sí las dos cuchillas.

## Datos

- Módulo: [14](../modules/module-14.md)
- Nivel: Avanzado
- Tiempo estimado: 45 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: no
- Planta: ninguna
- Requisitos previos: [plant-counted-queue](./plant-counted-queue.md), [interlock-guard-permissive](./interlock-guard-permissive.md)

## Objetivos

- Arbitrar dos peticiones con una prioridad: la línea A gana cuando ambas esperan.
- Enclavar dos salidas para que nunca estén activas juntas y liberar la concesión solo cuando la caja haya despejado la fusión.

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

Los enclavamientos de concesión y las bobinas bloqueadas entre sí de esta lección arbitran cajas que dos alimentadores simulados entregan a una zona de fusión; una placa del estudiante no tiene alimentadores, cuchillas ni cajas que los contactos puedan arbitrar. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-merge-lines-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
