## La máquina

Esta es una línea de clasificación de cajas de tres alturas. Las cajas llegan por una cinta de entrada y pasan por dos haces de luz, uno encima del otro. Más adelante, una transferencia de cadenas detiene cada caja contra un tope y la envía: derecho, hacia la derecha o hacia la izquierda, a uno de tres contenedores. Las líneas de clasificación reales suelen medir una pieza mucho antes del lugar donde se la envía, así que lo que vio un sensor hay que llevarlo hasta donde se necesita.

![La escena de clasificación por altura vista desde arriba en perspectiva, con su título encima de la imagen y una leyenda debajo. Una cinta llega desde la izquierda y se encuentra con una transferencia de cadenas en el centro. Desde la transferencia, una cinta sigue hacia la derecha y otras dos cruzan la imagen, cada una terminada en un contenedor. Cada elemento tiene una etiqueta con su nombre, su tipo y su variable y señal del PLC, unida al elemento por una línea.](images/machine.es.png)

La línea tiene quince elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

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

Tres elementos no tienen variable. `Source1` suelta las cajas por su cuenta y los tres contenedores retiran lo que les llega, así que su programa nunca los arranca ni los detiene. Tampoco ve nunca una caja, solo lo que dicen los sensores sobre ella.

## Cómo se comporta la máquina

`Source1` suelta nueve cajas: la primera a los 5 s de la ejecución, más o menos, y luego una cada 5 s. Sus alturas son 0,20 m, 0,30 m y 0,40 m. En la ejecución del escenario, dos cajas miden 0,20 m, seis miden 0,30 m y una mide 0,40 m. `BeamLow` está a 0,25 m y `BeamHigh` a 0,35 m, así que una caja corta un haz solo si es más alta que el haz.

Los haces están mucho antes del tope. En la ejecución de la solución de referencia, la primera caja entra en `BeamLow` a los 7,6 s y permanece en él 0,8 s. A los 9,9 s, 2,3 s después de entrar en el haz, `EyeChain` la ve detenida contra el tope. Cada caja tarda unos 4,9 s en llegar de `Source1` al tope, y pasa por los haces unos 2,3 s antes de llegar a él.

```timing
span: 12000
signals:
  - { name: Low, edges: [7640, 8440] }
  - { name: AtBlade, edges: [9910, 12000] }
marks:
  - { from: 7640, to: 9910, label: '2.3 s' }
caption: La primera caja de una ejecución está 0,8 s en el haz bajo y queda detenida contra el tope 2,3 s después de entrar en el haz
```

El tope necesita unos 0,4 s para subir después de que `Hold` pasa a TRUE. Las cadenas necesitan unos 0,4 s para subir después de que `Lift` pasa a TRUE, y unos 0,4 s para bajar después de que pasa a FALSE. Con las cadenas abajo, `RunChain` lleva la caja hacia adelante. Con las cadenas arriba, `MoveRight` y `MoveLeft` la mueven de lado.

## Un sensor ve la caja solo mientras pasa

Un haz de luz está en TRUE solo mientras hay algo en él. La caja salió de los haces mucho antes de llegar al tope, así que en el tope los haces no dicen nada sobre ella. Pero el programa necesita la altura allí, para elegir la dirección.

Por eso el programa necesita una **memoria** para cada haz: una variable BOOL propia, no conectada a ningún elemento, que recuerda "este haz fue cortado". Una condición la activa: el haz pasa a TRUE. La memoria sigue en TRUE después de que el haz vuelve a FALSE, hasta que el programa la borra.

Dos memorias guardan tres respuestas: ningún haz fue cortado, solo el bajo, o los dos. Una memoria que se activa y no se borra nunca conserva la respuesta de una caja anterior, y todas las cajas que siguen se juzgan por esa respuesta. Cuándo borrarla es una decisión de la máquina, no del lenguaje.

## Ejemplo resuelto

Una balanza de paquetes en un depósito es un túnel corto que admite un paquete a la vez: una compuerta anterior deja entrar el siguiente solo después de que el ojo de salida vio salir al anterior. Dos haces en el túnel, `GaugeLow` y `GaugeHigh`, miden la altura de un paquete mientras pasa. Más adelante, en la salida, `ExitEye` ve el paquete y el programa debe elegir un carril: plano, estándar o voluminoso. El carril se necesita cuando el paquete está en la salida, y para entonces los haces vuelven a estar en FALSE.

