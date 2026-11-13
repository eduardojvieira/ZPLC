---
title: 'Control de nivel de un tanque'
sidebar_label: 'Control de nivel de un tanque'
description: 'La escena tank-level-control: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Control de nivel de un tanque

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/tank-level-control. Do not edit. >>> */}

Mantenga el nivel de un tanque en un valor de consigna con un lazo PID. La consigna viene de un potenciómetro en metros, un segundo potenciómetro abre la válvula de descarga como perturbación y un indicador numérico muestra el nivel. El nivel y la consigna llegan como valores crudos INT y las válvulas reciben porcentajes REAL.

## Qué enseña

Cerrar un lazo de control sobre señales numéricas, escalar cuentas crudas y mantener una consigna frente a una perturbación.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Tanque | 1 |
| Potenciómetro | 2 |
| Indicador numérico | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `Tank1.level` | sensor | INT | `TankLevel.LevelRaw` |
| `SetPoint.value` | sensor | INT | `TankLevel.SetPointRaw` |
| `DrainPot.value` | sensor | INT | `TankLevel.DrainRaw` |
| `Tank1.fill` | command | REAL | `TankLevel.FillCmd` |
| `Tank1.drain` | command | REAL | `TankLevel.DrainCmd` |
| `LevelDisplay.value` | command | REAL | `TankLevel.LevelShown` |
| `StackLight1.green` | command | BOOL | `TankLevel.Green` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 90 s
- Pulso más corto (`shortestPulseMs`): 200 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| desde 30000 ms, durante 8000 ms | `fact:inBand:Tank1 = true` |
| desde 40000 ms, dentro de 20000 ms | `fact:inBand:Tank1 = true` |
| desde 60000 ms, durante 8000 ms | `fact:inBand:Tank1 = true` |
| desde 85000 ms, durante 5000 ms | `fact:inBand:Tank1 = false` |
| siempre | `fact:spilledL:Tank1 = false` |

## Lecciones que usan esta escena

- [Leer el nivel](../../learn/lessons/plant-tank-level-scaling.md)
- [Mantener el nivel con PID](../../learn/lessons/plant-tank-pid.md)
- [El mismo lazo con bloques de función](../../learn/lessons/plant-tank-pid-fbd.md)
- [Leer el nivel en diagrama de escalera](../../learn/lessons/plant-tank-level-scaling-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/tank-level-control <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
