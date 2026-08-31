---
sidebar_position: 2
slug: /runtime/scheduler
id: scheduler
title: Programador multitarea
sidebar_label: Programador
description: Configuración de tareas, ciclo de vida y diagnósticos del runtime ZPLC.
---

# Programador multitarea

ZPLC programa las tareas PLC configuradas mediante adaptadores específicos del runtime. La ruta actual de Zephyr admite liberaciones de timers en un único coordinador batch; la ruta POSIX permite flujos repetibles en host. Son contratos lógicos del runtime, no evidencia de timing ni de I/O físico en una placa.

## Modelo de tareas

Las tareas se declaran en el proyecto y se compilan dentro del programa `.zplc`.

| Propiedad | Significado actual |
|---|---|
| **Tipo** | El scheduler Zephyr actual admite tareas `CYCLIC`. Rechaza las tareas `EVENT` antes de cargarlas. |
| **Intervalo** | Intervalo cíclico solicitado en milisegundos, no una garantía de tiempo de ciclo medido. |
| **Prioridad** | Para liberaciones Zephyr con el mismo tiempo, primero ejecuta la prioridad numérica menor. El ID de tarea desempata. |
| **Punto de entrada** | Ubicación de programa o función dentro del programa compilado. |

## Ciclo de vida

El scheduler carga las declaraciones de tareas, prepara sus colas de runtime e informa transiciones como `READY`, `RUNNING`, `PAUSED` y `ERROR`. Un programa se admite y valida antes de poder ejecutarse. Los presupuestos lógicos de ejecución y los diagnósticos del runtime sirven para identificar fallos de scans acotados y overruns.

```mermaid
flowchart LR
  Program[Programa .zplc validado] --> Timers[Timers por tarea]
  Timers --> Admission[Admisión de liberaciones]
  Admission --> Batch[Único coordinador batch ordenado]
  Batch --> Snapshot[Un snapshot de entradas]
  Snapshot --> Tasks[Ejecución de tareas debidas]
  Tasks --> Commit[Como máximo un commit normal de salidas]
  Commit --> Stats[Diagnósticos]
```

## Estado compartido

En cada conjunto de tareas debidas de Zephyr, los callbacks de timer sólo admiten liberaciones; no ejecutan código PLC. El coordinador ordena las tareas admitidas por tiempo de liberación, prioridad e ID de tarea, y luego toma un snapshot de la imagen de entradas. Las tareas debidas se ejecutan en ese orden contra la memoria compartida del runtime. Si no ocurre un fault ni un cierre desde el plano de control, el batch realiza como máximo un commit normal de la imagen de salidas.

`STOP`, la pausa externa, el unregister y los faults del scheduler cierran la admisión y drenan el trabajo en curso del coordinador antes de retornar. `STOP` y los faults aplican salidas seguras/apagadas; la pausa no declara un nuevo estado seguro. Estas garantías describen la implementación del scheduler y sus pruebas host/native-sim. No demuestran WCET, jitter, estado eléctrico ni cualificación de una placa.

## Diagnósticos y evidencia

Los diagnósticos del runtime exponen conteos de ciclos, fallos de presupuesto lógico, conteos de latch/commit de process image y observaciones relacionadas con timing. Su resolución, método de recolección y significado dependen del runtime y perfil de destino. La evidencia native-sim sólo comprueba orden lógico y transiciones de estado. Medí WCET, jitter, deadlines y salidas físicas en el target/revisión exactos antes de depender de ellos operacionalmente.
