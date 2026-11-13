---
title: 'El reloj de la planta'
sidebar_label: 'El reloj de la planta'
description: 'La planta y el programa comparten un reloj virtual; un punto de interrupción, una pausa o una detención congelan la planta.'
tags: [plant, simulation]
---

# El reloj de la planta

En simulación, la planta y el programa comparten un reloj virtual. Cuando el programa ha completado N milisegundos de ciclos, la planta ha simulado N milisegundos. La planta nunca sigue el reloj de pared ni una marca de tiempo: sigue los ciclos que el entorno de ejecución ha completado.

## Un ciclo

Cada ciclo se ejecuta en este orden, el mismo de una ejecución calificada de escenario:

1. La planta toma los valores de salida que el programa escribió en el ciclo anterior.
2. La planta avanza un intervalo de ciclo.
3. La planta escribe sus sensores en la imagen de entradas en una sola escritura.
4. El entorno de ejecución corre el ciclo.

La planta avanza en pasos de 5 ms. Por eso el intervalo de la tarea debe ser múltiplo de 5 ms. Si no lo es, la sesión se niega a iniciar y lo dice, por ejemplo: `plant: the scan interval of 7 ms is not a multiple of the plant step of 5 ms; set the task interval to a multiple of 5 ms`.

Un bit de entrada que el mapa de la planta no maneja conserva su valor durante el intercambio, de modo que un bit que usted fije a mano junto a un sensor de la planta se mantiene.

## Pausa, paso y detención

- **Pausar** y **Detener** congelan la planta. No se emite ningún ciclo, así que la planta no avanza.
- **Paso** avanza el programa un ciclo y la planta un intervalo de ciclo.
- La barra de comandos maneja todo esto. La planta no tiene controles propios.

## La salvedad de la depuración: un punto de interrupción congela la planta

Cuando un punto de interrupción detiene el programa, el ciclo queda en curso y la sesión pasa al estado `held`. La planta ya avanzó para ese ciclo y no vuelve a avanzar hasta que usted continúe. Al continuar, el ciclo detenido termina y la planta sigue desde ahí. El tiempo de la planta se detiene mientras usted inspecciona el programa. No interprete una planta detenida como una máquina que se paró por una razón propia.

## Cuando el entorno de ejecución falla

Si el entorno de ejecución rechaza un paso, la sesión pasa a `faulted` e informa el mensaje del propio entorno. La planta ya avanzó para el ciclo en curso y no vuelve a avanzar. Los eventos y las instantáneas informan el último ciclo completado.

## Equipos lentos

Si el intercambio y el paso de la planta juntos tardan más que el intervalo de ciclo, la sesión hace más lentas la planta y el programa juntos y lo avisa. Nunca omite un paso. Esta página no da ninguna cifra de velocidad: aún no se ha medido en las máquinas de referencia.

## Diferencias entre entornos de ejecución

Con el entorno de ejecución nativo y con el de WebAssembly, el intercambio, el reloj virtual y el rastro son los mismos. La lista de diferencias conocidas entre ambos (`PLANT_WASM_GAPS`) hoy está vacía.
