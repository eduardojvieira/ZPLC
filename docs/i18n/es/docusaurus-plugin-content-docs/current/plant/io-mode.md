---
title: 'E/S de planta'
sidebar_label: 'E/S de planta'
description: 'Alimentar una placa desde la planta: qué hace el modo, quién puede iniciarlo, qué hacen las salidas de la placa, cómo termina, el protocolo, la regla de latencia y qué evidencia existe en cada nivel. Aún no se ha medido ninguna placa.'
tags: [plant, hardware, evidence]
---

# E/S de planta

El modo de E/S de planta permite que una placa ejecute su programa contra la planta simulada. Las entradas que enlaza el mapa de la planta toman sus valores de la planta por el enlace del dispositivo, en lugar de tomarlos de los pines de la placa, y la imagen de salidas de la placa se publica a la planta. Su programa no cambia. Es la forma en que una lección de escena llega a una placa sin una máquina real.

Esta página dice qué hace el modo y qué se ha demostrado de él. Donde no se ha demostrado nada, lo dice.

**Ninguna placa tiene todavía evidencia de hardware del modo de E/S de planta.** Todo resultado de esta página viene del host, del simulador nativo, de QEMU, de la emulación o de una compilación.

## Qué se ha demostrado

| Afirmación                                                                                                                                              | Nivel                                           | Evidencia                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| El firmware valida cada frame, aplica las entradas en el ciclo, mantiene los pines seguros y sale del modo por una regla                                | Host (pruebas unitarias en C)                   | `firmware/lib/zplc_core/tests/test_plant.c`, `test_plant_sched.c` y `test_plant_attack.c`                           |
| El motor del enlace del dispositivo atiende los cinco mensajes, exige una sesión, termina el modo con la sesión y pide autenticación a un enlace de red | Host (pruebas unitarias en C)                   | `firmware/lib/zplc_core/tests/test_proto_plant.c`                                                                   |
| El módulo del firmware corre sobre el planificador de Zephyr y responde frames                                                                          | Simulador nativo                                | `firmware/tests/plant_io`, `firmware/tests/app_plant_link/test_app_plant_link.py` y el registro de ensayo que sigue |
| La misma suite corre en un juego de instrucciones Cortex-M de 32 bits, sin los casos que observan un pin                                                | QEMU                                            | `firmware/tests/plant_io` en `qemu_cortex_m3`                                                                       |
| Un pin de salida retenido se mantiene en su nivel seguro y sigue la imagen cuando el reflejo está activo                                                | Emulación (el emulador de GPIO de `native_sim`) | `test_hold_on_gpio_emul` en `firmware/tests/plant_io`                                                               |
| ZPLC alimenta una placa desde la planta, en un lazo, con una comprobación de latencia y un aviso de pulso                                               | Host (doble de prueba)                          | las pruebas de `packages/zplc-ide/src/plant/board`, que usan una placa falsa                                        |
| El modo compila para una placa del catálogo                                                                                                             | Compilación para el destino                     | No se registra en esta página                                                                                       |
| El modo corre en una placa física, por USB serie o por TCP                                                                                              | HIL                                             | **Ninguna. Aún no existe una ejecución en una placa física.**                                                       |

La única medición que existe es un ensayo en el simulador nativo, registrado en `specs/012-zplc-2-1-plant-simulation/evidence/plant-io-native-sim-rehearsal.json`. Un host Linux envió 500 frames, uno cada 20 ms, al simulador por una pseudoterminal. El viaje de ida y vuelta de un frame fue de 19.02 ms en la mediana (p50), 19.49 ms en el percentil 95 (p95) y 20.27 ms como máximo, y la ejecución no tuvo ningún ciclo tardío, ningún frame rechazado ni ningún tiempo agotado. Es un host que habla con un simulador. No es una placa, no es un enlace real y no dice nada sobre los tiempos en una placa.

La tasa de cuadros y la latencia del enlace en una placa aún no se han medido. Esta documentación no da ninguna cifra para ellas ni una lista de placas que funcionen. Las ejecuciones que las medirán, en la ESP32-S3-DevKitC-1 y en la Raspberry Pi Pico, están escritas en `tools/hil/BENCH-2.1.md` y se hacen con `tools/hil/plant_io_bench.py`; todavía no se ha hecho ninguna.

## Quién lo inicia

Entrar al modo es una operación física: las salidas de una placa las decide algo distinto de sus propios pines. Por eso:

- **Una persona lo inicia, en cada sesión.** La acción es el comando **Alimentar la placa desde la planta**. El texto que ZPLC muestra para confirmarla dice: "La placa leerá sus entradas de la planta simulada y no de sus terminales, hasta que cierre el modo o termine el enlace. Compruebe que nada conectado a sus salidas pueda causar daño."
- **La IA y MCP nunca lo inician.** El servidor MCP no tiene ninguna herramienta que entre, alimente o refleje una planta, y una prueba lo comprueba. Un agente puede ejecutar el escenario de una escena sin interfaz contra un entorno de ejecución simulado, lo que no toca ninguna placa.
- **El comando aún no está disponible.** En esta versión el comando existe pero está desactivado, porque el indicador permanente que muestra que el modo está activo todavía no está montado en ZPLC. ZPLC no puede iniciar el modo desde la interfaz hasta que lo esté.

