---
title: 'Paletizador de capas'
sidebar_label: 'Paletizador de capas'
description: 'La escena layer-palletizer: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Paletizador de capas

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/layer-palletizer. Do not edit. >>> */}

Forme capas de cuatro cajas con un paletizador de capas y apile tres capas sobre una tarima. El empujador escuadra cada capa contra los topes fijos antes de que la pinza la levante. El cabezal arranca en su posición más baja, así que el programa lo sube antes de que lleguen las cajas.

## Qué enseña

Una secuencia de estación hecha de varios pasos de máquina, contada por capa y por tarima.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 1 |
| Emisor de piezas | 2 |
| Sensor óptico difuso | 1 |
| Paletizador de capas | 1 |
| Tarima | 1 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `LayerPalletizer.Start` |
| `EyeIn.detect` | sensor | BOOL | `LayerPalletizer.Eye` |
| `Palletizer1.xAtMin` | sensor | BOOL | `LayerPalletizer.XMin` |
| `Palletizer1.xAtMax` | sensor | BOOL | `LayerPalletizer.XMax` |
| `Palletizer1.yAtMin` | sensor | BOOL | `LayerPalletizer.YMin` |
| `Palletizer1.yAtMax` | sensor | BOOL | `LayerPalletizer.YMax` |
| `Palletizer1.squared` | sensor | BOOL | `LayerPalletizer.Squared` |
| `Palletizer1.layerReady` | sensor | BOOL | `LayerPalletizer.LayerReady` |
| `Palletizer1.gripped` | sensor | BOOL | `LayerPalletizer.Gripped` |
| `Infeed.run` | command | BOOL | `LayerPalletizer.Run` |
| `Emitter1.emit` | command | BOOL | `LayerPalletizer.Emit1` |
| `Emitter2.emit` | command | BOOL | `LayerPalletizer.Emit2` |
| `Palletizer1.xPlus` | command | BOOL | `LayerPalletizer.XPlus` |
| `Palletizer1.xMinus` | command | BOOL | `LayerPalletizer.XMinus` |
| `Palletizer1.yPlus` | command | BOOL | `LayerPalletizer.YPlus` |
| `Palletizer1.yMinus` | command | BOOL | `LayerPalletizer.YMinus` |
| `Palletizer1.square` | command | BOOL | `LayerPalletizer.Square` |
| `Palletizer1.grip` | command | BOOL | `LayerPalletizer.Grip` |
| `StackLight1.amber` | command | BOOL | `LayerPalletizer.Amber` |
| `StackLight1.green` | command | BOOL | `LayerPalletizer.Green` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 60 s
- Pulso más corto (`shortestPulseMs`): 20 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `LayerPalletizer.Green = false`, `LayerPalletizer.Amber = false`, `LayerPalletizer.Grip = false`, `LayerPalletizer.Run = false` |
| a los 1000 ms | `LayerPalletizer.Amber = true`, `LayerPalletizer.Green = false` |
| desde 0 ms, dentro de 60000 ms | `fact:placed:Palletizer1 = true`, `fact:stacked:pallet:0 = true`, `fact:layers:pallet:0 = true` |
| siempre | `fact:itemsDropped = false`, `fact:drops:Palletizer1 = false` |
| a los 60000 ms | `LayerPalletizer.Green = true`, `LayerPalletizer.Grip = false`, `LayerPalletizer.Run = false`, `LayerPalletizer.XPlus = false`, `LayerPalletizer.XMinus = false`, `LayerPalletizer.YPlus = false`, `LayerPalletizer.YMinus = false`, `LayerPalletizer.Square = false` |

## Lecciones que usan esta escena

- [Paletizar por capas](../../learn/lessons/plant-layer-palletizer.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/layer-palletizer <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
