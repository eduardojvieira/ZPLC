## La máquina

Esta estación ejecuta un lote fijo de tres cajas a lo largo de una cinta transportadora. Al accionar `StartButton` comienza el lote: `Emitter1` coloca cajas en el extremo izquierdo de `Belt1` una a la vez, `EyeIn` ve cada caja a 0,7 m del emisor, `EyeOut` ve cada caja cerca del extremo de salida, `Remover1` retira toda caja que llega al extremo final y `DoneLight` se enciende cuando la tercera caja ha llegado a `EyeOut`.

![La escena de cola contada vista de frente. Una cinta transportadora sobre patas va de izquierda a derecha. En el extremo izquierdo, cuatro marcas cian en las esquinas muestran dónde Emitter1 coloca una caja, con StartButton sobre un pedestal detrás de la cinta. Dos sensores ópticos difusos, EyeIn cerca de la entrada y EyeOut cerca de la salida, están detrás de la cinta mirando a través de ella. Detrás del extremo derecho está DoneLight sobre un pedestal, y en el extremo derecho un contenedor metálico llamado Remover1 recoge las cajas. Cada elemento cableado tiene una etiqueta con su nombre, su tipo y su señal; Remover1 no tiene señal.](images/machine.es.png)

La estación tiene siete elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Belt1`       | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Emitter1`    | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `EyeIn`       | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeOut`      | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Remover1`    | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `DoneLight`   | Piloto luminoso      | Un piloto luminoso del panel del operador que muestra un estado.                                                                      |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                          |
| ---------------- | --------------------- | ---------------------- | ---------------------------------------------------- |
| `Run`            | `Belt1.run`           | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                          |
| `Emit`           | `Emitter1.emit`       | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea. |
| `EyeIn`          | `EyeIn.detect`        | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.               |
| `EyeOut`         | `EyeOut.detect`       | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.               |
| —                | `Remover1`            | —                      | No está cableado al PLC.                             |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.    |
| `Done`           | `DoneLight.lit`       | Salida del PLC · BOOL  | TRUE enciende el piloto.                             |

`Remover1` no está cableado al PLC: retira cualquier caja que llega al final de la cinta. Su programa solo ve `Start`, `EyeIn` y `EyeOut`, y acciona `Run`, `Emit` y `Done`.

## Contar un lote sobre una cinta en marcha

Un sensor permanece en TRUE durante decenas de ciclos de escaneo mientras una sola caja atraviesa su haz. Si su programa simplemente sumara 1 en cada ciclo en que `EyeIn` está en TRUE, una caja contaría como decenas. Un contador ascendente (`CTU`) resuelve esto porque cuenta **flancos ascendentes** en su entrada `CU`: incrementa su valor actual `CV` en 1 cada vez que `CU` pasa de FALSE a TRUE, y mantiene esa cuenta mientras la caja sigue en el haz. Cuando `CV` alcanza el valor preestablecido `PV`, la salida `Q` del contador pasa a TRUE.

En una cinta que carga y descarga un lote, una sola cuenta no basta:

- **Cuenta de carga**: cuando la tercera caja entra en la cinta, el emisor debe dejar de soltar cajas nuevas; de lo contrario entraría una cuarta caja en la línea.
- **Cuenta de descarga**: en ese instante la tercera caja acaba de entrar en la cinta y todavía viaja hacia el extremo. Si la cinta se detuviera al llegar la cuenta de carga a 3, quedarían cajas detenidas sobre la cinta. La cinta debe seguir en marcha hasta que la tercera caja llegue a `EyeOut`.

```timing
span: 20000
signals:
  - { name: Start, edges: [200, 400] }
  - { name: EyeIn, edges: [1450, 2250, 3300, 4100, 5150, 5950] }
  - { name: EyeOut, edges: [4050, 4850, 5900, 6700, 7750, 20000] }
  - { name: Run, edges: [200, 7750] }
  - { name: Done, edges: [7750, 20000] }
caption: Las cuentas de carga y descarga se solapan, y la cinta se detiene con la tercera caja todavía en el haz de EyeOut, cuando Done se enciende
```

Como `Emit` suelta una pieza en cada flanco ascendente, soltar tres cajas significa generar tres flancos ascendentes separados, con espacio suficiente para que cada caja se haya alejado antes de colocar la siguiente sobre la cinta.

## Ejemplo resuelto

Una tolva de embalaje de botellas llena cajas de seis unidades. Un solo sensor óptico `BottleEye` ve caer cada botella dentro de la caja. Mientras hayan entrado menos de seis botellas, `FeedGate` permanece abierta (`TRUE`). En cuanto la sexta botella pasa por `BottleEye`, `FeedGate` se cierra (`FALSE`) y `CartonFull` se enciende hasta que el operario acciona `NewCarton` para reiniciar el contador con la siguiente caja vacía:

