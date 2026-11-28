## La máquina

Un paletizador de capas arma una capa completa de cajas en una cinta de alimentación, las escuadra en un bloque compacto, levanta la capa entera con un cabezal de pinza y la apila sobre una tarima. Las líneas de embalaje usan esta disposición cuando las cajas llegan en pares y deben salir sobre tarimas en capas ordenadas y repetidas.

![La escena del paletizador de capas vista de frente. A la izquierda, una cinta de alimentación lleva cajas desde dos emisores de carril, pasando frente a un pulsador de inicio y un sensor óptico hasta una zona de formación con paredes. Sobre la zona, un pórtico lleva un cabezal de pinza vertical hacia la derecha hasta una tarima de madera, con una torre de luces junto a la tarima. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

La estación tiene ocho elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Emitter1`    | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Emitter2`    | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `EyeIn`       | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Palletizer1` | Paletizador de capas | Una máquina que ordena cajas en una capa y deja la capa entera sobre una tarima.                                                      |
| `Pallet1`     | Tarima               | Una tarima de madera que lleva una carga por la planta y hasta un camión.                                                             |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `StackLight1` | Torre de luces       | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                    | Dirección y tipo       | Significado                                                            |
| ---------------- | ------------------------ | ---------------------- | ---------------------------------------------------------------------- |
| `Run`            | `Infeed.run`             | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                            |
| `Emit1`          | `Emitter1.emit`          | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea.                   |
| `Emit2`          | `Emitter2.emit`          | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea.                   |
| `Eye`            | `EyeIn.detect`           | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                                 |
| `XMin`           | `Palletizer1.xAtMin`     | Entrada del PLC · BOOL | TRUE cuando el eje X está en su límite inicial.                        |
| `XMax`           | `Palletizer1.xAtMax`     | Entrada del PLC · BOOL | TRUE cuando el eje X está en su límite final.                          |
| `YMin`           | `Palletizer1.yAtMin`     | Entrada del PLC · BOOL | TRUE cuando el eje Y (vertical) está en su punto más bajo.             |
| `YMax`           | `Palletizer1.yAtMax`     | Entrada del PLC · BOOL | TRUE cuando el eje Y (vertical) está en su punto más alto.             |
| `Squared`        | `Palletizer1.squared`    | Entrada del PLC · BOOL | TRUE cuando el empujador de escuadrado está cerrado.                   |
| `LayerReady`     | `Palletizer1.layerReady` | Entrada del PLC · BOOL | TRUE cuando una capa completa de cajas reposa en la zona de formación. |
| `Gripped`        | `Palletizer1.gripped`    | Entrada del PLC · BOOL | TRUE mientras la pinza sostiene una pieza.                             |
| `XPlus`          | `Palletizer1.xPlus`      | Salida del PLC · BOOL  | TRUE mueve el eje X hacia adelante mientras se mantiene.               |
| `XMinus`         | `Palletizer1.xMinus`     | Salida del PLC · BOOL  | TRUE mueve el eje X hacia atrás mientras se mantiene.                  |
| `YPlus`          | `Palletizer1.yPlus`      | Salida del PLC · BOOL  | TRUE sube el eje Y mientras se mantiene.                               |
| `YMinus`         | `Palletizer1.yMinus`     | Salida del PLC · BOOL  | TRUE baja el eje Y mientras se mantiene.                               |
| `Square`         | `Palletizer1.square`     | Salida del PLC · BOOL  | TRUE cierra el empujador que escuadra la capa.                         |
| `Grip`           | `Palletizer1.grip`       | Salida del PLC · BOOL  | TRUE cierra la pinza (vacío activado, o mordazas cerradas).            |
| —                | `Pallet1`                | —                      | No está cableado al PLC.                                               |
| `Start`          | `StartButton.pressed`    | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.                      |
| `Amber`          | `StackLight1.amber`      | Salida del PLC · BOOL  | TRUE enciende la lámpara ámbar.                                        |
| `Green`          | `StackLight1.green`      | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                                        |

Este paletizador tiene ejes digitales: los finales de carrera (`XMin`, `XMax`, `YMin`, `YMax`) informan solo los dos extremos de cada recorrido, y las salidas de desplazamiento (`XPlus`, `XMinus`, `YPlus`, `YMinus`) mueven el cabezal mientras se mantienen activas. No hay sensor de posición en el medio.

## Desplazamientos temporizados a partir de la velocidad y el paso

Cuando un eje tiene finales de carrera solo en sus extremos, el programa no puede leer una altura intermedia. Para detenerse a una distancia conocida por debajo del límite superior, primero se lleva el eje al límite superior, se mantiene activa la salida de bajada durante un tiempo calculado `t`, y luego se espera a que el cabezal termine de frenar.

No hace falta buscar ese tiempo por ensayo. La configuración de la máquina da la carrera vertical, la velocidad máxima `v`, la aceleración `a` y la altura de cada caja (el paso entre capas). Dos regímenes de movimiento relacionan el tiempo de accionamiento `t` con la distancia total `d` que recorre el eje desde el reposo hasta el reposo:

- **Desplazamiento largo (alcanza la velocidad máxima, `t >= v / a`).** El eje acelera hasta `v`, avanza a velocidad constante `v` y frena con la misma tasa `a` cuando la salida se apaga. La distancia que se pierde al acelerar es igual a la distancia de inercia al frenar, así que se cancelan: `d = v * t`, lo que da `t = d / v`.
- **Desplazamiento corto (no llega a la velocidad máxima, `t < v / a`).** El eje acelera durante `t` y frena por inercia durante otro tiempo `t`, recorriendo `0.5 * a * t * t` en cada mitad. La distancia total es `d = a * t * t`, lo que da `t = sqrt(d / a)`.

En `Palletizer1`, el eje vertical tiene una carrera de `1.0 m`, velocidad máxima `1.5 m/s` y aceleración `2 m/s²`, así que alcanzar la velocidad máxima lleva `0.75 s`. Cada caja estándar mide `0.3 m` de alto. A partir de esos datos usted puede calcular la distancia desde `YMax` hasta cada capa y el tiempo de descenso de cada parada, y guardar la tabla de tiempos en un `ARRAY` llenado con un bucle `FOR` para que una sola secuencia atienda todas las capas.

```timing
span: 2400
signals:
  - { name: AtTop, edges: [0, 200] }
  - { name: JogDown, edges: [200, 600] }
  - { name: Moving, edges: [200, 850] }
  - { name: OpenClamp, edges: [1250, 2400] }
caption: Al terminar el desplazamiento temporizado, el eje aún frena por inercia antes de abrir la pinza
```

Observe el margen entre el apagado de `JogDown` y el encendido de `OpenClamp`. Soltar la salida solo inicia el frenado; el cabezal sigue moviéndose hasta quedar en reposo.

## Ejemplo resuelto

Un cargador vertical de estantes tiene un elevador digital con un final de carrera superior `TopSwitch`, una salida de bajada `LiftDown`, velocidad máxima `1.0 m/s` y aceleración `4.0 m/s²`. Alcanzar la velocidad máxima lleva `1.0 / 4.0 = 0.25 s`. Hay cuatro estantes debajo del límite superior: el estante `0` está `0.40 m` abajo, y cada estante siguiente está `0.25 m` más abajo (`0.40 m`, `0.65 m`, `0.90 m`, `1.15 m`).

Como cada parada dura al menos `0.25 s`, el elevador alcanza la velocidad máxima en todos los movimientos, así que `t = d / v` da `400 ms` para el estante `0` más `250 ms` por estante. Un bucle `FOR` llena `DropMs` una vez al pulsar `StartLoad`, y los mismos tres pasos atienden cada estante:

```st
PROGRAM RackLoader
VAR_INPUT
    StartLoad : BOOL;
    TopSwitch : BOOL;
    Shelf     : INT;
END_VAR
VAR_OUTPUT
    LiftDown : BOOL;
    AtShelf  : BOOL;
END_VAR
VAR
    Phase  : INT;
    DropMs : ARRAY[0..3] OF INT;
    k      : INT;
    Preset : TIME;
    MoveT  : TON;
    RestT  : TON;
END_VAR

IF Shelf >= 0 AND Shelf <= 3 THEN
    Preset := INT_TO_TIME(DropMs[Shelf]);
END_IF;

MoveT(IN := Phase = 1, PT := Preset);
RestT(IN := Phase = 2, PT := T#400ms);

CASE Phase OF
    0:
        IF StartLoad AND TopSwitch THEN
            FOR k := 0 TO 3 DO
                DropMs[k] := 400 + 250 * k;
            END_FOR;
            Phase := 1;
        END_IF;
    1:
        IF MoveT.Q THEN
            Phase := 2;
        END_IF;
    2:
        IF RestT.Q THEN
            Phase := 3;
        END_IF;
END_CASE;

LiftDown := Phase = 1 AND NOT MoveT.Q;
AtShelf  := Phase = 3;
END_PROGRAM
```

La guarda `IF Shelf >= 0 AND Shelf <= 3` mantiene el índice del arreglo dentro de límites en cada ciclo de escaneo. `INT_TO_TIME` convierte el entero en milisegundos en una preselección `TIME` para `MoveT`, y `RestT` espera a que el elevador termine de frenar antes de encender `AtShelf`.

Este cargador suma tiempo en cada estante más bajo y mueve un solo eje. En el paletizador de la práctica, cada capa superior queda más cerca de `YMax`, la primera capa usa `YMin` en lugar de un temporizador, y el cabezal además carga pares, escuadra el bloque, sujeta, viaja en X y regresa.

## Errores comunes

- Abrir la pinza en cuanto vence el temporizador de descenso. El cabezal todavía frena por inercia y deja caer la capa.
- Iniciar un desplazamiento temporizado desde una altura desconocida. Tome siempre referencia en un final de carrera (`YMax`) antes de temporizar un movimiento.
- Indexar un arreglo sin comprobar su límite superior. Cuando el contador de capas llega a `3` tras la última capa, leer `JogMs[3]` se sale de `ARRAY[0..2]`.
- Mover el cabezal mientras el empujador de escuadrado sigue extendido. Espere a que `Squared` pase a FALSE antes de bajar la pinza.

> [!NOTE]
> Los desplazamientos temporizados trabajan en lazo abierto: si cambia la velocidad del eje o la carga, la altura de parada se desplaza. Cuando una máquina tiene realimentación de posición, las órdenes numéricas en lazo cerrado evitan esa deriva, que es lo que usa la siguiente lección.

## Compruébelo usted

```quiz
question: Un eje digital tiene velocidad máxima 1.0 m/s y aceleración 4.0 m/s² (tiempo de rampa 0.25 s). Partiendo del reposo en el límite superior, ¿cuánto tiempo debe permanecer en TRUE la salida de bajada para recorrer 0.50 m?
options:
  - { text: '500 ms', correct: true, feedback: 'Sí. Como 0.50 s supera el tiempo de rampa de 0.25 s, la aceleración y el frenado se cancelan y t = d / v = 0.50 / 1.0 = 0.50 s.' }
  - { text: '250 ms', feedback: '250 ms es solo el tiempo de rampa; a 1.0 m/s eso cubre 0.25 m, la mitad de la distancia pedida.' }
  - { text: '1000 ms', feedback: 'Mantener la salida 1.0 s a 1.0 m/s recorrería 1.0 m, el doble de lo necesario.' }
```

```quiz
question: ¿Por qué el programa espera en un paso de asentamiento después de que vence el temporizador de bajada, antes de abrir la pinza?
options:
  - { text: 'Porque el eje todavía frena por inercia después de apagarse la salida de bajada', correct: true, feedback: 'Correcto. Soltar la salida inicia la desaceleración; abrir la pinza mientras el cabezal se mueve puede dejar caer las cajas.' }
  - { text: 'Porque los temporizadores TON no se reinician en el mismo ciclo de escaneo en que vencen', feedback: 'Un TON se reinicia en cuanto su entrada IN pasa a FALSE; la espera es por el eje mecánico, no por el temporizador.' }
  - { text: 'Porque la salida de la pinza se ignora mientras YMax está en FALSE', feedback: 'La pinza responde a Grip a cualquier altura; la pausa asegura que el cabezal ya se detuvo.' }
```

## Qué hará en la práctica

El programa inicial en `src/LayerPalletizer.st` declara las entradas, las salidas y el arreglo `JogMs`, y no acciona nada. Al pulsar `Start`, que el escenario acciona a los {{t:200}} ms, usted llenará `JogMs` con un bucle `FOR`, cargará pares de cajas, escuadrará cada capa, la llevará a la tarima y apilará tres capas de cuatro cajas antes de encender `Green`. Después pulse {{ui:learn.check}}.
