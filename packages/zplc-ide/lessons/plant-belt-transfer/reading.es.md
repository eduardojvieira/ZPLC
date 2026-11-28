## La máquina

Esta estación traslada cajas a través de un espacio entre dos cintas transportadoras. Las cajas llegan por la cinta de entrada a la izquierda, donde un tope retráctil elevado detiene cada caja debajo de un manipulador de dos ejes. El manipulador baja una pinza, agarra la caja, la eleva, la lleva hasta la cinta de salida a la derecha y la deposita para que la cinta de salida la lleve al contenedor de retiro. Las líneas reales de embalaje y ensamblaje usan estaciones como esta cuando un producto debe cruzar un pasillo, cambiar de altura o pasar de una línea a otra.

![La escena de traslado entre cintas vista de frente. A la izquierda, una cinta de entrada sobre patas tiene cuatro marcas cian en las esquinas donde Source1 coloca las cajas, el pulsador StartButton detrás de su extremo izquierdo, un tope retráctil Stop1 cerca de su extremo derecho y un sensor óptico difuso EyePick mirando a través de la cinta. Cruzando el espacio entre ambas cintas se levanta Pick1, un pórtico de dos ejes con carro vertical y pinza. A la derecha, una cinta de salida lleva las cajas frente al sensor EyeOut y la torre de luces Beacon hasta el contenedor Remover1. Cada elemento lleva una etiqueta con su nombre, su tipo y sus señales conectadas.](images/machine.es.png)

La estación tiene diez elementos. Las tablas dicen qué es cada uno en una planta real y qué significan sus señales para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                    | Qué es en una planta real                                                                                                             |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Cinta transportadora    | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Outfeed`     | Cinta transportadora    | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Source1`     | Emisor de piezas        | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Stop1`       | Tope retráctil          | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `EyePick`     | Sensor óptico difuso    | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeOut`      | Sensor óptico difuso    | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Pick1`       | Manipulador de dos ejes | Una unidad de manipulación de dos ejes que toma una pieza con una pinza y la deja en otro lugar.                                      |
| `Remover1`    | Retirador de piezas     | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton` | Pulsador                | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `Beacon`      | Torre de luces          | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                                 |
| ---------------- | --------------------- | ---------------------- | ----------------------------------------------------------- |
| `RunIn`          | `Infeed.run`          | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                 |
| `RunOut`         | `Outfeed.run`         | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                 |
| `Emit`           | `Source1.emit`        | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea.        |
| `Hold`           | `Stop1.extend`        | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.           |
| `Waiting`        | `EyePick.detect`      | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                      |
| `OutEye`         | `EyeOut.detect`       | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                      |
| `XMin`           | `Pick1.xAtMin`        | Entrada del PLC · BOOL | TRUE cuando el eje X está en su límite inicial.             |
| `XMax`           | `Pick1.xAtMax`        | Entrada del PLC · BOOL | TRUE cuando el eje X está en su límite final.               |
| `YMin`           | `Pick1.yAtMin`        | Entrada del PLC · BOOL | TRUE cuando el eje Y (vertical) está en su punto más bajo.  |
| `YMax`           | `Pick1.yAtMax`        | Entrada del PLC · BOOL | TRUE cuando el eje Y (vertical) está en su punto más alto.  |
| `Gripped`        | `Pick1.gripped`       | Entrada del PLC · BOOL | TRUE mientras la pinza sostiene una pieza.                  |
| `XPlus`          | `Pick1.xPlus`         | Salida del PLC · BOOL  | TRUE mueve el eje X hacia adelante mientras se mantiene.    |
| `XMinus`         | `Pick1.xMinus`        | Salida del PLC · BOOL  | TRUE mueve el eje X hacia atrás mientras se mantiene.       |
| `YPlus`          | `Pick1.yPlus`         | Salida del PLC · BOOL  | TRUE sube el eje Y mientras se mantiene.                    |
| `YMinus`         | `Pick1.yMinus`        | Salida del PLC · BOOL  | TRUE baja el eje Y mientras se mantiene.                    |
| `Grip`           | `Pick1.grip`          | Salida del PLC · BOOL  | TRUE cierra la pinza (vacío activado, o mordazas cerradas). |
| —                | `Remover1`            | —                      | No está cableado al PLC.                                    |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.           |
| `Busy`           | `Beacon.amber`        | Salida del PLC · BOOL  | TRUE enciende la lámpara ámbar.                             |
| `Done`           | `Beacon.green`        | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                             |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. Su programa nunca ve una caja directamente: solo sabe lo que informan los sensores ópticos, los finales de carrera de los ejes y la señal de agarre.

