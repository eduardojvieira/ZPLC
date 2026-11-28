## La máquina

Esta es una clasificadora por altura. Cajas de tres alturas llegan una a una por la cinta de entrada, y dos haces de luz a través de la cinta miden cada caja cuando pasa. Luego un tope retráctil retiene la caja en la transferencia de cadenas, en medio de la línea, el programa decide, y la transferencia de cadenas deja que la caja siga de frente o la levanta y la envía hacia un lado. Las cajas bajas siguen de frente hasta un contenedor, las medianas van a un lado y las altas al otro.

![La escena de clasificación por altura con una transferencia de cadenas, vista de frente. Una cinta transportadora, Infeed, llega desde la izquierda hasta una transferencia de cadenas, Chain1, en el centro, con un tope retráctil, Stop1, a su lado. Desde la transferencia de cadenas una cinta sigue de frente hacia la derecha y otra sale hacia cada lado, y cada una de las tres cintas termina en un contenedor: BinShort, BinMedium y BinTall. Tres sensores difusos, BeamLow, BeamHigh y EyeChain, vigilan la línea. Source1 suelta las cajas, StartButton es un pulsador y Beacon es una torre de luces. Cada elemento tiene una etiqueta con su nombre, su tipo y las variables y señales conectadas, con una flecha para cada entrada y salida.](images/machine.es.png)

La estación tiene quince elementos. Las tablas dicen qué es cada uno en una planta real y qué significan sus señales para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                     | Qué es en una planta real                                                                                                             |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Cinta transportadora     | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Source1`     | Emisor de piezas         | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Chain1`      | Transferencia de cadenas | Un tramo de la línea cuyas cadenas suben entre los rodillos para mover una pieza de lado hacia otra línea.                            |
| `Straight`    | Cinta transportadora     | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `SideRight`   | Cinta transportadora     | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `SideLeft`    | Cinta transportadora     | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Stop1`       | Tope retráctil           | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `BeamLow`     | Sensor óptico difuso     | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `BeamHigh`    | Sensor óptico difuso     | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeChain`    | Sensor óptico difuso     | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `BinShort`    | Retirador de piezas      | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `BinMedium`   | Retirador de piezas      | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `BinTall`     | Retirador de piezas      | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton` | Pulsador                 | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `Beacon`      | Torre de luces           | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                                        |
| ---------------- | --------------------- | ---------------------- | ------------------------------------------------------------------ |
| `RunIn`          | `Infeed.run`          | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                        |
| —                | `Source1`             | —                      | No está cableado al PLC.                                           |
| `Raised`         | `Chain1.raised`       | Entrada del PLC · BOOL | TRUE cuando las cadenas están totalmente arriba.                   |
| `Lowered`        | `Chain1.lowered`      | Entrada del PLC · BOOL | TRUE cuando las cadenas están totalmente abajo.                    |
| `RunChain`       | `Chain1.run`          | Salida del PLC · BOOL  | TRUE mueve las piezas hacia adelante en la línea (cadenas abajo).  |
| `Lift`           | `Chain1.lift`         | Salida del PLC · BOOL  | TRUE sube las cadenas; FALSE las baja.                             |
| `MoveRight`      | `Chain1.moveRight`    | Salida del PLC · BOOL  | TRUE mueve las piezas de lado hacia la derecha (cadenas arriba).   |
| `MoveLeft`       | `Chain1.moveLeft`     | Salida del PLC · BOOL  | TRUE mueve las piezas de lado hacia la izquierda (cadenas arriba). |
| `RunStraight`    | `Straight.run`        | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                        |
| `RunRight`       | `SideRight.run`       | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                        |
| `RunLeft`        | `SideLeft.run`        | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                        |
| `Hold`           | `Stop1.extend`        | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.                  |
| `Low`            | `BeamLow.detect`      | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                             |
| `High`           | `BeamHigh.detect`     | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                             |
| `AtBlade`        | `EyeChain.detect`     | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                             |
| —                | `BinShort`            | —                      | No está cableado al PLC.                                           |
| —                | `BinMedium`           | —                      | No está cableado al PLC.                                           |
| —                | `BinTall`             | —                      | No está cableado al PLC.                                           |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.                  |
| `Busy`           | `Beacon.amber`        | Salida del PLC · BOOL  | TRUE enciende la lámpara ámbar.                                    |
| `Done`           | `Beacon.green`        | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                                    |

Dos de los tres sensores miden la caja. `BeamLow` mira a través de la cinta de entrada a 0,25 m sobre la cinta y `BeamHigh` a 0,35 m, así que una caja baja no interrumpe ninguno, una caja mediana interrumpe solo `BeamLow`, y una caja alta interrumpe los dos. El tercer sensor, `EyeChain`, ve una caja detenida en el tope.

`Source1` suelta una caja cada 5 s, hasta nueve cajas. En la ejecución del escenario de esta lección sin falla, las nueve llegan a un contenedor: dos bajas, seis medianas y una alta. Una caja mediana o alta interrumpe un haz durante 0,8 s al pasar.

## Un sensor que cuenta algo falso

Su programa nunca ve una caja. Ve lo que dicen sus sensores, y les cree: cuando `High` está en TRUE, la caja es alta. Eso funciona mientras los sensores dicen la verdad. Un sensor también puede atascarse: sigue leyendo TRUE sea lo que sea lo que tenga delante.

En el escenario de esta lección, la planta provoca la acción de falla `stuckOn` en `BeamHigh` a los 21 s. Desde entonces `High` está en TRUE para siempre, y cada caja que interrumpe `BeamLow` parece interrumpir también `BeamHigh`, así que parece alta.

```timing
span: 30000
signals:
  - { name: BeamLow, edges: [7640, 8440, 12640, 13440, 17640, 18440, 22640, 23440, 27640, 28440] }
  - { name: BeamHigh, edges: [17640, 18440, 21010] }
