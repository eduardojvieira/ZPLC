## La máquina

Esta es una estación de clasificación. Ocho piezas, unas rojas y otras azules, avanzan por una cinta de entrada hasta un tope retráctil. Un sensor de color dice de qué color es la que está en el tope. Una roja se empuja hacia un lado sobre una cinta corta que termina en el contenedor rojo; una azul se deja pasar y sigue por la cinta de salida hasta el contenedor azul. Una planta real clasifica paquetes, botellas y piezas del mismo modo: lee una propiedad de cada pieza y la envía adonde corresponde.

![La escena de separación por color vista desde arriba y de frente, con el título "Colour separation". Una cinta de entrada larga va de izquierda a derecha bajo el sensor de parada, el sensor de color y el empujador, que están detrás de ella. Una segunda cinta, la de salida, continúa hacia la derecha y termina en un contenedor. Una cinta lateral corta sale de la de entrada hacia quien mira y termina en otro contenedor. El pulsador de inicio está en el extremo izquierdo de la cinta de entrada y la torre de luces junto al contenedor de la derecha. Cada elemento tiene una etiqueta con su nombre, su tipo y las variables conectadas a él.](images/machine.es.png)

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

Un sensor responde sobre lo que tiene delante ahora, y un programa solo puede actuar según esa respuesta cuando la pieza está lista. El sensor de parada pasa a TRUE en el instante en que una pieza entra en su haz, y en ese momento la pieza todavía se mueve. Por eso el programa espera primero a que el sensor se mantenga en TRUE un tiempo corto, lo que significa que la pieza ha quedado quieta, y solo entonces pregunta su color. Un bloque TON da esa espera.

Después el programa decide una vez. Los sensores no guardan la respuesta por usted: `IsRed` está en TRUE solo mientras una pieza roja está frente al sensor de color, y la pieza seguirá su camino. Lo que el programa decide hay que conservarlo, y el lugar habitual es un **número de paso**: una variable INT cuyo valor es, cada vez, un paso del trabajo. En Ladder cada paso tiene un peldaño propio que empieza con un bloque de comparación, `EQ`, que deja pasar la corriente solo mientras el número de paso tiene ese valor. Un bloque `MOVE` al final del peldaño escribe en la variable el número del paso siguiente cuando se cumple la condición del paso.

Un empuje es una secuencia de pasos, no un pulso. La placa se queda afuera mientras la salida esté en TRUE, y necesita tiempo para llegar. Por eso el programa mantiene la salida hasta que la entrada `Extended` dice que la placa está afuera, luego deja caer la salida y espera a `Retracted`. El programa no cuenta segundos para la placa; la placa informa dónde está.

## Ejemplo resuelto

Una línea de paquetes tiene un lector de etiquetas en un tope fijo. Un paquete llega hasta el tope y se queda allí; `AtStop` está en TRUE mientras esté. El lector solo es válido cuando el paquete está quieto, lo que esta estación toma como `AtStop` en TRUE durante `T#400ms`. Entonces `BadLabel` dice si la etiqueta es incorrecta. Un paquete con una etiqueta incorrecta se expulsa de la línea: una placa sale sobre la cinta hasta que `KickOut` está en TRUE, y luego vuelve hasta que `KickHome` está en TRUE. Un paquete con una etiqueta correcta lo retira un operario, así que la estación solo se ocupa de los incorrectos.

```ld-figure
src: reading/label-check.ld.json
caption: El número de paso Step tiene un peldaño para cada paso, escritos del último paso al primero
```

Léalo desde arriba. El peldaño 1 mide el tiempo del paquete: su TON cuenta mientras el programa está en el paso 0 y hay un paquete en el tope. El peldaño 4 es el paso 0: cuando `Still.Q` y `BadLabel` están en TRUE, `MOVE` escribe 1 en `Step`. Esa es la decisión, tomada una vez: ningún peldaño posterior lee `BadLabel`. El peldaño 5 acciona `Kick` mientras `Step` vale 1, así que la placa sale. El peldaño 3 es el paso 1: cuando `KickOut` está en TRUE escribe 2, `Kick` cae y la placa vuelve. El peldaño 2 es el paso 2: cuando `KickHome` está en TRUE escribe 0, y el programa queda listo para el paquete siguiente.