```st
PROGRAM ParcelGauge
VAR_INPUT GaugeLow : BOOL; GaugeHigh : BOOL; ExitEye : BOOL; END_VAR
VAR_OUTPUT ToFlat : BOOL; ToStandard : BOOL; ToBulky : BOOL; END_VAR
VAR SawLow : BOOL; SawHigh : BOOL; Left : F_TRIG; END_VAR
IF GaugeLow THEN SawLow := TRUE; END_IF;
IF GaugeHigh THEN SawHigh := TRUE; END_IF;
ToBulky := ExitEye AND SawHigh;
ToStandard := ExitEye AND SawLow AND NOT SawHigh;
ToFlat := ExitEye AND NOT SawLow;
Left(CLK := ExitEye);
IF Left.Q THEN SawLow := FALSE; SawHigh := FALSE; END_IF;
END_PROGRAM
```

Léalo desde arriba. Los dos primeros IF activan una memoria cada vez que su haz es cortado. Un paquete que corta los dos haces activa las dos memorias, y uno que no corta ninguno no activa ninguna. En la salida, cada salida de carril mira `ExitEye` y las memorias. Un paquete voluminoso activó `SawHigh`. Uno estándar activó `SawLow` y no `SawHigh`, porque un paquete voluminoso también activa `SawLow`. Uno plano no activó ninguna. Las dos últimas líneas borran las dos memorias en el ciclo de escaneo en que `ExitEye` pasa de TRUE a FALSE, que es cuando el paquete ya salió. Entonces la compuerta deja entrar el siguiente paquete.

Esta balanza atiende un paquete a la vez y no tiene nada que elevar ni deslizar. La línea de la práctica no es una máquina de ese tipo: cuándo borrar allí las memorias queda para que usted lo decida a partir de lo que hacen las cajas en ella.

## Errores comunes

- Leer los haces en el tope. La caja los dejó mucho antes, así que en el tope no dicen nada sobre su altura.
- Activar una memoria y no borrarla nunca. La memoria conserva la respuesta de una caja anterior, y una caja corta que sigue a una alta se envía hacia el lado equivocado.
- Escribir la memoria como una copia del haz. Una copia vuelve a FALSE cuando el haz vuelve a FALSE, así que no recuerda nada.
- Olvidar declarar las memorias. Toda variable que usa el programa se declara, y una memoria del programa va en `VAR`.

> [!NOTE]
> Una caja que pasa rápido delante de un haz puede estar en él poco tiempo, y un programa que lo lee tarde no la ve. Aquí la caja está en el haz bajo 0,8 s, unos 80 ciclos de escaneo: el programa la ve, y lo que debe hacer es conservar lo que vio.

## Compruébelo usted

```quiz
question: ¿Por qué el programa de la línea por altura necesita una memoria para cada haz?
options:
  - { text: 'Porque un haz está en TRUE solo mientras la caja pasa, y el programa necesita la altura más tarde, en el tope', correct: true, feedback: 'Sí. La memoria conserva lo que mostró el haz después de que la caja pasó.' }
  - { text: 'Porque un haz necesita una memoria para ver la caja', feedback: 'Un haz está en TRUE siempre que una caja lo corta; no necesita nada del programa.' }
  - { text: 'Porque el tope no puede sostener una caja si los haces no la recuerdan', feedback: 'El tope lo acciona Hold. Los haces solo miden la altura.' }
```

```quiz
question: En la balanza de paquetes del ejemplo resuelto, un paquete corta GaugeLow pero nunca GaugeHigh, y luego ExitEye pasa a TRUE. ¿Qué salida de carril pasa a TRUE?
options:
  - { text: 'ToStandard', correct: true, feedback: 'Correcto. SawLow está en TRUE y SawHigh en FALSE, que es el carril estándar.' }
  - { text: 'ToFlat', feedback: 'ToFlat necesita que SawLow esté en FALSE, y este paquete la activó.' }
  - { text: 'ToBulky', feedback: 'ToBulky necesita SawHigh, y este paquete nunca cortó el haz alto.' }
```

## Qué hará en la práctica

El proyecto inicial declara las entradas y salidas de la línea y no acciona nada. Usted escribirá el programa de la línea: una pulsación del pulsador de inicio, que el escenario da a los {{t:200}} ms, hace avanzar las cintas, cada caja se clasifica por su altura en su propio contenedor, y la lámpara verde `Done` se enciende cuando las nueve cajas están atendidas, antes de que el escenario termine a los {{t:62000}} ms. Después pulse {{ui:learn.check}}.
