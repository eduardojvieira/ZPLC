## La máquina

Esta estación clasifica piezas según el código que lleva cada una, y es la primera máquina de su escena en el curso. Las piezas llegan de a una por una cinta de entrada. Una cámara con su propio software lee el código de cada pieza al pasar por su campo de visión. Más adelante en la cinta, un brazo giratorio deja que la pieza siga de frente hasta el primer contenedor de producto, o la desvía hacia una cinta lateral que termina en un segundo contenedor. Las líneas reales encaminan paquetes, botellas y piezas de la misma manera, a partir de un código impreso en ellos.

![La escena de clasificación por visión vista de frente y desde arriba. Una cinta de entrada va de izquierda a derecha. Marcas cian en las esquinas de su extremo izquierdo muestran dónde el emisor pone una pieza, y el pulsador de inicio está detrás. Una cámara sobre un brazo encima de la cinta mira un rectángulo rojo de líneas discontinuas sobre la cinta, que marca su campo de visión. Más adelante, un brazo desviador está a lo largo del lado lejano de la cinta, y una cinta lateral más corta corre junto a la cinta de entrada hacia la derecha. Cada cinta termina en un contenedor, y la torre de luces está detrás del primero. Cada elemento tiene una etiqueta con su nombre, su tipo y las variables conectadas a él.](images/machine.es.png)

Las tablas dicen qué es cada elemento en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella.

| Elemento | Tipo | Qué es en una planta real |
| --- | --- | --- |
| `Infeed` | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `SideBelt` | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Source1` | Emisor de piezas | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza. |
| `Vision1` | Sensor de visión | Una cámara con software propio que lee un código impreso en la pieza. |
| `Arm1` | Brazo desviador | Un brazo que gira sobre la cinta y desvía las piezas hacia una línea lateral. |
| `Product1` | Retirador de piezas | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario. |
| `Product2` | Retirador de piezas | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario. |
| `StartButton` | Pulsador | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene. |
| `Beacon` | Torre de luces | Una torre de lámparas de colores que muestra a distancia qué hace la máquina. |

| Variable del PLC | Señal | Dirección y tipo | Significado |
| --- | --- | --- | --- |
| `RunIn` | `Infeed.run` | Salida del PLC · BOOL | TRUE hace avanzar la cinta. |
| `RunSide` | `SideBelt.run` | Salida del PLC · BOOL | TRUE hace avanzar la cinta. |
| — | `Source1` | — | No está cableado al PLC. |
| `Seen` | `Vision1.detect` | Entrada del PLC · BOOL | TRUE mientras hay una pieza en el campo de visión. |
| `Code` | `Vision1.code` | Entrada del PLC · INT, 0 a 9 code | El código leído de la pieza; 0 cuando no hay ninguno. |
| `Divert` | `Arm1.divert` | Salida del PLC · BOOL | TRUE gira el brazo sobre la cinta; FALSE lo devuelve al reposo. |
| — | `Product1` | — | No está cableado al PLC. |
| — | `Product2` | — | No está cableado al PLC. |
| `Start` | `StartButton.pressed` | Entrada del PLC · BOOL | TRUE mientras el pulsador se mantiene presionado. |
| `Busy` | `Beacon.amber` | Salida del PLC · BOOL | TRUE enciende la lámpara ámbar. |
| `Done` | `Beacon.green` | Salida del PLC · BOOL | TRUE enciende la lámpara verde. |

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. El emisor y los dos contenedores no están cableados: su programa nunca ve una pieza si no es a través del sensor de visión, y solo el escenario cuenta las piezas que llegan a cada contenedor. El escenario suelta doce piezas, una cada 5 segundos, ocho con código 1 y cuatro con código 2. Las dos cintas avanzan a 0.5 metros por segundo. Las piezas de código 1 pertenecen al primer contenedor, `Product1`, y las de código 2 al segundo, `Product2`. El brazo tarda unos 0.4 segundos en cruzar y lo mismo en volver.

## El código está solo un instante

Una pieza está en el campo de visión del sensor durante 1.0 segundo, unos 100 ciclos de escaneo. Durante ese tiempo `Seen` está en TRUE y `Code` vale 1 o 2. Antes y después, `Seen` está en FALSE y `Code` vale 0, lo que significa que no hay pieza. El programa lee el código de una pieza de la entrada en ese segundo, y nunca más.

El brazo no está en el sensor sino más adelante en la cinta. Cuando la pieza llega al brazo, `Code` vuelve a ser 0. Por eso el programa tiene que **recordar** lo que leyó, y actuar después, cuando la pieza ha recorrido el camino del sensor al brazo. Cuánto tarda eso es la distancia dividida por la velocidad de la cinta, y depende de la máquina: una cinta más larga o más lenta necesita una espera más larga.

```timing
span: 12000
signals:
  - { name: InView, edges: [1000, 2000] }
  - { name: Due, edges: [1000, 7000] }
  - { name: Push, edges: [7000, 8000] }
