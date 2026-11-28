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

`Remover1` no está cableado al PLC: retira por su cuenta cada caja que llega al extremo de `Outfeed`. Su programa lee cuatro entradas y acciona ocho salidas.

## Prioridad, concesiones y enclavamientos

Cuando dos líneas piden el mismo recurso al mismo tiempo, accionar cada actuador directamente desde su propio sensor provoca una colisión: ambos topes se abren juntos y dos cajas chocan en la unión. Una fusión necesita tres reglas trabajando juntas.

- **Una memoria de concesión por solicitante.** En lugar de reaccionar directamente al sensor de espera, el programa enclava un bit de concesión para la línea ganadora. Mientras haya una concesión activa, no se puede otorgar ninguna nueva, aunque la otra línea empiece a esperar.
- **Una regla de prioridad clara.** Cuando no hay concesión activa y la zona compartida está libre, un `IF ... ELSIF` decide quién pasa primero. Como `IF` se evalúa antes que `ELSIF`, la primera rama gana siempre que ambas peticiones sean TRUE en el mismo ciclo de escaneo.
- **Un enclavamiento en las salidas.** Las salidas se escriben de modo que las dos acciones opuestas nunca puedan habilitarse a la vez. Incluso si un error intentara activar ambas concesiones, la expresión de salida impide abrir ambos lados juntos.

Por último, una concesión debe terminar solo cuando la pieza autorizada haya terminado de usar la zona compartida — nunca en el instante en que se despeja el sensor de espera, porque en ese momento la pieza todavía está cruzando la unión.

## Ejemplo resuelto

Dos carriles de camiones comparten una báscula de un solo carril. `NorthReq` y `SouthReq` están en TRUE mientras un camión espera en la barrera norte o sur, `BridgeBusy` está en TRUE mientras un camión está sobre la báscula, y `WeighDone` es un pulso del operador de la báscula una vez que el camión salió por el otro lado. Los camiones del norte tienen prioridad cuando ambos carriles esperan, y solo puede encenderse una luz verde (`GreenNorth` o `GreenSouth`) a la vez.

```st
PROGRAM Weighbridge
VAR_INPUT
    NorthReq   : BOOL;
    SouthReq   : BOOL;
    BridgeBusy : BOOL;
    WeighDone  : BOOL;
END_VAR
VAR_OUTPUT
    GreenNorth : BOOL;
    GreenSouth : BOOL;
END_VAR
VAR
    AllowNorth : BOOL;
    AllowSouth : BOOL;
END_VAR

IF NOT AllowNorth AND NOT AllowSouth AND NOT BridgeBusy THEN
    IF NorthReq THEN
        AllowNorth := TRUE;
    ELSIF SouthReq THEN
        AllowSouth := TRUE;
    END_IF;
END_IF;

IF WeighDone THEN
    AllowNorth := FALSE;
    AllowSouth := FALSE;
END_IF;

GreenNorth := AllowNorth AND NOT AllowSouth;
GreenSouth := AllowSouth AND NOT AllowNorth;
END_PROGRAM
```

```timing
span: 8000
signals:
  - { name: NorthReq, edges: [500, 1500] }
  - { name: SouthReq, edges: [500, 5000] }
  - { name: AllowNorth, edges: [500, 3500] }
  - { name: AllowSouth, edges: [3700, 7000] }
  - { name: BridgeBusy, edges: [1200, 3200, 4600, 6600] }
  - { name: WeighDone, edges: [3500, 3700, 7000, 7200] }
caption: Ambos carriles piden paso a la vez; Norte gana primero y Sur espera hasta que WeighDone borre la concesión de Norte
```

Siga el arbitraje. `NorthReq` y `SouthReq` pasan a TRUE juntos mientras la báscula está libre. El `IF` exterior permite una sola concesión nueva, y el `IF NorthReq` interior se evalúa antes que `ELSIF SouthReq`, así que `AllowNorth` se enclava en TRUE mientras `AllowSouth` sigue en FALSE. Mientras el camión del norte cruza, `AllowNorth` bloquea el `IF` exterior, así que `SouthReq` espera. Mientras `WeighDone` está en TRUE borra ambas concesiones en cada ciclo de escaneo; en el primer ciclo de escaneo después de que vuelve a FALSE, con `BridgeBusy` en FALSE, `AllowSouth` se enclava.

