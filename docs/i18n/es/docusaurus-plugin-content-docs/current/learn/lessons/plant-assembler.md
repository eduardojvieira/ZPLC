---
title: "Ensamblar tapas y bases"
sidebar_label: "plant-assembler"
description: "La lección plant-assembler: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Ensamblar tapas y bases

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-assembler. Do not edit. >>> */}

Modele un ensamblador de dos ejes como un diagrama: tome una tapa de una banda, colóquela sobre una base en otra banda y repita tres veces.

## Datos

- Módulo: [15](../modules/module-15.md)
- Nivel: Avanzado
- Tiempo estimado: 50 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Página de lectura: no
- Planta: [Ensamble de dos ejes](../../plant/scenes/two-axis-assembly.md)
- Requisitos previos: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md), [plant-belt-transfer](./plant-belt-transfer.md)

## Objetivos

- Coordinar dos ejes y una ventosa en una sola secuencia, con un paso por movimiento.
- Elegir entre dos pasos siguientes con condiciones de transición que se excluyen entre sí.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

Las pruebas dan evidencia determinista del host POSIX nativo sobre una escena de planta simulada; no son evidencia física, de hardware, HIL ni de certificación.

## En una placa

El diagrama lee ocho entradas y gobierna catorce salidas, con una ventosa y tres bandas; las placas del estudiante tienen cuatro entradas, y la ventosa y las piezas existen solo en la escena simulada. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-assembler <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
