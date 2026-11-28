## La máquina

Esta estación une dos piezas en una sola: una tapa llega por la cinta izquierda, una base llega por la cinta central, y un manipulador de dos ejes levanta la tapa con una ventosa y la coloca sobre la base. Una vez colocada la tapa, el tope retráctil de la cinta de bases se abre y el ensamble terminado sale por la cinta de salida hacia el retirador.

![La escena del ensamblador de dos ejes vista de frente. Tres cintas transportadoras están en línea de izquierda a derecha: LidBelt con LidEmitter, LidBlade y LidEye a la izquierda; BaseBelt con BaseEmitter, BaseBlade y BaseEye en el centro; y ExitBelt terminando en Remover1 a la derecha. Un bastidor manipulador de dos ejes, Pick1, une LidBelt y BaseBelt. StartButton está detrás de LidBelt y StackLight1 está junto a ExitBelt. Cada elemento tiene una etiqueta con su nombre, su tipo y sus señales conectadas.](images/machine.es.png)

La estación tiene trece elementos. Las tablas dicen qué es cada uno en una planta real y qué significan sus señales para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                    | Qué es en una planta real                                                                                                             |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `LidBelt`     | Cinta transportadora    | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `BaseBelt`    | Cinta transportadora    | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `ExitBelt`    | Cinta transportadora    | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `LidEmitter`  | Emisor de piezas        | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `BaseEmitter` | Emisor de piezas        | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `LidBlade`    | Tope retráctil          | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `BaseBlade`   | Tope retráctil          | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `LidEye`      | Sensor óptico difuso    | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `BaseEye`     | Sensor óptico difuso    | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Pick1`       | Manipulador de dos ejes | Una unidad de manipulación de dos ejes que toma una pieza con una pinza y la deja en otro lugar.                                      |
| `Remover1`    | Retirador de piezas     | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton` | Pulsador                | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `StackLight1` | Torre de luces          | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                                 |
| ---------------- | --------------------- | ---------------------- | ----------------------------------------------------------- |
| `RunLid`         | `LidBelt.run`         | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                 |
| `RunBase`        | `BaseBelt.run`        | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                 |
| `RunExit`        | `ExitBelt.run`        | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                 |
| `EmitLid`        | `LidEmitter.emit`     | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea.        |
| `EmitBase`       | `BaseEmitter.emit`    | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea.        |
| `HoldLid`        | `LidBlade.extend`     | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.           |
| `HoldBase`       | `BaseBlade.extend`    | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.           |
| `LidReady`       | `LidEye.detect`       | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                      |
| `BaseReady`      | `BaseEye.detect`      | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                      |
| `XAtMin`         | `Pick1.xAtMin`        | Entrada del PLC · BOOL | TRUE cuando el eje X está en su límite inicial.             |
| `XAtMax`         | `Pick1.xAtMax`        | Entrada del PLC · BOOL | TRUE cuando el eje X está en su límite final.               |
| `YAtMin`         | `Pick1.yAtMin`        | Entrada del PLC · BOOL | TRUE cuando el eje Y (vertical) está en su punto más bajo.  |
| `YAtMax`         | `Pick1.yAtMax`        | Entrada del PLC · BOOL | TRUE cuando el eje Y (vertical) está en su punto más alto.  |
| `Gripped`        | `Pick1.gripped`       | Entrada del PLC · BOOL | TRUE mientras la pinza sostiene una pieza.                  |
| `XPlus`          | `Pick1.xPlus`         | Salida del PLC · BOOL  | TRUE mueve el eje X hacia adelante mientras se mantiene.    |
| `XMinus`         | `Pick1.xMinus`        | Salida del PLC · BOOL  | TRUE mueve el eje X hacia atrás mientras se mantiene.       |
| `YPlus`          | `Pick1.yPlus`         | Salida del PLC · BOOL  | TRUE sube el eje Y mientras se mantiene.                    |
| `YMinus`         | `Pick1.yMinus`        | Salida del PLC · BOOL  | TRUE baja el eje Y mientras se mantiene.                    |
| `Grip`           | `Pick1.grip`          | Salida del PLC · BOOL  | TRUE cierra la pinza (vacío activado, o mordazas cerradas). |
| —                | `Remover1`            | —                      | No está cableado al PLC.                                    |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.           |
| `Green`          | `StackLight1.green`   | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                             |
| `Amber`          | `StackLight1.amber`   | Salida del PLC · BOOL  | TRUE enciende la lámpara ámbar.                             |

