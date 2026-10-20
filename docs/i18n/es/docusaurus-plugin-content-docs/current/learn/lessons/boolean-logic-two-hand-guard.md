---
title: "Lógica booleana: un mando a dos manos con protección"
sidebar_label: "boolean-logic-two-hand-guard"
description: "La lección boolean-logic-two-hand-guard: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Lógica booleana: un mando a dos manos con protección

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/boolean-logic-two-hand-guard. Do not edit. >>> */}

Combine AND, NOT y XOR para que una prensa solo se habilite con las dos manos en los botones y la protección cerrada.

## Datos

- Módulo: [2](../modules/module-2.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [blinky-ladder-timer-feedback](./blinky-ladder-timer-feedback.md)

## Objetivos

- Escriba una condición que sea verdadera solo cuando varias entradas sean verdaderas a la vez.
- Use NOT para una lámpara de aviso y XOR para exactamente una de dos entradas.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el tiempo de respuesta, la redundancia ni el comportamiento ante fallas que exige un dispositivo real de mando a dos manos, y no son evidencia de seguridad, de HIL ni de certificación.

## En una placa

La lección pulsa dos entradas en instantes definidos para probar AND, NOT y XOR; una placa necesitaría dos pulsadores cableados y una traza registrada que todavía no existen. Complétela en Simulación, donde el escenario pulsa ambas entradas por usted.

{/* <<< END GENERATED: learn/lessons/boolean-logic-two-hand-guard <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
