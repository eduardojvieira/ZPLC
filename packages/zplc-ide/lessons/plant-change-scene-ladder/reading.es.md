## La máquina

Esta es la estación de la práctica: dos líneas de embalaje, A y B, confluyen en una única cinta de salida que lleva una caja a la vez hasta el final de la línea. La imagen y las tablas muestran la estación completa, con todos los elementos que usa el escenario de la práctica. El archivo de escena de su proyecto es el que usted cambiará, y Comprobar dice en qué se diferencia.

![La escena de fusionar dos líneas vista desde arriba en ángulo. Tres cintas transportadoras forman una T: FeedA va de la izquierda hacia la unión, FeedB llega por el lado cercano al costado de la unión, y Outfeed sigue hacia la derecha y termina en Remover1, un contenedor gris. Unas marcas cian en las esquinas señalan el lugar de EmitterA en el extremo izquierdo de FeedA y el de EmitterB en el extremo cercano de FeedB. Cada elemento tiene una etiqueta con su nombre, su tipo, y la variable del programa y la señal a las que está enlazado, con una flecha que indica la dirección.](images/machine.es.png)

La estación tiene trece elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección enlaza cada señal de la escena con ella.

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

`Remover1` no está cableado al PLC: retira por su cuenta cada caja que llega al extremo de `Outfeed`. Su programa lee cuatro entradas y acciona ocho salidas.

## Una escena y su mapa de planta

La máquina se describe con dos archivos de su proyecto, y el programa no conoce ninguno de los dos.

- La **escena**, `scene.json`, enumera los elementos: de cada uno, su nombre, su lugar en el suelo, su rotación y sus ajustes. Una señal de un elemento es el nombre del elemento, un punto y la señal de su tipo, como `FeedA.run`.
- El **mapa de planta**, `plant-map.json`, enlaza cada señal con un punto del programa, escrito `Programa.Variable`, como `MergeLines.RunA`. ZPLC nunca adivina una variable a partir del nombre de una señal: una señal que no está en el mapa no llega al programa.

El escenario de una lección nombra los dos archivos. Cuando usted pulsa {{ui:learn.check}}, ZPLC lee los archivos guardados de su proyecto, ejecuta su programa guardado sobre esa escena con ese mapa y evalúa lo que ocurrió. Por eso el mismo programa sobre otra escena puede dar otro resultado, y el programa no siempre es el archivo que hay que cambiar.

## Cambiar una escena en el editor

El editor cambia el archivo de escena y el mapa de planta sin escribirlos a mano. Necesita que la planta esté detenida.

1. Abra la planta con {{ui:command.view.showPlant}} en la paleta de comandos. En {{ui:plant.panel.scene}}, elija {{ui:plant.panel.projectScene}} y pulse {{ui:plant.panel.editScene}}.
2. La lista de piezas muestra todos los elementos de la escena. Seleccione uno para ver {{ui:plantEditor.formHeading}}: su nombre, su posición X y Z, su rotación y un campo para cada ajuste de su tipo, con su unidad. Un campo se aplica al pulsar Intro o al salir del campo. Un valor fuera del rango de su ajuste se rechaza, con el mensaje en el campo.
3. Para colocar un elemento, las posiciones siguen una cuadrícula de 0,25 m y las rotaciones van en pasos de 15 grados. Un elemento soltado a menos de 0,15 m de un punto de enganche de otro elemento se engancha a él.
4. La tabla {{ui:plantEditor.signalsHeading}} enumera todas las señales que ofrecen los elementos, con su tipo, su dirección y el punto del programa al que están enlazadas. Para enlazar una señal, escriba el punto en el campo de su fila y pulse Enlazar en esa misma fila.
5. Pulse {{ui:plantEditor.done}} para cerrar el editor. La planta se reconstruye a partir de la escena editada. Después pulse {{ui:plant.panel.saveToProject}}: escribe `scene.json` y `plant-map.json` en la raíz del proyecto, los dos archivos que lee Comprobar.

Cada edición se puede deshacer con Deshacer y rehacer con Rehacer. Los ajustes de cada tipo de elemento, con sus rangos, están en la referencia de piezas de la documentación.

## Ejemplo resuelto

La estación de cinta a sensor de la primera lección de planta en diagrama de escalera tiene una cinta llamada `Belt1`, un emisor, un sensor en el extremo y un pulsador de inicio. Su programa está terminado: una pulsación del pulsador de inicio pone una caja en la cinta, y la cinta se detiene cuando el sensor ve la caja. El dueño de la planta instala ahora una cinta más lenta, y nadie quiere tocar el programa.

En el editor, el cambio es un solo campo. Seleccione `Belt1`, escriba `0,25` en `speedMps (m/s)` en lugar de `0,5`, pulse Intro, pulse {{ui:plantEditor.done}} y después {{ui:plant.panel.saveToProject}}. Cambió la escena; el mapa de planta no cambió, y el programa tampoco. Esta tabla sale de ejecutar el programa terminado sobre la escena guardada con el escenario de esa lección, que pulsa el pulsador de inicio a los {{t:200}} ms y pide que el sensor vea la caja antes de 8 segundos:

