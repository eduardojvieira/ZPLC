## Lógica dibujada como bloques

Una máquina decide casi todo con respuestas de sí o no: ¿puede marchar el motor?, ¿está cerrada la puerta?, ¿debe encenderse la lámpara? Cada respuesta es un BOOL, TRUE o FALSE, y la **lógica booleana** forma respuestas a partir de otras respuestas con cuatro operadores: AND, OR, XOR y NOT.

Un **diagrama de bloques de función**, FBD por sus siglas, dibuja esa lógica en lugar de escribirla. Cada operador es un **bloque**, y las **conexiones** llevan los valores de un bloque al siguiente. Las señales van de izquierda a derecha: las entradas del programa a la izquierda, las salidas a la derecha y la lógica en el medio.

## Bloques, puertos y conexiones

Un diagrama tiene tres clases de bloque:

- Un **bloque de variable** trae una entrada del programa al diagrama. Su puerto `OUT` lleva el valor de esa entrada.
- Un **bloque lógico** resuelve un operador. Sus entradas están a su izquierda y su resultado sale por su puerto `OUT`.
- Un **bloque de salida** escribe en una salida del programa el valor que llega a su puerto `IN`.

| Bloque | Entradas   | `OUT` es TRUE cuando            |
| ------ | ---------- | ------------------------------- |
| `AND`  | `IN1, IN2` | las dos entradas son TRUE       |
| `OR`   | `IN1, IN2` | al menos una entrada es TRUE    |
| `XOR`  | `IN1, IN2` | exactamente una entrada es TRUE |
| `NOT`  | `IN`       | su entrada es FALSE             |

Una conexión siempre va de un puerto de salida a un puerto de entrada. Un puerto de entrada recibe exactamente una conexión, pero un puerto de salida puede alimentar todas las conexiones que se necesiten, así que una entrada del programa puede llegar a varios bloques. En cada ciclo cada bloque resuelve su resultado con los valores conectados a él, y cada bloque de salida escribe lo que le llega.

Un bloque AND tiene dos entradas, así que una condición de tres partes lleva dos bloques AND: el primero une dos señales, y su `OUT` entra en el segundo junto con la tercera señal.

```timing
span: 5000
signals:
  - { name: A, edges: [500, 4000] }
  - { name: B, edges: [1000, 3500] }
  - { name: C, edges: [0, 2000, 2500] }
  - { name: AND1.OUT, edges: [1000, 3500] }
  - { name: AND2.OUT, edges: [1000, 2000, 2500, 3500] }
caption: AND1 une A y B; AND2 une AND1.OUT y C, así que es TRUE solo mientras las tres lo son
```

## Ejemplo resuelto

Una cinta clasificadora lleva cajas frente a una compuerta que empuja las cajas altas hacia un carril lateral. La compuerta `Flap` se abre mientras la barrera de altura `TallBox` ve una caja alta y el interruptor del carril `LaneFull` indica que el carril no está lleno. El interruptor de posición de la compuerta, `FlapIsOut`, debería coincidir con la orden mientras la cinta funciona (`BeltRunning`), y una lámpara de falla `FlapFault` se enciende cuando no coincide.

La compuerta necesita dos condiciones, una de ellas invertida, y la lámpara de falla necesita una diferencia que solo cuenta mientras la cinta funciona:

1. Un bloque NOT recibe `LaneFull`.
2. Un bloque AND recibe `TallBox` y el bloque NOT, y su `OUT` va al bloque de salida `Flap`.
3. Un bloque XOR recibe la misma `OUT` del bloque AND y `FlapIsOut`.
4. Un segundo bloque AND recibe el bloque XOR y `BeltRunning`, y su `OUT` va al bloque de salida `FlapFault`.

La `OUT` del primer bloque AND alimenta dos lugares, el bloque de salida `Flap` y el XOR: un puerto de salida, dos conexiones. Así el XOR compara la orden que el diagrama calcula en este ciclo con el interruptor que indica dónde está realmente la compuerta. Siga una compuerta trabada: llega una caja alta, el bloque AND da TRUE y se ordena abrir la compuerta, pero `FlapIsOut` sigue en FALSE. El bloque XOR ve un TRUE y un FALSE, y con la cinta en marcha el segundo bloque AND enciende la lámpara de falla.

Un desviador real le da a la compuerta un tiempo breve para moverse antes de encender la lámpara de falla; eso necesita un temporizador, que esta página deja de lado.

## Errores comunes

- Usar un bloque OR donde se necesitan todas las condiciones. La salida pasa entonces a ON con una sola de ellas.
- Intentar llevar dos conexiones a un mismo puerto de entrada. Una entrada tiene un solo origen; agregue otro bloque AND.
- Poner el bloque NOT después de un bloque AND cuando solo hay que invertir una señal. Un NOT después del AND invierte la condición entera.
- Usar un bloque OR para "exactamente una". OR también es TRUE cuando las dos entradas son TRUE; XOR es FALSE en ese caso.
- Dejar un bloque de salida conectado a una constante, o sin conectar. Su salida nunca sigue a las entradas.

> [!WARNING]
> Un diagrama decide cuándo puede moverse una máquina. No hace segura la máquina: un mando a dos manos y una protección que cuidan a las personas son dispositivos propios, cableados para detener la máquina haga lo que haga el programa.

## Compruébelo usted

```quiz
question: Un bloque AND tiene Ready en IN1, y en IN2 un bloque NOT cuya entrada es Stop. Ready es TRUE y Stop es TRUE. ¿Qué da el bloque AND?
options:
  - { text: 'FALSE', correct: true, feedback: 'Sí. El bloque NOT convierte Stop en FALSE, y AND necesita las dos entradas en TRUE.' }
  - { text: 'TRUE', feedback: 'Ready es TRUE, pero IN2 recibe el NOT de Stop, que es FALSE.' }
  - { text: 'Cambia en cada ciclo', feedback: 'Las entradas no cambian, así que cada bloque da el mismo resultado en cada ciclo.' }
```

```quiz
question: Una salida debe estar en ON solo cuando tres entradas son TRUE a la vez. ¿Cómo se dibuja con bloques AND de dos entradas?
options:
  - { text: 'Dos bloques AND: el OUT del primero entra en el segundo con la tercera entrada', correct: true, feedback: 'Correcto. El segundo bloque es TRUE solo cuando el primero y la tercera entrada lo son, es decir, las tres.' }
  - { text: 'Un bloque AND con dos conexiones en IN2', feedback: 'Un puerto de entrada recibe una sola conexión. El diagrama no puede unir dos señales ahí.' }
  - { text: 'Un bloque OR para dos entradas y después un bloque AND con la tercera', feedback: 'El bloque OR es TRUE con una sola de sus entradas, así que la salida no necesitaría las tres.' }
```

## Qué hará en la práctica

La máquina de la práctica es una prensa con mando a dos manos: puede cerrarse solo mientras el operador mantiene pulsados dos pulsadores, uno con cada mano, y solo mientras su protección está cerrada. El diagrama inicial habilita la prensa con un bloque OR y conecta las dos lámparas a constantes. Usted cambiará el diagrama para que PressEnable esté en ON solo con las dos manos y la protección cerrada, GuardLamp mientras la protección está abierta y OneHandWarning mientras exactamente una mano está en su pulsador. El escenario cambia las entradas cada {{t:10}} ms. Después pulse {{ui:learn.check}}.
