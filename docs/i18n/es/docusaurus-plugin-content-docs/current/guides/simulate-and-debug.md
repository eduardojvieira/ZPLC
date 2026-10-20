---
slug: /guides/simulate-and-debug
id: simulate-and-debug
title: Simular y depurar un programa
sidebar_label: Simular y depurar
description: "Ejecute un programa en el simulador, observe sus variables, deténgalo en un punto de parada, avance paso a paso y vea qué conserva cada control."
tags: [how-to, debugging, simulation, puntos de parada]
---

# Simular y depurar un programa

El simulador ejecuta el programa compilado en su equipo, con la misma máquina virtual
y el mismo planificador que una placa. Úselo para ver qué hace la lógica, para
detenerla en una sentencia y mirar los valores, antes de llevarla a otro lugar.

:::note Un resultado de host
El simulador muestra qué hace la lógica. No modela las entradas ni las salidas de una
placa, sus controladores ni sus tiempos reales, así que un programa que se comporta
bien en el simulador no se ha demostrado que se comporte bien en una placa.
:::

## 1. Compile y ejecute

1. Compile el proyecto (**Compilación**, **Compilar**).
2. En la barra de herramientas, compruebe que **Simular** esté seleccionado y
   pulse **Conectar** y luego **Ejecutar** (F5). La línea de estado muestra **En marcha** y
   el contador de ciclos sube.
3. Abra la pestaña **Observación**, pulse **+** y escriba una variable. Su valor sigue al
   programa. Haga doble clic en un valor para escribirlo.

[Blink sin hardware](../tutorials/blink-without-hardware.md) hace esto en un primer
proyecto.

## 2. Deténgase en un punto de parada

Cualquier programa sirve. Este cuenta sus ciclos, de modo que una parada muestra el valor
del ciclo que la alcanzó:

```st runnable
PROGRAM Counter
VAR
    Count : DINT;
    Armed : BOOL := TRUE;
END_VAR

IF Armed THEN
    Count := Count + 1;
END_IF;
END_PROGRAM
```

1. Haga clic en el margen del editor, junto a `Count := Count + 1;`. Un punto marca la línea.
2. Pulse **Ejecutar**. El programa se detiene cuando un ciclo llega a la sentencia: la
   barra de herramientas ofrece **Reanudar** (F5), el editor marca la línea, **Salida**
   dice `Breakpoint hit at PC=..., line N` y una fila de la pestaña **Traza** dice
   `paused`.
3. Mire los valores en **Observación**. Son los valores del ciclo que se detuvo. Fije una
   entrada, o fuerce un valor ([Forzar un valor](./force-values.md)), y vuelva a
   mirar.
4. Pulse **Reanudar** (F5) para que el ciclo termine y siga hasta la siguiente
   detención, o **Avanzar un ciclo** (F10) para ejecutar un ciclo y detenerse en el
   siguiente límite de ciclo o en el siguiente punto de parada.

También puede fijarse un punto de parada en una línea de Instruction List, un
peldaño de Ladder, un bloque de FBD y un paso o transición de SFC. El mapa de
depuración relaciona las instrucciones con el elemento que usted editó.

## 3. Qué conserva cada control

| Control | Imagen de salida | Forzados | El ciclo |
| --- | --- | --- | --- |
| Pausar (F6) | Se conserva | Se conservan | Se detiene entre ciclos |
| Avanzar un ciclo (F10) | Se conserva, y muestra el ciclo ejecutado | Se conservan | Ejecuta un ciclo completo, o termina el que estaba detenido en un punto de parada |
| Reanudar (F5) | Se conserva | Se conservan | Un ciclo detenido en un punto de parada continúa desde allí |
| Detener (Shift+F5) | Se pone en cero | Se borran | Cada tarea vuelve a su punto de entrada |
| Reiniciar (F8) | Un reinicio en frío: valores iniciales | Se borran | Empieza de nuevo desde el primer ciclo |

La tabla completa, con las pruebas que la respaldan, está en
[Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada).
En una placa, la pausa, el paso y la detención también llevan las salidas físicas a su
estado seguro.

## 4. Compruébelo con un escenario

Una ejecución manual muestra un camino. Una [prueba de escenario](./scenario-tests.md)
dice qué debe hacer el programa y descubre cuándo un cambio lo rompe. Use el depurador
para entender un escenario que falla: la falla da el instante, y usted puede ejecutar
hasta ese ciclo.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Un punto de parada se enlaza y detiene el ciclo, y Reanudar termina el ciclo interrumpido | Los recorridos 7 y 16 en la aplicación real, y las suites del planificador | Host y `native_sim` |
| Un forzado fijado en un punto de parada lo ve el resto del ciclo | El recorrido 18 en la aplicación real | Host |
| La pausa, el paso y la detención conservan y borran lo que dice la tabla | Las suites de Zephyr en `native_sim` y QEMU | Destino emulado |
| Las mismas detenciones en una placa | No probado | Ninguno |

## Vea también

- [Banco de trabajo de ZPLC](../ide/features.md#límite-de-la-depuración): lo que muestran las variables observadas, las trazas y los forzados.
- [La consola de ZPLC](../operations/shell.md): los comandos de depuración de un dispositivo.
- [Seguridad y limitaciones](../safety-and-limitations.md).
