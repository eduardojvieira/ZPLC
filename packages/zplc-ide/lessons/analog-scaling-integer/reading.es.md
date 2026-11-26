## De una señal a un número

Un sensor de nivel, un termómetro o un transmisor de presión no le dan al programa litros, grados ni bares. Dan una señal eléctrica, una corriente o una tensión, y la entrada analógica del controlador convierte esa señal en un número entero de **cuentas en bruto**: por ejemplo 0 para la señal más baja y 4000 para la más alta. El programa ve solo las cuentas.

El **escalado** convierte las cuentas en bruto en **unidades de ingeniería**, las unidades que lee una persona y en las que se escribe un límite. Cuando los dos rangos empiezan en cero, la regla es una línea: el valor es la cuenta en bruto por el tope de las unidades, dividido por el tope de las cuentas.

| Cuentas en bruto | Fracción del rango | Porcentaje |
| ---------------- | ------------------ | ---------- |
| 0                | nada               | 0          |
| 1000             | un cuarto          | 25         |
| 4000             | todo               | 100        |

Cuando las unidades empiezan en otro valor, por ejemplo un termómetro de −50 a 250 °C, reste primero el extremo bajo de las cuentas, escale por el ancho de cada rango y sume al final el extremo bajo de las unidades.

## Orden, redondeo y rango con números enteros

El escalado de esta lección usa solo números enteros, INT o DINT. Los números enteros son exactos y rápidos, pero tres cosas deciden si el resultado es correcto.

**El orden.** La división de números enteros descarta el resto, así que divida al final. Dividir primero tira la información antes de que la multiplicación pueda usarla. Tome un selector de velocidad que da de 0 a 4000 cuentas para 0 a 250 revoluciones por minuto, leído en `Dial` y escalado en `Rpm`:

| Dial | `(Dial / 4000) * 250` | `(Dial * 250) / 4000` |
| ---- | --------------------- | --------------------- |
| 1800 | 0                     | 112                   |
| 3999 | 0                     | 249                   |
| 4000 | 250                   | 250                   |

**El redondeo.** Aun en el orden correcto la división corta, no redondea: 3999 cuentas dan 249, no 249,9. Para valores que nunca son negativos, sume la mitad del divisor antes de dividir para redondear al más cercano: `(Dial * 250 + 2000) / 4000` da 250 para 3999 cuentas.

**El rango del producto.** El número más grande del cálculo es el producto antes de la división, no la cuenta en bruto ni el resultado. Aquí es 4000 × 250 = 1000000, muy por encima de 32767, el mayor INT. Elija el tipo para ese producto: declare las variables DINT y el producto cabe.

## Ejemplo resuelto

Un horno tiene un termómetro cuya entrada da 0 cuentas a −50 °C y 4000 cuentas a 250 °C. Una lámpara `Ready` debe encenderse desde 180 °C, cuando el horno se puede cargar, y una lámpara `OverTemp` desde 240 °C.

Las unidades tienen 300 °C de ancho y las cuentas 4000, y el extremo bajo de las unidades es −50. El producto llega a 4000 × 300 = 1200000, así que cada variable del cálculo es un DINT. Sumar 2000, la mitad de 4000, redondea al grado más cercano; la división va al final y el −50 se suma después, así que el redondeo solo ve números positivos.

```st
PROGRAM Oven
VAR_INPUT Raw : DINT; END_VAR
VAR_OUTPUT Ready : BOOL; OverTemp : BOOL; END_VAR
VAR Temp : DINT; END_VAR
Temp := (Raw * 300 + 2000) / 4000 - 50;
Ready := Temp >= 180;
OverTemp := Temp >= 240;
END_PROGRAM
```

| Raw  | Valor exacto | Temp |
| ---- | ------------ | ---- |
| 0    | −50 °C       | −50  |
| 1013 | 25,975 °C    | 26   |
| 2000 | 100 °C       | 100  |
| 4000 | 250 °C       | 250  |

Sin el 2000, 1013 cuentas darían 25 °C. Las dos lámparas comparan el valor escalado, en grados, con límites escritos en grados, así que una persona puede verificarlos con el indicador del horno.

```timing
span: 5000
signals:
  - { name: Heater, edges: [200, 3400] }
  - { name: Ready, edges: [1800, 4600] }
  - { name: OverTemp, edges: [3000, 3800] }
marks:
  - { from: 1800, to: 3000, label: 'Temp 180..239' }
  - { from: 3000, to: 3800, label: 'Temp >= 240' }
caption: El horno se calienta y se enfría; cada lámpara es una comparación de la temperatura en grados
```

## Errores comunes

- Dividir antes de multiplicar. El resultado queda en 0 hasta que la entrada llega al tope de la escala.
- Esperar que la división redondee. `/` corta el resto; sume antes la mitad del divisor cuando necesite el valor más cercano.
- Elegir el tipo según la cuenta en bruto. Un INT guarda 4000, pero `Dial * 250` llega a 1000000, que no cabe en 16 bits.
- Comparar cuentas en bruto con un límite en unidades. `Dial >= 200` no son 200 revoluciones por minuto; primero escale, después compare.
- Confiar en un valor fuera del rango. Un cable cortado o un cortocircuito dan cuentas por debajo de 0 o por encima del tope; mantenga el resultado dentro de su rango con LIMIT, o señale una falla.
- Dividir por un ancho que puede valer cero. Cuando el rango de las cuentas viene de un ajuste, pruébelo antes: una división por cero detiene el programa.

## Compruébelo usted

```quiz
question: Dial vale 1800 cuentas de un rango de 0 a 4000. El programa tiene Rpm := (Dial / 4000) * 250; con variables DINT. ¿Cuánto vale Rpm?
options:
  - { text: '0', correct: true, feedback: 'Sí. 1800 / 4000 es 0 con números enteros, y 0 por 250 sigue siendo 0.' }
  - { text: '112', feedback: 'Eso da multiplicar primero. Dividir primero pierde el 1800 antes de multiplicarlo.' }
  - { text: '11', feedback: 'No queda resto con el que formar 11: la división da 0 de entrada.' }
```

```quiz
question: Un caudalímetro da de 0 a 2000 cuentas para 0 a 600 litros por minuto, y el programa calcula Flow * 600 antes de dividir por 2000. ¿Qué tipo necesitan las variables del cálculo?
options:
  - { text: 'DINT', correct: true, feedback: 'Correcto. El producto llega a 1200000, muy por encima de 32767, y un DINT lo guarda.' }
  - { text: 'INT, porque el resultado es como máximo 600', feedback: 'El resultado cabe, pero el producto se forma primero y no cabe en un INT.' }
  - { text: 'INT, porque la cuenta es como máximo 2000', feedback: 'La cuenta cabe, pero el producto de 2000 por 600 no.' }
```

## Qué hará en la práctica

El escenario solo da entradas BOOL, así que el programa inicial fabrica su propia cuenta en bruto: Raw crece 100 en cada ciclo mientras Enable está en TRUE, hasta 1000, y vuelve a 0 cuando Enable está en FALSE. Después escala Raw a Percent, de 0 a 100, pero Percent queda en 0 hasta el tope de la escala. Usted hará que Percent sea el porcentaje correcto, para que Warn pase a ON al 50 por ciento y Alarm al 80 por ciento. Enable sube a los {{t:10}} ms y baja a los {{t:110}} ms. Después pulse {{ui:learn.check}}.
