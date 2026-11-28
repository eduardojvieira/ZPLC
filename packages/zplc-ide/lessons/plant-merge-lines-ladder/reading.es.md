## La máquina

Cuando dos líneas de embalaje alimentan una única cinta de salida, la unión solo admite una caja a la vez. Cada alimentador tiene un tope retráctil para retener sus cajas y un sensor óptico que avisa cuando hay una caja esperando; un tercer sensor después de la unión vigila la zona de fusión compartida.

![La escena de fusionar dos líneas vista de frente. Tres cintas transportadoras forman una unión en T: FeedA entra por la izquierda hacia la unión, FeedB entra desde el primer plano hacia el costado de la unión y Outfeed sigue hacia la derecha. Cuatro marcas cian en las esquinas señalan EmitterA en el extremo izquierdo de FeedA con StartButton detrás, y EmitterB en el extremo cercano de FeedB. Cerca de la unión están EyeA con BladeA sobre FeedA y EyeB con BladeB sobre FeedB. A lo largo de Outfeed se encuentran EyeZone, DoneLight detrás de la cinta y Remover1 en el extremo derecho. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

La estación tiene trece elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `FeedA`       | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `FeedB`       | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Outfeed`     | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `EmitterA`    | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `EmitterB`    | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `BladeA`      | Tope retráctil       | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `BladeB`      | Tope retráctil       | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `EyeA`        | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeB`        | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeZone`     | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Remover1`    | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `DoneLight`   | Piloto luminoso      | Un piloto luminoso del panel del operador que muestra un estado.                                                                      |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                          |
| ---------------- | --------------------- | ---------------------- | ---------------------------------------------------- |
| `RunA`           | `FeedA.run`           | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                          |
| `RunB`           | `FeedB.run`           | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                          |
| `RunOut`         | `Outfeed.run`         | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                          |
| `EmitA`          | `EmitterA.emit`       | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea. |
| `EmitB`          | `EmitterB.emit`       | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea. |
| `HoldA`          | `BladeA.extend`       | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.    |
| `HoldB`          | `BladeB.extend`       | Salida del PLC · BOOL  | TRUE eleva el tope sobre la cinta; FALSE lo baja.    |
| `WaitA`          | `EyeA.detect`         | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.               |
| `WaitB`          | `EyeB.detect`         | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.               |
| `Zone`           | `EyeZone.detect`      | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.               |
| —                | `Remover1`            | —                      | No está cableado al PLC.                             |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.    |
| `Done`           | `DoneLight.lit`       | Salida del PLC · BOOL  | TRUE enciende el piloto.                             |

`Remover1` no está cableado al PLC: retira por su cuenta cada caja que llega al extremo de `Outfeed`. Su diagrama de escalera lee cuatro entradas y acciona ocho salidas.

## Prioridad y enclavamientos en diagrama de escalera

En diagrama de escalera, los peldaños se resuelven de arriba abajo en cada ciclo de escaneo, y una bobina escrita en un peldaño es vista de inmediato por los peldaños de abajo. Eso permite arbitrar con prioridad sin ningún bloque especial:

- **Coloque primero el peldaño de la concesión de mayor prioridad.** Sus contactos en serie comprueban la petición, contactos normalmente cerrados sobre ambos bits de concesión y un contacto normalmente cerrado sobre el sensor de zona compartida, accionando una **bobina de activación** (`S`).
- **Coloque el peldaño de la concesión de menor prioridad justo debajo.** Usa los mismos contactos normalmente cerrados sobre ambos bits de concesión. Cuando ambas peticiones llegan en el mismo ciclo de escaneo, el peldaño 1 activa el primer bit de concesión, así que su contacto normalmente cerrado en el peldaño 2 ya está abierto y la segunda concesión no puede activarse.
- **Borre ambos bits de concesión con bobinas de borrado (`R`)** solo cuando la pieza autorizada haya terminado de cruzar la zona compartida, y enclave de forma cruzada las bobinas de salida con contactos normalmente cerrados.

## Ejemplo resuelto

Dos carriles de camiones comparten una báscula de un solo carril. `NorthReq` y `SouthReq` están en TRUE mientras un camión espera en la barrera norte o sur, `BridgeBusy` está en TRUE mientras un camión está sobre la báscula, y `WeighDone` es un pulsador accionado por el operador de la báscula una vez que el camión despejó el puente. Los camiones del norte ganan cuando ambos carriles esperan, y solo puede encenderse una luz verde (`GreenNorth` o `GreenSouth`) a la vez.

```ld-figure
src: reading/weighbridge.ld.json
caption: Los peldaños 1 y 2 activan las concesiones en orden de prioridad; los peldaños 3 y 4 las borran con WeighDone; los peldaños 5 y 6 enclavan las dos luces verdes
```

El peldaño 1 comprueba `NorthReq` en serie con contactos normalmente cerrados sobre `AllowNorth`, `AllowSouth` y `BridgeBusy`, activando `AllowNorth`. El peldaño 2 comprueba `SouthReq` con los mismos contactos normalmente cerrados. Como el peldaño 1 se resuelve primero, `AllowNorth` ya está en TRUE cuando se resuelve el peldaño 2, así que `AllowSouth` permanece en FALSE siempre que ambos carriles pidan paso juntos.

```ld-try
src: reading/weighbridge.ld.json
inputs:
  - { name: NorthReq, kind: switch }
  - { name: SouthReq, kind: switch }
  - { name: BridgeBusy, kind: switch }
  - { name: WeighDone, kind: push }
outputs: [GreenNorth, GreenSouth]
timing: [NorthReq, SouthReq, GreenNorth, GreenSouth]
caption: Active NorthReq y SouthReq a la vez, y luego pulse WeighDone para ceder la báscula a Sur
```

Pulse Ejecutar y active a la vez `NorthReq` y `SouthReq`: se enciende `GreenNorth` mientras `GreenSouth` sigue apagada. Desactive `NorthReq` y compruebe que `GreenNorth` mantiene su enclavamiento. Pulse `WeighDone` una vez: `AllowNorth` se borra y en el siguiente ciclo de escaneo se enciende `GreenSouth`.

Aquí el operador de la báscula da `WeighDone` para terminar una concesión, y las salidas son luces verdes activas en alto. En la estación de la práctica no existe una entrada `WeighDone` — `Zone` está en FALSE tanto antes de que llegue la caja como después de que sale —, los topes retráctiles retienen cuando `HoldA` o `HoldB` está en TRUE, y su diagrama también debe cargar tres cajas en cada alimentador y contar las seis salidas.

## Errores comunes

- Omitir el contacto normalmente cerrado de la concesión de mayor prioridad en el segundo peldaño de concesión. Ambas bobinas de activación se disparan en el mismo ciclo de escaneo cuando ambas líneas esperan, abriendo ambos topes a la vez.
- Usar bobinas normales en lugar de bobinas de activación y de borrado para las concesiones. La concesión cae en cuanto el sensor de espera pasa a FALSE, mucho antes de que la caja despeje la unión.
- Colocar los peldaños de borrado antes que los de activación sin evitar una reactivación en el mismo ciclo de escaneo, o borrar la concesión siempre que `Zone` sea FALSE en lugar de esperar a que la caja llegue y salga.

> [!NOTE]
> Un enclavamiento en diagrama de escalera evita que la secuencia simulada abra ambos topes juntos; no es una función de seguridad para una máquina real.

## Compruébelo usted

```quiz
question: En el diagrama de escalera de la báscula, NorthReq y SouthReq están los dos en TRUE mientras BridgeBusy es FALSE. ¿Por qué el peldaño 2 no activa AllowSouth?
options:
  - { text: 'Porque el peldaño 1 activa AllowNorth primero en el mismo ciclo de escaneo, abriendo el contacto normalmente cerrado de AllowNorth en el peldaño 2', correct: true, feedback: 'Sí. El orden de los peldaños más el contacto normalmente cerrado de AllowNorth impone la prioridad de Norte.' }
  - { text: 'Porque el diagrama de escalera ejecuta solo un peldaño por ciclo de escaneo', feedback: 'El diagrama de escalera resuelve todos los peldaños de arriba abajo en cada ciclo de escaneo; el peldaño 2 se ejecuta, pero su contacto de AllowNorth no conduce.' }
  - { text: 'Porque una bobina de activación bloquea todas las bobinas de borrado debajo de ella', feedback: 'Una bobina de activación solo cambia su propia variable; bloquea el peldaño 2 porque este tiene un contacto normalmente cerrado sobre esa variable.' }
```

```quiz
question: ¿Qué ocurre si sustituye las bobinas de activación de AllowNorth y AllowSouth por bobinas normales?
options:
  - { text: 'La concesión se apaga en cuanto el sensor de entrada pasa a FALSE o el siguiente ciclo de escaneo comprueba el contacto normalmente cerrado propio', correct: true, feedback: 'Correcto. Una concesión debe permanecer enclavada después de que se despeje el sensor de petición hasta que la zona compartida quede libre.' }
  - { text: 'Ambas luces verdes quedan encendidas de forma permanente', feedback: 'Las bobinas normales caen cuando su peldaño deja de conducir, así que la concesión no puede mantenerse enclavada.' }
  - { text: 'El programa no compila', feedback: 'Las bobinas normales compilan, pero no mantienen memoria entre ciclos de escaneo como las bobinas de activación y de borrado.' }
```

## Qué hará en la práctica

El diagrama inicial en `src/MergeLines.ld.json` declara todas las variables locales, contadores, entradas y salidas sin peldaños. El escenario acciona el pulsador de inicio a los {{t:200}} ms y comprueba que las seis cajas — tres de cada alimentador — salgan por la cinta de salida sin colisiones y con `Done` encendida a los {{t:25000}} ms. Dibuje los peldaños de carga de los alimentadores, los enclavamientos de concesión por prioridad y los enclavamientos de los topes, guarde el archivo y pulse {{ui:learn.check}}.
