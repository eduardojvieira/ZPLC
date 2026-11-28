---
title: "Encontrar la falla"
sidebar_label: "plant-fault-actions"
description: "La lección plant-fault-actions: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Encontrar la falla

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-fault-actions. Do not edit. >>> */}

Detecte una barrera que se atasca en encendido mientras la línea clasifica y detenga la línea antes de que desvíe una caja.

## Datos

- Módulo: [18](../modules/module-18.md)
- Nivel: Avanzado
- Tiempo estimado: 45 minutos
- Lenguajes: ST
- Rutas: Simulación
- Página de lectura: sí
- Planta: [Clasificación por altura con transferencia de cadenas](../../plant/scenes/height-sorting-chain.md)
- Requisitos previos: [plant-height-chain](./plant-height-chain.md)

## Objetivos

- Diagnosticar un sensor atascado a partir de un hecho que el programa puede leer, no del propio sensor.
- Elegir una reacción que se ajuste a la máquina: detener lo que trae cajas nuevas y dejar llegar las que ya se mueven.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

Aprobar significa que su programa se comportó correctamente en el simulador de esta computadora. No dice nada sobre una máquina real, sus tiempos ni su seguridad, y no demuestra el comportamiento del sensor en hardware real.

## En una placa

La lección provoca un sensor atascado en una planta simulada con una transferencia de cadenas y tres contenedores; una placa del estudiante no tiene esa planta, y la escena la aporta junto con la acción de fallo. Complétela en Simulación, donde la escena y sus piezas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-fault-actions <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