Observe cómo se gobierna `Pick1` en esta escena: cuatro salidas de dirección (`XPlus`, `XMinus`, `YPlus`, `YMinus`) mueven los ejes mientras están en TRUE, y cuatro finales de carrera (`XAtMin`, `XAtMax`, `YAtMin`, `YAtMax`) informan cuándo un eje llegó a cada extremo.

## Un paso por movimiento y una rama según una cuenta

Una unidad de manipulación con dos ejes nunca debe cruzar de una cinta a otra mientras está abajo, porque golpearía las piezas y los topes. En un diagrama de funciones secuenciales, la forma más clara de imponer ese orden es dar a cada movimiento su propio paso y hacer que su transición espere el final de carrera al término de ese movimiento.

- **Un movimiento por paso:** un movimiento vertical avanza hasta que `YAtMin` o `YAtMax` está en TRUE; un movimiento horizontal se ejecuta solo cuando el eje vertical está arriba y espera `XAtMin` o `XAtMax`.
- **Cada paso escribe todas las salidas:** una acción `N` se ejecuta mientras su paso está activo, y las salidas conservan su último valor cuando el paso termina. Escribir todas las salidas en la acción `N` de cada paso garantiza que ninguna orden de dirección, válvula de vacío o pulso de emisor quede activada por descuido.
- **Contar una sola vez con `P1`:** una acción `N` se ejecuta en cada ciclo de escaneo mientras el paso está activo, así que sumar 1 a un contador dentro de una acción `N` contaría ciclos de escaneo en lugar de ciclos de máquina. Una acción `P1` (pulso al entrar) se ejecuta en el único ciclo de escaneo en que el paso se activa, así que incrementa el contador una vez por ciclo.
- **Ramificar con transiciones excluyentes:** cuando un paso puede llevar a dos pasos siguientes distintos —por ejemplo, volver para otro ciclo o ir a un paso final—, las transiciones salientes llevan condiciones que se excluyen entre sí, o prioridades que eligen primero la condición más específica.

## Ejemplo resuelto

Considere un polipasto de inmersión de un solo eje sobre un tanque de limpieza. Una pulsación de `RunBtn` baja una cesta al baño, la deja sumergida cinco segundos, la vuelve a subir y repite la inmersión **dos** veces antes de encender `DoneLamp`. Las entradas son `RunBtn`, `AtTop` y `AtBottom`; las salidas son `GoUp`, `GoDown` y `DoneLamp`; una variable local entera `Dips` empieza en `0`.

El diagrama necesita cinco pasos:

1. `WAIT` (inicial): la acción `N` escribe `GoUp := FALSE; GoDown := FALSE; DoneLamp := FALSE;`. Transición a `LOWER`: `RunBtn`.
2. `LOWER`: la acción `N` escribe `GoUp := FALSE; GoDown := NOT AtBottom; DoneLamp := FALSE;`. Transición a `SOAK`: `AtBottom`.
3. `SOAK`: la acción `N` pone las tres salidas en FALSE, y una acción `P1` escribe `Dips := Dips + 1;`. Transición a `LIFT`: `SOAK.T >= T#5s`.
4. `LIFT`: la acción `N` escribe `GoUp := NOT AtTop; GoDown := FALSE; DoneLamp := FALSE;`. Dos transiciones salen de `LIFT`:
   - Hacia `DONE` (prioridad 1): `AtTop AND Dips >= 2`
   - De vuelta a `LOWER` (prioridad 2): `AtTop AND Dips < 2`
5. `DONE`: la acción `N` escribe `GoUp := FALSE; GoDown := FALSE; DoneLamp := TRUE;`.

```timing
span: 20000
signals:
  - { name: RunBtn, edges: [500, 1000] }
  - { name: LOWER, edges: [500, 2500, 9500, 11500] }
  - { name: SOAK, edges: [2500, 7500, 11500, 16500] }
  - { name: LIFT, edges: [7500, 9500, 16500, 18500] }
  - { name: DONE, edges: [18500, 20000] }
marks:
  - { from: 2500, to: 7500, label: 'Dips = 1' }
  - { from: 11500, to: 16500, label: 'Dips = 2' }
caption: La acción P1 en SOAK incrementa Dips una vez por ciclo, y la rama tras LIFT elige LOWER o DONE
```

