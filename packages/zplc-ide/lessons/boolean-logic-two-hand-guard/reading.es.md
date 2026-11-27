## Decisiones hechas de sí y no

Casi todo lo que decide una máquina es un sí o un no. ¿Puede marchar el motor? ¿Está cerrada la puerta? ¿Debe encenderse la lámpara? Cada respuesta es un BOOL, un valor que es TRUE o FALSE, y casi todas las respuestas se forman con otras respuestas: el motor puede marchar si la puerta está cerrada y nadie está pulsando la parada.

La **lógica booleana** es la aritmética de esas respuestas. Con cuatro operadores un programa convierte las entradas que lee en las salidas que escribe. Una condición formada solo con ellos no tiene memoria: en cada ciclo su resultado depende solo de los valores de ese ciclo.

## Los cuatro operadores

| Operador | El resultado es TRUE cuando    | Ejemplo en ST                      |
| -------- | ------------------------------ | ---------------------------------- |
| `AND`    | los dos lados son TRUE         | `Run := Ready AND Start;`          |
| `OR`     | al menos un lado es TRUE       | `Alarm := HighLevel OR LowLevel;`  |
| `XOR`    | exactamente un lado es TRUE    | `Mismatch := SwitchA XOR SwitchB;` |
| `NOT`    | el valor que lo sigue es FALSE | `FillValve := NOT TankFull;`       |

El diagrama de tiempos da las mismas dos entradas, A y B, a cada operador. El tiempo avanza hacia la derecha; una línea está arriba mientras su señal es TRUE.

```timing
span: 5000
signals:
  - { name: A, edges: [1000, 3000] }
  - { name: B, edges: [2000, 4000] }
  - { name: 'A AND B', edges: [2000, 3000] }
  - { name: 'A OR B', edges: [1000, 4000] }
  - { name: 'A XOR B', edges: [1000, 2000, 3000, 4000] }
  - { name: 'NOT A', edges: [0, 1000, 3000] }
caption: Dos entradas y lo que cada operador hace con ellas
```

AND es TRUE solo donde las dos líneas están arriba. OR es TRUE donde al menos una está arriba. XOR es TRUE donde exactamente una está arriba, así que baja mientras las dos están arriba. NOT A es el reflejo de A.

Un operador une todas las condiciones que se necesiten: `A AND B AND C` es TRUE solo cuando las tres son TRUE, y `A OR B OR C` cuando cualquiera de ellas lo es.

## Cómo se lee una condición más larga

El texto estructurado resuelve primero NOT, después AND, después XOR y por último OR, así como la aritmética resuelve una multiplicación antes que una suma. Por eso `Start OR Jog AND Ready` significa `Start OR (Jog AND Ready)`: Start solo pone en marcha la máquina, aunque no esté lista. Cuando quiera decir otra cosa, escriba los paréntesis: `(Start OR Jog) AND Ready`.

NOT se aplica solo al valor que lo sigue. `NOT DoorClosed AND Ready` es `(NOT DoorClosed) AND Ready`. Para invertir una condición entera, póngala entre paréntesis: `NOT (DoorClosed AND Ready)`.

Una asignación como `Flap := TallBox AND NOT LaneFull;` escribe su salida en cada ciclo, así que la salida sigue a su condición: cuando una entrada cambia, la salida cambia en el mismo ciclo. Dé a cada salida una instrucción que contenga su condición completa.

## Ejemplo resuelto

Una cinta clasificadora lleva cajas frente a una compuerta que puede abrirse y empujar una caja hacia un carril lateral. Una barrera de altura, `TallBox`, es TRUE mientras pasa una caja alta; las cajas altas van al carril lateral, salvo que el carril esté lleno, lo que indica el interruptor `LaneFull`. La compuerta tiene un interruptor de posición, `FlapIsOut`, que es TRUE mientras la compuerta está realmente fuera. Mientras la cinta funciona (`BeltRunning`), la orden y el interruptor de posición deberían coincidir siempre; cuando no coinciden, la compuerta está trabada o lenta, y se enciende una lámpara de falla.

Cada salida responde una pregunta, así que cada una recibe una instrucción:

- La compuerta se abre para una caja alta cuando el carril no está lleno: dos condiciones unidas con AND, y el interruptor del carril entra como `NOT LaneFull`.
- La lámpara de falla se enciende cuando la orden y la posición difieren, pero solo mientras la cinta funciona: la diferencia es un XOR, y ese XOR se une a su vez con AND a la cinta.

