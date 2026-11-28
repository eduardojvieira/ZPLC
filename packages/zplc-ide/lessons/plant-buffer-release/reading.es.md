## La máquina

Una estación de búfer se sitúa entre dos máquinas que trabajan a distinta velocidad: acumula un lote de cajas sobre una cinta de retención, las detiene detrás de un tope retráctil y deja pasar una caja hacia la cinta siguiente cada vez que el tramo posterior pide una.

![La escena de acumular y liberar vista de frente. Dos cintas transportadoras están alineadas de izquierda a derecha: Buffer1 a la izquierda y Release1 a la derecha. En el extremo izquierdo de Buffer1, cuatro marcas cian en las esquinas muestran Emitter1 con StartButton detrás. A lo largo de la línea están EyeFull, ReleaseButton, EyeBlade, el tope retráctil Blade1 entre ambas cintas y EyeRelease justo después del tope. Más a la derecha, detrás de Release1, están FaultLight y DoneLight, y en el extremo derecho se encuentra Remover1. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

La estación tiene doce elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento        | Tipo                 | Qué es en una planta real                                                                                                             |
| --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Buffer1`       | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Release1`      | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Emitter1`      | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Blade1`        | Tope retráctil       | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `EyeFull`       | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeBlade`      | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeRelease`    | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Remover1`      | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton`   | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `ReleaseButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `DoneLight`     | Piloto luminoso      | Un piloto luminoso del panel del operador que muestra un estado.                                                                      |
| `FaultLight`    | Piloto luminoso      | Un piloto luminoso del panel del operador que muestra un estado.                                                                      |

| Variable del PLC | Señal                   | Dirección y tipo       | Significado                                          |
| ---------------- | ----------------------- | ---------------------- | ---------------------------------------------------- |
| `RunBuffer`      | `Buffer1.run`           | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                          |
| `RunRelease`     | `Release1.run`          | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                          |
| `Emit`           | `Emitter1.emit`         | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea. |
| `Hold`           | `Blade1.extend`         | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.    |
| `EyeFull`        | `EyeFull.detect`        | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.               |
| `EyeBlade`       | `EyeBlade.detect`       | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.               |
| `EyeRelease`     | `EyeRelease.detect`     | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.               |
| —                | `Remover1`              | —                      | No está cableado al PLC.                             |
| `Start`          | `StartButton.pressed`   | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.    |
| `ReleaseCmd`     | `ReleaseButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.    |
| `Done`           | `DoneLight.lit`         | Salida del PLC · BOOL  | TRUE enciende el piloto.                             |
| `Fault`          | `FaultLight.lit`        | Salida del PLC · BOOL  | TRUE enciende el piloto.                             |

`Remover1` no está cableado al PLC: retira por su cuenta cada caja que llega al extremo de `Release1`. Su diagrama solo ve las cinco entradas y acciona las seis salidas.

## Contar y bifurcar en un diagrama

Una secuencia simple avanza en línea recta desde su primer paso hasta el último y vuelve al inicio. Una estación real suele tener que repetir un par de pasos un número fijo de veces antes de pasar a la fase siguiente. En un diagrama funcional secuencial, dos herramientas resuelven eso con claridad: una **acción de pulso** (`P1`) y las **transiciones alternativas**.

Una acción con calificador `N` se ejecuta en cada ciclo de escaneo mientras su paso está activo. Eso conviene para accionar salidas como cintas, topes y pilotos, porque cada paso indica el estado completo de las salidas en su fase. No conviene para contar: escribir `Hits := Hits + 1;` dentro de una acción `N` sumaría uno en cada ciclo de escaneo, llegando a cien en un solo segundo en una tarea de {{t:10}} ms.

Una acción con calificador `P1` se ejecuta una sola vez, en el primer ciclo de escaneo en que el paso se activa. Ponga el incremento en una acción `P1`, y cada entrada al paso sumará exactamente uno al contador local.

Cuando un paso termina su tarea, el diagrama debe decidir si vuelve atrás para repetir o si continúa a la fase siguiente. Para eso dibuje **dos transiciones que salen del mismo paso** — una bifurcación alternativa. Sus condiciones deben excluirse entre sí (o llevar un orden de prioridad claro), de modo que el diagrama siempre sepa qué rama tomar: una rama se dispara cuando el lote está completo y la otra mientras aún faltan piezas.

## Ejemplo resuelto

Una prensa de estampado estampa un lote de tres chapas metálicas cuando se acciona `CycleStart`, hace una pausa de un segundo entre golpes y luego abre `UnloadGate` hasta que `PartOut` ve salir la pila terminada. Las entradas son `CycleStart`, `StampDown` y `PartOut`; las salidas son `Press` y `UnloadGate`; la variable local es `Hits : INT := 0`.

Cuatro pasos modelan la prensa:

- `IDLE` (inicial): una acción `N` escribe `Press := FALSE; UnloadGate := FALSE;`, y una acción `P1` reinicia `Hits := 0;`.
- `STAMP`: una acción `N` escribe `Press := TRUE; UnloadGate := FALSE;`, y una acción `P1` escribe `Hits := Hits + 1;`.
- `PAUSE`: una acción `N` escribe `Press := FALSE; UnloadGate := FALSE;`.
- `UNLOAD`: una acción `N` escribe `Press := FALSE; UnloadGate := TRUE;`.

Las transiciones los enlazan con una bifurcación alternativa a la salida de `STAMP`:

- `IDLE` a `STAMP`: `CycleStart`.
- `STAMP` a `UNLOAD` (prioridad 1): `StampDown AND Hits >= 3`.
- `STAMP` a `PAUSE` (prioridad 2): `StampDown AND Hits < 3`.
- `PAUSE` a `STAMP`: `PAUSE.T >= T#1s`.
- `UNLOAD` a `IDLE`: `PartOut`.

```timing
span: 7000
signals:
  - { name: CycleStart, edges: [200, 400] }
  - { name: STAMP, edges: [200, 1000, 2000, 2800, 3800, 4600] }
  - { name: PAUSE, edges: [1000, 2000, 2800, 3800] }
  - { name: UNLOAD, edges: [4600, 6200] }
  - { name: Press, edges: [200, 1000, 2000, 2800, 3800, 4600] }
  - { name: UnloadGate, edges: [4600, 6200] }
marks:
  - { from: 1000, to: 2000, label: 'T#1s' }
  - { from: 2800, to: 3800, label: 'T#1s' }
caption: Tres entradas a STAMP incrementan Hits con P1; en el tercer golpe la bifurcación pasa a UNLOAD
```

Siga un lote completo. Cuando `CycleStart` pasa a TRUE, `STAMP` se activa, su acción `P1` fija `Hits` en `1` y `Press` se enciende. Cuando `StampDown` pasa a TRUE, `Hits < 3` es TRUE, así que el diagrama pasa a `PAUSE` durante `T#1s`, luego vuelve a `STAMP` donde `Hits` pasa a `2`, y una vez más donde `Hits` pasa a `3`. En el tercer `StampDown`, gana `Hits >= 3` y el diagrama entra en `UNLOAD`, abriendo `UnloadGate` hasta que `PartOut` lo devuelve a `IDLE`.

Esta prensa tiene un solo lazo de conteo y libera el lote entero de una vez. En la estación de la práctica usted debe diseñar dos fases — cargar cinco cajas y liberarlas de una en una por pulsación — y decidir cómo mantener elevado el tope retráctil, cómo detectar cuándo una sola caja despejó el sensor de liberación y cómo vigilar si se escapa una caja durante la espera.

## Errores comunes

- Incrementar un contador en una acción `N` en lugar de una acción `P1`. El contador sube en cada ciclo de escaneo mientras el paso está activo, así que en un paso que espera, como STAMP, la condición del lote se cumple en la primera pieza.
- Dejar dos transiciones salientes de un paso con condiciones superpuestas y sin prioridad clara. Ambas ramas pueden volverse TRUE en el mismo ciclo de escaneo y enviar el diagrama por el camino equivocado.
- Omitir una salida en la acción `N` de un paso. En SFC una salida conserva su último valor cuando termina el paso anterior, así que una cinta o un tope mantiene su estado previo hasta que otra acción la escriba.

> [!NOTE]
> Una acción `P1` se ejecuta una sola vez cuando su paso se activa. Si el diagrama vuelve a entrar más tarde en el mismo paso, el paso se activa de nuevo y la acción `P1` se ejecuta una vez más.

## Compruébelo usted

```quiz
question: En el ejemplo de la prensa de estampado, ¿qué ocurre si Hits := Hits + 1 se coloca en una acción N en lugar de una acción P1?
options:
  - { text: 'Hits aumenta en cada ciclo de escaneo mientras STAMP está activo, así que la prensa pasa a UNLOAD tras el primer golpe', correct: true, feedback: 'Sí. Una acción N se ejecuta en cada ciclo de escaneo; solo una acción P1 se ejecuta una vez por cada entrada al paso.' }
  - { text: 'Hits nunca cambia porque las acciones N no pueden escribir variables locales', feedback: 'Una acción N puede escribir variables locales; el problema es que se ejecuta en cada ciclo de escaneo y no una sola vez.' }
  - { text: 'Hits aumenta solo cuando el paso termina', feedback: 'Ese es un pulso P0 (de salida), no una acción N. Una acción N se ejecuta de forma continua mientras el paso está activo.' }
```

```quiz
question: ¿Por qué las dos transiciones que salen de STAMP usan Hits >= 3 y Hits < 3?
options:
  - { text: 'Para que ambas condiciones se excluyan entre sí y solo una rama sea TRUE cuando llega StampDown', correct: true, feedback: 'Correcto. Las condiciones mutuamente excluyentes hacen inequívoca la elección entre repetir el lazo o avanzar.' }
  - { text: 'Porque SFC no permite que dos transiciones compartan StampDown', feedback: 'Dos transiciones del mismo paso pueden evaluar la misma entrada; necesitan condiciones adicionales para distinguir las ramas.' }
  - { text: 'Porque Hits puede ser menor que 3 y mayor que 3 al mismo tiempo', feedback: 'Un INT guarda un solo valor cada vez; comprobar ambos lados asegura que cada rama cubra su caso exacto.' }
```

## Qué hará en la práctica

El proyecto inicial en `src/BufferRelease.sfc.json` solo tiene `IDLE` y `LOAD`, así que nunca retiene las cajas en el tope ni las libera de una en una. El escenario acciona el pulsador de inicio a los {{t:200}} ms, espera a que se acumulen cinco cajas detrás del tope, luego da cinco pulsaciones del pulsador de liberación a partir de los {{t:16000}} ms y comprueba `Done` a los {{t:36000}} ms con `Fault` apagada en todo momento. Construya el diagrama completo, guárdelo y pulse {{ui:learn.check}}.
