---
title: C Nativo en el Runtime
sidebar_label: Runtime nativo en C
description: Cómo integrar código C específico de Zephyr o de la placa sin romper el contrato del runtime ZPLC.
---

# C Nativo en el Runtime

ZPLC mantiene la lógica IEC del usuario como bytecode `.zplc` y la ejecuta a través de la VM y del scheduler. Si necesitás comportamiento específico de placa o de muy bajo nivel, ese código tiene que vivir en el **runtime**, no en el modelo editable del IDE.

Esta página se apoya en:

- `firmware/app/README.md`
- `firmware/lib/zplc_core/include/zplc_scheduler.h`
- `firmware/lib/zplc_core/include/zplc_hal.h`

## Qué entra en esta categoría

- threads o servicios nativos de Zephyr
- drivers o helpers específicos de placa
- integración con SDKs del fabricante
- código de soporte confiable que se distribuye junto con el firmware

## Qué NO es

No es lo mismo que una tarea IEC gestionada por el scheduler a partir de un `.zplc`.

`zplc_sched_register_task()` recibe:

- una definición `zplc_task_def_t`
- un puntero a bytecode
- el tamaño del bytecode

Y `zplc_sched_load()` también carga binarios `.zplc`. Eso significa que **la API pública del scheduler hoy es bytecode-oriented**, no una API pública de callbacks nativos en C.

## Camino soportado hoy

Si necesitás código nativo:

1. ponelo dentro de `firmware/app`
2. compilalo como parte del firmware
3. ejecutalo como thread, work item o servicio de Zephyr
4. interactuá con ZPLC mediante APIs públicas del runtime y la HAL

## Estructura recomendada

El README del runtime recomienda separar el código específico del proyecto:

```text
firmware/app/
├── include/
│   └── custom/
└── src/
    └── custom/
```

Así queda claro que:

- `main.c` sigue siendo el punto de entrada del runtime
- la infraestructura del runtime no se mezcla con hacks de placa
- el código nativo del proyecto tiene un lugar explícito

## Integración con el build

La integración correcta del código nativo pasa por el sistema de build de la aplicación runtime.

```cmake
target_sources(app PRIVATE
    src/main.c
    src/zplc_config.c
    src/zplc_modbus.c
    src/zplc_mqtt.c
    src/custom/custom_task.c
)
```

Si la capacidad es opcional, conviene gatearla con Kconfig en vez de compilarla siempre.

```cmake
if(CONFIG_ZPLC_CUSTOM_TASKS)
  target_sources(app PRIVATE src/custom/custom_task.c)
endif()
```

## Reglas de interacción segura

Cuando el código nativo interactúe con ZPLC:

- preferí `zplc_hal_*` para operaciones dependientes de plataforma
- no toques hardware directamente desde el core
- si accedés a memoria compartida fuera del contexto de tarea, usá `zplc_sched_lock()` y `zplc_sched_unlock()`
- mantené ejecución acotada y determinista
- evitá asignación dinámica si no es estrictamente necesaria

## Lo que no conviene hacer

- no supongas que el scheduler acepta callbacks nativos como tareas ZPLC de primera clase
- no metas código específico de placa adentro del core sin flags o límites claros
- no construyas un scheduler paralelo si la semántica temporal del runtime importa

## Regla práctica

Usá tareas IEC `.zplc` para:

- lógica de control
- comportamiento editable por el usuario
- depuración y despliegue desde el IDE

Usá C nativo del runtime para:

- drivers
- servicios de placa
- glue de protocolos de alto rendimiento
- soporte de firmware confiable que no pertenece al lenguaje IEC

## Páginas relacionadas

- [Visión General del Runtime](./index.md)
- [Scheduler](./scheduler.md)
- [Contrato HAL](./hal-contract.md)
- [Configuración del workspace Zephyr](../reference/zephyr-workspace-setup.md)
