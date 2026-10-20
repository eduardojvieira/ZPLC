---
title: "Una lógica en cinco lenguajes: un portón que se mantiene abierto"
sidebar_label: "one-logic-five-languages"
description: "La lección one-logic-five-languages: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Una lógica en cinco lenguajes: un portón que se mantiene abierto

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/one-logic-five-languages. Do not edit. >>> */}

Corrija un programa en texto estructurado para que un portón se mantenga abierto y se cierre con una orden; luego lea la misma lógica en lista de instrucciones, diagrama de escalera, diagrama de bloques de función y diagrama funcional secuencial, y compruebe que un solo escenario califica los cinco.

## Datos

- Módulo: [9](../modules/module-9.md)
- Nivel: Avanzado
- Tiempo estimado: 30 minutos
- Lenguajes: ST, LD, FBD, SFC, IL
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [instruction-list-door-alarm](./instruction-list-door-alarm.md)

## Objetivos

- Mantenga una salida encendida después de soltar su solicitud, y deje que la orden de cierre tenga prioridad, en texto estructurado.
- Reconozca la misma condición, (Request OR Open) AND NOT Close, en lista de instrucciones, diagrama de escalera, diagrama de bloques de función y diagrama funcional secuencial.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran requisitos de un portón, tiempos de actuadores ni el comportamiento de una máquina real, HIL ni certificación.

## En una placa

La lección se califica con una orden de abrir y una de cerrar reproducidas en pasos exactos, y no se ha registrado una traza de placa para ella. Complétela en Simulación: su calificación es la misma cada vez y no necesita una placa.

{/* <<< END GENERATED: learn/lessons/one-logic-five-languages <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