caption: 'BeamLow y BeamHigh en la ejecución: una caja interrumpe un haz durante 0,8 s, y desde los 21 s BeamHigh se queda encendido'
```

Un programa sin diagnóstico sigue clasificando y envía al contenedor de las altas las cajas que no lo son: en la ejecución del proyecto inicial, dos cajas que no son altas terminan en `BinTall`.

Para ver que algo anda mal, el programa necesita un hecho que pueda leer y que no encaje con la máquina. Un **diagnóstico** compara lo que dice un sensor con lo que la máquina le dice al programa sobre él. Cuando el programa lo sabe, también debe reaccionar, y la reacción tiene que ajustarse a la máquina: algunas partes pueden detenerse de inmediato, otras deben terminar lo que empezaron. Una falla se recuerda hasta que alguien la borra, para que no desaparezca sola y deje que la línea vuelva a arrancar.

## Ejemplo resuelto

Una puerta enrollable tiene dos finales de carrera: `IsOpen` está en TRUE cuando la puerta está del todo arriba e `IsClosed` cuando está del todo abajo. Una pulsación de `Raise` hace funcionar el motor hasta que la puerta está del todo arriba. Los dos finales de carrera nunca pueden estar en TRUE a la vez, así que si lo están, uno de ellos está atascado y el programa no puede saber cuál. En ese caso el motor debe detenerse y seguir detenido, y debe encenderse una alarma.

```st
PROGRAM RollerDoor
VAR_INPUT Raise : BOOL; IsOpen : BOOL; IsClosed : BOOL; END_VAR
VAR_OUTPUT Motor : BOOL; Alarm : BOOL; END_VAR
VAR DoorFault : BOOL; END_VAR
IF IsOpen AND IsClosed THEN DoorFault := TRUE; END_IF;
Motor := Raise AND NOT IsOpen AND NOT DoorFault;
Alarm := DoorFault;
END_PROGRAM
```

Léalo desde arriba. El primer IF encuentra el hecho: los dos finales de carrera en TRUE a la vez no puede ocurrir. Activa `DoorFault`, y nada en el programa lo borra nunca. El motor necesita `Raise`, una puerta que aún no está abierta y ninguna falla. Suponga que la puerta sube y los dos finales de carrera pasan a TRUE a la vez, y luego uno de ellos vuelve a FALSE. Sin la memoria, el motor arrancaría otra vez en cuanto `IsOpen` pasara a FALSE con `Raise` aún pulsado; con `DoorFault`, sigue detenido y `Alarm` sigue encendida.

Esta máquina tiene un hecho que basta un ciclo de escaneo para leer: dos finales de carrera que no pueden estar en TRUE a la vez. El haz de la clasificadora está encendido o apagado en cualquiera de los dos casos, así que un ciclo de escaneo no prueba nada. Qué prueba su falla, y con qué rapidez debe actuar el programa, debe decidirlo usted a partir de lo que la máquina le dice sobre sus cajas. La puerta además tiene un solo motor que detener; la clasificadora tiene varias partes, y cuáles detener también lo decide usted.

## Errores comunes

- Fiarse de un sensor para siempre. En la ejecución del proyecto inicial, dos cajas que no son altas terminan en `BinTall`.
- Decidir demasiado pronto. Un programa que decide antes de que una caja alta haya terminado de pasar por el haz detiene la línea con el sensor sano; en la ejecución, un programa así dejó la caja alta sin clasificar y el escenario falló.
- Decidir demasiado tarde. Un programa que espera demasiado deja que una caja se clasifique con la lectura falsa; en la ejecución, una caja fue al contenedor equivocado y el escenario falló.
- Detener todas las cintas. Una caja que ya va camino de su contenedor queda varada en una cinta detenida; en la ejecución de un programa que también detuvo las tres cintas de salida, la caja alta nunca llegó a `BinTall` y el escenario falló.

> [!NOTE]
> El escenario solo provoca un haz que se atasca en encendido. Un haz atascado en apagado, un atasco del módulo de cadenas o una caja que se cae necesitan otro hecho y otra reacción.

## Compruébelo usted

```quiz
question: 'En la puerta enrollable, los dos finales de carrera están en TRUE un instante y luego uno vuelve a FALSE. ¿Por qué necesita el programa del ejemplo la memoria DoorFault?'
options:
  - { text: 'Porque sin ella el motor arrancaría otra vez en cuanto la contradicción desapareciera', correct: true, feedback: 'Sí. Los finales de carrera pueden discrepar solo un momento, pero uno de ellos sigue atascado, así que el programa debe conservar lo que encontró.' }
  - { text: 'Porque una salida no puede depender de dos entradas a la vez', feedback: 'Una salida puede depender de cualquier número de entradas. El motor ya depende de Raise e IsOpen.' }
  - { text: 'Porque la alarma necesita una variable propia', feedback: 'Alarm podría copiar cualquier BOOL. La memoria está para recordar la falla, no para encender la lámpara.' }
