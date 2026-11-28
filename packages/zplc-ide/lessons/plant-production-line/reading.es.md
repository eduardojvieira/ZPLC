## La máquina

Esta es una pequeña línea de producción: las piezas en bruto llegan por una cinta y dos centros de mecanizado las convierten en productos. Las dos máquinas no son igual de rápidas. La máquina A corta una tapa en un ciclo de 3 s y la máquina B una base en un ciclo de 6 s, así que una línea que enviara todas las piezas en bruto a la misma máquina dejaría parada a la otra. Un brazo desviador sobre la cinta decide qué máquina recibe cada pieza.

![La escena de la línea de producción equilibrada vista desde arriba y de frente. Una larga cinta de entrada va de izquierda a derecha, con el emisor en su extremo izquierdo y un brazo desviador y sensores a lo largo, y llega hasta el primer centro de mecanizado. Una cinta de derivación más corta, debajo, lleva al segundo centro de mecanizado. Cada máquina tiene una cinta de salida que termina en su propio contenedor. El pulsador de inicio está cerca del emisor y una torre de luces cerca de la primera máquina. Cada elemento tiene una etiqueta con su nombre, su tipo y las señales conectadas.](images/machine.es.png)

La línea tiene quince elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `BranchB`     | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Source1`     | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Gate`        | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `Arm1`        | Brazo desviador      | Un brazo que gira sobre la cinta y desvía las piezas hacia una línea lateral.                                                         |
| `EyeA`        | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeB`        | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `MachineA`    | Centro de mecanizado | Una máquina herramienta cerrada que mecaniza una pieza en bruto hasta terminarla, con puertas que se cierran durante el ciclo.        |
| `MachineB`    | Centro de mecanizado | Una máquina herramienta cerrada que mecaniza una pieza en bruto hasta terminarla, con puertas que se cierran durante el ciclo.        |
| `OutA`        | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `OutB`        | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `LidBin`      | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `BaseBin`     | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `Beacon`      | Torre de luces       | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                                                                      |
| ---------------- | --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `RunInfeed`      | `Infeed.run`          | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                                                      |
| `RunBranch`      | `BranchB.run`         | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                                                      |
| —                | `Source1`             | —                      | No está cableado al PLC.                                                                         |
| `Gate`           | `Gate.detect`         | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                                                           |
| `Divert`         | `Arm1.divert`         | Salida del PLC · BOOL  | TRUE gira el brazo sobre la cinta; FALSE lo devuelve al reposo.                                  |
| `EyeA`           | `EyeA.detect`         | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                                                           |
| `EyeB`           | `EyeB.detect`         | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                                                           |
| `ReadyA`         | `MachineA.ready`      | Entrada del PLC · BOOL | TRUE cuando hay exactamente una pieza en bruto en reposo en la cámara: puede iniciarse un ciclo. |
| `DoneA`          | `MachineA.done`       | Entrada del PLC · BOOL | TRUE desde el fin de un ciclo hasta que la pieza terminada sale de la cámara.                    |
| `FeedA`          | `MachineA.feed`       | Salida del PLC · BOOL  | TRUE hace avanzar la cinta propia de la máquina, hacia la cámara y fuera de ella.                |
| `StartA`         | `MachineA.start`      | Salida del PLC · BOOL  | Un flanco ascendente con ready en TRUE cierra las puertas e inicia un ciclo.                     |
| `ReadyB`         | `MachineB.ready`      | Entrada del PLC · BOOL | TRUE cuando hay exactamente una pieza en bruto en reposo en la cámara: puede iniciarse un ciclo. |
| `DoneB`          | `MachineB.done`       | Entrada del PLC · BOOL | TRUE desde el fin de un ciclo hasta que la pieza terminada sale de la cámara.                    |
| `FeedB`          | `MachineB.feed`       | Salida del PLC · BOOL  | TRUE hace avanzar la cinta propia de la máquina, hacia la cámara y fuera de ella.                |
| `StartB`         | `MachineB.start`      | Salida del PLC · BOOL  | Un flanco ascendente con ready en TRUE cierra las puertas e inicia un ciclo.                     |
| `RunOutA`        | `OutA.run`            | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                                                      |
| `RunOutB`        | `OutB.run`            | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                                                                      |
| —                | `LidBin`              | —                      | No está cableado al PLC.                                                                         |
| —                | `BaseBin`             | —                      | No está cableado al PLC.                                                                         |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.                                                |
| `Green`          | `Beacon.green`        | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                                                                  |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. Su programa solo ve estas variables: nunca ve una pieza en bruto, solo lo que los sensores y las máquinas dicen de ella.

Source1 suelta una pieza en bruto cada 6 s, ocho en total. Con el brazo en reposo, la pieza sigue por la cinta de entrada y llega a la máquina A; con el brazo atravesado sobre la cinta, la pieza se desvía a la cinta de derivación y llega a la máquina B. La línea además debe estar en marcha: cada cinta se mueve solo mientras su salida está en TRUE.

Un centro de mecanizado trabaja mediante un breve intercambio con el programa. Una pieza en bruto entra por la cinta propia de la máquina, que tiene que detenerse para que la pieza quede en reposo en la cámara. Ready está en TRUE cuando exactamente una pieza en bruto está en reposo allí. Un flanco ascendente de Start con Ready en TRUE cierra las puertas e inicia un ciclo. Al final del ciclo la pieza en bruto se ha convertido en un producto, y Done está en TRUE hasta que el producto sale de la cámara. Un Start con Ready en FALSE se rechaza y se cuenta en el hecho `misfires`.

El diagrama es una ejecución de la línea terminada: las cinco primeras piezas en bruto pasan por Gate, y el brazo está atravesado sobre la cinta para la segunda y la cuarta. Las impares llegan a EyeA, delante de la máquina A, y las pares llegan a EyeB, delante de la máquina B.

```timing
span: 36000
signals:
  - { name: Gate, edges: [7240, 7640, 13240, 13640, 19240, 19640, 25240, 25640, 31240, 31640] }
  - { name: Divert, edges: [13240, 18240, 25240, 30240] }
  - { name: EyeA, edges: [10840, 11240, 22840, 23240, 34840, 35240] }
  - { name: EyeB, edges: [18740, 19140, 30740, 31140] }
