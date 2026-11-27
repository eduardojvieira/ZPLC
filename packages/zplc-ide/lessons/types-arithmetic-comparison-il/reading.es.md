## Números en el resultado actual

La lista de instrucciones trabaja una línea a la vez sobre un único valor, el **resultado actual**. `LD` carga un valor en él y `ST` lo guarda en una variable. El resultado actual puede guardar un BOOL, como en una línea de lógica, o un número, como un INT de −32768 a 32767, y las instrucciones de esta lección trabajan sobre ese número.

| Instrucción                        | Qué le hace al resultado actual                      | Deja                             |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------- |
| `ADD n`, `SUB n`, `MUL n`, `DIV n` | suma, resta, multiplica o divide por n               | un número del mismo tipo         |
| `LT n`, `EQ n`, `GT n`, `GE n`     | pregunta: ¿menor, igual, mayor, mayor o igual que n? | un BOOL                          |
| `JMPC label`, `JMPCN label`        | salta a `label:` cuando es TRUE, o cuando es FALSE   | el programa sigue en la etiqueta |

Así, `LD Count`, `ADD 3`, `ST Count` leen un número, le suman y lo vuelven a guardar, y `LD Count`, `LT 10`, `ST Few` convierten el número en un sí o un no. Cada línea se ejecuta en cada ciclo, de arriba abajo. Para cambiar un número solo en algunos ciclos, calcule primero la condición y salte por encima de la aritmética cuando la condición es FALSE: el salto omite esas líneas solo en ese ciclo.

## Ejemplo resuelto

Una sala pequeña tiene 50 asientos. Un torniquete a la entrada da `Pass` mientras pasa un visitante, durante varios ciclos. El programa cuenta hacia abajo los asientos libres en el INT `Seats`, que empieza en 50, y una lámpara `HallFull` se enciende cuando no queda ningún asiento. Un visitante que pasa con la sala ya llena no debe llevar la cuenta por debajo de cero.

Dos condiciones protegen la resta, y cada una salta por encima de ella. La primera, `LE 0`, salta con JMPC cuando no quedan asientos. La segunda es el flanco ascendente, `Pass` ahora y no en el ciclo anterior, y salta con JMPCN cuando no hay un paso nuevo.

```il
        LD    Seats
        LE    0
        JMPC  done
        LD    Pass
        ANDN  PassWas
        JMPCN done
        LD    Seats
        SUB   1
        ST    Seats
done:
        LD    Pass
        ST    PassWas
        LD    Seats
        EQ    0
        ST    HallFull
```

Siga a los últimos visitantes en el diagrama. Con 2 asientos libres, un paso largo ocupa un asiento una sola vez: en su primer ciclo ninguno de los dos saltos se produce y Seats baja en uno, y en los ciclos siguientes `PassWas` es TRUE y JMPCN salta. El visitante siguiente ocupa el último asiento y `HallFull` se enciende. Pasa un visitante más: `LE 0` es TRUE, JMPC salta, y Seats sigue en 0.

```timing
span: 4000
signals:
  - { name: Pass, edges: [500, 1500, 2000, 2200, 3000, 3200] }
  - { name: HallFull, edges: [2000, 4000] }
marks:
  - { from: 0, to: 500, label: 'Seats 2' }
  - { from: 500, to: 2000, label: 'Seats 1' }
  - { from: 2000, to: 4000, label: 'Seats 0' }
caption: Cada paso ocupa un asiento una sola vez; con la sala llena un paso no cambia nada
```

Las líneas después de la etiqueta se ejecutan en cada ciclo, así que `PassWas` y `HallFull` están siempre al día. Esta sala nunca se vacía; la práctica tiene su propia puesta a cero, y cómo se ubican sus líneas entre las demás queda para usted.

## Errores comunes

- Omitir `ANDN PassWas`. La condición queda en TRUE en cada ciclo del paso, y un visitante lento cuenta muchas veces.
- Guardar el valor anterior demasiado pronto. Si `PassWas` se guarda encima de la condición, la condición ve el valor nuevo y nunca es TRUE.
- Intercambiar `JMPC` y `JMPCN`. `JMPCN` salta cuando la condición es FALSE, que es lo que omite la suma.
- Usar `GE` donde la tarea pide `EQ`: GE también sigue en TRUE por encima del límite.
- Olvidar los dos puntos de la etiqueta, o darles el mismo nombre a dos etiquetas.

## Compruébelo usted

```quiz
question: Las líneas son LD Total, GT 10, ST High, y Total vale 10. ¿Qué se guarda en High?
options:
  - { text: 'FALSE', correct: true, feedback: 'Sí. 10 no es mayor que 10, así que GT deja FALSE en el resultado actual.' }
  - { text: 'TRUE', feedback: 'Eso sería GE, que también es TRUE en el límite.' }
  - { text: '10', feedback: 'Una comparación reemplaza el número por un BOOL; ST guarda después ese BOOL.' }
```

```quiz
question: Un programa tiene LD Run, JMPCN wait, LD Ticks, ADD 2, ST Ticks, wait:, sin condición de flanco. Run está en TRUE durante tres ciclos. ¿Cuánto crece Ticks?
options:
  - { text: '6', correct: true, feedback: 'Correcto. El salto ocurre solo mientras Run es FALSE, así que la suma se ejecuta en cada uno de los tres ciclos.' }
  - { text: '2', feedback: 'Para eso hace falta ANDN con el valor de Run del ciclo anterior, para que la condición esté en TRUE durante un solo ciclo.' }
  - { text: '0', feedback: 'JMPCN salta cuando la condición es FALSE; mientras Run está en TRUE no salta.' }
```

## Qué hará en la práctica

El programa inicial escribe las tres comparaciones para Low, Exact y High, y guarda Step en StepWas en sus primeras líneas, antes de que una condición pueda leer el valor del ciclo anterior. Nada cambia nunca Total. Usted hará que Total crezca 5 en cada pulsación de Step, dure lo que dure la pulsación, y vuelva a 0 mientras Reset esté en TRUE. El escenario pulsa Step tres veces, la primera pulsación dura dos ciclos, y pulsa Reset a los {{t:80}} ms. Después pulse {{ui:learn.check}}.
