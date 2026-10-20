---
title: "Autorretención en diagrama de escalera: un motor que se mantiene encendido"
sidebar_label: "seal-in-ladder"
description: "La lección seal-in-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Autorretención en diagrama de escalera: un motor que se mantiene encendido

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/seal-in-ladder. Do not edit. >>> */}

Edite un peldaño en diagrama de escalera para que una pulsación de Start mantenga el motor encendido al soltar el botón, y una pulsación de Stop lo apague aunque Start siga pulsado.

## Datos

- Módulo: [2](../modules/module-2.md)
- Nivel: Fundamentos
- Tiempo estimado: 20 minutos
- Lenguajes: LD
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [boolean-logic-two-hand-guard](./boolean-logic-two-hand-guard.md)

## Objetivos

- Lea un peldaño en diagrama de escalera como un camino de contactos por el que debe pasar la energía para llegar a la bobina.
- Mantenga una bobina activada con un contacto de su propia salida en paralelo con Start, y deje Stop en serie para que Stop tenga prioridad.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran una función de parada segura, el cableado, los tiempos del hardware, HIL ni certificación.

## En una placa

La lección se califica con Start y Stop pulsados juntos en un paso exacto de 10 ms, que una placa no repite igual en cada ejecución. Complétela en Simulación: su calificación es la misma cada vez y no necesita una placa.

{/* <<< END GENERATED: learn/lessons/seal-in-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
