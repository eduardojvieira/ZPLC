## La máquina

Esta es una estación de clasificación. Ocho piezas, unas rojas y otras azules, avanzan por una cinta de entrada hasta un tope retráctil. Un sensor de color dice de qué color es la que está en el tope. Una roja se empuja hacia un lado sobre una cinta corta que termina en el contenedor rojo; una azul se deja pasar y sigue por la cinta de salida hasta el contenedor azul. Una planta real clasifica paquetes, botellas y piezas del mismo modo: lee una propiedad de cada pieza y la envía adonde corresponde.

![La escena de separación por color vista desde arriba y de frente, con el título "Separación por color". Una cinta de entrada larga va de izquierda a derecha bajo el sensor de parada, el sensor de color y el empujador, que están detrás de ella. Una segunda cinta, la de salida, continúa hacia la derecha y termina en un contenedor. Una cinta lateral corta sale de la de entrada hacia quien mira y termina en otro contenedor. El pulsador de inicio está en el extremo izquierdo de la cinta de entrada y la torre de luces junto al contenedor de la derecha. Cada elemento tiene una etiqueta con su nombre, su tipo y las variables conectadas a él.](images/machine.es.png)

La estación tiene doce elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Outfeed`     | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `SideBelt`    | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Source1`     | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Stop1`       | Tope retráctil       | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `EyeStop`     | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Colour1`     | Sensor de color      | Un sensor óptico al que se le enseña un color: indica si el objeto que tiene delante es de ese color.                                 |
| `Pusher1`     | Empujador            | Un cilindro neumático con una placa que empuja una pieza hacia un lado de la cinta.                                                   |
| `RedBin`      | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `BlueBin`     | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `Beacon`      | Torre de luces       | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                              |
| ---------------- | --------------------- | ---------------------- | -------------------------------------------------------- |
| `RunIn`          | `Infeed.run`          | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                              |
| `RunOut`         | `Outfeed.run`         | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                              |
| `RunSide`        | `SideBelt.run`        | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                              |
| —                | `Source1`             | —                      | No está cableado al PLC.                                 |
| `Hold`           | `Stop1.extend`        | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.        |
| `Waiting`        | `EyeStop.detect`      | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                   |
| `IsRed`          | `Colour1.match`       | Entrada del PLC · BOOL | TRUE mientras el objeto del haz tiene el color enseñado. |
| `Extended`       | `Pusher1.extended`    | Entrada del PLC · BOOL | TRUE cuando la placa está totalmente afuera.             |
| `Retracted`      | `Pusher1.retracted`   | Entrada del PLC · BOOL | TRUE cuando la placa está totalmente retraída.           |
| `Push`           | `Pusher1.extend`      | Salida del PLC · BOOL  | TRUE saca la placa sobre la cinta; FALSE la retrae.      |
| —                | `RedBin`              | —                      | No está cableado al PLC.                                 |
| —                | `BlueBin`             | —                      | No está cableado al PLC.                                 |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.        |
| `Busy`           | `Beacon.amber`        | Salida del PLC · BOOL  | TRUE enciende la lámpara ámbar.                          |
| `Done`           | `Beacon.green`        | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                          |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. Su programa solo ve las doce variables, nunca la pieza misma: conoce una pieza solo a través de `Waiting` y `IsRed`. El emisor y los dos contenedores no están conectados: el emisor suelta una pieza por sí solo, y un contenedor retira lo que llega a él.

Los números siguientes salen de una ejecución de un programa que clasifica las ocho piezas en esta máquina. Son correctos con una aproximación de un ciclo de escaneo ({{t:10}} ms).

- Una pieza sale del emisor cada 4 s, y una cinta se mueve solo mientras su variable (`RunIn`, `RunOut` o `RunSide`) está en TRUE. En el escenario la primera pieza llega al sensor de color 7,5 s después de que empieza la ejecución, y las demás siguen cada 4 s. En orden de llegada son azul, roja, azul, azul, azul, roja, azul, azul.
- El sensor de color ve una pieza unos 0,2 s antes que el sensor de parada. `IsRed` está en TRUE solo mientras una pieza roja está frente al sensor de color; para una pieza azul sigue en FALSE.
- El tope necesita unos 0,4 s para subir o bajar después de que `Hold` cambia. Una pieza que el tope deja pasar sigue en el haz del sensor de parada unos 0,6 s después de que `Hold` pasa a FALSE.
- La placa está totalmente afuera unos 1,45 s después de que `Push` pasa a TRUE, y totalmente retraída unos 1,46 s después de que `Push` pasa a FALSE desde ese punto. Un `Push` que dura un ciclo de escaneo no mueve la placa. Una pieza empujada ha salido del haz del sensor de parada unos 0,75 s después de que `Push` pasa a TRUE.

