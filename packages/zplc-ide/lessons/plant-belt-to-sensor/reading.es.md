## La máquina

Esta es la primera máquina del curso y la estación más pequeña de una línea de embalaje: se pone una caja en una cinta, la cinta la lleva hasta el extremo, y un sensor allí le avisa al programa que la caja llegó. Las líneas reales son largas cadenas de estaciones como esta, y cada una arranca y detiene una cinta según lo que ven sus sensores.

![La escena de la cinta al sensor vista de frente. Una cinta transportadora sobre patas va de izquierda a derecha. A la izquierda, cuatro marcas cian en las esquinas muestran dónde el emisor pone una caja en la cinta, y detrás de la cinta está el pulsador de inicio sobre un pedestal. En el extremo derecho un sensor sobre un poste mira a través de la cinta. Cada elemento tiene una etiqueta con su nombre, su tipo y su señal conectada.](images/machine.es.png)

La estación tiene cuatro elementos. La tabla dice qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Pieza                           | Qué es en una planta real                                                                                                             | Señal                 | Variable del PLC | Dirección       | Tipo | Significado                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------- | --------------- | ---- | ---------------------------------------------------- |
| `Belt1` (Cinta transportadora)  | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. | `Belt1.run`           | `Run`            | Salida del PLC  | BOOL | TRUE hace avanzar la cinta.                          |
| `Emitter1` (Emisor de piezas)   | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             | `Emitter1.emit`       | `Emit`           | Salida del PLC  | BOOL | Cada flanco ascendente suelta una pieza en la línea. |
| `EyeFar` (Sensor óptico difuso) | Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.                                                 | `EyeFar.detect`       | `EyeFar`         | Entrada del PLC | BOOL | TRUE mientras hay un objeto en el haz.               |
| `StartButton` (Pulsador)        | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     | `StartButton.pressed` | `Start`          | Entrada del PLC | BOOL | TRUE mientras el pulsador se mantiene presionado.    |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. Su programa solo ve las cuatro variables: nunca ve la caja misma, solo lo que el sensor dice de ella.

## Una pulsación es corta, el trabajo es largo

Un pulsador está en TRUE solo mientras un dedo lo mantiene, una fracción de segundo. La cinta, en cambio, debe seguir en marcha varios segundos, hasta que la caja llegue al sensor. Si Run simplemente copiara Start, la cinta se movería solo mientras se mantiene el pulsador y se detendría con la caja a mitad de camino.

Por eso el programa necesita una **memoria**: una variable BOOL propia, no conectada a ningún elemento, que recuerda "la cinta debe estar en marcha". Una condición la activa, otra la borra, y la salida la sigue.

```timing
span: 6000
signals:
  - { name: Start, edges: [200, 400] }
  - { name: Memory, edges: [200, 4800] }
  - { name: EyeFar, edges: [4800, 6000] }
  - { name: Run, edges: [200, 4800] }
caption: Una pulsación corta activa la memoria, el sensor la borra y la cinta sigue a la memoria
```

El sensor sigue en TRUE mientras la caja está delante de él, así que mantiene la memoria borrada. Eso es lo que se busca: la caja espera al final de la cinta hasta que alguien la retire.

Cuando la activación y el borrado están los dos en TRUE en el mismo ciclo, gana la instrucción escrita al final, porque las instrucciones se ejecutan de arriba abajo. Decida cuál debe ganar: aquí una parada del sensor importa más que un arranque.

## Ejemplo resuelto

Una cortina enrollable sobre una puerta de carga tiene un botón Open y un final de carrera superior. Una pulsación corta debe abrir la cortina del todo: el motor funciona hasta que el final de carrera indica que la cortina está arriba. Es el mismo problema que el de la cinta, resuelto aquí con una autorretención, la forma que vio en diagrama de escalera y en la lección del motor:

```st
PROGRAM Shutter
VAR_INPUT OpenButton : BOOL; TopLimit : BOOL; END_VAR
VAR_OUTPUT Motor : BOOL; END_VAR
VAR Opening : BOOL; END_VAR
Opening := (OpenButton OR Opening) AND NOT TopLimit;
Motor := Opening;
END_PROGRAM
```

Lea la asignación desde la derecha. `OpenButton OR Opening` sigue en TRUE después de soltar el botón, porque Opening se mantiene a sí misma. `AND NOT TopLimit` corta esa retención en cuanto el final de carrera se cierra, y también gana cuando los dos están en TRUE. Dos instrucciones IF, una que activa Opening y otra después que la borra, hacen lo mismo de una forma que a muchos programadores les resulta más fácil de leer.

## Errores comunes

- Accionar la cinta directamente desde el pulsador. La cinta se mueve solo mientras se mantiene el pulsador, y la caja se detiene a mitad de camino.
- Activar la memoria y no borrarla nunca. La cinta lleva la caja más allá del sensor y la hace caer por el extremo.
- Borrar antes de activar, de modo que un pulsador mantenido vuelve a arrancar la cinta mientras la caja sigue delante del sensor.
- Olvidar declarar la memoria. Toda variable que usa el programa se declara, y una memoria del programa va en `VAR`.

> [!NOTE]
> El sensor ve la caja solo mientras la caja está en su haz. Una caja que pasa rápido delante de un sensor puede estar en el haz poco tiempo, y un programa que lo lee tarde no la ve. Aquí la cinta detiene la caja dentro del haz, así que la señal sigue en TRUE.

## Compruébelo usted

```quiz
question: ¿Por qué la cinta necesita una variable de memoria si Start llega directamente al programa?
options:
  - { text: 'Porque Start está en TRUE solo mientras se mantiene el pulsador, y la cinta debe seguir en marcha después', correct: true, feedback: 'Sí. La memoria recuerda la pulsación después de que el dedo se fue.' }
  - { text: 'Porque una salida no se puede escribir desde una entrada', feedback: 'Una salida puede copiar una entrada. La cinta se detendría entonces en cuanto se suelta el pulsador.' }
  - { text: 'Porque el sensor necesita una memoria para ver la caja', feedback: 'El sensor está en TRUE mientras la caja está en su haz; no necesita nada del programa.' }
```

```quiz
question: En el mismo ciclo Start y EyeFar están los dos en TRUE. El programa activa la memoria primero y la borra en la instrucción siguiente. ¿Qué vale la memoria al final del ciclo?
options:
  - { text: 'FALSE', correct: true, feedback: 'Correcto. Las instrucciones se ejecutan de arriba abajo, así que gana el borrado, escrito al final.' }
  - { text: 'TRUE', feedback: 'La activación se ejecutó primero, pero el borrado se ejecutó después en el mismo ciclo.' }
  - { text: 'Cambia en cada ciclo', feedback: 'Las dos condiciones dan el mismo resultado en cada ciclo: el borrado siempre va al final.' }
```

## Qué hará en la práctica

El programa inicial declara las entradas Start y EyeFar y las salidas Run y Emit, y no acciona nada. Usted escribirá el programa de la estación: una pulsación del pulsador de inicio, que el escenario da a los {{t:200}} ms, pone una caja en la cinta y la hace avanzar, y la cinta se detiene cuando EyeFar ve la caja. Después pulse {{ui:learn.check}}.
