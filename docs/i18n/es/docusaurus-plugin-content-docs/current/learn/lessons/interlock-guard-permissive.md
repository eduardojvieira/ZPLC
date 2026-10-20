---
title: "Enclavamientos y permisivos: una protección que detiene el motor"
sidebar_label: "interlock-guard-permissive"
description: "La lección interlock-guard-permissive: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Enclavamientos y permisivos: una protección que detiene el motor

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/interlock-guard-permissive. Do not edit. >>> */}

Agregue un permisivo al arranque y a la parada de un motor para que funcione solo con la protección cerrada, y compruébelo con la planta del motor y su realimentación de velocidad.

## Datos

- Módulo: [6](../modules/module-6.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: [`motor-v1`](../plants.md)
- Requisitos previos: [pedestrian-crossing-states](./pedestrian-crossing-states.md)

## Objetivos

- Distinga un permisivo, una condición que debe ser verdadera para que la salida esté encendida, de una orden.
- Ponga un permisivo en la misma condición que mantiene el motor, para que lo apague y además impida que Start lo vuelva a arrancar.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX para un modelo integrado de planta de motor, con una tarea de 10 ms; no demuestran una función de seguridad, el cableado de la protección, el tiempo de parada, HIL ni certificación.

## En una placa

La lección abre una entrada de protección en un paso exacto y necesita el modelo de planta del motor para su realimentación de velocidad, que una placa sin motor no puede dar. Complétela en Simulación, que aporta el motor y su realimentación de marcha.

{/* <<< END GENERATED: learn/lessons/interlock-guard-permissive <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
