---
title: 'Ensamble de dos ejes, numérico'
sidebar_label: 'Ensamble de dos ejes, numérico'
description: 'La escena two-axis-assembly-numeric: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Ensamble de dos ejes, numérico

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/two-axis-assembly-numeric. Do not edit. >>> */}

La misma tarea con la variante numérica: el programa fija las posiciones X e Y del manipulador en metros y lee su posición, en lugar de moverlo hasta los finales de carrera.

## Qué enseña

Ordenar posiciones con señales numéricas y leer la posición de vuelta.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 3 |
| Emisor de piezas | 2 |
| Tope retráctil | 2 |
| Sensor óptico difuso | 2 |
| Manipulador de dos ejes | 1 |
| Retirador de piezas | 1 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `Assembler.Start` |
| `LidEye.detect` | sensor | BOOL | `Assembler.LidReady` |
| `BaseEye.detect` | sensor | BOOL | `Assembler.BaseReady` |
| `Pick1.gripped` | sensor | BOOL | `Assembler.Gripped` |
| `Pick1.xPos` | sensor | REAL | `Assembler.XPos` |
| `Pick1.yPos` | sensor | REAL | `Assembler.YPos` |
| `Pick1.grip` | command | BOOL | `Assembler.Grip` |
| `LidBelt.run` | command | BOOL | `Assembler.RunLid` |
| `BaseBelt.run` | command | BOOL | `Assembler.RunBase` |
| `ExitBelt.run` | command | BOOL | `Assembler.RunExit` |
| `LidBlade.extend` | command | BOOL | `Assembler.HoldLid` |
| `BaseBlade.extend` | command | BOOL | `Assembler.HoldBase` |
| `LidEmitter.emit` | command | BOOL | `Assembler.EmitLid` |
| `BaseEmitter.emit` | command | BOOL | `Assembler.EmitBase` |
| `StackLight1.green` | command | BOOL | `Assembler.Green` |
| `StackLight1.amber` | command | BOOL | `Assembler.Amber` |
| `Pick1.xSet` | command | REAL | `Assembler.XSet` |
| `Pick1.ySet` | command | REAL | `Assembler.YSet` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 40 s
- Pulso más corto (`shortestPulseMs`): 400 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `Assembler.Grip = false`, `Assembler.Green = false` |
| desde 0 ms, dentro de 40000 ms | `fact:itemsAssembled = true` |
| desde 0 ms, dentro de 40000 ms | `fact:delivered:Remover1 = true` |
| siempre | `fact:itemsDropped = false`, `fact:drops:Pick1 = false` |
| a los 40000 ms | `Assembler.Green = true`, `Assembler.Grip = false` |

## Lecciones que usan esta escena

- [Lo mismo con posiciones numéricas](../../learn/lessons/plant-assembler-numeric.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/two-axis-assembly-numeric <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
