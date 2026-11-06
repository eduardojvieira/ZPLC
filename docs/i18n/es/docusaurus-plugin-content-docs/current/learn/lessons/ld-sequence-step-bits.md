---
title: "Una secuencia en escalera: los bits de paso llevan un tanque de llenado a mezcla y a vaciado"
sidebar_label: "ld-sequence-step-bits"
description: "La lección ld-sequence-step-bits: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Una secuencia en escalera: los bits de paso llevan un tanque de llenado a mezcla y a vaciado

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-sequence-step-bits. Do not edit. >>> */}

Agregue en una secuencia en escalera la transición del paso de mezcla al paso de vaciado, para que haya exactamente un bit de paso en ON a la vez y el tanque se vacíe después de la mezcla.

## Datos

- Módulo: [5](../modules/module-5.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: LD
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [ld-variables-and-types](./ld-variables-and-types.md)

## Objetivos

- Explique una secuencia como bits de paso, de los cuales exactamente uno está en ON a la vez y una transición pasa la secuencia al siguiente.
- Escriba una transición en escalera como dos acciones en el mismo ciclo: activar el bit del paso siguiente y desactivar el del paso actual.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el tiempo de recorrido de las válvulas, el comportamiento del motor del mezclador, la medición de nivel del tanque, HIL ni certificación.

## En una placa

La secuencia de esta lección maneja una válvula de llenado, un mezclador y una válvula de vaciado que una placa del estudiante no tiene, y el programa usa tres salidas cuando las placas tienen dos. Complétela en Simulación, donde toda la secuencia del tanque se puede repetir sin costo.

{/* <<< END GENERATED: learn/lessons/ld-sequence-step-bits <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
