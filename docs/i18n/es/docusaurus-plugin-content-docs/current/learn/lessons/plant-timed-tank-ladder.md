---
title: "Llenar y vaciar con temporizadores en diagrama de escalera"
sidebar_label: "plant-timed-tank-ladder"
description: "La lección plant-timed-tank-ladder: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Llenar y vaciar con temporizadores en diagrama de escalera

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/plant-timed-tank-ladder. Do not edit. >>> */}

Ejecute un ciclo de llenado, retención y vaciado de un tanque con bloques TON en peldaños, un arranque de panel y una parada de emergencia.

## Datos

- Módulo: [13](../modules/module-13.md)
- Nivel: Avanzado
- Tiempo estimado: 30 minutos
- Lenguajes: LD
- Rutas: Simulación
- Página de lectura: no
- Planta: [Tanque temporizado](../../plant/scenes/timed-tank.md)
- Requisitos previos: [timers-on-delay-off-delay](./timers-on-delay-off-delay.md)

## Objetivos

- Medir un paso de un proceso con un temporizador de retardo a la conexión (TON), con un temporizador para cada paso.
- Usar un temporizador como límite de seguridad en un paso que normalmente termina con un sensor, y dejar que la parada de emergencia aborte el ciclo.

## Etapas

1. **Objetivo**
2. **Predecir**
3. **Editar**
4. **Ejecutar**
5. **Observar**
6. **Reflexionar**

## Qué cubre la evidencia

La calificación es una ejecución sin interfaz del tanque simulado en el entorno de ejecución POSIX nativo. No establece el comportamiento de un tanque, una válvula o un sensor reales, la temporización en hardware, HIL ni la certificación.

## En una placa

El tanque, las válvulas y la parada de emergencia que leen y gobiernan los contactos y bobinas de este ciclo temporizado son simulados; una placa del estudiante no tiene un tanque que llenar, así que los tres bloques TON no medirían nada. Complétela en Simulación, donde el tanque, sus válvulas y la parada de emergencia forman parte del escenario.

{/* <<< END GENERATED: learn/lessons/plant-timed-tank-ladder <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