## Un estado por movimiento, guiado por la realimentación

Un manipulador no puede trabajar a ciegas ni solo con retardos fijos. Un eje tarda tiempo en recorrer su carrera y una pinza tarda tiempo en cerrarse sobre una pieza. Si el programa empieza a elevar antes de que la pinza confirme que sostiene la pieza, la pieza se queda atrás. En una máquina real, desplazarse en horizontal antes de que el eje vertical llegue a su límite superior lleva la pieza contra el tope o la cinta; esta escena no modela ese choque, así que solo su secuencia mantiene la pinza arriba al cruzar.

La forma limpia de coordinar movimientos es una **máquina de estados**: una variable `INT` guarda el número de estado actual y cada movimiento tiene su propio estado. Un bloque `CASE` evalúa solo la transición que sale del estado actual, esperando la señal de realimentación de ese movimiento — un final de carrera, una confirmación de agarre o un temporizador — antes de avanzar al estado siguiente.

```timing
span: 6000
signals:
  - { name: Lock, edges: [500, 5000] }
  - { name: Locked, edges: [900, 5400] }
  - { name: GoDown, edges: [900, 2000] }
  - { name: Bottom, edges: [2000, 4100] }
  - { name: GoUp, edges: [4000, 5000] }
  - { name: Top, edges: [0, 1000, 5000, 6000] }
marks:
  - { from: 2000, to: 4000, label: Soak }
caption: Cada movimiento empieza solo cuando la realimentación anterior se activa, y se detiene en cuanto llega su propio límite
```

Conviene calcular las salidas en un solo lugar debajo del bloque `CASE`, directamente a partir del número de estado y los finales de carrera. Así cada salida se escribe en cada ciclo de escaneo: vale TRUE en los estados que la necesitan y FALSE en todos los demás, sin borrados olvidados.

## Ejemplo resuelto

Una estación de tratamiento térmico sumerge piezas metálicas en un tanque de temple con un polipasto de un solo eje. Cuando una pieza cuelga del gancho (`PartReady`) y el polipasto está arriba (`Top`), el programa cierra el pestillo del gancho (`Lock`) y espera `Locked`. Solo entonces baja el polipasto (`GoDown`) hasta que `Bottom` se activa, sumerge la pieza durante dos segundos (`Soak`), vuelve a elevar hasta `Top` y abre el pestillo. El calentador del tanque (`HeaterOn`) funciona solo mientras el polipasto está en reposo arriba, nunca mientras una pieza se mueve o está sumergida.

```st
PROGRAM DipHoist
VAR_INPUT
    PartReady : BOOL;
    Locked    : BOOL;
    Bottom    : BOOL;
    Top       : BOOL;
END_VAR
VAR_OUTPUT
    Lock     : BOOL;
    GoDown   : BOOL;
    GoUp     : BOOL;
    HeaterOn : BOOL;
END_VAR
VAR
    Step : INT;
    Soak : TON;
END_VAR

Soak(IN := Step = 3, PT := T#2s);

CASE Step OF
    0:
        IF PartReady AND Top THEN
            Step := 1;
        END_IF;
    1:
        IF Locked THEN
            Step := 2;
        END_IF;
    2:
        IF Bottom THEN
            Step := 3;
        END_IF;
    3:
        IF Soak.Q THEN
            Step := 4;
        END_IF;
    4:
        IF Top THEN
            Step := 5;
        END_IF;
    5:
        IF NOT Locked THEN
            Step := 0;
        END_IF;
END_CASE;

Lock     := Step >= 1 AND Step <= 4;
GoDown   := Step = 2 AND NOT Bottom;
GoUp     := Step = 4 AND NOT Top;
HeaterOn := Step = 0;
END_PROGRAM
```

Léalo desde arriba. `Soak` se llama en cada ciclo de escaneo, fuera del `CASE`, con `IN := Step = 3`, así que solo temporiza mientras el polipasto está en el estado de inmersión y se reinicia solo en cuanto `Step` deja de valer 3. Dentro del `CASE`, cada estado espera una confirmación: `Locked` antes de bajar, `Bottom` antes de sumergir, `Soak.Q` antes de elevar, `Top` antes de abrir el pestillo y `NOT Locked` antes de volver al reposo. Debajo del `CASE`, `Lock` se mantiene activo desde el estado 1 hasta el 4, cada orden de eje se detiene en cuanto se activa su final de carrera (`AND NOT Bottom`, `AND NOT Top`) y `HeaterOn` permanece apagado en todos los estados activos.

