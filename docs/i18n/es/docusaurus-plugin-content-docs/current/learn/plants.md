---
title: "Plantas de las lecciones"
sidebar_label: "Plantas de las lecciones"
description: "Las plantas simuladas que las lecciones conectan a su programa, generadas de los paquetes de lecciones."
tags: [learn, generated]
unlisted: true
---

# Plantas de las lecciones

{/* >>> GENERATED (tools/docs/generate_course_pages.ts): learn/plants. Do not edit. >>> */}

Una planta es una máquina simulada que una lección conecta a su programa: la lección asigna las señales de la planta a las entradas y salidas de su proyecto inicial. Esta lista se genera de los paquetes de lecciones.

| Planta | La usan |
| --- | --- |
| `conveyor-v1` | [Cinta de clasificación y atasco seguro](./lessons/conveyor-classification-jam.md), [Clasificación en un transportador como diagrama](./lessons/conveyor-sorting-sfc.md) |
| `motor-v1` | [Orden, realimentación y velocidad](./lessons/motor-plant-feedback.md), [Enclavamientos y permisivos: una protección que detiene el motor](./lessons/interlock-guard-permissive.md), [Enclavamientos y permisivos en diagrama de bloques de función: una protección que detiene el motor](./lessons/interlock-guard-permissive-fbd.md), [Lista de instrucciones: una protección como permisivo de toda la condición](./lessons/interlock-guard-permissive-il.md) |
| `pedestrian-v1` | [Cruce peatonal y estados seguros](./lessons/pedestrian-crossing-states.md), [Cruce peatonal como diagrama funcional secuencial](./lessons/pedestrian-crossing-sfc.md) |
| `tank-v1` | [Nivel de tanque, fallas y reset](./lessons/tank-level-fault-reset.md), [Nivel de tanque, fallas y reset en escalera: enclavamientos y orden de los peldaños](./lessons/tank-level-fault-reset-ladder.md) |

## Escenas

Una lección de escena corre su programa en una escena de la simulación de la planta, en lugar de una planta de la lista anterior. Cada escena tiene su propia página.

