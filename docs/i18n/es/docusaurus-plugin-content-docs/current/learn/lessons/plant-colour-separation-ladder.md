---
title: "Enviar cada color a su banda en diagrama de escalera"
sidebar_label: "plant-colour-separation-ladder"
description: "La lección plant-colour-separation-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Enviar cada color a su banda en diagrama de escalera

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-colour-separation-ladder. Do not edit. >>> */}

Lea el color de cada pieza que espera en la cuchilla de parada, empuje las rojas a la banda lateral y deje pasar las azules.

## Datos

- Módulo: [16](../modules/module-16.md)
- Nivel: Avanzado
- Tiempo estimado: 45 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: no
- Planta: [Separación por color](../../plant/scenes/colour-separation.md)
- Requisitos previos: [plant-counted-queue](./plant-counted-queue.md)

## Objetivos

- Decidir una ruta a partir del resultado de un sensor cuando la pieza está quieta.
- Ejecutar un empuje como una secuencia corta: extender hasta Extended, retraer hasta Retracted.

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

La versión en escalera lee el sensor de color y gobierna el empujador, la cuchilla y las tres bandas de la escena; una placa del estudiante no tiene sensor de color ni contenedores a los que conectarlos. Complétela en Simulación, donde la escena y sus piezas forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-colour-separation-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
