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

Un horno de secado puede calentar solo mientras el selector del operador `HeatOn` está encendido, los dos interruptores de la puerta `DoorSwitchA` y `DoorSwitchB` dicen que la puerta está cerrada y el termostato `OverTemp` no se disparó. Los dos interruptores de la puerta siempre deberían coincidir, y una lámpara de falla `SwitchFault` se enciende cuando no coinciden.

El calefactor necesita cuatro condiciones, así que lleva tres bloques AND en cadena, y el termostato entra por un bloque NOT:

1. Un bloque NOT recibe `OverTemp`.
2. El primer bloque AND recibe `DoorSwitchA` y `DoorSwitchB`.
3. El segundo bloque AND recibe el primer bloque AND y `HeatOn`.
4. El tercer bloque AND recibe el segundo bloque AND y el bloque NOT, y su `OUT` va al bloque de salida `Heater`.
5. Un bloque XOR recibe `DoorSwitchA` y `DoorSwitchB`, y su `OUT` va al bloque de salida `SwitchFault`.

Cada interruptor de la puerta alimenta dos bloques, el primer AND y el XOR: un puerto de salida, dos conexiones. Siga un interruptor roto por el diagrama: la puerta está cerrada y `DoorSwitchB` da FALSE. El primer bloque AND da FALSE, así que toda la cadena también y el calefactor se detiene, mientras el bloque XOR ve un TRUE y un FALSE y enciende la lámpara de falla.

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
