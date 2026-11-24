---
title: "Tiempos de paso: una bocina antes de abrir la puerta"
sidebar_label: "step-times-sfc"
description: "La lección step-times-sfc: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Tiempos de paso: una bocina antes de abrir la puerta

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/step-times-sfc. Do not edit. >>> */}

Use el tiempo que un paso lleva activo en una transición, de modo que una bocina suene un tiempo fijo antes de que el motor de la puerta funcione otro tiempo fijo.

## Datos

- Módulo: [5](../modules/module-5.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Página de lectura: no
- Planta: ninguna
- Requisitos previos: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md)

## Objetivos

- Use el tiempo transcurrido de un paso, escrito step.T, como condición de una transición.
- Compruebe que el tiempo de un paso vuelve a cero cada vez que el paso se activa, de modo que dos ciclos duren lo mismo.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Aprobar significa que su programa se comportó correctamente en el simulador de esta computadora. No dice nada sobre una máquina real, sus tiempos ni su seguridad, y no demuestra los tiempos de aviso de una puerta real ni el comportamiento de una función de seguridad.

## En una placa

El aviso de la puerta hace sonar una bocina y mueve un motor desde un botón; los tiempos de sus pasos se califican en el simulador nativo, y esta lección no incluye cableado para las placas del estudiante. Complétela en Simulación, que da el mismo resultado cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/step-times-sfc <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