Este polipasto tiene un solo eje vertical y sumerge una pieza por arranque. La estación de la práctica tiene dos ejes, dos cintas, un tope retráctil y un lote de cuatro cajas: cuándo dejar que una caja se asiente, cuándo alimentar la siguiente caja y cómo contar las cuatro cajas son decisiones que quedan para usted.

## Errores comunes

- Elevar antes de que la señal de agarre esté en TRUE. Activar `Grip` empieza a cerrar la pinza; espere `Gripped` antes de ordenar `YPlus`, o la caja quedará atrás.
- Mover en horizontal mientras la pinza sigue abajo. Espere siempre `YMax` antes de cruzar entre las dos cintas.
- Dejar en marcha la cinta receptora mientras se deposita una caja. Una cinta en movimiento se lleva la caja antes de que se asiente; la escena la cuenta como caída.
- Asignar salidas solo dentro de una rama del `CASE`. Una variable conserva su valor anterior en los ciclos siguientes si ninguna otra instrucción la borra; calcule cada salida a partir del estado debajo del `CASE`.
- Llamar un temporizador `TON` dentro de una rama del `CASE`. Un temporizador que solo se llama en un estado deja de actualizarse al cambiar de estado y puede no reiniciarse nunca; llame cada temporizador sin condición en cada ciclo de escaneo y controle su entrada `IN` con el estado.

> [!NOTE]
> Una orden de eje como `XPlus` o `YMinus` mueve el carro solo mientras la salida está en TRUE. Protegerla con `AND NOT XMax` o `AND NOT YMin` garantiza que la orden caiga en el mismo ciclo de escaneo en que se activa el final de carrera.

## Compruébelo usted

```quiz
question: ¿Por qué el polipasto espera Locked en el estado 1 antes de pasar al estado 2?
options:
  - { text: 'Porque cerrar el pestillo tarda tiempo, y bajar antes de Locked podría soltar la pieza', correct: true, feedback: 'Sí. La orden y la confirmación son dos señales distintas; el movimiento siguiente espera la realimentación.' }
  - { text: 'Porque un PLC no puede activar Lock y GoDown en el mismo programa', feedback: 'Un PLC puede accionar varias salidas a la vez. La secuencia espera para que el pestillo mecánico esté cerrado antes de mover el polipasto.' }
  - { text: 'Porque Locked es una salida del PLC que debe escribirse primero', feedback: 'Locked es una entrada del PLC proveniente del sensor del pestillo, no una salida.' }
```

```quiz
question: En el polipasto del ejemplo resuelto, GoDown se escribe como Step = 2 AND NOT Bottom. ¿Qué ocurre en el ciclo de escaneo en que Bottom pasa a TRUE?
options:
  - { text: 'Step cambia a 3 y GoDown pasa a FALSE en ese mismo ciclo de escaneo', correct: true, feedback: 'Correcto. El CASE avanza Step a 3, y la línea de salida debajo evalúa a FALSE de inmediato.' }
  - { text: 'GoDown sigue en TRUE un ciclo de escaneo extra hasta que Step llega a 4', feedback: 'Como las asignaciones de salida están debajo del CASE, ven el nuevo valor de Step y Bottom de inmediato.' }
  - { text: 'Soak termina de inmediato porque Bottom está en TRUE', feedback: 'Soak solo empieza a contar cuando Step pasa a 3; todavía espera dos segundos antes de que Soak.Q pase a TRUE.' }
```

## Qué hará en la práctica

El programa inicial en `src/BeltTransfer.st` declara todas las entradas y salidas de la estación y no acciona nada. El escenario acciona `Start` a los {{t:200}} ms y lo suelta a los {{t:400}} ms. Usted escribirá la máquina de estados que alimenta cuatro cajas de una en una, detiene cada una en el tope, la toma y la deja sobre la cinta de salida detenida, enciende `Busy` mientras corre el traslado y enciende `Done` cuando la cuarta caja cruza `EyeOut`. Guarde el archivo y pulse {{ui:learn.check}}.
