---
title: 'Ensamble de dos ejes'
sidebar_label: 'Ensamble de dos ejes'
description: 'La escena two-axis-assembly: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Ensamble de dos ejes

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/two-axis-assembly. Do not edit. >>> */}

Ponga una tapa sobre cada base con un manipulador de dos ejes. Las tapas y las bases llegan por dos cintas y esperan en topes retráctiles; la ventosa toma una tapa y la deja centrada sobre una base, y la base armada sale por la cinta de salida.

## Qué enseña

Secuenciar un manipulador que se mueve hasta finales de carrera y sincronizar dos flujos de entrada.

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
| `Pick1.xAtMin` | sensor | BOOL | `Assembler.XAtMin` |
| `Pick1.xAtMax` | sensor | BOOL | `Assembler.XAtMax` |
| `Pick1.yAtMin` | sensor | BOOL | `Assembler.YAtMin` |
| `Pick1.yAtMax` | sensor | BOOL | `Assembler.YAtMax` |
| `Pick1.gripped` | sensor | BOOL | `Assembler.Gripped` |
| `Pick1.xPlus` | command | BOOL | `Assembler.XPlus` |
| `Pick1.xMinus` | command | BOOL | `Assembler.XMinus` |
| `Pick1.yPlus` | command | BOOL | `Assembler.YPlus` |
| `Pick1.yMinus` | command | BOOL | `Assembler.YMinus` |
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

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 40 s
- Pulso más corto (`shortestPulseMs`): 400 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `Assembler.XPlus = false`, `Assembler.YMinus = false`, `Assembler.Grip = false`, `Assembler.Green = false` |
| desde 0 ms, dentro de 40000 ms | `fact:itemsAssembled = true` |
| desde 0 ms, dentro de 40000 ms | `fact:delivered:Remover1 = true` |
| siempre | `fact:itemsDropped = false`, `fact:drops:Pick1 = false` |
| a los 40000 ms | `Assembler.Green = true`, `Assembler.XPlus = false`, `Assembler.XMinus = false`, `Assembler.YPlus = false`, `Assembler.YMinus = false`, `Assembler.Grip = false` |

## Lecciones que usan esta escena

- [Ensamblar tapas y bases](../../learn/lessons/plant-assembler.md)
- [Modos manual y automático](../../learn/lessons/plant-manual-auto.md)
- [Modos manual y automático](../../learn/lessons/plant-manual-auto-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/two-axis-assembly <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