## Leer una vez, cuando la pieza está quieta

Un sensor responde sobre lo que tiene delante ahora, y un programa solo puede actuar según esa respuesta cuando la pieza está lista. El sensor de parada pasa a TRUE en el instante en que una pieza entra en su haz, y en ese momento la pieza todavía se mueve. Por eso el programa espera primero a que el sensor se mantenga en TRUE un tiempo corto, lo que significa que la pieza ha quedado quieta, y solo entonces pregunta su color. Un temporizador TON da esa espera.

Después el programa decide una vez. Los sensores no guardan la respuesta por usted: `IsRed` está en TRUE solo mientras una pieza roja está frente al sensor de color, y la pieza seguirá su camino. Lo que el programa decide hay que conservarlo, y el lugar habitual es un **número de paso**: una variable INT cuyo valor es, cada vez, un paso del trabajo.

En lista de instrucciones un paso es un **bloque** de líneas. El bloque empieza con `LD Step` y `EQ n`, que dejan TRUE en el resultado actual cuando el programa está en el paso n, añade con `AND` la condición que abandona el paso, y luego `JMPCN` salta a una etiqueta al final del bloque cuando el resultado es FALSE. Las líneas entre el `JMPCN` y su etiqueta se ejecutan solo cuando se cumplen el paso y su condición; escriben el número del paso siguiente.

Un empuje es una secuencia de pasos, no un pulso. La placa se queda afuera mientras la salida esté en TRUE, y necesita tiempo para llegar. Por eso el programa mantiene la salida hasta que la entrada `Extended` dice que la placa está afuera, luego deja caer la salida y espera a `Retracted`. El programa no cuenta segundos para la placa; la placa informa dónde está.

## Ejemplo resuelto

Una línea de paquetes tiene un lector de etiquetas en un tope fijo. Un paquete llega hasta el tope y se queda allí; `AtStop` está en TRUE mientras esté. El lector solo es válido cuando el paquete está quieto, lo que esta estación toma como `AtStop` en TRUE durante `T#400ms`. Entonces `BadLabel` dice si la etiqueta es incorrecta. Un paquete con una etiqueta incorrecta se expulsa de la línea: una placa sale sobre la cinta hasta que `KickOut` está en TRUE, y luego vuelve hasta que `KickHome` está en TRUE. Un paquete con una etiqueta correcta lo retira un operario, así que la estación solo se ocupa de los incorrectos.

```il
PROGRAM LabelCheck
VAR_INPUT
    AtStop : BOOL;
    BadLabel : BOOL;
    KickOut : BOOL;
    KickHome : BOOL;
END_VAR
VAR_OUTPUT
    Kick : BOOL;
END_VAR
VAR
    Step : INT;
    Still : TON;
    Gate : BOOL;
END_VAR

        LD    Step
        EQ    0
        AND   AtStop
        ST    Gate
        CAL   Still(IN := Gate, PT := T#400ms)

        LD    Step
        EQ    0
        AND   Still.Q
        AND   BadLabel
        JMPCN not0
        LD    1
        ST    Step
not0:
        LD    Step
        EQ    1
        AND   KickOut
        JMPCN not1
        LD    2
        ST    Step
not1:
        LD    Step
        EQ    2
        AND   KickHome
        JMPCN not2
        LD    0
        ST    Step
not2:
        LD    Step
        EQ    1
        ST    Kick
END_PROGRAM
```

Léalo desde arriba. `CAL` toma variables, así que la condición del temporizador se guarda antes en `Gate`: el TON cuenta mientras el programa está en el paso 0 y hay un paquete en el tope, y se llama en cada ciclo de escaneo. El primer bloque es el paso 0: cuando `Still.Q` y `BadLabel` están en TRUE guarda 1 en `Step`. Esa es la decisión, tomada una vez: ningún bloque posterior lee `BadLabel`. El bloque del paso 1 guarda 2 cuando `KickOut` está en TRUE, y el bloque del paso 2 guarda 0 cuando `KickHome` está en TRUE. Las últimas líneas escriben `Kick`: `LD Step`, `EQ 1` y `ST Kick` lo dejan en TRUE solo en el paso 1, así que la placa sale, y cae cuando el programa abandona el paso 1.

Los bloques están en el orden de los pasos, y las líneas se ejecutan de arriba abajo, así que un bloque ve el `Step` que los bloques de más arriba acaban de escribir. Cuando el programa entra en el paso 1 en el bloque 0, el bloque del paso 1 se ejecuta en el mismo ciclo de escaneo; encuentra `KickOut` en FALSE y no hace nada, porque la placa todavía no se ha movido.

