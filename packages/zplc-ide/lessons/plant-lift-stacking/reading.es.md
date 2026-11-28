## La máquina

Esta estación reúne piezas en un cajón. Un cajón vacío llega por una cinta, un elevador lo sube a la altura de un alimentador, las piezas se echan dentro de él una por una, y el cajón lleno se baja y sale por una segunda cinta. Las plantas reales llenan cajones y bandejas así antes de que la máquina siguiente se los lleve.

![La escena del apilado con elevador vista de frente. Una cinta transportadora va desde la izquierda hasta el centro, donde un elevador se alza dentro de un bastidor; sobre el elevador una cinta alimentadora corre hacia el fondo de la escena; una segunda cinta sale del elevador hacia la derecha y termina en un depósito abierto para el cajón. Se señalan el pulsador de inicio, tres sensores, una torre de luces y los dos emisores de piezas. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

La estación tiene doce elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `FloorIn`     | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `CrateSource` | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Lift1`       | Elevador             | Un transportador vertical que lleva una pieza entre pisos o niveles de una línea.                                                     |
| `Feeder`      | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `PartSource`  | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `FloorOut`    | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `CrateBin`    | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `CrateEye`    | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `CountEye`    | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `OutEye`      | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `StackLight1` | Torre de luces       | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                            |
| ---------------- | --------------------- | ---------------------- | ------------------------------------------------------ |
| `RunIn`          | `FloorIn.run`         | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                            |
| `EmitCrate`      | `CrateSource.emit`    | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea.   |
| `AtLevel1`       | `Lift1.atLevel1`      | Entrada del PLC · BOOL | TRUE cuando la plataforma está detenida en el nivel 1. |
| `AtLevel2`       | `Lift1.atLevel2`      | Entrada del PLC · BOOL | TRUE cuando la plataforma está detenida en el nivel 2. |
| `Up`             | `Lift1.up`            | Salida del PLC · BOOL  | TRUE sube la plataforma.                               |
| `Down`           | `Lift1.down`          | Salida del PLC · BOOL  | TRUE baja la plataforma.                               |
| `RunLift`        | `Lift1.run`           | Salida del PLC · BOOL  | TRUE hace avanzar la cinta de la plataforma.           |
| `RunFeeder`      | `Feeder.run`          | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                            |
| `EmitPart`       | `PartSource.emit`     | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea.   |
| `RunOut`         | `FloorOut.run`        | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                            |
| —                | `CrateBin`            | —                      | No está cableado al PLC.                               |
| `CrateEye`       | `CrateEye.detect`     | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                 |
| `CountEye`       | `CountEye.detect`     | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                 |
| `OutEye`         | `OutEye.detect`       | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.                 |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.      |
| `Green`          | `StackLight1.green`   | Salida del PLC · BOOL  | TRUE enciende la lámpara verde.                        |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. Su programa solo ve estas variables: nunca ve el cajón ni una pieza, solo lo que los sensores dicen de ellos.

Cuatro datos de esta escena salen de una ejecución de un programa terminado, en segundos desde el inicio:

- La escena tiene un cajón y cinco piezas: el emisor de cajones tiene un cajón para dar, y el emisor de piezas, cinco.
- El escenario pulsa Start a los {{t:200}} ms y lo suelta a los {{t:400}} ms. El cajón tarda unos 3,9 s en recorrer la cinta de entrada desde que se suelta hasta CrateEye.
- La plataforma del elevador tarda unos 1,5 s en ir del nivel 1 al nivel 2. Una pieza tarda unos 3,2 s en el alimentador desde que se suelta hasta CountEye, y permanece en el haz de CountEye unos 0,4 s.
- La escena cuenta las piezas que reposan dentro del cajón y muestra el número en su texto de hechos, como "El cajón 1 contiene 3 elementos." El escenario llama `loaded:crate:0` a ese mismo número.

La plataforma tiene una cinta propia. `Up` y `Down` mueven la plataforma; `RunLift` hace avanzar la cinta de la plataforma, que mueve lo que está encima. En una ejecución de prueba que mantuvo en marcha la cinta de la plataforma mientras la plataforma se movía, {{ui:learn.check}} falló y el cajón nunca contuvo una pieza.

```timing
span: 12000
signals:
  - { name: Start, edges: [200, 400] }
  - { name: CrateEye, edges: [4120, 4660] }
  - { name: AtLevel1, edges: [0, 4150] }
  - { name: AtLevel2, edges: [5640, 12000] }
  - { name: CountEye, edges: [8890, 9290] }
caption: Los sensores de la estación desde la pulsación hasta la primera pieza, en una ejecución de un programa terminado
```

## Una cosa a la vez

Una estación hace sus trabajos en un orden: entra el cajón, sube el elevador, se echan las piezas, baja el elevador, sale el cajón. Un programa que escribiera todas las salidas desde los sensores en una sola línea intentaría hacerlo todo a la vez. El programa necesita saber qué trabajo está en curso, y pasa al siguiente solo cuando la máquina dice que el actual terminó.

La forma habitual es un número: una variable de **paso** de tipo INT, con una rama de una cadena `IF` y `ELSIF` para cada paso. En cada rama el programa enciende las salidas que ese paso necesita, y cambia `Step` cuando ocurre lo que termina el paso. Lo que lo termina puede ser un sensor, una posición o un conteo.

Un conteo es una segunda variable que crece en uno cada vez que algo ocurre. La secuencia lo usa para decidir si repite un paso o sigue adelante.

Todo paso debe tener algo que lo termine. Pregunte de cada paso de su máquina: ¿cómo sabe el programa que este trabajo terminó?

La señal de un sensor tiene un comienzo y un final, y el programa puede actuar sobre cualquiera de los dos. Cuál es el correcto depende de lo que hace la máquina entre ambos. Un detector de **flanco** da TRUE durante un ciclo de escaneo cuando una señal cambia, y eso es lo que permite a un programa contar algo una sola vez.

## Ejemplo resuelto

Una llenadora de bolsas deja caer cuatro tornillos, uno por uno, en una bolsa, y enciende `Done` cuando la bolsa está llena. La entrada `ScrewEye` está en TRUE mientras un tornillo cae frente a un ojo bajo la tolva. Cada flanco ascendente de `Drop` suelta un tornillo.

Los trabajos son: esperar `Start`, soltar un tornillo, esperar a que pase frente al ojo y terminar cuando han pasado cuatro. Cuatro trabajos dan cuatro pasos. Un conteo, `Screws`, decide si el paso 2 vuelve al paso 1 o sigue al paso 3.

```st
PROGRAM BagFiller
VAR_INPUT Start : BOOL; ScrewEye : BOOL; END_VAR
VAR_OUTPUT Drop : BOOL; Done : BOOL; END_VAR
VAR
    Step : INT;   (* 0 wait, 1 drop a screw, 2 wait for it to pass the eye, 3 bag full *)
    Screws : INT;
    Seen : R_TRIG;
END_VAR
Seen(CLK := ScrewEye);
Drop := FALSE;
IF Step = 0 THEN
    IF Start THEN
        Screws := 0;
        Step := 1;
    END_IF;
ELSIF Step = 1 THEN
    Drop := TRUE;
    Step := 2;
ELSIF Step = 2 THEN
    IF Seen.Q THEN
        Screws := Screws + 1;
        IF Screws >= 4 THEN
            Step := 3;
        ELSE
            Step := 1;
        END_IF;
    END_IF;
ELSIF Step = 3 THEN
    IF NOT Start THEN
        Step := 0;
    END_IF;
END_IF;
Done := Step = 3;
END_PROGRAM
```

Léalo desde arriba. `Drop` está en FALSE en todos los ciclos de escaneo salvo aquel en que el paso 1 lo enciende, así que cada tornillo recibe un solo flanco ascendente. El paso 2 espera a `Seen.Q`, que está en TRUE durante un ciclo de escaneo cuando el ojo se activa, y cuenta el tornillo una sola vez, por mucho que permanezca en el haz. Tras el cuarto tornillo el programa pasa al paso 3, que enciende `Done` hasta que se suelta `Start`.

Esta máquina no tiene elevador ni cajón, y un tornillo se cuenta cuando llega al ojo. La estación de la práctica tiene que traer un cajón, mover un elevador y echar cinco piezas, y cuándo cuenta cada una lo decide usted a partir de lo que hace la máquina.

## Errores comunes

- Escribir todas las salidas desde los sensores en una sola línea, sin pasos. Nada dice qué está haciendo la estación ahora, y el elevador puede moverse mientras se echa una pieza.
- Contar mientras el ojo está en TRUE en lugar de contar un flanco. Con un ciclo de escaneo de 0,01 s, una pieza que permanece 0,4 s en el haz se contaría unas cuarenta veces.
- Dejar un paso sin nada que lo termine. La estación se queda esperando allí para siempre.
- Hacer avanzar la cinta de la plataforma mientras la plataforma se mueve. Una ejecución de prueba que lo hizo falló en {{ui:learn.check}}.
- No poner a cero un conteo cuando empieza un trabajo nuevo. Una variable conserva su valor entre ciclos de escaneo, así que un conteo pasa de una bolsa a la siguiente.

> [!NOTE]
> La calificación no puede ver cuántas piezas reposan en el cajón. Ve que al menos una lo hizo y que el cajón llegó a su depósito. Lea usted mismo el conteo en el texto de hechos.

## Compruébelo usted

```quiz
question: En la llenadora de bolsas, un tornillo permanece en el haz de ScrewEye durante muchos ciclos de escaneo. ¿Cuántos tornillos cuenta Screws por él?
options:
  - { text: 'Uno', correct: true, feedback: 'Sí. Seen.Q está en TRUE un solo ciclo de escaneo, cuando el ojo se activa, así que el tornillo se cuenta una vez.' }
  - { text: 'Tantos como ciclos de escaneo estuvo el ojo en TRUE', feedback: 'Eso sería el resultado de contar mientras ScrewEye está en TRUE. El detector de flanco da un solo ciclo de escaneo.' }
  - { text: 'Ninguno, porque el conteo solo cambia en el paso 3', feedback: 'El conteo cambia en el paso 2, en el ciclo de escaneo en que Seen.Q está en TRUE.' }
```

```quiz
question: En la llenadora de bolsas la tolva está vacía y ningún tornillo llega al ojo. ¿Qué ocurre después de que Step pasa a 2?
options:
  - { text: 'Step se queda en 2, porque solo el ojo termina ese paso', correct: true, feedback: 'Correcto. El paso 2 tiene una sola salida, Seen.Q, y nada más hace avanzar Step.' }
  - { text: 'Step vuelve a 1 tras un ciclo de escaneo', feedback: 'Nada en el paso 2 escribe Step salvo que Seen.Q esté en TRUE.' }
  - { text: 'Done se enciende porque la bolsa no tiene nada que esperar', feedback: 'Done sigue al paso 3, y al paso 3 solo se llega tras cuatro tornillos.' }
```

## Qué hará en la práctica

El proyecto inicial declara las seis entradas y las nueve salidas de la estación y no acciona nada. Usted escribirá el programa de la estación: tras la pulsación que el escenario da a los {{t:200}} ms, entra un cajón y sube en el elevador hasta el alimentador, se echan cinco piezas dentro de él una por una, el cajón lleno baja y sale por la cinta de salida, y `Green` se enciende cuando `OutEye` lo ha visto salir. Después pulse {{ui:learn.check}}.
