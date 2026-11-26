## Números y respuestas de sí o no

Hasta ahora casi todas las señales de sus programas estaban en ON o en OFF. Una máquina también cuenta y mide: cuántas cajas entraron en un cajón, qué tan lleno está un tanque, cuántos lugares quedan en un estacionamiento. Un programa guarda ese número en una variable, y cada variable tiene un **tipo** que dice qué puede guardar.

| Tipo | Qué guarda | Rango | Ejemplo |
|---|---|---|---|
| BOOL | un sí o un no | FALSE o TRUE | `Full : BOOL;` |
| INT | un número entero, 16 bits | −32768 a 32767 | `Cars : INT := 0;` |
| DINT | un número entero, 32 bits | unos −2100 a 2100 millones | `Pieces : DINT;` |

El tipo se escribe después del nombre cuando se declara la variable, y el valor que sigue a `:=` es el valor con el que empieza. Un BOOL no puede guardar 5, y un INT no puede guardar un número mayor que 32767.

## La aritmética escribe un valor nuevo

Una **asignación** calcula la expresión a la derecha de `:=` y guarda el resultado en la variable de la izquierda. Los operadores para números enteros son `+`, `-`, `*`, `/` y `MOD`.

```st
Total := Total + 5;
```

Esta línea lee el valor que Total tiene ahora, le suma 5 y guarda la suma otra vez en Total. Recuerde que el programa se ejecuta de arriba abajo en cada ciclo: una línea como esta, sola, suma 5 en cada ciclo, cien veces por segundo si el controlador ejecuta cien ciclos por segundo. Para sumar una vez por pulsación, póngala bajo una condición que esté en TRUE durante un solo ciclo, el flanco ascendente de la entrada: la entrada está en TRUE ahora y estaba en FALSE en el ciclo anterior.

La división de números enteros da un número entero y descarta el resto: `17 / 5` es 3. `MOD` da ese resto: `17 MOD 5` es 2.

## Una comparación responde con un BOOL

Una **comparación** hace una pregunta sobre números y responde TRUE o FALSE. Su resultado es un BOOL, así que se puede guardar directamente en una salida BOOL.

| Operador | Pregunta | 7 comparado con 10 |
|---|---|---|
| `=` | ¿igual? | FALSE |
| `<>` | ¿distinto? | TRUE |
| `<` y `>` | ¿menor, mayor? | TRUE, FALSE |
| `<=` y `>=` | ¿menor o igual, mayor o igual? | TRUE, FALSE |

`=` compara y `:=` guarda; no son el mismo signo. Tres comparaciones pueden dividir la recta de los números en rangos, de modo que exactamente una esté en TRUE para cada valor: `Cars < 3`, `Cars = 3` y `Cars > 3` cubren cada número una sola vez.

## Ejemplo resuelto

Un patio pequeño tiene tres lugares de estacionamiento. Un sensor en el portón da `CarIn` mientras entra un auto, y otro da `CarOut` mientras sale uno. Una lámpara `Full` debe encenderse mientras los tres lugares están ocupados. Un auto puede quedarse sobre un sensor durante varios ciclos.

La cantidad es un número, así que es un INT. Cada auto debe cambiarla una sola vez, así que el programa suma y resta solo en el flanco ascendente de cada sensor. La lámpara es una pregunta sobre el número, así que es una comparación.

```st
PROGRAM Yard
VAR_INPUT CarIn : BOOL; CarOut : BOOL; END_VAR
VAR_OUTPUT Full : BOOL; END_VAR
VAR
  Cars : INT := 0;
  InWas : BOOL := FALSE;
  OutWas : BOOL := FALSE;
END_VAR
IF CarIn AND NOT InWas THEN Cars := Cars + 1; END_IF;
IF CarOut AND NOT OutWas AND Cars > 0 THEN Cars := Cars - 1; END_IF;
InWas := CarIn;
OutWas := CarOut;
Full := Cars >= 3;
END_PROGRAM
```

Sígalo en el diagrama. Cada auto que entra suma uno a Cars, el tercer auto se queda más tiempo sobre el sensor y aun así cuenta una vez, y Full sube con el tercer auto. Cuando un auto sale, Cars baja a 2 y la lámpara se apaga. La prueba `Cars > 0` impide que la cuenta baje de cero si el sensor de salida ve algo cuando el patio está vacío.

```timing
span: 5000
signals:
  - { name: CarIn, edges: [500, 700, 1500, 1700, 2500, 2900] }
  - { name: CarOut, edges: [3800, 4000] }
  - { name: Full, edges: [2500, 3800] }
marks:
  - { from: 500, to: 1500, label: 'Cars 1' }
  - { from: 1500, to: 2500, label: 'Cars 2' }
  - { from: 2500, to: 3800, label: 'Cars 3' }
  - { from: 3800, to: 5000, label: 'Cars 2' }
caption: Una cuenta por auto, por mucho que se quede sobre el sensor; Full es la respuesta de una comparación
```

## Errores comunes

- Sumar en cada ciclo. `Cars := Cars + 1;` sin la condición del flanco cuenta los ciclos que el auto pasa sobre el sensor, no los autos.
- Escribir `=` donde quiere decir `:=`. `Cars = Cars + 1` es una pregunta, no una orden: no guarda nada.
- Elegir la comparación equivocada. `>=` está en TRUE en el propio límite y `>` no, así que `Cars > 3` nunca encendería la lámpara en un patio de tres lugares.
- Olvidar el rango. Un INT guarda como máximo 32767; uno más y el valor es incorrecto, da la vuelta al extremo negativo. Una cuenta que puede crecer mucho necesita un DINT.
- Esperar un resto de `/`. `7 / 2` es 3 con números enteros; la mitad se pierde.
- Dividir por una variable que puede valer cero. El programa se detiene con un error de división, así que pruebe antes el divisor.

## Compruébelo usted

```quiz
question: Total vale 10. El programa tiene Low := Total < 10; Exact := Total = 10; High := Total >= 10; ¿Qué salidas están en TRUE?
options:
  - { text: 'Exact y High', correct: true, feedback: 'Sí. 10 >= 10 es TRUE, así que High está en ON junto con Exact; para que haya un solo rango por valor, High debe ser Total > 10.' }
  - { text: 'Solo Exact', feedback: 'Eso valdría con Total > 10. Una comparación >= también es TRUE en el límite.' }
  - { text: 'Solo Low', feedback: '10 < 10 es FALSE: un número no es menor que sí mismo.' }
```

```quiz
question: Un programa tiene la línea Count := Count + 1; sin ningún IF alrededor, y el controlador ejecuta 100 ciclos por segundo. Count empieza en 0. ¿Cuánto vale Count después de un segundo?
options:
  - { text: 'Unos 100', correct: true, feedback: 'Correcto. La línea se ejecuta en cada ciclo, y en un segundo hay unos 100 ciclos.' }
  - { text: '1', feedback: 'Para eso hace falta una condición que esté en TRUE durante un solo ciclo, como un flanco ascendente.' }
  - { text: '0, porque nadie pulsó un pulsador', feedback: 'La línea no tiene condición, así que suma en cada ciclo hagan lo que hagan las entradas.' }
```

## Qué hará en la práctica

El programa inicial declara el INT Total y ya escribe los tres rangos, Low, Exact y High, pero nada cambia nunca Total. Usted hará que Total crezca 5 en cada pulsación de Step, dure lo que dure la pulsación, y vuelva a 0 mientras Reset esté en TRUE. El escenario pulsa Step tres veces, la primera pulsación dura dos ciclos, y pulsa Reset a los {{t:80}} ms. Después pulse {{ui:learn.check}}.
