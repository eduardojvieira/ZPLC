## La máquina

Esta es una línea que sube cajas por tres niveles. El emisor pone una caja en la cinta de entrada, abajo, el elevador A la sube al segundo nivel, una cinta de transferencia la lleva al otro lado, el elevador B la sube al tercer nivel, y la cinta de salida la lleva a un contenedor. En el escenario de esta lección el emisor suelta cinco cajas, una cada 10 s desde el segundo 10. El pulsador de inicio y el paro de emergencia están en el extremo izquierdo de la línea. La torre de luces tiene dos lámparas que su programa acciona: verde cuando las cinco cajas llegaron arriba, roja cuando la línea está detenida.

![La escena de los elevadores de tres niveles vista de frente, con etiquetas. De izquierda a derecha: la cinta de entrada con el emisor, el pulsador de inicio y el paro de emergencia en su extremo izquierdo, el elevador A con una torre de luces al lado, una cinta de transferencia, el elevador B, y la cinta de salida sobre una estructura alta que termina en un contenedor. Cada etiqueta da el nombre y el tipo de un elemento y la variable de su programa conectada a sus señales, con una flecha para una entrada o una salida.](images/machine.es.png)

La línea tiene trece elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Source1`     | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `LiftA`       | Elevador             | Un transportador vertical que lleva una pieza entre pisos o niveles de una línea.                                                     |
| `Transfer`    | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `LiftB`       | Elevador             | Un transportador vertical que lleva una pieza entre pisos o niveles de una línea.                                                     |
| `Outfeed`     | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `TopBin`      | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `EyeFoot`     | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeMid`      | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeTop`      | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `EStop1`      | Paro de emergencia   | El pulsador rojo tipo hongo que detiene la máquina; queda hundido hasta que alguien lo gira para liberarlo.                           |
| `StackLight1` | Torre de luces       | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                                                                                                  |
| ---------------- | --------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `RunInfeed`      | `Infeed.run`          | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                                                                                  |
| —                | `Source1`             | —                      | No está cableado al PLC.                                                                                                     |
| `AAtLow`         | `LiftA.atLevel1`      | Entrada del PLC · BOOL | TRUE cuando la plataforma está detenida en el nivel 1.                                                                       |
| `AAtHigh`        | `LiftA.atLevel2`      | Entrada del PLC · BOOL | TRUE cuando la plataforma está detenida en el nivel 2.                                                                       |
| `AUp`            | `LiftA.up`            | Salida del PLC · BOOL  | TRUE sube la plataforma.                                                                                                     |
| `ADown`          | `LiftA.down`          | Salida del PLC · BOOL  | TRUE baja la plataforma.                                                                                                     |
| `ARun`           | `LiftA.run`           | Salida del PLC · BOOL  | TRUE hace avanzar la cinta de la plataforma.                                                                                 |
| `RunTransfer`    | `Transfer.run`        | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                                                                                  |
| `BAtLow`         | `LiftB.atLevel1`      | Entrada del PLC · BOOL | TRUE cuando la plataforma está detenida en el nivel 1.                                                                       |
| `BAtHigh`        | `LiftB.atLevel2`      | Entrada del PLC · BOOL | TRUE cuando la plataforma está detenida en el nivel 2.                                                                       |
| `BUp`            | `LiftB.up`            | Salida del PLC · BOOL  | TRUE sube la plataforma.                                                                                                     |
| `BDown`          | `LiftB.down`          | Salida del PLC · BOOL  | TRUE baja la plataforma.                                                                                                     |
| `BRun`           | `LiftB.run`           | Salida del PLC · BOOL  | TRUE hace avanzar la cinta de la plataforma.                                                                                 |
| `RunOutfeed`     | `Outfeed.run`         | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                                                                                  |
| —                | `TopBin`              | —                      | No está cableado al PLC.                                                                                                     |
| `BoxOnA`         | `EyeFoot.detect`      | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                                                                                       |
| `BoxOnB`         | `EyeMid.detect`       | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                                                                                       |
| `BoxAtTop`       | `EyeTop.detect`       | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                                                                                       |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.                                                                            |
| `EStopOk`        | `EStop1.ok`           | Entrada del PLC · BOOL | TRUE mientras el pulsador está liberado (su contacto normalmente cerrado); FALSE si está presionado o su cable está cortado. |
| `Green`          | `StackLight1.green`   | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                                                                                              |
| `Red`            | `StackLight1.red`     | Salida del PLC · BOOL  | TRUE enciende la lámpara roja.                                                                                               |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. El emisor y el contenedor no están conectados al PLC: la escena los deja funcionar solos. El escenario, no su programa, pulsa y suelta el paro de emergencia.

## Un paro no termina al soltar el pulsador

Un pulsador de paro de emergencia queda hundido hasta que alguien lo gira para liberarlo. Su señal, `EStopOk`, está en TRUE mientras el pulsador está liberado y en FALSE cuando está presionado o su cable está cortado. Así, un cable roto detiene la línea igual que una pulsación, y el programa lee "paro" como `EStopOk` en FALSE.

Soltar el pulsador solo dice que la causa del paro ya no está. No dice que alguien quiera que la línea funcione otra vez, y una línea que se mueve sola cuando se gira el pulsador es peligrosa para la persona que sigue trabajando en ella. Por eso, tras un paro la línea espera una pulsación deliberada de `Start`, y la lámpara roja sigue encendida hasta entonces.

Eso exige una **memoria** del paro: una variable BOOL del programa, no conectada a ningún elemento. `EStopOk` vuelve a TRUE al soltar, así que no puede ser esa memoria; algo que el programa guarde debe decir "la línea estuvo detenida" después de soltar el pulsador.

```timing
span: 20000
signals:
  - { name: Start, edges: [200, 400, 17500, 17700] }
  - { name: EStop1, edges: [15500, 17000] }
  - { name: Red, edges: [15500, 17500] }
  - { name: RunOutfeed, edges: [200, 15500, 17500] }
