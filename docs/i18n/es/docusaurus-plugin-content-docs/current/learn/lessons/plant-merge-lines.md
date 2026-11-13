---
title: "Fusionar dos líneas"
sidebar_label: "plant-merge-lines"
description: "La lección plant-merge-lines: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Fusionar dos líneas

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-merge-lines. Do not edit. >>> */}

Arbitre dos alimentadores que comparten una salida: dé prioridad a la línea A, deje pasar una caja a la vez y enclave las dos cuchillas.

## Datos

- Módulo: [14](../modules/module-14.md)
- Nivel: Avanzado
- Tiempo estimado: 45 minutos
- Lenguajes: ST
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

Dos alimentadores, dos cuchillas y una zona de fusión existen solo en la escena simulada, y una placa del estudiante no puede aportar las cajas que hay que arbitrar. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-merge-lines <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
