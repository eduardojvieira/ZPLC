## La máquina

Esta estación clasifica cajas por altura y es la primera máquina de su escena en el curso. Cajas de tres alturas llegan de a una por una cinta de entrada. Una cortina de luz junto a la cinta mide cada caja al pasar, y un tope retráctil retiene la caja delante de una mesa giratoria. La mesa gira la caja hacia una de tres cintas de salida, de frente, a la derecha o a la izquierda, y cada cinta termina en un contenedor de su propia clase: baja, media o alta. Las líneas reales dividen un flujo de mercancía en varios de la misma manera, según una propiedad que un sensor puede medir.

![La escena de clasificación por altura vista desde arriba en ángulo. Una cinta de entrada va desde la izquierda hasta una mesa giratoria cuadrada en el centro, con la cortina de luz sobre un poste junto a ella, cerca del extremo izquierdo de la cinta. Tres cintas salen de la mesa, una de frente hacia la derecha, otra hacia el observador y otra alejándose de él, y cada una termina en un contenedor. Marcas cian en las esquinas del extremo izquierdo de la cinta de entrada muestran dónde el emisor pone una caja. Cada elemento tiene una etiqueta con su nombre, su tipo y las variables conectadas a él.](images/machine.es.png)

Las tablas dicen qué es cada elemento en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento | Tipo | Qué es en una planta real |
| --- | --- | --- |
| `Infeed` | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Source1` | Emisor de piezas | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza. |
| `LightArray1` | Cortina de luz | Una cortina de luz: una columna de haces que cruza la línea y mide qué altura tiene un objeto. |
| `Stop1` | Tope retráctil | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar. |
| `EyeStop` | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante. |
| `Table1` | Mesa giratoria | Una plataforma giratoria que orienta una pieza hacia una de varias líneas. |
| `EyeTable` | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante. |
| `OutCentre` | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `OutRight` | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `OutLeft` | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `BinShort` | Retirador de piezas | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario. |
| `BinMedium` | Retirador de piezas | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario. |
| `BinTall` | Retirador de piezas | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario. |
| `StartButton` | Pulsador | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene. |
| `Beacon` | Torre de luces | Una torre de lámparas de colores que muestra a distancia qué hace la máquina. |

| Variable del PLC | Señal | Dirección y tipo | Significado |
| --- | --- | --- | --- |
| `RunIn` | `Infeed.run` | Salida del PLC · BOOL | TRUE hace avanzar la cinta. |
| — | `Source1` | — | No está cableado al PLC. |
| `ArrayBusy` | `LightArray1.detect` | Entrada del PLC · BOOL | TRUE mientras algún haz está cortado. |
| `HeightCm` | `LightArray1.height` | Entrada del PLC · REAL, 0 a 60 = 0 a 0.6 m | La altura de la parte superior de la pieza en la cortina; 0 cuando ningún haz está cortado. |
| `Hold` | `Stop1.extend` | Salida del PLC · BOOL | TRUE eleva el tope sobre la cinta; FALSE lo baja. |
| `AtBlade` | `EyeStop.detect` | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz. |
| `AtCentre` | `Table1.atCentre` | Entrada del PLC · BOOL | TRUE cuando la plataforma apunta a la línea central. |
| `AtLeft` | `Table1.atLeft` | Entrada del PLC · BOOL | TRUE cuando la plataforma apunta a la línea izquierda. |
| `AtRight` | `Table1.atRight` | Entrada del PLC · BOOL | TRUE cuando la plataforma apunta a la línea derecha. |
| `RunTable` | `Table1.run` | Salida del PLC · BOOL | TRUE hace avanzar la superficie de la plataforma. |
| `ToLeft` | `Table1.toLeft` | Salida del PLC · BOOL | TRUE gira la plataforma hacia la línea izquierda; sin ninguna de las dos órdenes vuelve al centro. |
| `ToRight` | `Table1.toRight` | Salida del PLC · BOOL | TRUE gira la plataforma hacia la línea derecha; sin ninguna de las dos órdenes vuelve al centro. |
| `OnTable` | `EyeTable.detect` | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz. |
| `RunCentre` | `OutCentre.run` | Salida del PLC · BOOL | TRUE hace avanzar la cinta. |
| `RunRight` | `OutRight.run` | Salida del PLC · BOOL | TRUE hace avanzar la cinta. |
| `RunLeft` | `OutLeft.run` | Salida del PLC · BOOL | TRUE hace avanzar la cinta. |
| — | `BinShort` | — | No está cableado al PLC. |
| — | `BinMedium` | — | No está cableado al PLC. |
| — | `BinTall` | — | No está cableado al PLC. |
| `Start` | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado. |
| `Busy` | `Beacon.amber` | Salida del PLC · BOOL | TRUE enciende la lámpara ámbar. |
| `Done` | `Beacon.green` | Salida del PLC · BOOL | TRUE enciende la lámpara verde. |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. El emisor y los tres contenedores no están cableados: su programa nunca ve una caja si no es a través de los sensores, y solo el escenario cuenta las cajas que llegan a cada contenedor. El escenario suelta siete cajas, una cada 8.5 segundos: una de 20 cm, cinco de 30 cm y una de 40 cm.

## Una lectura no es una altura

La cortina de luz informa la altura de la parte superior de lo que haya en ella, y 0 cuando no hay nada. Así, `HeightCm` vale 0 antes de una caja, la altura de la caja mientras está en la cortina, y 0 otra vez después. Una caja está en la cortina durante 0.8 segundos, unos 80 ciclos de escaneo. En una cortina real, una caja áspera o inclinada da una lectura que cambia mientras pasa, así que el programa conserva el valor más alto que vio. Ese valor es el **máximo**.

El máximo es también lo único que el programa puede usar después. La caja sale de la cortina y la lectura vuelve a 0, pero la caja todavía no está en la mesa: en una ejecución de la solución de la lección, una caja sale de la cortina a los 10.3 segundos y está sobre la mesa a los 13.8 segundos. La respuesta debe guardarse en una variable del programa hasta que la caja la necesite.

```timing
span: 8000
signals:
  - { name: Busy, edges: [1000, 3000] }
  - { name: TooHigh, edges: [3000, 8000] }
