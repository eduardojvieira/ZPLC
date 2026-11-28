## La máquina

Este es un almacén automático, de los que guardan la mercancía en estantes demasiado altos para alcanzarlos a mano. Una sola máquina hace todo el trabajo, un transelevador: recorre un pasillo, toma una caja de la cinta de entrada, la deja en una celda de la estantería y, cuando alguien pide esa caja, la trae de vuelta al muelle. La estantería tiene tres columnas de dos estantes, seis celdas en total, y esta lección usa solo el primer estante de cada columna.

![La escena del almacén con transelevador vista desde arriba y de lado. Una estantería de baldas está en el centro, con el mástil del transelevador delante. A la izquierda una cinta de entrada, con el emisor en su extremo, llega hasta el transelevador; a la derecha una cinta de salida termina en un contenedor, con una torre de luces al lado. Delante de la estantería están el pulsador de inicio y los tres pulsadores de petición. Cada elemento tiene una etiqueta con su nombre, su tipo y las señales conectadas.](images/machine.es.png)

El almacén tiene once elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Crane1`      | Transelevador        | La grúa de un almacén automático: recorre un pasillo, guarda cajas en las celdas de un estante y las retira.                          |
| `Infeed`      | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Source1`     | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Outfeed`     | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `OutBin`      | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `InEye`       | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `Req1`        | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `Req2`        | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `Req3`        | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `StackLight1` | Torre de luces       | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo                  | Significado                                                           |
| ---------------- | --------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `InPos`          | `Crane1.inPosition`   | Entrada del PLC · BOOL            | TRUE cuando la grúa está quieta en la columna y el nivel pedidos.     |
| `Raised`         | `Crane1.raised`       | Entrada del PLC · BOOL            | TRUE cuando la horquilla está elevada.                                |
| `Centre`         | `Crane1.forkCentre`   | Entrada del PLC · BOOL            | TRUE cuando la horquilla está de vuelta en el centro.                 |
| `AtLeft`         | `Crane1.forkAtLeft`   | Entrada del PLC · BOOL            | TRUE cuando la horquilla está totalmente extendida a la izquierda.    |
| `AtRight`        | `Crane1.forkAtRight`  | Entrada del PLC · BOOL            | TRUE cuando la horquilla está totalmente extendida a la derecha.      |
| `Loaded`         | `Crane1.loaded`       | Entrada del PLC · BOOL            | TRUE mientras una caja reposa en la horquilla.                        |
| `Bay`            | `Crane1.bay`          | Salida del PLC · INT, 0 a 3 bay   | La columna del estante a la que debe ir (0 es el muelle).             |
| `Level`          | `Crane1.level`        | Salida del PLC · INT, 0 a 2 level | El nivel del estante al que debe ir (0 es el muelle).                 |
| `Raise`          | `Crane1.raise`        | Salida del PLC · BOOL             | TRUE eleva un poco la horquilla, para levantar o apoyar una caja.     |
| `ForkLeft`       | `Crane1.forkLeft`     | Salida del PLC · BOOL             | TRUE extiende la horquilla hacia la izquierda mientras se mantiene.   |
| `ForkRight`      | `Crane1.forkRight`    | Salida del PLC · BOOL             | TRUE extiende la horquilla hacia la derecha mientras se mantiene.     |
| `BeltRight`      | `Crane1.beltRight`    | Salida del PLC · BOOL             | TRUE hace avanzar la cinta de la horquilla hacia el lado del estante. |
| `RunIn`          | `Infeed.run`          | Salida del PLC · BOOL             | TRUE hace avanzar la cinta.                                           |
| —                | `Source1`             | —                                 | No está cableado al PLC.                                              |
| `RunOut`         | `Outfeed.run`         | Salida del PLC · BOOL             | TRUE hace avanzar la cinta.                                           |
| —                | `OutBin`              | —                                 | No está cableado al PLC.                                              |
| `InEye`          | `InEye.detect`        | Entrada del PLC · BOOL            | TRUE mientras hay un objeto en el haz.                                |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL            | TRUE mientras el pulsador se mantiene presionado.                     |
| `Req1`           | `Req1.pressed`        | Entrada del PLC · BOOL            | TRUE mientras el pulsador se mantiene presionado.                     |
| `Req2`           | `Req2.pressed`        | Entrada del PLC · BOOL            | TRUE mientras el pulsador se mantiene presionado.                     |
| `Req3`           | `Req3.pressed`        | Entrada del PLC · BOOL            | TRUE mientras el pulsador se mantiene presionado.                     |
| `Green`          | `StackLight1.green`   | Salida del PLC · BOOL             | TRUE enciende la lámpara verde.                                       |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. Su programa solo ve estas variables: nunca ve una caja, solo lo que el transelevador y el sensor dicen de ella.

El transelevador hace dos clases de trabajo. Se desplaza: Bay elige una columna de la estantería y Level un estante, y Bay 0 con Level 0 es el muelle donde terminan las dos cintas. InPos pasa a TRUE cuando el transelevador está quieto en el lugar pedido. Y maneja cajas: la horquilla sale hacia la izquierda, hacia la cinta de entrada, o hacia la derecha, hacia la estantería y la cinta de salida. Raise eleva la horquilla unos centímetros, y así levanta una caja de los rieles de una celda o la apoya sobre ellos. La cinta de la horquilla hace rodar una caja para subirla o bajarla.

El transelevador no puede desplazarse con la horquilla extendida. Si el programa pide otro Bay u otro Level con la horquilla fuera, el transelevador se queda donde está y el hecho `blocked` cuenta una vez la petición rechazada.

Las cajas llegan solas: Source1 suelta una a los 8 s, otra a los 16 s y otra a los 24 s, tres en total, y la cinta de entrada lleva cada una hasta InEye mientras RunIn está en TRUE. Los pulsadores de petición Req1, Req2 y Req3 piden la caja de la columna 1, 2 o 3. Una pulsación dura una fracción de segundo, y el transelevador puede estar ocupado mucho más tiempo, así que una petición hecha mientras trabaja debe atenderse después.

El escenario pulsa Start a los {{t:200}} ms, deja que lleguen y se almacenen las tres cajas, y luego pulsa Req1 a los {{t:50000}} ms y Req3 a los {{t:50500}} ms, mientras el transelevador sigue ocupado con la primera. El diagrama es una ejecución del programa terminado: una celda está alta mientras guarda una caja en reposo, y Green se enciende cuando dos cajas han sido puestas en la cinta de salida.

```timing
span: 90000
signals:
  - { name: Req1, edges: [50000, 50300] }
  - { name: Req3, edges: [50500, 50800] }
  - { name: Cell1, edges: [18390, 54330] }
  - { name: Cell2, edges: [31330, 90000] }
  - { name: Cell3, edges: [45640, 68680] }
  - { name: Green, edges: [78860, 90000] }