caption: El escenario pone la línea en marcha, pulsa el paro de emergencia (EStop1 está alta mientras está pulsado), lo suelta y pulsa Start; Red sigue encendida desde la pulsación hasta Start
```

El diagrama es lo que hace un programa correcto en el escenario, según una ejecución de la solución sobre la planta de esta lección. La cinta de salida sigue a la línea: funciona tras la primera pulsación de `Start`, cae en el ciclo de escaneo de la pulsación del paro, sigue apagada tras soltarlo y vuelve a funcionar tras la segunda pulsación. Cada tiempo es el del escenario, con un ciclo de escaneo de diferencia como mucho.

La máquina no se detiene de golpe. En esa ejecución el elevador A, que llevaba la primera caja y llevaba subiendo cerca de medio segundo, todavía subió unos 0,1 m después de que cayera su salida de subir, y luego quedó quieto hasta el reinicio. La caja no se cayó: la ejecución entregó las cinco cajas al contenedor y no dejó caer ninguna. El escenario no mide ese avance; comprueba las salidas.

## Ejemplo resuelto

Un compresor de aire pequeño tiene un motor `Motor`, un presostato `Demand` que está en TRUE mientras el depósito pide aire, y dos interruptores de temperatura. `TooHot` está en TRUE mientras el motor está demasiado caliente. `CoolEnough` pasa a TRUE cuando el motor se ha enfriado. Cuando el motor está demasiado caliente debe detenerse, y debe seguir apagado después de que `TooHot` vuelva a FALSE, hasta que se haya enfriado lo suficiente. Sin una memoria arrancaría de nuevo en cuanto `TooHot` vuelva a FALSE.

```st
PROGRAM Compressor
VAR_INPUT Demand : BOOL; TooHot : BOOL; CoolEnough : BOOL; END_VAR
VAR_OUTPUT Motor : BOOL; END_VAR
VAR Cooling : BOOL; END_VAR
IF TooHot THEN Cooling := TRUE; END_IF;
IF CoolEnough THEN Cooling := FALSE; END_IF;
Motor := Demand AND NOT Cooling;
END_PROGRAM
```

Léalo desde arriba. El primer IF activa la memoria `Cooling` cuando el motor está demasiado caliente. El segundo IF la borra cuando el motor se ha enfriado lo suficiente. La última línea deja funcionar el motor solo si hay demanda y solo mientras la memoria está en FALSE. En una ejecución nativa, `Motor` está en TRUE cuando `Demand` se activa, cae cuando `TooHot` se activa, sigue en FALSE cuando `TooHot` se desactiva otra vez, y vuelve a TRUE cuando `CoolEnough` se activa.

Este compresor puede arrancar de nuevo solo: el final de su pausa lo marca un sensor, no una persona. Además, las dos condiciones de este programa nunca coinciden en el mismo ciclo de escaneo, porque un motor no puede estar demasiado caliente y frío a la vez. La línea de la práctica es distinta: su paro no termina como la pausa del compresor, y las condiciones que actúan sobre ella pueden estar en TRUE en el mismo ciclo de escaneo. Qué debe hacer entonces la máquina, usted lo decide a partir de lo que necesita.

## Errores comunes

- Leer `EStopOk` como "pulsado". Está en TRUE mientras el pulsador está liberado, así que un programa que detiene la línea cuando `EStopOk` está en TRUE la detiene mientras nadie pulsa nada.
- Dejar que la línea funcione otra vez al soltar. El escenario comprueba a los 17,3 s, 0,3 s después de soltar, que Red sigue encendida y la cinta de salida apagada.
- Detener solo algunas salidas. A los 16 s el escenario comprueba nueve salidas: las tres cintas, y las señales de subir, bajar y funcionar de los dos elevadores.
- Encender Red desde el pulsador en lugar de desde la memoria. A los 17,3 s el pulsador está liberado, y aun así Red debe seguir encendida.
- Olvidar declarar la memoria. Toda variable que usa el programa se declara, y una memoria del programa va en `VAR`.

> [!NOTE]
> En una máquina real, un paro de emergencia se cablea para que corte la energía de los accionamientos aunque el programa no funcione. El paro de esta lección es solo lo que el programa hace con la señal `EStopOk`.

## Compruébelo usted

```quiz
question: 'A los 17,3 s el paro de emergencia lleva 0,3 s liberado y Start no se ha vuelto a pulsar. ¿Qué debe hacer la línea?'
options:
  - { text: 'Seguir detenida, con Red encendida', correct: true, feedback: 'Sí. Soltar el pulsador solo dice que la causa ya no está; una nueva pulsación de Start pide el reinicio.' }
  - { text: 'Funcionar otra vez, porque EStopOk está en TRUE', feedback: 'Un EStopOk en TRUE dice que el pulsador está liberado, no que alguien haya pedido que la línea funcione.' }
  - { text: 'Hacer funcionar solo la cinta de salida, con Red encendida', feedback: 'El escenario comprueba a los 17,3 s que la cinta de salida está apagada; una línea detenida está detenida en todas partes.' }
