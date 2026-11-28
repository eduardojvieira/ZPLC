## La máquina

Esta es la estación más pequeña de una línea de embalaje: se pone una caja en una cinta, la cinta la lleva hasta el extremo, y un sensor allí le avisa al programa que la caja llegó. Ya la conoce de la lección "Mover una caja hasta un sensor en diagrama de escalera", donde la escena venía lista. En esta lección la escena empieza como un suelo vacío, y usted construye la estación en el editor de escenas.

![La escena de la cinta al sensor vista de frente, con el título "Cinta hasta un sensor". Una cinta transportadora sobre patas va de izquierda a derecha. En su parte izquierda, cuatro marcas cian en las esquinas muestran dónde el emisor pone una caja en la cinta. Detrás de la cinta está el pulsador de inicio sobre un pequeño pedestal. A la derecha, un sensor sobre un poste lanza una fina línea roja de puntos a través de la cinta. Cuatro etiquetas dan a cada elemento su nombre, su tipo y su señal, y una línea al pie dice que una flecha hacia la variable es una entrada del PLC y una flecha hacia la señal es una salida del PLC.](images/machine.es.png)

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

## Una escena es piezas, nombres y enlaces

La escena es una lista de piezas. Cada pieza tiene un nombre, una posición en el suelo, una rotación y ajustes propios, como el largo de una cinta. El nombre es la primera mitad de las señales de la pieza: una pieza llamada `Belt1` ofrece `Belt1.run`.

Una señal llega a su programa solo cuando usted la enlaza. En el editor se escribe el punto del programa, con la forma `Programa.Variable`, y se pulsa Enlazar; ZPLC nunca adivina una variable a partir de un nombre. Los enlaces se guardan en el mapa de planta, junto a la escena. Comprobar lee los dos archivos en la raíz del proyecto: `scene.json` y `plant-map.json`.

El escenario de la lección busca dos piezas por su nombre: pulsa `StartButton` y lee cuántas cajas ha visto `EyeFar`. Si `EyeFar` falta o está mal escrito, Comprobar dice que el escenario nombra una pieza que la escena no tiene, la nombra y enumera las piezas que la escena sí tiene. Use los nombres de la sección de la máquina para los cuatro elementos.

## Construirla en el editor de escenas

1. Abra la planta con {{ui:command.view.plant}} en la paleta de comandos. En {{ui:plant.panel.scene}}, la escena de la lección aparece como {{ui:plant.panel.projectScene}}. Déjela seleccionada: es la escena que lee Comprobar.
2. Pulse {{ui:plant.panel.editScene}}. El editor necesita que la planta esté detenida.
3. En {{ui:plantEditor.filterLabel}} y {{ui:plantEditor.addLabel}}, elija una pieza y pulse {{ui:plantEditor.add}}. La pieza aparece en el origen del suelo y queda seleccionada.
4. En {{ui:plantEditor.formHeading}}, escriba el nombre, la posición X y Z en metros, la rotación en grados y los ajustes de la pieza. Un campo se aplica al pulsar Intro o al salir del campo. Las posiciones siguen una cuadrícula de 0,25 m, las rotaciones van en pasos de 15 grados, y una pieza soltada a menos de 0,15 m de un punto de enganche de otra pieza, como el extremo de una cinta, se engancha a él.
5. En {{ui:plantEditor.signalsHeading}}, escriba el punto del programa de cada señal que aún no esté enlazada y pulse Enlazar.
6. Pulse {{ui:plantEditor.done}} y después {{ui:plant.panel.saveToProject}}. Para la escena de la lección no pide un nombre y escribe `scene.json` y `plant-map.json` en la raíz del proyecto.

Si en cambio elige {{ui:plant.panel.emptyFloor}} en {{ui:plant.panel.scene}}, {{ui:plant.panel.saveToProject}} pide un nombre y guarda la escena como `scenes/<nombre>.scene.json`, que Comprobar no lee.

## Cómo ve una caja un sensor difuso

El haz de un sensor óptico difuso parte de la posición de la pieza y avanza por el eje +x propio de la pieza tantos metros como indique su ajuste de alcance. Una cinta también avanza por +x. La rotación gira el haz alrededor del eje vertical: con rotación 0 el sensor mira a lo largo de la cinta, y una rotación de 90 grados lo gira de +x hacia -z. En la imagen de la máquina el haz es la fina línea roja de puntos.

Deben cumplirse tres cosas para que el sensor vea una caja. El haz debe cruzar el camino de la caja. Debe ser lo bastante largo para llegar a la caja. Y la caja debe estar en él: el sensor está en TRUE solo mientras la caja está en el haz, y vuelve a FALSE en cuanto la caja ha pasado.

## Ejemplo resuelto

Una sala de correo tiene una cinta de entrada larga que lleva cajas a una mesa de clasificación. Su escena tiene una cinta `Feed`, de 5 m de largo, que avanza por +x con su centro en X 0, Z 0; un emisor `Source` que suelta una caja al comienzo de la cinta; y un sensor difuso `Gate` que avisa al programa de que una caja pasa 1,5 m más allá del centro de la cinta. El sensor está del lado +z de la cinta, a 0,5 m de su línea central, y su alcance es el predeterminado, 0,5 m.

