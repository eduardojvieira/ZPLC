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

Un horno de secado puede calentar solo mientras el selector del operador `HeatOn` está encendido, los dos interruptores de la puerta `DoorSwitchA` y `DoorSwitchB` dicen que la puerta está cerrada y el termostato `OverTemp` no se disparó. Una lámpara de puerta indica que los dos interruptores dicen abierta. Los dos interruptores siempre deberían coincidir, y una lámpara de falla se enciende cuando no coinciden.

```il
PROGRAM DryingOven
VAR_INPUT
    HeatOn : BOOL;
    DoorSwitchA : BOOL;
    DoorSwitchB : BOOL;
    OverTemp : BOOL;
END_VAR
VAR_OUTPUT
    Heater : BOOL;
    DoorLamp : BOOL;
    SwitchFault : BOOL;
END_VAR

        LD    HeatOn
        AND   DoorSwitchA
        AND   DoorSwitchB
        ANDN  OverTemp
        ST    Heater
        LDN   DoorSwitchA
        ANDN  DoorSwitchB
        ST    DoorLamp
        LD    DoorSwitchA
        XOR   DoorSwitchB
        ST    SwitchFault
END_PROGRAM
```

Léalo como tres grupos, uno para cada salida, cada uno abierto por una carga. El primer grupo necesita todas las condiciones, así que es una cadena de líneas AND, y ANDN agrega el termostato invertido. El segundo empieza con LDN, porque la lámpara quiere los dos interruptores abiertos. El tercero es un solo XOR.

Sígalo con el calor encendido y el horno frío. La puerta se cierra: el interruptor A se cierra un momento antes que el B, así que durante ese momento SwitchFault es TRUE y el calefactor espera. Cuando los dos están cerrados, el calefactor funciona. Más tarde el interruptor B se rompe y da FALSE aunque la puerta sigue cerrada: la cadena de AND pierde una de sus condiciones, así que el calefactor se detiene, y el XOR enciende la lámpara de falla.

```timing
span: 5000
signals:
  - { name: DoorSwitchA, edges: [1000] }
  - { name: DoorSwitchB, edges: [1300, 3000] }
  - { name: Heater, edges: [1300, 3000] }
  - { name: SwitchFault, edges: [1000, 1300, 3000] }
caption: La puerta se cierra y después se rompe el interruptor B; HeatOn es TRUE y OverTemp FALSE todo el tiempo
```

Un horno real da a los dos interruptores un tiempo breve para coincidir antes de encender la lámpara de falla; eso necesita un temporizador, que esta página deja de lado.

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
question: Un programa tiene ST Heater y, en la línea siguiente, AND DoorSwitchA sin una carga antes. ¿Con qué combina ese AND a DoorSwitchA?
options:
  - { text: 'Con el resultado actual que se acaba de guardar en Heater', correct: true, feedback: 'Correcto. ST deja el resultado actual como está, así que el AND continúa con él. Empiece cada condición nueva con LD o LDN.' }
  - { text: 'Con FALSE, porque ST borra el resultado actual', feedback: 'ST solo copia el resultado actual en la salida; no lo cambia.' }
  - { text: 'Con TRUE, porque después de ST empieza una condición nueva', feedback: 'Solo una carga empieza una condición nueva. Sin ella el AND trabaja sobre el resultado anterior.' }
```

## Qué hará en la práctica

La máquina de la práctica es una prensa con mando a dos manos: puede cerrarse solo mientras el operador mantiene pulsados dos pulsadores, uno con cada mano, y solo mientras su protección está cerrada. El programa inicial combina las dos manos con OR y guarda FALSE en las dos lámparas. Usted lo reescribirá como tres grupos de líneas, uno para cada salida: PressEnable solo con las dos manos y la protección cerrada, GuardLamp mientras la protección está abierta y OneHandWarning mientras exactamente una mano está en su pulsador. El escenario cambia las entradas cada {{t:10}} ms. Después pulse {{ui:learn.check}}.
