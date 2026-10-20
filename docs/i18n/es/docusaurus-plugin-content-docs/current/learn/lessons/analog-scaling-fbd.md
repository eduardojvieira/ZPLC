---
title: "Escalado analógico en diagrama de bloques de función: una alarma de nivel alto"
sidebar_label: "analog-scaling-fbd"
description: "La lección analog-scaling-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Escalado analógico en diagrama de bloques de función: una alarma de nivel alto

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/analog-scaling-fbd. Do not edit. >>> */}

Edite un diagrama de bloques de función que escala cuentas analógicas crudas de 0 a 4095 a un nivel en porcentaje con los bloques MUL, DIV y LIMIT, y enciende HighLevel al 75 por ciento.

## Datos

- Módulo: [4](../modules/module-4.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: FBD
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [analog-scaling-integer](./analog-scaling-integer.md), [counter-batch-fbd](./counter-batch-fbd.md)

## Objetivos

- Escale cuentas analógicas crudas a unidades de ingeniería con bloques aritméticos: multiplique por el rango de las unidades y luego divida por el rango de las cuentas.
- Mantenga un valor escalado dentro de su rango con un bloque LIMIT, y compare con un umbral el valor en unidades de ingeniería, no en cuentas crudas.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es del runtime nativo POSIX con una tarea de 10 ms y un sustituto del potenciómetro; no establece la exactitud, el ruido ni la calibración de una entrada analógica real, el cableado, HIL ni certificación.

## En una placa

La lección gira un potenciómetro sustituto con una entrada BOOL en pasos exactos de 10 ms, y todavía no se ha escrito una verificación contra una traza registrada desde un potenciómetro real en AI0. Complétela en Simulación: su calificación es la misma cada vez y no necesita una placa.

{/* <<< END GENERATED: learn/lessons/analog-scaling-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
