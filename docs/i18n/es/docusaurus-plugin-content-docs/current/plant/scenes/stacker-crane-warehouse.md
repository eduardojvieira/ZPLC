---
title: 'Almacén con transelevador'
sidebar_label: 'Almacén con transelevador'
description: 'La escena stacker-crane-warehouse: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Almacén con transelevador

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/stacker-crane-warehouse. Do not edit. >>> */}

Almacene en las celdas de un estante, con un transelevador, las cajas que llegan por una cinta de entrada, y lleve la caja de una celda a la cinta de salida cuando se pulsa su botón de solicitud.

## Qué enseña

Llevar una tabla de celdas ocupadas y una cola de solicitudes, posicionar dos ejes por número y mover una horquilla en un orden fijo.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Transelevador | 1 |
| Cinta transportadora | 2 |
| Emisor de piezas | 1 |
| Retirador de piezas | 1 |
| Sensor óptico difuso | 1 |
| Pulsador | 4 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `Warehouse.Start` |
| `Req1.pressed` | sensor | BOOL | `Warehouse.Req1` |
| `Req2.pressed` | sensor | BOOL | `Warehouse.Req2` |
| `Req3.pressed` | sensor | BOOL | `Warehouse.Req3` |
| `InEye.detect` | sensor | BOOL | `Warehouse.InEye` |
| `Crane1.inPosition` | sensor | BOOL | `Warehouse.InPos` |
| `Crane1.raised` | sensor | BOOL | `Warehouse.Raised` |
| `Crane1.forkCentre` | sensor | BOOL | `Warehouse.Centre` |
| `Crane1.forkAtLeft` | sensor | BOOL | `Warehouse.AtLeft` |
| `Crane1.forkAtRight` | sensor | BOOL | `Warehouse.AtRight` |
| `Crane1.loaded` | sensor | BOOL | `Warehouse.Loaded` |
| `Crane1.bay` | command | INT | `Warehouse.Bay` |
| `Crane1.level` | command | INT | `Warehouse.Level` |
| `Crane1.raise` | command | BOOL | `Warehouse.Raise` |
| `Crane1.forkLeft` | command | BOOL | `Warehouse.ForkLeft` |
| `Crane1.forkRight` | command | BOOL | `Warehouse.ForkRight` |
| `Crane1.beltRight` | command | BOOL | `Warehouse.BeltRight` |
| `Infeed.run` | command | BOOL | `Warehouse.RunIn` |
| `Outfeed.run` | command | BOOL | `Warehouse.RunOut` |
| `StackLight1.green` | command | BOOL | `Warehouse.Green` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 90 s
- Pulso más corto (`shortestPulseMs`): 400 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| siempre | `fact:blocked:Crane1 = false`, `fact:itemsDropped = false` |
| desde 0 ms, dentro de 90000 ms | `fact:stored:Crane1 = true` |
| desde 0 ms, dentro de 90000 ms | `fact:cell:Crane1:1:1 = true` |
| desde 0 ms, dentro de 90000 ms | `fact:cell:Crane1:2:1 = true` |
| desde 0 ms, dentro de 90000 ms | `fact:delivered:OutBin = true` |
| a los 90000 ms | `fact:stored:Crane1 = 1`, `fact:delivered:OutBin = 2` |
| a los 90000 ms | `Warehouse.Green = true` |

## Lecciones que usan esta escena

- [Almacenar y recuperar](../../learn/lessons/plant-warehouse.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/stacker-crane-warehouse <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
