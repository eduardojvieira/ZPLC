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

`STOP`, la pausa externa, el unregister y los faults del scheduler cierran la admisión y drenan el trabajo en curso del coordinador antes de retornar. Estas garantías describen la implementación del scheduler y sus pruebas host/native-sim. No demuestran WCET, jitter, estado eléctrico ni cualificación de una placa.

## Pausa, reanudación, paso y parada

El runtime separa dos cosas: las **salidas físicas** (los pines) y el **estado lógico del programa** (la imagen de proceso de salidas, la tabla de forzados y el contador de programa y las pilas de cada tarea). Una pausa deja seguras las primeras y conserva el segundo, de modo que una reanudación o un paso continúan el programa donde se detuvo (requisito RT-017). `STOP` termina la ejecución y descarta ambos.

| Operación | Salidas físicas | Imagen de salidas | Tabla de forzados | Scans de las tareas |
|---|---|---|---|---|
| Pausa (`zplc dbg pause`) | Seguras (apagadas) antes de que retorne la llamada | Se conserva | Se conserva | Pausa entre scans: el batch en curso termina primero |
| Breakpoint | Seguras (apagadas); el batch hace un commit y luego los pines se llevan al estado seguro | Se conserva, con el scan parcial | Se conserva | El scan se detiene en el breakpoint con su contador de programa y sus pilas |
| Paso (`zplc dbg step`) | El scan se confirma y luego los pines se llevan al estado seguro | Se conserva, muestra el scan ejecutado | Se conserva | Termina el scan detenido en un breakpoint, o ejecuta un scan completo; se detiene en el siguiente límite de ciclo o en el siguiente breakpoint |
| Reanudación (`zplc dbg resume`) | No las energiza la reanudación misma | Se conserva | Se conserva | Un scan detenido en un breakpoint continúa desde ahí en la siguiente liberación; una pausa entre scans empieza un scan nuevo |
| `STOP` | Seguras (apagadas) | Se pone a cero | Se borra | Cada tarea vuelve a su punto de entrada; se descarta el scan interrumpido por un breakpoint o armado por una reanudación |
| Fault | Seguras (apagadas) | Se pone a cero | Se borra | Queda latcheado; la tarea con fault conserva su contador de programa y su error hasta cargar un programa |

Notas sobre la tabla:

- Seguro significa apagado en todos los canales de salida hoy. Los pines se llevan a ese estado por política, nunca desde la imagen, de modo que un bit en uno de la imagen pausada no lo energiza. Un valor seguro declarado por proyecto para cada salida es otro requisito (RT-023).
- El primer commit normal después de una reanudación copia a los pines la imagen de salidas, con la tabla de forzados aplicada. Una reanudación no energiza nada por sí sola. Una salida forzada en uno permanece apagada mientras dura la pausa y se enciende en ese commit.
- Un scan que continúa después de una reanudación o un paso conserva lo que vio su primera parte: las instrucciones ya ejecutadas, la pila de evaluación, la bandera de primer scan y su propio ID de tarea. Las entradas se vuelven a latchear al inicio del batch que lo continúa, de modo que el resto lee las entradas de ese momento.
- El batch que se detiene en un breakpoint, y un paso, hacen un commit de la imagen a los pines y luego los llevan al estado seguro. El tiempo entre las dos escrituras es del driver y no se mide aquí.
- La evidencia de este comportamiento son las suites Zephyr en `native_sim` y QEMU (`scheduler_run_control`, `scheduler_admission`). El nivel físico se observa con el emulador GPIO de `native_sim`; no se midió ninguna placa.

## Diagnósticos y evidencia

Los diagnósticos del runtime exponen conteos de ciclos, fallos de presupuesto lógico, conteos de latch/commit de process image y observaciones relacionadas con timing. Su resolución, método de recolección y significado dependen del runtime y perfil de destino. La evidencia native-sim sólo comprueba orden lógico y transiciones de estado. Medí WCET, jitter, deadlines y salidas físicas en el target/revisión exactos antes de depender de ellos operacionalmente.
