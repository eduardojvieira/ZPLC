---
title: "Escalado analógico: de cuentas en bruto a un porcentaje"
sidebar_label: "analog-scaling-integer"
description: "La lección analog-scaling-integer: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Escalado analógico: de cuentas en bruto a un porcentaje

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/analog-scaling-integer. Do not edit. >>> */}

Escale una cuenta en bruto de 0 a 1000 a un porcentaje con aritmética entera, y active una advertencia al 50 por ciento y una alarma al 80 por ciento.

## Datos

- Módulo: [4](../modules/module-4.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [types-arithmetic-comparison](./types-arithmetic-comparison.md)

## Objetivos

- Escale una cuenta en bruto a unidades de ingeniería con una multiplicación seguida de una división, en ese orden.
- Vea que la división entera descarta el resto, y elija un tipo entero con rango suficiente para el producto intermedio.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran la exactitud, el ruido ni la calibración de una entrada analógica real, HIL ni certificación.

## En una placa

La lección avanza una cuenta cruda por ciclo, no una entrada analógica real, así que una placa no daría las mismas cuentas en los mismos momentos. Complétela en Simulación: su calificación es la misma cada vez y no necesita una placa.

{/* <<< END GENERATED: learn/lessons/analog-scaling-integer <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