El firmware entra al modo solo dentro de una sesión abierta del enlace del dispositivo, y solo mientras el programa está en marcha.

## Firmware sin la capacidad

El modo es una capacidad que el firmware ofrece en el enlace de control: el bit `PLANT` del saludo. Una compilación con `CONFIG_ZPLC_PLANT_IO` desactivado no la ofrece y responde los cinco mensajes como no admitidos. Con ese firmware ZPLC lo dice, y una lección muestra su ruta de hardware como no disponible, con el motivo:

- un firmware que solo habla el shell de texto: "Este firmware solo habla el shell de texto, por lo que no se puede alimentar desde la planta. Actualice el firmware a una versión con E/S de planta y vuelva a conectar, o ejecute la escena en simulación."
- un firmware con frames pero sin el bit: "Este firmware no ofrece E/S de planta. Actualice el firmware a una versión que la ofrezca, o ejecute la escena en simulación."

## Qué hacen las salidas de la placa

- **Se mantienen seguras mientras el modo está activo.** Los pines de la placa conservan su nivel seguro documentado mientras la placa se alimenta desde la planta. La imagen de salidas sigue llevando lo que escribe su programa, y la planta la lee.
- **Reflejar es una segunda decisión.** Una persona puede activar el reflejo para la sesión, y solo entonces los pines siguen la imagen de salidas. Está desactivado cada vez que el modo se inicia.
- **El intercambio no retrasa el ciclo.** El ciclo toma los valores de la planta sin esperar al enlace, y un ciclo que no encuentra un frame nuevo se cuenta como tardío y se muestra.

## Cómo termina el modo

El modo termina cuando usted lo cierra, cuando la placa no recibe un frame a tiempo, cuando termina la sesión, cuando se pierde el enlace, cuando el programa se detiene, se pausa o se reinicia, cuando la placa informa una falla o cuando rechaza ocho frames seguidos. ZPLC nombra el motivo:

| Motivo        | Qué terminó el modo                                                         |
| ------------- | --------------------------------------------------------------------------- |
| `CLOSED`      | una persona lo cerró                                                        |
| `TIMEOUT`     | no llegó ningún frame válido dentro del tiempo límite de la entrada         |
| `SESSION_END` | terminó la sesión: se cerró, quedó inactiva, la tomó otro o cambió su clave |
| `LINK_LOST`   | la placa vio caer su enlace                                                 |
| `RUN_CONTROL` | el programa se detuvo, se reinició, se cargó, se pausó o se reanudó         |
| `FAULT`       | la placa informó una falla                                                  |
| `PROTOCOL`    | ocho frames seguidos rompieron el protocolo y fueron rechazados             |

Todo motivo termina igual: **el programa se detiene y las salidas pasan a su nivel seguro**, como las deja un comando STOP (imagen de salidas reiniciada, forzados liberados). La placa no sigue con valores viejos de la planta ni vuelve sola a sus pines. Para seguir, una persona vuelve a poner el programa en marcha, y este empieza leyendo sus pines.

**Qué tan viejo puede ser un valor de la planta.** El tiempo límite se pide al iniciar el modo, y el firmware concede un valor de 50 ms a 2000 ms. Cuando no llega ningún frame válido dentro de él, el modo termina con `TIMEOUT`. Un valor de la planta que el programa lee tiene, por lo tanto, como máximo la antigüedad del tiempo límite más un ciclo. Un frame rechazado no cuenta como frame: no cambia ninguna entrada y no reinicia el tiempo límite.

En una placa cuyo puerto USB no informa el estado de la línea, como el puerto USB-Serial/JTAG de la ESP32-S3, el tiempo límite es lo que detecta un cable desconectado. Estas reglas se muestran en las pruebas del firmware a nivel de host, de simulador nativo y de emulación. Todavía no se muestran en una placa.

## El protocolo

El modo usa cinco mensajes de petición y respuesta del [enlace del dispositivo por frames](../reference/runtime-api.md) y un evento. Por USB serie, los frames viajan como líneas `zplc link <hex>` del shell, como cualquier otro mensaje por frames. Cada mensaje exige una sesión abierta.