caption: Un paquete se lee en el primer segundo, el empuje queda pendiente durante todo el trayecto, y el empujador se mueve cuando el paquete llega
```

## Ejemplo resuelto

En una línea de paquetes, un lector está 1.5 m antes de un empujador y la cinta avanza a 0.25 m/s. Un paquete con código 3 debe empujarse fuera de la cinta hacia un carro; los demás siguen. `InView` está en TRUE mientras un paquete está delante del lector, y `ParcelCode` guarda su código. El empujador debe salir cuando llega el paquete, 1.5 ÷ 0.25 = 6 segundos después de leerlo, y quedarse fuera 1 segundo:

```st
PROGRAM ParcelPusher
VAR_INPUT InView : BOOL; ParcelCode : INT; END_VAR
VAR_OUTPUT Push : BOOL; END_VAR
VAR
    Due    : BOOL;
    Travel : TON;
    Stroke : TON;
END_VAR
IF InView AND ParcelCode = 3 THEN Due := TRUE; END_IF;
Travel(IN := Due, PT := T#6s);
IF Travel.Q THEN Push := TRUE; Due := FALSE; END_IF;
Stroke(IN := Push, PT := T#1s);
IF Stroke.Q THEN Push := FALSE; END_IF;
END_PROGRAM
```

Léalo desde arriba. El primer IF activa `Due` cuando hay un paquete con código 3 a la vista: hay un empuje pendiente. `Travel` cuenta mientras `Due` está en TRUE, y a los 6 segundos el segundo IF saca el empujador y borra `Due`, con lo que `Travel` vuelve a empezar desde cero para el paquete siguiente. `Stroke` cuenta mientras el empujador está fuera, y al cabo de 1 segundo el último IF lo hace volver.

Esta línea atiende un paquete a la vez: un segundo paquete leído mientras el primero todavía viaja no tendría su propio empuje, porque `Due` ya está en TRUE. Los números 6 y 1 son los de esta línea. La estación de la práctica tiene un brazo en lugar de un empujador, cintas a otra velocidad y distancias propias; qué necesita, y cuándo, queda para que usted lo decida a partir de lo que debe pasarle a la pieza.

## Errores comunes

- Contar ciclos de escaneo como piezas. El código permanece en la entrada durante todo el segundo, así que un programa que reacciona en cada ciclo en que no es cero ve unas cien piezas por cada pieza real.
- Copiar los números de otra máquina. Con los 6 segundos y el 1 segundo del ejemplo, en una ejecución de esta estación las cuatro piezas de código 2 siguieron de frente hasta `Product1` y quedaron mal encaminadas.
- No hacer volver nunca la salida. En una ejecución de la solución de la lección con el brazo sin soltar nunca, las doce piezas fueron a `Product2` y ocho de ellas quedaron mal encaminadas.
- Tomar un código 0 por una pieza. 0 significa que no hay nada en el campo de visión.

## Compruébelo usted

```quiz
question: Un lector está 1.5 m antes de un empujador y la cinta avanza a 0.25 m/s. ¿Cuánto tarda un paquete en llegar al empujador después de ser leído?
options:
  - { text: '6 segundos', correct: true, feedback: 'Sí. El tiempo es la distancia dividida por la velocidad: 1.5 ÷ 0.25 = 6.' }
  - { text: '0.375 segundos', feedback: 'Eso es la distancia multiplicada por la velocidad. La cinta avanza 0.25 m cada segundo, así que 1.5 m tardan más de un segundo.' }
  - { text: '1.75 segundos', feedback: 'Eso suma los dos números, y una distancia y una velocidad no se pueden sumar. Divida la distancia por la velocidad.' }
```

```quiz
question: En la línea de paquetes, ¿qué recuerda Due?
options:
  - { text: 'Que se leyó un paquete con código 3 y su empuje sigue pendiente', correct: true, feedback: 'Correcto. El código está en la entrada solo un instante, así que Due guarda la decisión hasta que llega el paquete.' }
  - { text: 'Que el empujador está fuera', feedback: 'Eso lo dice Push. Due se borra en el mismo momento en que se activa Push.' }
  - { text: 'Que hay un paquete delante del lector', feedback: 'Eso lo dice InView. Due sigue en TRUE mucho después de que el paquete dejó el lector.' }
```

## Qué hará en la práctica

El proyecto inicial declara las entradas y las salidas de la estación y no acciona nada. Usted escribirá el programa de la estación: una pulsación del pulsador de inicio, que el escenario da a los {{t:200}} ms, pone en marcha las dos cintas, toda pieza de código 1 debe terminar en `Product1` y toda pieza de código 2 en `Product2`, y la lámpara verde debe estar encendida al final, a los {{t:78000}} ms. Después pulse {{ui:learn.check}}.