| Velocidad de la cinta | La cinta se detiene a los               | Comprobar |
| --------------------- | --------------------------------------- | --------- |
| 0,5 m/s               | unos 3,25 s                             | aprueba   |
| 0,25 m/s              | unos 5,93 s                             | aprueba   |
| 0,2 m/s               | unos 7,3 s                              | aprueba   |
| 0,125 m/s             | no antes de que terminen los 8 segundos | falla     |

A 0,125 m/s la caja no ha llegado al sensor cuando terminan los 8 segundos, así que fallan dos de las aserciones. El programa es el mismo en las cuatro filas. Solo la escena decidió el resultado.

Ahora el dueño también cambia en el editor el nombre de la cinta, de `Belt1` a `Conv1`, y guarda la escena. Comprobar ya no evalúa la ejecución. Informa de un problema en `plant-map.json`: `"Belt1.run" is not a command signal of the scene`. El mapa sigue nombrando la señal de un elemento que cambió de nombre. Enlazar la señal `Conv1.run` al mismo punto de antes, `BeltToSensor.Run`, y guardar de nuevo hace que Comprobar apruebe.

Esta máquina solo cambia un ajuste y un nombre de elementos que ya existen. La práctica pide un cambio que este ejemplo no muestra: usted decide cuál es, y dónde va, a partir de la escena, del programa y de lo que dice Comprobar.

## Errores comunes

- Editar el programa cuando lo que hay que cambiar es la escena. Un programa que da las salidas correctas no puede hacer que funcione un elemento que falta o que está mal.
- Escribir un valor y no pulsar Intro ni salir del campo. Un campo se aplica solo entonces, y la escena conserva su último valor.
- Intentar editar con la planta en marcha. {{ui:plant.panel.editScene}} está desactivado mientras la planta funciona: deténgala primero.
- Cambiar el nombre de un elemento y no actualizar el mapa de planta. El mapa se escribe con nombres de señales, así que el nombre antiguo no se enlaza con nada y Comprobar rechaza la ejecución.
- Fiarse de un elemento porque está en la lista. Un elemento que existe no siempre es un elemento que funciona: compare su lugar, su rotación y sus ajustes con los de los elementos que lo rodean, y lea lo que informa Comprobar.
- Salir del editor sin guardar. {{ui:plantEditor.done}} reconstruye la planta en pantalla, pero Comprobar lee los archivos, así que pulse también {{ui:plant.panel.saveToProject}}.

> [!NOTE]
> Una escena que pasa su escenario solo dice que el programa se comportó correctamente en esa escena en el simulador. No es evidencia sobre una máquina real, sus tiempos ni su seguridad.

## Compruébelo usted

```quiz
question: En el ejemplo resuelto la cinta se frena a 0,125 m/s y el programa no se cambia. ¿Qué informa Comprobar?
options:
  - { text: 'El escenario falla, porque la caja no ha llegado al sensor cuando terminan los 8 segundos', correct: true, feedback: 'Sí. Nada cambió en el programa: solo la escena cambió lo que ve el sensor y cuándo lo ve.' }
  - { text: 'El escenario aprueba, porque el programa es el mismo', feedback: 'El programa es el mismo, pero Comprobar evalúa el programa sobre la escena, y en esta escena la caja llega demasiado tarde.' }
  - { text: 'Comprobar informa de un error en el mapa de planta', feedback: 'El mapa sigue nombrando señales que existen: solo cambió un ajuste de Belt1, no un nombre.' }
```

```quiz
question: Después de cambiar el nombre de la cinta a `Conv1` y guardar la escena, ¿por qué informa Comprobar de un problema en `plant-map.json`?
options:
  - { text: 'Porque el mapa sigue enlazando `Belt1.run`, una señal que la escena ya no tiene', correct: true, feedback: 'Correcto. Las señales de un elemento empiezan por su nombre, así que un elemento renombrado tiene señales nuevas que hay que enlazar.' }
  - { text: 'Porque el programa ya no compila', feedback: 'El programa no cambió y sigue compilando. El problema está en el mapa.' }
  - { text: 'Porque el archivo de escena no es un JSON válido', feedback: 'El editor escribe una escena válida. El mensaje nombra una señal del mapa que la escena no tiene.' }
```

## Qué hará en la práctica

La escena de su proyecto es la estación de fusión de la imagen, con su mapa de planta, y su programa, un diagrama de escalera en `src/MergeLines.ld.json`, está terminado: ya acciona todas las salidas de la estación y deja pasar las dos líneas de una en una. El escenario pulsa el pulsador de inicio a los {{t:200}} ms y comprueba que salen cajas de los dos alimentadores por la cinta de salida, que Done está encendido a los {{t:25000}} ms y que ninguna caja cae ni choca. Tal como está el proyecto, la línea B no recibe cajas. Cambie la escena y su mapa de planta, no el programa, guárdelos y pulse {{ui:learn.check}}.
