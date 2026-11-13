---
title: 'Tanque temporizado'
sidebar_label: 'Tanque temporizado'
description: 'La escena timed-tank: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Tanque temporizado

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/timed-tank. Do not edit. >>> */}

Llene un tanque durante un tiempo fijo con un temporizador, manténgalo lleno un momento y luego vacíelo hasta que el interruptor de nivel bajo indique un nivel bajo. Una pulsación del botón de inicio comienza el ciclo. El paro de emergencia cierra las dos válvulas en cualquier momento y enciende la luz roja.

## Qué enseña

Secuenciar un proceso con temporizadores con retardo a la conexión y un paro de emergencia que se impone a la secuencia.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Tanque | 1 |
| Pulsador | 1 |
| Paro de emergencia | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `TimedTank.Start` |
| `EStop1.ok` | sensor | BOOL | `TimedTank.EStopOk` |
| `Tank1.levelLow` | sensor | BOOL | `TimedTank.LevelLow` |
| `Tank1.levelHigh` | sensor | BOOL | `TimedTank.LevelHigh` |
| `Tank1.fill` | command | BOOL | `TimedTank.Fill` |
| `Tank1.drain` | command | BOOL | `TimedTank.Drain` |
| `StackLight1.green` | command | BOOL | `TimedTank.Green` |
| `StackLight1.amber` | command | BOOL | `TimedTank.Amber` |
| `StackLight1.red` | command | BOOL | `TimedTank.Red` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 25 s
- Pulso más corto (`shortestPulseMs`): 200 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `TimedTank.Fill = false`, `TimedTank.Drain = false`, `TimedTank.Green = false`, `TimedTank.Red = false` |
| a los 800 ms | `TimedTank.Fill = true`, `TimedTank.Amber = true`, `TimedTank.Green = false` |
| a los 1500 ms | `TimedTank.Fill = false`, `TimedTank.Drain = false`, `TimedTank.Red = true` |
| a los 25000 ms | `TimedTank.Green = true`, `TimedTank.Drain = false`, `TimedTank.Red = false` |
| siempre | `fact:spilledL:Tank1 = false` |

## Lecciones que usan esta escena

- [Llenar y vaciar con temporizadores](../../learn/lessons/plant-timed-tank.md)
- [Llenar y vaciar con temporizadores en diagrama de escalera](../../learn/lessons/plant-timed-tank-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/timed-tank <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
