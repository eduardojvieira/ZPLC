---
title: "Enclavamientos y permisivos en diagrama de bloques de función: una protección que detiene el motor"
sidebar_label: "interlock-guard-permissive-fbd"
description: "La lección interlock-guard-permissive-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Enclavamientos y permisivos en diagrama de bloques de función: una protección que detiene el motor

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/interlock-guard-permissive-fbd. Do not edit. >>> */}

Conecte un permisivo al reinicio de un biestable RS para que el motor funcione solo mientras la protección esté cerrada, y compruébelo con la planta del motor y su realimentación de velocidad.

## Datos

- Módulo: [6](../modules/module-6.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: FBD
- Rutas: Simulación
- Planta: [`motor-v1`](../plants.md)
- Requisitos previos: [interlock-guard-permissive](./interlock-guard-permissive.md), [boolean-logic-two-hand-guard-fbd](./boolean-logic-two-hand-guard-fbd.md)

## Objetivos

- Distinga un permisivo, una condición que debe ser TRUE para que la salida esté en ON, de una orden.
- Conecte el permisivo al reinicio de un biestable RS, que es dominante al reinicio, para que una protección abierta suelte el motor y además impida que Start lo rearranque.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX para un modelo de planta de motor incorporado y una tarea de 10 ms; no demuestran una función de seguridad, el cableado de la protección ni el tiempo de parada, ni son evidencia de HIL ni de certificación.

## En una placa

La realimentación de marcha de este diagrama de bloques de función proviene de la planta simulada del motor; una placa del estudiante no tiene un motor que la dé. Complétela en Simulación, que proporciona el motor y su realimentación de marcha al diagrama de bloques de función.

{/* <<< END GENERATED: learn/lessons/interlock-guard-permissive-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
