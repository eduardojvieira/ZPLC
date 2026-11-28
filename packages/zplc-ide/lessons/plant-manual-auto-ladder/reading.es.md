## La máquina

Esta estación une dos piezas en una sola: una tapa llega por la cinta izquierda, una base llega por la cinta central, y un manipulador de dos ejes levanta la tapa con una ventosa y la coloca sobre la base. Una vez colocada la tapa, el tope retráctil de la cinta de bases se abre y el ensamble terminado sale por la cinta de salida hacia el retirador.

![La escena del ensamblador de dos ejes vista de frente. Tres cintas transportadoras están en línea de izquierda a derecha: LidBelt con LidEmitter, LidBlade y LidEye a la izquierda; BaseBelt con BaseEmitter, BaseBlade y BaseEye en el centro; y ExitBelt terminando en Remover1 a la derecha. Un bastidor manipulador de dos ejes, Pick1, une LidBelt y BaseBelt. StartButton está detrás de LidBelt y StackLight1 está junto a ExitBelt. Cada elemento tiene una etiqueta con su nombre, su tipo y sus señales conectadas.](images/machine.es.png)

La estación tiene trece elementos. Las tablas dicen qué es cada uno en una planta real y qué significan sus señales para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                    | Qué es en una planta real                                                                                                             |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `LidBelt`     | Cinta transportadora    | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `BaseBelt`    | Cinta transportadora    | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `ExitBelt`    | Cinta transportadora    | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `LidEmitter`  | Emisor de piezas        | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `BaseEmitter` | Emisor de piezas        | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `LidBlade`    | Tope retráctil          | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `BaseBlade`   | Tope retráctil          | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `LidEye`      | Sensor óptico difuso    | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `BaseEye`     | Sensor óptico difuso    | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Pick1`       | Manipulador de dos ejes | Una unidad de manipulación de dos ejes que toma una pieza con una pinza y la deja en otro lugar.                                      |
| `Remover1`    | Retirador de piezas     | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton` | Pulsador                | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `StackLight1` | Torre de luces          | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                                 |
| ---------------- | --------------------- | ---------------------- | ----------------------------------------------------------- |
| `RunLid`         | `LidBelt.run`         | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                 |
| `RunBase`        | `BaseBelt.run`        | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                 |
| `RunExit`        | `ExitBelt.run`        | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                 |
| `EmitLid`        | `LidEmitter.emit`     | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea.        |
| `EmitBase`       | `BaseEmitter.emit`    | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea.        |
| `HoldLid`        | `LidBlade.extend`     | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.           |
| `HoldBase`       | `BaseBlade.extend`    | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.           |
| `LidReady`       | `LidEye.detect`       | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                      |
| `BaseReady`      | `BaseEye.detect`      | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                      |
| `XAtMin`         | `Pick1.xAtMin`        | Entrada del PLC · BOOL | TRUE cuando el eje X está en su límite inicial.             |
| `XAtMax`         | `Pick1.xAtMax`        | Entrada del PLC · BOOL | TRUE cuando el eje X está en su límite final.               |
| `YAtMin`         | `Pick1.yAtMin`        | Entrada del PLC · BOOL | TRUE cuando el eje Y (vertical) está en su punto más bajo.  |
| `YAtMax`         | `Pick1.yAtMax`        | Entrada del PLC · BOOL | TRUE cuando el eje Y (vertical) está en su punto más alto.  |
| `Gripped`        | `Pick1.gripped`       | Entrada del PLC · BOOL | TRUE mientras la pinza sostiene una pieza.                  |
| `XPlus`          | `Pick1.xPlus`         | Salida del PLC · BOOL  | TRUE mueve el eje X hacia adelante mientras se mantiene.    |
| `XMinus`         | `Pick1.xMinus`        | Salida del PLC · BOOL  | TRUE mueve el eje X hacia atrás mientras se mantiene.       |
| `YPlus`          | `Pick1.yPlus`         | Salida del PLC · BOOL  | TRUE sube el eje Y mientras se mantiene.                    |
| `YMinus`         | `Pick1.yMinus`        | Salida del PLC · BOOL  | TRUE baja el eje Y mientras se mantiene.                    |
| `Grip`           | `Pick1.grip`          | Salida del PLC · BOOL  | TRUE cierra la pinza (vacío activado, o mordazas cerradas). |
| —                | `Remover1`            | —                      | No está cableado al PLC.                                    |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.           |
| `Green`          | `StackLight1.green`   | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                             |
| `Amber`          | `StackLight1.amber`   | Salida del PLC · BOOL  | TRUE enciende la lámpara ámbar.                             |

