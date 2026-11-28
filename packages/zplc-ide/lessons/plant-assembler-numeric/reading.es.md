## La máquina

Esta es la misma estación de ensamble que antes —tres cintas en línea, dos emisores, dos topes retráctiles, dos sensores ópticos, un retirador, un pulsador de inicio y una torre de luces— con una diferencia en `Pick1`. En lugar de cuatro salidas de dirección y cuatro finales de carrera, el manipulador de dos ejes recibe consignas numéricas de posición en centímetros (`XSet`, `YSet`) e informa su posición actual en centímetros (`XPos`, `YPos`).

![La escena del ensamblador numérico de dos ejes vista de frente. Tres cintas transportadoras están en línea de izquierda a derecha: LidBelt con LidEmitter, LidBlade y LidEye a la izquierda; BaseBelt con BaseEmitter, BaseBlade y BaseEye en el centro; y ExitBelt terminando en Remover1 a la derecha. Pick1 une LidBelt y BaseBelt y expone las entradas numéricas de posición XPos y YPos y las salidas de consigna XSet y YSet en lugar de finales de carrera. StartButton está detrás de LidBelt y StackLight1 está junto a ExitBelt. Cada elemento tiene una etiqueta con su nombre, su tipo y sus señales conectadas.](images/machine.es.png)

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

| Variable del PLC | Señal                 | Dirección y tipo                           | Significado                                                 |
| ---------------- | --------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `RunLid`         | `LidBelt.run`         | Salida del PLC · BOOL                      | TRUE hace avanzar la cinta.                                 |
| `RunBase`        | `BaseBelt.run`        | Salida del PLC · BOOL                      | TRUE hace avanzar la cinta.                                 |
| `RunExit`        | `ExitBelt.run`        | Salida del PLC · BOOL                      | TRUE hace avanzar la cinta.                                 |
| `EmitLid`        | `LidEmitter.emit`     | Salida del PLC · BOOL                      | Cada flanco ascendente suelta una pieza en la línea.        |
| `EmitBase`       | `BaseEmitter.emit`    | Salida del PLC · BOOL                      | Cada flanco ascendente suelta una pieza en la línea.        |
| `HoldLid`        | `LidBlade.extend`     | Salida del PLC · BOOL                      | TRUE eleva el tope sobre la cinta; FALSE lo baja.           |
| `HoldBase`       | `BaseBlade.extend`    | Salida del PLC · BOOL                      | TRUE eleva el tope sobre la cinta; FALSE lo baja.           |
| `LidReady`       | `LidEye.detect`       | Entrada del PLC · BOOL                     | TRUE mientras hay un objeto en el haz.                      |
| `BaseReady`      | `BaseEye.detect`      | Entrada del PLC · BOOL                     | TRUE mientras hay un objeto en el haz.                      |
| `Gripped`        | `Pick1.gripped`       | Entrada del PLC · BOOL                     | TRUE mientras la pinza sostiene una pieza.                  |
| `XPos`           | `Pick1.xPos`          | Entrada del PLC · REAL, 0 a 100 = 0 a 1 m  | Dónde está ahora el eje X.                                  |
| `YPos`           | `Pick1.yPos`          | Entrada del PLC · REAL, 0 a 30 = 0 a 0.3 m | Dónde está ahora el eje Y.                                  |
| `Grip`           | `Pick1.grip`          | Salida del PLC · BOOL                      | TRUE cierra la pinza (vacío activado, o mordazas cerradas). |
| `XSet`           | `Pick1.xSet`          | Salida del PLC · REAL, 0 a 100 = 0 a 1 m   | La posición a la que debe ir el eje X.                      |
| `YSet`           | `Pick1.ySet`          | Salida del PLC · REAL, 0 a 30 = 0 a 0.3 m  | La posición a la que debe ir el eje Y.                      |
| —                | `Remover1`            | —                                          | No está cableado al PLC.                                    |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL                     | TRUE mientras el pulsador se mantiene presionado.           |
| `Green`          | `StackLight1.green`   | Salida del PLC · BOOL                      | TRUE enciende la lámpara verde.                             |
| `Amber`          | `StackLight1.amber`   | Salida del PLC · BOOL                      | TRUE enciende la lámpara ámbar.                             |

