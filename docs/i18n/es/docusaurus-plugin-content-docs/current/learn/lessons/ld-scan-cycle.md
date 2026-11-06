---
title: "El ciclo de escaneo: por qué importa el orden de los peldaños"
sidebar_label: "ld-scan-cycle"
description: "La lección ld-scan-cycle: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# El ciclo de escaneo: por qué importa el orden de los peldaños

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-scan-cycle. Do not edit. >>> */}

Aprenda que un PLC lee sus entradas, resuelve los peldaños de arriba hacia abajo y luego escribe sus salidas, y corrija un programa cuya lámpara sigue al botón un ciclo demasiado tarde.

## Datos

- Módulo: [1](../modules/module-1.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: LD
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [ld-what-is-a-plc](./ld-what-is-a-plc.md)

## Objetivos

- Describa el ciclo de escaneo: leer las entradas, resolver los peldaños de arriba hacia abajo, escribir las salidas y repetir.
- Reordene dos peldaños para que un valor se calcule antes del peldaño que lo usa, y vea en la traza registrada la diferencia de un ciclo.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia determinista del host con el runtime nativo POSIX y una tarea de 10 ms, solo en su computador; no son evidencia de tiempos en una placa, HIL ni de seguridad.

## En una placa

El orden de los peldaños se califica ciclo por ciclo, y una placa no puede mostrar una diferencia de un ciclo sin instrumentos; la simulación registra cada ciclo. Complétela en Simulación, donde se registra cada ciclo y el resultado es el mismo cada vez.

{/* <<< END GENERATED: learn/lessons/ld-scan-cycle <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
