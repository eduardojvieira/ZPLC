## Un contador es un bloque con memoria

Un contador suma uno cada vez que algo llega: una pieza a una fotocélula, una vuelta de una mesa, una pulsación de un pulsador. Una pieza que se queda frente a una fotocélula mantiene su entrada en TRUE durante muchos ciclos y sigue siendo una sola pieza, así que un contador cuenta **flancos ascendentes**, los ciclos en que su entrada cambia de FALSE a TRUE.

El **CTU**, el contador ascendente, es un bloque de función que hace esto. En un diagrama de bloques de función es un bloque como AND o NOT, con una diferencia: recuerda. Un AND responde solo con los valores que hay ahora en sus entradas; un CTU guarda su cuenta y el valor de su entrada del ciclo anterior, de un ciclo al siguiente. Esa memoria pertenece a una **instancia**, así que el bloque lleva arriba un nombre propio, como `Turns`, y sus salidas se leen como `Turns.Q` y `Turns.CV`.

## Los puertos de un CTU

Un bloque CTU tiene tres puertos de entrada a su izquierda y dos puertos de salida a su derecha.

- **CU**, contar hacia arriba, un BOOL: cada flanco ascendente suma uno.
- **R**, puesta a cero, un BOOL: mientras está en TRUE, la cuenta es cero.
- **PV**, el valor preestablecido, un INT: el número hasta el que se cuenta. Suele venir de un bloque de constante.
- **Q**, un BOOL: en TRUE mientras la cuenta está en PV o por encima.
- **CV**, un INT: la cuenta hasta ahora.

Cada conexión lleva el valor de un puerto de salida a un puerto de entrada. Un puerto de entrada sin conexión queda en FALSE: un CTU sin nada en CU nunca cuenta, y uno sin nada en R nunca se pone a cero. La cuenta no se detiene en PV, y Q sigue en TRUE hasta que R pone la cuenta a cero.

## Ejemplo resuelto

Una envolvedora envuelve un palé con film mientras una mesa giratoria lo hace girar. Una bandera en la mesa pasa frente a un sensor, `TurnFlag`, una vez por vuelta, y se queda frente a él un momento cada vez. Un palé queda envuelto después de seis vueltas: se enciende la lámpara `WrapDone`, y el operario presiona el pulsador `NewPallet` para el palé siguiente, lo que pone la cuenta a cero. Un visor muestra las vueltas hasta ahora, `TurnsSoFar`.

El diagrama tiene un CTU llamado `Turns`, un bloque de constante con el valor `6` y estas conexiones:

| Desde              | Hacia            | Qué lleva                                          |
| ------------------ | ---------------- | -------------------------------------------------- |
| `TurnFlag`, OUT    | `Turns`, CU      | TRUE mientras la bandera está frente al sensor     |
| `NewPallet`, OUT   | `Turns`, R       | TRUE mientras se mantiene presionado el pulsador   |
| constante `6`, OUT | `Turns`, PV      | el número de vueltas de un palé                    |
| `Turns`, Q         | `WrapDone`, IN   | TRUE desde la sexta vuelta hasta una puesta a cero |
| `Turns`, CV        | `TurnsSoFar`, IN | el número de vueltas contadas hasta ahora          |

Léalo de izquierda a derecha: el sensor y el pulsador alimentan el contador, la constante fija su valor preestablecido y las dos salidas del contador accionan la lámpara y el visor. Cada paso de la bandera cuenta una vez, sin importar cuánto se quede frente al sensor.

```timing
span: 8000
signals:
  - { name: TurnFlag, edges: [300, 700, 1300, 1700, 2300, 2700, 3300, 3700, 4300, 4700, 5300, 5700] }
  - { name: WrapDone, edges: [5300, 6800] }
  - { name: NewPallet, edges: [6800, 7300] }
marks:
  - { from: 5300, to: 6800, label: 'CV = 6' }
caption: El sexto paso de la bandera enciende WrapDone; NewPallet pone la cuenta a cero
```

## Errores comunes

- Intercambiar CU y R. Cada paso de la bandera pone entonces la cuenta a cero, y el que cuenta es el pulsador.
- Dejar R sin conexión. La cuenta nunca vuelve a cero, y la lámpara sigue encendida después de presionar el pulsador.
- Esperar que Q caiga cuando la cuenta pasa de PV. Q sigue en TRUE hasta una puesta a cero.
- Conectar CV, un INT, donde se espera un BOOL. Q es el BOOL que dice "se llegó al valor preestablecido"; CV es el número.

## Compruébelo usted

```quiz
question: En un diagrama, un CTU tiene conectados su valor preestablecido y su Q, una fotocélula conectada a CU y nada conectado a R. Se llega al valor preestablecido y el operario pulsa Reset. ¿Qué hace Q?
options:
  - { text: 'Sigue en TRUE', correct: true, feedback: 'Sí. Reset no está conectado al contador, así que R sigue en FALSE y nada pone la cuenta a cero.' }
  - { text: 'Pasa a FALSE', feedback: 'Solo un TRUE en R pone la cuenta a cero, y ninguna conexión lleva Reset hasta R.' }
  - { text: 'Pasa a FALSE con la pieza siguiente', feedback: 'Una pieza nueva suma uno a la cuenta; nunca la pone a cero.' }
```

```quiz
question: Una pieza se queda frente a la fotocélula de CU durante 20 ciclos. ¿Cuánto sube CV?
options:
  - { text: 'Sube uno', correct: true, feedback: 'Correcto. El CTU suma uno en el flanco ascendente de CU, sin importar cuánto tiempo siga CU en TRUE.' }
  - { text: 'Sube 20', feedback: 'Eso sería contar ciclos. Un CTU cuenta solo el cambio de FALSE a TRUE.' }
  - { text: 'No sube hasta que la pieza se va', feedback: 'La cuenta sube en el flanco ascendente, cuando la pieza llega, no cuando se va.' }
```

## Qué hará en la práctica

El diagrama inicial tiene el contador Count, la constante 3 en su PV y su Q conectada a BatchFull, pero nada llega a CU ni a R, así que Count nunca cuenta. Usted hará que BatchFull se encienda con la tercera pieza, a los {{t:60}} ms, y se apague cuando se pulsa Reset a los {{t:80}} ms; después pulse {{ui:learn.check}}.
