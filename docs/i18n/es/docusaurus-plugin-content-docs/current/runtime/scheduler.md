# Scheduler Multitarea

El contrato público del scheduler está en `firmware/lib/zplc_core/include/zplc_scheduler.h`.

## Vista general

El scheduler existe para cargar, registrar y ejecutar tareas PLC con metadatos explícitos de intervalo y prioridad.

Estados públicos visibles hoy:

- tareas: `IDLE`, `READY`, `RUNNING`, `PAUSED`, `ERROR`
- scheduler: `UNINIT`, `IDLE`, `RUNNING`, `PAUSED`, `ERROR`

## APIs públicas principales

- `zplc_sched_init()` / `zplc_sched_shutdown()`
- `zplc_sched_register_task()`
- `zplc_sched_load()` para binarios `.zplc` multitarea
- `zplc_sched_start()` / `stop()` / `pause()` / `resume()` / `step()`
- `zplc_sched_get_state()` / `get_stats()` / `get_task()` / `get_task_count()`
- `zplc_sched_lock()` / `unlock()` para memoria compartida fuera del contexto de tarea

## Configuración de tareas

Las tareas se definen en `zplc.json` y se embeben en el binario `.zplc`.

Propiedades públicas importantes:

- `id`
- `type`
- `priority`
- `interval_us`
- `entry_point`
- `stack_size`

## Modelo de ejecución

El header documenta una implementación actual orientada a Zephyr:

1. timers disparan según el intervalo de la tarea
2. callbacks envían work items a work queues por prioridad
3. los threads de esas work queues ejecutan los ciclos PLC
4. la memoria compartida se protege con primitivas de sincronización

```mermaid
flowchart LR
  Timer[timer de intervalo] --> Queue[work item en cola]
  Queue --> Worker[thread de work queue]
  Worker --> Cycle[ciclo PLC de la tarea]
  Cycle --> Stats[actualización de estadísticas]
```

## Estadísticas e inspección

El contrato público expone estadísticas como:

- cycle count
- overrun count
- tiempos de ejecución last/max/avg
- cantidad de tareas activas
- uptime del scheduler

## Acceso a memoria compartida fuera de tareas

`zplc_sched_lock()` y `zplc_sched_unlock()` forman parte del contrato correcto para debug tools, servicios runtime y código nativo que necesite tocar memoria compartida fuera del contexto normal PLC.

## Guía release-facing

Esta página sí autoriza claims sobre:

- metadatos de tareas explícitos
- control pause/resume/step del scheduler
- estadísticas del scheduler
- locking explícito de memoria compartida
- modelo de ejecución orientado a work queues en Zephyr
