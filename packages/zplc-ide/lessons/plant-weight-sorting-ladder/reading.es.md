## La máquina

Esta es una controladora de peso, una estación que pesa cada pieza de una línea y la envía según su peso. Cajas de dos masas distintas bajan por la línea una a la vez. Cada una se retiene en una báscula, se pesa y después se empuja hacia un lado, a un contenedor de cajas pesadas, o se deja pasar hacia otro de cajas livianas. Las líneas de embalaje usan estaciones así para rechazar bolsas con poco contenido o para separar un producto por clases de peso antes de embalarlo.

![La escena de clasificación por peso vista desde arriba en perspectiva. Una cinta larga, la de entrada, va de izquierda a derecha, con el emisor de piezas y el pulsador de inicio en su extremo izquierdo. Cerca del centro de la cinta, en el mismo lugar, están una báscula con una pequeña pantalla y una placa naranja del empujador detrás de la cinta. Una cinta lateral corta sale del centro de la línea hacia el frente y termina en el contenedor de pesadas. La línea sigue hacia la derecha y termina en el contenedor de livianas, junto a la torre de luces. Cada elemento tiene una etiqueta con su nombre y su tipo, y los elementos que usa el programa muestran también su variable y su señal.](images/machine.es.png)

La estación tiene once elementos. Las tablas dicen qué es cada uno en una planta real y qué significa su señal para su programa. La variable del PLC es el nombre que usa el programa: el mapa de planta de la lección une cada señal de la escena con ella. Un guion indica que el elemento no está conectado al programa.