caption: Un palé cruza la cortina, y la respuesta existe desde el momento en que sale
```

## Ejemplo resuelto

Un muelle de recepción mueve palés sobre una vía de rodillos a través de una cortina de luz. `Busy` está en TRUE mientras hay un palé en la cortina y `Height` es la altura de la parte superior del palé en centímetros. El carril de la estantería alta admite palés de hasta 180 cm, así que un palé más alto debe ir al carril manual. `TooHigh` debe indicarlo en cuanto el palé haya salido de la cortina, y seguir indicándolo hasta que haya salido el palé siguiente:

```st
PROGRAM DockGate
VAR_INPUT Busy : BOOL; Height : REAL; END_VAR
VAR_OUTPUT TooHigh : BOOL; END_VAR
VAR
    Top   : REAL;
    Enter : R_TRIG;
    Leave : F_TRIG;
END_VAR
Enter(CLK := Busy);
Leave(CLK := Busy);
IF Enter.Q THEN Top := 0.0; END_IF;
IF Busy AND Height > Top THEN Top := Height; END_IF;
IF Leave.Q THEN TooHigh := Top > 180.0; END_IF;
END_PROGRAM
```

Léalo desde arriba. `Enter.Q` está en TRUE durante un ciclo cuando un palé entra en la cortina, y borra `Top` para que el último palé no cuente para este. El segundo IF conserva el `Height` más alto mientras `Busy` está en TRUE. `Leave.Q` está en TRUE durante un ciclo cuando el palé ya se fue, y ese es el momento en que `Top` es definitivo, así que el programa lo compara con el límite ahí y no antes. Después `TooHigh` guarda la respuesta, aunque `Height` vuelva a ser 0.

Esta máquina tiene un palé a la vez y un solo sí o no. La estación de la práctica tiene tres clases de caja y una mesa giratoria que debe girar para la caja; cuántas clases distingue el programa y qué hace la mesa con cada una queda para que usted lo decida a partir de lo que debe pasarle a la caja.

## Errores comunes

- Leer `HeightCm` cuando la caja espera en el tope. La cortina ya está vacía y lee 0. En una ejecución de la solución de la lección con este cambio, las siete cajas fueron al contenedor bajo y seis de ellas quedaron mal encaminadas.
- No borrar nunca el máximo. Una caja de 40 cm deja el máximo en 40, así que las cajas siguientes parecen igual de altas. En una ejecución con este cambio, las cuatro cajas posteriores a la alta fueron al contenedor alto y quedaron mal encaminadas.
- Tomar una lectura de 0 por una caja baja. 0 significa que no hay caja en la cortina.
- Decidir mientras la caja todavía está en la cortina. El máximo es definitivo solo cuando la cortina vuelve a quedar vacía.

## Compruébelo usted

```quiz
question: ¿Por qué el programa no puede simplemente leer HeightCm cuando la caja espera en el tope?
options:
  - { text: 'Porque la cortina ya está vacía y lee 0', correct: true, feedback: 'Sí. La lectura existe solo mientras la caja está en la cortina, así que la respuesta debe guardarse desde entonces.' }
  - { text: 'Porque HeightCm cambia solo mientras gira la mesa', feedback: 'HeightCm viene de la cortina de luz y no tiene nada que ver con la mesa.' }
  - { text: 'Porque una entrada solo se puede leer una vez por caja', feedback: 'Una entrada se lee en cada ciclo. Lo que ya no está es el valor: la cortina lee 0 cuando no hay caja.' }
```

```quiz
question: En el muelle, un palé de 190 cm sale de la cortina y luego cruza uno de 120 cm. Se quita el borrado de Top en Enter.Q. ¿Cuánto vale Top cuando el palé de 120 cm ha salido?
options:
  - { text: '190', correct: true, feedback: 'Correcto. Height nunca supera 190, así que el segundo IF conserva el valor anterior y TooHigh queda en TRUE para un palé que sí cabe.' }
  - { text: '120', feedback: 'Esa es la altura del palé, pero Top cambia solo cuando Height es mayor que él, y 190 es mayor.' }
  - { text: '0', feedback: 'Top vuelve a 0 solo con el borrado que se quitó. Que Height lea 0 después del palé no lo borra.' }
```

## Qué hará en la práctica

El proyecto inicial declara las entradas y las salidas de la estación y no acciona nada. Usted escribirá el programa de la estación: una pulsación del pulsador de inicio, que el escenario da a los {{t:200}} ms, pone en marcha la línea, y las siete cajas deben salir por la cinta de su clase, las bajas por la cinta central, las medias a la derecha y las altas a la izquierda, sin que ninguna caiga. La lámpara verde debe estar encendida al final, a los {{t:77000}} ms. Después pulse {{ui:learn.check}}.
