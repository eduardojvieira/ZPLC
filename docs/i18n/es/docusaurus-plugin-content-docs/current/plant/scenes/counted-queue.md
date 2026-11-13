---
title: 'Cola contada'
sidebar_label: 'Cola contada'
description: 'La escena counted-queue: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Cola contada

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/counted-queue. Do not edit. >>> */}

Envíe tres cajas una tras otra y deténgase cuando las tres hayan salido de la cinta. Cada caja siguiente sale cuando la anterior dejó el emisor. Un contador lleva el total.

## Qué enseña

Contar eventos con un contador y liberar la pieza siguiente solo cuando la anterior se fue.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 1 |
| Emisor de piezas | 1 |
| Sensor óptico difuso | 2 |
| Retirador de piezas | 1 |
| Pulsador | 1 |
| Piloto luminoso | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `CountedQueue.Start` |
| `EyeIn.detect` | sensor | BOOL | `CountedQueue.EyeIn` |
| `EyeOut.detect` | sensor | BOOL | `CountedQueue.EyeOut` |
| `Belt1.run` | command | BOOL | `CountedQueue.Run` |
| `Emitter1.emit` | command | BOOL | `CountedQueue.Emit` |
| `DoneLight.lit` | command | BOOL | `CountedQueue.Done` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 20 s
- Pulso más corto (`shortestPulseMs`): 800 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `CountedQueue.Run = false`, `CountedQueue.Done = false` |
| desde 0 ms, dentro de 20000 ms | `fact:delivered:Remover1 = true`, `fact:itemsEmitted = true` |
| a los 20000 ms | `CountedQueue.Done = true`, `CountedQueue.Run = false` |
| siempre | `fact:itemsDropped = false`, `fact:itemsCollided = false` |

## Lecciones que usan esta escena

- [Cargar y descargar tres cajas](../../learn/lessons/plant-counted-queue.md)
- [Cargar y descargar tres cajas en diagrama de escalera](../../learn/lessons/plant-counted-queue-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/counted-queue <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
