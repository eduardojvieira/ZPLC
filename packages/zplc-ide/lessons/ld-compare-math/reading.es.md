## Para qué sirve

Imagine un tanque de agua en una fábrica pequeña. Un sensor de flotador le dice al PLC cuán lleno está el tanque, y el PLC debe hacer tres cosas con ese número: encender una lámpara cuando el tanque está casi lleno, calcular cuán lleno está en porcentaje y conservar el último valor cuando nada cambia. En las lecciones anteriores sus peldaños solo hacían preguntas de sí o no: si el botón está pulsado, si el temporizador terminó. El nivel de un tanque no es sí o no. Es un **número**, y los números piden dos herramientas nuevas: bloques que **comparan** y bloques que **calculan**.

En escalera ambos se dibujan como una caja pequeña dentro del peldaño, junto a sus contactos y bobinas. Esta página explica cómo se comporta una caja y un error que puede detener toda la máquina.

## Una comparación es una condición

Un **bloque de comparación** toma dos valores y hace una pregunta sobre ellos. `GT` pregunta "¿es el primero mayor que el segundo?". Los demás son `GE` (mayor o igual), `EQ` (igual), `NE` (distinto), `LE` (menor o igual) y `LT` (menor).

Los valores con los que trabaja la caja son sus **operandos**. Un operando es una variable o un número simple como `100`.

Un bloque de comparación se comporta como un contacto. Está en serie con los demás elementos del peldaño, y la energía lo atraviesa solo si la energía que llega por la izquierda está activa **y** la comparación es verdadera. En la figura, la lámpara `HighAlarm` está encendida mientras `Level` sea mayor que `100`. No hay botón ni bobina en medio: la comparación es la condición.

```ld-figure
src: reading/tank-alarm.ld.json
caption: La caja GT del peldaño 3 es una condición en serie con la bobina
```

## Pruébelo

Cada pulsación de Fill agrega 25 litros y cada pulsación de Drain quita 25. Pulse Fill cuatro veces y observe la lámpara de alarma, luego púlselo una quinta vez y después pulse Drain una vez.

```ld-try
src: reading/tank-alarm.ld.json
inputs:
  - { name: Fill, kind: push }
  - { name: Drain, kind: push }
outputs: [HighAlarm]
caption: La quinta pulsación de Fill pasa de 100 litros
```

Tras cuatro pulsaciones el nivel es de 100 litros y la alarma sigue apagada, porque `GT` significa estrictamente mayor. La quinta pulsación da 125, el primer valor por encima de 100. Con `GE` la alarma ya estaría encendida en 100. Elegir entre `GT` y `GE` es la decisión más común con los bloques de comparación.

## Un cálculo se ejecuta solo mientras su peldaño tiene energía

Los **bloques matemáticos** son `ADD` (sumar), `SUB` (restar), `MUL` (multiplicar), `DIV` (dividir) y `MOD` (el resto de una división). Cada uno toma dos operandos y escribe su resultado en una **variable de salida**. `MOVE` copia un valor en una variable, y `LIMIT`, `MIN` y `MAX` eligen un valor dentro de un rango. En la figura anterior, el peldaño con `Fill` y `ADD(Filled, 25) -> Filled` se lee así: mientras este peldaño tenga energía, poner `Filled + 25` en `Filled`.

La regla importante es esta: **un bloque matemático se ejecuta solo mientras la energía que le llega está activa.** Cuando el peldaño no tiene energía, la caja no hace nada y su variable de salida **conserva el valor que tenía**. Por eso `Filled` no vuelve a cero cuando usted suelta Fill. La variable es memoria, y ningún peldaño escribe en ella.

Compárelo con una bobina, que se apaga siempre que su peldaño no tiene energía. La salida de una caja no es así. Si necesita que un valor vuelva a un número inicial, otro peldaño tiene que escribirlo, por ejemplo con `MOVE(0)`.

Una caja también deja pasar la energía. Cuando un bloque matemático tiene energía de entrada, tiene energía de salida, así que puede encadenar varias cajas en un peldaño y todas se ejecutan en orden, de izquierda a derecha. Dos comparaciones encadenadas en serie funcionan como una Y lógica (AND).

Una regla acompaña a esto: **una bobina es exclusiva, pero las cajas pueden compartir una variable**. Una bobina escribe su variable en cada ciclo, así que ZPLC permite una sola bobina por variable (un par SET y RESET es la única excepción), y una segunda bobina es un error que se informa en la segunda. Una caja escribe solo mientras tiene energía, así que varias cajas pueden escribir la misma variable. Cuando más de una tiene energía en el mismo ciclo, **gana la última en el orden de ejecución**. Una bobina y una caja sobre la misma variable siguen siendo rechazadas. El uso clásico es un contador: un peldaño con `ADD(Count, 1) -> Count` y un peldaño más abajo con `MOVE(0) -> Count` que lo reinicia. En la figura, `Filled` y `Drained` se guardan como dos totales separados y `Level` se calcula a partir de ellos en una caja propia. Es una decisión de diseño que mantiene cada total fácil de leer, no algo que ZPLC exija.

