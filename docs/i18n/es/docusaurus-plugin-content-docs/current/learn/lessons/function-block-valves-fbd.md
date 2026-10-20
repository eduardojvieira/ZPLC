---
title: "Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque"
sidebar_label: "function-block-valves-fbd"
description: "La lección function-block-valves-fbd: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Su propio bloque de función en diagrama de bloques de función: dos válvulas, un bloque

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/function-block-valves-fbd. Do not edit. >>> */}

Edite un diagrama de bloques de función para que una segunda instancia del bloque de función ValveCtl del proyecto comande la válvula de vaciado, con sus entradas y su salida conectadas.

## Datos

- Módulo: [7](../modules/module-7.md)
- Nivel: Intermedio
- Tiempo estimado: 20 minutos
- Lenguajes: FBD
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [function-block-pump-pair](./function-block-pump-pair.md), [counter-batch-fbd](./counter-batch-fbd.md)

## Objetivos

- Coloque en un diagrama de bloques de función un bloque de función que el proyecto declara en texto estructurado, y lea sus puertos en la declaración.
- Conecte una segunda instancia del mismo bloque de función, y vea que cada instancia conserva una memoria propia.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es del runtime nativo POSIX con una tarea de 10 ms; no establece el cableado de las válvulas, su tiempo de recorrido, la supervisión del suministro de aire, HIL ni certificación.

## En una placa

La lección abre y cierra dos válvulas simuladas con pulsadores accionados en pasos exactos de 10 ms, y todavía no se ha escrito para ella una verificación contra una traza registrada desde una placa. Complétela en Simulación: su calificación es la misma cada vez y no necesita una placa.

{/* <<< END GENERATED: learn/lessons/function-block-valves-fbd <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