| Mensaje          | Id     | Petición                                                                                           | Respuesta, después del byte de estado                                                                                                         |
| ---------------- | ------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLANT_ENTER`    | `0x70` | el tiempo límite, la cantidad de entradas y de salidas, y un descriptor de 3 bytes por cada ranura | el id de la entrada, los bytes de entradas y de salidas, las ranuras por dirección, el tiempo límite concedido                                |
| `PLANT_FRAME`    | `0x71` | el id de la entrada, un número de secuencia y los valores de las entradas                          | la última secuencia que aplicó un ciclo, los ciclos, el indicador de reflejo, los conteos de tardíos y rechazados, los valores de las salidas |
| `PLANT_EXIT`     | `0x72` | nada                                                                                               | el motivo (`CLOSED`), los conteos de frames, tardíos y rechazados                                                                             |
| `PLANT_MIRROR`   | `0x73` | 0 o 1                                                                                              | el estado del reflejo                                                                                                                         |
| `PLANT_STATUS`   | `0x74` | nada                                                                                               | activo, el id de la entrada, el reflejo, los conteos de frames, tardíos y rechazados, la antigüedad del último frame                          |
| `EVT_PLANT_EXIT` | `136`  | (un evento que envía la placa)                                                                     | el motivo y los frames                                                                                                                        |

Un descriptor nombra un desplazamiento en bytes de la imagen de entradas o de salidas y un tipo: BOOL con su bit, INT o REAL. Los valores viajan igual en los dos sentidos: un mapa de bits con los valores BOOL, después cada INT en 2 bytes y cada REAL en 4 bytes (IEEE 754), en orden little endian. Una entrada enlaza como máximo 32 ranuras por dirección (`CONFIG_ZPLC_PLANT_MAX_SLOTS`, de 8 a 64). El firmware comprueba cada frame antes de cambiar una entrada: el CRC del frame, la sesión, el id de la entrada, la longitud exacta, los bits de relleno, que cada REAL sea un número finito y que la secuencia sea más nueva que la anterior.

TCP no está disponible para este modo. El firmware de Zephyr no tiene transporte TCP para el enlace del dispositivo; solo las pruebas del host muestran que el motor pide autenticación a un enlace de red antes de atender el modo.

## La latencia y el aviso de pulso

En cada intercambio ZPLC mide dos tiempos, sobre los últimos 200 intercambios:

- el **viaje de ida y vuelta**, desde que envía un frame hasta que lee su respuesta (el último valor, la mediana, el percentil 95 y el peor);
- el **intervalo**, entre dos respuestas seguidas (el último valor y el peor).

También muestra los conteos de tardíos y rechazados que informa la placa. Un conteo de tardíos que crece es normal cuando la placa cicla más rápido de lo que llegan los frames: es información, no un error.

Un pulso de sensor más corto que el intervalo entre dos frames puede caer entre ellos, y un ciclo de margen cubre la captura. ZPLC avisa mientras el modo corre cuando el peor intervalo más un ciclo es más largo que el pulso más corto de la escena: "El pulso más corto de esta escena es de {sceneMs} ms, pero el enlace puede dejar {worstGapMs} ms entre dos frames con un ciclo de {scanMs} ms. En esta conexión se puede perder un pulso." El indicador que mostrará estas cifras todavía no está montado en ZPLC.

La misma regla decide qué escenas pueden ofrecer la ruta de hardware: el pulso más corto debe ser al menos el peor intervalo más un ciclo en las dos placas del estudiante por USB serie, y solo cuenta una ejecución registrada en una placa en el banco. Cada escena incluida declara su pulso. Las cuatro plantas de 2.0 no declaran ninguno, así que ZPLC usa el pulso de sensor más corto de los escenarios calificados de sus lecciones, sin cambiar ningún escenario, hash ni calificación: 20 ms para el motor, 10 ms para la cinta, 20 ms para el tanque y 60 ms para el cruce peatonal. La tabla `specs/012-zplc-2-1-plant-simulation/evidence/plant-io-qualification.json` es provisional: se hace con la placa falsa de las pruebas, no con una placa, y no ofrece ninguna escena ni ninguna planta.

## Qué conectar

Para una escena, la placa solo necesita la conexión con ZPLC: un cable USB serie al computador. Las entradas que enlaza el mapa de la planta no necesitan nada en sus terminales, porque la planta las suministra. Las salidas se mantienen seguras, así que una lámpara o un relé conectado a una salida no sigue a la planta a menos que active el reflejo.

Ninguna lección ofrece hoy la ruta de hardware por el modo de E/S de planta. Toda lección de escena es solo de simulación y dice por qué. Cuando una lección la ofrezca, su página dirá qué conectar para esa lección, y una comprobación en la placa se rotulará como un resultado de hardware, como en la [ruta de hardware](../learn/hardware-track.md).

## Lo que no se afirma

Ninguna placa ha corrido este modo en una prueba registrada. Esta página no da tiempos, tasa de cuadros ni lista de placas para él. Cuando se registre una ejecución de hardware, esta página citará su archivo y el peor intervalo que midió.

## Consulte también

- [El editor de escenas](./scene-editor.md)
- [Las escenas incluidas](./scenes.md)
- [El reloj de la planta](./clock.md)
- [Ruta de hardware](../learn/hardware-track.md)
- [Pruebas del firmware](../development/firmware-testing.md#plant-io-mode)