```

```quiz
question: En el compresor del ejemplo resuelto, TooHot volvió a FALSE, CoolEnough sigue en FALSE y Demand está en TRUE. ¿Funciona el motor?
options:
  - { text: 'No, porque Cooling sigue en TRUE', correct: true, feedback: 'Correcto. TooHot activó la memoria, y solo CoolEnough la borra.' }
  - { text: 'Sí, porque TooHot está en FALSE', feedback: 'Un TooHot en FALSE no borra la memoria. Sigue en TRUE hasta que CoolEnough se activa.' }
  - { text: 'Funciona durante un ciclo de escaneo y luego se detiene', feedback: 'Nada borra la memoria en este estado, así que el motor sigue apagado ciclo tras ciclo.' }
```

```quiz
question: ¿Qué lee EStopOk cuando se corta el cable del pulsador de paro de emergencia?
options:
  - { text: 'FALSE, como cuando el pulsador está presionado', correct: true, feedback: 'Sí. El contacto es normalmente cerrado, así que un cable cortado lo abre y la línea se detiene como con una pulsación.' }
  - { text: 'TRUE, porque nadie pulsó el pulsador', feedback: 'Un TRUE ocultaría el cable cortado. El contacto es normalmente cerrado: cuando el circuito se abre, la entrada lee FALSE.' }
  - { text: 'Conserva el último valor que tenía', feedback: 'La entrada sigue al circuito, así que un cable cortado lee FALSE de inmediato.' }
```

## Qué hará en la práctica

El programa inicial declara las entradas y salidas de la línea, ejecuta las secuencias de los dos elevadores, y no tiene paro. Usted lo cambiará para que la línea se detenga cuando se pulse el paro de emergencia, lo que el escenario hace a los {{t:15500}} ms, siga detenida cuando se suelta a los {{t:17000}} ms, y vuelva a funcionar solo tras la pulsación de Start a los {{t:17500}} ms. Después pulse {{ui:learn.check}}.
