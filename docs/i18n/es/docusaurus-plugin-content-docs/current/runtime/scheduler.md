---
sidebar_position: 2
slug: /runtime/scheduler
id: scheduler
title: Programador multitarea
sidebar_label: Programador
description: Configuración de tareas, ciclo de vida y diagnósticos del runtime ZPLC.
---

# Programador multitarea

ZPLC programa las tareas PLC configuradas mediante adaptadores específicos del runtime alrededor de un núcleo de scheduler portable. La ruta actual de Zephyr admite liberaciones de timers en un único coordinador batch; la ruta POSIX ejecuta el mismo modelo de tareas para flujos repetibles en host; la configuración de firmware de una sola tarea ejecuta una tarea sobre el mismo núcleo. Son contratos lógicos del runtime, no evidencia de timing ni de I/O físico en una placa.

## Un solo núcleo de scheduler

Las decisiones del scheduler se toman en un solo lugar, `zplc_sched_core` (`firmware/lib/zplc_core/src/core/zplc_sched_core.c`), y los runtimes sólo aportan lo que depende de la plataforma (RT-008, RT-018):

| En el núcleo, igual en todas partes | En el adaptador |
|---|---|
| Qué tareas vencen y en qué orden: primero la liberación más temprana, luego la prioridad, luego el ID de tarea | El reloj, los timers y los hilos que llaman al núcleo |
| El control del plazo: un incumplimiento se advierte, se cuenta y se registra su exceso; una racha de `N` incumplimientos de una tarea latchea el fault | Los locks de la imagen de proceso y de la E/S de salida |
| El latch del fault y su causa; se conserva la primera causa y un fault de la VM gana a un incumplimiento en el mismo scan | Los pines y el watchdog de hardware |
| El latch de entradas, el commit de las salidas y el estado seguro de STOP, una pausa y un fault | El protocolo de depuración y el shell |

