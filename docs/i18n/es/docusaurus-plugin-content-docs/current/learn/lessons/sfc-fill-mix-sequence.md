---
title: "Una secuencia en diagrama funcional secuencial: llenar y luego mezclar"
sidebar_label: "sfc-fill-mix-sequence"
description: "La lección sfc-fill-mix-sequence: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Una secuencia en diagrama funcional secuencial: llenar y luego mezclar

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/sfc-fill-mix-sequence. Do not edit. >>> */}

Complete un diagrama funcional secuencial de tres pasos agregando la transición temporizada que falta, y compruebe que la válvula y el mezclador nunca funcionan a la vez.

## Datos

- Módulo: [5](../modules/module-5.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [edge-counter-pulses](./edge-counter-pulses.md)

## Objetivos

- Lea un diagrama funcional secuencial como pasos que se activan de uno en uno, acciones que se ejecutan mientras su paso está activo y transiciones que trasladan la actividad.
- Agregue una transición temporizada que use el tiempo transcurrido de un paso.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran volúmenes de proceso, calidad de mezcla ni tiempos de válvulas en equipos reales, HIL ni certificación.

## En una placa

La lección se califica con tiempos de paso de 50 ms contados por ciclo, que una placa no repite al mismo ciclo en cada ejecución. Complétela en Simulación: su calificación es la misma cada vez y no necesita una placa.

{/* <<< END GENERATED: learn/lessons/sfc-fill-mix-sequence <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