El rango de `XPos` y `XSet` va de `0.0` a `100.0` cm (`0` a `1` m), y el rango de `YPos` y `YSet` va de `0.0` a `30.0` cm (`0` a `0.3` m).

## Consignas, realimentación y tolerancia de posición

Un final de carrera solo indica si un eje llegó a uno de los extremos de su recorrido. Un eje servo o paso a paso con codificador informa su posición como un número `REAL` y se mueve hacia la consigna que usted escriba. Eso permite que un mismo eje se detenga en cualquier punto de su carrera —no solo en los extremos— sin agregar interruptores adicionales.

Como la realimentación de posición `REAL` es una medida, **nunca compruebe la igualdad exacta** (`Pos = Target`). Un error de redondeo o una pequeña diferencia al detenerse puede dejar `Pos` en `64.999` cuando `Target` vale `65.0`, de modo que `Pos = Target` sigue en FALSE para siempre y la máquina queda detenida.

En su lugar, compruebe si el eje está dentro de una **tolerancia de posición** alrededor de su consigna:

```st
InBand := ABS(Pos - Target) < Band;
```

`ABS(Pos - Target)` es la distancia entre dónde está el eje y adónde le pidió ir, sin importar desde qué lado se acerque. Cuando esa distancia es menor que `Band`, el movimiento terminó.

Dos hábitos mantienen legibles y fiables las secuencias numéricas:

- **Dar nombre a cada coordenada en `VAR CONSTANT`:** escribir `MarkPos` y `ParkPos` en lugar de números sueltos facilita leer cada estado y mantiene coherentes todas las comparaciones.
- **Cambiar la consigna una sola vez al entrar en el estado de movimiento:** escriba la nueva consigna en la transición que entra en un estado de movimiento y deje que ese estado espere el indicador de tolerancia antes de pasar al siguiente estado.

## Ejemplo resuelto

Un carro lineal transporta una pieza sobre un solo riel entre una posición de reposo (`10.0` cm) y un cabezal de estampado (`65.0` cm). Una pulsación de `CmdStart` envía el carro al cabezal de estampado, activa `StampCmd` hasta que el cabezal informa `MarkDone`, y luego devuelve el carro al reposo. El movimiento se da por terminado cuando `RailPos` está a menos de `0.5` cm de `RailSet`. `RailSet` empieza en la posición de reposo, así que un carro que está en reposo al encender se queda donde está.

```st
PROGRAM LabelShuttle
VAR_INPUT
    CmdStart : BOOL;
    MarkDone : BOOL;
    RailPos  : REAL;
END_VAR
VAR_OUTPUT
    RailSet   : REAL := 10.0;
    StampCmd  : BOOL;
    ReadyLamp : BOOL;
END_VAR
VAR
    State  : INT;
    InBand : BOOL;
END_VAR
VAR CONSTANT
    ParkPos : REAL := 10.0;
    MarkPos : REAL := 65.0;
    Band    : REAL := 0.5;
END_VAR

InBand := ABS(RailPos - RailSet) < Band;

IF State = 0 AND CmdStart THEN
    RailSet := MarkPos;
    State := 1;
ELSIF State = 1 AND InBand THEN
    State := 2;
ELSIF State = 2 AND MarkDone THEN
    RailSet := ParkPos;
    State := 3;
ELSIF State = 3 AND InBand THEN
    State := 0;
END_IF;

StampCmd  := State = 2;
ReadyLamp := State = 0;
END_PROGRAM
```

```timing
span: 8000
signals:
  - { name: CmdStart, edges: [500, 900] }
  - { name: InBand, edges: [0, 500, 2800, 4200, 6500, 8000] }
  - { name: StampCmd, edges: [2800, 4200] }
  - { name: ReadyLamp, edges: [0, 500, 6500, 8000] }
marks:
  - { from: 500, to: 2800, label: 'RailSet = 65.0' }
  - { from: 4200, to: 6500, label: 'RailSet = 10.0' }
caption: Cada transición escribe RailSet una vez y avanza State; el siguiente estado espera hasta que InBand sea TRUE
```

