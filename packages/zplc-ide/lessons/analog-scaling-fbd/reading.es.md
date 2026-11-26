## Escalar con bloques

Una entrada analógica le da al programa **cuentas en bruto**, un número entero como 0 a 2000, y un límite se escribe en **unidades de ingeniería**, como porcentaje o bar. El escalado convierte unas en otras: multiplique las cuentas por el tope de las unidades y después divida por el tope de las cuentas. En un diagrama de bloques de función cada paso de esa regla es un bloque, y la conexión de un bloque al siguiente lleva el número.

| Bloque | Entradas   | Salida                                            |
| ------ | ---------- | ------------------------------------------------- |
| MUL    | IN1, IN2   | el producto IN1 × IN2                             |
| DIV    | IN1, IN2   | IN1 ÷ IN2, sin el resto                           |
| LIMIT  | MN, IN, MX | IN, mantenido entre MN y MX                       |
| GE, LT | IN1, IN2   | un BOOL: ¿IN1 es mayor o igual, o menor, que IN2? |

Tres reglas deciden si el resultado es correcto. Ponga el DIV después del MUL, porque una división de números enteros descarta el resto. Elija conexiones y constantes DINT, porque el producto, 2000 × 100 en el ejemplo que sigue, está muy por encima de 32767, el mayor INT. Y compare con el límite el valor escalado, nunca las cuentas en bruto.

## Ejemplo resuelto

Un tanque de aire comprimido tiene un transmisor de presión que da 0 cuentas a 0 bar y 2000 cuentas a 10 bar. Una lámpara `LowAir` debe encenderse mientras la presión está por debajo de 6,0 bar.

Un número entero no puede guardar 6,0, pero sí 60 décimas de bar. Por eso el diagrama escala a décimas, de 0 a 100, y el límite pasa a ser 60:

- un bloque MUL con `Raw` en IN1 y la constante DINT 100 en IN2;
- un bloque DIV con MUL.OUT en IN1 y la constante DINT 2000 en IN2;
- un bloque LIMIT con 0 en MN, DIV.OUT en IN y 100 en MX, cuya salida escribe `Pressure`;
- un bloque LT con `Pressure` en IN1 y la constante 60 en IN2, cuya salida escribe `LowAir`.

Con 1200 cuentas el MUL da 120000, el DIV da 60 y la lámpara se apaga. El LIMIT impide que un transmisor dañado, que puede informar más de 2000 cuentas, muestre más de 10 bar.

```timing
span: 5000
signals:
  - { name: Compressor, edges: [500, 3000] }
  - { name: LowAir, edges: [0, 1800, 3800] }
marks:
  - { from: 1800, to: 3800, label: 'Pressure >= 60' }
caption: La lámpara sigue a la presión escalada, en décimas de bar, no a las cuentas en bruto
```

## Errores comunes

- Colocar el DIV antes del MUL. El resultado queda en 0 hasta el tope de la escala.
- Usar constantes o conexiones INT. El producto de 2000 por 100 no cabe en un INT.
- Conectar las cuentas en bruto a la comparación. 75 cuentas no son el 75 por ciento.
- Omitir el LIMIT, o ponerlo antes del DIV, donde recorta el producto en lugar del valor escalado.
- Intercambiar IN1 e IN2 del DIV, que entonces divide el tope de las cuentas por el producto.

## Compruébelo usted

```quiz
question: Un diagrama conecta Raw a MUL con 100, después a LIMIT 0..100, y solo después a DIV por 2000. Raw vale 300. ¿Qué llega a la comparación?
options:
  - { text: '0', correct: true, feedback: 'Sí. MUL da 30000, LIMIT lo recorta a 100, y 100 dividido por 2000 es 0 con números enteros.' }
  - { text: '15', feedback: 'Eso dan MUL, DIV y LIMIT en ese orden. El LIMIT antes del DIV recorta el producto.' }
  - { text: '100', feedback: 'Esa es la salida del LIMIT; el DIV que le sigue todavía divide por 2000.' }
```

```quiz
question: ¿Por qué un valor escalado de 6,0 bar pasa a ser la constante 60 en el ejemplo resuelto?
options:
  - { text: 'Porque el diagrama escala a décimas de bar, y un número entero guarda 60 pero no 6,0', correct: true, feedback: 'Correcto. Escalar a una unidad más pequeña conserva un decimal con números enteros.' }
  - { text: 'Porque 60 es la cuenta en bruto a 6,0 bar', feedback: 'La cuenta en bruto a 6,0 bar es 1200; la comparación usa el valor escalado.' }
  - { text: 'Porque LIMIT multiplica por 10', feedback: 'LIMIT solo mantiene un valor entre MN y MX; fuera de eso no lo cambia.' }
```

## Qué hará en la práctica

El escenario solo da entradas BOOL, así que los bloques de arriba del diagrama inicial fabrican su propia cuenta en bruto: Raw crece 410 cuentas en cada ciclo mientras Enable está en TRUE, hasta 4095. Los bloques de abajo multiplican Raw por 100 y limitan el resultado a 0..100 antes de comparar Level con 75, pero HighLevel se enciende enseguida. Usted hará que Level sea el nivel en porcentaje, para que HighLevel pase a ON solo cuando Level llegue a 75. Enable sube a los {{t:10}} ms y baja a los {{t:110}} ms. Después pulse {{ui:learn.check}}.
