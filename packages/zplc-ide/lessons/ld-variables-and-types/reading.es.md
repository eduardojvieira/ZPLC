## Para qué sirve

Piense en una pequeña estación de bombeo. Un pulsador de arranque, un pulsador de parada, un contactor de bomba, una lámpara de marcha. Entre los pulsadores y la bomba el programa debe recordar cosas: que se pidió arrancar la bomba, cuánto esperar antes de que arranque, cuántas cajas se han llenado. Cada una de esas cosas necesita un nombre y un lugar donde vivir. Ese nombre junto con su tipo de contenido es una **variable**.

Esta página responde tres preguntas. ¿Qué tipos de valor puede guardar una variable? ¿Cómo se conecta una variable a un cable real? ¿Y qué variables no tocan ningún cable?

## Tipos: la clase de valor

Toda variable tiene un **tipo**, que dice qué puede guardar y cuánta memoria ocupa. Cuatro tipos cubren casi todo en escalera.

| Tipo | Guarda                                    | Ejemplo                                       |
| :--- | :---------------------------------------- | :-------------------------------------------- |
| BOOL | uno de dos estados, `TRUE` o `FALSE`      | un pulsador, una lámpara, un final de carrera |
| INT  | un número entero, positivo o negativo     | una cuenta de botellas, `3`                   |
| REAL | un número con decimales                   | un nivel de tanque de `42.5`                  |
| TIME | una duración, escrita con el prefijo `T#` | `T#50ms`, `T#3s`, `T#2m`                      |

Un contacto y una bobina trabajan con variables BOOL, porque la energía fluye o no fluye. Los temporizadores toman un TIME para saber cuánto esperar, y los contadores toman un INT para saber cuántos contar. Si a un bloque se le da un tipo equivocado, el compilador lo avisa.

Un contador necesita su valor preestablecido como número entero, así que el lugar natural es una variable INT. Este laboratorio llena una caja con `BatchSize` botellas, donde `BatchSize` es un INT. Cambie el valor en la tabla de variables y toda la máquina cambia con él, sin editar ningún peldaño.

```ld-try
src: reading/case-counter.ld.json
inputs:
  - { name: Bottle, kind: push }
  - { name: NewCase, kind: push }
outputs: [CaseFull]
caption: Pulse Bottle tres veces y luego NewCase
```

## Direcciones: el cable entre el programa y la máquina

Una variable que solo vive en el programa es invisible para la máquina. Para leer un pulsador real, el programa necesita una variable atada al terminal de entrada donde está cableado el pulsador. Esa atadura es la **dirección**, que se escribe después del nombre en la tabla de variables.

Una dirección se escribe con un signo de porcentaje, una letra de área, una letra de tamaño y una posición.

| Dirección | Significado                                                             |
| :-------- | :---------------------------------------------------------------------- |
| `%IX0.0`  | **I**nput (entrada), un bit (**X**): byte 0, bit 0                      |
| `%QX0.1`  | salida ("Q"), un bit: byte 0, bit 1                                     |
| `%IW2`    | entrada, una palabra de 16 bits, para un número como un valor analógico |
| `%MW0`    | **M**emoria, una palabra de 16 bits                                     |

La forma corta `%I0.0` significa lo mismo que `%IX0.0`, y verá ambas. En el resto del curso las entradas son `%IX`, las salidas son `%QX` y una palabra de memoria es `%MW`. Una variable `%MW` vive en la memoria de trabajo del runtime, en una dirección que el runtime documenta. Si el compilador coloca otra variable encima de una variable ubicada, la compilación se detiene con un error.

## Bits de memoria frente a E/S física

La mayoría de las variables de un programa real no tienen dirección. Son **bits de memoria**: variables BOOL que el programa guarda para recordar algo, como "se pidió arrancar la bomba". Ningún terminal las lee y ningún terminal las gobierna. Una bobina de autorretención, un estado de una secuencia y el indicador de fin de un temporizador son memoria.

