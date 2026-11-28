## La máquina

Esta es la primera máquina del curso y la estación más pequeña de una línea de embalaje: se pone una caja en una cinta, la cinta la lleva hasta el extremo, y un sensor allí le avisa al programa que la caja llegó. Las líneas reales son largas cadenas de estaciones como esta, y cada una arranca y detiene una cinta según lo que ven sus sensores.

![La escena de la cinta al sensor vista de frente. Una cinta transportadora sobre patas va de izquierda a derecha. A la izquierda, cuatro marcas cian en las esquinas muestran dónde el emisor pone una caja en la cinta, y detrás de la cinta está el pulsador de inicio sobre un pedestal. En el extremo derecho un sensor sobre un poste mira a través de la cinta. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

La estación tiene cuatro elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Belt1`       | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Emitter1`    | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `EyeFar`      | Sensor óptico difuso | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |

| Variable del PLC | Señal                 | Dirección y tipo       | Significado                                          |
| ---------------- | --------------------- | ---------------------- | ---------------------------------------------------- |
| `Run`            | `Belt1.run`           | Salida del PLC · BOOL  | TRUE hace avanzar la cinta.                          |
| `Emit`           | `Emitter1.emit`       | Salida del PLC · BOOL  | Cada flanco ascendente suelta una pieza en la línea. |
| `EyeFar`         | `EyeFar.detect`       | Entrada del PLC · BOOL | TRUE mientras hay un objeto en el haz.               |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado.    |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. Su programa solo ve las cuatro variables: nunca ve la caja misma, solo lo que el sensor dice de ella.

## Una pulsación es corta, el trabajo es largo

Un pulsador está en TRUE solo mientras un dedo lo mantiene, una fracción de segundo. Una bobina simple en diagrama de escalera sigue a su peldaño en cada ciclo, así que un peldaño directo de Start a Run mueve la cinta solo mientras se mantiene el pulsador y la detiene con la caja a mitad de camino.

Por eso el programa necesita una **memoria**: una variable BOOL local — `Running` — no conectada a ningún elemento, que recuerda "la cinta debe estar en marcha". En diagrama de escalera, una **bobina de activación (SET)** `(S)` enciende la memoria y la deja encendida después de soltar el pulsador, una **bobina de borrado (RESET)** `(R)` la apaga cuando llega la condición de parada, y otro peldaño lee esa memoria con un contacto para accionar la bobina de salida.

```timing
span: 6000
signals:
  - { name: Start, edges: [200, 400] }
  - { name: Running, edges: [200, 4800] }
  - { name: EyeFar, edges: [4800, 6000] }
  - { name: Run, edges: [200, 4800] }
caption: Una pulsación corta activa la memoria, el sensor la borra y la cinta sigue a la memoria
```

El sensor sigue en TRUE mientras la caja está delante de él, así que su peldaño mantiene la memoria borrada. Eso es lo que se busca: la caja espera al final de la cinta hasta que alguien la retire.

Cuando el peldaño de activación y el peldaño de borrado conducen los dos en el mismo ciclo, gana el peldaño dibujado **al final**, porque ZPLC resuelve los peldaños de arriba abajo. Cuál debe ganar es una decisión de la máquina, no del lenguaje.

## Ejemplo resuelto

Una cinta de recortes debajo de una máquina de corte lleva los sobrantes a un contenedor. Una pulsación breve de `ClearBelt` debe hacer funcionar la cinta hasta que una cortina de luz en su extremo, `BeltEmpty`, indique que no queda nada sobre ella. Pero el operador también usa el pulsador para mover la cinta a impulsos: mientras `ClearBelt` está pulsado, la cinta debe funcionar aunque la cortina indique que está vacía. Así que aquí gana el arranque, y el peldaño SET va al final:

```ld-figure
src: reading/scrap-belt.ld.json
caption: El peldaño 1 borra Clearing con BeltEmpty, el peldaño 2 activa Clearing con ClearBelt para que gane el arranque, y el peldaño 3 acciona Motor
```

Léalo de arriba abajo. El peldaño 1 borra `Clearing` cada vez que la cortina ve la cinta vacía. El peldaño 2 activa `Clearing` cada vez que se acciona el pulsador, y como está debajo del peldaño 1, un pulsador mantenido mantiene `Clearing` en TRUE aunque el peldaño 1 lo borre en cada ciclo. El peldaño 3 copia `Clearing` a la bobina `Motor`.

```ld-try
src: reading/scrap-belt.ld.json
inputs:
  - { name: ClearBelt, kind: push }
  - { name: BeltEmpty, kind: switch }
outputs: [Motor]
timing: [ClearBelt, BeltEmpty, Motor]
caption: Pulse y suelte ClearBelt, luego active BeltEmpty; mantenga ClearBelt mientras BeltEmpty está activo
```

Pulse Ejecutar, luego pulse y suelte `ClearBelt`: el motor sigue funcionando. Active `BeltEmpty`: el motor se detiene. Ahora mantenga pulsado `ClearBelt` mientras `BeltEmpty` sigue activo: el motor funciona mientras mantenga el pulsador, porque el peldaño 2 va al final.

Esta máquina no tiene nada que colocar sobre su cinta, solo una cinta que hacer funcionar. La estación de la práctica también tiene que colocar su caja, y qué peldaño gana allí queda para que usted lo decida a partir de lo que debe pasarle a la caja.

## Errores comunes

- Accionar la bobina de la cinta directamente desde el contacto `Start`. La cinta se mueve solo mientras se mantiene el pulsador, y la caja se detiene a mitad de camino.
- Dibujar una bobina SET sobre la memoria y olvidar su peldaño RESET. La cinta lleva la caja más allá del sensor y la hace caer por el extremo.
- Leer el sensor como un pulso. `EyeFar` sigue en TRUE mientras la caja esté en su haz, no solo en el ciclo en que llega la caja.
- Escribir la misma variable con una bobina simple y con una bobina SET o RESET. ZPLC admite un peldaño SET y uno RESET por variable enclavada, no una mezcla con una bobina simple.

> [!NOTE]
> El sensor ve la caja solo mientras la caja está en su haz. Una caja que pasa rápido delante de un sensor puede estar en el haz poco tiempo, y un programa que lo lee tarde no la ve. Aquí la cinta detiene la caja dentro del haz, así que la señal sigue en TRUE.

## Compruébelo usted

```quiz
question: '¿Por qué la cinta necesita una variable de memoria en lugar de un solo peldaño de Start a Run?'
options:
  - { text: 'Porque Start está en TRUE solo mientras se mantiene el pulsador, y una bobina simple cae en cuanto se suelta', correct: true, feedback: 'Sí. La memoria conserva el estado después de que el dedo se fue.' }
  - { text: 'Porque un contacto de escalera no puede leer una entrada directamente', feedback: 'Un contacto puede leer cualquier entrada directamente. El problema es que Start vuelve a FALSE demasiado pronto.' }
  - { text: 'Porque el sensor necesita una memoria para ver la caja', feedback: 'El sensor está en TRUE mientras la caja está en su haz; no necesita nada del programa.' }
```

```quiz
question: 'En la cinta de recortes del ejemplo resuelto, BeltEmpty y ClearBelt están los dos en TRUE en el mismo ciclo. ¿Qué vale Clearing al final del ciclo?'
options:
  - { text: 'TRUE', correct: true, feedback: 'Correcto. Los peldaños se resuelven de arriba abajo, así que gana el peldaño SET de ClearBelt, dibujado al final.' }
  - { text: 'FALSE', feedback: 'El peldaño 1 borra Clearing primero, pero el peldaño 2 lo vuelve a activar después en el mismo ciclo.' }
  - { text: 'Cambia en cada ciclo', feedback: 'Los dos peldaños se ejecutan en el mismo orden en cada ciclo, así que el resultado es el mismo cada vez.' }
```

## Qué hará en la práctica

El programa inicial declara las entradas Start y EyeFar, las salidas Run y Emit, y la variable local Running, y todavía no tiene peldaños. Usted dibujará los peldaños de la estación: una pulsación del pulsador de inicio, que el escenario da a los {{t:200}} ms, pone una caja en la cinta y la hace avanzar, y la cinta se detiene cuando EyeFar ve la caja. Después pulse {{ui:learn.check}}.
