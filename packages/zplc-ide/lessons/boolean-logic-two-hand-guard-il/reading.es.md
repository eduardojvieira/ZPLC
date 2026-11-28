## Un resultado, una línea a la vez

Una máquina decide casi todo con respuestas de sí o no: ¿puede marchar el motor?, ¿está cerrada la puerta?, ¿debe encenderse la lámpara? Cada respuesta es un BOOL, TRUE o FALSE, y la **lógica booleana** forma respuestas a partir de otras respuestas con cuatro operadores: AND, OR, XOR y NOT.

Un programa en **lista de instrucciones**, IL por sus siglas, escribe esa lógica como una columna de líneas cortas. Cada línea es una **instrucción**: un operador y, casi siempre, un operando, la variable con la que trabaja. Mientras ejecuta las líneas, el PLC guarda un solo valor, el **resultado actual**, y cada línea hace algo con él. Las líneas se ejecutan de arriba abajo en cada ciclo.

## Las instrucciones de la lógica booleana

| Instrucción | Qué le pasa al resultado actual                            |
| ----------- | ---------------------------------------------------------- |
| `LD X`      | pasa a ser el valor de X; aquí empieza una condición nueva |
| `LDN X`     | pasa a ser lo contrario de X                               |
| `AND X`     | pasa a ser el resultado AND X                              |
| `ANDN X`    | pasa a ser el resultado AND NOT X                          |
| `OR X`      | pasa a ser el resultado OR X                               |
| `XOR X`     | pasa a ser el resultado XOR X                              |
| `ST Y`      | queda como está, y la salida Y recibe una copia            |

AND es TRUE cuando los dos valores son TRUE, OR cuando al menos uno lo es, XOR cuando exactamente uno lo es, y NOT da lo contrario de un valor. Una condición de varias partes es un LD seguido de una línea por cada parte más, y un ST al final la escribe en su salida.

En IL no hay un orden de los operadores: el orden de las líneas es el orden del trabajo. Las líneas `LD Start`, `OR Jog`, `AND Ready` dan `(Start OR Jog) AND Ready`, porque el OR se hace primero. Para obtener `Start OR (Jog AND Ready)`, resuelva primero el AND: `LD Jog`, `AND Ready`, `OR Start`.

## Ejemplo resuelto

Una cinta clasificadora lleva cajas frente a una compuerta que empuja las cajas altas hacia un carril lateral. La compuerta se abre mientras la barrera de altura `TallBox` ve una caja alta y el interruptor del carril `LaneFull` indica que el carril no está lleno. El interruptor de posición de la compuerta, `FlapIsOut`, debería coincidir con la orden mientras la cinta funciona (`BeltRunning`), y una lámpara de falla se enciende cuando no coincide.

```il
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

        LD    TallBox
        ANDN  LaneFull
        ST    Flap
        LD    Flap
        XOR   FlapIsOut
        AND   BeltRunning
        ST    FlapFault
END_PROGRAM
```

Léalo como dos grupos, uno por salida, cada uno abierto por una carga. El primer grupo necesita dos condiciones, y ANDN incorpora el interruptor del carril invertido. El segundo grupo carga la orden que acaba de guardar, la compara con el interruptor de posición mediante XOR, y solo entonces une la cinta con AND: el orden de las líneas es el orden del trabajo, así que el XOR se hace antes que el AND.

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

- Empezar una condición nueva sin una carga. Después de ST el resultado actual sigue ahí, así que una línea AND justo después continúa la condición de la salida anterior.
- Leer las líneas como una fórmula escrita. IL no tiene un orden de los operadores: cada línea trabaja sobre el resultado de las líneas anteriores.
- Usar LD donde hace falta LDN, o AND donde hace falta ANDN. La condición espera entonces lo contrario de la señal.
- Usar OR para "exactamente uno". OR también es TRUE cuando los dos valores son TRUE; XOR es FALSE en ese caso.
- Guardar antes de que la condición esté completa. Un ST en medio de una cadena escribe solo la parte que está arriba de él.

> [!WARNING]
> Una lista de instrucciones decide cuándo puede moverse una máquina. No hace segura la máquina: un mando a dos manos y una protección que cuidan a las personas son dispositivos propios, cableados para detener la máquina haga lo que haga el programa.

## Compruébelo usted

```quiz
question: Las líneas son LD Start, OR Jog, AND Ready, ST Run, con Start en TRUE, Jog en FALSE y Ready en FALSE. ¿Qué vale Run?
options:
  - { text: 'FALSE', correct: true, feedback: 'Sí. Start OR Jog da TRUE, y después AND Ready da FALSE. Las líneas se resuelven en orden.' }
  - { text: 'TRUE', feedback: 'Eso sería Start OR (Jog AND Ready). En IL la línea OR va primero, así que se hace primero.' }
  - { text: 'Cambia en cada ciclo', feedback: 'Las entradas no cambian, así que las líneas dan el mismo resultado en cada ciclo.' }
```

```quiz
question: Un programa tiene ST Flap y, en la línea siguiente, AND BeltRunning sin una carga antes. ¿Con qué combina ese AND a BeltRunning?
options:
  - { text: 'Con el resultado actual que se acaba de guardar en Flap', correct: true, feedback: 'Correcto. ST deja el resultado actual como está, así que el AND continúa con él. Empiece cada condición nueva con LD o LDN.' }
  - { text: 'Con FALSE, porque ST borra el resultado actual', feedback: 'ST solo copia el resultado actual en la salida; no lo cambia.' }
  - { text: 'Con TRUE, porque después de ST empieza una condición nueva', feedback: 'Solo una carga empieza una condición nueva. Sin ella el AND trabaja sobre el resultado anterior.' }
```

## Qué hará en la práctica

La máquina de la práctica es una prensa con mando a dos manos: puede cerrarse solo mientras el operador mantiene pulsados dos pulsadores, uno con cada mano, y solo mientras su protección está cerrada. El programa inicial combina las dos manos con OR y guarda FALSE en las dos lámparas. Usted hará que PressEnable esté en ON solo con las dos manos y la protección cerrada, GuardLamp mientras la protección está abierta y OneHandWarning mientras exactamente una mano está en su pulsador. El escenario cambia las entradas cada {{t:10}} ms. Después pulse {{ui:learn.check}}.
