---
title: "Acumular y liberar"
sidebar_label: "plant-buffer-release"
description: "La lección plant-buffer-release: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Acumular y liberar

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-buffer-release. Do not edit. >>> */}

Modele una estación de búfer como una máquina de estados: cargue cinco cajas, retenga en un tope retráctil y libere una por cada pulsación del pulsador.

## Datos

- Módulo: [14](../modules/module-14.md)
- Nivel: Avanzado
- Tiempo estimado: 45 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Página de lectura: sí
- Planta: [Búfer y liberación](../../plant/scenes/buffer-release.md)
- Requisitos previos: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md), [plant-counted-queue](./plant-counted-queue.md)

## Objetivos

- Modelar una estación con pasos y transiciones, un paso por cada cosa que hace la estación.
- Elegir entre dos pasos siguientes con condiciones de transición que se excluyen entre sí.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

Aprobar significa que su programa se comportó correctamente en el simulador de esta computadora. No dice nada sobre una máquina real, sus tiempos ni su seguridad.

## En una placa

El diagrama lee cinco entradas cuando las placas del estudiante tienen cuatro, y la cola y su cuchilla existen solo en la escena simulada. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-buffer-release <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