Fíjese en lo que esta báscula le da resuelto y la estación de fusión no. Aquí un operador envía `WeighDone` cuando el camión ya salió, y las salidas son luces verdes activas en alto. En la estación de la práctica no existe una entrada `WeighDone` — el sensor de zona está en FALSE tanto antes de que llegue la caja como después de que sale —, los topes retienen cuando su salida está en TRUE en lugar de FALSE, y el programa también debe cargar tres cajas en cada alimentador y contar las seis salidas.

## Errores comunes

- Comprobar `WaitA` y `WaitB` en dos sentencias `IF` separadas en lugar de un único `IF ... ELSIF`. Cuando ambos sensores están en TRUE en el mismo ciclo de escaneo, ambas concesiones se enclavan juntas y dos cajas chocan.
- Borrar una concesión en cuanto `Zone` está en FALSE. `Zone` ya es FALSE cuando se da la concesión, así que la concesión termina en el mismo ciclo de escaneo, el tope retráctil nunca se abre y las cajas esperan detrás de él.
- Olvidar que los topes retráctiles retienen mientras su salida está en TRUE. Un tope escrito en FALSE mientras la línea funciona y nada está concedido deja que las cajas rueden directamente hacia la fusión.
- Mantener Emit en TRUE. El emisor suelta una caja por flanco ascendente, así que una salida mantenida pone una sola caja en el alimentador; cada caja siguiente necesita que la salida pase a FALSE y de nuevo a TRUE.

> [!NOTE]
> Un enclavamiento en código del PLC protege la secuencia contra colisiones lógicas en simulación, no a las personas en una planta real. Los resguardos físicos y las paradas de emergencia pertenecen al hardware dedicado.

## Compruébelo usted

```quiz
question: En el ejemplo de la báscula, NorthReq y SouthReq pasan a TRUE en el mismo ciclo de escaneo mientras BridgeBusy es FALSE. ¿Por qué AllowSouth permanece en FALSE?
options:
  - { text: 'Porque NorthReq se evalúa primero en IF ... ELSIF, así que la rama ELSIF no se ejecuta en ese ciclo de escaneo, y en el siguiente AllowNorth bloquea nuevas concesiones', correct: true, feedback: 'Sí. El orden de IF ... ELSIF da prioridad a Norte, y el enclavamiento activo de AllowNorth mantiene cerrado el IF exterior hasta WeighDone.' }
  - { text: 'Porque SouthReq se ignora siempre que NorthReq haya estado alguna vez en TRUE', feedback: 'SouthReq no se ignora de forma permanente; recibe la concesión en cuanto AllowNorth se borra y BridgeBusy es FALSE.' }
  - { text: 'Porque BridgeBusy pasa a TRUE en el mismo ciclo de escaneo que NorthReq', feedback: 'El camión tarda en llegar a la báscula; lo que bloquea a Sur en el siguiente ciclo de escaneo es que AllowNorth está en TRUE.' }
```

```quiz
question: ¿Por qué la báscula espera a WeighDone para borrar AllowNorth en lugar de borrarlo cuando NorthReq pasa a FALSE?
options:
  - { text: 'Porque el camión que sale de la barrera de entrada todavía está cruzando la báscula compartida, así que conceder el paso a Sur de inmediato causaría una colisión', correct: true, feedback: 'Correcto. Dejar el sensor de espera solo significa que la pieza empezó a moverse; la concesión debe mantenerse hasta que la zona compartida quede libre.' }
  - { text: 'Porque NorthReq sigue en TRUE hasta que el camión sale de la báscula', feedback: 'NorthReq está en la barrera de entrada y pasa a FALSE en cuanto el camión avanza hacia la báscula.' }
  - { text: 'Porque AllowNorth no se puede borrar con una sentencia IF', feedback: 'Cualquier variable BOOL en VAR se puede borrar con un IF; la decisión es qué evento demuestra que la zona compartida quedó libre.' }
```

## Qué hará en la práctica

El proyecto inicial en `src/MergeLines.st` declara las cuatro entradas y las ocho salidas y no acciona nada. El escenario acciona el pulsador de inicio a los {{t:200}} ms y comprueba que las seis cajas — tres de cada alimentador — salgan por la cinta de salida sin colisiones y con `Done` encendida a los {{t:25000}} ms. Escriba la carga de los alimentadores, el arbitraje por prioridad y los enclavamientos de los topes, guarde el archivo y pulse {{ui:learn.check}}.