Observe cómo se gobierna `Pick1` en esta escena: cuatro salidas de dirección (`XPlus`, `XMinus`, `YPlus`, `YMinus`) mueven los ejes mientras están en TRUE, y cuatro finales de carrera (`XAtMin`, `XAtMax`, `YAtMin`, `YAtMax`) informan cuándo un eje llegó a cada extremo.

La estación de esta lección tiene cinco pulsadores más en su panel, que la imagen y las tablas de arriba no muestran. Igual que `StartButton`, cada uno está en TRUE solo mientras un dedo lo mantiene presionado. `ModeBtn` está conectado a `ModeButton.pressed`. Los cuatro pulsadores de avance son `JogXPlus` (hacia la cinta de bases), `JogXMinus` (hacia la cinta de tapas), `JogYPlus` (hacia arriba) y `JogYMinus` (hacia abajo), conectados a las señales `JogXPlus.pressed`, `JogXMinus.pressed`, `JogYPlus.pressed` y `JogYMinus.pressed`.

En la ejecución de la solución, los tres ensamblajes tardan unos 32 s, desde la pulsación de Start hasta la luz verde.

## Dos modos, dos clases de pulsación

Una máquina como esta trabaja sola en **automático**: el programa gobierna el ciclo, y una pulsación de Start lo comienza. Pero a veces un operario tiene que mover el brazo a mano, por ejemplo para ponerlo donde una persona pueda alcanzarlo. Para eso la máquina tiene un modo **manual**. Allí, un pulsador de **avance** mueve un eje solo mientras se mantiene presionado: el brazo se detiene cuando el dedo se levanta, y cuando el eje llega a su final de carrera.

Así, el mismo panel lleva dos clases de pulsación. Un avance es una pulsación que dura lo que dura el dedo. Un cambio de modo es una pulsación que debe contar una sola vez, por mucho que el dedo siga presionando. Un pulsador le da al programa la misma señal en los dos casos, así que el programa tiene que tratarlos de forma distinta.

## Una pulsación dura muchos ciclos de escaneo

El programa ejecuta un ciclo de escaneo cada 0,01 s en el escenario de esta lección, cien por segundo. Un dedo mantiene un pulsador una fracción de segundo: el escenario de esta lección mantiene el pulsador de modo 0,4 s, unos 40 ciclos de escaneo. Un peldaño con un contacto normal sobre el pulsador conduce en cada uno de ellos.

Un **flanco ascendente** es el ciclo de escaneo en el que una entrada acaba de pasar de FALSE a TRUE. Dura un ciclo de escaneo, por mucho que el pulsador siga presionado. En diagrama de escalera lo da un **contacto de flanco positivo** `(P)`: conduce durante el único ciclo de escaneo en que su variable sube, y no en los ciclos siguientes, mientras la variable sigue en TRUE.

```timing
span: 600
signals:
  - { name: Button, edges: [100, 500] }
  - { name: Edge, edges: [100, 110] }
caption: Una pulsación de 0,4 s dura unos 40 ciclos de escaneo; su flanco ascendente dura uno
```

Cuando algo debe ocurrir una vez por pulsación, hágalo depender del flanco. Cuando algo debe durar mientras se mantiene el pulsador, hágalo depender del propio pulsador.

## Ejemplo resuelto

Una máquina expendedora de tickets en la barrera de un estacionamiento tiene un pulsador `Take` y un sensor `Empty` que está en TRUE cuando se acabó el rollo. Una pulsación de `Take` debe soltar exactamente un ticket, por mucho que el conductor mantenga presionado el pulsador. Cuando el rollo está vacío, la pulsación no debe hacer nada. El programa además cuenta los tickets que soltó, en una variable local `Given`.

```ld-figure
src: reading/ticket-machine.ld.json
caption: El peldaño 1 suelta un ticket con el flanco ascendente de Take salvo que Empty esté activo, y el peldaño 2 lo cuenta
```

Léalo desde arriba. En el peldaño 1 el contacto de flanco positivo sobre `Take` conduce durante el único ciclo de escaneo en que `Take` sube, así que la bobina `Release` está en TRUE durante un ciclo, salvo que `Empty` abra el contacto normalmente cerrado. En el peldaño 2 un contacto sobre `Release` suma uno a `Given`, así que `Given` aumenta en uno por ticket.

