## De una descripción a un programa

En un proyecto real nadie le entrega un programa en escalera. Le entregan unos párrafos: qué hace la máquina, cuándo debe detenerse, qué puede pulsar una persona. Esta es la **descripción funcional**. Su trabajo es convertirla en un programa que pueda probar, y poder decir de qué frase de la descripción viene cada peldaño.

Piense en una estación de empaque en una planta. Una cinta lleva piezas frente a un sensor. Cuando una caja tiene suficientes piezas, la cinta debe detenerse para que alguien cierre la caja. Un operario puede detener la cinta, un paro de emergencia puede detenerla, y si una pieza bloquea el sensor la cinta debe detenerse e informar una falla. Es una máquina pequeña, pero toda máquina real se construye con el mismo tipo de frases.

Esta lección no le da ninguna instrucción nueva. Le da un método para usar las que ya conoce: autorretención, paros normalmente cerrados, un contador, un temporizador y una retención.

## Paso 1: léala y haga la lista de entradas y salidas

Lea la descripción despacio y subraye todo lo que se puede detectar o pulsar (una **entrada**) y todo lo que el programa conmuta (una **salida**). Luego escríbalo en una tabla. Esa tabla es el mapa del programa.

Esta es la tabla de un contador de cajas que cuenta piezas y enciende una lámpara cuando la caja está llena.

| Nombre  | Tipo    | Significado                                   |
| ------- | ------- | --------------------------------------------- |
| Sensor  | Entrada | TRUE mientras una pieza pasa por el sensor    |
| Reset   | Entrada | TRUE mientras se pulsa el botón de reinicio   |
| BoxFull | Salida  | Lámpara, TRUE cuando se cuentan cuatro piezas |

Observe cómo se describen los botones. Un botón de paro suele cablearse **normalmente cerrado**: conduce en reposo, de modo que un cable roto detiene la máquina en lugar de dejarla funcionando. Entonces el programa lee TRUE en reposo y FALSE mientras se pulsa el botón. Nombre esas entradas de modo que lo recuerde, por ejemplo `StopOK`.

## Paso 2: planifique los pasos

Antes de dibujar un contacto, escriba el comportamiento en frases cortas con una causa y un efecto. Cada frase se convierte en un peldaño, o en parte de uno.

1. Cada flanco ascendente de `Sensor` cuenta una pieza.
2. Cuando la cuenta llega a cuatro, `BoxFull` está en ON.
3. `Reset` vacía la cuenta y pone `BoxFull` en OFF.

Así se ven las dos primeras frases en escalera. Un **contador** (CTU) suma uno cada vez que su entrada pasa de FALSE a TRUE, y su salida pasa a ON cuando la cuenta llega al valor preestablecido `PV`.

```ld-figure
src: reading/parts-counter.ld.json
caption: "Un CTU cuenta las piezas; BoxFull sigue a su salida"
```

## Pruébelo

Pulse Ejecutar y luego pulse y suelte `Sensor` cuatro veces. Observe la lámpara. Después pulse `Reset`.

```ld-try
src: reading/parts-counter.ld.json
inputs:
  - { name: Sensor, kind: push }
  - { name: Reset, kind: push }
outputs: [BoxFull]
caption: "Cuatro pulsaciones llenan la caja; Reset la vacía"
```

Note que mantener el botón pulsado cuenta una sola pieza. El contador reacciona al flanco, no al nivel. Es el tipo de detalle que una descripción suele no decir y que una prueba debe detectar.

```timing
span: 4000
signals:
  - { name: Sensor, edges: [500, 800, 1100, 1400, 1700, 2000, 2300, 2600] }
  - { name: BoxFull, edges: [2300] }
caption: "BoxFull se enciende en el cuarto flanco ascendente de Sensor"
```

## Paso 3: planifique las pruebas

Un programa está terminado cuando puede demostrar que funciona, no cuando parece correcto. Escriba las pruebas como una lista, en el mismo orden que la descripción, y agregue los casos que la descripción no menciona.

- Lo que debe ocurrir: la cinta arranca, una caja se llena, la lámpara se enciende.
- Lo que no debe ocurrir: la cinta no debe volver a arrancar sola tras un paro, y una falla no debe borrarse mientras el sensor sigue bloqueado.
- El orden de los eventos: reiniciar antes de que el lote esté lleno, y parar mientras la caja se llena.

El escenario de la práctica sigue esta idea. La mayoría de sus comprobaciones tratan de lo que **no** debe ocurrir, porque un programa que solo hace lo que se pide pasa el caso fácil y aun así falla en la máquina.

> [!WARNING]
> El paro de emergencia de una máquina real se cablea en hardware y corta la energía de las partes peligrosas sin pasar por el PLC. El programa puede leerlo para saber que la máquina se detuvo, pero el programa nunca proporciona el paro. ZPLC no hace ninguna afirmación de seguridad, y un escenario que pasa no es una prueba de seguridad.

## Errores comunes

- Empezar a dibujar antes de enumerar las entradas y salidas. Termina con una variable que escriben dos peldaños.
- Leer un paro normalmente cerrado como si fuera TRUE al pulsarlo. Compare cada entrada con el cableado.
- Probar solo el caso normal. Agregue al menos una prueba por cada "no debe".
- Cambiar tres peldaños a la vez tras una aserción fallida. Cambie uno, compruebe y lea la siguiente falla.

## Compruébese

```quiz
question: "El botón de paro está cableado normalmente cerrado. ¿Qué lee el programa mientras nadie lo pulsa?"
options:
  - { text: "TRUE", correct: true, feedback: "El contacto conduce en reposo, así que la entrada está encendida hasta que alguien pulsa el botón." }
  - { text: "FALSE", feedback: "Eso sería un botón normalmente abierto. Aquí pulsarlo pone la entrada en FALSE." }
```

```quiz
question: "¿Qué prueba pertenece a lo que NO debe ocurrir?"
options:
  - { text: "La cinta sigue apagada tras un paro de emergencia hasta un nuevo Start", correct: true, feedback: "Comprueba que el programa no vuelve a arrancar solo." }
  - { text: "La cinta funciona tras Start", feedback: "Eso es lo que debe ocurrir." }
  - { text: "La lámpara se enciende cuando la caja está llena", feedback: "Eso también es lo que debe ocurrir." }
```

## Qué hará en la práctica

Recibe una estación de empaque con cinco entradas y tres salidas, y un programa inicial que solo mantiene la cinta con una autorretención. Lea los cinco requisitos del objetivo, haga la lista de entradas y salidas, y luego agregue un contador, un temporizador para un sensor bloqueado, una falla retenida y las condiciones de paro. Pulse Comprobar y use cada aserción fallida para encontrar el requisito que omitió. Si desea ver el interior, ejecute el programa en Simulación y use la tabla de observación como en la lección anterior.