Siga el orden del ciclo de escaneo cuando llega `CmdStart` en `State = 0`. `InBand` se calculó al principio del ciclo con la consigna anterior, así que la rama `IF` fija `RailSet := MarkPos;` y pasa a `State := 1`, y ninguna de las ramas `ELSIF` se ejecuta en ese mismo ciclo. En el siguiente ciclo de escaneo, `InBand` se recalcula con `65.0`, pasa a FALSE mientras el carro se desplaza y se pone en TRUE en cuanto `RailPos` entra en `64.5 .. 65.5` cm.

Este carro tiene un solo eje, un ciclo cada vez y una señal externa `MarkDone`. En la práctica usted debe coordinar dos ejes numéricos sin cruzar mientras está abajo, manejar la alimentación de piezas, los topes retráctiles y el agarre y suelta por vacío, y contar tres ensambles terminados.

## Errores comunes

- Comparar posiciones `REAL` con `=`. En un eje real una diferencia mínima deja la condición en FALSE para siempre y congela la secuencia. El eje de esta escena llega exactamente a su consigna, así que aquí `=` funciona por casualidad; la tolerancia es lo que funciona en una máquina real.
- Escribir una consigna nueva y comprobar el indicador de tolerancia anterior en el mismo ciclo de escaneo (por ejemplo usando bloques `IF` separados en lugar de `IF / ELSIF`). El estado salta directamente el movimiento antes de que el eje haya empezado.
- Cambiar la consigna horizontal antes de que el eje vertical esté dentro de la tolerancia de la altura segura. Ambos ejes se mueven a la vez y el brazo barre las cintas en diagonal.
- Elegir una tolerancia demasiado amplia, de modo que la pinza actúe antes de quedar centrada sobre la pieza, o demasiado estrecha para que el eje pueda asentarse dentro de ella.
- Accionar una salida solo dentro de una rama `IF` y olvidar borrarla al salir de ese estado.

> [!NOTE]
> `ABS(Pos - Target) < Band` funciona tanto si el eje se acerca desde abajo como desde arriba. Si omite `ABS`, la comprobación se cumple de inmediato siempre que el eje esté por debajo del destino.

## Compruébelo usted

```quiz
question: ¿Por qué LabelShuttle comprueba ABS(RailPos - RailSet) < Band en lugar de RailPos = RailSet?
options:
  - { text: 'Porque RailPos es una medida REAL que puede asentarse cerca de RailSet sin llegar a ser exactamente igual', correct: true, feedback: 'Sí. Una banda de tolerancia se cumple en cuanto el eje está lo bastante cerca de su destino.' }
  - { text: 'Porque el Texto Estructurado no permite usar = con valores REAL', feedback: 'El operador = compila con valores REAL, pero pequeñas diferencias de redondeo o posicionamiento pueden mantenerlo en FALSE para siempre.' }
  - { text: 'Porque ABS hace que el eje se mueva más rápido', feedback: 'ABS solo calcula la distancia entre la posición actual y la consigna; no cambia la velocidad del eje.' }
```

```quiz
question: En LabelShuttle, RailSet vale 65.0 y Band vale 0.5. Cuando RailPos vale 64.6, ¿qué vale InBand?
options:
  - { text: 'TRUE, porque ABS(64.6 - 65.0) es 0.4, que es menor que 0.5', correct: true, feedback: 'Correcto. El carro está a menos de 0.5 cm de 65.0 cm, así que el movimiento terminó.' }
  - { text: 'FALSE, porque 64.6 todavía está por debajo de 65.0', feedback: 'ABS quita el signo menos, así que acercarse desde abajo funciona igual que acercarse desde arriba.' }
  - { text: 'FALSE, porque 64.6 no es igual a 65.0', feedback: 'La comprobación de tolerancia no exige igualdad exacta, solo una distancia menor que Band.' }
```

## Qué hará en la práctica

El programa inicial en `src/Assembler.st` declara todas las entradas y salidas de la estación, incluidas `XPos`, `YPos`, `XSet` y `YSet`, y todavía no acciona nada. Usted escribirá el programa en Texto Estructurado que ordena a `Pick1` mediante consignas numéricas y una tolerancia de posición, alimenta y retiene tapas y bases, ensambla tres pares sin cruzar las cintas estando abajo, deja salir cada ensamble terminado por la cinta de salida y enciende `Green` tras el tercero. Guarde su programa y pulse {{ui:learn.check}}.
