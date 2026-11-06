---
title: "Su propio bloque de función en escalera: dos bombas, un bloque"
sidebar_label: "ld-function-blocks"
description: "La lección ld-function-blocks: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Su propio bloque de función en escalera: dos bombas, un bloque

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-function-blocks. Do not edit. >>> */}

Llame al bloque de función PumpCtl del proyecto desde un segundo peldaño de escalera para que la bomba 2 tenga su propia instancia, con su propia memoria, junto a la bomba 1.

## Datos

- Módulo: [7](../modules/module-7.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: LD
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [tank-level-fault-reset-ladder](./tank-level-fault-reset-ladder.md)

## Objetivos

- Coloque en un peldaño de escalera un bloque de función que el proyecto declara en texto estructurado, y conecte sus entradas y su salida.
- Explique que cada instancia de un bloque de función guarda su propia memoria, por lo que dos bombas necesitan dos instancias de un mismo bloque.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran la corriente de arranque de las bombas, el cableado de los contactores, la supervisión de la línea de succión, HIL ni certificación.

## En una placa

El programa de esta lección lee cuatro entradas y maneja dos contactores de bomba con un permisivo que proviene de una línea de succión, que una placa del estudiante no tiene. Complétela en Simulación, donde ambas bombas se pueden arrancar, detener y dejar sin agua sin costo.

{/* <<< END GENERATED: learn/lessons/ld-function-blocks <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