```st
PROGRAM Diverter
VAR_INPUT
  TallBox : BOOL;
  LaneFull : BOOL;
  FlapIsOut : BOOL;
  BeltRunning : BOOL;
END_VAR
VAR_OUTPUT
  Flap : BOOL;
  FlapFault : BOOL;
END_VAR
Flap := TallBox AND NOT LaneFull;
FlapFault := (Flap XOR FlapIsOut) AND BeltRunning;
END_PROGRAM
```

La segunda instrucción lee `Flap`, que la primera instrucción acaba de escribir en el mismo ciclo. Los paréntesis importan: sin ellos, `Flap XOR FlapIsOut AND BeltRunning` significaría `Flap XOR (FlapIsOut AND BeltRunning)`, porque AND va antes que XOR.

Sígalo con la cinta en marcha. Llega una caja alta y se ordena abrir la compuerta; el interruptor de posición lo confirma un momento después, así que durante ese momento FlapFault es TRUE. La caja pasa y la compuerta vuelve a entrar, con la misma falla breve. Más tarde el carril está lleno: pasa la siguiente caja alta y la compuerta no se abre.

```timing
span: 5000
signals:
  - { name: TallBox, edges: [1000, 2000, 3500, 4500] }
  - { name: LaneFull, edges: [3000] }
  - { name: Flap, edges: [1000, 2000] }
  - { name: FlapIsOut, edges: [1200, 2200] }
  - { name: FlapFault, edges: [1000, 1200, 2000, 2200] }
caption: Dos cajas altas, la segunda con el carril lateral lleno; BeltRunning es TRUE todo el tiempo
```

Un desviador real le da a la compuerta un tiempo breve para moverse antes de encender la lámpara de falla; eso necesita un temporizador, que esta página deja de lado.

## Errores comunes

- Escribir OR donde se necesitan todas las condiciones. La salida pasa entonces a ON con una sola de ellas.
- Omitir los paréntesis. `Start OR Jog AND Ready` es `Start OR (Jog AND Ready)`, porque AND va antes que OR.
- Poner NOT en la parte equivocada. `NOT A AND B` invierte solo A; `NOT (A AND B)` invierte la condición entera.
- Usar OR para "exactamente uno". OR también es TRUE cuando los dos lados son TRUE; XOR es FALSE en ese caso.
- Escribir la misma salida en dos instrucciones. Gana la instrucción escrita en último lugar, y la primera no tiene efecto.

> [!WARNING]
> Una condición de un programa decide cuándo puede moverse una máquina. No hace segura la máquina: un mando a dos manos y una protección que cuidan a las personas son dispositivos propios, cableados para detener la máquina haga lo que haga el programa.

## Compruébelo usted

```quiz
question: Un programa tiene Run := Start OR Jog AND Ready; con Start en TRUE, Jog en FALSE y Ready en FALSE. ¿Qué vale Run?
options:
  - { text: 'TRUE', correct: true, feedback: 'Sí. AND va antes que OR, así que la instrucción es Start OR (Jog AND Ready), y Start solo la hace TRUE.' }
  - { text: 'FALSE', feedback: 'Eso sería (Start OR Jog) AND Ready. Sin los paréntesis se resuelve primero el AND.' }
  - { text: 'Cambia en cada ciclo', feedback: 'Las entradas no cambian, así que el resultado es el mismo en cada ciclo.' }
```

```quiz
question: Dos interruptores de nivel de un tanque siempre deberían coincidir. Una lámpara debe encenderse cuando exactamente uno de ellos es TRUE. ¿Qué operador los une?
options:
  - { text: 'XOR', correct: true, feedback: 'Correcto. XOR es TRUE cuando exactamente un lado es TRUE, y FALSE cuando los dos coinciden.' }
  - { text: 'OR', feedback: 'OR también es TRUE cuando los dos interruptores son TRUE, que es un estado normal.' }
  - { text: 'AND', feedback: 'AND es TRUE solo cuando los dos interruptores son TRUE, que es el caso en que coinciden.' }
```

## Qué hará en la práctica

La máquina de la práctica es una prensa con mando a dos manos: puede cerrarse solo mientras el operador mantiene pulsados dos pulsadores, uno con cada mano, para que ninguna mano pueda estar debajo de la herramienta, y solo mientras su protección está cerrada. El programa inicial habilita la prensa con cualquiera de las dos manos y deja las dos lámparas en OFF. Usted dará a cada una de las tres salidas su propia condición: PressEnable solo con las dos manos y la protección cerrada, GuardLamp mientras la protección está abierta y OneHandWarning mientras exactamente una mano está en su pulsador. El escenario cambia las entradas cada {{t:10}} ms. Después pulse {{ui:learn.check}}.
