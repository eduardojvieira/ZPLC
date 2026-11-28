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

## Una máquina de estados en escalera con EQ y MOVE

Cuando una secuencia tiene muchos movimientos, una variable entera `State` es más fácil de manejar que una docena de bits de paso separados: un `INT` guarda solo un número a la vez, de modo que nunca pueden quedar dos estados activos juntos.

En diagrama de escalera, cada transición es un peldaño: un bloque `EQ` comprueba el número de estado actual, contactos en serie comprueban la señal de realimentación (como un final de carrera o una confirmación de agarre) y un bloque `MOVE` escribe el siguiente número de estado en la misma variable `INT`. Como `MOVE` solo se ejecuta mientras su peldaño tiene energía, varios peldaños de transición pueden escribir en la misma variable de estado.

Coloque los peldaños de transición en **orden inverso** (el estado más alto arriba, el más bajo abajo). Como la escalera resuelve los peldaños de arriba abajo, invertirlos garantiza que pasar del estado 1 al estado 2 no dispare el peldaño del estado 2 en el mismo ciclo de escaneo. Debajo de las transiciones, un peldaño de salida por bobina usa `EQ` (o `GE` y `LE` en serie para un rango de estados) y un contacto normalmente cerrado de final de carrera para accionar cada actuador con claridad.

## Ejemplo resuelto

Un polipasto de inmersión de un solo eje baja piezas metálicas a un tanque de temple, las sumerge durante dos segundos y las vuelve a elevar. `Step` es un `INT` (0 reposo, 1 cerrar pestillo, 2 bajar, 3 sumergir, 4 elevar, 5 abrir pestillo). El peldaño 6 muestra una transición típica: mientras `Step` vale 1 y `Locked` está activo, `MOVE` escribe 2 en `Step` para que pueda empezar el descenso.

```ld-figure
src: reading/dip-hoist.ld.json
rung: 6
caption: 'Transición del paso 1 al paso 2: EQ comprueba el paso actual, Locked confirma el pestillo y MOVE avanza Step'
```

El peldaño 8 muestra una salida que abarca varios estados: `GE(Step, 1)` y `LE(Step, 4)` en serie mantienen energizada la bobina `Lock` desde el cierre hasta la elevación, y la sueltan automáticamente en el paso 5.

```ld-figure
src: reading/dip-hoist.ld.json
rung: 8
caption: 'Un rango de estados en escalera: GE y LE en serie accionan una sola bobina Lock entre los pasos 1 y 4'
```

Pruebe el polipasto en el laboratorio. Active primero `Top`, pulse `PartReady` una vez, luego active `Locked` para iniciar el descenso (`GoDown`), desactive `Top` cuando el polipasto deja la parte superior y active `Bottom` para sumergir durante dos segundos; después desactive `Bottom`, observe cómo `GoUp` se activa y vuelva a activar `Top`: `GoUp` se detiene, `Lock` se abre y, al desactivar `Locked`, `Step` vuelve a 0.

```ld-try
src: reading/dip-hoist.ld.json
inputs:
  - { name: PartReady, kind: push }
  - { name: Top, kind: switch }
  - { name: Locked, kind: switch }
  - { name: Bottom, kind: switch }
outputs: [Lock, GoDown, GoUp]
timing: [PartReady, Lock, GoDown, GoUp]
caption: Siga cada paso activando el interruptor de realimentación del movimiento en curso
```

Este polipasto tiene un solo eje vertical y sumerge una pieza cada vez. La estación de la práctica tiene dos ejes, dos cintas, un tope retráctil y un lote de cuatro cajas: cuándo dejar que una caja se asiente, cuándo alimentar cada caja y cómo contar cuatro cajas son decisiones que quedan para usted.

## Errores comunes

- Colocar los peldaños de transición en orden directo (0, 1, 2, ...). Si dos condiciones se cumplen en el mismo ciclo de escaneo, el programa salta dos estados de una vez; coloque las transiciones en orden inverso.
- Accionar la misma bobina de salida en dos peldaños. ZPLC rechaza una bobina duplicada; reúna todos los estados que necesitan un actuador en un solo peldaño con ramas en paralelo o un rango `GE`/`LE`.
- Elevar antes de que `Gripped` esté en TRUE o mover en horizontal antes de que `YMax` esté en TRUE. Ponga siempre el contacto de realimentación del movimiento anterior en serie con `EQ` en el peldaño de transición.
- Dejar `Outfeed` en marcha mientras se deposita una caja. Mantenga `RunOut` apagado durante los estados de depósito y asentamiento para que la caja repose antes de que la cinta avance.
- Olvidar un contacto normalmente cerrado de final de carrera en la bobina de un eje. Sin el contacto normalmente cerrado del final de carrera, el eje sigue empujando contra su extremo mientras el estado espera otra cosa.

## Compruébelo usted

```quiz
question: ¿Por qué los peldaños de transición de una máquina de estados con EQ y MOVE se colocan en orden inverso en escalera?
options:
  - { text: 'Para que avanzar Step en un peldaño no dispare el peldaño del estado siguiente en el mismo ciclo de escaneo', correct: true, feedback: 'Sí. Como los peldaños se evalúan de arriba abajo, poner primero los estados mayores garantiza como máximo una transición por ciclo de escaneo.' }
  - { text: 'Porque los bloques MOVE solo funcionan cuando sus números disminuyen', feedback: 'MOVE escribe cualquier número en cualquier orden; el orden inverso de peldaños controla la evaluación del ciclo de escaneo.' }
  - { text: 'Porque los bloques EQ no pueden leer Step más de una vez por ciclo de escaneo', feedback: 'Cualquier cantidad de bloques EQ puede leer Step en el mismo ciclo de escaneo.' }
```

```quiz
question: En el polipasto del ejemplo resuelto, ¿por qué el peldaño 8 usa GE(Step, 1) y LE(Step, 4) en serie para accionar Lock?
options:
  - { text: 'Para mantener una sola bobina Lock energizada en los pasos 1 a 4 y apagada en los pasos 0 y 5', correct: true, feedback: 'Correcto. En escalera se exige una sola bobina por variable de salida, y GE/LE cubre todo el rango con claridad.' }
  - { text: 'Para escribir los números 1 y 4 en Step al mismo tiempo', feedback: 'GE y LE son comparaciones, no escrituras; solo evalúan Step.' }
  - { text: 'Para evitar que Lock se encienda cuando Locked está en FALSE', feedback: 'Lock debe encenderse en el paso 1 mientras Locked aún está en FALSE para que el pestillo pueda cerrarse.' }
```

## Qué hará en la práctica

El diagrama inicial en `src/BeltTransfer.ld.json` declara todas las entradas y salidas de la estación y todavía no tiene peldaños. El escenario acciona `Start` a los {{t:200}} ms y lo suelta a los {{t:400}} ms. Usted construirá la máquina de estados con `EQ` y `MOVE` que alimenta cuatro cajas de una en una, detiene cada una en el tope, la toma y la deja sobre la cinta de salida detenida, enciende `Busy` mientras corre el traslado y enciende `Done` cuando la cuarta caja cruza `EyeOut`. Guarde el archivo y pulse {{ui:learn.check}}.