Observe dos detalles. Primero, `SOAK` incrementa `Dips` con `P1`, así que durante los cinco segundos de inmersión `Dips` aumenta una vez, no en cada ciclo de escaneo. Segundo, las dos transiciones que salen de `LIFT` se excluyen entre sí: mientras `Dips` vale 1, solo puede dispararse la transición de vuelta a `LOWER`; cuando `Dips` vale 2, solo puede dispararse la transición hacia `DONE`.

El polipasto de inmersión tiene un solo eje y ninguna pieza que alimentar, retener o agarrar. En la práctica usted también debe coordinar dos ejes sin cruzar mientras está abajo, manejar el agarre y la suelta por vacío, y coordinar los emisores y topes retráctiles para que cada par llegue, se ensamble y salga sin incidentes.

## Errores comunes

- Incrementar un contador de ciclos dentro de una acción `N` en lugar de una acción `P1`. El contador sube en cada ciclo de escaneo mientras el paso está activo y alcanza el objetivo en el primer ciclo.
- Dejar una salida sin escribir en la acción `N` de un paso. Una orden de dirección, un pulso de emisor o la salida de vacío queda en TRUE después de terminar el paso.
- Iniciar un movimiento horizontal antes de que el eje vertical haya llegado a su final de carrera superior. El brazo barre las cintas estando abajo y tira las piezas.
- Soltar una pieza retenida en la cinta antes de que la pinza la haya liberado, o volver a cerrar un tope retráctil mientras una pieza que sale sigue delante de su sensor.
- Dar a un paso con ramificación dos transiciones cuyas condiciones pueden ser ambas TRUE sin una prioridad clara, u olvidar la rama que vuelve atrás para el siguiente ciclo.

> [!NOTE]
> Una acción `P1` se ejecuta una sola vez cuando su paso se activa, aunque el paso permanezca activo varios segundos. Si desea contar ciclos completados, asocie la acción `P1` a un paso al que se entre exactamente una vez por ciclo.

## Compruébelo usted

```quiz
question: En el polipasto de inmersión, ¿qué ocurriría si Dips := Dips + 1; estuviera en la acción N de SOAK en lugar de en una acción P1?
options:
  - { text: 'Dips aumentaría en cada ciclo de escaneo durante la inmersión, así que el diagrama terminaría tras una sola inmersión', correct: true, feedback: 'Sí. Una acción N se ejecuta en cada ciclo de escaneo mientras el paso está activo; P1 se ejecuta solo en el ciclo en que el paso se activa.' }
  - { text: 'Dips nunca cambiaría porque las acciones N no pueden escribir variables locales', feedback: 'Una acción N puede escribir variables locales; el problema es que se ejecuta en cada ciclo de escaneo, no una vez.' }
  - { text: 'El diagrama se quedaría en SOAK para siempre', feedback: 'La transición de salida de SOAK depende de SOAK.T, así que igual saldría, pero Dips ya estaría muy por encima de 2.' }
```

```quiz
question: En el polipasto de inmersión, LIFT está activo después de la primera inmersión (Dips = 1) y AtTop se pone en TRUE. ¿Qué paso se activa en el siguiente ciclo de escaneo?
options:
  - { text: 'LOWER, porque AtTop AND Dips < 2 es TRUE y AtTop AND Dips >= 2 es FALSE', correct: true, feedback: 'Correcto. Las dos condiciones se excluyen entre sí, así que con Dips = 1 el diagrama vuelve a LOWER para la segunda inmersión.' }
  - { text: 'DONE, porque DONE tiene prioridad 1', feedback: 'La prioridad solo desempata cuando dos condiciones son TRUE a la vez. Aquí Dips >= 2 es FALSE.' }
  - { text: 'Tanto LOWER como DONE al mismo tiempo', feedback: 'Sus condiciones se excluyen entre sí, así que solo se dispara una transición.' }
```

## Qué hará en la práctica

El diagrama inicial en `src/Assembler.sfc.json` solo tiene `IDLE` y `HOMING`, así que después de llevar el brazo a su posición de partida espera indefinidamente y no alimenta piezas. Usted ampliará el diagrama para alimentar tapas y bases, coordinar ambos ejes y la ventosa para ensamblar tres pares, dejar salir cada ensamble terminado por la cinta de salida y encender `Green` cuando los tres estén listos. Guarde su diagrama y pulse {{ui:learn.check}}.