## El divisor en cero

Ahora la caja peligrosa. Dividir entre cero no tiene resultado, y el runtime de ZPLC no inventa uno. Cuando un bloque `DIV` o `MOD` recibe un divisor en cero, la máquina virtual **falla**: el ciclo termina con un error y el programa deja de ejecutarse. La escalera no lo detiene, no lo avisa ni lo omite. La caja misma no detecta nada.

> [!WARNING]
> Un divisor que puede ser cero debe protegerse. Ponga una comparación en serie, antes del `DIV`: `NE(Bottles, 0)` conduce solo cuando `Bottles` no es cero, así que el `DIV` no recibe energía mientras el divisor es cero. Sin ella, un solo ciclo con un divisor en cero detiene el programa.

Esta figura muestra la protección en el peldaño 5 de otro programa. Una caja de botellas tiene un peso promedio, que es el peso total dividido entre el número de botellas. Cuando la caja está vacía, el número de botellas es cero, y la protección evita que se calcule el promedio.

```ld-figure
src: reading/case-average.ld.json
rung: 5
caption: NE en serie evita que el DIV reciba un divisor en cero
```

```ld-try
src: reading/case-average.ld.json
inputs:
  - { name: AddLight, kind: push }
  - { name: AddHeavy, kind: push }
outputs: [Heavy, Empty]
caption: Una botella liviana pesa 280 g y una pesada 360 g
```

En el laboratorio, la lámpara `Empty` está encendida hasta la primera botella. Agregue una botella liviana: el promedio es 280 y `Heavy` sigue apagada. Agregue una pesada: 640 dividido entre 2 es 320, que supera 300, y `Heavy` se enciende. La división da un número entero: descarta los decimales, así que 7 dividido entre 2 es 3.

## Errores comunes

- Escribir una variable desde dos cajas sin pensar en el orden. Si ambas tienen energía en el mismo ciclo, gana el peldaño de abajo, así que ponga el reinicio debajo de la cuenta. Una bobina y una caja sobre la misma variable es un error que se informa en la segunda.
- Esperar que la salida de una caja se apague con su peldaño. No lo hace: conserva su valor hasta que otro peldaño la escribe.
- Poner la protección después del `DIV`. La protección debe ir primero, desde la izquierda, porque la energía fluye de izquierda a derecha.
- Usar `GT` cuando la regla dice "al menos". Lea la regla palabra por palabra y compruebe el valor que cae justo en el límite.
- Usar un tipo que no corresponde. Una caja que escribe texto en un número no compila, y el editor muestra el error en la caja.

> [!WARNING]
> Una lámpara de nivel alto en la pantalla es información, no protección. Un interruptor de flotador o una parada por desborde que protege a las personas o al equipo se cablea en el hardware y nunca depende del programa del PLC. ZPLC no hace ninguna afirmación de seguridad sobre ninguna lección.

## Compruébelo usted

```quiz
question: El peldaño Fill y ADD(Filled, 25) -> Filled no tiene energía porque Fill está suelto. ¿Cuánto vale Filled?
options:
  - { text: 'Conserva el valor que tenía', correct: true, feedback: Correcto. Un bloque matemático escribe solo mientras tiene energía, y una variable conserva su valor entre ciclos. }
  - { text: 'Vuelve a 0', feedback: Solo una bobina se apaga sin energía. Una variable escrita por una caja queda como estaba. }
  - { text: 'El programa se detiene con un error', feedback: Una caja inactiva no tiene nada de malo. Solo una división entre cero hace fallar el programa. }
```

```quiz
question: Capacity puede ser 0 antes de la configuración. ¿Cómo se protege DIV(Scaled, Capacity)?
options:
  - { text: 'Poniendo NE(Capacity, 0) en serie, a la izquierda del DIV', correct: true, feedback: Correcto. El DIV recibe energía solo cuando Capacity no es cero. }
  - { text: 'Poniendo NE(Capacity, 0) después del DIV', feedback: Para entonces la división ya ocurrió y el programa ya falló. }
  - { text: 'No haciendo nada: el DIV entre cero da 0', feedback: No es así. En el runtime de ZPLC una división entre cero hace fallar la máquina virtual. }
```

## Qué hará en la práctica

En la práctica tendrá un monitor de tanque. Setup copia la capacidad de 200 litros, Fill y Drain mueven el nivel en pasos de 25, y la lámpara `Configured` indica que la capacidad se conoce. Falta el peldaño del porcentaje. Agregará tres cajas en un mismo peldaño, `NE`, `MUL` y `DIV`, de modo que `Percent` sea el nivel multiplicado por 100 y dividido entre la capacidad, y el peldaño de la alarma que ya existe encienda `HighAlarm` a los {{t:80}} ms.