caption: La petición de la columna 3 espera a que el transelevador atienda la columna 1, y después se vacía la columna 3
```

## Un trabajo es una cadena de pasos

Almacenar una caja no es una sola acción. El transelevador toma la caja con la horquilla, se desplaza, desliza la horquilla dentro de la celda, la baja y vuelve. Cada movimiento tarda, y el siguiente no debe empezar antes de que la máquina diga que el anterior terminó. Un diagrama de funciones secuenciales dibuja bien esto: un paso por cada movimiento, y una transición que espera el sensor que lo informa. El diagrama sigue a la máquina, sea rápida o lenta.

El paso activo es también la memoria del trabajo. Mientras un paso a mitad de la cadena está activo, el programa sabe que hay un trabajo en curso, aunque el pulsador que lo inició se soltó hace mucho. Ninguna variable extra dice "hay un trabajo en marcha". Cuando el trabajo termina, el diagrama vuelve a su paso de espera.

## Ejemplo resuelto

Una tienda envía paquetes a su altillo con un pequeño montacargas. Una pulsación de `Send` inicia un viaje: el montacargas sube al altillo, un empujador desliza la bandeja hasta el piso del altillo, el empujador vuelve y el montacargas baja otra vez a la tienda. Las entradas son `Send` y los cuatro sensores `AtLoft`, `Pushed`, `Home` y `AtShop`; las salidas son `Up`, `Down` y `Push`.

Cada movimiento da un paso, y cada paso termina cuando el sensor de su movimiento pasa a TRUE:

| Paso      | Salidas en TRUE | Termina cuando                               |
| --------- | --------------- | -------------------------------------------- |
| `IDLE`    | ninguna         | `Send`                                       |
| `RISE`    | `Up`            | `AtLoft`: el montacargas está en el altillo  |
| `SLIDE`   | `Push`          | `Pushed`: el empujador está totalmente fuera |
| `RETRACT` | ninguna         | `Home`: el empujador está totalmente dentro  |
| `LOWER`   | `Down`          | `AtShop`: el montacargas está en la tienda   |

`IDLE` es el paso inicial, y `LOWER` conduce de nuevo a él. Cada acción escribe las tres salidas, así que cada paso dice el estado completo del montacargas. Esta es una ejecución, con los sensores reproducidos por un guion: `Send` se pulsa dos veces, la segunda mientras el montacargas todavía sube.

```timing
span: 9000
signals:
  - { name: Send, edges: [1000, 1300, 2000, 2300] }
  - { name: Up, edges: [1010, 3010] }
  - { name: Push, edges: [3010, 4010] }
  - { name: Down, edges: [5010, 8010] }