caption: Las piezas 1, 3 y 5 llegan a la máquina A; las piezas 2 y 4 se desvían a la máquina B
```

## Un control, escrito una vez

El control de un centro de mecanizado es el mismo para las dos máquinas: se diferencian solo en la velocidad de su ciclo, y de eso se encarga la propia máquina. Copiar el control para la segunda máquina y cambiar cada nombre a mano funciona el primer día. Después, cada corrección hay que hacerla dos veces, y las dos copias van dejando de ser iguales.

Un **bloque de función** escribe el control una sola vez. Un programa lo usa declarando una **instancia**: una variable cuyo tipo es el bloque. Cada instancia guarda su propia copia de las variables del bloque, así que lo que una máquina recuerda, como en qué fase está o cuánto lleva esperando, nunca llega a la otra. El bloque no hace nada por sí solo. El programa llama a una instancia con las entradas que necesita y después lee sus salidas.

## Ejemplo resuelto

Un taller tiene dos prensas de estampado. Cada una estampa una pieza durante 2 s cuando llega una pieza, y cuenta las piezas que ha estampado. El control es el mismo para las dos, así que se escribe una vez, como un bloque con una entrada, `Part`, y dos salidas, `Press` y `Count`:

```st
FUNCTION_BLOCK Stamper
VAR_INPUT Part : BOOL; END_VAR
VAR_OUTPUT Press : BOOL; Count : INT; END_VAR
VAR Busy : BOOL; Hold : TON; END_VAR
IF Part THEN Busy := TRUE; END_IF;
Hold(IN := Busy, PT := T#2s);
IF Hold.Q THEN Busy := FALSE; Count := Count + 1; END_IF;
Press := Busy;
END_FUNCTION_BLOCK

PROGRAM Stamping
VAR_INPUT PartL : BOOL; PartR : BOOL; END_VAR
VAR_OUTPUT PressL : BOOL; PressR : BOOL; END_VAR
VAR Left : Stamper; Right : Stamper; END_VAR
Left(Part := PartL);
Right(Part := PartR);
PressL := Left.Press;
PressR := Right.Press;
END_PROGRAM
```

Lea primero el programa. `Left` y `Right` son dos instancias de `Stamper`. En cada ciclo de escaneo, el programa llama a cada una con su propio sensor de pieza y luego copia la salida de cada una a su propia prensa. Ahora lea el bloque: `Busy` y `Hold` están declaradas dentro de él, así que cada instancia tiene las suyas.

Por eso las dos prensas no se estorban. En una ejecución de este programa, una pieza llega a la prensa izquierda en el segundo 1 y su prensa funciona hasta los 3 s. Una pieza llega a la prensa derecha a los 2 s, cuando la izquierda sigue funcionando, y su prensa funciona de los 2 s a los 4 s. Una segunda pieza en la prensa izquierda, a los 5 s, funciona de los 5 s a los 7 s. Las cuentas también están separadas: a los 7 s la prensa izquierda ha estampado dos piezas y la derecha una, así que el total es tres.

```timing
span: 8000
signals:
  - { name: PartL, edges: [1000, 1200, 5000, 5200] }
  - { name: PressL, edges: [1000, 3000, 5000, 7000] }
  - { name: PartR, edges: [2000, 2200] }
  - { name: PressR, edges: [2000, 4000] }
caption: Dos instancias de un mismo bloque funcionan a la vez, cada una con su propia memoria y su propio temporizador
```

Este bloque tiene una entrada, un temporizador y ningún intercambio. Un centro de mecanizado tiene un intercambio con varias fases, y qué guarda por dentro el bloque de la práctica y qué recibe y qué entrega lo debe decidir usted a partir de lo que hace cada máquina.

## Errores comunes

- Copiar el control para la segunda máquina y cambiar sus variables a mano. Una corrección hay que hacerla entonces en las dos copias, y una de ellas se olvida.
- Leer la salida de una instancia antes de llamarla. El valor que se lee es el del ciclo de escaneo anterior. En el ejemplo, si las dos líneas que copian las salidas van antes de las dos llamadas, `PressL` sube un ciclo de escaneo tarde, a 1,01 s en lugar de 1,00 s.
- Iniciar un ciclo con Ready en FALSE. La máquina rechaza el Start y cuenta un disparo en falso. En una ejecución de esta línea en que el programa inició las dos máquinas sin esperar Ready, cada máquina contó un disparo en falso y no hizo ningún producto.
- Esperar que la línea se equilibre sola. Sin el brazo, una ejecución de esta línea envía las ocho piezas en bruto a la máquina A, que hace cuatro tapas, y las otras cuatro piezas llegan al contenedor de tapas tal como vinieron.

> [!NOTE]
> El escenario no puede ver cómo está organizado el programa: ve las salidas. Una línea con dos copias del control y una línea con un bloque pueden pasar la misma comprobación. El bloque es para quien tenga que leer y cambiar el programa después.

## Compruébelo usted

```quiz
question: En el ejemplo de las prensas, la prensa izquierda lleva un segundo funcionando cuando una pieza llega a la prensa derecha. ¿Qué hace la prensa derecha?
options:
  - { text: 'Inicia de inmediato su propio funcionamiento de 2 s, sin estorbar a la izquierda', correct: true, feedback: 'Sí. Cada instancia guarda su propio Busy y su propio temporizador, así que los dos funcionamientos se superponen.' }
  - { text: 'Espera a que la prensa izquierda termine', feedback: 'Nada en el bloque hace que una instancia espere a otra; no comparten ninguna variable.' }
  - { text: 'Reinicia el temporizador de la prensa izquierda', feedback: 'El temporizador Hold pertenece a una instancia. La instancia derecha tiene un temporizador propio.' }
```

```quiz
question: Un centro de mecanizado recibe un flanco ascendente de Start mientras su Ready está en FALSE. ¿Qué ocurre?
options:
  - { text: 'El Start se rechaza y se cuenta en misfires', correct: true, feedback: 'Correcto. La máquina inicia un ciclo solo cuando exactamente una pieza en bruto está en reposo en ella.' }
  - { text: 'La máquina inicia el ciclo de todos modos', feedback: 'Un ciclo necesita una pieza en reposo en la cámara, que es lo que dice Ready.' }
  - { text: 'La máquina guarda el Start y empieza cuando Ready pasa a TRUE', feedback: 'La máquina no recuerda nada: un Start que llega en un momento equivocado se pierde.' }
```

## Qué hará en la práctica

El programa inicial ya hace funcionar toda la línea, y envía una de cada dos piezas en bruto a la máquina B. Controla solo la máquina A, con instrucciones escritas en el propio programa, así que la máquina B nunca recibe una pieza en su cámara y no se hace ninguna base. Usted dará a la máquina B el mismo control sin escribirlo una segunda vez, y encenderá Green cuando ambas máquinas hayan terminado cuatro ciclos. El escenario pulsa Start a los {{t:200}} ms y mira la lámpara a los {{t:80000}} ms. Después pulse {{ui:learn.check}}.
