---
title: "Flancos en escalera: contactos P y N y pulsos de un escaneo"
sidebar_label: "ld-edges"
description: "La lección ld-edges: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Flancos en escalera: contactos P y N y pulsos de un escaneo

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/ld-edges. Do not edit. >>> */}

Use un contacto de transición positiva y un contacto de transición negativa para que una caja en un transportador dé un pulso al llegar y otro al salir, sin importar cuánto tiempo siga activo el sensor.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: sí
- Planta: ninguna
- Requisitos previos: [set-reset-alarm-latch-ladder](./set-reset-alarm-latch-ladder.md)

## Objetivos

- Use un contacto de transición positiva (P) y un contacto de transición negativa (N) para convertir un nivel en un pulso de un escaneo.
- Explique por qué una entrada retenida debe contarse una sola vez y qué escaneo ve el pulso.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el antirrebote, el tiempo de respuesta ni el cableado de un sensor real, HIL ni certificación.

## En una placa

El sensor de cajas y sus pulsos se califican en el simulador nativo, y esta lección no incluye cableado para las placas del estudiante. Complétela en Simulación, que da el mismo resultado cada vez y no necesita placa.

{/* <<< END GENERATED: learn/lessons/ld-edges <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