caption: Un viaje por dos pulsaciones, porque la segunda llega mientras RISE está activo y solo IDLE mira Send
```

Siga la primera pulsación. `IDLE` está activo y ve `Send`, así que en el ciclo de escaneo siguiente `RISE` está activo y `Up` está en TRUE. Cuando el sensor del altillo pasa a TRUE, `RISE` termina y `Up` baja en el mismo ciclo de escaneo en que `Push` sube, porque la acción siguiente escribe todas las salidas. La segunda pulsación encuentra `RISE` activo, y allí nada mira `Send`, así que el montacargas la ignora. Un montacargas que no deba perder una pulsación necesitaría una memoria propia para ella.

Este montacargas no tiene horquilla, ni estantería, ni nada entre lo que elegir. El transelevador de la práctica tiene una estantería con caja en unas celdas y sin ella en otras, y lo que su diagrama debe hacer ante una petición lo debe resolver usted a partir de lo que el transelevador puede y no puede hacer.

## Errores comunes

- Escribir una salida solo en el paso que la activa. En el montacargas, si `SLIDE` escribe solo `Push := TRUE` y `RETRACT` no escribe nada, `Push` sigue en TRUE durante `RETRACT`, así que al empujador se le ordena seguir fuera.
- Empezar el movimiento siguiente antes de que el sensor del anterior diga que terminó. En una ejecución del transelevador en que la horquilla salió antes de `InPos`, `blocked` llegó a 2 y las tres cajas se quedaron en la estantería.
- Esperar el sensor equivocado. `Home` está en TRUE cuando el empujador está dentro, que es donde empieza `SLIDE`, así que un `SLIDE` que esperara `Home` terminaría en el ciclo de escaneo siguiente, con `Push` en TRUE durante un solo ciclo de escaneo.
- Dar a un paso el nombre de una palabra clave de IEC. Un paso llamado `RETURN` no compila: el mensaje es "Step name may not be an IEC keyword".

> [!NOTE]
> Un diagrama muestra el orden de una máquina, no su seguridad. El transelevador rechaza un desplazamiento con la horquilla fuera, pero un almacén real tiene además protecciones y finales de carrera cableados fuera del programa.

## Compruébelo usted

```quiz
question: En el montacargas, RISE está activo y el operario pulsa Send otra vez. ¿Qué hace el montacargas?
options:
  - { text: 'Nada: solo IDLE mira Send, y IDLE no está activo', correct: true, feedback: 'Correcto. La pulsación termina antes de que el diagrama vuelva a IDLE, así que el montacargas hace un solo viaje.' }
  - { text: 'Empieza un segundo viaje en cuanto termina el primero', feedback: 'Nada recuerda la pulsación. La segunda llegó mientras RISE estaba activo, y RISE no lee Send.' }
  - { text: 'Se detiene y vuelve a IDLE', feedback: 'RISE termina solo cuando AtLoft está en TRUE; Send no es una de sus condiciones.' }
```

```quiz
question: El programa pide al transelevador otro Bay mientras la horquilla está fuera. ¿Qué ocurre?
options:
  - { text: 'El transelevador se queda donde está y la petición se cuenta en blocked', correct: true, feedback: 'Sí. El transelevador no se desplaza con la horquilla fuera, y cada petición rechazada se cuenta una vez.' }
  - { text: 'El transelevador se desplaza con la horquilla fuera', feedback: 'No puede: su desplazamiento se mantiene detenido mientras la horquilla está fuera.' }
  - { text: 'El transelevador recoge la horquilla por sí solo y luego se desplaza', feedback: 'La horquilla se queda fuera mientras el programa mantiene ForkLeft o ForkRight; el transelevador nunca la recoge para desplazarse.' }
```

## Qué hará en la práctica

El diagrama inicial ya almacena cada caja que llega a la cinta de entrada: la lleva a la primera celda libre, y lleva la cuenta de qué celdas guardan una caja y qué peticiones esperan. No tiene forma de traer una caja de vuelta, así que una pulsación de un pulsador de petición no hace nada. Usted hará que el transelevador atienda una petición: sacar la caja de la celda pedida, llevarla al muelle y ponerla en la cinta de salida. La lámpara debe estar verde a los {{t:90000}} ms. Después pulse {{ui:learn.check}}.
