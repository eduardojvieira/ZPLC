---
title: 'E/S de planta'
sidebar_label: 'E/S de planta'
description: 'Alimentar una placa desde la planta: qué hace el modo, quién puede iniciarlo, qué hacen las salidas de la placa y qué evidencia existe en cada nivel. Aún no se ha medido ninguna placa.'
tags: [plant, hardware, evidence]
---

# E/S de planta

El modo de E/S de planta permite que una placa ejecute su programa contra la planta simulada. Las entradas que enlaza el mapa de la planta toman sus valores de la planta por el enlace del dispositivo, en lugar de tomarlos de los pines de la placa, y la imagen de salidas de la placa se publica a la planta. Su programa no cambia. Es la forma en que una lección de escena llega a una placa sin una máquina real.

Esta página dice qué hace el modo y qué se ha demostrado de él. Donde no se ha demostrado nada, lo dice.

## Qué se ha demostrado

| Afirmación                                                                                                               | Nivel                         | Evidencia                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------- |
| El firmware valida cada frame, aplica las entradas en el ciclo, mantiene los pines seguros y sale del modo por una regla | Host (pruebas unitarias en C) | `firmware/lib/zplc_core/tests/test_plant.c`, `test_plant_sched.c` y `test_plant_attack.c` |
| El módulo del firmware corre en el simulador nativo y responde frames                                                    | Simulador nativo              | `firmware/tests/plant_io` y el registro de ensayo que sigue                               |
| ZPLC alimenta una placa desde la planta, en un lazo, con una comprobación de latencia y un aviso de pulso                | Host (doble de prueba)        | las pruebas de `packages/zplc-ide/src/plant/board`, que usan una placa falsa              |
| El modo compila para una placa del catálogo                                                                              | Compilación para el destino   | No se registra en esta página                                                             |
| El modo corre en una placa física, por USB serie o por TCP                                                               | HIL                           | **Ninguna. Aún no existe una ejecución en una placa física.**                             |

La única medición que existe es un ensayo en el simulador nativo, registrado en `specs/012-zplc-2-1-plant-simulation/evidence/plant-io-native-sim-rehearsal.json`. Un host Linux envió 500 frames, uno cada 20 ms, al simulador por una pseudoterminal. El viaje de ida y vuelta de un frame fue de 19.02 ms en la mediana (p50), 19.49 ms en el percentil 95 (p95) y 20.27 ms como máximo, y la ejecución no tuvo ningún ciclo tardío, ningún frame rechazado ni ningún tiempo agotado. Es un host que habla con un simulador. No es una placa, no es un enlace real y no dice nada sobre los tiempos en una placa.

La tasa de cuadros y la latencia del enlace en una placa aún no se han medido. Esta documentación no da ninguna cifra para ellas ni una lista de placas que funcionen.

## Quién lo inicia

Entrar al modo es una operación física: las salidas de una placa las decide algo distinto de sus propios pines. Por eso:

- **Una persona lo inicia, en cada sesión.** La acción es el comando **Alimentar la placa desde la planta**. El texto que ZPLC muestra para confirmarla dice: "La placa leerá sus entradas de la planta simulada y no de sus terminales, hasta que cierre el modo o termine el enlace. Compruebe que nada conectado a sus salidas pueda causar daño."
- **La IA y MCP nunca lo inician.** El servidor MCP no tiene ninguna herramienta que entre, alimente o refleje una planta, y una prueba lo comprueba. Un agente puede ejecutar el escenario de una escena sin interfaz contra un entorno de ejecución simulado, lo que no toca ninguna placa.
- **El comando aún no está disponible.** En esta versión el comando existe pero está desactivado, porque el indicador permanente que muestra que el modo está activo todavía no está montado en ZPLC. ZPLC no puede iniciar el modo desde la interfaz hasta que lo esté.

El modo es una capacidad que el firmware ofrece en el enlace de control. Con un firmware que no la ofrece, ZPLC lo dice, y una lección muestra su ruta de hardware como no disponible, con el motivo.

## Qué hacen las salidas de la placa

- **Se mantienen seguras mientras el modo está activo.** Los pines de la placa conservan su nivel seguro documentado mientras la placa se alimenta desde la planta. La imagen de salidas sigue llevando lo que escribe su programa, y la planta la lee.
- **Reflejar es una segunda decisión.** Una persona puede activar el reflejo para la sesión, y solo entonces los pines siguen la imagen de salidas. Está desactivado cada vez que el modo se inicia.
- **El modo termina por una regla, y los pines siguen seguros.** El modo termina cuando usted lo cierra, cuando la placa no recibe un frame a tiempo, cuando termina la sesión, cuando se pierde el enlace, cuando el programa se detiene, se pausa o se reinicia, cuando la placa informa una falla o cuando rechaza frames que rompen el protocolo. ZPLC nombra el motivo. La placa no sigue con valores viejos de la planta ni vuelve sola a sus pines.
- **El intercambio no retrasa el ciclo.** Un frame que llega tarde se cuenta y se muestra.

Estas reglas se muestran en las pruebas del firmware a nivel de host. Todavía no se muestran en una placa.

## Qué conectar

Para una escena, la placa solo necesita la conexión con ZPLC: un cable USB serie al computador. Las entradas que enlaza el mapa de la planta no necesitan nada en sus terminales, porque la planta las suministra. Las salidas se mantienen seguras, así que una lámpara o un relé conectado a una salida no sigue a la planta a menos que active el reflejo.

Ninguna lección ofrece hoy la ruta de hardware por el modo de E/S de planta. Toda lección de escena es solo de simulación y dice por qué. Cuando una lección la ofrezca, su página dirá qué conectar para esa lección, y una comprobación en la placa se rotulará como un resultado de hardware, como en la [ruta de hardware](../learn/hardware-track.md).

## Lo que no se afirma

Ninguna placa ha corrido este modo en una prueba registrada. Esta página no da tiempos, tasa de cuadros ni lista de placas para él. Cuando se registre una ejecución de hardware, esta página citará su archivo.

## Consulte también

- [El editor de escenas](./scene-editor.md)
- [Las escenas incluidas](./scenes.md)
- [El reloj de la planta](./clock.md)
- [Ruta de hardware](../learn/hardware-track.md)
