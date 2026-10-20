---
title: "Assertions temporales y falla por atasco"
sidebar_label: "temporal-assertions-jam-fault"
description: "La lección temporal-assertions-jam-fault: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Assertions temporales y falla por atasco

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/temporal-assertions-jam-fault. Do not edit. >>> */}

Retenga la falla por atasco y compruebe su temporización con aserciones AT, WITHIN, FOR, UNTIL, RISING y FALLING.

## Datos

- Módulo: [8](../modules/module-8.md)
- Nivel: Avanzado
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [conveyor-classification-jam](./conveyor-classification-jam.md)

## Objetivos

- Retenga la falla por atasco y compruebe su temporización con aserciones temporales.
- Exija un nuevo Start antes de que la cinta vuelva a moverse tras liberar la falla.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Contraste**
6. **Reflexione**

## Qué cubre la evidencia

La evidencia de Tests es del runtime nativo POSIX host y de inputs discretos; el atasco programado no es una falla física, despeje físico, timing de target, HIL ni certificación.

## En una placa

El módulo 8 enseña pruebas de escenario y diagnóstico, que se ejecutan en simulación, y la lección lee siete entradas cuando las placas del estudiante tienen cuatro. Complétela en Simulación, donde el tiempo es exacto.

{/* <<< END GENERATED: learn/lessons/temporal-assertions-jam-fault <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
