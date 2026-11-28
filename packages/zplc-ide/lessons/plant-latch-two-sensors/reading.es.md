## La máquina

Esta estación lleva una caja desde el comienzo de una cinta hasta su extremo usando solo dos sensores ópticos. A diferencia de la primera estación, no hay pulsador ni emisor: la caja ya está sobre la cinta delante de `EyeA`, y la cinta debe llevarla a través del tramo vacío hasta que `EyeB` la vea y la detenga.

![La escena de retención entre dos sensores vista de frente. Una cinta transportadora sobre patas va de izquierda a derecha. Una caja de cartón está en el extremo izquierdo de la cinta delante de un sensor óptico difuso llamado EyeA sobre un poste detrás de la cinta. Más a la derecha, un segundo sensor óptico difuso llamado EyeB está detrás de la cinta mirando a través de ella. Cada elemento cableado tiene una etiqueta con su nombre, su tipo y su señal; la caja aparece etiquetada como no cableada.](images/machine.es.png)

La estación tiene cuatro elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento | Tipo                 | Qué es en una planta real                                                                                                             |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Belt1`  | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Crate`  | Caja                 | Una caja de cartón o una cubeta: la mercancía que mueve la línea.                                                                     |
| `EyeA`   | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `EyeB`   | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |

| Variable del PLC | Señal         | Dirección y tipo       | Significado                            |
| ---------------- | ------------- | ---------------------- | -------------------------------------- |
| `Run`            | `Belt1.run`   | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.            |
| —                | `Crate`       | —                      | No está cableado al PLC.               |
| `EyeA`           | `EyeA.detect` | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz. |
| `EyeB`           | `EyeB.detect` | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz. |

La caja en sí no está cableada al PLC. Su programa solo ve `EyeA` y `EyeB` y acciona `Run`: sabe dónde está la caja únicamente en los dos puntos donde un haz de sensor cruza la cinta.

## Mantener una salida entre dos sensores

Al inicio, la caja está dentro del haz de `EyeA`, así que `EyeA` está en TRUE. En cuanto la cinta mueve la caja una corta distancia hacia delante, la caja sale del haz de `EyeA` y `EyeA` pasa a FALSE. Durante varios segundos ningún sensor ve la caja. Si la cinta simplemente copiara `EyeA`, se detendría en cuanto la caja saliera del primer sensor.

Para cruzar el tramo intermedio, el programa necesita una **retención** (set y reset): una condición enciende el estado, una segunda condición lo apaga, y entre ambos eventos nada sobrescribe el estado. Como las variables del PLC conservan su valor de un ciclo de escaneo al siguiente hasta que una instrucción escribe un valor nuevo, la cinta sigue en marcha por el tramo sin señal hasta que `EyeB` pasa a TRUE.

```timing
span: 8000
signals:
  - { name: EyeA, edges: [0, 600] }
  - { name: Run, edges: [0, 4800] }
  - { name: EyeB, edges: [4800, 8000] }
caption: EyeA se apaga en cuanto la caja sale de su haz; Run permanece retenida hasta que EyeB ve la caja
```

Cuando una condición de set y una de reset pueden estar las dos en TRUE en el mismo ciclo de escaneo, hay que elegir cuál gana:

- **Prioridad al reset** significa que gana la condición de parada cuando ambas son TRUE.
- **Prioridad al set** significa que gana la condición de arranque cuando ambas son TRUE.

Esa elección depende de lo que debe hacer la máquina si ambos sensores llegan a estar en TRUE a la vez, no del lenguaje de programación.

## Ejemplo resuelto

Un pozo de drenaje debajo de una zona de lavado tiene una bomba de achique accionada por `Pump` y dos interruptores de flotador. `HighFloat` está en TRUE cuando el agua alcanza la marca alta y la bomba debe arrancar. `LowFloat` está en TRUE mientras el agua sigue por encima de la marca baja, así que pasa a FALSE cuando el pozo se vacía y la bomba debe detenerse. Si los dos flotadores llegan a discrepar durante una crecida (`HighFloat` está en TRUE mientras `LowFloat` lee FALSE), mantener la bomba en marcha es más seguro que dejar rebosar el pozo, por lo que esta máquina usa una retención con **prioridad al set** (`SR`):

```st
PROGRAM SumpPump
VAR_INPUT HighFloat : BOOL; LowFloat : BOOL; END_VAR
VAR_OUTPUT Pump : BOOL; END_VAR
VAR PumpLatch : SR; END_VAR
PumpLatch(S1 := HighFloat, R := NOT LowFloat);
Pump := PumpLatch.Q1;
END_PROGRAM
```