Se construye en el editor así: se añade la cinta y se escribe `5` como su largo; se añade el emisor y se suelta cerca del comienzo de la cinta, donde se engancha al punto de enganche de ese extremo; se añade el sensor y se escribe X `1.5`, Z `0.5` y rotación `90`. La tabla de señales muestra entonces `Feed.run`, `Source.emit` y `Gate.detect`, y se enlaza cada una con una variable del programa.

Para ver qué hace el sensor, una ejecución de esta escena mantuvo la cinta en marcha todo el tiempo y soltó una caja a los 0,2 s:

```timing
span: 10000
signals:
  - { name: Source, edges: [200, 400] }
  - { name: Gate, edges: [7970, 8770] }
caption: Una caja soltada a los 0,2 s activa Gate a los 7,97 s y lo desactiva a los 8,77 s mientras la cinta sigue en marcha
```

Gate está en TRUE solo durante los 0,8 s en que la caja está en el haz, aunque la cinta nunca se detuvo. Otros tres ajustes del mismo sensor nunca vieron la caja en una ejecución de 10 s:

- Rotación 0: el haz va a lo largo de la cinta, a su lado, y nunca encuentra la caja.
- Rotación 270: el haz se aleja de la cinta.
- Rotación 90 con alcance 0,3 m en lugar de 0,5 m: el haz termina antes de llegar a la caja.

Los números pertenecen a esta máquina: un sensor a 1,5 m más allá del centro de una cinta no significa nada en una cinta más corta. La estación de la práctica tiene su propia cinta, y usted deduce de la sección de la máquina dónde va su sensor y hacia dónde mira.

## Errores comunes

- Colocar el sensor y dejar su rotación en 0. El haz va a lo largo de la cinta, el sensor nunca se activa y el programa nunca detiene la cinta.
- Dejar una señal sin enlazar. Una cinta cuyo `run` está sin enlazar nunca se mueve, un emisor cuyo `emit` está sin enlazar nunca pone una caja en ella, y un sensor cuyo `detect` está sin enlazar es invisible para el programa.
- Escribir mal `EyeFar` o `StartButton`. El escenario los busca por su nombre y no encuentra nada.
- Guardar una escena que no es la escena del proyecto. Comprobar lee `scene.json` en la raíz del proyecto, no los archivos de `scenes/`.
- Editar con la planta en marcha. {{ui:plant.panel.editScene}} está desactivado hasta que se detiene la planta.

## Compruébelo usted

```quiz
question: 'Un sensor difuso está junto a una cinta con rotación 0. ¿Por dónde va su haz?'
options:
  - { text: 'A través de la cinta, hasta su centro', feedback: 'El haz cruza la cinta solo después de que la rotación lo gira hacia la cinta.' }
  - { text: 'A lo largo de la cinta, a su lado, así que nunca encuentra una caja', correct: true, feedback: 'Sí. Con rotación 0 el haz va por +x, la dirección de la cinta, y el sensor está junto a la cinta, no frente a ella.' }
  - { text: 'Recto hacia arriba, sobre la cinta', feedback: 'El haz es horizontal. La rotación lo gira alrededor del eje vertical; nunca apunta hacia arriba.' }
```

```quiz
question: 'Usted construye la escena con {{ui:plant.panel.emptyFloor}} elegido en la lista de escenas y pulsa {{ui:plant.panel.saveToProject}}. ¿Por qué Comprobar sigue diciendo que el escenario nombra una pieza que la escena no tiene?'
options:
  - { text: 'Porque el editor guarda solo las piezas que ya están enlazadas', feedback: 'El editor guarda todas las piezas que usted colocó. El problema es adónde fue el archivo.' }
  - { text: 'Porque la planta tiene que ejecutarse una vez antes de que Comprobar pueda leer la escena', feedback: 'Comprobar lee los archivos guardados; la planta no tiene que ejecutarse.' }
  - { text: 'Porque se guardó en scenes/<nombre>.scene.json, y Comprobar lee scene.json en la raíz', correct: true, feedback: 'Correcto. Solo la escena de la lección se guarda en su lugar, en la raíz.' }
```

```quiz
question: 'En el ejemplo resuelto la cinta funciona todo el tiempo y Gate se activa a los 7,97 s. ¿Cuándo se desactiva?'
options:
  - { text: 'Nunca, porque un sensor conserva el valor de su última detección', feedback: 'El sensor informa del haz tal como está ahora. No recuerda.' }
  - { text: 'A los 8,77 s, cuando la caja ha salido del haz', correct: true, feedback: 'Sí. Gate está en TRUE solo mientras la caja está en el haz, y la cinta sigue llevando la caja.' }
  - { text: 'Cuando el programa detiene la cinta', feedback: 'La cinta nunca se detuvo en esta ejecución, y Gate se desactivó igual.' }
```

## Qué hará en la práctica

El programa inicial declara las entradas Start y EyeFar y las salidas Run y Emit, y tiene un peldaño que pone la caja en la cinta; la escena inicial es un suelo vacío. Usted construirá la escena de la estación y completará su programa: una pulsación del pulsador de inicio, que el escenario da a los {{t:200}} ms, pone una caja en la cinta y la hace avanzar, y la cinta se detiene cuando EyeFar ve la caja. Después pulse {{ui:learn.check}}.
