---
title: "Lista de instrucciones: una protección como permisivo de toda la condición"
sidebar_label: "interlock-guard-permissive-il"
description: "La lección interlock-guard-permissive-il: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Lista de instrucciones: una protección como permisivo de toda la condición

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/interlock-guard-permissive-il. Do not edit. >>> */}

Agregue un permisivo al arranque y la parada de un motor en lista de instrucciones para que el motor funcione solo mientras una protección está cerrada, y compruébelo con la planta del motor y su realimentación de velocidad.

## Datos

- Módulo: [6](../modules/module-6.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: IL
- Rutas: Simulación
- Planta: [`motor-v1`](../plants.md)
- Requisitos previos: [interlock-guard-permissive](./interlock-guard-permissive.md), [boolean-logic-two-hand-guard-il](./boolean-logic-two-hand-guard-il.md)

## Objetivos

- Distinga un permisivo, una condición que debe ser verdadera para que la salida esté en ON, de una orden, y escríbalo como una línea AND más.
- Coloque el permisivo después de las líneas que retienen el motor, para que lo apague y también impida que Start lo reinicie.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran una función de seguridad, el cableado de la protección ni el tiempo de parada, HIL ni certificación.

## En una placa

El enclavamiento del motor en lista de instrucciones lee la realimentación de marcha de la planta simulada del motor; una placa del estudiante no tiene un motor que la dé. Complétela en Simulación, que proporciona el motor y su realimentación de marcha.

{/* <<< END GENERATED: learn/lessons/interlock-guard-permissive-il <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
