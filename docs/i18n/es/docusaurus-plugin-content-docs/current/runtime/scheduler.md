---
sidebar_position: 2
slug: /runtime/scheduler
id: scheduler
title: Programador Multitarea (Scheduler)
sidebar_label: Programador
description: Ejecución de tareas, mecánicas de prioridad e integración con Zephyr dentro del Runtime ZPLC.
---

# Programador Multitarea (Scheduler)

ZPLC ejecuta la lógica de automatización IEC 61131-3 usando un programador (scheduler) multitarea orientado por prioridades y en tiempo real.

## Resumen del Modelo de Ejecución

El scheduler coordina múltiples tareas definidas por el usuario mapeadas dentro del binario `.zplc`. Su ciclo de vida incluye:
1. Cargar las declaraciones de tareas desde la cabecera del binario.
2. Asignar las secuencias de ejecución según rangos de preferencia y límite temporal.
3. Administrar transiciones de estado (`READY`, `RUNNING`, `PAUSED`, `ERROR`).
4. Triaje sobre validaciones concurrentes o cierres de ejecución obligados por software en bucles infinitos.

## Configuración de Tareas

Las tareas dictan cómo y cuándo se ejecutan los programas. Las tareas se configuran en `zplc.json` y se compilan directamente al bytecode.

| Propiedad | Descripción |
|---|---|
| **Tipo (Type)** | `CYCLIC` (impulsado por intervalos de tiempo) o `EVENT` (impulsado por disparador de hardware). |
| **Intervalo (Interval)** | Tiempo de ciclo determinista en milisegundos (ms). |
| **Prioridad (Priority)** | Rango desde 0 (Prioridad Máxima) a 255 (Ejecución en segundo plano). |
| **Punto de Entrada** | Función o ubicación del programa principal. |

## Integración con Zephyr y Determinismo

Al desplegarse en Zephyr RTOS, ZPLC traduce directamente su ejecución lógica interna a paradigmas nativos de Zephyr:
- Los temporizadores de hardware basados en el tiempo disparan secuencias de tareas de forma exacta.
- Estos disparadores inyectan las tareas cíclicas en las colas de trabajo orientadas a la prioridad de Zephyr.
- La ejecución ocurre concurrentemente a través de las colas para evitar solapamientos y minimizar problemas de latencia o 'jitter' de hardware.

```mermaid
flowchart LR
  Timer[Disparador de Ciclo] --> Queue[Cola Preferencial Zephyr]
  Queue --> Thread[Proceso de Trabajo]
  Thread --> Cycle[Ejecución de un solo Scan]
  Cycle --> Stats[Actualización Estadística]
```

## Concurrencia y Seguridad de Recursos

Las tareas de ZPLC comparten memoria física global. Debido al comportamiento estándar de IEC 61131-3, se aplica una estricta regla de concurrencia donde **la última escritura gana** cuando dos tareas distintas intentan manipular las mismas variables o salidas.
Para evitar choques durante rutinas complejas se aconseja segmentar responsabilidades a lo largo de tareas en intervalos dispares.

## Diagnósticos

El ZPLC IDE lee estadísticas de ejecución en tiempo real desde este subsistema, brindando un marco preciso respecto al peso algorítmico, detallando:
- Número de ciclos superados.
- Detecciones de errores en intervalos saturados por cómputo intenso.
- Latencia en el ciclo máximo promedio según tiempo acumulado.