```ld-try
src: reading/ticket-machine.ld.json
inputs:
  - { name: Take, kind: push }
  - { name: Empty, kind: switch }
outputs: [Release]
timing: [Take, Release]
caption: Mantenga Take un rato con Empty apagado, luego active Empty y pulse Take otra vez
```

Pulse Ejecutar, luego pulse y mantenga `Take` con `Empty` apagado: `Release` está en TRUE durante un solo ciclo de escaneo, por mucho que mantenga el pulsador. Active `Empty` y pulse `Take` otra vez: `Release` sigue en FALSE. En una ejecución de este ejemplo, una pulsación de 0,4 s con `Empty` en FALSE soltó un ticket, y una segunda pulsación con `Empty` en TRUE no soltó ninguno.

Esta máquina tiene un pulsador y un solo significado para él. La estación de la práctica tiene varios pulsadores y no todas las pulsaciones significan lo mismo, así que qué señal hace qué lo decide usted a partir de cómo debe comportarse la máquina.

## Errores comunes

- Gobernar con el nivel del pulsador un trabajo que debe ocurrir una vez. Si el peldaño 1 tuviera un contacto normal sobre `Take` en lugar del contacto de flanco positivo, `Release` estaría en TRUE en cada ciclo de escaneo de la pulsación, y en la ejecución una pulsación de 0,4 s contó al menos 39 tickets en vez de uno.
- Gobernar con el flanco un trabajo que debe durar mientras se mantiene el pulsador. El flanco dura un ciclo de escaneo, así que la bobina también estaría en TRUE un ciclo, no lo que dura el dedo.
- Dejar que Start actúe en todos los modos. En el proyecto inicial, una pulsación de Start con la máquina en manual arranca el ciclo de inmediato: en el escenario, cuando se pulsa Start a los 5,2 s, las cintas corren y se pone una tapa y una base en sus cintas.

> [!NOTE]
> Un modo manual real también limita la velocidad de un avance. Aquí el brazo se mueve siempre a la velocidad que da la escena, 0,4 m/s, así que la velocidad no forma parte de la práctica.

## Compruébelo usted

```quiz
question: 'En la máquina expendedora, Take se mantiene 0,4 s con Empty en FALSE. ¿Cuántos tickets cuenta Given?'
options:
  - { text: 'Uno', correct: true, feedback: 'Sí. El contacto de flanco conduce durante un ciclo de escaneo, así que Release está en TRUE una vez y Given aumenta en uno.' }
  - { text: 'Unos 40, uno por cada ciclo de escaneo de la pulsación', feedback: 'Eso ocurriría con un contacto normal sobre Take. El contacto de flanco conduce un solo ciclo de escaneo.' }
  - { text: 'Ninguno, porque Take nunca cambia', feedback: 'Take pasa de FALSE a TRUE cuando se pulsa. Ese cambio es el flanco ascendente.' }
```

```quiz
question: 'Tras el primer ticket, el rollo se acaba y Empty pasa a TRUE. El conductor pulsa Take otra vez. ¿Qué ocurre?'
options:
  - { text: 'Release sigue en FALSE y Given sigue en 1', correct: true, feedback: 'Correcto. El flanco existe, pero el contacto normalmente cerrado sobre Empty, ya abierto, mantiene Release en FALSE.' }
  - { text: 'Release está en TRUE durante un ciclo y Given pasa a 2', feedback: 'Empty está en TRUE, así que su contacto normalmente cerrado está abierto y Release sigue en FALSE incluso en el ciclo del flanco.' }
  - { text: 'Release se queda en TRUE mientras se mantiene el pulsador', feedback: 'Release nunca sigue al pulsador. Sigue al flanco, y Empty también lo bloquea.' }
```

## Qué hará en la práctica

El proyecto inicial ya tiene los peldaños del ciclo de ensamblaje automático, y ningún modo. Usted dibujará los peldaños de uno. La máquina arranca en manual, y cada pulsación del pulsador de modo cambia entre manual y automático. En manual, los pulsadores de avance mueven el brazo y Start no hace nada; en automático, el ciclo corre y los pulsadores de avance no hacen nada. El escenario pulsa el pulsador de modo a los {{t:13200}} ms, arranca el ciclo a los {{t:13800}} ms, mantiene un pulsador de avance en mitad del ciclo y vuelve a pulsar el pulsador de modo a los {{t:54000}} ms. Luego pulse {{ui:learn.check}}.