| Elemento      | Tipo                 | Qué es en una planta real                                                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Outfeed`     | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `SideBelt`    | Cinta transportadora | Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación. |
| `Source1`     | Emisor de piezas     | Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.                             |
| `Blade1`      | Tope retráctil       | Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.                                                   |
| `Scale1`      | Báscula              | Una plataforma de pesaje en la línea, como una controladora de peso, que informa el peso de lo que tiene encima.                      |
| `Pusher1`     | Empujador            | Un cilindro neumático con una placa que empuja una pieza hacia un lado de la cinta.                                                   |
| `HeavyBin`    | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `LightBin`    | Retirador de piezas  | Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.                          |
| `StartButton` | Pulsador             | Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.                                                     |
| `StackLight1` | Torre de luces       | Una torre de lámparas de colores que muestra a distancia qué hace la máquina.                                                         |

| Variable del PLC | Señal                 | Dirección y tipo                  | Significado                                                              |
| ---------------- | --------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `RunInfeed`      | `Infeed.run`          | Salida del PLC · BOOL             | TRUE hace avanzar la cinta.                                              |
| `RunOutfeed`     | `Outfeed.run`         | Salida del PLC · BOOL             | TRUE hace avanzar la cinta.                                              |
| `RunSide`        | `SideBelt.run`        | Salida del PLC · BOOL             | TRUE hace avanzar la cinta.                                              |
| —                | `Source1`             | —                                 | No está cableado al PLC.                                                 |
| `Hold`           | `Blade1.extend`       | Salida del PLC · BOOL             | TRUE eleva el tope sobre la cinta; FALSE lo baja.                        |
| `Stable`         | `Scale1.stable`       | Entrada del PLC · BOOL            | TRUE cuando la carga estuvo en reposo el tiempo suficiente para pesarla. |
| `Weight`         | `Scale1.weight`       | Entrada del PLC · REAL, 0 a 20 kg | El peso sobre la plataforma; 0 hasta que es estable.                     |
| `Extended`       | `Pusher1.extended`    | Entrada del PLC · BOOL            | TRUE cuando la placa está totalmente afuera.                             |
| `Retracted`      | `Pusher1.retracted`   | Entrada del PLC · BOOL            | TRUE cuando la placa está totalmente retraída.                           |
| `Push`           | `Pusher1.extend`      | Salida del PLC · BOOL             | TRUE saca la placa sobre la cinta; FALSE la retrae.                      |
| —                | `HeavyBin`            | —                                 | No está cableado al PLC.                                                 |
| —                | `LightBin`            | —                                 | No está cableado al PLC.                                                 |
| `Start`          | `StartButton.pressed` | Entrada del PLC · BOOL            | TRUE mientras el pulsador se mantiene presionado.                        |
| `Green`          | `StackLight1.green`   | Salida del PLC · BOOL             | TRUE enciende la lámpara verde.                                          |

Tres medidas de una ejecución de la solución de la lección en esta escena ayudan a imaginarla, cada una con un margen de un ciclo de escaneo. El tope necesita unos 0,4 s para subir o bajar. El empujador necesita unos 1,2 s para llegar al final de su carrera y unos 1,2 s para volver. La fuente suelta doce cajas, una cada 6 s aproximadamente, y en esa ejecución la primera caja quedó en reposo sobre la báscula 9,5 s después de la pulsación del pulsador de inicio.

Una salida del PLC acciona un elemento de la máquina; una entrada del PLC es lo que informa un elemento. El programa nunca ve una caja, solo lo que la báscula, el empujador y el pulsador informan de ella.

## Un número solo vale cuando la báscula lo indica

`Weight` es un número REAL, una medida con parte decimal. No es un sí o un no, así que un peldaño no puede usarlo como contacto. Y una báscula no puede pesar lo que se mueve: mientras una caja se desliza sobre la plataforma o se balancea en ella, la plataforma no tiene una carga firme. Las controladoras de peso reales esperan a que la plataforma deje de oscilar, y esta también. Se lo comunica al programa con `Stable`.

Por eso el programa tiene dos reglas. Mirar `Weight` solo mientras `Stable` está en TRUE. Lo que muestre en otro momento no es el peso de la caja; en esta báscula es 0.

## Un límite convierte un número en una condición

En escalera, un **bloque de comparación** convierte un número en una condición. `GT` pregunta "¿es el primer valor mayor que el segundo?", y los demás son `GE`, `EQ`, `NE`, `LE` y `LT`. El bloque va en un peldaño en serie con los contactos, como un contacto: la corriente lo atraviesa solo si la que llega desde la izquierda está activa **y** la comparación es verdadera. El número con el que se compara es un **límite**, y el límite divide todos los pesos posibles en dos grupos.

Para pesar solo una carga estable, ponga primero en el peldaño el contacto de la señal de la báscula y después el bloque de comparación. La corriente llega entonces a la bobina solo cuando se cumplen las dos cosas. Hay dos cosas que conviene revisar de un límite. Primero, dónde está: una caja real nunca pesa exactamente su masa nominal, así que un límite muy cerca de una de las masas mezcla los dos grupos. Segundo, el peso que queda justo en el límite: `GT` y `GE` lo envían a lados opuestos, así que la regla de la máquina ("al menos" o "más de") decide cuál colocar.

## Ejemplo resuelto

Al final de una empacadora de café, una báscula pesa cada bolsa. Una bolsa debe contener al menos 500 g. La lámpara `Short` se enciende con una bolsa estable de menos de 500 g, y la lámpara `Pass` con una bolsa estable de 500 g o más. Mientras la bolsa todavía se llena, `Settled` está en FALSE y ninguna lámpara debe encenderse. Los peldaños 3 y 4 contienen las dos comprobaciones.

```ld-figure
src: reading/bag-check.ld.json
caption: Cada peldaño de lámpara tiene el contacto Settled y un bloque de comparación en serie
```

Cada pulsación de Scoop deja caer 100 g en la bolsa, y NewBag la vacía. En el laboratorio, pulse Scoop cuatro veces con Settled apagado, después active Settled, pulse Scoop una vez más y luego apague Settled.

```ld-try
src: reading/bag-check.ld.json
inputs:
  - { name: Scoop, kind: push }
  - { name: NewBag, kind: push }
  - { name: Settled, kind: switch }
