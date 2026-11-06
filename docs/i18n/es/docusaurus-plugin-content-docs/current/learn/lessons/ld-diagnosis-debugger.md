---
title: "Diagnóstico de un programa en escalera en simulación: observación, punto de interrupción, forzado y traza"
sidebar_label: "ld-diagnosis-debugger"
description: "La lección ld-diagnosis-debugger: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Diagnóstico de un programa en escalera en simulación: observación, punto de interrupción, forzado y traza

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-diagnosis-debugger. Do not edit. >>> */}

Encuentre por qué un motor no se detiene observando sus variables, deteniendo el programa en un peldaño, forzando una entrada en simulación y leyendo la traza; luego corrija el peldaño y libere todos los forzados.

## Datos

- Módulo: [8](../modules/module-8.md)
- Nivel: Avanzado
- Tiempo estimado: 40 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: sí
- Planta: ninguna
- Requisitos previos: [ld-function-blocks](./ld-function-blocks.md)

## Objetivos

- Usar la tabla de observación, un punto de interrupción en un peldaño, una entrada forzada y la traza para encontrar la causa de un programa en escalera que no se comporta como se describe.
- Corregir el peldaño para que el paro y la sobrecarga detengan el motor, y liberar todos los forzados antes de comprobar.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan solo evidencia determinista del equipo anfitrión con POSIX nativo. El forzado y los puntos de interrupción de esta lección son acciones del estudiante en simulación; no son evidencia de hardware, de HIL, de seguridad ni de certificación.

## En una placa

Esta lección usa la tabla de observación, los puntos de interrupción, el forzado y la traza del simulador, y el programa lee tres entradas digitales cuando las placas del estudiante tienen cuatro. Complétela en Simulación, donde forzar una entrada no cuesta nada y se puede repetir.

{/* <<< END GENERATED: learn/lessons/ld-diagnosis-debugger <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