Esta estación tiene una sola ruta y ningún conteo. La estación de la práctica tiene dos rutas, y qué debe esperar cada una queda para que usted lo decida a partir de los números de la máquina de arriba.

## Errores comunes

- Accionar las cintas directamente desde `Start`. El pulsador se mantiene solo de {{t:200}} a {{t:400}} ms, y una cinta se mueve solo mientras su variable está en TRUE. En una ejecución que lo hizo, ninguna de las ocho piezas salió del emisor.
- Preguntar `IsRed` otra vez después de que empezó el empuje. Una pieza empujada ha salido del sensor de color unos 0,75 s después de que `Push` pasa a TRUE, y para entonces `IsRed` vuelve a estar en FALSE.
- Poner `Push` en TRUE durante un solo ciclo de escaneo. La placa no se mueve: `Push` es un estado de la salida que la placa sigue, no un pulso. Manténgalo en TRUE hasta `Extended`.
- Volver a subir el tope antes de que haya bajado. Necesita unos 0,4 s para bajar; en una ejecución que lo subió otra vez a los 0,3 s, ninguna pieza llegó a un contenedor.
- Poner una condición en la llamada de un temporizador, como en `CAL Still(IN := Step = 0, ...)`. `CAL` toma una variable: calcule antes la condición con `LD` y `ST` en una BOOL.

> [!NOTE]
> El escenario califica lo que llega a los contenedores y lo que muestran las lámparas. No ve qué color leyó su programa, solo dónde terminó cada pieza.

## Compruébelo usted

```quiz
question: ¿Por qué el programa espera a que el sensor de parada esté en TRUE un tiempo corto antes de leer el color?
options:
  - { text: 'Porque el sensor pasa a TRUE cuando la pieza entra en el haz, mientras todavía se mueve', correct: true, feedback: 'Sí. La espera corta deja que la pieza quede quieta antes de que el programa actúe sobre ella.' }
  - { text: 'Porque IsRed está en FALSE hasta que el sensor de parada lleva un tiempo en TRUE', feedback: 'No. En esta máquina el sensor de color ve una pieza unos 0,2 s antes que el sensor de parada, así que IsRed ya está en TRUE cuando el sensor de parada se activa.' }
  - { text: 'Porque un TON no puede empezar a contar antes de que el sensor lleve un tiempo en TRUE', feedback: 'Un TON empieza a contar en cuanto su entrada está en TRUE. La espera es una decisión del diseño, para que la pieza se asiente.' }
```

```quiz
question: En LabelCheck, Step vale 1 y KickOut está en FALSE. ¿Qué guarda en Kick el último bloque del programa, LD Step, EQ 1, ST Kick?
options:
  - { text: 'TRUE', correct: true, feedback: 'Correcto. EQ 1 deja TRUE en el resultado actual mientras Step vale 1, y ST lo guarda en Kick.' }
  - { text: 'FALSE', feedback: 'El resultado de EQ 1 es TRUE mientras Step vale 1. KickOut solo decide cuándo el programa abandona el paso 1.' }
  - { text: 'Nada: el bloque se salta', feedback: 'Solo se saltan los bloques que tienen un JMPCN. Este no lo tiene, así que se ejecuta en cada ciclo de escaneo.' }
```

```quiz
question: La placa tarda unos 1,45 s en llegar a Extended después de que Push pasa a TRUE. ¿Qué debe hacer el programa durante ese tiempo?
options:
  - { text: 'Mantener Push en TRUE hasta que Extended esté en TRUE', correct: true, feedback: 'Sí. La placa sigue a la salida, y Extended le dice al programa que la carrera terminó.' }
  - { text: 'Poner Push en TRUE durante un ciclo de escaneo y luego en FALSE', feedback: 'Un Push que dura un ciclo de escaneo no mueve la placa en esta máquina.' }
  - { text: 'Apagar Push después de 1 s fijo', feedback: 'A 1 s la placa todavía no está afuera. La máquina informa el fin de la carrera con Extended, así que el programa no necesita contar.' }
```

## Qué hará en la práctica

El proyecto inicial memoriza `Start` y hace girar la cinta de entrada, y nada más. Usted escribirá el programa de la estación: una pulsación del pulsador de inicio, que el escenario da a los {{t:200}} ms, pone en marcha las cintas; toda pieza roja termina en el contenedor rojo, toda pieza azul en el contenedor azul, no se cae ninguna y la lámpara verde se enciende tras la octava. Después pulse {{ui:learn.check}}.