outputs: [Short, Pass]
caption: La quinta pulsación de Scoop lleva la bolsa a exactamente 500 g
```

Con Settled apagado, ninguna lámpara se enciende por más cucharadas que deje caer, aunque `Net` cambie. Después de cuatro pulsaciones `Net` vale 400, y en cuanto activa Settled se enciende `Short`, porque 400 es menor que 500. La quinta pulsación deja `Net` en exactamente 500: `Short` se apaga y se enciende `Pass`, porque `GE` incluye el límite mismo y la regla dice "al menos". Apague Settled otra vez y las dos lámparas se apagan. Mientras Settled está activo hay exactamente una lámpara encendida, porque `LT` y `GE` cubren todos los pesos sin solaparse.

Esta estación solo enciende lámparas para la bolsa que está sobre la báscula. No mueve la bolsa ni cuenta bolsas. La estación de la práctica además debe llevar cada caja a su contenedor y contar las cajas, y cómo lo hace, paso a paso, queda para que usted lo resuelva a partir de lo que hace la máquina.

## Errores comunes

- Colocar el bloque de comparación sin el contacto de la señal estable de la báscula. Mientras una caja se mueve, la lectura es 0, así que todas las cajas parecerían livianas.
- Usar `GT` donde la regla dice "al menos". El peso que queda justo en el límite va al lado equivocado.
- Intercambiar los dos lados, de modo que las cajas pesadas van al contenedor de las livianas. Los peldaños son válidos y el programa funciona; solo lo delatan los contenedores.
- Poner el límite fuera del rango de las cajas, por ejemplo por encima de la más pesada. Entonces todas las cajas caen del mismo lado.
- Leer el peso en la unidad equivocada. La báscula informa en kilogramos, así que un límite escrito en gramos nunca separa dos cajas.

> [!NOTE]
> Una lámpara o un empujador accionados por una comparación así son un control de calidad, no una medición que se pueda certificar. Una báscula legal tiene sus propias aprobaciones y su propia exactitud; aprobar una lección no dice nada de eso.

## Compruébelo usted

```quiz
question: ¿Por qué el control de bolsas tiene un contacto Settled en serie con el bloque de comparación?
options:
  - { text: 'Porque Net cambia mientras la bolsa se llena, así que su valor todavía no es el peso de la bolsa', correct: true, feedback: 'Sí. La comparación solo tiene sentido cuando la báscula indica que la carga está en reposo.' }
  - { text: 'Porque un bloque de comparación no funciona sin un contacto', feedback: 'Un bloque de comparación puede estar solo en un peldaño. El contacto está para elegir el momento de la comparación.' }
  - { text: 'Porque Settled hace que la lámpara brille más', feedback: 'Una lámpara está encendida o apagada. Settled solo decide cuándo cuenta la comparación.' }
```

```quiz
question: En el ejemplo resuelto, Settled está activo y Net vale exactamente 500. ¿Qué lámpara está encendida?
options:
  - { text: 'Pass', correct: true, feedback: 'Correcto. La regla dice "al menos 500 g", y GE incluye el límite mismo.' }
  - { text: 'Short', feedback: 'LT necesita que Net sea menor que 500, y 500 no es menor que sí mismo.' }
  - { text: 'Las dos', feedback: 'LT y GE nunca son verdaderas a la vez, así que se enciende a lo sumo una lámpara.' }
```

## Qué hará en la práctica

El proyecto inicial no tiene peldaños. Declara las entradas de la estación y las salidas de sus cintas, tope, empujador y torre de luces, y no acciona ninguna. Usted construirá los peldaños de la estación: después de la pulsación del pulsador de inicio, que el escenario da a los {{t:200}} ms, la línea funciona, cada una de las doce cajas se pesa y termina en el contenedor que su peso selecciona, y la lámpara verde se enciende cuando las doce están clasificadas. Después pulse {{ui:learn.check}}.