Léalo desde arriba. Cuando el agua sube a la marca alta, `HighFloat` pasa a TRUE y activa `PumpLatch`. Al vaciarse el pozo, el agua baja de la marca alta y `HighFloat` pasa a FALSE, pero `PumpLatch.Q1` sigue en TRUE porque `LowFloat` continúa en TRUE (`R` está en FALSE). Cuando el pozo queda vacío, `LowFloat` pasa a FALSE, `R` pasa a TRUE y `PumpLatch` se reinicia, deteniendo la bomba. Como `SR` tiene prioridad al set (`S1` gana), si `HighFloat` está en TRUE al mismo tiempo que `R` está en TRUE, `Pump` permanece en TRUE.

Dos cosas cambian en la estación de cinta de la práctica: la polaridad del sensor de parada (si está en TRUE o en FALSE cuando llega la caja) y qué condición debe ganar si ambos sensores están en TRUE a la vez. Esas decisiones quedan para que usted las tome para la cinta.

## Errores comunes

- Copiar el sensor A directamente en la salida de la cinta. La caja solo avanza hasta salir del haz de `EyeA` y se detiene a mitad de la cinta.
- Activar la salida con `EyeA` y no borrarla nunca con `EyeB`. La caja pasa de largo por `EyeB` y cae por el extremo de la cinta.
- Dar prioridad al arranque cuando debe ganar la parada. Si ambos sensores llegan a estar en TRUE a la vez, la cinta sigue en marcha en lugar de detenerse en `EyeB`.
- Invertir el sensor de parada por costumbre. `EyeB` pasa a TRUE cuando la caja entra en su haz, a diferencia de un interruptor de nivel bajo que se abre cuando un tanque se vacía.

> [!NOTE]
> Una variable `BOOL` declarada en `VAR` o `VAR_OUTPUT` conserva su valor de un ciclo de escaneo al siguiente hasta que una instrucción le escribe un valor nuevo. Un `IF` sin `ELSE` solo escribe cuando su condición es TRUE, así que mantiene de forma natural su valor anterior en todos los demás ciclos.

## Compruébelo usted

```quiz
question: ¿Por qué la caja se detiene a mitad de camino si la salida de la cinta simplemente copia EyeA?
options:
  - { text: 'Porque EyeA pasa a FALSE en cuanto la caja sale de su haz, mucho antes de que EyeB la vea', correct: true, feedback: 'Sí. EyeA solo ve la caja al comienzo de la cinta, así que el programa debe mantener la cinta encendida en el tramo intermedio.' }
  - { text: 'Porque EyeA es una salida y no puede accionar la cinta', feedback: 'EyeA es una entrada del PLC. Copiarla es ST válido, pero pasa a FALSE en cuanto la caja se aleja.' }
  - { text: 'Porque la cinta se detiene automáticamente después de un ciclo de escaneo', feedback: 'La cinta funciona mientras Run sea TRUE; se detiene solo porque copiar EyeA escribe FALSE en cuanto la caja sale del haz.' }
```

```quiz
question: En la bomba de achique del ejemplo resuelto, HighFloat está en TRUE y LowFloat está en FALSE en el mismo ciclo de escaneo. ¿Qué vale Pump al final del ciclo?
options:
  - { text: 'TRUE', correct: true, feedback: 'Correcto. SR tiene prioridad al set, así que S1 (HighFloat) gana sobre R (NOT LowFloat) cuando ambos son TRUE.' }
  - { text: 'FALSE', feedback: 'R está en TRUE porque LowFloat es FALSE, pero SR da prioridad a S1, así que PumpLatch.Q1 permanece en TRUE.' }
  - { text: 'Alterna en cada ciclo de escaneo', feedback: 'Ambas entradas se evalúan igual en cada ciclo, así que la salida se mantiene estable.' }
```

## Qué hará en la práctica

El proyecto inicial declara las entradas `EyeA` y `EyeB` y la salida `Run`, con el cuerpo vacío. Usted retendrá la cinta en marcha cuando `EyeA` vea la caja y la detendrá cuando `EyeB` vea la caja, con prioridad al reset, para que la caja llegue a `EyeB` dentro de los {{t:8000}} ms y la cinta esté detenida a los {{t:8000}} ms. Después pulse {{ui:learn.check}}.
