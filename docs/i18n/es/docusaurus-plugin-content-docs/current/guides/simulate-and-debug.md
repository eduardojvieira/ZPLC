---
slug: /guides/simulate-and-debug
id: simulate-and-debug
title: Simular y depurar un programa
sidebar_label: Simular y depurar
description: 'Ejecute un programa en el simulador, observe sus variables, deténgalo en un punto de parada, avance ciclo a ciclo y lea la traza.'
tags: [how-to, debugging, simulation, breakpoints]
---

# Simular y depurar un programa

Ejecute un programa en su computador, observe cómo cambian sus variables, deténgalo en una línea y avance un ciclo a la vez. El simulador usa la misma máquina virtual y el mismo planificador que una placa, así que lo que aprende aquí es lo que hace la lógica.

:::note Un resultado en el host
El simulador muestra lo que hace la lógica. No modela los pines, los controladores ni el tiempo real de una placa. Un programa que se comporta bien en el simulador no ha demostrado comportarse bien en una placa.
:::

## Qué simulador se ejecuta

ZPLC elige el simulador por usted.

| Simulador | Cuándo | Qué es |
| --- | --- | --- |
| Entorno de ejecución nativo | Es el predeterminado, siempre que pueda iniciar | Un programa aparte que la aplicación de escritorio supervisa. El ciclo de escaneo, la memoria retentiva y los bloques de comunicación siguen las reglas del firmware |
| Respaldo WASM | Solo cuando el runtime nativo no puede iniciar (falta su binario o falló su protocolo de enlace inicial) | El mismo código de sesión compilado a WebAssembly. Es degradado: la barra de estado dice **Runtime: WASM fallback · degraded** y enumera lo que falta |

El respaldo conserva la pausa, la reanudación, el avance por ciclo y los puntos de parada, pero no tiene bloques de red, ni puerto serie, ni pines, y su tiempo sigue la ventana de la aplicación. Los detalles y la evidencia están en [Entorno de ejecución de software](../runtime/browser-runtime.md). Una copia de ZPLC compilada desde el código fuente necesita que el entorno de ejecución nativo se compile una vez con `bun run build:runtime`.

## 1. Compilar y ejecutar

1. Compile el proyecto (**Compilación**, luego **Compilar**).
2. En la barra de herramientas, compruebe que **Simular** esté seleccionado. Pulse **Conectar** y luego **Ejecutar** (F5). La línea de estado dice **En marcha** y el contador de ciclos sube.
3. Abra la pestaña **Observación**, pulse **+** y escriba el nombre de una variable. Su valor sigue al programa. Haga doble clic en un valor para escribirlo.

![La pestaña Watch de ZPLC con una variable del programa en ejecución (interfaz en inglés)](/img/screens/guide-watch.png)

[Blink sin hardware](../tutorials/blink-without-hardware.md) hace esto con un primer proyecto.

## 2. Detenerse en un punto de parada

Cualquier programa sirve. Este cuenta sus ciclos, así que una detención muestra el valor del ciclo que la alcanzó.

![El editor detenido en un punto de parada, con la fila Trace en paused (interfaz en inglés)](/img/screens/guide-breakpoint.png)

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

1. Haga clic en el margen del editor junto a `Count := Count + 1;`. Un punto marca la línea.
2. Pulse **Ejecutar**. El ciclo se detiene al llegar a la instrucción. La barra de herramientas ofrece **Reanudar** (F5), el editor marca la línea, **Salida** dice `Breakpoint hit at PC=0x..., line N` y la pestaña **Traza** muestra una fila que dice `paused`.
3. Lea **Observación**. Los valores son los del ciclo que se detuvo. Fije una entrada, o [fuerce un valor](./force-values.md), y vuelva a leer.
4. Pulse **Reanudar** (F5) para terminar el ciclo y seguir hasta la siguiente detención, o **Avanzar un ciclo** (F10) para ejecutar un ciclo y detenerse en el siguiente límite de ciclo o en el siguiente punto de parada.

Un punto de parada también puede estar en una línea de lista de instrucciones, un peldaño de escalera, un bloque FBD, y un paso o una transición SFC. El mapa de depuración relaciona las instrucciones de máquina con el elemento que usted editó.

## 3. Qué conserva cada control

| Control | Imagen de salida | Forzados | El ciclo |
| --- | --- | --- | --- |
| Pausar (F6) | Se conserva | Se conservan | Se detiene entre ciclos |
| Avanzar un ciclo (F10) | Se conserva, y muestra el ciclo ejecutado | Se conservan | Ejecuta un ciclo completo, o termina el que estaba detenido en un punto de parada |
| Reanudar (F5) | Se conserva | Se conservan | Un ciclo detenido en un punto de parada continúa desde allí |
| Detener (Mayús+F5) | Se pone en cero | Se borran | Cada tarea vuelve a su punto de entrada |
| Reiniciar (F8) | Un reinicio en frío: valores iniciales | Se borran | Empieza de nuevo desde el primer ciclo |

La tabla completa y las pruebas que la respaldan están en [Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada). En una placa, pausar, avanzar y detener también llevan las salidas físicas a su estado seguro.

## 4. Averiguar por qué falló una prueba

Una ejecución manual muestra un solo camino. Una [prueba de escenario](./scenario-tests.md) dice lo que el programa debe hacer y avisa cuando un cambio lo rompe. Cuando un escenario falla, la falla indica el instante. Ejecute hasta ese ciclo con un punto de parada y lea la pestaña Observación allí.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Un punto de parada se enlaza y detiene el ciclo, y Reanudar termina el ciclo interrumpido | Recorridos 7 y 16 en la aplicación real, y las suites del planificador | Host y `native_sim` |
| Un forzado fijado en un punto de parada lo ve el resto del ciclo | Recorrido 18 en la aplicación real | Host |
| Pausar, avanzar y detener conservan y borran lo que dice la tabla | Las suites de Zephyr en `native_sim` y QEMU | Destino emulado |
| Las mismas detenciones en una placa | Sin probar | Ninguno |

## Vea también

- [Entorno de trabajo de ZPLC](../ide/features.md#límite-de-la-depuración): qué muestran las observaciones, las trazas y los forzados.
- [El shell de ZPLC](../operations/shell.md): los comandos de depuración de un dispositivo.
- [Seguridad y limitaciones](../safety-and-limitations.md).