| Escena | La usan |
| --- | --- |
| [Cinta hasta un sensor](../plant/scenes/belt-to-sensor.md) | [Mover una caja hasta un sensor](./lessons/plant-belt-to-sensor.md), [Construir una escena de cinta desde el suelo vacío](./lessons/plant-build-belt-scene.md), [Mover una caja hasta un sensor en diagrama de escalera](./lessons/plant-belt-to-sensor-ladder.md), [Construir una escena de cinta desde el suelo vacío](./lessons/plant-build-belt-scene-ladder.md) |
| [Biestable entre dos sensores](../plant/scenes/latch-two-sensors.md) | [Del sensor A al sensor B](./lessons/plant-latch-two-sensors.md), [Del sensor A al sensor B en diagrama de escalera](./lessons/plant-latch-two-sensors-ladder.md) |
| [Tanque temporizado](../plant/scenes/timed-tank.md) | [Llenar y vaciar con temporizadores](./lessons/plant-timed-tank.md), [Llenar y vaciar con temporizadores en diagrama de escalera](./lessons/plant-timed-tank-ladder.md) |
| [Cola contada](../plant/scenes/counted-queue.md) | [Cargar y descargar tres cajas](./lessons/plant-counted-queue.md), [Cargar y descargar tres cajas en diagrama de escalera](./lessons/plant-counted-queue-ladder.md) |
| [Ensamble de dos ejes](../plant/scenes/two-axis-assembly.md) | [Ensamblar tapas y bases](./lessons/plant-assembler.md), [Modos manual y automático](./lessons/plant-manual-auto.md), [Modos manual y automático](./lessons/plant-manual-auto-ladder.md) |
| [Ensamble de dos ejes, numérico](../plant/scenes/two-axis-assembly-numeric.md) | [Lo mismo con posiciones numéricas](./lessons/plant-assembler-numeric.md) |
| [Almacén con transelevador](../plant/scenes/stacker-crane-warehouse.md) | [Almacenar y recuperar](./lessons/plant-warehouse.md) |
| [Búfer y liberación](../plant/scenes/buffer-release.md) | [Acumular y liberar](./lessons/plant-buffer-release.md) |
| [Unión de dos líneas](../plant/scenes/merge-lines.md) | [Fusionar dos líneas](./lessons/plant-merge-lines.md), [Modificar una escena: alimentar la segunda línea](./lessons/plant-change-scene.md), [Fusionar dos líneas en diagrama de escalera](./lessons/plant-merge-lines-ladder.md), [Modificar una escena: alimentar la segunda línea](./lessons/plant-change-scene-ladder.md) |
| [Elevador con apilado](../plant/scenes/lift-stacking.md) | [Reunir piezas en un cajón](./lessons/plant-lift-stacking.md) |
| [Elevadores de tres niveles](../plant/scenes/three-level-lifts.md) | [Mover cajas entre tres niveles](./lessons/plant-three-level-lifts.md), [Paro de emergencia y enclavamientos](./lessons/plant-estop-interlocks.md), [Paro de emergencia y enclavamientos en diagrama de escalera](./lessons/plant-estop-interlocks-ladder.md) |
| [Control de nivel de un tanque](../plant/scenes/tank-level-control.md) | [Leer el nivel](./lessons/plant-tank-level-scaling.md), [Mantener el nivel con PID](./lessons/plant-tank-pid.md), [El mismo lazo con bloques de función](./lessons/plant-tank-pid-fbd.md), [Leer el nivel en diagrama de escalera](./lessons/plant-tank-level-scaling-ladder.md) |
| [Paletizador de capas](../plant/scenes/layer-palletizer.md) | [Paletizar por capas](./lessons/plant-layer-palletizer.md) |
| [Transferencia entre cintas](../plant/scenes/belt-to-belt-transfer.md) | [Tomar de una cinta y dejar en otra](./lessons/plant-belt-transfer.md), [Tomar de una cinta y dejar en otra en diagrama de escalera](./lessons/plant-belt-transfer-ladder.md) |
| [Paletizado de tres ejes](../plant/scenes/three-axis-palletizing.md) | [Paletizar con un pórtico](./lessons/plant-xyz-palletizing.md) |
| [Línea de producción balanceada](../plant/scenes/balanced-production-line.md) | [Equilibrar una línea de producción](./lessons/plant-production-line.md) |
| [Separación por color](../plant/scenes/colour-separation.md) | [Enviar cada color a su cinta](./lessons/plant-colour-separation.md), [La misma clasificación en Lista de instrucciones](./lessons/plant-colour-separation-il.md), [Enviar cada color a su cinta en diagrama de escalera](./lessons/plant-colour-separation-ladder.md) |
| [Clasificación por altura con mesa giratoria](../plant/scenes/height-sorting-turntable.md) | [Clasificar por altura, mesa giratoria](./lessons/plant-height-turntable.md) |
| [Clasificación por altura con transferencia de cadenas](../plant/scenes/height-sorting-chain.md) | [Clasificar por altura, transferencia de cadenas](./lessons/plant-height-chain.md), [Encontrar la falla](./lessons/plant-fault-actions.md), [Clasificar por altura, transferencia de cadenas en diagrama de escalera](./lessons/plant-height-chain-ladder.md) |
| [Clasificación por peso](../plant/scenes/weight-sorting.md) | [Clasificar por peso](./lessons/plant-weight-sorting.md), [Clasificar por peso en diagrama de escalera](./lessons/plant-weight-sorting-ladder.md) |
| [Clasificación con visión](../plant/scenes/vision-sorting.md) | [Clasificar por código de identidad](./lessons/plant-vision-sorting.md) |

{/* <<< END GENERATED: learn/plants <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
