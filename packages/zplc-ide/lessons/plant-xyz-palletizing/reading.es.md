## La máquina

Un pórtico paletizador de tres ejes toma cajas individuales de una cinta de alimentación con una ventosa y las coloca en una cuadrícula X–Y–Z programada sobre una tarima. A diferencia de un paletizador de capas que mueve cuatro cajas a la vez, un pórtico coloca una caja por vez en cualquier coordenada dentro de su marco, de modo que cambiar el patrón de apilado es un cambio en el programa y no en la mecánica.

![La escena de paletizado de tres ejes vista de frente. A la izquierda, una cinta transportadora con una marca cian de emisor, un pulsador de inicio, un tope retráctil y un sensor óptico difuso alimenta cajas bajo un gran pórtico rectangular. Dentro del pórtico, un cabezal vertical azul con ventosa se mueve en X, Y y Z sobre una tarima de madera a la derecha, con una torre de luces detrás de la tarima. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

La estación tiene ocho elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Belt1`       | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Emitter1`    | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Blade1`      | Tope retráctil       | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `EyePick`     | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Gantry1`     | Pórtico de tres ejes | Un robot de manipulación de tres ejes sobre un pórtico, que mueve una pinza en X, Y y Z.                                              |
| `Pallet1`     | Tarima               | Una tarima de madera que lleva una carga por la planta y hasta un camión.                                                             |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `StackLight1` | Torre de luces       | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo                            | Significado                                                 |
| ---------------- | --------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| `RunBelt`        | `Belt1.run`           | Salida del PLC · BOOL                       | TRUE hace avanzar la cinta.                                 |
| `Emit`           | `Emitter1.emit`       | Salida del PLC · BOOL                       | Cada flanco ascendente suelta una pieza en la línea.        |
| `Hold`           | `Blade1.extend`       | Salida del PLC · BOOL                       | TRUE eleva el tope sobre la cinta; FALSE lo baja.           |
| `EyePick`        | `EyePick.detect`      | Entrada del PLC · BOOL                      | TRUE mientras hay un objeto en el haz.                      |
| `XCmd`           | `Gantry1.xSet`        | Salida del PLC · INT, 0 a 1000 = 0 a 1.6 m  | La posición a la que debe ir el eje X.                      |
| `YCmd`           | `Gantry1.ySet`        | Salida del PLC · INT, 0 a 1000 = 0 a 1.2 m  | La posición a la que debe ir el eje Y.                      |
| `ZCmd`           | `Gantry1.zSet`        | Salida del PLC · INT, 0 a 1000 = 0 a 1.2 m  | La posición a la que debe ir el eje Z.                      |
| `XPos`           | `Gantry1.xPos`        | Entrada del PLC · INT, 0 a 1000 = 0 a 1.6 m | Dónde está ahora el eje X.                                  |
| `YPos`           | `Gantry1.yPos`        | Entrada del PLC · INT, 0 a 1000 = 0 a 1.2 m | Dónde está ahora el eje Y.                                  |
| `ZPos`           | `Gantry1.zPos`        | Entrada del PLC · INT, 0 a 1000 = 0 a 1.2 m | Dónde está ahora el eje Z.                                  |
| `Grip`           | `Gantry1.grip`        | Salida del PLC · BOOL                       | TRUE cierra la pinza (vacío activado, o mordazas cerradas). |
| `Gripped`        | `Gantry1.gripped`     | Entrada del PLC · BOOL                      | TRUE mientras la pinza sostiene una pieza.                  |
| —                | `Pallet1`             | —                                           | No está cableado al PLC.                                    |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL                      | TRUE mientras el pulsador se mantiene presionado.           |
| `Green`          | `StackLight1.green`   | Salida del PLC · BOOL                       | TRUE enciende la lámpara verde.                             |
| `Amber`          | `StackLight1.amber`   | Salida del PLC · BOOL                       | TRUE enciende la lámpara ámbar.                             |

Aquí cada eje es numérico: usted escribe un destino en cuentas enteras (`0` a `1000`) y lee de vuelta la posición actual en la misma escala. No hacen falta desplazamientos temporizados.

## Posiciones numéricas, bandas de tolerancia y aritmética de patrón

Gobernar un pórtico numérico a través de una pila repetida se apoya en tres ideas:

- **Escalar metros a cuentas.** Cuando una carrera de `S` metros se asigna a `0..1000`, una posición `p` en metros pasa a ser `round(p / S * 1000)` cuentas. Por ejemplo, en un eje de `2.0 m`, `1.0 m` son `500` cuentas; en un eje de `1.6 m`, una cuenta equivale a `1.6 mm`.
- **Llegada dentro de una banda.** Un accionamiento real puede quedar a una o dos cuentas de su orden. En lugar de probar igualdad exacta (`Pos = Cmd`), compare cada eje contra una banda estrecha (`Pos >= Cmd - tol AND Pos <= Cmd + tol`), combine todos los ejes en un solo BOOL y haga que cada estado con movimiento lo espere.
- **Un solo contador para todo el patrón.** En vez de escribir pasos distintos para cada pieza, mantenga un contador de piezas `n` que empiece en cero. El resto `n MOD huecosPorCapa` elige el hueco dentro de la capa actual, y `n / huecosPorCapa` (o una comparación con `huecosPorCapa`) elige la altura de la capa.

```timing
span: 6000
signals:
  - { name: Grip, edges: [3310, 5420] }
  - { name: Gripped, edges: [3310, 5420] }
caption: En la primera caja de una ejecución, Grip está encendido de 3.3 s a 5.4 s y Gripped lo sigue en uno o dos ciclos de escaneo, porque una ventosa agarra y suelta casi al instante
```

Moverse en vertical antes de desplazarse en horizontal mantiene la pieza libre de la cinta y de las cajas ya apiladas sobre la tarima.

## Ejemplo resuelto

Una empacadora de bandejas de dos ejes carga seis latas en una caja con dos capas de tres latas en fila. Su eje X recorre `2.0 m` (`0..1000` cuentas) y su eje Y recorre `1.0 m` (`0..1000` cuentas). Las latas van separadas `200` cuentas en X a partir de `300`, la capa `0` se apoya en `Y = 200` y la capa `1` queda `180` cuentas más arriba.

Un solo contador `Count` (`0` a `5`) calcula tanto el hueco como la capa, y `AtTarget` comprueba ambos ejes con un margen de `±2` cuentas:

```st
PROGRAM TrayLoader
VAR_INPUT
    PosX    : INT;
    PosY    : INT;
    RunAuto : BOOL;
END_VAR
VAR_OUTPUT
    SetX : INT;
    SetY : INT;
    Done : BOOL;
END_VAR
VAR
    State    : INT;
    Count    : INT;
    SlotIdx  : INT;
    LayerIdx : INT;
    AtTarget : BOOL;
END_VAR

SlotIdx  := Count MOD 3;
LayerIdx := Count / 3;
AtTarget := PosX >= SetX - 2 AND PosX <= SetX + 2
        AND PosY >= SetY - 2 AND PosY <= SetY + 2;

CASE State OF
    0:
        IF RunAuto THEN
            SetY  := 850;
            State := 1;
        END_IF;
    1:
        IF AtTarget THEN
            SetX  := 300 + SlotIdx * 200;
            State := 2;
        END_IF;
    2:
        IF AtTarget THEN
            SetY  := 200 + LayerIdx * 180;
            State := 3;
        END_IF;
    3:
        IF AtTarget THEN
            Count := Count + 1;
            SetY  := 850;
            State := 4;
        END_IF;
    4:
        IF AtTarget THEN
            IF Count >= 6 THEN
                State := 5;
            ELSE
                SetX  := 0;
                State := 1;
            END_IF;
        END_IF;
END_CASE;

Done := State = 5;
END_PROGRAM
```

Observe el orden de movimientos: `State 0` eleva Y hasta la altura segura de traslado (`850`) antes de que X se mueva, `State 1` viaja en horizontal al hueco calculado, `State 2` baja a la altura de la capa y `State 3` vuelve a elevar Y antes de regresar X a `0`.

Esta empacadora tiene solo dos ejes, coloca tres latas en línea por capa y no tiene cinta, tope retráctil ni ventosa. En la práctica, el pórtico se mueve en tres ejes (X, Y y Z) sobre una cuadrícula de 2 por 2, toma cada caja retenida en el tope retráctil de una cinta en marcha y espera tiempos breves de asentamiento y liberación.

## Errores comunes

- Probar igualdad exacta `XPos = XCmd`. Aquí pasa, porque el eje simulado se detiene exactamente en su orden, pero un accionamiento real queda a una o dos cuentas y el paso espera para siempre.
- Desplazarse en X o Z por debajo de la altura segura. La caja transportada golpea la primera capa y derriba cajas, y Check falla por una caja caída.
- Apagar `Grip` antes de que el pórtico llegue a la altura de descarga. La caja cae desde arriba y cuenta como pieza caída.

> [!NOTE]
> Elija la altura segura de traslado de modo que la base de una caja transportada pase por encima de la parte superior de la capa más alta sobre la tarima.

## Compruébelo usted

```quiz
question: En una empacadora de bandejas que coloca 3 piezas por capa, Count empieza en 0. Para Count = 4, ¿cuánto valen SlotIdx = Count MOD 3 y LayerIdx = Count / 3?
options:
  - { text: 'Hueco 1, capa 1', correct: true, feedback: 'Sí. 4 dividido por 3 da 1 con resto 1, así que la pieza 4 es el segundo hueco de la segunda capa.' }
  - { text: 'Hueco 2, capa 1', feedback: 'El resto de dividir 4 por 3 es 1, no 2; el hueco 2 corresponde a Count = 5.' }
  - { text: 'Hueco 1, capa 0', feedback: 'La capa 0 contiene Count = 0, 1 y 2; en Count = 4 la empacadora ya está en la capa 1.' }
```

```quiz
question: ¿Por qué una secuencia de ejes numéricos comprueba una banda pequeña de tolerancia alrededor de la orden en lugar de Pos = Cmd?
options:
  - { text: 'Porque un eje real puede quedar a una cuenta de su orden, lo que trabaría una igualdad exacta', correct: true, feedback: 'Correcto. Una banda estrecha como ±1 cuenta deja avanzar el paso de forma confiable sin perder precisión.' }
  - { text: 'Porque Texto Estructurado no admite = con variables INT', feedback: 'Texto Estructurado admite = con INT; la banda hace falta por cómo se redondean las posiciones físicas a cuentas enteras.' }
  - { text: 'Porque el pórtico se mueve más rápido cuando se usa una banda de tolerancia', feedback: 'La banda de tolerancia solo decide cuándo el PLC da por terminado el movimiento, no la velocidad del eje.' }
```

## Qué hará en la práctica

El proyecto inicial en `src/Palletizing.st` declara las posiciones y órdenes de los tres ejes, y las señales de la cinta, el tope, la ventosa y las lámparas, y todavía no ordena ninguna posición. Al pulsar `Start`, que el escenario acciona a los {{t:200}} ms, usted elevará el pórtico fuera de la cinta, tomará cada caja junto al tope, colocará ocho cajas en un patrón de 2 por 2 de dos capas sobre `Pallet1` y encenderá `Green` tras la octava. Después pulse {{ui:learn.check}}.
