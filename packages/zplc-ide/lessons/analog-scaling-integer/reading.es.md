## De una señal a un número

Un sensor de nivel, un termómetro o un transmisor de presión no le dan al programa litros, grados ni bares. Dan una señal eléctrica, una corriente o una tensión, y la entrada analógica del controlador convierte esa señal en un número entero de **cuentas en bruto**: por ejemplo 0 para la señal más baja y 1000 para la más alta. El programa ve solo las cuentas.

El **escalado** convierte las cuentas en bruto en **unidades de ingeniería**, las unidades que lee una persona y en las que se escribe un límite. Cuando los dos rangos empiezan en cero, la regla es una línea: el valor es la cuenta en bruto por el tope de las unidades, dividido por el tope de las cuentas.

| Cuentas en bruto | Fracción del rango | Porcentaje |
|---|---|---|
| 0 | nada | 0 |
| 250 | un cuarto | 25 |
| 1000 | todo | 100 |

Cuando las unidades empiezan en otro valor, por ejemplo un termómetro de −50 a 250 °C, reste primero el extremo bajo de las cuentas, escale por el ancho de cada rango y sume al final el extremo bajo de las unidades.

## Orden, redondeo y rango con números enteros

El escalado de esta lección usa solo números enteros, INT o DINT. Los números enteros son exactos y rápidos, pero tres cosas deciden si el resultado es correcto.

**El orden.** La división de números enteros descarta el resto, así que divida al final. Dividir primero tira la información antes de que la multiplicación pueda usarla.

| Raw | `(Raw / 1000) * 100` | `(Raw * 100) / 1000` |
|---|---|---|
| 450 | 0 | 45 |
| 999 | 0 | 99 |
| 1000 | 100 | 100 |

**El redondeo.** Aun en el orden correcto la división corta, no redondea: 999 cuentas dan 99, no 99,9. Para valores que nunca son negativos, sume la mitad del divisor antes de dividir para redondear al más cercano: `(Raw * 100 + 500) / 1000` da 100 para 999 cuentas.

**El rango del producto.** El número más grande del cálculo es el producto antes de la división, no la cuenta en bruto ni el resultado. Aquí es 1000 × 100 = 100000, muy por encima de 32767, el mayor INT. Elija el tipo para ese producto: declare las variables DINT y el producto cabe.

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

| Raw | Valor exacto | Temp |
|---|---|---|
| 0 | −50 °C | −50 |
| 1013 | 25,975 °C | 26 |
| 2000 | 100 °C | 100 |
| 4000 | 250 °C | 250 |

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
- Elegir el tipo según la cuenta en bruto. Un INT guarda 1000, pero `Raw * 100` llega a 100000, que no cabe en 16 bits.
- Comparar cuentas en bruto con un límite en unidades. `Raw >= 80` no es el 80 por ciento; primero escale, después compare.
- Confiar en un valor fuera del rango. Un cable cortado o un cortocircuito dan cuentas por debajo de 0 o por encima del tope; mantenga el resultado dentro de su rango con LIMIT, o señale una falla.
- Dividir por un ancho que puede valer cero. Cuando el rango de las cuentas viene de un ajuste, pruébelo antes: una división por cero detiene el programa.

## Compruébelo usted

```quiz
question: Raw vale 450 cuentas de un rango de 0 a 1000. El programa tiene Percent := (Raw / 1000) * 100; con variables DINT. ¿Cuánto vale Percent?
options:
  - { text: '0', correct: true, feedback: 'Sí. 450 / 1000 es 0 con números enteros, y 0 por 100 sigue siendo 0.' }
  - { text: '45', feedback: 'Eso da (Raw * 100) / 1000. Dividir primero pierde el 450 antes de multiplicarlo.' }
  - { text: '4', feedback: 'No queda resto con el que formar 4: la división da 0 de entrada.' }
```

```quiz
question: Un termómetro da de 0 a 4000 cuentas y el programa calcula Raw * 250 antes de dividir por 4000. ¿Qué tipo necesitan las variables del cálculo?
options:
  - { text: 'DINT', correct: true, feedback: 'Correcto. El producto llega a 1000000, muy por encima de 32767, y un DINT lo guarda.' }
  - { text: 'INT, porque el resultado es como máximo 250', feedback: 'El resultado cabe, pero el producto se forma primero y no cabe en un INT.' }
  - { text: 'INT, porque la cuenta es como máximo 4000', feedback: 'La cuenta cabe, pero el producto de 4000 por 250 no.' }
```

## Qué hará en la práctica

El escenario solo da entradas BOOL, así que el programa inicial fabrica su propia cuenta en bruto: Raw crece 100 en cada ciclo mientras Enable está en TRUE, hasta 1000, y vuelve a 0 cuando Enable está en FALSE. Después escala Raw a Percent, de 0 a 100, pero divide antes de multiplicar, así que Percent queda en 0 hasta el tope de la escala. Usted hará que Percent sea el porcentaje correcto, para que Warn pase a ON al 50 por ciento y Alarm al 80 por ciento. Enable sube a los {{t:10}} ms y baja a los {{t:110}} ms. Después pulse {{ui:learn.check}}.
