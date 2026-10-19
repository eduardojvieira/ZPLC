---
title: "Assertions temporales y falla por atasco"
sidebar_label: "temporal-assertions-jam-fault"
description: "La lección temporal-assertions-jam-fault: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Assertions temporales y falla por atasco

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/temporal-assertions-jam-fault. Do not edit. >>> */}

Enclave la falla por atasco y pruebe su temporización con assertions AT, WITHIN, FOR, UNTIL, RISING y FALLING.

## Datos

- Módulo: [8](../modules/module-8.md)
- Nivel: Avanzado
- Tiempo estimado: 25 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [conveyor-classification-jam](./conveyor-classification-jam.md)

## Objetivos

- Enclave la falla por atasco y pruebe su temporización con assertions temporales.
- Exija un Start nuevo antes de mover la cinta otra vez tras liberar la falla.

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

La lección comprueba aserciones temporales al milisegundo, y una placa añade fluctuaciones de tiempo que harían poco fiables esas comprobaciones. Complétela en Simulación, donde el tiempo es exacto, y luego aplique las mismas aserciones a una placa con las herramientas de pruebas.

{/* <<< END GENERATED: learn/lessons/temporal-assertions-jam-fault <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
