---
sidebar_position: 2
slug: /runtime/scheduler
id: scheduler
title: Programador multitarea
sidebar_label: Programador
description: Configuración de tareas, ciclo de vida y diagnósticos del runtime ZPLC.
---

# Programador multitarea

ZPLC programa las tareas PLC configuradas mediante adaptadores específicos del runtime. La ruta actual de Zephyr admite liberaciones de timers en un único coordinador batch; la ruta POSIX ejecuta el mismo modelo de tareas para flujos repetibles en host. Son contratos lógicos del runtime, no evidencia de timing ni de I/O físico en una placa.

## Modelo de tareas

Las tareas se declaran en `zplc.json` y se compilan dentro del programa `.zplc`. Esta versión tiene un solo tipo de tarea, la tarea cíclica. El modelo siguiente es el mismo en simulación y en un target; las diferencias que quedan se listan en [Qué no es idéntico en simulación](#qué-no-es-idéntico-en-simulación).

| Propiedad | Significado |
|---|---|
| **Tipo** | Sólo cíclica. `trigger: "cyclic"` es una tarea cíclica. `trigger: "freewheeling"` se compila como una tarea cíclica del intervalo que declara y no corre más rápido que ese intervalo. Las tareas disparadas por evento o por interrupción no existen en esta versión: la compilación falla en la definición de la tarea, con el nombre de la tarea, su campo `trigger` en `zplc.json` y los disparadores admitidos, y ambos runtimes rechazan un artefacto que contenga una tarea de evento. |
| **Intervalo** | Milisegundos enteros, de 1 a 3 600 000. Cada tarea tiene su propio intervalo, y tareas de intervalos distintos corren en un mismo programa (como máximo 16 tareas). El intervalo es el período de la liberación y el plazo del scan, no una garantía de tiempo de ciclo medido. |
| **Prioridad** | El número menor corre primero. La prioridad sólo ordena tareas que se liberan juntas. No interrumpe una tarea en ejecución ni le da más tiempo. |
| **Punto de entrada** | Ubicación de programa o función dentro del programa compilado. |

Reglas:

1. **Liberación.** Las tareas de un programa arrancan juntas: un arranque o una reanudación inicia el calendario de todas las tareas en el mismo instante. Después, una tarea se libera una vez por intervalo. Una liberación que llega mientras la tarea sigue ejecutándose no se encola, y un host que despacha tarde ejecuta la tarea una vez, no una vez por cada liberación perdida.
2. **Orden.** Las tareas liberadas juntas forman un batch. Un batch ejecuta sus tareas por liberación más temprana primero, luego por prioridad (el número menor primero) y luego por ID de tarea (el menor primero).
3. **Sin apropiación.** Las tareas de un batch corren una tras otra, cada una hasta el final de su scan. Nada suspende una tarea por otra tarea ni por una liberación. Un breakpoint es lo único que detiene un scan antes de su final; véase [Pausa, reanudación, paso y parada](#pausa-reanudación-paso-y-parada).
4. **Un latch y un commit por batch.** Un batch toma la imagen de entradas una vez, antes de su primera tarea, y todas las tareas del batch leen esa imagen. La imagen de salidas se confirma una vez, después de su última tarea. Una tarea que no se libera en un batch no se ejecuta, y la imagen de proceso conserva lo que escribió.
5. **Plazo.** El plazo de un scan es el intervalo de su tarea contado desde la liberación de su batch. Una tarea que termina después incumple su plazo; véase [Plazos](#plazos).

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

En simulación un solo hilo atiende las peticiones de control y ejecuta los batches, uno tras otro. Por eso la imagen de entradas no puede cambiar mientras corre un batch, que es el latch único de la regla 4, y la imagen de salidas es la propia imagen de proceso.

`STOP`, la pausa externa, el unregister y los faults del scheduler cierran la admisión y drenan el trabajo en curso del coordinador antes de retornar. Estas garantías describen la implementación del scheduler y sus pruebas host/native-sim. No demuestran WCET, jitter, estado eléctrico ni cualificación de una placa.

## Plazos

Un scan incumple su plazo cuando su tarea termina más de un intervalo después de la liberación del batch en que corrió: la tarea se liberó otra vez antes de terminar, o las tareas que la preceden en el batch consumieron su intervalo. Un incumplimiento tiene estos efectos, en este orden:

1. Se levanta la bandera de **advertencia**.
2. El incumplimiento se **cuenta**, para la tarea y en total.
3. Se registra el **exceso**, cuánto después del plazo terminó la tarea.
4. Cuando la misma tarea incumple `N` veces seguidas, el fault se **latchea**: las salidas pasan a su estado seguro, la sesión queda en `error` y el estado informa la causa y la tarea. Un reset o un programa nuevo lo borra.

Un scan que termina a tiempo corta la racha de esa tarea y borra su parte de la advertencia. La cuenta se conserva hasta cargar un programa o hacer reset. Un paso del depurador y un scan detenido en un breakpoint no se comprueban.

`N`, los incumplimientos consecutivos que latchean el fault, es configurable. En simulación es la variable de entorno `ZPLC_DEADLINE_MISS_LIMIT`, un entero de 1 a 1 000 000, leída al iniciar la sesión; un valor fuera de ese rango se ignora y se escribe un mensaje en la salida de error estándar. El valor por defecto es 1: el primer incumplimiento latchea el fault, que es lo que hace hoy el scheduler del target.

La simulación informa un incumplimiento en el resultado de `status.get` y en cada evento `status.changed`; un fault latcheado se envía además como evento `runtime.error` con el código `DEADLINE_MISS`. Los campos que ya existían conservan su significado.

| Campo | Significado |
|---|---|
| `stats.overruns` | Incumplimientos de plazo de todas las tareas desde que se cargó o se reinició el programa. |
| `tasks[].overruns` | Incumplimientos de esa tarea. |
| `deadline.warning` | `true` mientras alguna tarea tenga una racha de incumplimientos que ningún scan a tiempo haya cortado. |
| `deadline.misses` | La misma cuenta que `stats.overruns`. |
| `deadline.consecutive_misses` | La racha de incumplimientos más larga que sigue en curso. |
| `deadline.miss_limit` | `N`. |
| `deadline.last_overrun_us` | Cuánto después de su plazo terminó la última tarea tardía, en microsegundos. El reloj del host cuenta milisegundos, de modo que el valor es múltiplo de 1000. |
| `fault.reason` | `none`, `deadline_miss`, `vm_fault` o `runtime_failure`. |
| `fault.task_id` | La tarea que latcheó el fault, o `null` si no hay ninguno. |

El objeto `host_cadence` es aparte. Informa cuánto tardó el host en despachar un batch después de que sus tareas vencieran, y las liberaciones que saltó. Ese retraso no es un incumplimiento de plazo en simulación.

## Qué no es idéntico en simulación

Las cinco reglas anteriores son las mismas en simulación y en un target. Lo siguiente no lo es, y no existe medición de ninguno de estos puntos:

| Tema | Simulación | Target (scheduler Zephyr actual) |
|---|---|---|
| Fuente de tiempo | El reloj monotónico del host en milisegundos enteros. Un plazo y un exceso son múltiplos de 1 ms. | El contador de ciclos, leído en microsegundos. |
| Instante de una liberación | El instante en que el host despacha el batch. La espera entre el instante en que la tarea venció y el despacho se informa en `host_cadence` y no es un incumplimiento. | El timer marca la liberación cuando expira, de modo que un coordinador que inicia el batch tarde gasta el plazo de las tareas que contiene. |
| Posición de la siguiente liberación | Un intervalo después del despacho: un despacho tardío desplaza las liberaciones que le siguen. | Un timer periódico sobre una grilla fija: un batch tardío no desplaza la siguiente liberación. |
| Primera liberación | El primer scan después de un arranque o una reanudación es una liberación de todas las tareas: el calendario empieza en el arranque mismo. | La primera liberación de cada tarea llega un intervalo después del arranque o de la reanudación. |
| Dos tareas del mismo tick | Se liberan en el mismo instante, así que se ordenan por prioridad y luego por ID de tarea. | La comparación es la misma, pero la liberación se marca en cada callback de timer con el contador de ciclos. No se afirma aquí qué orden obtienen dos timers de un mismo tick en una placa. |
| Velocidad y jitter | La VM corre en un procesador de host bajo un sistema operativo de propósito general. | La VM corre en el procesador de la placa. Un programa que cumple a tiempo en simulación puede incumplir en un target, y a la inversa. |
| Informe de un incumplimiento | La bandera de advertencia, la cuenta, el último exceso, el límite configurable y la causa del fault de la tabla anterior. | La cuenta de cada tarea y el total, y el estado `error` una vez latcheado. El límite es fijo, de un incumplimiento. La bandera de advertencia, el último exceso y la causa no se informan; pasan al target con el núcleo común del scheduler (RT-008, RT-014). |

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

Los diagnósticos del runtime exponen conteos de ciclos, incumplimientos de plazo, fallos de presupuesto lógico, conteos de latch/commit de process image y observaciones relacionadas con timing. Su resolución, método de recolección y significado dependen del runtime y perfil de destino. La evidencia native-sim sólo comprueba orden lógico y transiciones de estado. Medí WCET, jitter, deadlines y salidas físicas en el target/revisión exactos antes de depender de ellos operacionalmente.
