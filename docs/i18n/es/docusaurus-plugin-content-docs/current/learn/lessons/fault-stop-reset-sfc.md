---
title: "Fallas, parada y reinicio en un diagrama"
sidebar_label: "fault-stop-reset-sfc"
description: "La lección fault-stop-reset-sfc: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Fallas, parada y reinicio en un diagrama

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/fault-stop-reset-sfc. Do not edit. >>> */}

Detenga un ciclo de alimentación y prensa en cuanto aparece una falla, y devuélvalo a IDLE solo cuando la falla haya desaparecido y se pulse Reset.

## Datos

- Módulo: [6](../modules/module-6.md)
- Nivel: Intermedio
- Tiempo estimado: 25 minutos
- Lenguajes: SFC
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [sfc-fill-mix-sequence](./sfc-fill-mix-sequence.md), [tank-level-fault-reset](./tank-level-fault-reset.md)

## Objetivos

- Agregue un paso de falla al que pueda llegar todo paso de trabajo, con una transición de mayor prioridad que las temporizadas.
- Devuelva el diagrama a su paso inicial con un Reset que funciona solo cuando la falla ha desaparecido.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran una parada segura, una función de seguridad, el comportamiento de una prensa, HIL ni certificación.

## En una placa

La celda de prensa lee un botón de inicio, un sensor de falla y un botón de reinicio y maneja un alimentador, una prensa y una lámpara de alarma; su parada y su reinicio se califican en el simulador nativo, y esta lección no incluye cableado para las placas del estudiante. Complétela en Simulación, que da el mismo resultado cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/fault-stop-reset-sfc <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
