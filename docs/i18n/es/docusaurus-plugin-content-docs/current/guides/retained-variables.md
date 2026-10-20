---
slug: /guides/retained-variables
id: retained-variables
title: Conservar valores entre reinicios
sidebar_label: Variables retentivas
description: "Declare variables que conservan su valor cuando el programa se detiene o el runtime se reinicia, y vea qué se guarda, cuándo y qué lo descarta."
tags: [how-to, retain, persistence]
---

# Conservar valores entre reinicios

Una variable retentiva conserva su valor cuando el programa se detiene y cuando el
runtime se inicia de nuevo con el mismo programa. Úsela para un contador o un valor
de consigna que no debe volver a su valor declarado después de un reinicio.

:::warning Estado de esta página
Verificado en el host, en el simulador y mediante comprobaciones en la compilación.
En una placa la retención está desactivada por defecto, y ninguna placa ha pasado
una prueba de corte de energía. No confíe en valores retentivos para estado crítico
de recuperación hasta que exista el registro de hardware de la placa exacta
([Persistencia y memoria retentiva](../runtime/persistence.md#límites)).
:::

## 1. Declare la variable

Declárela en un bloque `VAR RETAIN`, o en `VAR_GLOBAL RETAIN` para una global:

```st runnable expect="Count=3" scans=3 scan_ms=10
PROGRAM Counter
VAR RETAIN
    Count : INT;
END_VAR

Count := Count + 1;
END_PROGRAM
```

El compilador ubica la variable en la región retentiva de la memoria de proceso
(4 KB por defecto) y aplica su valor inicial declarado solo cuando la región no
contiene un estado guardado. La verificación de la documentación ejecuta este
programa desde un estado limpio: después de tres ciclos, `Count` es 3.

## 2. Véala conservar su valor en el simulador

El runtime nativo del simulador guarda la región y la restaura cuando se vuelve a
cargar el mismo programa:

1. Compile el proyecto y ejecútelo en el simulador, como en
   [Blink sin hardware](../tutorials/blink-without-hardware.md).
2. Presione **Detener**. La región se guarda con los valores del último ciclo completo.
3. Presione **Ejecutar** de nuevo, o cierre y vuelva a abrir ZPLC y ejecute el mismo
   programa. El contador continúa desde el valor que tenía.

El simulador guarda su almacén en la carpeta `.zplc` de su directorio personal, salvo
que `ZPLC_PERSIST_ROOT` nombre otro lugar. Mientras el programa se ejecuta, la región
se guarda como máximo una vez por intervalo, 30 segundos por defecto, y solo cuando
cambió. El intervalo lo fija la variable de entorno `ZPLC_RETAIN_SAVE_INTERVAL_MS`
del proceso que inicia el runtime: `0` desactiva los guardados periódicos, y una
detención y un apagado siguen guardando.

## 3. Qué descarta los valores

| Evento | Valores retentivos |
| --- | --- |
| Detener y volver a ejecutar, o un reinicio, del mismo programa | Se restauran |
| Una recompilación del programa, incluso una que solo mueve código | Se descartan: el programa tiene otra identidad |
| Un comando de reinicio | Se descartan: es un reinicio en frío |
| Se carga otro programa | Se descartan: el registro guardado pertenece al otro programa |
| Una falla | La detención de un runtime con falla no guarda nada |

El estado del runtime nativo indica cuál de estos ocurrió, con un `reason` como
`restored`, `none`, `identity_mismatch` o `layout_mismatch`: el campo `retain` del
estado de sesión, y `zplc sched status` en una placa.

## 4. En una placa

En el firmware la región retentiva se inicializa en cada arranque salvo que la
compilación defina `CONFIG_ZPLC_RETAIN_PERSIST`. Está desactivada por defecto,
porque la ruta de escritura se probó en `native_sim` y ninguna placa se ha medido:
una escritura en flash puede detener la búsqueda de instrucciones en un componente
que ejecuta código desde la misma flash, y el número de borrados por día está
acotado por el presupuesto de flash de la placa.

```ini
# firmware/app/boards/<board>.conf, once the board has a hardware record
CONFIG_ZPLC_RETAIN_PERSIST=y
```

[Persistencia y memoria retentiva](../runtime/persistence.md#presupuesto-de-desgaste-de-flash-por-placa)
tiene el presupuesto de desgaste de cada placa. La Nucleo-H743ZI no puede montar su
almacenamiento, por lo que su región retentiva se inicializa en cada arranque y el
estado dice `io_error`.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| El formato del registro, las ranuras alternas, la restauración y los motivos | Pruebas con fallas inyectadas en cada paso | Host y `native_sim` |
| Los valores sobreviven a una detención y a un arranque del runtime nativo | Prueba de la sesión nativa | Host |
| Un corte de energía en una placa | No probado | Ninguno |
| Cuánto retrasa una escritura en flash a un ciclo | No medido | Ninguno |

## Vea también

- [Persistencia y memoria retentiva](../runtime/persistence.md): el registro, los motivos y el presupuesto de desgaste.
- [Seguridad y limitaciones](../safety-and-limitations.md).
