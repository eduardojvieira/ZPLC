---
title: "Proyecto final: una estación de empaque, de la descripción al programa probado"
sidebar_label: "capstone-packing-station"
description: "La lección capstone-packing-station: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Proyecto final: una estación de empaque, de la descripción al programa probado

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/capstone-packing-station. Do not edit. >>> */}

Convierta la descripción escrita de una pequeña estación de empaque en un programa en texto estructurado, con una autorretención, una parada de emergencia, un contador, un temporizador y una falla retenida, y demuestre que funciona con un escenario que también comprueba lo que no debe ocurrir.

## Datos

- Módulo: [11](../modules/module-11.md)
- Nivel: Avanzado
- Tiempo estimado: 60 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [conveyor-two-parts-diagnosis](./conveyor-two-parts-diagnosis.md)

## Objetivos

- Convierta cinco requisitos escritos en un solo programa en texto estructurado que combine una autorretención, una parada de emergencia, un contador, un temporizador y una falla retenida.
- Lea un escenario que comprueba tanto lo que debe ocurrir como lo que no debe ocurrir, y use sus aserciones fallidas para encontrar el requisito que pasó por alto.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran requisitos de una línea de empaque, el comportamiento de funciones de seguridad, tiempos de sensores ni el comportamiento de una máquina real, HIL ni certificación.

## En una placa

La lección se califica con pulsadores, un sensor de piezas y un atasco reproducidos en pasos exactos, y no se ha registrado una traza de placa para ella. Complétela en Simulación: su calificación es la misma cada vez y no necesita una placa.

{/* <<< END GENERATED: learn/lessons/capstone-packing-station <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
