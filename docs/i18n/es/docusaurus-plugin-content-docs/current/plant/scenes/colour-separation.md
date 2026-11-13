---
title: 'Separación por color'
sidebar_label: 'Separación por color'
description: 'La escena colour-separation: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Separación por color

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/colour-separation. Do not edit. >>> */}

Clasifique piezas rojas y azules con un sensor de color. Cada pieza espera en un tope retráctil mientras el sensor de color la lee; un empujador envía las rojas a una cinta lateral y las azules siguen de largo.

## Qué enseña

Decidir con la lectura de un sensor mientras la pieza está retenida y actuar una sola vez.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 3 |
| Emisor de piezas | 1 |
| Tope retráctil | 1 |
| Sensor óptico difuso | 1 |
| Sensor de color | 1 |
| Empujador | 1 |
| Retirador de piezas | 2 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `ColourSeparation.Start` |
| `EyeStop.detect` | sensor | BOOL | `ColourSeparation.Waiting` |
| `Colour1.match` | sensor | BOOL | `ColourSeparation.IsRed` |
| `Pusher1.extended` | sensor | BOOL | `ColourSeparation.Extended` |
| `Pusher1.retracted` | sensor | BOOL | `ColourSeparation.Retracted` |
| `Infeed.run` | command | BOOL | `ColourSeparation.RunIn` |
| `Outfeed.run` | command | BOOL | `ColourSeparation.RunOut` |
| `SideBelt.run` | command | BOOL | `ColourSeparation.RunSide` |
| `Stop1.extend` | command | BOOL | `ColourSeparation.Hold` |
| `Pusher1.extend` | command | BOOL | `ColourSeparation.Push` |
| `Beacon.amber` | command | BOOL | `ColourSeparation.Busy` |
| `Beacon.green` | command | BOOL | `ColourSeparation.Done` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 50 s
- Pulso más corto (`shortestPulseMs`): 40 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `ColourSeparation.Hold = false`, `ColourSeparation.Push = false`, `ColourSeparation.Done = false` |
| a los 1500 ms | `ColourSeparation.Hold = true`, `ColourSeparation.Busy = true`, `ColourSeparation.Done = false` |
| desde 0 ms, dentro de 50000 ms | `fact:sorted:RedBin = true`, `fact:sorted:BlueBin = true` |
| a los 50000 ms | `ColourSeparation.Done = true`, `ColourSeparation.Push = false` |
| siempre | `fact:misrouted:RedBin = false`, `fact:misrouted:BlueBin = false`, `fact:itemsDropped = false` |

## Lecciones que usan esta escena

- [Enviar cada color a su banda](../../learn/lessons/plant-colour-separation.md)
- [La misma clasificación en Lista de instrucciones](../../learn/lessons/plant-colour-separation-il.md)
- [Enviar cada color a su banda en diagrama de escalera](../../learn/lessons/plant-colour-separation-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/colour-separation <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