Los peldaños de los pasos están escritos del último paso al primero. El peldaño de un paso queda entonces por encima del peldaño que escribe su número y, como explica la lectura del ciclo de escaneo, un peldaño de más arriba ve el valor nuevo un ciclo de escaneo después. Así, cada ciclo de escaneo avanza el programa como máximo un paso.

Pruebe el programa. No tiene ninguna máquina detrás, así que la máquina la hace usted: ponga AtStop y BadLabel en ON, espere medio segundo y observe Kick; luego ponga KickOut en ON, KickHome en ON, y apague las cuatro.

```ld-try
src: reading/label-check.ld.json
inputs:
  - { name: AtStop, kind: switch }
  - { name: BadLabel, kind: switch }
  - { name: KickOut, kind: switch }
  - { name: KickHome, kind: switch }
outputs: [Kick]
timing: [AtStop, BadLabel, Kick, KickOut, KickHome]
caption: Haga de máquina, con un paquete en el tope y etiqueta incorrecta, luego la placa afuera, luego la placa de vuelta
```

Esta estación tiene una sola ruta y ningún conteo. La estación de la práctica tiene dos rutas, y qué debe esperar cada una queda para que usted lo decida a partir de los números de la máquina de arriba.

## Errores comunes

- Accionar las cintas directamente desde `Start`. El pulsador se mantiene solo de {{t:200}} a {{t:400}} ms, y una cinta se mueve solo mientras su variable está en TRUE. En una ejecución que lo hizo, ninguna de las ocho piezas salió del emisor.
- Preguntar `IsRed` otra vez después de que empezó el empuje. Una pieza empujada ha salido del sensor de color unos 0,75 s después de que `Push` pasa a TRUE, y para entonces `IsRed` vuelve a estar en FALSE.
- Poner `Push` en TRUE durante un solo ciclo de escaneo. La placa no se mueve: `Push` es un estado de la salida que la placa sigue, no un pulso. Manténgalo en TRUE hasta `Extended`.
- Volver a subir el tope antes de que haya bajado. Necesita unos 0,4 s para bajar; en una ejecución que lo subió otra vez a los 0,3 s, ninguna pieza llegó a un contenedor.

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
question: En los peldaños de LabelCheck, Step vale 1 y KickOut está en FALSE. ¿Cuánto vale Kick?
options:
  - { text: 'TRUE', correct: true, feedback: 'Correcto. El peldaño 5 acciona Kick mientras Step vale 1, y el peldaño 3 escribe 2 solo cuando KickOut está en TRUE.' }
  - { text: 'FALSE', feedback: 'El peldaño 5 deja pasar la corriente mientras Step vale 1, y la placa todavía no ha informado que está afuera.' }
  - { text: 'Depende de BadLabel', feedback: 'BadLabel lo lee solo el peldaño 4, en el paso 0. Cuando Step ha salido de 0, la decisión se conserva en Step.' }
```

```quiz
question: La placa tarda unos 1,45 s en llegar a Extended después de que Push pasa a TRUE. ¿Qué debe hacer el programa durante ese tiempo?
options:
  - { text: 'Mantener Push en TRUE hasta que Extended esté en TRUE', correct: true, feedback: 'Sí. La placa sigue a la salida, y Extended le dice al programa que la carrera terminó.' }
  - { text: 'Poner Push en TRUE durante un ciclo de escaneo y luego en FALSE', feedback: 'Un Push que dura un ciclo de escaneo no mueve la placa en esta máquina.' }
  - { text: 'Apagar Push después de 1 s fijo', feedback: 'A 1 s la placa todavía no está afuera. La máquina informa el fin de la carrera con Extended, así que el programa no necesita contar.' }
```

## Qué hará en la práctica

El proyecto inicial declara las entradas y las salidas de la estación y no tiene peldaños. Usted dibujará el programa de la estación: una pulsación del pulsador de inicio, que el escenario da a los {{t:200}} ms, pone en marcha las cintas; toda pieza roja termina en el contenedor rojo, toda pieza azul en el contenedor azul, no se cae ninguna y la lámpara verde se enciende tras la octava. Después pulse {{ui:learn.check}}.