¿Para qué sirve? Porque un bit de memoria puede alimentar muchas salidas, y se puede cambiar lo que está cableado sin cambiar la lógica.

El **mapa de E/S** es la lista de todas las variables atadas a la máquina: qué entradas lee el programa y qué salidas escribe, cada una con su tipo y su dirección. ZPLC lo construye a partir de las direcciones que usted declaró, así que nunca se escribe la lista a mano. Mientras corre una simulación, abra la pestaña {{ui:panel.watch}}. Su primera tabla, **{{ui:faceplate.title}}**, muestra el mapa con el valor en vivo de cada fila. Un bit de memoria no está en esa lista, porque no tiene dirección; para verlo, use la tabla de observación que hay debajo.

## Ejemplo resuelto

La estación de bombeo guarda un bit de memoria, `Running`. En la figura, el peldaño de autorretención lo activa, y otros dos peldaños lo copian al contactor y a la lámpara. Solo los pulsadores, el contactor y la lámpara tienen dirección.

```ld-figure
src: reading/pump-memory.ld.json
caption: Running es un bit de memoria sin dirección; PumpContactor y RunLamp son las salidas
```

Pulse Start y luego Stop. Las dos salidas siguen al bit de memoria. Si más adelante la lámpara pasa a otro terminal, solo cambia su dirección: el peldaño que decide cuándo marcha la bomba queda como está.

```ld-try
src: reading/pump-memory.ld.json
inputs:
  - { name: StartButton, kind: push }
  - { name: StopButton, kind: push }
outputs: [PumpContactor, RunLamp]
caption: Un bit de memoria gobierna dos salidas
```

## Errores comunes

- Escribir un tiempo como número suelto. Un TIME necesita el prefijo y la unidad: `T#50ms`, no `50`.
- Dar la misma dirección de memoria a dos variables. La segunda se superpone con la primera y la compilación lo informa.
- Poner un número en un BOOL o un BOOL donde se espera un INT. Elija el tipo según lo que significa el valor.
- Olvidar el ciclo: una entrada cambia solo entre ciclos, así que el programa ve un valor estable durante una pasada.

> [!WARNING]
> Una salida del mapa de E/S es solo una variable del programa. El cable hasta un contactor real, y la parada que corta la energía de una máquina peligrosa, pertenecen al hardware: una parada de emergencia nunca depende del programa del PLC.

## Compruébelo usted

```quiz
question: Una variable llamada Requested es un BOOL sin dirección. ¿Qué puede decirse de ella?
options:
  - { text: 'Es un bit de memoria: solo el programa la lee y la escribe', correct: true, feedback: 'Correcto. Sin dirección, ningún terminal está atado a ella y no aparece en el mapa de E/S.' }
  - { text: 'Lee un terminal de entrada', feedback: 'Una variable lee un terminal solo mediante una dirección como %IX0.0.' }
  - { text: 'No se puede usar en un peldaño', feedback: 'Los bits de memoria se usan en los peldaños todo el tiempo, como contactos y como bobinas.' }
```

```quiz
question: Una variable guarda cuántas botellas entran en una caja, 12. ¿Qué tipo le corresponde?
options:
  - { text: 'INT', correct: true, feedback: 'Correcto. Una cuenta es un número entero, y un contador toma su valor preestablecido como INT.' }
  - { text: 'REAL', feedback: 'Un REAL guarda decimales, y una caja nunca lleva media botella. Un contador espera un INT.' }
  - { text: 'TIME', feedback: 'Un TIME es una duración como T#50ms, no un número de botellas.' }
```

## Qué hará en la práctica

En la práctica tendrá una máquina que avisa antes de arrancar. El bit de memoria `Requested` ya está allí, junto con la autorretención y el temporizador. Usted hará que el período de aviso dure 50 milisegundos y que `Motor` se encienda cuando termine, de modo que la lámpara se encienda a los {{t:10}} ms y el motor más tarde, y mirará el mapa de E/S para ver qué tiene dirección y qué no. Después pulse {{ui:learn.check}}.
