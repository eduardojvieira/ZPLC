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

Una dosificadora de comprimidos llena frascos con cinco comprimidos cada uno. Cada comprimido cae frente a una barrera, `TabletEye`, que queda en TRUE un momento mientras pasa. Cuando hay un frasco nuevo en su lugar la máquina pulsa `NewBottle`. La lámpara `BottleDone` se enciende cuando el frasco tiene los cinco, y un visor muestra los comprimidos que todavía faltan, `TabletsLeft`.

Esta cuenta va hacia abajo, de cinco a cero, así que el diagrama usa el contador descendente, el **CTD**. Sus puertos de entrada son CD, cada uno de cuyos flancos ascendentes resta uno, LD, que carga PV en la cuenta mientras es TRUE, y PV. Su salida Q es TRUE mientras CV está en cero o por debajo. El diagrama tiene un CTD llamado `Doses`, un bloque constante con el valor `5` y estas conexiones:

| Desde              | Hacia             | Qué lleva                                   |
| ------------------ | ----------------- | ------------------------------------------- |
| `TabletEye`, OUT   | `Doses`, CD       | TRUE mientras un comprimido pasa la barrera |
| `NewBottle`, OUT   | `Doses`, LD       | TRUE mientras se carga un frasco nuevo      |
| constante `5`, OUT | `Doses`, PV       | la cantidad de comprimidos de un frasco     |
| `Doses`, Q         | `BottleDone`, IN  | TRUE cuando la cuenta llegó a cero          |
| `Doses`, CV        | `TabletsLeft`, IN | la cantidad de comprimidos que faltan       |

Léalo de izquierda a derecha: la barrera y la señal de carga alimentan al contador, la constante fija el número desde el que empieza, y las dos salidas del contador manejan la lámpara y el visor. Antes del primer frasco CV es cero, así que la lámpara ya está encendida; `NewBottle` carga cinco y la apaga, y cada comprimido cuenta una vez, tarde lo que tarde en pasar.

```timing
span: 6000
signals:
  - { name: NewBottle, edges: [200, 400] }
  - { name: TabletEye, edges: [1000, 1300, 2000, 2300, 3000, 3300, 4000, 4300, 5000, 5300] }
  - { name: BottleDone, edges: [0, 200, 5000] }
marks:
  - { from: 200, to: 5000, label: 'CV 5 → 0' }
caption: NewBottle carga cinco; cinco comprimidos llevan la cuenta a cero y encienden BottleDone
```

El contador de la práctica es un CTU: cuenta hacia arriba desde cero y tiene los puertos CU y R en lugar de CD y LD. Qué señal llega a cada uno queda para usted.

## Errores comunes

- Conectar una señal al puerto equivocado del contador. La cuenta se mueve entonces cuando debería ponerse a cero, o al revés: lea el nombre de cada puerto antes de conectarlo.
- Dejar R sin conexión. La cuenta nunca vuelve a cero, y la lámpara sigue encendida después de presionar el pulsador.
- Esperar que Q caiga cuando la cuenta pasa de PV. Q sigue en TRUE hasta una puesta a cero.
- Conectar CV, un INT, donde se espera un BOOL. Q es el BOOL que dice "se llegó al valor preestablecido"; CV es el número.

## Compruébelo usted

```quiz
question: En el ejemplo resuelto, NewBottle se mantiene mientras pasan dos comprimidos por la barrera, y luego se suelta. ¿Cuánto vale la CV de Doses?
options:
  - { text: '5', correct: true, feedback: 'Sí. Mientras LD es TRUE el contador carga PV en cada ciclo, así que los dos comprimidos no se restan.' }
  - { text: '3', feedback: 'Los comprimidos pasaron mientras LD era TRUE, y LD vuelve a cargar PV en cada uno de esos ciclos.' }
  - { text: '0', feedback: 'LD carga PV, no pone la cuenta a cero: el CTD vuelve a empezar desde cinco.' }
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
