---
title: "Tomar de una banda y dejar en otra"
sidebar_label: "plant-belt-transfer"
description: "La lección plant-belt-transfer: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Tomar de una banda y dejar en otra

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-belt-transfer. Do not edit. >>> */}

Secuencie un carro con pinza usando finales de carrera y la señal de agarre para pasar cuatro cajas de una banda de entrada a una banda de salida.

## Datos

- Módulo: [15](../modules/module-15.md)
- Nivel: Avanzado
- Tiempo estimado: 40 minutos
- Lenguajes: ST
- Rutas: Simulación
- Página de lectura: no
- Planta: ninguna
- Requisitos previos: [plant-counted-queue](./plant-counted-queue.md)

## Objetivos

- Secuenciar un tomar y colocar con un estado por movimiento, cada uno a la espera de su final de carrera.
- Esperar la señal de agarre antes de elevar y mantener detenida la banda receptora mientras se deja una caja.

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

La secuencia necesita un carro de dos ejes con una pinza, una cuchilla de tope y dos bandas; una placa del estudiante no tiene manipulador, y la escena aporta todo ello. Complétela en Simulación, donde la escena y sus cajas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-belt-transfer <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
