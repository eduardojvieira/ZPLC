## De una señal a un número

Un sensor de nivel, un termómetro o un transmisor de presión no le dan al programa litros, grados ni bares. Dan una señal eléctrica, una corriente o una tensión, y la entrada analógica del controlador convierte esa señal en un número entero de **cuentas en bruto**: por ejemplo 0 para la señal más baja y 4000 para la más alta. El programa ve solo las cuentas.

El **escalado** convierte las cuentas en bruto en **unidades de ingeniería**, las unidades que lee una persona y en las que se escribe un límite. Cuando los dos rangos empiezan en cero, el valor es la misma fracción de las unidades que la cuenta en bruto es de las cuentas.

| Cuentas en bruto | Fracción del rango | Porcentaje |
| ---------------- | ------------------ | ---------- |
| 0                | nada               | 0          |
| 1000             | un cuarto          | 25         |
| 4000             | todo               | 100        |

Cuando las unidades empiezan en otro valor, por ejemplo un termómetro de −50 a 250 °C, reste primero el extremo bajo de las cuentas, escale por el ancho de cada rango y sume al final el extremo bajo de las unidades.

## Restos, redondeo y rango con números enteros

El escalado de esta lección usa solo números enteros, INT o DINT. Los números enteros son exactos y rápidos, pero tres cosas deciden si el resultado es correcto.

**El resto.** La división de números enteros descarta el resto: `7 / 2` es 3, y `7 MOD 2` es el 1 que se descartó. Cada división descarta su propio resto, así que el lugar donde un cálculo divide decide cuánto pierde. Tome dos balanzas bajo una misma bandeja, leídas en `A` y `B` en gramos, y el peso promedio de las dos:

| A   | B   | `A / 2 + B / 2` | `(A + B) / 2` |
| --- | --- | --------------- | ------------- |
| 7   | 9   | 7               | 8             |
| 5   | 5   | 4               | 5             |
| 8   | 8   | 8               | 8             |

La primera forma divide dos veces y descarta dos restos; la segunda suma primero y divide una sola vez.

**El redondeo.** Una división corta, no redondea: `(7 + 8) / 2` da 7, no 7,5. Para valores que nunca son negativos, sume la mitad del divisor antes de dividir para redondear al más cercano: `(7 + 8 + 1) / 2` da 8.

**El rango de un valor intermedio.** El número más grande de un cálculo puede ser un valor que forma en el camino, no la cuenta en bruto ni el resultado. Una cuenta de 4000 por un ancho de 250 es 1000000, muy por encima de 32767, el mayor INT. Elija el tipo para el valor más grande que forma el cálculo: declare las variables DINT y cabe.

## Ejemplo resuelto

Un horno tiene dos termómetros, ya escalados a décimas de grado en `T1` y `T2`, porque uno solo puede leer alto cerca de la puerta. Una lámpara `Ready` debe encenderse cuando el promedio llega a 180,0 °C, cuando el horno se puede cargar, y una lámpara `OverTemp` cuando llega a 240,0 °C.

El promedio es la suma dividida por dos, con la mitad del divisor sumada para redondear a la décima más cercana. La suma de dos temperaturas de hasta 3000 décimas es 6000, que un INT guardaría, pero el programa del horno usa DINT en todas las variables de sus cálculos, para que un cambio posterior no pueda desbordarlo.

```st
PROGRAM Oven
VAR_INPUT T1 : DINT; T2 : DINT; END_VAR
VAR_OUTPUT Ready : BOOL; OverTemp : BOOL; END_VAR
VAR Avg : DINT; END_VAR
Avg := (T1 + T2 + 1) / 2;
Ready := Avg >= 1800;
OverTemp := Avg >= 2400;
END_PROGRAM
```

| T1   | T2   | Promedio exacto | Avg  |
| ---- | ---- | --------------- | ---- |
| 1799 | 1800 | 1799,5          | 1800 |
| 1790 | 1801 | 1795,5          | 1796 |
| 2400 | 2401 | 2400,5          | 2401 |

Sin el 1, 1799 y 1800 darían 1799, y el horno esperaría una décima más. Las dos lámparas comparan el promedio, en décimas de grado, con límites escritos en décimas, así que una persona puede comprobarlos con el indicador del horno.

```timing
span: 5000
signals:
  - { name: Heater, edges: [200, 3400] }
  - { name: Ready, edges: [1800, 4600] }
  - { name: OverTemp, edges: [3000, 3800] }
marks:
  - { from: 1800, to: 3000, label: 'Avg 1800..2399' }
  - { from: 3000, to: 3800, label: 'Avg >= 2400' }
caption: El horno calienta y se enfría; cada lámpara es una comparación del promedio en décimas de grado
```

La práctica escala una cuenta en bruto, no un promedio. Cómo conserva su línea el resto que necesita queda para usted.

## Errores comunes

- Dividir cada parte antes de sumar las partes. `7 / 2 + 9 / 2` es 7, no 8: cada división descarta su propio resto.
- Esperar que la división redondee. `/` corta el resto; sume antes la mitad del divisor cuando necesite el valor más cercano.
- Elegir el tipo según la cuenta en bruto. Un INT guarda 4000, pero un producto de 4000 por 250 llega a 1000000, que no cabe en 16 bits.
- Comparar cuentas en bruto con un límite en unidades. 200 cuentas no son 200 revoluciones por minuto; primero escale, después compare.
- Confiar en un valor fuera del rango. Un cable cortado o un cortocircuito dan cuentas por debajo de 0 o por encima del tope; mantenga el resultado dentro de su rango con LIMIT, o señale una falla.
- Dividir por un ancho que puede valer cero. Cuando el rango de las cuentas viene de un ajuste, pruébelo antes: una división por cero detiene el programa.

## Compruébelo usted

```quiz
question: A vale 7 y B vale 9. El programa tiene Avg := A / 2 + B / 2; con variables DINT. ¿Cuánto vale Avg?
options:
  - { text: '7', correct: true, feedback: 'Sí. 7 / 2 es 3 y 9 / 2 es 4 con números enteros; cada división descarta su propio resto.' }
  - { text: '8', feedback: 'Eso da (A + B) / 2: suma primero y descarta un solo resto.' }
  - { text: '7,5', feedback: 'Los números enteros no tienen mitades: cada división descarta su resto.' }
```

```quiz
question: Un totalizador suma las cuentas de dos líneas, cada una de hasta 30000, antes de promediarlas. ¿Qué tipo necesitan las variables del cálculo?
options:
  - { text: 'DINT', correct: true, feedback: 'Correcto. La suma llega a 60000, por encima de 32767, y un DINT la guarda.' }
  - { text: 'INT, porque el promedio es como máximo 30000', feedback: 'El promedio cabe, pero la suma se forma en el camino y no cabe en un INT.' }
  - { text: 'INT, porque cada cuenta es como máximo 30000', feedback: 'Cada cuenta cabe, pero la suma de dos de ellas no.' }
```

## Qué hará en la práctica

El escenario solo da entradas BOOL, así que el programa inicial fabrica su propia cuenta en bruto: Raw crece 100 en cada ciclo mientras Enable está en TRUE, hasta 1000, y vuelve a 0 cuando Enable está en FALSE. Después escala Raw a Percent, de 0 a 100, pero Percent queda en 0 hasta el tope de la escala. Usted hará que Percent sea el porcentaje correcto, para que Warn pase a ON al 50 por ciento y Alarm al 80 por ciento. Enable sube a los {{t:10}} ms y baja a los {{t:110}} ms. Después pulse {{ui:learn.check}}.
