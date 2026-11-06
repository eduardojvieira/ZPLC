---
title: "Proyecto final en escalera: una estación de empaque, de la descripción al programa probado"
sidebar_label: "ld-final-project"
description: "La lección ld-final-project: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Proyecto final en escalera: una estación de empaque, de la descripción al programa probado

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-final-project. Do not edit. >>> */}

Convierta la descripción escrita de una pequeña estación de empaque en un programa en escalera con una autorretención, un paro y un paro de emergencia cableados normalmente cerrados, un contador, un temporizador y una falla retenida, y compruébelo con un escenario que también verifica lo que no debe ocurrir.

## Datos

- Módulo: [11](../modules/module-11.md)
- Nivel: Avanzado
- Tiempo estimado: 60 minutos
- Lenguajes: LD
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [ld-diagnosis-debugger](./ld-diagnosis-debugger.md)

## Objetivos

- Convertir cinco requisitos escritos en un programa en escalera que combine una autorretención, paros normalmente cerrados, un contador, un temporizador y una falla retenida.
- Leer un escenario que verifica tanto lo que debe ocurrir como lo que no debe ocurrir, y usar sus aserciones fallidas para encontrar el requisito que omitió.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del equipo anfitrión con POSIX nativo y una tarea de 10 ms; no establecen requisitos de una línea de empaque, el comportamiento de una función de seguridad, la temporización de sensores ni el comportamiento de ninguna máquina real, HIL ni certificación.

## En una placa

La estación lee cinco entradas digitales (Start, StopOK, EStopOK, Part y Reset), y las placas del estudiante tienen cuatro. Complétela en Simulación: su calificación es la misma cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/ld-final-project <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
