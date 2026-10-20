---
title: "Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión"
sidebar_label: "timers-on-delay-off-delay"
description: "La lección timers-on-delay-off-delay: nivel, tiempo, lenguajes y objetivos, generados de su paquete."
tags: [learn, generated]
unlisted: true
---

# Temporizadores: una luz con retardo a la desconexión y un filtro con retardo a la conexión

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/lessons/timers-on-delay-off-delay. Do not edit. >>> */}

Use un temporizador TOF para mantener una luz encendida después de soltar un botón, y un TON para ignorar un pulso de sensor demasiado corto.

## Datos

- Módulo: [3](../modules/module-3.md)
- Nivel: Fundamentos
- Tiempo estimado: 15 minutos
- Lenguajes: ST
- Rutas: Simulación
- Planta: ninguna
- Requisitos previos: [motor-start-stop-safe](./motor-start-stop-safe.md)

## Objetivos

- Mantenga una salida encendida durante un tiempo fijo después de que su entrada caiga, con TOF.
- Ignore una entrada que permanezca en ON menos de un tiempo fijo, con TON.

## Etapas

1. **Objetivo**
2. **Prediga**
3. **Edite**
4. **Ejecute**
5. **Observe**
6. **Reflexione**

## Qué cubre la evidencia

Las pruebas aportan evidencia del host con el runtime nativo POSIX y una tarea de 10 ms; no demuestran el antirrebote eléctrico, la respuesta del sensor, los tiempos en el dispositivo de destino, HIL ni certificación.

## En una placa

La lección mide retardos a la conexión y a la desconexión contra el reloj de ciclo; el tiempo en una placa real no es lo bastante reproducible para una comprobación determinista y todavía no existe una traza registrada. Complétela en Simulación, donde el tiempo es determinista.

{/* <<< END GENERATED: learn/lessons/timers-on-delay-off-delay <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
