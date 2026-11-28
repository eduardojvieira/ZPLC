## La máquina

Esta es una línea de mercancía que sube. Una caja entra en el nivel más bajo, el elevador A la sube al nivel 2, una cinta de transferencia la lleva al elevador B, el elevador B la sube al nivel 3 y una cinta de salida la entrega en un depósito. Los almacenes y las fábricas de varios pisos mueven la mercancía así, un elevador para cada subida.

![La escena de los tres niveles con elevadores vista de frente, que asciende de izquierda a derecha: una cinta de entrada en el nivel más bajo, el elevador A, una cinta de transferencia en el segundo nivel, el elevador B y una cinta de salida en el tercer nivel que termina en un depósito. Se señalan el pulsador de inicio, el paro de emergencia, una torre de luces, el emisor de cajas y tres sensores. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

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

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. Su programa solo ve estas variables: nunca ve una caja, solo lo que los sensores dicen de ella.

El elevador A reposa en el nivel 1 o en el nivel 2 de la planta. El elevador B reposa en el nivel 2 o en el nivel 3, pero sus propias señales se llaman `atLevel1` y `atLevel2`: para cada elevador, el nivel 1 es su parte baja y el nivel 2 su parte alta. Cada elevador tiene una plataforma que `Up` y `Down` mueven, y una cinta sobre la plataforma que `Run` acciona.

Datos de esta escena, de una ejecución de un programa terminado, en segundos desde el inicio:

- El emisor de cajas `Source1` no está conectado al PLC. Pone una caja en la cinta de entrada cada 10 s haga lo que haga el programa, cinco cajas en total, la primera hacia los 10 s de la ejecución.
- Una caja tarda unos 4,5 s en recorrer la cinta de entrada desde que se suelta hasta `EyeFoot`. Una plataforma tarda unos 1,4 s en ir de su parte baja a su parte alta, o a la inversa.
- La primera caja llega al depósito hacia los 26,7 s de la ejecución, y la quinta hacia los 68,7 s. El escenario pulsa Start a los {{t:200}} ms, lo suelta a los {{t:400}} ms y termina a los {{t:80000}} ms.
- El paro de emergencia y la lámpara roja están conectados, pero el escenario nunca pulsa el paro y el programa terminado no lo lee.

## Dos ciclos a la vez

Cada elevador repite un ciclo para cada caja: toma una caja abajo, sube, hace salir la caja arriba y vuelve a bajar. En la ejecución el ciclo dura unos 5,8 s, desde el momento en que se ve la caja abajo hasta el momento en que la plataforma vuelve allí. Las cajas llegan cada 10 s, así que cada elevador queda libre otra vez antes de que llegue la siguiente.

Los dos ciclos no van acompasados. Mientras el elevador A sube con una caja, el elevador B todavía baja después de entregar la caja anterior. En la ejecución esto ocurre de los 25,8 s a los 26,8 s:

```timing
span: 6000
signals:
  - { name: LiftA.up, edges: [1450, 2840] }
  - { name: LiftB.down, edges: [1820, 3210] }
  - { name: Transfer.run, edges: [2850, 6000] }
caption: 'Segundos 24 a 30 de la ejecución: el elevador A sube mientras el elevador B baja, y la cinta de transferencia arranca cuando el elevador A llega arriba'
```

El único elemento que usan ambos elevadores es la cinta de transferencia: el elevador A pone una caja en ella y el elevador B toma la caja de ella. Si solo un elevador pudiera trabajar a la vez, los dos ciclos de unos 5,8 s sumarían más de los 10 s que hay entre cajas, y las cajas harían cola abajo del elevador A. La máquina necesita que ambos elevadores puedan trabajar a la vez, cada uno en su propio ciclo, y que se encuentren solo en la cinta de transferencia.

## Ejemplo resuelto

Un montacargas de un almacén lleva un cajón de la planta baja al primer piso, lo descarga y vuelve. Las entradas son `CrateOn`, que está en TRUE mientras hay un cajón sobre la plataforma, `AtGround` y `AtFirst`, que dicen dónde reposa la plataforma. Las salidas son `Up`, `Down` y `Belt`, la cinta de la plataforma.

Los trabajos son: esperar un cajón, subirlo, descargarlo durante un tiempo y bajar la plataforma. Cuatro trabajos dan cuatro pasos, y la última transición vuelve al primer paso, de modo que el montacargas repite el ciclo para cada cajón. Cada paso dice el estado completo del montacargas: escribe las tres salidas.

| Paso             | Up    | Down  | Belt  | El paso termina cuando      |
| ---------------- | ----- | ----- | ----- | --------------------------- |
| `WAIT` (inicial) | FALSE | FALSE | FALSE | `CrateOn AND AtGround`      |
| `RAISE`          | TRUE  | FALSE | FALSE | `AtFirst`                   |
| `UNLOAD`         | FALSE | FALSE | TRUE  | `UNLOAD.T >= T#3s`          |
| `LOWER`          | FALSE | TRUE  | FALSE | `AtGround`, vuelve a `WAIT` |

Siga un cajón por el diagrama. `WAIT` está activo y nada se mueve. Cuando el cajón está sobre la plataforma y la plataforma está en la planta baja, `RAISE` pasa a estar activo y la plataforma sube. Cuando `AtFirst` está en TRUE, `UNLOAD` hace avanzar la cinta durante tres segundos, luego `LOWER` baja la plataforma, y cuando `AtGround` está en TRUE el diagrama vuelve a `WAIT`, listo para el cajón siguiente.

En ningún momento `Up` o `Down` funcionan junto con `Belt`: cada paso enciende solo lo que necesita su trabajo y apaga el resto.

Esta máquina tiene un montacargas. La línea de la práctica tiene dos elevadores que trabajan a la vez y comparten una cinta, y qué lee el segundo elevador y cómo empiezan a trabajar juntos los dos lo decide usted a partir de lo que necesita la máquina.

## Errores comunes

- Un ciclo que no vuelve a su primer paso. El elevador atiende una caja y luego espera para siempre.
- Un paso sin ninguna condición que pueda llegar a TRUE. El diagrama se queda en ese paso y sus salidas siguen encendidas.
- Una salida escrita en un solo paso. Cuando el paso termina, la salida conserva su último valor; haga que cada paso escriba todas las salidas de su elevador.
- Usar un sensor de un elevador en el ciclo del otro. Cada elevador tiene sus propios sensores de posición, y un sensor dice dónde está su propia plataforma o su propia caja.
- Mover un elevador mientras su cinta está en marcha. {{ui:learn.check}} no lo ve: en una ejecución de prueba que mantuvo en marcha la cinta del elevador A mientras subía, {{ui:learn.check}} aprobó igualmente. Obsérvelo usted mismo en la {{ui:plant.panel.view3d}}.

> [!NOTE]
> La calificación prueba que una caja llegó al depósito y que Green está encendida al final. No ve el orden de los pasos de cada elevador, así que un diagrama puede aprobar y seguir mal de una manera que solo muestra la vista 3D.

## Compruébelo usted

```quiz
question: En el montacargas, WAIT está activo, CrateOn está en TRUE y AtGround está en FALSE, porque la plataforma está entre pisos. ¿Qué ocurre?
options:
  - { text: 'WAIT sigue activo, porque ambas señales deben estar en TRUE', correct: true, feedback: 'Sí. La condición es CrateOn AND AtGround, así que una señal en FALSE mantiene el diagrama en WAIT.' }
  - { text: 'RAISE pasa a estar activo, porque hay un cajón sobre la plataforma', feedback: 'La condición necesita ambas señales. CrateOn solo no basta.' }
  - { text: 'UNLOAD pasa a estar activo después de tres segundos', feedback: 'Los tres segundos pertenecen al reloj de UNLOAD, que todavía no está activo.' }
```

```quiz
question: En la ejecución, el elevador A sube con una caja mientras el elevador B todavía baja después de entregar la caja anterior. ¿Cuántos pasos de todo el diagrama están activos?
options:
  - { text: 'Dos, uno por cada elevador', correct: true, feedback: 'Correcto. Cada elevador está en su propio ciclo, así que cada uno tiene su propio paso activo.' }
  - { text: 'Uno, el del elevador A', feedback: 'El elevador B también se mueve, así que un paso del elevador B también está activo.' }
  - { text: 'Tres, porque la cinta de transferencia tiene un paso propio', feedback: 'La cinta de transferencia la accionan los elevadores; no es un ciclo propio.' }
```

## Qué hará en la práctica

El proyecto inicial ya contiene el ciclo del elevador A y acciona la cinta de transferencia, la cinta de salida y Green; no tiene nada para el elevador B. Usted hará que el elevador B lleve cada caja desde la cinta de transferencia hasta la cinta de salida mientras el elevador A sigue trabajando, de modo que las cinco cajas lleguen al depósito y Green esté encendida al final, a los {{t:80000}} ms de la ejecución. Después pulse {{ui:learn.check}}.
