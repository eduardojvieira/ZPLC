---
slug: /guides/retained-variables
id: retained-variables
title: Conservar valores entre reinicios
sidebar_label: Variables retentivas
description: 'Declare variables que conservan su valor cuando el programa se detiene o el runtime se reinicia, y vea qué se guarda, cuándo y qué lo descarta.'
tags: [how-to, retain, persistence]
---

# Conservar valores entre reinicios

Una variable retentiva conserva su valor cuando el programa se detiene y cuando el runtime vuelve a iniciar con el mismo programa. Úsela para un contador o un valor de consigna que no debe volver a su valor declarado tras un reinicio.

:::warning Estado de esta página
Verificada en el host, en el simulador y con comprobaciones en tiempo de compilación. En una placa, ningún corte de energía se ha puesto a prueba. No confíe en los valores retentivos para el estado crítico de una recuperación hasta que exista el registro de hardware de su placa exacta ([Persistencia y memoria retentiva](../runtime/persistence.md#límites)).
:::

## 1. Declarar la variable

Declárela en un bloque `VAR RETAIN`, o en `VAR_GLOBAL RETAIN` para una global:

```st runnable expect="Count=3" scans=3 scan_ms=10
PROGRAM Counter
VAR RETAIN
    Count : INT;
END_VAR

Count := Count + 1;
END_PROGRAM
```

El compilador ubica la variable en la región retentiva de la memoria de proceso (4 KB por defecto). El valor inicial declarado se aplica solo cuando la región no tiene un estado guardado. La comprobación de la documentación ejecuta este programa desde un estado limpio: tras tres ciclos `Count` vale 3.

## 2. Verla conservar su valor en el simulador

El runtime nativo del simulador guarda la región y la restaura cuando usted carga de nuevo el mismo programa.

1. Compile el proyecto y ejecútelo en el simulador, como en [Blink sin hardware](../tutorials/blink-without-hardware.md).
2. Pulse **Detener**. La región se almacena con los valores del último ciclo completo.
3. Pulse **Ejecutar** de nuevo, o cierre y reabra ZPLC y ejecute el mismo programa. El contador continúa desde el valor que tenía.

El simulador guarda su almacén en la carpeta `.zplc` de su directorio personal, salvo que `ZPLC_PERSIST_ROOT` indique otro lugar. Mientras el programa se ejecuta, la región se almacena como máximo una vez por intervalo (30 segundos por defecto) y solo cuando cambió. La variable de entorno `ZPLC_RETAIN_SAVE_INTERVAL_MS` del proceso que inicia el runtime fija el intervalo. `0` desactiva los guardados periódicos, y una detención y un apagado siguen almacenando.

## 3. Qué descarta los valores

| Evento                                                         | Valores retentivos                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| Detener y ejecutar de nuevo, o un reinicio, del mismo programa | Se restauran                                                    |
| Una recompilación del programa, aunque solo mueva código       | Se descartan: el programa tiene otra identidad                  |
| Un comando de reinicio                                         | Se descartan: es un reinicio en frío                            |
| Se carga otro programa                                         | Se descartan: el registro almacenado pertenece al otro programa |
| Una falla                                                      | La detención de un runtime con falla no almacena nada           |

El estado del runtime dice cuál de estos casos ocurrió, con un `reason` como `restored`, `none`, `identity_mismatch` o `layout_mismatch`. Léalo en el campo `retain` del estado de la sesión, o con `zplc sched status` en una placa.

## 4. En una placa

El perfil de cada placa distribuida fija `CONFIG_ZPLC_RETAIN_PERSIST=y`, así que la región retentiva vuelve tras un ciclo de energía. Una compilación sin la opción inicializa la región en cada arranque.

```ini
# firmware/app/boards/<board>.conf (establecida en cada placa distribuida)
CONFIG_ZPLC_RETAIN_PERSIST=y
```

La ruta de escritura se probó en `native_sim`, y ninguna placa se ha medido. Una escritura en flash puede detener la captura de instrucciones en un componente que ejecuta código desde la misma flash, y los borrados por día están acotados por el presupuesto de flash de la placa. Un programa en ejecución almacena la región como máximo una vez por `CONFIG_ZPLC_RETAIN_SAVE_INTERVAL_S` (3600 s por defecto salvo que el archivo de la placa fije el suyo; 0 almacena solo al detener), y la compilación falla si el intervalo desgastaría la flash. [Persistencia y memoria retentiva](../runtime/persistence.md#presupuesto-de-desgaste-de-flash-por-placa) tiene el presupuesto de desgaste de cada placa.

La Nucleo-H743ZI guarda sus registros en ZMS, que solo `native_sim` ha ejecutado. Si el almacenamiento falla en una placa, la región se inicializa en cada arranque y el estado dice `io_error`.

## Qué está verificado y qué no

| Parte                                                                        | Verificado                                 | Nivel               |
| ---------------------------------------------------------------------------- | ------------------------------------------ | ------------------- |
| El formato del registro, las ranuras alternas, la restauración y los motivos | Pruebas con fallas inyectadas en cada paso | Host y `native_sim` |
| Los valores sobreviven a una detención y un arranque del runtime nativo      | Prueba de la sesión nativa                 | Host                |
| Un corte de energía en una placa                                             | Sin probar                                 | Ninguno             |
| Cuánto retrasa una escritura en flash a un ciclo                             | Sin medir                                  | Ninguno             |

## Vea también

- [Persistencia y memoria retentiva](../runtime/persistence.md): el registro, los motivos y el presupuesto de desgaste.
- [Seguridad y limitaciones](../safety-and-limitations.md).