```

```quiz
question: 'BeamHigh se ha atascado en encendido y el programa no tiene diagnóstico. Llega una caja mediana, que interrumpe solo BeamLow. ¿A dónde la envía la clasificadora?'
options:
  - { text: 'A BinTall, porque ve los dos haces interrumpidos', correct: true, feedback: 'Correcto. Una caja que interrumpe los dos haces es alta, y el haz atascado hace que toda caja que interrumpe BeamLow parezca alta.' }
  - { text: 'A BinMedium, porque solo interrumpió BeamLow', feedback: 'El programa no puede saber que la caja no interrumpió BeamHigh: el haz lee TRUE para toda caja.' }
  - { text: 'A BinShort, porque el haz está averiado', feedback: 'Una caja baja no interrumpe ninguno de los haces. El programa no tiene forma de enviar una caja a BinShort cuando ve BeamLow encendido.' }
```

## Qué hará en la práctica

El proyecto inicial ya clasifica las cajas, y se fía de `BeamHigh` para siempre. Usted añadirá un diagnóstico. El escenario pulsa Start a los {{t:200}} ms y provoca la acción de falla `stuckOn` en `BeamHigh` a los {{t:21000}} ms. Desde entonces la línea debe detenerse, y seguir detenida, antes de que el haz atascado envíe una caja al contenedor equivocado: la cinta de entrada y el módulo de cadenas apagados, el tope retráctil reteniendo, Busy apagado, y las cajas que ya van de camino llegando igual. Luego pulse {{ui:learn.check}}.