```st
PROGRAM BottlePacker
VAR_INPUT BottleEye : BOOL; NewCarton : BOOL; END_VAR
VAR_OUTPUT FeedGate : BOOL; CartonFull : BOOL; END_VAR
VAR PackCount : CTU; END_VAR
PackCount(CU := BottleEye, R := NewCarton, PV := 6);
CartonFull := PackCount.Q;
FeedGate := NOT PackCount.Q;
END_PROGRAM
```

Léalo desde arriba. `PackCount` se declara como una instancia `CTU` en `VAR` y se llama en cada ciclo de escaneo. Cada botella produce un flanco ascendente en `BottleEye`, de modo que `PackCount.CV` avanza de 0 a 6 una vez por botella sin importar cuántos ciclos pase la botella en el haz. Mientras `PackCount.Q` es FALSE, `FeedGate` es TRUE y `CartonFull` es FALSE. En el sexto flanco ascendente, `PackCount.Q` pasa a TRUE, lo que enciende `CartonFull` y cierra `FeedGate` en el mismo ciclo. Accionar `NewCarton` pone `R` en TRUE, lo que borra `CV` a 0 y `Q` a FALSE.

Esta tolva solo tiene un punto donde contar y una compuerta que permanece abierta por sí sola. La estación de cinta de la práctica tiene que recordar que una pulsación corta de inicio comenzó el lote, espaciar el emisor para que las cajas no choquen y mantener la cinta en marcha después de cargar la tercera caja hasta que la tercera caja llegue a `EyeOut`. Esas decisiones quedan para usted.

## Errores comunes

- Detener la cinta en cuanto el contador de carga llega a 3. La tercera caja acaba de entrar en la cinta y nunca llega a `EyeOut`.
- Mantener `Emit` en TRUE de forma continua. `Emitter1` solo suelta una caja por cada flanco ascendente; una señal que nunca vuelve a FALSE nunca dispara una segunda caja.
- Disparar la caja siguiente antes de que la anterior salga de la zona de carga. Dos cajas se superponen en el emisor y chocan.
- Llamar un `CTU` dentro de un `IF` que deja de ejecutarse. Un contador debe llamarse en cada ciclo de escaneo para ver tanto el nivel FALSE como el nivel TRUE que forman cada flanco ascendente.

> [!NOTE]
> `CTU` necesita una transición de FALSE a TRUE en `CU` para contar. Si `CU` ya está en TRUE en el primer ciclo de escaneo, o permanece en TRUE sin volver nunca a FALSE entre dos piezas, el contador no registrará un nuevo flanco.

## Compruébelo usted

```quiz
question: ¿Por qué un contador CTU cuenta una caja una sola vez aunque la caja permanezca en el haz del sensor durante muchos ciclos de escaneo?
options:
  - { text: 'Porque CTU incrementa solo en un flanco ascendente (de FALSE a TRUE) de su entrada CU', correct: true, feedback: 'Sí. Permanecer en TRUE en los ciclos siguientes no vuelve a incrementar CV hasta que CU pase a FALSE y vuelva a subir.' }
  - { text: 'Porque CTU se ejecuta solo una vez por segundo', feedback: 'CTU se ejecuta en cada ciclo de escaneo en que se llama; es la detección de flanco ascendente en CU la que evita cuentas repetidas.' }
  - { text: 'Porque el sensor óptico entrega un pulso de un solo ciclo', feedback: 'Un sensor óptico difuso permanece en TRUE todo el tiempo que la caja está en su haz.' }
```

```quiz
question: En la embaladora de botellas del ejemplo resuelto, cinco botellas han pasado por BottleEye y la sexta acaba de entrar en el haz. ¿Qué valen FeedGate y CartonFull al final de ese ciclo?
options:
  - { text: 'FeedGate está en FALSE y CartonFull está en TRUE', correct: true, feedback: 'Correcto. El sexto flanco ascendente lleva CV a PV (6), así que PackCount.Q pasa a TRUE, cierra FeedGate y enciende CartonFull.' }
  - { text: 'FeedGate está en TRUE y CartonFull está en FALSE', feedback: 'PackCount.Q pasa a TRUE en cuanto CV llega a 6, en el flanco ascendente de la sexta botella.' }
  - { text: 'Tanto FeedGate como CartonFull están en TRUE', feedback: 'FeedGate recibe NOT PackCount.Q, así que siempre es el opuesto de CartonFull.' }
```

## Qué hará en la práctica

El proyecto inicial declara las entradas `Start`, `EyeIn` y `EyeOut` y las salidas `Run`, `Emit` y `Done`, con el cuerpo vacío. El escenario acciona `Start` a los {{t:200}} ms y lo suelta a los {{t:400}} ms. Usted cargará tres cajas una a la vez sin colisiones, entregará cajas en `Remover1` sin que ninguna caiga ni choque y detendrá la cinta con `Done` encendido antes de los {{t:20000}} ms, una vez que la tercera caja haya llegado a `EyeOut`. Después pulse {{ui:learn.check}}.
