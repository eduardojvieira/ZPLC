---
title: "Bloques de función: un enclavamiento, dos bombas"
sidebar_label: "function-block-pump-pair"
description: "La lección function-block-pump-pair: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Bloques de función: un enclavamiento, dos bombas

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/function-block-pump-pair. Do not edit. >>> */}

Escriba el cuerpo de un bloque de función que mantiene un enclavamiento de arranque y parada, y úselo dos veces, una por bomba.

## Datos

- Módulo: [7](../modules/module-7.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [types-arithmetic-comparison](./types-arithmetic-comparison.md)

## Objetivos

- Escriba un bloque de función con entradas, una salida y una memoria que vive entre llamadas.
- Vea que dos instancias del mismo bloque de función guardan memorias separadas.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es del runtime nativo POSIX con una tarea de 10 ms; no establece el comportamiento de una bomba, la corriente de arranque ni requisitos de una máquina real, HIL ni certificación.

## En una placa

La lección arranca y detiene dos bombas en pasos exactos para comparar dos instancias de un mismo bloque, y no se ha registrado una traza de placa para ella. Complétela en Simulación: su calificación es la misma cada vez y no necesita una placa.

{/* <<< END GENERATED: learn/lessons/function-block-pump-pair <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
