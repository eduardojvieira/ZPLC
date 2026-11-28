## La máquina

Esta estación ejecuta un lote fijo de tres cajas a lo largo de una cinta transportadora. A la izquierda, un emisor coloca cajas sobre la cinta junto a un pulsador de inicio y un sensor de entrada `EyeIn`. A la derecha, un sensor de salida `EyeOut` detecta las cajas que salen de la cinta hacia un retirador, y un piloto luminoso `DoneLight` indica cuando el lote ha terminado.

![La escena de cola contada vista de frente. Una cinta transportadora sobre patas va de izquierda a derecha. Cerca del extremo izquierdo, cuatro marcas cian en las esquinas muestran la zona del emisor, con StartButton detrás de la cinta y el sensor óptico EyeIn más a la derecha. Cerca del extremo derecho están el sensor óptico EyeOut, el piloto luminoso DoneLight y un retirador en el extremo final. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

La estación tiene siete elementos. `Remover1` retira toda caja que llega al extremo derecho y no está cableado al PLC; su programa sigue el lote a través de los dos sensores ópticos.

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

## Contar un lote en diagrama de escalera

Un bloque de función `CTU` (contador ascendente) suma 1 a su cuenta interna `CV` en cada **flanco ascendente** de su entrada `CU`, y pone su salida `Q` en TRUE cuando `CV` alcanza el valor preestablecido `PV`. Como solo observa flancos ascendentes, una caja que permanece delante de un sensor durante decenas de ciclos se cuenta igual una sola vez.

En diagrama de escalera, usted coloca un bloque `CTU` en un peldaño con el contacto del sensor alimentando `CU`, fija `R` y `PV`, y enlaza `Q` a una variable `BOOL` local. Los peldaños siguientes pueden leer ese `BOOL` con un contacto normalmente abierto (`| |`) para encender algo cuando se alcanza la cuenta, o con un contacto normalmente cerrado (`|/|`) para detener una acción una vez alcanzada la cuenta.

```timing
span: 6000
signals:
  - { name: CapSensor, edges: [400, 900, 1600, 2100, 2800, 3300, 4000, 4500] }
  - { name: BatchFull, edges: [4000, 6000] }
  - { name: Conveyor, edges: [200, 4000] }
  - { name: BatchDone, edges: [4000, 6000] }
caption: Cada pieza suma uno en su flanco ascendente; al llegar al valor preestablecido, BatchFull detiene la cinta y enciende BatchDone
```

Cuando las piezas recorren una cinta, la **carga** y la **descarga** ocurren en momentos distintos. Detener la cinta en cuanto la tercera pieza pasa el sensor de entrada deja esa pieza varada sobre la cinta. Y soltar una segunda pieza antes de que la anterior haya despejado la zona hace que viajen pegadas, y los sensores las ven como un solo objeto y las cuentan una vez.

## Ejemplo resuelto

Una estación de tapado de botellas ejecuta un lote de cuatro botellas que llegan desde una línea anterior, así que esta estación no tiene emisor propio. Pulsar `CycleStart` enclava `BatchRun`. Un único bloque `CTU` (`Bottles`, valor preestablecido `4`) cuenta cada botella en `CapSensor` y escribe su salida `Q` en `BatchFull`. Mientras `BatchRun` está en TRUE y `BatchFull` en FALSE, `Conveyor` funciona; una vez que han pasado cuatro botellas, `BatchFull` pasa a TRUE, `Conveyor` se detiene y `BatchDone` se enciende hasta que `ResetBatch` borra tanto `BatchRun` como el contador.

```ld-figure
src: reading/bottle-batch.ld.json
caption: CycleStart enclava BatchRun, Bottles cuenta cuatro botellas en BatchFull, y BatchFull detiene Conveyor y enciende BatchDone
```

Léalo de arriba abajo. Los peldaños 1 y 2 enclavan y borran `BatchRun`. El peldaño 3 alimenta `CapSensor` en `Bottles.CU`, conecta `ResetBatch` a `R`, fija `PV` en `4` y enlaza `Q` a `BatchFull`. El peldaño 4 pone `BatchRun` en serie con un contacto normalmente cerrado sobre `BatchFull`, así que la cinta se detiene en el instante en que se cuenta la cuarta botella. El peldaño 5 copia `BatchFull` a `BatchDone`.

```ld-try
src: reading/bottle-batch.ld.json
inputs:
  - { name: CycleStart, kind: push }
  - { name: CapSensor, kind: push }
  - { name: ResetBatch, kind: push }
outputs: [Conveyor, BatchDone]
timing: [CycleStart, CapSensor, Conveyor, BatchDone]
caption: Pulse CycleStart, dé cuatro pulsos a CapSensor y luego pulse ResetBatch
```

Pulse Ejecutar y después pulse `CycleStart`: `Conveyor` se enciende. Dé cuatro pulsos a `CapSensor`: en el cuarto flanco ascendente, `Conveyor` se apaga y `BatchDone` se enciende. Pulse `ResetBatch` para borrar tanto la cuenta como la memoria del lote.

Esta estación de tapado cuenta en un solo sensor y nunca tiene que emitir piezas por sí misma. En la práctica, su estación tiene un sensor de entrada y otro de salida, y debe soltar tres cajas una por una sin colisiones.

## Errores comunes

- Usar un solo contador para carga y descarga. Si la cinta se detiene cuando entra la tercera caja, las dos últimas cajas quedan sobre la cinta y nunca llegan al retirador.
- Soltar una caja nueva mientras la anterior sigue en la zona del emisor. Las cajas viajan pegadas y los sensores las cuentan como una.
- Olvidar que `Emit` actúa por **flanco ascendente**. Dejar `Emit` fijo en TRUE suelta solo la primera caja; debe volver a FALSE antes del siguiente flanco ascendente.
- Olvidar enlazar `Q` de un bloque `CTU` a una variable local, o usar un contacto normalmente abierto donde hace falta uno normalmente cerrado para detener una acción cuando se alcanza la cuenta.

> [!NOTE]
> Un bloque `CTU` cuenta flancos ascendentes de `CU` incluso si la cinta está detenida, siempre que el sensor conmute. Mantenga `R` en FALSE mientras un lote está en curso para no borrar la cuenta a mitad del lote.

## Compruébelo usted

```quiz
question: 'Una caja permanece delante de EyeIn durante 40 ciclos mientras EyeIn alimenta la entrada CU de un bloque CTU. ¿Cuánto aumenta CV?'
options:
  - { text: 'En 1, porque CTU cuenta flancos ascendentes de CU', correct: true, feedback: 'Correcto. Solo la transición de FALSE a TRUE suma 1.' }
  - { text: 'En 40, una vez en cada ciclo mientras EyeIn esté en TRUE', feedback: 'Un CTU no cuenta ciclos; cuenta flancos ascendentes.' }
  - { text: 'En 0, a menos que se coloque un contacto de flanco ascendente antes de CU', feedback: 'CTU detecta flancos ascendentes internamente, así que basta con un contacto simple en CU.' }
```

```quiz
question: 'En el ejemplo resuelto de la estación de tapado, BatchRun está en TRUE y cuatro botellas pasaron por CapSensor, así que BatchFull está en TRUE. ¿Qué valen Conveyor y BatchDone?'
options:
  - { text: 'Conveyor está en FALSE y BatchDone en TRUE', correct: true, feedback: 'Sí. El contacto normalmente cerrado de BatchFull abre el peldaño 4 para detener Conveyor, mientras el peldaño 5 enciende BatchDone.' }
  - { text: 'Tanto Conveyor como BatchDone están en TRUE', feedback: 'El peldaño 4 tiene un contacto normalmente cerrado sobre BatchFull, así que Conveyor se apaga cuando BatchFull es TRUE.' }
  - { text: 'Tanto Conveyor como BatchDone están en FALSE', feedback: 'El peldaño 5 tiene un contacto normalmente abierto sobre BatchFull, así que BatchDone se enciende cuando BatchFull es TRUE.' }
```

## Qué hará en la práctica

El programa inicial declara las entradas Start, EyeIn y EyeOut, las salidas Run, Emit y Done, y variables locales que incluyen dos contadores CTU, todavía sin peldaños. Una pulsación de Start a los {{t:200}} ms debe iniciar un lote de tres cajas: cargar tres cajas sobre la cinta una por una sin colisiones, llevarlas por la cinta, y encender Done y detener la cinta en cuanto la tercera caja llegue a EyeOut. Después pulse {{ui:learn.check}}.