Lo usan tres adaptadores: la sesión POSIX del runtime de host (`native_runtime_session.c`), el scheduler Zephyr (`zplc_scheduler_zephyr.c`) y la configuración de una sola tarea (`zplc_single_task.c`, véase [Configuración de una sola tarea](#configuración-de-una-sola-tarea)). Un escenario es una lista de tareas y de los instantes en que un batch vence, empieza y termina; su salida es la lista de decisiones que tomó el núcleo, una línea por cada una. El test de host `test_sched_equivalence` y la suite Zephyr `scheduler_equivalence` ejecutan los mismos escenarios y comparan las decisiones con una sola traza de referencia, de modo que un cambio de la regla en un runtime hace fallar al otro. Los escenarios son un programa de tres tareas (tareas de 100 y 200 ms, `N` de 3, con latch en el cuarto batch) y un programa de una tarea. La comparación es de decisiones, no de tiempo: el host cuenta milisegundos enteros y el target lee un contador de ciclos en microsegundos.

### Configuración de una sola tarea

Un firmware compilado con `CONFIG_ZPLC_SCHEDULER=n` ejecuta una tarea de un intervalo. Es la configuración de una tarea del núcleo, no otro bucle: su scan tiene el mismo latch de entradas, control de plazo y límite (`CONFIG_ZPLC_DEADLINE_MISS_LIMIT`), latch de fault y estado seguro que el scheduler multitarea, y su estado informa los mismos campos. Dos cosas difieren y no se ocultan: el bucle mantiene el lock del runtime durante todo el scan, de modo que un comando del shell espera a que el scan termine, y no tiene intercambio por snapshot, de modo que un hilo fuera del scan lee y escribe la imagen de proceso bajo ese lock en lugar de hacerlo por la cola.

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

### Los locks alrededor de un scan (RT-010, RT-012)

En el destino un batch son tres pasos. Las entradas se leen de la HAL sin ningún lock. Después, bajo el lock de la
imagen de proceso, se aplican las escrituras que otros hilos dejaron en cola, las muestras se escriben en IPI, las
tareas corren y la imagen se publica como snapshot. Por último, con el lock de la imagen liberado y bajo un lock
aparte para la E/S de salida, se escriben las salidas físicas y se alimenta el watchdog de hardware. El lock de la
imagen nunca se mantiene mientras se escribe un pin, se imprime una línea o corre una llamada que pueda bloquear:
las líneas de registro de un scan se imprimen después de liberar el lock.

Un hilo ajeno al scan lee el snapshot del último commit y deja sus escrituras en cola para el siguiente latch de
entradas (ver [Acceso desde fuera del scan](memory-model.md#acceso-desde-fuera-del-scan-rt-010-rt-011)). Una parada,
una pausa o una falla que llega entre el commit de la imagen y la escritura de los pines toma el lock de salida
después o antes de ella, y los pines terminan en el estado que decidió la última de las dos.

Un lock que no se puede crear o tomar es un error que ve quien llama (RT-030). Una llamada de control devuelve
`ZPLC_SCHED_ERR_LOCK` y no cambia nada. Un scan que no puede tomar el lock de la imagen lleva los pines a su estado
seguro y bloquea la falla, de modo que el estado es `ERROR`; un programa de reemplazo es la salida, como con
cualquier falla.

### Prioridades y orden de arranque (RT-013, RT-024)

El coordinador del scan, la cola de trabajo de alta prioridad o la normal cuando no hay otra, tiene un número de
prioridad menor que todos los hilos de comunicación de la aplicación, que corren en
`CONFIG_ZPLC_COMM_THREAD_PRIORITY` (8 por defecto), y que los hilos del shell y del registro. La compilación lo
comprueba y falla si no se cumple. Las placas con pila de red fijan `CONFIG_NET_TC_THREAD_PREEMPTIVE=y`, porque los
hilos de red de Zephyr son cooperativos por defecto y superarían en prioridad al scan.

El firmware arranca el runtime antes que cualquier servicio. Primero van la capa de hardware, el core, el scheduler
con el program store y la restauración del programa almacenado, y el shell, que es el enlace de control, lo inicia
Zephyr antes de `main()`. La red, el servicio de hora, los servidores de bus de campo y el aprovisionamiento MQTT o
de nube arrancan después, y cada uno puede fallar: un servicio que no levanta se registra y se cuenta, y el runtime
que ya está en marcha sigue funcionando. El registro de arranque nombra cada paso en el orden en que corrió.

## Plazos

Un scan incumple su plazo cuando su tarea termina más de un intervalo después de la liberación del batch en que corrió: la tarea se liberó otra vez antes de terminar, o las tareas que la preceden en el batch consumieron su intervalo. Un incumplimiento tiene estos efectos, en este orden:

1. Se levanta la bandera de **advertencia**.
2. El incumplimiento se **cuenta**, para la tarea y en total.
3. Se registra el **exceso**, cuánto después del plazo terminó la tarea.
4. Cuando la misma tarea incumple `N` veces seguidas, el fault se **latchea**: las salidas pasan a su estado seguro, la sesión queda en `error` y el estado informa la causa y la tarea. Un reset o un programa nuevo lo borra.

Un scan que termina a tiempo corta la racha de esa tarea y borra su parte de la advertencia. La cuenta se conserva hasta cargar un programa o hacer reset. Un paso del depurador y un scan detenido en un breakpoint no se comprueban.

`N`, los incumplimientos consecutivos que latchean el fault, es configurable y vale **3** por defecto en todos los runtimes: una activación tardía, que puede causar una ráfaga de comunicación o una escritura en flash, se advierte y se cuenta, y una tarea que sigue incumpliendo detiene el programa. El valor 3 es un valor por defecto de diseño (RT-D05b) que el responsable del proyecto no confirmó; 1 es el comportamiento de versiones anteriores. En simulación `N` es la variable de entorno `ZPLC_DEADLINE_MISS_LIMIT`, un entero de 1 a 1 000 000, leída al iniciar la sesión; un valor fuera de ese rango se ignora y se escribe un mensaje en la salida de error estándar. En un target es `CONFIG_ZPLC_DEADLINE_MISS_LIMIT`, en el mismo rango, fijo al compilar el firmware.

La simulación informa un incumplimiento en el resultado de `status.get` y en cada evento `status.changed`; un fault latcheado se envía además como evento `runtime.error` con el código `DEADLINE_MISS`. Un target informa los mismos campos en `zplc sched status --json`, como los objetos `deadline` y `fault` (allí el exceso en microsegundos es exacto). Los campos que ya existían conservan su significado.

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
| Posición de la siguiente liberación | Las tareas de intervalos distintos mantienen una grilla fija desde el arranque común: un despacho tardío no desplaza la siguiente liberación, y las tareas que coinciden se liberan juntas, como en el target. Las tareas de un mismo intervalo se liberan un intervalo después del despacho anterior, como en versiones anteriores, así que un despacho tardío desplaza las liberaciones que le siguen. | Un timer periódico sobre una grilla fija: un batch tardío no desplaza la siguiente liberación. |
| Primera liberación | El primer scan después de un arranque o una reanudación es una liberación de todas las tareas: el calendario empieza en el arranque mismo. | La primera liberación de cada tarea llega un intervalo después del arranque o de la reanudación. |
| Dos tareas del mismo tick | Se liberan en el mismo instante, así que se ordenan por prioridad y luego por ID de tarea. | La comparación es la misma, pero la liberación se marca en cada callback de timer con el contador de ciclos. No se afirma aquí qué orden obtienen dos timers de un mismo tick en una placa. |
| Velocidad y jitter | La VM corre en un procesador de host bajo un sistema operativo de propósito general. | La VM corre en el procesador de la placa. Un programa que cumple a tiempo en simulación puede incumplir en un target, y a la inversa. |
| Informe de un incumplimiento | La bandera de advertencia, la cuenta, el último exceso, el límite configurable y la causa del fault de la tabla anterior. | Los mismos campos, del mismo núcleo (`deadline` y `fault` de `zplc sched status --json`), con la cuenta de cada tarea, el total y el estado `error` una vez latcheado. El límite es `CONFIG_ZPLC_DEADLINE_MISS_LIMIT`. |

El runtime WebAssembly de Studio ejecuta el mismo núcleo del scheduler y la misma sesión que la simulación nativa, y una prueba compara sus decisiones con la traza compartida del núcleo (admisión, orden, latch de entradas, incumplimientos de plazo, latch de falla y commit, para tres tareas y para una). Su reloj es el de la página, en milisegundos enteros, así que las filas anteriores que nombran el reloj del host valen para el reloj del navegador, y una pestaña en segundo plano puede ir con retraso. Ver [Runtime del navegador](./browser-runtime.md).

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

- Seguro significa apagado para una salida, salvo que el proyecto declare otro valor para ella ([Estado seguro de una salida](#estado-seguro-de-una-salida)). Los pines se llevan a ese estado por política, nunca desde la imagen, de modo que un bit en uno de la imagen pausada no lo energiza.
- El primer commit normal después de una reanudación copia a los pines la imagen de salidas, con la tabla de forzados aplicada. Una reanudación no energiza nada por sí sola. Una salida forzada en uno permanece apagada mientras dura la pausa y se enciende en ese commit.
- Un scan que continúa después de una reanudación o un paso conserva lo que vio su primera parte: las instrucciones ya ejecutadas, la pila de evaluación, la bandera de primer scan y su propio ID de tarea. Las entradas se vuelven a latchear al inicio del batch que lo continúa, de modo que el resto lee las entradas de ese momento.
- El batch que se detiene en un breakpoint, y un paso, hacen un commit de la imagen a los pines y luego los llevan al estado seguro. El tiempo entre las dos escrituras es del driver y no se mide aquí.
- La evidencia de este comportamiento son las suites Zephyr en `native_sim` y QEMU (`scheduler_run_control`, `scheduler_admission`). El nivel físico se observa con el emulador GPIO de `native_sim`; no se midió ninguna placa.

## Estado seguro de una salida

Una salida está **apagada** siempre que el programa no la controla: en STOP, en pausa o en un breakpoint, en un fault latcheado, desde el arranque hasta el primer scan y mientras un deploy está en curso. El nivel se decide en una sola función, `zplc_io_drive_safe`, y en ningún otro lugar (RT-023):

1. El valor que **declara el programa cargado** para esa salida, cuando declara uno.
2. Si no, **apagado**, salvo que la descripción de la placa (`firmware/app/boards/boards.json`) dé a ese canal otro nivel seguro, como puede hacerlo un relé activo en bajo.

Un proyecto declara el valor en `zplc.json`, en una fila de `io.outputs`:

```json
{
  "io": {
    "outputs": [
      { "name": "Brake", "address": "%QX0.0", "type": "BOOL", "safe": true },
      { "name": "Valve", "address": "%QX0.1", "type": "BOOL" }
    ]
  }
}
```

Aquí `Brake` está energizada siempre que el programa no la maneja, y `Valve` está apagada. La declaración viaja **dentro del artefacto**, en su segmento `SAFE`, de modo que un programa y su estado seguro son una sola unidad: un dispositivo que restaura el programa restaura su declaración, un programa reemplazado la reemplaza, y un deploy interrumpido no puede dejar el programa de una compilación con los valores seguros de otra (véase [Valores seguros declarados](isa.md#valores-seguros-declarados)).

La confirmación de un deploy a una placa muestra lo que lleva el artefacto: cada salida declarada por su dirección con el valor que toma, o la frase de que toda salida está apagada, de modo que una persona ve el estado seguro antes de que se escriba el programa.

Qué se verifica, y dónde:

| Dónde | Qué se rechaza |
|---|---|
| La compilación (Studio, la línea de comandos, MCP) | Un `safe` que no es `true` ni `false`; uno en una fila que no es un bit de salida digital (`%QW0`, `%QB0`); uno en una entrada o en una fila `virtual`; dos filas para una salida; una salida para la que la placa elegida no tiene un canal digital. El mensaje nombra la salida, la dirección y la placa, y no hay artefacto que desplegar. |
| El loader | Un segmento que no son entradas completas, una entrada fuera de la imagen de salidas, un valor distinto de 0 o 1, una salida dos veces, o más de 64 entradas. |
| El firmware, en el deploy y en la restauración de arranque | Una declaración para una salida que no es un canal de salida digital de la tabla de E/S de la placa (un proyecto de otra placa). El programa no se guarda ni se ejecuta. |

Los valores declarados rigen desde la carga que confirma el programa, antes del primer scan, y la carga los lleva a los pines: un programa restaurado espera en STOP con sus salidas declaradas encendidas. Reemplazarlo por un programa que no declara nada devuelve los pines al nivel de la placa en esa carga. La imagen de proceso de salidas es el estado lógico del programa y se pone en cero en STOP, sea cual sea el valor que muestre el pin.

Lo que esto no afirma: el tiempo entre el encendido y el instante en que el firmware maneja los pines es el estado de reset del componente, y una placa que necesita un pin en uno ahí necesita hardware que lo haga (véase [Placas](../reference/boards.md)); la confirmación de deploy que muestra a una persona los valores declarados antes de escribirlos en un dispositivo es una pantalla de Studio y no forma parte de esta página.

## Runtime a prueba de fallas: faults, causa de reset y watchdog

Son los requisitos RT-019 a RT-022. Las decisiones que no dependen de una plataforma están en `zplc_failsafe` y se prueban en el host; lo que hace la plataforma (el registro de causa de reset, un registro en una RAM que un reset no borra, el reinicio, el watchdog) es `zplc_failsafe_zephyr.c`.

### Un fault del procesador (RT-019)

Un fault del procesador, un desbordamiento de stack, una aserción o un kernel panic no deja las salidas donde las dejó el último scan. El manejador de error fatal del firmware (`CONFIG_ZPLC_FATAL_HANDLER`, activado por defecto) no toma ningún lock ni reserva memoria: lleva cada salida digital a su nivel seguro, guarda la causa en un registro de 24 bytes en una RAM que un reset no borra (un magic, una versión, el tipo, la causa del kernel, la tarea, el contador de programa, un número de secuencia y un CRC-32) y reinicia. El arranque siguiente encuentra el registro, lo informa y lo consume, de modo que el reset que sigue no se llama fault. Un registro que no está completo o no es nuestro no es nada.

### Por qué se reinició el runtime (RT-021)

`zplc sys reset` (y `--json`) informa la causa del último reset: `power_on`, `brown_out`, `pin`, `software`, `watchdog`, `fault` o `unknown` (un componente que no informa ninguna), el registro crudo, el registro de fault de la ejecución anterior y la política de arranque. Cuando un procesador informa varios bits el orden es fijo: un registro de fault de la ejecución anterior, luego encendido, brown-out, watchdog, lock-up, software y, al final, el pin, porque casi todo reset lo activa. `zplc sys info --json` conserva exactamente sus claves; la causa es también la clave `reset_cause` de `zplc sched status --json`.

### Tras un reset el runtime espera en STOP (RT-022)

Sea cual sea la causa, el programa guardado se restaura en STOP con las salidas en sus valores seguros, y **RUN es un comando de una persona**. El runtime nunca entra en RUN por sí solo a causa de un reset (la función `zplc_reset_may_run` vale 0 para toda causa; volver a ejecutar tras un encendido limpio de un dispositivo que una persona habilitó antes es una decisión del responsable del proyecto, D-13, y no se toma aquí). Las variables retentivas se restauran sólo cuando `CONFIG_ZPLC_RETAIN_PERSIST` está activado, y por defecto no lo está. Un deploy detiene el programa en ejecución antes de transferir un solo byte, de modo que una transferencia nunca corre junto a un programa que estaba en RUN.

### El watchdog de hardware (RT-020)

El perfil de cada placa (`watchdog` en `boards.json`) dice si su watchdog de hardware está habilitado, el timeout con el que se registró su tiempo de reset, el timeout más largo que acepta el componente y qué hace el watchdog en STOP, en pausa y en un fault latcheado. **Ninguna placa lo tiene habilitado**: las opciones están desactivadas hasta que una placa y revisión exactas tengan un registro de hardware del tiempo de reset y de los pines mientras se reinicia (HIL-010). Cuando está habilitado:

- Se alimenta desde la finalización de un scan, nunca desde un timer, una interrupción, el shell o el hilo ocioso. Un scan que se detiene corta la alimentación y el watchdog reinicia la placa.
- Su timeout es el del perfil, alargado cuando el conjunto de tareas lo necesita: más de dos intervalos de la tarea más lenta, hasta el máximo que acepta el componente. Un conjunto de tareas que no cabe se rechaza al iniciarlo.
- La política por defecto es **desarmado en STOP**, **alimentado desde la ruta de control en pausa** (para que un breakpoint largo no reinicie la placa) y **dejado expirar en un fault latcheado**: la placa se reinicia en STOP con la causa registrada, y el registro del fault sobrevive al reset. Un componente cuyo watchdog no se puede detener se perfila para alimentarse en STOP.

### Evidencia y lo que no se muestra

Las decisiones se prueban en el host (`test_failsafe`, `test_sched_core`) y los comportamientos en el emulador Zephyr y QEMU: `failsafe` (el manejador, el registro, el reinicio interceptado), `failsafe_reboot` (un fault real de instrucción indefinida y un reinicio real en `qemu_cortex_m3`: el registro sobrevive al reset con el motivo del kernel dentro, y la causa es `fault`), `scheduler_watchdog` (la alimentación, el timeout, la política y una expiración modelada), `program_boot_restore` y `scheduler_admission`. No se muestra, y queda registrado como pendiente de un registro de hardware: el tiempo que tarda un componente real en reiniciarse, el nivel de un pin mientras se reinicia, que la RAM de un componente dado sobreviva a su reset por watchdog y el watchdog de cualquier placa. Nada de esto es una calificación de placa.

## Diagnósticos y evidencia

Los diagnósticos del runtime exponen conteos de ciclos, incumplimientos de plazo, fallos de presupuesto lógico, conteos de latch/commit de process image y observaciones relacionadas con timing. Su resolución, método de recolección y significado dependen del runtime y perfil de destino. La evidencia native-sim sólo comprueba orden lógico y transiciones de estado. Medí WCET, jitter, deadlines y salidas físicas en el target/revisión exactos antes de depender de ellos operacionalmente.
